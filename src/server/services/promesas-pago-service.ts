import { AppError } from '@/lib/errors';
import { writeAuditLog } from '@/lib/audit';
import {
  createPromesaPagoRecord,
  findPromesaPagoRecordById,
  listPromesaPagoRecords,
  updatePromesaPagoRecord,
} from '@/server/repositories/cobranza-operativa-repository';
import {
  assertClienteCreditoConsistency,
  assertInteraccionLink,
  assertOperationalListScope,
  serializePromesaPago,
  type CobranzaPromesaPagoItem,
} from '@/server/services/cobranza-operativa-shared';
import { runCobranzaIdempotentCreate } from '@/server/services/cobranza-sync-idempotency';
import type {
  CreatePromesaPagoInput,
  ListPromesasPagoInput,
  UpdatePromesaPagoEstadoInput,
} from '@/server/validators/cobranza-operativa';

export async function createPromesaPago(
  input: CreatePromesaPagoInput,
  userId: string,
  options?: {
    idempotencyKey?: string;
  },
): Promise<CobranzaPromesaPagoItem> {
  return runCobranzaIdempotentCreate({
    eventId: options?.idempotencyKey,
    eventType: 'PROMESA',
    payload: {
      ...input,
      fechaPromesa: input.fechaPromesa.toISOString(),
    },
    userId,
    loadExisting: async (recordId) => {
      const existing = await findPromesaPagoRecordById(recordId);
      if (!existing) {
        throw new AppError('No se encontró la promesa sincronizada.', 'PROMESA_SYNC_RECORD_NOT_FOUND', 404);
      }
      return serializePromesaPago(existing);
    },
    create: async () => {
      await assertClienteCreditoConsistency({
        clienteId: input.clienteId,
        creditoId: input.creditoId,
      });

      await assertInteraccionLink({
        interaccionId: input.interaccionId,
        clienteId: input.clienteId,
        creditoId: input.creditoId,
      });

      const created = await createPromesaPagoRecord({
        clienteId: input.clienteId,
        creditoId: input.creditoId ?? null,
        interaccionId: input.interaccionId ?? null,
        fechaPromesa: input.fechaPromesa,
        montoPrometido: input.montoPrometido ?? null,
        estado: 'PENDING',
        notas: input.notas ?? null,
        createdByUserId: userId,
      });

      await writeAuditLog({
        userId,
        module: 'promesas-pago',
        entity: 'PromesaPago',
        entityId: created.id,
        action: 'CREATE',
        afterJson: serializePromesaPago(created),
      });

      return {
        item: serializePromesaPago(created),
        recordId: created.id,
      };
    },
  });
}

export async function listPromesasPago(
  input: ListPromesasPagoInput,
): Promise<CobranzaPromesaPagoItem[]> {
  await assertOperationalListScope({
    clienteId: input.clienteId,
    creditoId: input.creditoId,
  });

  const rows = await listPromesaPagoRecords(
    {
      ...(input.clienteId ? { clienteId: input.clienteId } : {}),
      ...(input.creditoId ? { creditoId: input.creditoId } : {}),
    },
    input.limit,
  );

  return rows.map(serializePromesaPago);
}

export async function updatePromesaPagoEstado(
  promesaPagoId: string,
  input: UpdatePromesaPagoEstadoInput,
  userId: string,
): Promise<CobranzaPromesaPagoItem> {
  const current = await findPromesaPagoRecordById(promesaPagoId);
  if (!current) {
    throw new AppError('Promesa de pago no encontrada.', 'PROMESA_PAGO_NOT_FOUND', 404);
  }

  const updated = await updatePromesaPagoRecord(promesaPagoId, {
    estado: input.estado,
    notas: input.notas ?? current.notas ?? null,
  });

  await writeAuditLog({
    userId,
    module: 'promesas-pago',
    entity: 'PromesaPago',
    entityId: updated.id,
    action: 'STATUS_UPDATE',
    beforeJson: serializePromesaPago(current),
    afterJson: serializePromesaPago(updated),
  });

  return serializePromesaPago(updated);
}
