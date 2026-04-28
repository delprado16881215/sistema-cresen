import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export async function findPromotorias(input: { search?: string; isActive?: boolean }) {
  const where: Prisma.PromotoriaWhereInput = {
    deletedAt: null,
    ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
    ...(input.search
      ? {
          OR: [
            { code: { contains: input.search, mode: 'insensitive' } },
            { name: { contains: input.search, mode: 'insensitive' } },
            { supervision: { name: { contains: input.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  return prisma.promotoria.findMany({
    where,
    include: {
      supervision: true,
      clientes: {
        where: { deletedAt: null },
        select: { id: true },
      },
    },
    orderBy: [{ name: 'asc' }],
  });
}

export async function findPromotoriaById(id: string) {
  return prisma.promotoria.findFirst({
    where: { id, deletedAt: null },
    include: {
      supervision: true,
      clientes: {
        where: { deletedAt: null },
        select: { id: true, code: true, fullName: true, isActive: true },
        orderBy: [{ fullName: 'asc' }],
      },
      creditos: {
        select: { id: true, folio: true, weeklyAmount: true, principalAmount: true },
        orderBy: [{ createdAt: 'desc' }],
        take: 10,
      },
    },
  });
}

export async function getPromotoriaFormCatalogs() {
  const supervisiones = await prisma.supervision.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: [{ name: 'asc' }],
  });

  return { supervisiones };
}
