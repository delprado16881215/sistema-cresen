const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const rows = await prisma.auditLog.findMany({
    where: {
      module: 'pagos',
      entity: 'PagoGrupoImpact',
      OR: [
        { entityId: { contains: '|2024-12-30|' } },
        { entityId: { contains: '|2025-01-06|' } },
      ],
    },
    select: {
      id: true,
      entityId: true,
      createdAt: true,
      afterJson: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const compact = rows.map((row) => {
    const after = row.afterJson || {};
    const items = Array.isArray(after.items) ? after.items : [];
    return {
      id: row.id,
      entityId: row.entityId,
      createdAt: row.createdAt,
      paidCount: after.paidCount,
      failedCount: after.failedCount,
      skippedPayments: after.skippedPayments,
      skippedFailures: after.skippedFailures,
      expectedCount: after.expectedCount,
      itemsCount: items.length,
      items,
    };
  });

  console.log(JSON.stringify(compact, null, 2));
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
