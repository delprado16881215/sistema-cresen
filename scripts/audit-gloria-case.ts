import { prisma } from '@/lib/prisma';

const FOLIO = 'CRED-20240617-0030';
const TARGET_DATE = '2024-09-23';

async function main() {
  const credito = await prisma.credito.findFirst({
    where: { folio: FOLIO },
    select: {
      id: true,
      folio: true,
      loanNumber: true,
      weeklyAmount: true,
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

  if (!credito) throw new Error(`No encontré el crédito ${FOLIO}`);

  const start = new Date(`${TARGET_DATE}T00:00:00.000Z`);
  const end = new Date(`${TARGET_DATE}T23:59:59.999Z`);

  const targetPayments = credito.payments.filter(
    (payment) => payment.receivedAt >= start && payment.receivedAt <= end,
  );

  const audits = await prisma.auditLog.findMany({
    where: {
      module: 'pagos',
      entity: 'PagoGrupoImpact',
      entityId: { contains: `|${TARGET_DATE}|` },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, entityId: true, createdAt: true, afterJson: true },
  });

  const relevantAudits = audits
    .map((audit) => {
      const after = (audit.afterJson ?? {}) as Record<string, unknown>;
      const items = Array.isArray(after.items) ? after.items : [];
      const rowsSnapshot = Array.isArray(after.rowsSnapshot) ? after.rowsSnapshot : [];

      const ownItems = items.filter((item) => {
        if (!item || typeof item !== 'object') return false;
        return (item as { creditoId?: string }).creditoId === credito.id;
      });
      const ownRows = rowsSnapshot.filter((row) => {
        if (!row || typeof row !== 'object') return false;
        return (row as { creditoId?: string }).creditoId === credito.id;
      });

      return {
        id: audit.id,
        entityId: audit.entityId,
        createdAt: audit.createdAt,
        occurredAt: typeof after.occurredAt === 'string' ? after.occurredAt : null,
        paidCount: typeof after.paidCount === 'number' ? after.paidCount : null,
        failedCount: typeof after.failedCount === 'number' ? after.failedCount : null,
        skippedPayments: typeof after.skippedPayments === 'number' ? after.skippedPayments : null,
        skippedFailures: typeof after.skippedFailures === 'number' ? after.skippedFailures : null,
        issues: Array.isArray(after.issues) ? after.issues : [],
        items: ownItems,
        rowsSnapshot: ownRows,
        liquidation: after.liquidation ?? null,
      };
    })
    .filter((audit) => audit.items.length > 0 || audit.rowsSnapshot.length > 0);

  console.log(
    JSON.stringify(
      {
        credito,
        targetPayments,
        relevantAudits,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
