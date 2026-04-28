import { AppError, toErrorMessage } from '@/lib/errors';
import { createInteraccion } from '@/server/services/interacciones-service';
import { createPromesaPago } from '@/server/services/promesas-pago-service';
import { createVisitaCampo } from '@/server/services/visitas-campo-service';
import {
  buildCobranzaSyncPayloadHash,
  findCobranzaProcessedEvent,
} from '@/server/services/cobranza-sync-idempotency';
import type { CobranzaSyncEvent } from '@/server/validators/cobranza-offline';

export type CobranzaSyncResultItem = {
  eventId: string;
  type: CobranzaSyncEvent['type'];
  status: 'SYNCED' | 'DUPLICATE' | 'FAILED';
  serverRecordId: string | null;
  message: string | null;
  code: string | null;
};

export async function syncCobranzaOfflineEvents(events: CobranzaSyncEvent[], userId: string) {
  const results: CobranzaSyncResultItem[] = [];

  for (const event of events) {
    const payloadHash = buildCobranzaSyncPayloadHash({
      ...event.payload,
      ...(event.type === 'INTERACTION'
        ? { fechaHora: event.payload.fechaHora.toISOString() }
        : event.type === 'PROMESA'
          ? { fechaPromesa: event.payload.fechaPromesa.toISOString() }
          : { fechaHora: event.payload.fechaHora.toISOString() }),
    });
    const existing = await findCobranzaProcessedEvent(event.eventId);

    if (existing) {
      if (existing.payloadHash !== payloadHash) {
        results.push({
          eventId: event.eventId,
          type: event.type,
          status: 'FAILED',
          serverRecordId: existing.recordId,
          message: 'La llave de idempotencia ya fue usada con un payload diferente.',
          code: 'COBRANZA_SYNC_IDEMPOTENCY_CONFLICT',
        });
      } else {
        results.push({
          eventId: event.eventId,
          type: event.type,
          status: 'DUPLICATE',
          serverRecordId: existing.recordId,
          message: 'Evento ya sincronizado previamente.',
          code: null,
        });
      }
      continue;
    }

    try {
      const created =
        event.type === 'INTERACTION'
          ? await createInteraccion(event.payload, userId, { idempotencyKey: event.eventId })
          : event.type === 'PROMESA'
            ? await createPromesaPago(event.payload, userId, { idempotencyKey: event.eventId })
            : await createVisitaCampo(event.payload, userId, { idempotencyKey: event.eventId });

      results.push({
        eventId: event.eventId,
        type: event.type,
        status: 'SYNCED',
        serverRecordId: created.id,
        message: null,
        code: null,
      });
    } catch (error) {
      results.push({
        eventId: event.eventId,
        type: event.type,
        status: 'FAILED',
        serverRecordId: null,
        message: toErrorMessage(error),
        code: error instanceof AppError ? error.code : null,
      });
    }
  }

  return {
    results,
    summary: {
      total: results.length,
      synced: results.filter((item) => item.status === 'SYNCED').length,
      duplicates: results.filter((item) => item.status === 'DUPLICATE').length,
      failed: results.filter((item) => item.status === 'FAILED').length,
    },
  };
}
