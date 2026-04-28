import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AppError } from '@/lib/errors';
import {
  createCobranzaSyncLedger,
  findCobranzaSyncLedgerByEventId,
} from '@/server/repositories/cobranza-sync-ledger-repository';

type CobranzaSyncLedgerType = 'INTERACTION' | 'PROMESA' | 'VISITA';

type IdempotentCreateInput<T> = {
  eventId?: string;
  eventType: CobranzaSyncLedgerType;
  payload: unknown;
  userId: string;
  loadExisting: (recordId: string) => Promise<T>;
  create: () => Promise<{ item: T; recordId: string }>;
};

function buildPayloadHash(payload: unknown) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export async function runCobranzaIdempotentCreate<T>({
  eventId,
  eventType,
  payload,
  userId,
  loadExisting,
  create,
}: IdempotentCreateInput<T>): Promise<T> {
  if (!eventId) {
    const created = await create();
    return created.item;
  }

  const payloadHash = buildPayloadHash(payload);
  const existingLedger = await findCobranzaSyncLedgerByEventId(eventId);

  if (existingLedger) {
    if (existingLedger.payloadHash !== payloadHash) {
      throw new AppError(
        'La misma llave de idempotencia ya fue utilizada con otro payload.',
        'COBRANZA_SYNC_IDEMPOTENCY_CONFLICT',
        409,
      );
    }

    return loadExisting(existingLedger.recordId);
  }

  const created = await create();

  try {
    await createCobranzaSyncLedger({
      eventId,
      type: eventType,
      payloadHash,
      recordId: created.recordId,
      syncedByUserId: userId,
    });

    return created.item;
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const concurrentLedger = await findCobranzaSyncLedgerByEventId(eventId);
    if (!concurrentLedger) {
      throw error;
    }
    if (concurrentLedger.payloadHash !== payloadHash) {
      throw new AppError(
        'La misma llave de idempotencia ya fue utilizada con otro payload.',
        'COBRANZA_SYNC_IDEMPOTENCY_CONFLICT',
        409,
      );
    }

    return loadExisting(concurrentLedger.recordId);
  }
}

export async function findCobranzaProcessedEvent(eventId: string) {
  return findCobranzaSyncLedgerByEventId(eventId);
}

export function buildCobranzaSyncPayloadHash(payload: unknown) {
  return buildPayloadHash(payload);
}
