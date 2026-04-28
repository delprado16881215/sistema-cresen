import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const [, , promotoriaId, occurredAt] = process.argv;

if (!promotoriaId || !occurredAt) {
  console.error('Usage: node scripts/query-liquidation-cumulative.mjs <promotoriaId> <YYYY-MM-DD>');
  process.exit(1);
}

try {
  const audits = await prisma.auditLog.findMany({
    where: {
      module: 'pagos',
      entity: 'PagoGrupoLiquidacion',
      action: { in: ['CREATE', 'UPDATE'] },
    },
    select: { entityId: true, afterJson: true, createdAt: true },
    orderBy: [{ createdAt: 'asc' }],
  });

  const latestByEntityId = new Map();

  for (const audit of audits) {
    const payload = audit.afterJson;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) continue;

    const record = payload;
    if (record.promotoriaId !== promotoriaId) continue;
    if (typeof record.occurredAt !== 'string' || record.occurredAt > occurredAt) continue;
    if (!record.liquidation || typeof record.liquidation !== 'object' || Array.isArray(record.liquidation)) continue;

    latestByEntityId.set(audit.entityId, {
      occurredAt: record.occurredAt,
      finalCashAmount: Number(record.liquidation.finalCashAmount ?? 0),
    });
  }

  const rows = [...latestByEntityId.values()].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const summary = rows.reduce(
    (acc, row) => {
      if (row.finalCashAmount < 0) acc.totalInvestmentAmount += Math.abs(row.finalCashAmount);
      if (row.finalCashAmount > 0) acc.totalCashAmount += row.finalCashAmount;
      acc.finalCashAmount += row.finalCashAmount;
      return acc;
    },
    { totalInvestmentAmount: 0, totalCashAmount: 0, finalCashAmount: 0 },
  );

  console.log(
    JSON.stringify(
      {
        rows,
        summary: {
          totalInvestmentAmount: Number(summary.totalInvestmentAmount.toFixed(2)),
          totalCashAmount: Number(summary.totalCashAmount.toFixed(2)),
          finalCashAmount: Number(summary.finalCashAmount.toFixed(2)),
        },
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
