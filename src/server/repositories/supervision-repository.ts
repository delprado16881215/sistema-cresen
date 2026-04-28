import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export async function findSupervisiones(input: { search?: string; isActive?: boolean }) {
  const where: Prisma.SupervisionWhereInput = {
    ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
    ...(input.search
      ? {
          OR: [
            { code: { contains: input.search, mode: 'insensitive' } },
            { name: { contains: input.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  return prisma.supervision.findMany({
    where,
    include: {
      promotorias: {
        where: { deletedAt: null },
        select: { id: true },
      },
    },
    orderBy: [{ name: 'asc' }],
  });
}

export async function findSupervisionById(id: string) {
  return prisma.supervision.findUnique({
    where: { id },
    include: {
      promotorias: {
        where: { deletedAt: null },
        select: { id: true, code: true, name: true, isActive: true },
        orderBy: [{ name: 'asc' }],
      },
    },
  });
}
