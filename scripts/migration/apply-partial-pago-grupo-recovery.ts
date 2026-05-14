import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Prisma, type PrismaClient } from '@prisma/client';
import {
  assertProductionAdmin,
  assertSupabaseDatabase,
  createClient,
  getRequiredEnv,
  redactDatabaseUrl,
} from './migration-utils';

const TARGET = {
  promotoriaId: 'cmmjj2gi10010yuv572tdpu2e',
  occurredAt: '2026-04-27',
  scope: 'active',
} as const;

const CSV_PATH = path.join(process.cwd(), 'exports', 'partial-recovery-2026-04-27-vicky-el-nayar.csv');
const APPLY_CONFIRMATION = 'CONFIRM_APPLY_PARTIAL_RECOVERY';
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

const creditInclude = Prisma.validator<Prisma.CreditoInclude>()({
  cliente: true,
  aval: true,
  promotoria: { include: { supervision: true } },
  schedules: {
    include: { installmentStatus: true },
    orderBy: { installmentNumber: 'asc' },
  },
});

type LoadedCredit = Prisma.CreditoGetPayload<{ include: typeof creditInclude }>;
type LoadedSchedule = LoadedCredit['schedules'][number];
type Decision = 'PAGO' | 'FALLA' | 'SNAPSHOT_ONLY' | 'IGNORAR' | 'REVISAR' | '';
type ActionDecision = Extract<Decision, 'PAGO' | 'FALLA' | 'SNAPSHOT_ONLY'>;
type PlanStatus = 'CREATE' | 'SNAPSHOT_ONLY' | 'ALREADY_APPLIED' | 'IGNORED' | 'UNSAFE';

type CsvRecoveryRow = {
  lineNumber: number;
  control: string;
  cliente: string;
  creditoId: string;
  loanNumber: string;
  semana: number | null;
  tiposPosibles: string;
  deAmount: number;
  outgoingAdvanceAmount: number;
  decisionManual: Decision;
  montoPago: number;
  montoFalla: number;
  montoRecuperado: number;
  montoAdelantoEntrante: number;
  montoSemanaExtra: number;
  observaciones: string;
};

type ImpactPayload = Record<string, unknown> & {
  rowsSnapshot?: RowSnapshot[];
  items?: ImpactItem[];
  liquidation?: Record<string, unknown>;
};

type RowSnapshot = {
  creditoId: string;
  scheduleId: string | null;
  extraWeekEventId: string | null;
  recoveryAnchorDefaultEventId: string | null;
  recoveryAnchorScheduleId: string | null;
  recoveryAnchorInstallmentNumber: number | null;
  folio: string;
  loanNumber: string;
  controlNumber: number | null;
  clienteId: string;
  clienteCode: string;
  clienteName: string;
  clientePhone: string | null;
  clienteSecondaryPhone: string | null;
  clienteAddress: string | null;
  clienteNeighborhood: string | null;
  clienteCity: string | null;
  clienteState: string | null;
  clienteLabel: string;
  avalLabel: string | null;
  promotoriaId: string;
  promotoriaName: string;
  supervisionName: string | null;
  operationalScope: 'active' | 'active_with_extra_week' | 'overdue';
  operationalWeek: number;
  creditStartDate: string | null;
  scheduledDate: string | null;
  weeklyAmount: number;
  collectibleAmount: number;
  deAmount: number;
  recoveryAmountAvailable: number;
  advanceAmountAvailable: number;
  outgoingAdvanceAmount: number;
  extraWeekAmount: number;
  rowMode: 'regular' | 'recovery_only' | 'extra_week_only' | 'final_closure';
  historicalCurrentPaymentAmount: number;
  historicalFailureAmount: number;
  historicalRecoveryAmount: number;
  historicalAdvanceIncomingAmount: number;
  historicalExtraWeekCollectedAmount: number;
  installmentNumber: number;
  installmentLabel: string;
  deEligible: boolean;
};

type ImpactItem = {
  creditoId: string;
  action: 'PAY' | 'FAIL';
  recoveryAmount: number;
  advanceAmount: number;
  extraWeekAmount: number;
  partialFailureAmount: number;
};

type LoadedContext = {
  entityId: string;
  adminUserId: string;
  impactAudit: {
    id: string;
    afterJson: Prisma.JsonValue;
  };
  payload: ImpactPayload;
  currentRowsSnapshot: RowSnapshot[];
  currentItems: ImpactItem[];
  creditsById: Map<string, LoadedCredit>;
  paymentStatusCapturedId: string;
  paymentStatusPartialId: string;
  installmentStatusPaidId: string;
  installmentStatusPartialId: string;
  installmentStatusFailedId: string;
  paymentEventsOnDateByCreditId: Map<string, Array<{ id: string }>>;
  currentAllocationsByScheduleId: Map<string, Array<{ id: string; paymentEventId: string }>>;
  defaultEventsByScheduleId: Map<string, Array<{ id: string }>>;
};

type RecoveryPlanItem = {
  csv: CsvRecoveryRow;
  decision: ActionDecision | null;
  status: PlanStatus;
  reason: string;
  credito: LoadedCredit | null;
  schedule: LoadedSchedule | null;
  existingSnapshot: RowSnapshot | null;
  snapshot: RowSnapshot | null;
  item: ImpactItem | null;
  duplicateRisk: boolean;
};

type Totals = {
  deAmount: number;
  failureAmount: number;
  recoveryAmount: number;
  subtotalAmount: number;
  incomingAdvanceAmount: number;
  outgoingAdvanceAmount: number;
  extraWeekAmount: number;
  total: number;
  totalToDeliver: number;
  saleAmount: number;
  bonusAmount: number;
  commissionBase: 'SALE' | 'TOTAL_TO_DELIVER';
  commissionRate: number;
  commissionBaseAmount: number;
  commissionAmount: number;
  finalCashAmount: number;
  finalCashLabel: string;
};

function buildEntityId() {
  return [TARGET.promotoriaId, TARGET.occurredAt, TARGET.scope].join('|');
}

function createProductionClient() {
  const productionUrl = getRequiredEnv('PROD_DATABASE_URL');
  assertSupabaseDatabase(productionUrl);
  console.log(`PROD_DATABASE_URL: ${redactDatabaseUrl(productionUrl)}`);
  return createClient(productionUrl);
}

function getUtcDayRange(dateKey: string) {
  const start = new Date(`${dateKey}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function toDateKey(value: Date | string | null | undefined) {
  if (!value) return null;
  return new Date(value).toISOString().slice(0, 10);
}

function toMoney(value: Prisma.Decimal | string | number | null | undefined) {
  return Number(Number(value ?? 0).toFixed(2));
}

function amountEquals(left: number, right: number) {
  return Math.abs(left - right) <= 0.001;
}

function parseAmount(value: string | undefined) {
  const normalized = String(value ?? '')
    .replace(/\$/g, '')
    .replace(/,/g, '')
    .trim();
  if (!normalized) return 0;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) throw new Error(`Monto invalido en CSV: ${value}`);
  return toMoney(parsed);
}

function parseDecision(value: string | undefined): Decision {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (!normalized) return '';
  if (['PAGO', 'FALLA', 'SNAPSHOT_ONLY', 'IGNORAR', 'REVISAR'].includes(normalized)) {
    return normalized as Decision;
  }
  throw new Error(`decisionManual no soportada: ${value}`);
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(current);
      current = '';
    } else if (char === '\n') {
      row.push(current.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      current = '';
    } else {
      current += char;
    }
  }

  if (current || row.length) {
    row.push(current.replace(/\r$/, ''));
    rows.push(row);
  }

  return rows.filter((item) => item.length > 1 || item[0]);
}

async function readCsvRecoveryRows() {
  const raw = await readFile(CSV_PATH, 'utf8');
  const [headers, ...rows] = parseCsv(raw);
  if (!headers?.length) throw new Error(`CSV vacio: ${CSV_PATH}`);

  const headerIndex = new Map(headers.map((header, index) => [header, index]));
  const get = (row: string[], key: string) => row[headerIndex.get(key) ?? -1] ?? '';
  const requiredHeaders = [
    'control',
    'cliente',
    'creditoId',
    'loanNumber',
    'semana',
    'tiposPosibles',
    'DE',
    'adelantoSaliente',
    'decisionManual',
    'montoPago',
    'montoFalla',
    'montoRecuperado',
    'montoAdelantoEntrante',
    'montoSemanaExtra',
    'observaciones',
  ];

  for (const header of requiredHeaders) {
    if (!headerIndex.has(header)) throw new Error(`Falta columna requerida en CSV: ${header}`);
  }

  return rows.map((row, index): CsvRecoveryRow => {
    const semanaRaw = get(row, 'semana').trim();
    const semana = semanaRaw ? Number(semanaRaw) : null;
    if (semanaRaw && (!Number.isInteger(semana) || Number(semana) <= 0)) {
      throw new Error(`Semana invalida en linea ${index + 2}: ${semanaRaw}`);
    }

    return {
      lineNumber: index + 2,
      control: get(row, 'control').trim(),
      cliente: get(row, 'cliente').trim(),
      creditoId: get(row, 'creditoId').trim(),
      loanNumber: get(row, 'loanNumber').trim(),
      semana,
      tiposPosibles: get(row, 'tiposPosibles').trim(),
      deAmount: parseAmount(get(row, 'DE')),
      outgoingAdvanceAmount: parseAmount(get(row, 'adelantoSaliente')),
      decisionManual: parseDecision(get(row, 'decisionManual')),
      montoPago: parseAmount(get(row, 'montoPago')),
      montoFalla: parseAmount(get(row, 'montoFalla')),
      montoRecuperado: parseAmount(get(row, 'montoRecuperado')),
      montoAdelantoEntrante: parseAmount(get(row, 'montoAdelantoEntrante')),
      montoSemanaExtra: parseAmount(get(row, 'montoSemanaExtra')),
      observaciones: get(row, 'observaciones').trim(),
    };
  });
}

function coerceRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizeRowSnapshot(value: unknown): RowSnapshot | null {
  const record = coerceRecord(value);
  if (!record.creditoId) return null;

  return {
    creditoId: String(record.creditoId),
    scheduleId: record.scheduleId ? String(record.scheduleId) : null,
    extraWeekEventId: record.extraWeekEventId ? String(record.extraWeekEventId) : null,
    recoveryAnchorDefaultEventId: record.recoveryAnchorDefaultEventId
      ? String(record.recoveryAnchorDefaultEventId)
      : null,
    recoveryAnchorScheduleId: record.recoveryAnchorScheduleId ? String(record.recoveryAnchorScheduleId) : null,
    recoveryAnchorInstallmentNumber:
      record.recoveryAnchorInstallmentNumber == null ? null : Number(record.recoveryAnchorInstallmentNumber),
    folio: String(record.folio ?? ''),
    loanNumber: String(record.loanNumber ?? ''),
    controlNumber: record.controlNumber == null ? null : Number(record.controlNumber),
    clienteId: String(record.clienteId ?? ''),
    clienteCode: String(record.clienteCode ?? ''),
    clienteName: String(record.clienteName ?? ''),
    clientePhone: record.clientePhone ? String(record.clientePhone) : null,
    clienteSecondaryPhone: record.clienteSecondaryPhone ? String(record.clienteSecondaryPhone) : null,
    clienteAddress: record.clienteAddress ? String(record.clienteAddress) : null,
    clienteNeighborhood: record.clienteNeighborhood ? String(record.clienteNeighborhood) : null,
    clienteCity: record.clienteCity ? String(record.clienteCity) : null,
    clienteState: record.clienteState ? String(record.clienteState) : null,
    clienteLabel: String(record.clienteLabel ?? ''),
    avalLabel: record.avalLabel ? String(record.avalLabel) : null,
    promotoriaId: String(record.promotoriaId ?? TARGET.promotoriaId),
    promotoriaName: String(record.promotoriaName ?? ''),
    supervisionName: record.supervisionName ? String(record.supervisionName) : null,
    operationalScope:
      record.operationalScope === 'active_with_extra_week' || record.operationalScope === 'overdue'
        ? record.operationalScope
        : 'active',
    operationalWeek: Number(record.operationalWeek ?? 0),
    creditStartDate: record.creditStartDate ? String(record.creditStartDate) : null,
    scheduledDate: record.scheduledDate ? String(record.scheduledDate) : null,
    weeklyAmount: toMoney(record.weeklyAmount as string | number | null | undefined),
    collectibleAmount: toMoney(record.collectibleAmount as string | number | null | undefined),
    deAmount: toMoney(record.deAmount as string | number | null | undefined),
    recoveryAmountAvailable: toMoney(record.recoveryAmountAvailable as string | number | null | undefined),
    advanceAmountAvailable: toMoney(record.advanceAmountAvailable as string | number | null | undefined),
    outgoingAdvanceAmount: toMoney(record.outgoingAdvanceAmount as string | number | null | undefined),
    extraWeekAmount: toMoney(record.extraWeekAmount as string | number | null | undefined),
    rowMode:
      record.rowMode === 'recovery_only' ||
      record.rowMode === 'extra_week_only' ||
      record.rowMode === 'final_closure'
        ? record.rowMode
        : 'regular',
    historicalCurrentPaymentAmount: toMoney(
      record.historicalCurrentPaymentAmount as string | number | null | undefined,
    ),
    historicalFailureAmount: toMoney(record.historicalFailureAmount as string | number | null | undefined),
    historicalRecoveryAmount: toMoney(record.historicalRecoveryAmount as string | number | null | undefined),
    historicalAdvanceIncomingAmount: toMoney(
      record.historicalAdvanceIncomingAmount as string | number | null | undefined,
    ),
    historicalExtraWeekCollectedAmount: toMoney(
      record.historicalExtraWeekCollectedAmount as string | number | null | undefined,
    ),
    installmentNumber: Number(record.installmentNumber ?? 0),
    installmentLabel: String(record.installmentLabel ?? ''),
    deEligible: Boolean(record.deEligible ?? false),
  };
}

function normalizeImpactItem(value: unknown): ImpactItem | null {
  const record = coerceRecord(value);
  if (!record.creditoId) return null;
  const action = record.action === 'FAIL' ? 'FAIL' : 'PAY';
  return {
    creditoId: String(record.creditoId),
    action,
    recoveryAmount: toMoney(record.recoveryAmount as string | number | null | undefined),
    advanceAmount: toMoney(record.advanceAmount as string | number | null | undefined),
    extraWeekAmount: toMoney(record.extraWeekAmount as string | number | null | undefined),
    partialFailureAmount: toMoney(record.partialFailureAmount as string | number | null | undefined),
  };
}

async function loadContext(client: PrismaClient, rows: CsvRecoveryRow[]): Promise<LoadedContext> {
  const entityId = buildEntityId();
  const admin = await assertProductionAdmin(client);
  const actionRows = rows.filter((row) => ['PAGO', 'FALLA', 'SNAPSHOT_ONLY'].includes(row.decisionManual));
  const creditoIds = [...new Set(actionRows.map((row) => row.creditoId).filter(Boolean))];
  const { start, end } = getUtcDayRange(TARGET.occurredAt);

  const [
    impactAudit,
    creditos,
    capturedStatus,
    partialPaymentStatus,
    paidInstallmentStatus,
    partialInstallmentStatus,
    failedInstallmentStatus,
    paymentEventsOnDate,
  ] = await Promise.all([
    client.auditLog.findFirst({
      where: {
        module: 'pagos',
        entity: 'PagoGrupoImpact',
        action: 'CREATE',
        entityId,
      },
      select: { id: true, afterJson: true },
      orderBy: { createdAt: 'desc' },
    }),
    client.credito.findMany({
      where: { id: { in: creditoIds }, promotoriaId: TARGET.promotoriaId },
      include: creditInclude,
    }),
    client.paymentStatusCatalog.findUnique({ where: { code: 'CAPTURED' }, select: { id: true } }),
    client.paymentStatusCatalog.findUnique({ where: { code: 'PARTIAL' }, select: { id: true } }),
    client.installmentStatusCatalog.findUnique({ where: { code: 'PAID' }, select: { id: true } }),
    client.installmentStatusCatalog.findUnique({ where: { code: 'PARTIAL' }, select: { id: true } }),
    client.installmentStatusCatalog.findUnique({ where: { code: 'FAILED' }, select: { id: true } }),
    client.paymentEvent.findMany({
      where: {
        creditoId: { in: creditoIds },
        receivedAt: { gte: start, lt: end },
        isReversed: false,
      },
      select: {
        id: true,
        creditoId: true,
        allocations: { select: { id: true, scheduleId: true, allocationType: true, paymentEventId: true } },
      },
    }),
  ]);

  if (!impactAudit) throw new Error(`No existe PagoGrupoImpact para ${entityId}.`);
  if (!capturedStatus || !partialPaymentStatus) {
    throw new Error('Faltan estados CAPTURED/PARTIAL en PaymentStatusCatalog.');
  }
  if (!paidInstallmentStatus || !partialInstallmentStatus || !failedInstallmentStatus) {
    throw new Error('Faltan estados PAID/PARTIAL/FAILED en InstallmentStatusCatalog.');
  }

  const payload = coerceRecord(impactAudit.afterJson) as ImpactPayload;
  const currentRowsSnapshot = Array.isArray(payload.rowsSnapshot)
    ? payload.rowsSnapshot.map(normalizeRowSnapshot).filter((row): row is RowSnapshot => Boolean(row))
    : [];
  const currentItems = Array.isArray(payload.items)
    ? payload.items.map(normalizeImpactItem).filter((item): item is ImpactItem => Boolean(item))
    : [];
  const creditsById = new Map(creditos.map((credito) => [credito.id, credito]));
  const scheduleIds = [
    ...new Set(
      actionRows
        .map((row) => {
          const credito = creditsById.get(row.creditoId);
          return credito?.schedules.find((schedule) => schedule.installmentNumber === row.semana)?.id ?? null;
        })
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const defaultEvents = scheduleIds.length
    ? await client.defaultEvent.findMany({
        where: { scheduleId: { in: scheduleIds } },
        select: { id: true, scheduleId: true },
      })
    : [];

  const paymentEventsOnDateByCreditId = new Map<string, Array<{ id: string }>>();
  const currentAllocationsByScheduleId = new Map<string, Array<{ id: string; paymentEventId: string }>>();
  for (const payment of paymentEventsOnDate) {
    const payments = paymentEventsOnDateByCreditId.get(payment.creditoId) ?? [];
    payments.push({ id: payment.id });
    paymentEventsOnDateByCreditId.set(payment.creditoId, payments);

    for (const allocation of payment.allocations) {
      if (allocation.allocationType !== 'CURRENT' || !allocation.scheduleId) continue;
      const allocations = currentAllocationsByScheduleId.get(allocation.scheduleId) ?? [];
      allocations.push({ id: allocation.id, paymentEventId: allocation.paymentEventId });
      currentAllocationsByScheduleId.set(allocation.scheduleId, allocations);
    }
  }

  const defaultEventsByScheduleId = new Map<string, Array<{ id: string }>>();
  for (const event of defaultEvents) {
    const events = defaultEventsByScheduleId.get(event.scheduleId) ?? [];
    events.push({ id: event.id });
    defaultEventsByScheduleId.set(event.scheduleId, events);
  }

  return {
    entityId,
    adminUserId: admin.id,
    impactAudit,
    payload,
    currentRowsSnapshot,
    currentItems,
    creditsById,
    paymentStatusCapturedId: capturedStatus.id,
    paymentStatusPartialId: partialPaymentStatus.id,
    installmentStatusPaidId: paidInstallmentStatus.id,
    installmentStatusPartialId: partialInstallmentStatus.id,
    installmentStatusFailedId: failedInstallmentStatus.id,
    paymentEventsOnDateByCreditId,
    currentAllocationsByScheduleId,
    defaultEventsByScheduleId,
  };
}

function buildSnapshot(input: {
  csv: CsvRecoveryRow;
  decision: ActionDecision;
  credito: LoadedCredit;
  schedule: LoadedSchedule;
}): RowSnapshot {
  const { csv, decision, credito, schedule } = input;
  const isPayment = decision === 'PAGO';
  const isFailure = decision === 'FALLA';
  const deAmount = toMoney(csv.deAmount);
  const currentPaymentAmount = isPayment ? toMoney(csv.montoPago) : 0;
  const failureAmount = isFailure ? toMoney(csv.montoFalla) : 0;
  const collectibleAmount = isPayment || isFailure ? toMoney(isPayment ? csv.montoPago : csv.montoFalla) : 0;

  return {
    creditoId: credito.id,
    scheduleId: schedule.id,
    extraWeekEventId: null,
    recoveryAnchorDefaultEventId: null,
    recoveryAnchorScheduleId: null,
    recoveryAnchorInstallmentNumber: null,
    folio: credito.folio,
    loanNumber: credito.loanNumber,
    controlNumber: credito.controlNumber,
    clienteId: credito.cliente.id,
    clienteCode: credito.cliente.code,
    clienteName: credito.cliente.fullName,
    clientePhone: credito.cliente.phone,
    clienteSecondaryPhone: credito.cliente.secondaryPhone,
    clienteAddress: credito.cliente.address,
    clienteNeighborhood: credito.cliente.neighborhood,
    clienteCity: credito.cliente.city,
    clienteState: credito.cliente.state,
    clienteLabel: `${credito.cliente.code} · ${credito.cliente.fullName}`,
    avalLabel: credito.aval ? `${credito.aval.code} · ${credito.aval.fullName}` : null,
    promotoriaId: credito.promotoria.id,
    promotoriaName: credito.promotoria.name,
    supervisionName: credito.promotoria.supervision?.name ?? null,
    operationalScope: 'active',
    operationalWeek: csv.semana ?? schedule.installmentNumber,
    creditStartDate: toDateKey(credito.startDate),
    scheduledDate: toDateKey(schedule.dueDate),
    weeklyAmount: toMoney(credito.weeklyAmount),
    collectibleAmount,
    deAmount,
    recoveryAmountAvailable: 0,
    advanceAmountAvailable: 0,
    outgoingAdvanceAmount: toMoney(csv.outgoingAdvanceAmount),
    extraWeekAmount: 0,
    rowMode: 'regular',
    historicalCurrentPaymentAmount: currentPaymentAmount,
    historicalFailureAmount: failureAmount,
    historicalRecoveryAmount: 0,
    historicalAdvanceIncomingAmount: 0,
    historicalExtraWeekCollectedAmount: 0,
    installmentNumber: csv.semana ?? schedule.installmentNumber,
    installmentLabel: `Semana ${csv.semana ?? schedule.installmentNumber}`,
    deEligible: deAmount > 0.001,
  };
}

function buildImpactItem(csv: CsvRecoveryRow, decision: ActionDecision): ImpactItem {
  if (decision === 'FALLA') {
    return {
      creditoId: csv.creditoId,
      action: 'FAIL',
      recoveryAmount: 0,
      advanceAmount: 0,
      extraWeekAmount: 0,
      partialFailureAmount: Math.max(0, toMoney(csv.deAmount - csv.montoFalla)),
    };
  }

  return {
    creditoId: csv.creditoId,
    action: 'PAY',
    recoveryAmount: 0,
    advanceAmount: 0,
    extraWeekAmount: 0,
    partialFailureAmount: 0,
  };
}

function buildPlan(rows: CsvRecoveryRow[], context: LoadedContext) {
  const currentSnapshotByCreditId = new Map(context.currentRowsSnapshot.map((row) => [row.creditoId, row]));
  const seenActionKeys = new Set<string>();
  const plan: RecoveryPlanItem[] = [];

  for (const csv of rows) {
    const decision = ['PAGO', 'FALLA', 'SNAPSHOT_ONLY'].includes(csv.decisionManual)
      ? (csv.decisionManual as ActionDecision)
      : null;

    if (!decision) {
      plan.push({
        csv,
        decision,
        status: 'IGNORED',
        reason: `Decision ignorada: ${csv.decisionManual || 'vacia'}.`,
        credito: null,
        schedule: null,
        existingSnapshot: null,
        snapshot: null,
        item: null,
        duplicateRisk: false,
      });
      continue;
    }

    const issues: string[] = [];
    const credito = context.creditsById.get(csv.creditoId) ?? null;
    const schedule = credito?.schedules.find((item) => item.installmentNumber === csv.semana) ?? null;
    const existingSnapshot = currentSnapshotByCreditId.get(csv.creditoId) ?? null;
    const actionKey = `${csv.creditoId}|${csv.semana ?? 'sin-semana'}|${decision}|${TARGET.occurredAt}`;

    if (seenActionKeys.has(actionKey)) {
      issues.push('El CSV contiene una decision duplicada para el mismo credito, semana, decision y fecha.');
    }
    seenActionKeys.add(actionKey);

    if (!credito) issues.push('No existe el credito en la promotoria objetivo.');
    if (!csv.semana) issues.push('La fila no tiene semana valida.');
    if (credito && !schedule) issues.push('No existe CreditSchedule para creditoId + semana del CSV.');
    if (csv.montoRecuperado > 0 || csv.montoAdelantoEntrante > 0 || csv.montoSemanaExtra > 0) {
      issues.push('La fila tiene montos de recuperado, adelanto entrante o semana extra; este script no toca esas entidades.');
    }
    if (decision === 'PAGO' && csv.montoPago <= 0) issues.push('PAGO requiere montoPago mayor a cero.');
    if (decision === 'FALLA' && csv.montoFalla <= 0) issues.push('FALLA requiere montoFalla mayor a cero.');
    if (decision === 'SNAPSHOT_ONLY' && (csv.montoPago > 0 || csv.montoFalla > 0)) {
      issues.push('SNAPSHOT_ONLY no debe traer montoPago ni montoFalla.');
    }

    if (schedule && decision === 'PAGO') {
      const sameDayPayments = context.paymentEventsOnDateByCreditId.get(csv.creditoId) ?? [];
      const sameScheduleAllocations = context.currentAllocationsByScheduleId.get(schedule.id) ?? [];
      const pendingAmount = toMoney(Number(schedule.expectedAmount) - Number(schedule.paidAmount));

      if (sameScheduleAllocations.length > 0) {
        issues.push('Ya existe PaymentAllocation CURRENT para creditoId + semana + fecha.');
      }
      if (sameDayPayments.length > 0) {
        issues.push('Ya existe PaymentEvent para creditoId + fecha.');
      }
      if (csv.montoPago > pendingAmount + 0.001) {
        issues.push(`montoPago excede saldo pendiente de la semana (${pendingAmount.toFixed(2)}).`);
      }
    }

    if (schedule && decision === 'FALLA') {
      const defaults = context.defaultEventsByScheduleId.get(schedule.id) ?? [];
      const pendingAmount = toMoney(Number(schedule.expectedAmount) - Number(schedule.paidAmount));
      if (defaults.length > 0) {
        issues.push('Ya existe DefaultEvent para creditoId + semana.');
      }
      if (csv.montoFalla > pendingAmount + 0.001) {
        issues.push(`montoFalla excede saldo pendiente de la semana (${pendingAmount.toFixed(2)}).`);
      }
    }

    const snapshot = credito && schedule ? buildSnapshot({ csv, decision, credito, schedule }) : null;
    const item = buildImpactItem(csv, decision);

    if (existingSnapshot) {
      const alreadyApplied =
        (decision === 'PAGO' &&
          amountEquals(existingSnapshot.historicalCurrentPaymentAmount, csv.montoPago)) ||
        (decision === 'FALLA' && amountEquals(existingSnapshot.historicalFailureAmount, csv.montoFalla)) ||
        (decision === 'SNAPSHOT_ONLY' &&
          amountEquals(existingSnapshot.outgoingAdvanceAmount, csv.outgoingAdvanceAmount));

      plan.push({
        csv,
        decision,
        status: alreadyApplied ? 'ALREADY_APPLIED' : 'UNSAFE',
        reason: alreadyApplied
          ? 'La fila ya existe en rowsSnapshot con importes compatibles.'
          : 'Ya existe rowsSnapshot para el credito, pero no coincide con la decision del CSV.',
        credito,
        schedule,
        existingSnapshot,
        snapshot,
        item,
        duplicateRisk: !alreadyApplied,
      });
      continue;
    }

    if (issues.length) {
      plan.push({
        csv,
        decision,
        status: 'UNSAFE',
        reason: issues.join(' '),
        credito,
        schedule,
        existingSnapshot,
        snapshot,
        item,
        duplicateRisk: true,
      });
      continue;
    }

    plan.push({
      csv,
      decision,
      status: decision === 'SNAPSHOT_ONLY' ? 'SNAPSHOT_ONLY' : 'CREATE',
      reason:
        decision === 'SNAPSHOT_ONLY'
          ? 'Solo se agregara al rowsSnapshot historico; no crea eventos financieros.'
          : 'Fila lista para escritura protegida desde CSV manual.',
      credito,
      schedule,
      existingSnapshot,
      snapshot,
      item,
      duplicateRisk: false,
    });
  }

  return plan;
}

function calculateTotals(rows: RowSnapshot[], previousLiquidation: Record<string, unknown> | undefined): Totals {
  const deAmount = toMoney(rows.reduce((sum, row) => sum + row.deAmount, 0));
  const failureAmount = toMoney(rows.reduce((sum, row) => sum + row.historicalFailureAmount, 0));
  const recoveryAmount = toMoney(rows.reduce((sum, row) => sum + row.historicalRecoveryAmount, 0));
  const incomingAdvanceAmount = toMoney(rows.reduce((sum, row) => sum + row.historicalAdvanceIncomingAmount, 0));
  const outgoingAdvanceAmount = toMoney(rows.reduce((sum, row) => sum + row.outgoingAdvanceAmount, 0));
  const extraWeekAmount = toMoney(rows.reduce((sum, row) => sum + row.historicalExtraWeekCollectedAmount, 0));
  const subtotalAmount = toMoney(deAmount - failureAmount + recoveryAmount);
  const totalToDeliver = toMoney(subtotalAmount + incomingAdvanceAmount - outgoingAdvanceAmount + extraWeekAmount);
  const saleAmount = toMoney(previousLiquidation?.saleAmount as string | number | null | undefined);
  const bonusAmount = toMoney(previousLiquidation?.bonusAmount as string | number | null | undefined);
  const commissionBase =
    previousLiquidation?.commissionBase === 'TOTAL_TO_DELIVER' ? 'TOTAL_TO_DELIVER' : 'SALE';
  const commissionRate = toMoney(previousLiquidation?.commissionRate as string | number | null | undefined);
  const commissionBaseAmount = commissionBase === 'SALE' ? saleAmount : subtotalAmount;
  const commissionAmount = toMoney((commissionBaseAmount * commissionRate) / 100);
  const finalCashAmount = toMoney(totalToDeliver - saleAmount - commissionAmount - bonusAmount);

  return {
    deAmount,
    failureAmount,
    recoveryAmount,
    subtotalAmount,
    incomingAdvanceAmount,
    outgoingAdvanceAmount,
    extraWeekAmount,
    total: subtotalAmount,
    totalToDeliver,
    saleAmount,
    bonusAmount,
    commissionBase,
    commissionRate,
    commissionBaseAmount,
    commissionAmount,
    finalCashAmount,
    finalCashLabel: finalCashAmount < 0 ? 'Inversion' : 'Fondo para la siguiente semana',
  };
}

function buildUpdatedPayload(context: LoadedContext, plan: RecoveryPlanItem[]) {
  const rowsByCreditId = new Map(context.currentRowsSnapshot.map((row) => [row.creditoId, row]));
  for (const item of plan) {
    if ((item.status === 'CREATE' || item.status === 'SNAPSHOT_ONLY') && item.snapshot) {
      rowsByCreditId.set(item.snapshot.creditoId, item.snapshot);
    }
  }

  const updatedRowsSnapshot = [...rowsByCreditId.values()].sort((left, right) => {
    const controlDelta = (left.controlNumber ?? 0) - (right.controlNumber ?? 0);
    if (controlDelta !== 0) return controlDelta;
    return left.loanNumber.localeCompare(right.loanNumber);
  });
  const itemsByCreditId = new Map(context.currentItems.map((item) => [item.creditoId, item]));
  for (const planItem of plan) {
    if ((planItem.status === 'CREATE' || planItem.status === 'SNAPSHOT_ONLY') && planItem.item) {
      itemsByCreditId.set(planItem.item.creditoId, planItem.item);
    }
  }

  const previousLiquidation = coerceRecord(context.payload.liquidation);
  const totals = calculateTotals(updatedRowsSnapshot, previousLiquidation);
  const paidCount = updatedRowsSnapshot.filter(
    (row) =>
      row.historicalCurrentPaymentAmount > 0.001 ||
      row.historicalRecoveryAmount > 0.001 ||
      row.historicalAdvanceIncomingAmount > 0.001 ||
      row.historicalExtraWeekCollectedAmount > 0.001,
  ).length;
  const failedCount = updatedRowsSnapshot.filter((row) => row.historicalFailureAmount > 0.001).length;

  const updatedPayload: ImpactPayload = {
    ...context.payload,
    groupExecutionKey: context.entityId,
    promotoriaId: TARGET.promotoriaId,
    occurredAt: TARGET.occurredAt,
    scope: TARGET.scope,
    recoveryAppliedFromCsv: {
      source: 'apply-partial-pago-grupo-recovery',
      csvPath: CSV_PATH,
      dryRunDefault: true,
      processedAt: new Date().toISOString(),
      processedRows: plan.filter((item) => item.status === 'CREATE' || item.status === 'SNAPSHOT_ONLY').length,
    },
    paidCount,
    failedCount,
    skippedPayments: Number(context.payload.skippedPayments ?? 0),
    skippedFailures: Number(context.payload.skippedFailures ?? 0),
    groupCount: updatedRowsSnapshot.length,
    rowCount: updatedRowsSnapshot.length,
    expectedCount: updatedRowsSnapshot.length,
    items: [...itemsByCreditId.values()],
    rowsSnapshot: updatedRowsSnapshot,
    liquidation: {
      ...previousLiquidation,
      deAmount: totals.deAmount,
      failureAmount: totals.failureAmount,
      recoveryAmount: totals.recoveryAmount,
      subtotalAmount: totals.subtotalAmount,
      incomingAdvanceAmount: totals.incomingAdvanceAmount,
      outgoingAdvanceAmount: totals.outgoingAdvanceAmount,
      extraWeekAmount: totals.extraWeekAmount,
      total: totals.total,
      totalToDeliver: totals.totalToDeliver,
      saleAmount: totals.saleAmount,
      bonusAmount: totals.bonusAmount,
      commissionBase: totals.commissionBase,
      commissionRate: totals.commissionRate,
      commissionBaseAmount: totals.commissionBaseAmount,
      commissionAmount: totals.commissionAmount,
      finalCashAmount: totals.finalCashAmount,
      finalCashLabel: totals.finalCashLabel,
    },
  };

  return {
    updatedPayload,
    previousTotals: calculateTotals(context.currentRowsSnapshot, previousLiquidation),
    newTotals: totals,
    updatedRowsSnapshot,
  };
}

function printPlanSummary(input: {
  mode: 'DRY_RUN' | 'REAL';
  rows: CsvRecoveryRow[];
  plan: RecoveryPlanItem[];
  previousTotals: Totals;
  newTotals: Totals;
  updatedRowsSnapshot: RowSnapshot[];
}) {
  const processedRows = input.plan.filter((item) => item.status === 'CREATE' || item.status === 'SNAPSHOT_ONLY');
  const unsafeRows = input.plan.filter((item) => item.status === 'UNSAFE');
  const ignoredRows = input.plan.filter((item) => item.status === 'IGNORED');
  const alreadyAppliedRows = input.plan.filter((item) => item.status === 'ALREADY_APPLIED');
  const paymentsToCreate = processedRows.filter((item) => item.decision === 'PAGO');
  const failuresToCreate = processedRows.filter((item) => item.decision === 'FALLA');
  const snapshotOnlyRows = processedRows.filter((item) => item.decision === 'SNAPSHOT_ONLY');

  console.log('\nAplicacion de recuperacion parcial PagoGrupoImpact');
  console.table([
    {
      mode: input.mode,
      csvPath: CSV_PATH,
      promotoriaId: TARGET.promotoriaId,
      occurredAt: TARGET.occurredAt,
      scope: TARGET.scope,
      entityId: buildEntityId(),
    },
  ]);

  console.log('\nResumen de filas');
  console.table([
    {
      csvRows: input.rows.length,
      filasProcesadas: processedRows.length,
      pagosCreados: input.mode === 'REAL' ? paymentsToCreate.length : 0,
      pagosPorCrear: paymentsToCreate.length,
      fallasCreadas: input.mode === 'REAL' ? failuresToCreate.length : 0,
      fallasPorCrear: failuresToCreate.length,
      snapshotRowsAgregadas: snapshotOnlyRows.length,
      yaAplicadas: alreadyAppliedRows.length,
      ignoradas: ignoredRows.length,
      inseguras: unsafeRows.length,
      rowsSnapshotNuevo: input.updatedRowsSnapshot.length,
    },
  ]);

  console.log('\nTotals anteriores vs nuevos');
  console.table([
    { label: 'Anterior', ...input.previousTotals },
    { label: 'Nuevo', ...input.newTotals },
  ]);

  console.log('\nDetalle de filas procesables');
  console.table(
    processedRows.map((item) => ({
      status: item.status,
      decision: item.decision,
      control: item.csv.control,
      cliente: item.csv.cliente,
      creditoId: item.csv.creditoId,
      loanNumber: item.csv.loanNumber,
      semana: item.csv.semana,
      montoPago: item.csv.montoPago,
      montoFalla: item.csv.montoFalla,
      deAmount: item.csv.deAmount,
      adelantoSaliente: item.csv.outgoingAdvanceAmount,
      motivo: item.reason,
    })),
  );

  if (unsafeRows.length) {
    console.log('\nFilas inseguras - no se debe ejecutar modo real hasta resolverlas');
    console.table(
      unsafeRows.map((item) => ({
        line: item.csv.lineNumber,
        decision: item.decision,
        control: item.csv.control,
        creditoId: item.csv.creditoId,
        loanNumber: item.csv.loanNumber,
        semana: item.csv.semana,
        motivo: item.reason,
      })),
    );
  }
}

async function applyRecovery(input: {
  client: PrismaClient;
  context: LoadedContext;
  plan: RecoveryPlanItem[];
  updatedPayload: ImpactPayload;
}) {
  const { start, end } = getUtcDayRange(TARGET.occurredAt);
  const paymentRows = input.plan.filter(
    (item): item is RecoveryPlanItem & { decision: 'PAGO'; credito: LoadedCredit; schedule: LoadedSchedule } =>
      item.status === 'CREATE' && item.decision === 'PAGO' && Boolean(item.credito && item.schedule),
  );
  const failureRows = input.plan.filter(
    (item): item is RecoveryPlanItem & { decision: 'FALLA'; credito: LoadedCredit; schedule: LoadedSchedule } =>
      item.status === 'CREATE' && item.decision === 'FALLA' && Boolean(item.credito && item.schedule),
  );

  await input.client.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`partial-recovery:${input.context.entityId}`}))`;

    for (const item of paymentRows) {
      const existingPayment = await tx.paymentEvent.findFirst({
        where: {
          creditoId: item.csv.creditoId,
          receivedAt: { gte: start, lt: end },
          isReversed: false,
        },
        select: { id: true },
      });
      if (existingPayment) {
        throw new Error(`Duplicado detectado antes de crear PaymentEvent para ${item.csv.creditoId}.`);
      }

      const existingCurrentAllocation = await tx.paymentAllocation.findFirst({
        where: {
          scheduleId: item.schedule.id,
          allocationType: 'CURRENT',
          paymentEvent: {
            creditoId: item.csv.creditoId,
            receivedAt: { gte: start, lt: end },
            isReversed: false,
          },
        },
        select: { id: true },
      });
      if (existingCurrentAllocation) {
        throw new Error(`Duplicado CURRENT detectado para schedule ${item.schedule.id}.`);
      }

      const currentPaidAmount = toMoney(item.schedule.paidAmount);
      const expectedAmount = toMoney(item.schedule.expectedAmount);
      const newPaidAmount = toMoney(currentPaidAmount + item.csv.montoPago);
      if (newPaidAmount > expectedAmount + 0.001) {
        throw new Error(`montoPago excede el saldo de schedule ${item.schedule.id}.`);
      }

      const paymentEvent = await tx.paymentEvent.create({
        data: {
          creditoId: item.csv.creditoId,
          paymentStatusId:
            newPaidAmount >= expectedAmount - 0.001
              ? input.context.paymentStatusCapturedId
              : input.context.paymentStatusPartialId,
          receivedAt: start,
          amountReceived: item.csv.montoPago.toFixed(2),
          notes: buildRecoveryNote(item.csv),
          capturedByUserId: input.context.adminUserId,
        },
      });

      await tx.paymentAllocation.create({
        data: {
          paymentEventId: paymentEvent.id,
          allocationType: 'CURRENT',
          amount: item.csv.montoPago.toFixed(2),
          scheduleId: item.schedule.id,
          notes: buildRecoveryNote(item.csv),
        },
      });

      await tx.creditSchedule.update({
        where: { id: item.schedule.id },
        data: {
          paidAmount: newPaidAmount.toFixed(2),
          installmentStatusId:
            newPaidAmount >= expectedAmount - 0.001
              ? input.context.installmentStatusPaidId
              : input.context.installmentStatusPartialId,
        },
      });
    }

    for (const item of failureRows) {
      const existingDefault = await tx.defaultEvent.findUnique({
        where: { scheduleId: item.schedule.id },
        select: { id: true },
      });
      if (existingDefault) {
        throw new Error(`Duplicado DefaultEvent detectado para schedule ${item.schedule.id}.`);
      }

      const pendingAmount = toMoney(Number(item.schedule.expectedAmount) - Number(item.schedule.paidAmount));
      if (item.csv.montoFalla > pendingAmount + 0.001) {
        throw new Error(`montoFalla excede el saldo de schedule ${item.schedule.id}.`);
      }

      await tx.defaultEvent.create({
        data: {
          creditoId: item.csv.creditoId,
          scheduleId: item.schedule.id,
          amountMissed: item.csv.montoFalla.toFixed(2),
          notes: buildRecoveryNote(item.csv),
          createdByUserId: input.context.adminUserId,
          createdAt: start,
        },
      });

      await tx.creditSchedule.update({
        where: { id: item.schedule.id },
        data: {
          installmentStatusId: input.context.installmentStatusFailedId,
        },
      });
    }

    await tx.auditLog.update({
      where: { id: input.context.impactAudit.id },
      data: {
        afterJson: input.updatedPayload as Prisma.InputJsonObject,
      },
    });
  }, TRANSACTION_OPTIONS);
}

function buildRecoveryNote(csv: CsvRecoveryRow) {
  return [
    `Recuperacion manual de cierre parcial ${buildEntityId()}`,
    `CSV linea ${csv.lineNumber}`,
    csv.observaciones,
  ]
    .filter(Boolean)
    .join(' | ');
}

async function main() {
  const mode = process.env[APPLY_CONFIRMATION] === 'YES' ? 'REAL' : 'DRY_RUN';
  const csvRows = await readCsvRecoveryRows();
  const client = createProductionClient();

  try {
    const context = await loadContext(client, csvRows);
    const plan = buildPlan(csvRows, context);
    const unsafeRows = plan.filter((item) => item.status === 'UNSAFE');
    const { updatedPayload, previousTotals, newTotals, updatedRowsSnapshot } = buildUpdatedPayload(context, plan);

    printPlanSummary({
      mode,
      rows: csvRows,
      plan,
      previousTotals,
      newTotals,
      updatedRowsSnapshot,
    });

    if (unsafeRows.length) {
      throw new Error('Hay filas inseguras. No se aplico ningun cambio.');
    }

    if (mode === 'DRY_RUN') {
      console.log(`\nDRY-RUN: escrituras realizadas 0. Para aplicar: ${APPLY_CONFIRMATION}=YES`);
      return;
    }

    await applyRecovery({
      client,
      context,
      plan,
      updatedPayload,
    });

    console.log('\nAplicacion real completada.');
  } finally {
    await client.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
