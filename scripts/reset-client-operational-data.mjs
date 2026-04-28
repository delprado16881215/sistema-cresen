import { PrismaClient } from '@prisma/client';
import { readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const uploadsRoot = path.join(repoRoot, 'public', 'uploads', 'clientes');

async function removeClientUploads() {
  try {
    const entries = await readdir(uploadsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.gitkeep') continue;
      const target = path.join(uploadsRoot, entry.name);
      await rm(target, { recursive: true, force: true });
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return;
    }
    throw error;
  }
}

async function main() {
  const creditIds = (await prisma.credito.findMany({ select: { id: true } })).map((row) => row.id);
  const paymentIds = (await prisma.paymentEvent.findMany({ select: { id: true } })).map((row) => row.id);
  const defaultIds = (await prisma.defaultEvent.findMany({ select: { id: true } })).map((row) => row.id);
  const penaltyIds = (await prisma.penaltyCharge.findMany({ select: { id: true } })).map((row) => row.id);
  const extraWeekIds = (await prisma.extraWeekEvent.findMany({ select: { id: true } })).map((row) => row.id);
  const scheduleIds = (await prisma.creditSchedule.findMany({ select: { id: true } })).map((row) => row.id);
  const clientIds = (await prisma.cliente.findMany({ select: { id: true } })).map((row) => row.id);

  const summary = await prisma.$transaction(async (tx) => {
    const counts = {};

    counts.financialLogs = creditIds.length
      ? await tx.financialEventLog.deleteMany({ where: { creditoId: { in: creditIds } } })
      : { count: 0 };

    counts.financialReversals = creditIds.length
      ? await tx.financialReversal.deleteMany({ where: { creditoId: { in: creditIds } } })
      : { count: 0 };

    counts.paymentAllocations = await tx.paymentAllocation.deleteMany({
      where: {
        OR: [
          paymentIds.length ? { paymentEventId: { in: paymentIds } } : undefined,
          defaultIds.length ? { defaultEventId: { in: defaultIds } } : undefined,
          penaltyIds.length ? { penaltyChargeId: { in: penaltyIds } } : undefined,
          extraWeekIds.length ? { extraWeekEventId: { in: extraWeekIds } } : undefined,
          scheduleIds.length ? { scheduleId: { in: scheduleIds } } : undefined,
        ].filter(Boolean),
      },
    });

    counts.recoveryEvents = creditIds.length
      ? await tx.recoveryEvent.deleteMany({ where: { creditoId: { in: creditIds } } })
      : { count: 0 };

    counts.advanceEvents = creditIds.length
      ? await tx.advanceEvent.deleteMany({ where: { creditoId: { in: creditIds } } })
      : { count: 0 };

    counts.penaltyCharges = creditIds.length
      ? await tx.penaltyCharge.deleteMany({ where: { creditoId: { in: creditIds } } })
      : { count: 0 };

    counts.defaultEvents = creditIds.length
      ? await tx.defaultEvent.deleteMany({ where: { creditoId: { in: creditIds } } })
      : { count: 0 };

    counts.extraWeekEvents = creditIds.length
      ? await tx.extraWeekEvent.deleteMany({ where: { creditoId: { in: creditIds } } })
      : { count: 0 };

    counts.paymentEvents = creditIds.length
      ? await tx.paymentEvent.deleteMany({ where: { creditoId: { in: creditIds } } })
      : { count: 0 };

    counts.creditSchedules = creditIds.length
      ? await tx.creditSchedule.deleteMany({ where: { creditoId: { in: creditIds } } })
      : { count: 0 };

    counts.auditLogs = await tx.auditLog.deleteMany({
      where: {
        OR: [
          { module: 'clientes' },
          { module: 'creditos' },
          { module: 'pagos' },
        ],
      },
    });

    counts.creditos = await tx.credito.deleteMany({});
    counts.clientes = await tx.cliente.deleteMany({});

    return counts;
  });

  await removeClientUploads();

  const remainingClientes = await prisma.cliente.count();
  const remainingCreditos = await prisma.credito.count();
  const remainingPagos = await prisma.paymentEvent.count();
  const nextClientCode = 'CR0001';

  console.log(JSON.stringify({
    deleted: Object.fromEntries(Object.entries(summary).map(([key, value]) => [key, value.count])),
    remaining: {
      clientes: remainingClientes,
      creditos: remainingCreditos,
      pagos: remainingPagos,
    },
    nextClientCode,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
