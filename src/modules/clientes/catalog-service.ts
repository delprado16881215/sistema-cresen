import { prisma } from '@/lib/prisma';

export async function getClienteFormCatalogs() {
  const promotorias = await prisma.promotoria.findMany({
    where: { deletedAt: null, isActive: true },
    select: {
      id: true,
      code: true,
      name: true,
      supervision: {
        select: { id: true, name: true },
      },
    },
    orderBy: [{ name: 'asc' }],
  });

  return { promotorias };
}
