const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const cliente = await prisma.cliente.findFirst({
    where: { code: '1020' },
    select: {
      id: true,
      code: true,
      fullName: true,
      creditosTitular: {
        select: { id: true, folio: true, loanNumber: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  const pagos = await prisma.paymentEvent.findMany({
    where: {
      credito: { cliente: { code: '1020' } },
      receivedAt: {
        gte: new Date('2024-12-30T00:00:00.000Z'),
        lte: new Date('2025-01-06T23:59:59.999Z'),
      },
    },
    select: {
      id: true,
      creditoId: true,
      receivedAt: true,
      amountReceived: true,
      isReversed: true,
      credito: { select: { folio: true, loanNumber: true } },
    },
    orderBy: { receivedAt: 'asc' },
  });
  console.log(JSON.stringify({ cliente, pagos }, null, 2));
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
