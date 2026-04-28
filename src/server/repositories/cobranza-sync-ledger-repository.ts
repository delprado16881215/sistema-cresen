import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

const cobranzaSyncLedgerSelect = {
  eventId: true,
  type: true,
  payloadHash: true,
  recordId: true,
  syncedByUserId: true,
  processedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CobranzaSyncLedgerSelect;

export async function findCobranzaSyncLedgerByEventId(eventId: string) {
  return prisma.cobranzaSyncLedger.findUnique({
    where: { eventId },
    select: cobranzaSyncLedgerSelect,
  });
}

export async function createCobranzaSyncLedger(data: Prisma.CobranzaSyncLedgerUncheckedCreateInput) {
  return prisma.cobranzaSyncLedger.create({
    data,
    select: cobranzaSyncLedgerSelect,
  });
}
