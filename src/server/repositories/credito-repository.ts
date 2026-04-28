import { prisma } from '@/lib/prisma';

export async function findCreditos(input: { page: number; pageSize: number; saleDate?: string }) {
  const where = input.saleDate
    ? {
        startDate: {
          gte: new Date(`${input.saleDate}T00:00:00.000Z`),
          lte: new Date(`${input.saleDate}T23:59:59.999Z`),
        },
      }
    : {};

  const [rows, total, aggregates] = await prisma.$transaction([
    prisma.credito.findMany({
      where,
      include: {
        cliente: { select: { id: true, code: true, fullName: true } },
        aval: { select: { id: true, code: true, fullName: true } },
        promotoria: {
          select: {
            id: true,
            code: true,
            name: true,
            supervision: {
              select: { id: true, name: true },
            },
          },
        },
        creditStatus: { select: { code: true, name: true } },
        schedules: {
          include: {
            installmentStatus: { select: { code: true, name: true } },
          },
          orderBy: [{ installmentNumber: 'asc' }],
        },
        defaults: {
          include: {
            recoveries: {
              include: {
                paymentEvent: { select: { isReversed: true } },
              },
            },
            schedule: {
              select: { installmentNumber: true, dueDate: true },
            },
          },
          orderBy: [{ createdAt: 'asc' }],
        },
        payments: {
          select: {
            id: true,
            receivedAt: true,
            amountReceived: true,
            isReversed: true,
          },
        },
        extraWeek: true,
        reversals: {
          select: {
            sourceType: true,
            sourceId: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    }),
    prisma.credito.count({ where }),
    prisma.credito.aggregate({
      where,
      _sum: {
        principalAmount: true,
        weeklyAmount: true,
      },
    }),
  ]);

  return {
    rows,
    total,
    totals: {
      principalAmount: Number(aggregates._sum.principalAmount ?? 0),
      weeklyAmount: Number(aggregates._sum.weeklyAmount ?? 0),
    },
  };
}
