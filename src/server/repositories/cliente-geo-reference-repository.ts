import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

const clienteGeoReferenceSelect = {
  id: true,
  clienteId: true,
  creditoId: true,
  latitud: true,
  longitud: true,
  source: true,
  isApproximate: true,
  confidence: true,
  provider: true,
  placeId: true,
  normalizedAddressQuery: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ClienteGeoReferenceSelect;

export type ClienteGeoReferenceRecord = Awaited<ReturnType<typeof createClienteGeoReferenceRecord>>;

export async function createClienteGeoReferenceRecord(
  data: Prisma.ClienteGeoReferenceUncheckedCreateInput,
) {
  return prisma.clienteGeoReference.create({
    data,
    select: clienteGeoReferenceSelect,
  });
}

export async function updateClienteGeoReferenceRecord(
  id: string,
  data: Prisma.ClienteGeoReferenceUncheckedUpdateInput,
) {
  return prisma.clienteGeoReference.update({
    where: { id },
    data,
    select: clienteGeoReferenceSelect,
  });
}

export async function findClienteGeoReferenceRecordByExactScope(input: {
  clienteId: string;
  creditoId?: string | null;
}) {
  return prisma.clienteGeoReference.findFirst({
    where: {
      clienteId: input.clienteId,
      creditoId: input.creditoId ?? null,
    },
    select: clienteGeoReferenceSelect,
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function listClienteGeoReferenceRecordsForContext(input: {
  clienteId: string;
  creditoId?: string | null;
}) {
  return prisma.clienteGeoReference.findMany({
    where: {
      clienteId: input.clienteId,
      ...(input.creditoId
        ? {
            OR: [{ creditoId: input.creditoId }, { creditoId: null }],
          }
        : {
            creditoId: null,
          }),
    },
    select: clienteGeoReferenceSelect,
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
  });
}
