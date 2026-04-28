import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const [, , promotoriaId, occurredAt, amountRaw, scopeArg] = process.argv;

if (!promotoriaId || !occurredAt || !amountRaw) {
  console.error('Usage: node scripts/add-opening-liquidation.mjs <promotoriaId> <YYYY-MM-DD> <amount> [scope]');
  process.exit(1);
}

const amount = Number(amountRaw);
const scope = scopeArg ?? 'active';

if (!Number.isFinite(amount) || amount <= 0) {
  console.error('Amount must be a positive number.');
  process.exit(1);
}

const entityId = [promotoriaId, occurredAt, scope].join('|');
const finalCashAmount = -Math.abs(amount);

try {
  const existing = await prisma.auditLog.findFirst({
    where: {
      module: 'pagos',
      entity: 'PagoGrupoLiquidacion',
      entityId,
      action: { in: ['CREATE', 'UPDATE'] },
    },
    orderBy: { createdAt: 'desc' },
  });

  const payload = {
    promotoriaId,
    occurredAt,
    scope,
    liquidation: {
      saleAmount: amount,
      commissionBase: 'SALE',
      commissionRate: '0',
      deAmount: 0,
      failureAmount: 0,
      recoveryAmount: 0,
      subtotalAmount: 0,
      incomingAdvanceAmount: 0,
      outgoingAdvanceAmount: 0,
      extraWeekAmount: 0,
      totalToDeliver: 0,
      commissionBaseAmount: 0,
      commissionAmount: 0,
      finalCashAmount,
      finalCashLabel: 'Apertura de promotoria',
      openingInvestment: true,
    },
  };

  const created = await prisma.auditLog.create({
    data: {
      module: 'pagos',
      entity: 'PagoGrupoLiquidacion',
      entityId,
      action: existing ? 'UPDATE' : 'CREATE',
      beforeJson: existing?.afterJson ?? undefined,
      afterJson: payload,
    },
  });

  console.log(JSON.stringify({ createdId: created.id, entityId, finalCashAmount }, null, 2));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
