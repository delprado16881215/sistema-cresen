import { prisma } from '@/lib/prisma';

const FOLIO = 'CRED-20240916-0098';

async function main() {
  const credito = await prisma.credito.findFirst({
    where: { folio: FOLIO },
    select: {
      id: true,
      folio: true,
      loanNumber: true,
      weeklyAmount: true,
      createdByUserId: true,
      cliente: { select: { fullName: true, code: true } },
      extraWeek: {
        select: {
          id: true,
          dueDate: true,
          expectedAmount: true,
          paidAmount: true,
          status: true,
          allocations: {
            where: { paymentEvent: { isReversed: false } },
            orderBy: { paymentEvent: { receivedAt: 'asc' } },
            select: {
              id: true,
              amount: true,
              allocationType: true,
              paymentEvent: {
                select: { id: true, receivedAt: true, amountReceived: true, isReversed: true },
              },
            },
          },
        },
      },
      schedules: {
        orderBy: { installmentNumber: 'asc' },
        select: {
          id: true,
          installmentNumber: true,
          dueDate: true,
          expectedAmount: true,
          paidAmount: true,
          installmentStatus: { select: { code: true, name: true } },
          allocations: {
            where: { paymentEvent: { isReversed: false } },
            orderBy: { paymentEvent: { receivedAt: 'asc' } },
            select: {
              id: true,
              amount: true,
              allocationType: true,
              defaultEventId: true,
              extraWeekEventId: true,
              paymentEvent: {
                select: { id: true, receivedAt: true, amountReceived: true, isReversed: true },
              },
            },
          },
        },
      },
      defaults: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          scheduleId: true,
          amountMissed: true,
          createdAt: true,
          schedule: { select: { installmentNumber: true, dueDate: true } },
          recoveries: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              recoveredAmount: true,
              paymentEventId: true,
              paymentEvent: {
                select: { id: true, receivedAt: true, amountReceived: true, isReversed: true },
              },
            },
          },
        },
      },
      payments: {
        orderBy: { receivedAt: 'desc' },
        select: {
          id: true,
          receivedAt: true,
          amountReceived: true,
          isReversed: true,
          notes: true,
          allocations: {
            select: {
              id: true,
              amount: true,
              allocationType: true,
              scheduleId: true,
              defaultEventId: true,
              extraWeekEventId: true,
            },
          },
        },
      },
    },
  });

  if (!credito) throw new Error('Credito no encontrado');

  const audits = await prisma.auditLog.findMany({
    where: {
      module: 'pagos',
      entity: 'PagoGrupoImpact',
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, entityId: true, createdAt: true, afterJson: true },
  });

  const relevantAudits = audits
    .map((audit) => {
      const after = (audit.afterJson ?? {}) as Record<string, unknown>;
      const items = Array.isArray(after.items) ? after.items : [];
      const ownItems = items.filter((item) => {
        if (!item || typeof item !== 'object') return false;
        return (item as { creditoId?: string }).creditoId === credito.id;
      });
      return {
        id: audit.id,
        entityId: audit.entityId,
        createdAt: audit.createdAt,
        occurredAt: typeof after.occurredAt === 'string' ? after.occurredAt : null,
        items: ownItems,
      };
    })
    .filter((audit) => audit.items.length > 0);

  console.log(JSON.stringify({ credito, relevantAudits }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
