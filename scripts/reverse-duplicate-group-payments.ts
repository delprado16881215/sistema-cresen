import { PrismaClient } from '@prisma/client';
import { reversePago } from '../src/server/services/pagos-service';

const prisma = new PrismaClient();

async function main() {
  const adminUser = await prisma.user.findFirst({
    where: { isActive: true },
    orderBy: [{ createdAt: 'asc' }],
    select: { id: true, name: true, email: true },
  });

  if (!adminUser) {
    throw new Error('No hay un usuario activo disponible para registrar la reversa.');
  }

  const paymentEvents = await prisma.paymentEvent.findMany({
    where: { isReversed: false },
    select: {
      id: true,
      creditoId: true,
      receivedAt: true,
      createdAt: true,
      amountReceived: true,
      credito: {
        select: {
          loanNumber: true,
          folio: true,
          cliente: { select: { code: true, fullName: true } },
        },
      },
      allocations: {
        select: {
          allocationType: true,
          amount: true,
          schedule: { select: { installmentNumber: true } },
          extraWeekEvent: { select: { id: true } },
        },
        orderBy: [{ createdAt: 'asc' }],
      },
    },
    orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }],
  });

  const groups = new Map<string, typeof paymentEvents>();
  for (const row of paymentEvents) {
    const date = row.receivedAt.toISOString().slice(0, 10);
    const key = `${row.creditoId}|${date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const candidates = [...groups.values()]
    .filter((rows) => rows.length > 1)
    .map((rows) => rows.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime()))
    .filter((rows) => {
      const firstRow = rows[0];
      if (!firstRow) return false;
      const sameAmount = rows.every(
        (row) => Number(row.amountReceived) === Number(firstRow.amountReceived),
      );
      const singleCurrentAllocation = rows.every(
        (row) =>
          row.allocations.length === 1 &&
          row.allocations[0]?.allocationType === 'CURRENT' &&
          !row.allocations[0]?.extraWeekEvent,
      );
      const installmentNumbers = rows
        .map((row) => row.allocations[0]?.schedule?.installmentNumber ?? null)
        .filter((value): value is number => value !== null)
        .sort((left, right) => left - right);
      const consecutive = installmentNumbers.every((value, index) => {
        if (index === 0) return true;
        const previous = installmentNumbers[index - 1];
        return previous !== undefined && value === previous + 1;
      });

      return sameAmount && singleCurrentAllocation && consecutive;
    });

  const reversed: Array<{
    keptPaymentEventId: string;
    reversedPaymentEventId: string;
    loanNumber: string;
    folio: string;
    cliente: string;
    receivedAt: string;
    keptInstallment: number | null;
    reversedInstallment: number | null;
  }> = [];

  for (const rows of candidates) {
    const [kept, ...duplicates] = rows;
    if (!kept) continue;
    for (const duplicate of duplicates) {
      await reversePago(
        {
          paymentEventId: duplicate.id,
          reason: 'Reversa por pago grupal duplicado',
          notes: 'Pago duplicado por doble impacto accidental del botón grupal.',
        },
        adminUser.id,
      );

      reversed.push({
        keptPaymentEventId: kept.id,
        reversedPaymentEventId: duplicate.id,
        loanNumber: duplicate.credito.loanNumber,
        folio: duplicate.credito.folio,
        cliente: `${duplicate.credito.cliente.code} · ${duplicate.credito.cliente.fullName}`,
        receivedAt: duplicate.receivedAt.toISOString(),
        keptInstallment: kept.allocations[0]?.schedule?.installmentNumber ?? null,
        reversedInstallment: duplicate.allocations[0]?.schedule?.installmentNumber ?? null,
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        operator: adminUser,
        candidateGroups: candidates.length,
        reversedCount: reversed.length,
        reversed,
      },
      null,
      2,
    ),
  );
}

main()
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
