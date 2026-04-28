import { prisma } from '@/lib/prisma';

export async function getCreditoFormCatalogs() {
  const [promotorias, planes] = await prisma.$transaction([
    prisma.promotoria.findMany({
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
    }),
    prisma.creditPlanRule.findMany({
      where: { isActive: true, code: { in: ['PLAN_12', 'PLAN_15'] } },
      select: { id: true, code: true, weeks: true, weeklyFactor: true },
      orderBy: [{ weeks: 'asc' }, { version: 'desc' }],
    }),
  ]);

  return {
    promotorias,
    planes: planes.map((plan) => ({
      id: plan.id,
      code: plan.code as 'PLAN_12' | 'PLAN_15',
      weeks: plan.weeks,
      weeklyFactor: Number(plan.weeklyFactor ?? 0),
      label: `${plan.weeks} semanas`,
    })),
  };
}
