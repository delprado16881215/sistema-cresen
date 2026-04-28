import { writeAuditLog } from '@/lib/audit';
import { AppError } from '@/lib/errors';
import {
  createInteraccionRecord,
  findInteraccionRecordById,
  listInteraccionRecords,
} from '@/server/repositories/cobranza-operativa-repository';
import {
  assertClienteCreditoConsistency,
  assertOperationalListScope,
  serializeInteraccion,
  type CobranzaInteraccionItem,
} from '@/server/services/cobranza-operativa-shared';
import { runCobranzaIdempotentCreate } from '@/server/services/cobranza-sync-idempotency';
import type {
  CreateInteraccionInput,
  ListInteraccionesInput,
} from '@/server/validators/cobranza-operativa';

function resolveDefaultCanal(input: CreateInteraccionInput['tipo']) {
  if (input === 'CALL') return 'PHONE';
  if (input === 'WHATSAPP') return 'WHATSAPP';
  if (input === 'SMS') return 'SMS';
  if (input === 'VISIT') return 'IN_PERSON';
  return null;
}

export async function createInteraccion(
  input: CreateInteraccionInput,
  userId: string,
  options?: {
    idempotencyKey?: string;
  },
): Promise<CobranzaInteraccionItem> {
  return runCobranzaIdempotentCreate({
    eventId: options?.idempotencyKey,
    eventType: 'INTERACTION',
    payload: {
      ...input,
      fechaHora: input.fechaHora.toISOString(),
    },
    userId,
    loadExisting: async (recordId) => {
      const existing = await findInteraccionRecordById(recordId);
      if (!existing) {
        throw new AppError('No se encontró la interacción sincronizada.', 'INTERACCION_SYNC_RECORD_NOT_FOUND', 404);
      }
      return serializeInteraccion(existing);
    },
    create: async () => {
      await assertClienteCreditoConsistency({
        clienteId: input.clienteId,
        creditoId: input.creditoId,
      });

      const created = await createInteraccionRecord({
        clienteId: input.clienteId,
        creditoId: input.creditoId ?? null,
        tipo: input.tipo,
        canal: input.canal ?? resolveDefaultCanal(input.tipo),
        resultado: input.resultado,
        fechaHora: input.fechaHora,
        duracionSegundos: input.duracionSegundos ?? null,
        notas: input.notas ?? null,
        telefonoUsado: input.telefonoUsado ?? null,
        createdByUserId: userId,
      });

      await writeAuditLog({
        userId,
        module: 'interacciones',
        entity: 'Interaccion',
        entityId: created.id,
        action: 'CREATE',
        afterJson: serializeInteraccion(created),
      });

      return {
        item: serializeInteraccion(created),
        recordId: created.id,
      };
    },
  });
}

export async function listInteracciones(
  input: ListInteraccionesInput,
): Promise<CobranzaInteraccionItem[]> {
  await assertOperationalListScope({
    clienteId: input.clienteId,
    creditoId: input.creditoId,
  });

  const rows = await listInteraccionRecords(
    {
      ...(input.clienteId ? { clienteId: input.clienteId } : {}),
      ...(input.creditoId ? { creditoId: input.creditoId } : {}),
    },
    input.limit,
  );

  return rows.map(serializeInteraccion);
}
