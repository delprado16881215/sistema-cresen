import { prisma } from '@/lib/prisma';

export async function getDashboardMetrics() {
  const [clientesActivos, clientesInactivos, usuariosActivos] = await prisma.$transaction([
    prisma.cliente.count({ where: { isActive: true, deletedAt: null } }),
    prisma.cliente.count({ where: { isActive: false, deletedAt: { not: null } } }),
    prisma.user.count({ where: { isActive: true } }),
  ]);

  return {
    clientesActivos,
    clientesInactivos,
    usuariosActivos,
  };
}
