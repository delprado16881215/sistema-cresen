import { findPromotoriaWeeklyCollection } from '../src/server/repositories/pago-repository';
import { prisma } from '../src/lib/prisma';

const promotoriaId = 'cmmjj2gi10010yuv572tdpu2e';
const occurredAt = '2024-09-23';

const result = await findPromotoriaWeeklyCollection(promotoriaId, { occurredAt, scope: 'active', modeOverride: 'preview' });
const rows = result.rows
  .filter((row) => row.deAmount > 0)
  .map((row) => ({
    control: row.controlNumber,
    cliente: row.clienteLabel,
    scope: row.operationalScope,
    installment: row.installmentLabel,
    deAmount: row.deAmount,
    recovery: row.recoveryAmountAvailable,
    extraWeek: row.extraWeekAmount,
    collectible: row.collectibleAmount,
  }));
console.log(JSON.stringify({ deTotal: result.rows.reduce((s, r) => s + r.deAmount, 0), rowCount: result.rows.length, rows }, null, 2));
await prisma.$disconnect();
