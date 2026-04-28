const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const start = new Date('2024-12-30T00:00:00.000Z');
  const end = new Date('2025-01-06T23:59:59.999Z');
  const pagos = await prisma.paymentEvent.findMany({
    where: {
      receivedAt: { gte: start, lte: end },
      OR: [
        { credito: { folio: 'CRED-20240916-0095' } },
        { credito: { cliente: { fullName: { contains: 'BRENDA ESMERALDA GONZALEZ MIRAMONTES' } } } },
      ],
    },
    select: {
      id: true,
      creditoId: true,
      receivedAt: true,
      amountReceived: true,
      isReversed: true,
      credito: { select: { folio: true, loanNumber: true, cliente: { select: { fullName: true, code: true } } } },
      allocations: {
        select: {
          id: true,
          amount: true,
          allocationType: true,
          scheduleId: true,
          schedule: { select: { installmentNumber: true, dueDate: true, creditoId: true } },
        },
      },
    },
    orderBy: [{ receivedAt: 'asc' }],
  });
  console.log(JSON.stringify(pagos, null, 2));
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
