import { writeAuditLog } from '@/lib/audit';
import { AppError } from '@/lib/errors';
import {
  createVisitaCampoRecord,
  findVisitaCampoRecordById,
  listVisitaCampoRecords,
} from '@/server/repositories/cobranza-operativa-repository';
import {
  assertClienteCreditoConsistency,
  assertInteraccionLink,
  assertOperationalListScope,
  serializeVisitaCampo,
  type CobranzaVisitaCampoItem,
} from '@/server/services/cobranza-operativa-shared';
import { upsertClienteGeoReferenceFromVisitaCampo } from '@/server/services/cliente-geo-reference-service';
import { runCobranzaIdempotentCreate } from '@/server/services/cobranza-sync-idempotency';
import type {
  CreateVisitaCampoInput,
  ListVisitasCampoInput,
} from '@/server/validators/cobranza-operativa';

export async function createVisitaCampo(
  input: CreateVisitaCampoInput,
  userId: string,
  options?: {
    idempotencyKey?: string;
  },
): Promise<CobranzaVisitaCampoItem> {
  return runCobranzaIdempotentCreate({
    eventId: options?.idempotencyKey,
    eventType: 'VISITA',
    payload: {
      ...input,
      fechaHora: input.fechaHora.toISOString(),
    },
    userId,
    loadExisting: async (recordId) => {
      const existing = await findVisitaCampoRecordById(recordId);
      if (!existing) {
        throw new AppError('No se encontró la visita sincronizada.', 'VISITA_SYNC_RECORD_NOT_FOUND', 404);
      }
      return serializeVisitaCampo(existing);
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
        expectedTipo: 'VISIT',
      });

      const created = await createVisitaCampoRecord({
        clienteId: input.clienteId,
        creditoId: input.creditoId ?? null,
        interaccionId: input.interaccionId ?? null,
        fechaHora: input.fechaHora,
        resultado: input.resultado,
        notas: input.notas ?? null,
        direccionTexto: input.direccionTexto ?? null,
        referenciaLugar: input.referenciaLugar ?? null,
        latitud: input.latitud ?? null,
        longitud: input.longitud ?? null,
        createdByUserId: userId,
      });

      if (input.latitud != null && input.longitud != null) {
        try {
          await upsertClienteGeoReferenceFromVisitaCampo(
            {
              clienteId: input.clienteId,
              creditoId: input.creditoId ?? null,
              fechaHora: input.fechaHora.toISOString(),
              latitud: input.latitud,
              longitud: input.longitud,
              direccionTexto: input.direccionTexto ?? null,
              referenciaLugar: input.referenciaLugar ?? null,
            },
            {
              userId,
            },
          );
        } catch (error) {
          console.warn('No se pudo actualizar la referencia geográfica del cliente.', error);
        }
      }

      await writeAuditLog({
        userId,
        module: 'visitas-campo',
        entity: 'VisitaCampo',
        entityId: created.id,
        action: 'CREATE',
        afterJson: serializeVisitaCampo(created),
      });

      return {
        item: serializeVisitaCampo(created),
        recordId: created.id,
      };
    },
  });
}

export async function listVisitasCampo(
  input: ListVisitasCampoInput,
): Promise<CobranzaVisitaCampoItem[]> {
  await assertOperationalListScope({
    clienteId: input.clienteId,
    creditoId: input.creditoId,
  });

  const rows = await listVisitaCampoRecords(
    {
      ...(input.clienteId ? { clienteId: input.clienteId } : {}),
      ...(input.creditoId ? { creditoId: input.creditoId } : {}),
    },
    input.limit,
  );

  return rows.map(serializeVisitaCampo);
}
