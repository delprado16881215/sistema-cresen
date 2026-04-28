const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const credito = await prisma.credito.findFirst({
    where: { folio: 'CRED-20240916-0095' },
    select: {
      id: true,
      folio: true,
      loanNumber: true,
      creditStatus: { select: { code: true, name: true } },
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
              createdAt: true,
              paymentEventId: true,
              paymentEvent: {
                select: { id: true, receivedAt: true, isReversed: true, creditoId: true, amountReceived: true },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
      payments: {
        select: {
          id: true,
          receivedAt: true,
          amountReceived: true,
          isReversed: true,
          creditoId: true,
          allocations: {
            select: { id: true, amount: true, allocationType: true, scheduleId: true },
          },
        },
        orderBy: { receivedAt: 'desc' },
        take: 30,
      },
    },
  });
  console.log(JSON.stringify(credito, null, 2));
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
