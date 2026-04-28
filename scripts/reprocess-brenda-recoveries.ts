import { prisma } from '@/lib/prisma';
import { registerPago } from '@/server/services/pagos-service';

const CREDIT_FOLIO = 'CRED-20240916-0095';
const TARGET_DATES = ['2024-12-30', '2025-01-06'] as const;
const TARGET_AMOUNT = 312.5;

async function main() {
  const credito = await prisma.credito.findFirst({
    where: { folio: CREDIT_FOLIO },
    select: {
      id: true,
      folio: true,
      loanNumber: true,
      createdByUserId: true,
      cliente: { select: { fullName: true, code: true } },
      schedules: {
        select: {
          id: true,
          installmentNumber: true,
          dueDate: true,
          expectedAmount: true,
          paidAmount: true,
          installmentStatus: { select: { code: true, name: true } },
        },
        orderBy: { installmentNumber: 'asc' },
      },
      defaults: {
        select: {
          id: true,
          scheduleId: true,
          amountMissed: true,
          createdAt: true,
          recoveries: {
            select: {
              id: true,
              recoveredAmount: true,
              paymentEvent: {
                select: {
                  id: true,
                  receivedAt: true,
                  isReversed: true,
                },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
          schedule: {
            select: {
              id: true,
              installmentNumber: true,
              dueDate: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
      payments: {
        where: {
          receivedAt: {
            gte: new Date('2024-12-30T00:00:00.000Z'),
            lte: new Date('2025-01-06T23:59:59.999Z'),
          },
          isReversed: false,
        },
        select: {
          id: true,
          receivedAt: true,
          amountReceived: true,
        },
      },
    },
  });

  if (!credito) {
    throw new Error(`No encontré el crédito ${CREDIT_FOLIO}`);
  }

  if (credito.payments.length > 0) {
    throw new Error(
      `Ya existen pagos activos en las fechas objetivo: ${credito.payments
        .map((payment) => payment.receivedAt.toISOString().slice(0, 10))
        .join(', ')}`,
    );
  }

  const unresolvedDefaults = credito.defaults.filter((defaultEvent) => {
    const recoveredAmount = defaultEvent.recoveries
      .filter((recovery) => !recovery.paymentEvent.isReversed)
      .reduce((sum, recovery) => sum + Number(recovery.recoveredAmount), 0);
    return recoveredAmount < Number(defaultEvent.amountMissed);
  });

  if (unresolvedDefaults.length < 2) {
    throw new Error(
      `Esperaba al menos 2 fallas pendientes; encontré ${unresolvedDefaults.length}.`,
    );
  }

  const userId =
    credito.createdByUserId ||
    (
      await prisma.user.findFirst({
        where: { isActive: true },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      })
    )?.id;

  if (!userId) {
    throw new Error('No encontré un usuario activo para registrar el reproceso.');
  }

  const before = unresolvedDefaults.map((defaultEvent) => ({
    defaultEventId: defaultEvent.id,
    scheduleId: defaultEvent.scheduleId,
    installmentNumber: defaultEvent.schedule.installmentNumber,
    dueDate: defaultEvent.schedule.dueDate.toISOString().slice(0, 10),
    amountMissed: Number(defaultEvent.amountMissed),
    recoveredAmount: defaultEvent.recoveries
      .filter((recovery) => !recovery.paymentEvent.isReversed)
      .reduce((sum, recovery) => sum + Number(recovery.recoveredAmount), 0),
  }));

  const results = [] as Array<{
    date: string;
    paymentResult: Awaited<ReturnType<typeof registerPago>>;
  }>;

  for (const date of TARGET_DATES) {
    const paymentResult = await registerPago(
      {
        creditoId: credito.id,
        receivedAt: date,
        amountReceived: TARGET_AMOUNT,
        penaltyChargeIds: [],
        notes: `REPROCESO CONTROLADO BRENDA ${date}`,
      },
      userId,
    );

    results.push({ date, paymentResult });
  }

  const after = await prisma.credito.findFirst({
    where: { id: credito.id },
    select: {
      id: true,
      schedules: {
        select: {
          id: true,
          installmentNumber: true,
          dueDate: true,
          expectedAmount: true,
          paidAmount: true,
          installmentStatus: { select: { code: true, name: true } },
          allocations: {
            where: {
              paymentEvent: {
                isReversed: false,
                receivedAt: {
                  gte: new Date('2024-12-30T00:00:00.000Z'),
                  lte: new Date('2025-01-06T23:59:59.999Z'),
                },
              },
            },
            select: {
              id: true,
              amount: true,
              allocationType: true,
              paymentEvent: {
                select: {
                  id: true,
                  receivedAt: true,
                  amountReceived: true,
                  isReversed: true,
                },
              },
            },
          },
        },
        orderBy: { installmentNumber: 'asc' },
      },
      defaults: {
        select: {
          id: true,
          scheduleId: true,
          amountMissed: true,
          schedule: {
            select: {
              installmentNumber: true,
              dueDate: true,
            },
          },
          recoveries: {
            select: {
              id: true,
              recoveredAmount: true,
              paymentEventId: true,
              paymentEvent: {
                select: {
                  id: true,
                  receivedAt: true,
                  amountReceived: true,
                  isReversed: true,
                },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
      payments: {
        where: {
          receivedAt: {
            gte: new Date('2024-12-30T00:00:00.000Z'),
            lte: new Date('2025-01-06T23:59:59.999Z'),
          },
        },
        select: {
          id: true,
          receivedAt: true,
          amountReceived: true,
          isReversed: true,
          allocations: {
            select: {
              id: true,
              amount: true,
              allocationType: true,
              scheduleId: true,
              defaultEventId: true,
            },
          },
        },
        orderBy: { receivedAt: 'asc' },
      },
    },
  });

  console.log(
    JSON.stringify(
      {
        creditoId: credito.id,
        folio: credito.folio,
        loanNumber: credito.loanNumber,
        cliente: credito.cliente,
        before,
        results,
        after,
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
