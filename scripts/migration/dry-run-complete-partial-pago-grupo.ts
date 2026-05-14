import { Prisma, type PrismaClient } from '@prisma/client';
import {
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
const TARGET_SCOPE: CollectionScope = TARGET.scope;

type CollectionScope = 'active' | 'active_with_extra_week' | 'overdue' | 'all';
type OperationalScope = 'active' | 'active_with_extra_week' | 'overdue';
type RowMode = 'regular' | 'recovery_only' | 'extra_week_only' | 'final_closure';
type MissingRowType =
  | 'pago normal'
  | 'falla'
  | 'recuperado'
  | 'adelanto entrante'
  | 'adelanto saliente'
  | 'semana extra';

type CreditStatusRow = {
  id: string;
  code: string;
};

type InstallmentStatusRow = {
  id: string;
  code: string;
};

type GrupoRow = {
  id: string;
  name: string;
  zoneId: string | null;
};

type ZoneRow = {
  id: string;
  name: string;
};

type ClienteRow = {
  id: string;
  code: string;
  fullName: string;
  phone: string | null;
  secondaryPhone: string | null;
  address: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
};

type CreditoRow = {
  id: string;
  folio: string;
  loanNumber: string;
  controlNumber: number | null;
  clienteId: string;
  avalClienteId: string | null;
  grupoId: string;
  startDate: Date;
  weeklyAmount: Prisma.Decimal;
  creditStatusId: string;
  cancelledAt: Date | null;
  legalStatus: string;
  createdAt: Date;
};

type CreditScheduleRow = {
  id: string;
  creditoId: string;
  installmentNumber: number;
  dueDate: Date;
  expectedAmount: Prisma.Decimal;
  installmentStatusId: string;
};

type PaymentEventRow = {
  id: string;
  creditoId: string;
  receivedAt: Date;
  amountReceived: Prisma.Decimal;
  isReversed: boolean;
  createdAt: Date;
};

type PaymentAllocationRow = {
  id: string;
  paymentEventId: string;
  allocationType: string;
  amount: Prisma.Decimal;
  scheduleId: string | null;
  defaultEventId: string | null;
  extraWeekEventId: string | null;
  createdAt: Date;
};

type DefaultEventRow = {
  id: string;
  creditoId: string;
  scheduleId: string;
  amountMissed: Prisma.Decimal;
  createdAt: Date;
};

type RecoveryEventRow = {
  id: string;
  creditoId: string;
  paymentEventId: string;
  defaultEventId: string;
  recoveredAmount: Prisma.Decimal;
  createdAt: Date;
};

type AdvanceEventRow = {
  id: string;
  creditoId: string;
  paymentEventId: string;
  recordedOnInstallmentId: string;
  coversInstallmentId: string;
  amount: Prisma.Decimal;
  createdAt: Date;
};

type ExtraWeekEventRow = {
  id: string;
  creditoId: string;
  dueDate: Date;
  expectedAmount: Prisma.Decimal;
  status: string;
  createdAt: Date;
};

type FinancialReversalRow = {
  id: string;
  creditoId: string;
  sourceType: string;
  sourceId: string;
  reversedAt: Date;
};

type AuditLogRow = {
  id: string;
  entity: string;
  entityId: string;
  action: string;
  createdAt: Date;
  afterJson: unknown | null;
};

type ExpectedRow = {
  creditoId: string;
  scheduleId: string | null;
  extraWeekEventId: string | null;
  recoveryAnchorDefaultEventId: string | null;
  recoveryAnchorScheduleId: string | null;
  recoveryAnchorInstallmentNumber: number | null;
  folio: string;
  loanNumber: string;
  controlNumber: number | null;
  clienteName: string;
  clienteLabel: string;
  avalLabel: string | null;
  operationalScope: OperationalScope;
  rowMode: RowMode;
  operationalWeek: number;
  creditStartDate: string;
  scheduledDate: string | null;
  installmentNumber: number;
  deAmount: number;
  collectibleAmount: number;
  recoveryAmountAvailable: number;
  advanceAmountAvailable: number;
  outgoingAdvanceAmount: number;
  extraWeekAmount: number;
};

type MissingRow = ExpectedRow & {
  types: MissingRowType[];
  canImpactAutomatically: boolean;
  requiresManualDecision: boolean;
  manualReason: string;
  idempotency: {
    hasCurrentPaymentAllocation: boolean;
    hasDefaultEvent: boolean;
    hasRecoveryEvent: boolean;
    hasAdvanceEvent: boolean;
    hasExtraWeekAllocation: boolean;
    hasAnyPaymentAllocationOnDate: boolean;
    safeToCreateWithoutDuplicate: boolean;
  };
};

const EXCLUDED_LEGAL_STATUSES = new Set(['IN_LAWSUIT', 'LEGAL_CLOSED']);
const ACTIVE_CREDIT_STATUSES = new Set(['ACTIVE', 'COMPLETED']);

function buildEntityId(target: typeof TARGET) {
  return [target.promotoriaId, target.occurredAt, target.scope].join('|');
}

function createProductionClient() {
  const productionUrl = getRequiredEnv('PROD_DATABASE_URL');
  assertSupabaseDatabase(productionUrl);
  console.log(`PROD_DATABASE_URL: ${redactDatabaseUrl(productionUrl)}`);
  return createClient(productionUrl);
}

function toDateKey(dateInput: Date | string) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Mazatlan',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getOperationalWeek(startDateKey: string, todayKey: string) {
  const start = new Date(`${startDateKey}T12:00:00`);
  const today = new Date(`${todayKey}T12:00:00`);
  const diffInDays = Math.max(0, Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  return Math.floor(diffInDays / 7) + 1;
}

function toMoney(value: Prisma.Decimal | string | number | null | undefined) {
  return Number(Number(value ?? 0).toFixed(2));
}

function sumMoney<T>(rows: T[], pick: (row: T) => Prisma.Decimal | string | number | null | undefined) {
  return toMoney(rows.reduce((sum, row) => sum + Number(pick(row) ?? 0), 0));
}

function groupBy<T>(rows: T[], keyFn: (row: T) => string | null | undefined) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    const current = grouped.get(key) ?? [];
    current.push(row);
    grouped.set(key, current);
  }
  return grouped;
}

function resolveOperationalRowMode(input: {
  rowMode?: RowMode | null;
  collectibleAmount: number;
  deAmount: number;
  recoveryAmountAvailable: number;
  extraWeekAmount: number;
}) {
  if (input.rowMode && input.rowMode !== 'regular') return input.rowMode;
  if (input.collectibleAmount > 0.001 || input.deAmount > 0.001) return input.rowMode ?? 'regular';
  if (input.recoveryAmountAvailable > 0.001 && input.extraWeekAmount > 0.001) return 'final_closure';
  if (input.recoveryAmountAvailable > 0.001) return 'recovery_only';
  if (input.extraWeekAmount > 0.001) return 'extra_week_only';
  return input.rowMode ?? 'regular';
}

function summarizeRows(rows: ExpectedRow[]) {
  const deAmount = sumMoney(rows, (row) => row.deAmount);
  const failureCandidateAmount = sumMoney(rows.filter((row) => row.collectibleAmount > 0.001), (row) => row.collectibleAmount);
  const recoveryAmount = sumMoney(rows, (row) => row.recoveryAmountAvailable);
  const advanceIncomingAmount = sumMoney(rows, (row) => row.advanceAmountAvailable);
  const advanceOutgoingAmount = sumMoney(rows, (row) => row.outgoingAdvanceAmount);
  const extraWeekAmount = sumMoney(rows, (row) => row.extraWeekAmount);

  return {
    rows: rows.length,
    deAmount,
    failureCandidateAmount,
    recoveryAmount,
    advanceIncomingAmount,
    advanceOutgoingAmount,
    extraWeekAmount,
    baseTotalToDeliver: toMoney(deAmount - advanceOutgoingAmount),
  };
}

function getJsonRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

async function query<T>(client: PrismaClient, sql: Prisma.Sql) {
  return client.$queryRaw<T[]>(sql);
}

async function queryByIds<T>(client: PrismaClient, tableSql: Prisma.Sql, column: string, ids: string[], selectSql: Prisma.Sql) {
  if (!ids.length) return [];
  return query<T>(
    client,
    Prisma.sql`${selectSql} from ${tableSql} where ${Prisma.raw(`"${column}"`)} in (${Prisma.join(ids)})`,
  );
}

async function loadReadOnlyData(client: PrismaClient) {
  const entityId = buildEntityId(TARGET);
  const [
    creditStatuses,
    installmentStatuses,
    grupos,
    zones,
    impactAudits,
    liquidationAudits,
  ] = await Promise.all([
    query<CreditStatusRow>(client, Prisma.sql`select "id", "code" from "CreditStatusCatalog"`),
    query<InstallmentStatusRow>(client, Prisma.sql`select "id", "code" from "InstallmentStatusCatalog"`),
    query<GrupoRow>(
      client,
      Prisma.sql`select "id", "name", "zoneId" from "Grupo" where "id" = ${TARGET.promotoriaId}`,
    ),
    query<ZoneRow>(client, Prisma.sql`select "id", "name" from "Zone"`),
    query<AuditLogRow>(
      client,
      Prisma.sql`
        select "id", "entity", "entityId", "action", "createdAt", "afterJson"
        from "AuditLog"
        where "module" = 'pagos'
          and "entity" = 'PagoGrupoImpact'
          and "entityId" = ${entityId}
        order by "createdAt" desc
      `,
    ),
    query<AuditLogRow>(
      client,
      Prisma.sql`
        select "id", "entity", "entityId", "action", "createdAt", "afterJson"
        from "AuditLog"
        where "module" = 'pagos'
          and "entity" = 'PagoGrupoLiquidacion'
          and "entityId" = ${entityId}
        order by "createdAt" desc
      `,
    ),
  ]);

  const creditStatusById = new Map(creditStatuses.map((status) => [status.id, status.code]));
  const creditos = (
    await query<CreditoRow>(
      client,
      Prisma.sql`
        select
          "id", "folio", "loanNumber", "controlNumber", "clienteId", "avalClienteId",
          "grupoId", "startDate", "weeklyAmount", "creditStatusId", "cancelledAt",
          "legalStatus", "createdAt"
        from "Credito"
        where "grupoId" = ${TARGET.promotoriaId}
        order by "controlNumber" asc, "createdAt" asc
      `,
    )
  ).filter(
    (credito) =>
      !credito.cancelledAt &&
      !EXCLUDED_LEGAL_STATUSES.has(credito.legalStatus) &&
      ACTIVE_CREDIT_STATUSES.has(creditStatusById.get(credito.creditStatusId) ?? ''),
  );

  const creditoIds = creditos.map((credito) => credito.id);
  const clienteIds = [...new Set(creditos.flatMap((credito) => [credito.clienteId, credito.avalClienteId]).filter((id): id is string => Boolean(id)))];

  const [
    clientes,
    schedules,
    paymentEvents,
    defaultEvents,
    extraWeekEvents,
    reversals,
  ] = await Promise.all([
    queryByIds<ClienteRow>(
      client,
      Prisma.sql`"Cliente"`,
      'id',
      clienteIds,
      Prisma.sql`select "id", "code", "fullName", "phone", "secondaryPhone", "address", "neighborhood", "city", "state"`,
    ),
    queryByIds<CreditScheduleRow>(
      client,
      Prisma.sql`"CreditSchedule"`,
      'creditoId',
      creditoIds,
      Prisma.sql`select "id", "creditoId", "installmentNumber", "dueDate", "expectedAmount", "installmentStatusId"`,
    ),
    queryByIds<PaymentEventRow>(
      client,
      Prisma.sql`"PaymentEvent"`,
      'creditoId',
      creditoIds,
      Prisma.sql`select "id", "creditoId", "receivedAt", "amountReceived", "isReversed", "createdAt"`,
    ),
    queryByIds<DefaultEventRow>(
      client,
      Prisma.sql`"DefaultEvent"`,
      'creditoId',
      creditoIds,
      Prisma.sql`select "id", "creditoId", "scheduleId", "amountMissed", "createdAt"`,
    ),
    queryByIds<ExtraWeekEventRow>(
      client,
      Prisma.sql`"ExtraWeekEvent"`,
      'creditoId',
      creditoIds,
      Prisma.sql`select "id", "creditoId", "dueDate", "expectedAmount", "status", "createdAt"`,
    ),
    queryByIds<FinancialReversalRow>(
      client,
      Prisma.sql`"FinancialReversal"`,
      'creditoId',
      creditoIds,
      Prisma.sql`select "id", "creditoId", "sourceType", "sourceId", "reversedAt"`,
    ),
  ]);

  const paymentIds = paymentEvents.map((payment) => payment.id);
  const [paymentAllocations, recoveryEvents, advanceEvents] = await Promise.all([
    queryByIds<PaymentAllocationRow>(
      client,
      Prisma.sql`"PaymentAllocation"`,
      'paymentEventId',
      paymentIds,
      Prisma.sql`select "id", "paymentEventId", "allocationType", "amount", "scheduleId", "defaultEventId", "extraWeekEventId", "createdAt"`,
    ),
    queryByIds<RecoveryEventRow>(
      client,
      Prisma.sql`"RecoveryEvent"`,
      'creditoId',
      creditoIds,
      Prisma.sql`select "id", "creditoId", "paymentEventId", "defaultEventId", "recoveredAmount", "createdAt"`,
    ),
    queryByIds<AdvanceEventRow>(
      client,
      Prisma.sql`"AdvanceEvent"`,
      'creditoId',
      creditoIds,
      Prisma.sql`select "id", "creditoId", "paymentEventId", "recordedOnInstallmentId", "coversInstallmentId", "amount", "createdAt"`,
    ),
  ]);

  return {
    entityId,
    creditStatuses,
    installmentStatuses,
    grupos,
    zones,
    impactAudits,
    liquidationAudits,
    creditos,
    clientes,
    schedules,
    paymentEvents,
    paymentAllocations,
    defaultEvents,
    recoveryEvents,
    advanceEvents,
    extraWeekEvents,
    reversals,
  };
}

function buildExpectedRows(input: {
  data: Awaited<ReturnType<typeof loadReadOnlyData>>;
  excludePartialEvents: boolean;
  partialPaymentIds: Set<string>;
  partialDefaultIds: Set<string>;
  partialExtraWeekIds: Set<string>;
}) {
  const data = input.data;
  const installmentStatusById = new Map(data.installmentStatuses.map((status) => [status.id, status.code]));
  const clienteById = new Map(data.clientes.map((cliente) => [cliente.id, cliente]));
  const zoneById = new Map(data.zones.map((zone) => [zone.id, zone]));
  const grupo = data.grupos[0] ?? null;

  const paymentEvents = input.excludePartialEvents
    ? data.paymentEvents.filter((payment) => !input.partialPaymentIds.has(payment.id))
    : data.paymentEvents;
  const paymentById = new Map(paymentEvents.map((payment) => [payment.id, payment]));
  const allocations = data.paymentAllocations.filter((allocation) => paymentById.has(allocation.paymentEventId));
  const defaultEvents = input.excludePartialEvents
    ? data.defaultEvents.filter((event) => !input.partialDefaultIds.has(event.id))
    : data.defaultEvents;
  const recoveryEvents = data.recoveryEvents.filter((event) => paymentById.has(event.paymentEventId));
  const advanceEvents = data.advanceEvents.filter((event) => paymentById.has(event.paymentEventId));
  const extraWeekEvents = input.excludePartialEvents
    ? data.extraWeekEvents.filter((event) => !input.partialExtraWeekIds.has(event.id))
    : data.extraWeekEvents;

  const schedulesByCreditoId = groupBy(data.schedules, (schedule) => schedule.creditoId);
  const allocationsByScheduleId = groupBy(allocations, (allocation) => allocation.scheduleId);
  const defaultsByCreditoId = groupBy(defaultEvents, (event) => event.creditoId);
  const recoveriesByDefaultId = groupBy(recoveryEvents, (event) => event.defaultEventId);
  const advancesByCoversScheduleId = groupBy(advanceEvents, (event) => event.coversInstallmentId);
  const reversalsByCreditoId = groupBy(data.reversals, (reversal) => reversal.creditoId);
  const extraWeekByCreditoId = new Map(extraWeekEvents.map((event) => [event.creditoId, event]));

  const selectedDateKey = TARGET.occurredAt;
  const cutoffEnd = new Date(`${selectedDateKey}T23:59:59.999`);
  const activeWindowStartKey = toDateKey(addDays(new Date(`${selectedDateKey}T12:00:00`), -84));
  const activeWindowEndKey = toDateKey(addDays(new Date(`${selectedDateKey}T12:00:00`), -7));
  const rows: ExpectedRow[] = [];

  for (const credito of data.creditos) {
    const schedules = (schedulesByCreditoId.get(credito.id) ?? []).slice().sort((left, right) => left.installmentNumber - right.installmentNumber);
    const firstSchedule = schedules[0];
    const salesStartKey = toDateKey(credito.startDate);
    const scheduleWeekAnchorKey = firstSchedule ? toDateKey(firstSchedule.dueDate) : salesStartKey;
    const operationalWeek = getOperationalWeek(scheduleWeekAnchorKey, selectedDateKey);
    const extraWeek = extraWeekByCreditoId.get(credito.id) ?? null;
    const hasExtraWeekInCycle =
      operationalWeek === 13 &&
      Boolean(extraWeek && !['PAID', 'EXEMPT', 'REVERSED'].includes(extraWeek.status));
    const baseOperationalScope: OperationalScope =
      operationalWeek >= 14 ? 'overdue' : hasExtraWeekInCycle ? 'active_with_extra_week' : 'active';
    const isWithinActiveWindow = salesStartKey >= activeWindowStartKey && salesStartKey <= activeWindowEndKey;
    const reversedDefaultIds = new Set(
      (reversalsByCreditoId.get(credito.id) ?? [])
        .filter((reversal) => reversal.sourceType === 'DEFAULT_EVENT' && reversal.reversedAt <= cutoffEnd)
        .map((reversal) => reversal.sourceId),
    );

    const paidAsOf = (schedule: CreditScheduleRow) =>
      (allocationsByScheduleId.get(schedule.id) ?? [])
        .filter((allocation) => {
          const payment = paymentById.get(allocation.paymentEventId);
          return payment && !payment.isReversed && payment.receivedAt <= cutoffEnd;
        })
        .reduce((sum, allocation) => sum + Number(allocation.amount), 0);

    const unpaidAsOf = (schedule: CreditScheduleRow) =>
      Math.max(0, Number(schedule.expectedAmount) - paidAsOf(schedule));

    const firstHistoricalOverdueSchedule = schedules.find(
      (schedule) => toDateKey(schedule.dueDate) <= selectedDateKey && unpaidAsOf(schedule) > 0,
    );
    const targetScheduleForSelectedDate =
      baseOperationalScope === 'active'
        ? schedules.find((schedule) => toDateKey(schedule.dueDate) === selectedDateKey)
        : null;
    const targetScheduleForOperationalWeek =
      baseOperationalScope === 'active'
        ? schedules.find(
            (schedule) =>
              schedule.installmentNumber === operationalWeek &&
              toDateKey(schedule.dueDate) <= selectedDateKey,
          )
        : null;
    const targetSchedule =
      baseOperationalScope === 'active'
        ? targetScheduleForSelectedDate ?? targetScheduleForOperationalWeek
        : baseOperationalScope === 'overdue'
          ? firstHistoricalOverdueSchedule
          : null;

    const creditoDefaults = defaultsByCreditoId.get(credito.id) ?? [];
    const unresolvedDefaultsSorted = creditoDefaults
      .filter((defaultEvent) => {
        if (defaultEvent.createdAt > cutoffEnd) return false;
        if (reversedDefaultIds.has(defaultEvent.id)) return false;
        const recoveredAmount = (recoveriesByDefaultId.get(defaultEvent.id) ?? [])
          .filter((recovery) => {
            const payment = paymentById.get(recovery.paymentEventId);
            return payment && !payment.isReversed && payment.receivedAt <= cutoffEnd;
          })
          .reduce((sum, recovery) => sum + Number(recovery.recoveredAmount), 0);
        return recoveredAmount < Number(defaultEvent.amountMissed);
      })
      .sort((left, right) => {
        const leftSchedule = schedules.find((schedule) => schedule.id === left.scheduleId);
        const rightSchedule = schedules.find((schedule) => schedule.id === right.scheduleId);
        return (leftSchedule?.installmentNumber ?? 0) - (rightSchedule?.installmentNumber ?? 0);
      });

    const unresolvedRecoveryAmount = unresolvedDefaultsSorted.reduce((sum, defaultEvent) => {
      const recoveredAmount = (recoveriesByDefaultId.get(defaultEvent.id) ?? [])
        .filter((recovery) => {
          const payment = paymentById.get(recovery.paymentEventId);
          return payment && !payment.isReversed && payment.receivedAt <= cutoffEnd;
        })
        .reduce((recoverySum, recovery) => recoverySum + Number(recovery.recoveredAmount), 0);
      return sum + Math.max(0, Number(defaultEvent.amountMissed) - recoveredAmount);
    }, 0);

    const firstUnresolvedDefault = unresolvedDefaultsSorted[0] ?? null;
    const extraWeekCollectible = extraWeek ? Number(extraWeek.expectedAmount) : 0;
    const hasRecoverableBalance = unresolvedRecoveryAmount > 0;
    const hasPendingExtraWeek = extraWeekCollectible > 0;
    const hasOverdueBalance = Boolean(firstHistoricalOverdueSchedule && unpaidAsOf(firstHistoricalOverdueSchedule) > 0);
    const hasRelevantOperationalBalance = hasRecoverableBalance || hasPendingExtraWeek || hasOverdueBalance;
    const operationalScope: OperationalScope =
      !isWithinActiveWindow && hasPendingExtraWeek
        ? 'active_with_extra_week'
        : !isWithinActiveWindow && (hasRecoverableBalance || hasOverdueBalance)
          ? 'overdue'
          : baseOperationalScope;
    const rowMode: RowMode =
      operationalScope === 'active'
        ? 'regular'
        : operationalScope === 'active_with_extra_week'
          ? hasRecoverableBalance
            ? 'final_closure'
            : 'extra_week_only'
          : 'recovery_only';

    if (TARGET_SCOPE === 'active' && !isWithinActiveWindow && !hasRelevantOperationalBalance) continue;
    if (TARGET_SCOPE !== 'all' && TARGET_SCOPE !== 'active' && operationalScope !== TARGET_SCOPE) continue;

    const deAmount = isWithinActiveWindow && operationalScope === 'active' && targetSchedule
      ? Number(targetSchedule.expectedAmount)
      : 0;
    const outgoingAdvanceAmount =
      operationalScope === 'active' && targetSchedule
        ? Math.min(
            Number(targetSchedule.expectedAmount),
            (advancesByCoversScheduleId.get(targetSchedule.id) ?? [])
              .filter((advance) => {
                const payment = paymentById.get(advance.paymentEventId);
                return payment && !payment.isReversed && payment.receivedAt <= cutoffEnd;
              })
              .reduce((sum, advance) => sum + Number(advance.amount), 0),
          )
        : 0;
    const currentCollectibleAmount = targetSchedule ? unpaidAsOf(targetSchedule) : 0;
    const advanceAmountAvailable =
      operationalScope === 'active' && targetSchedule
        ? schedules
            .filter((schedule) => schedule.installmentNumber > targetSchedule.installmentNumber)
            .reduce((sum, schedule) => sum + unpaidAsOf(schedule), 0)
        : 0;
    const amountDue =
      operationalScope === 'active_with_extra_week'
        ? 0
        : operationalScope === 'overdue'
          ? 0
          : targetSchedule
            ? currentCollectibleAmount
            : 0;
    const shouldKeepZeroCollectibleRow =
      (operationalScope === 'active' && outgoingAdvanceAmount > 0) ||
      unresolvedRecoveryAmount > 0 ||
      extraWeekCollectible > 0;

    if (
      (amountDue <= 0 && !shouldKeepZeroCollectibleRow) ||
      (!targetSchedule && rowMode === 'regular')
    ) {
      continue;
    }

    const resolvedRowMode = resolveOperationalRowMode({
      rowMode,
      collectibleAmount: amountDue,
      deAmount,
      recoveryAmountAvailable: unresolvedRecoveryAmount,
      extraWeekAmount: extraWeekCollectible,
    });
    const cliente = clienteById.get(credito.clienteId);
    if (!cliente) continue;
    const aval = credito.avalClienteId ? clienteById.get(credito.avalClienteId) : null;
    const recoverySchedule = firstUnresolvedDefault
      ? schedules.find((schedule) => schedule.id === firstUnresolvedDefault.scheduleId)
      : null;

    rows.push({
      creditoId: credito.id,
      scheduleId: resolvedRowMode === 'regular' ? targetSchedule?.id ?? null : null,
      extraWeekEventId: operationalScope === 'active_with_extra_week' ? extraWeek?.id ?? null : null,
      recoveryAnchorDefaultEventId: firstUnresolvedDefault?.id ?? null,
      recoveryAnchorScheduleId: firstUnresolvedDefault?.scheduleId ?? null,
      recoveryAnchorInstallmentNumber: recoverySchedule?.installmentNumber ?? null,
      folio: credito.folio,
      loanNumber: credito.loanNumber,
      controlNumber: credito.controlNumber,
      clienteName: cliente.fullName,
      clienteLabel: `${cliente.code} · ${cliente.fullName}`,
      avalLabel: aval ? `${aval.code} · ${aval.fullName}` : null,
      operationalScope,
      rowMode: resolvedRowMode,
      operationalWeek,
      creditStartDate: salesStartKey,
      scheduledDate:
        operationalScope === 'active_with_extra_week'
          ? extraWeek
            ? toDateKey(extraWeek.dueDate)
            : null
          : targetSchedule
            ? toDateKey(targetSchedule.dueDate)
            : null,
      installmentNumber: operationalScope === 'active_with_extra_week' ? 13 : targetSchedule?.installmentNumber ?? 0,
      deAmount: toMoney(deAmount),
      collectibleAmount: toMoney(amountDue),
      recoveryAmountAvailable: toMoney(unresolvedRecoveryAmount),
      advanceAmountAvailable: toMoney(advanceAmountAvailable),
      outgoingAdvanceAmount: toMoney(outgoingAdvanceAmount),
      extraWeekAmount: toMoney(extraWeekCollectible),
    });
  }

  return rows;
}

function classifyMissingRow(input: {
  row: ExpectedRow;
  paymentEventsOnDateByCreditoId: Map<string, PaymentEventRow[]>;
  allocationsOnDateByCreditoId: Map<string, PaymentAllocationRow[]>;
  defaultsByScheduleId: Map<string, DefaultEventRow[]>;
  recoveriesOnDateByDefaultId: Map<string, RecoveryEventRow[]>;
  advancesOnDateByCreditoId: Map<string, AdvanceEventRow[]>;
}) {
  const types: MissingRowType[] = [];
  if (input.row.deAmount > 0.001 || input.row.collectibleAmount > 0.001) {
    types.push('pago normal', 'falla');
  }
  if (input.row.recoveryAmountAvailable > 0.001) types.push('recuperado');
  if (input.row.advanceAmountAvailable > 0.001) types.push('adelanto entrante');
  if (input.row.outgoingAdvanceAmount > 0.001) types.push('adelanto saliente');
  if (input.row.extraWeekAmount > 0.001) types.push('semana extra');

  const allocationsOnDate = input.allocationsOnDateByCreditoId.get(input.row.creditoId) ?? [];
  const hasCurrentPaymentAllocation = Boolean(
    input.row.scheduleId &&
      allocationsOnDate.some(
        (allocation) => allocation.allocationType === 'CURRENT' && allocation.scheduleId === input.row.scheduleId,
      ),
  );
  const hasDefaultEvent = Boolean(
    input.row.scheduleId && (input.defaultsByScheduleId.get(input.row.scheduleId) ?? []).length > 0,
  );
  const hasRecoveryEvent = Boolean(
    input.row.recoveryAnchorDefaultEventId &&
      (input.recoveriesOnDateByDefaultId.get(input.row.recoveryAnchorDefaultEventId) ?? []).length > 0,
  );
  const hasAdvanceEvent = (input.advancesOnDateByCreditoId.get(input.row.creditoId) ?? []).length > 0;
  const hasExtraWeekAllocation = Boolean(
    input.row.extraWeekEventId &&
      allocationsOnDate.some(
        (allocation) =>
          allocation.allocationType === 'EXTRA_WEEK' &&
          allocation.extraWeekEventId === input.row.extraWeekEventId,
      ),
  );
  const hasAnyPaymentAllocationOnDate = allocationsOnDate.length > 0;

  const needsHumanDecision =
    input.row.collectibleAmount > 0.001 ||
    input.row.recoveryAmountAvailable > 0.001 ||
    input.row.advanceAmountAvailable > 0.001 ||
    input.row.extraWeekAmount > 0.001;
  const canImpactAutomatically = !needsHumanDecision && input.row.outgoingAdvanceAmount > 0.001;
  const duplicateDetected =
    hasCurrentPaymentAllocation ||
    hasDefaultEvent ||
    hasRecoveryEvent ||
    hasAdvanceEvent ||
    hasExtraWeekAllocation ||
    hasAnyPaymentAllocationOnDate;

  return {
    types,
    canImpactAutomatically,
    requiresManualDecision: !canImpactAutomatically,
    manualReason: canImpactAutomatically
      ? 'Solo requiere agregarse al snapshot/cierre; no necesita crear eventos financieros.'
      : 'Requiere decidir pago normal, falla, recuperado, adelanto entrante o semana extra antes de escribir.',
    idempotency: {
      hasCurrentPaymentAllocation,
      hasDefaultEvent,
      hasRecoveryEvent,
      hasAdvanceEvent,
      hasExtraWeekAllocation,
      hasAnyPaymentAllocationOnDate,
      safeToCreateWithoutDuplicate: !duplicateDetected,
    },
  };
}

function printReport(input: {
  entityId: string;
  impactAudits: AuditLogRow[];
  liquidationAudits: AuditLogRow[];
  expectedRows: ExpectedRow[];
  impactedRows: ExpectedRow[];
  missingRows: MissingRow[];
  currentAuditRowsCount: number;
  materializedCounts: Record<string, number>;
}) {
  const typeRows = (type: MissingRowType) => input.missingRows.filter((row) => row.types.includes(type));
  const autoRows = input.missingRows.filter((row) => row.canImpactAutomatically);
  const manualRows = input.missingRows.filter((row) => row.requiresManualDecision);
  const duplicateRiskRows = input.missingRows.filter((row) => !row.idempotency.safeToCreateWithoutDuplicate);

  console.log('\nTarget');
  console.table([{ ...TARGET, entityId: input.entityId }]);

  console.log('\nEstado parcial detectado');
  console.table([
    {
      expectedOriginalRows: input.expectedRows.length,
      impactedRows: input.impactedRows.length,
      missingRows: input.missingRows.length,
      currentAuditRowsSnapshot: input.currentAuditRowsCount,
      pagoGrupoImpactCount: input.impactAudits.length,
      pagoGrupoLiquidacionCount: input.liquidationAudits.length,
      latestPagoGrupoImpactId: input.impactAudits[0]?.id ?? null,
    },
  ]);

  console.log('\nEventos ya materializados para la fecha');
  console.table([input.materializedCounts]);

  console.log('\nImportes esperados vs impactados');
  console.table([
    { label: 'Esperado original', ...summarizeRows(input.expectedRows) },
    { label: 'Ya impactado', ...summarizeRows(input.impactedRows) },
    { label: 'Faltante', ...summarizeRows(input.missingRows) },
  ]);

  console.log('\nFilas faltantes por tipo');
  console.table([
    { type: 'pago normal', rows: typeRows('pago normal').length, amount: sumMoney(typeRows('pago normal'), (row) => row.deAmount) },
    { type: 'falla', rows: typeRows('falla').length, amount: sumMoney(typeRows('falla'), (row) => row.collectibleAmount) },
    { type: 'recuperado', rows: typeRows('recuperado').length, amount: sumMoney(typeRows('recuperado'), (row) => row.recoveryAmountAvailable) },
    { type: 'adelanto entrante', rows: typeRows('adelanto entrante').length, amount: sumMoney(typeRows('adelanto entrante'), (row) => row.advanceAmountAvailable) },
    { type: 'adelanto saliente', rows: typeRows('adelanto saliente').length, amount: sumMoney(typeRows('adelanto saliente'), (row) => row.outgoingAdvanceAmount) },
    { type: 'semana extra', rows: typeRows('semana extra').length, amount: sumMoney(typeRows('semana extra'), (row) => row.extraWeekAmount) },
  ]);

  console.log('\nEstrategia de recuperacion propuesta');
  console.table([
    {
      automaticSnapshotOnlyRows: autoRows.length,
      manualDecisionRows: manualRows.length,
      duplicateRiskRows: duplicateRiskRows.length,
      recommendation:
        'Completar automaticamente solo filas 100% inferibles/snapshot-only; dejar decisiones manuales antes de cualquier escritura.',
    },
  ]);

  console.log('\nFilas faltantes con detalle');
  console.table(
    input.missingRows.map((row) => ({
      control: row.controlNumber,
      cliente: row.clienteName,
      creditoId: row.creditoId,
      loanNumber: row.loanNumber,
      semana: row.installmentNumber,
      tipos: row.types.join(', '),
      de: row.deAmount,
      adelantoSaliente: row.outgoingAdvanceAmount,
      puedeAutomatico: row.canImpactAutomatically,
      requiereManual: row.requiresManualDecision,
      duplicadoDetectado: !row.idempotency.safeToCreateWithoutDuplicate,
      motivo: row.manualReason,
    })),
  );

  console.log('\nValidacion de idempotencia sobre filas faltantes');
  console.table(
    input.missingRows
      .filter((row) => !row.idempotency.safeToCreateWithoutDuplicate)
      .map((row) => ({
        creditoId: row.creditoId,
        loanNumber: row.loanNumber,
        hasCurrentPaymentAllocation: row.idempotency.hasCurrentPaymentAllocation,
        hasDefaultEvent: row.idempotency.hasDefaultEvent,
        hasRecoveryEvent: row.idempotency.hasRecoveryEvent,
        hasAdvanceEvent: row.idempotency.hasAdvanceEvent,
        hasExtraWeekAllocation: row.idempotency.hasExtraWeekAllocation,
        hasAnyPaymentAllocationOnDate: row.idempotency.hasAnyPaymentAllocationOnDate,
      })),
  );

  console.log('\nResultado dry-run');
  console.log('Escrituras realizadas: 0');
  console.log('PaymentEvent nuevos: 0');
  console.log('PaymentAllocation nuevos: 0');
  console.log('DefaultEvent nuevos: 0');
  console.log('RecoveryEvent nuevos: 0');
  console.log('AdvanceEvent nuevos: 0');
  console.log('PagoGrupoImpact actualizado: NO');
}

async function main() {
  const client = createProductionClient();

  try {
    const data = await loadReadOnlyData(client);
    const partialPaymentEvents = data.paymentEvents.filter(
      (payment) => toDateKey(payment.receivedAt) === TARGET.occurredAt && !payment.isReversed,
    );
    const partialPaymentIds = new Set(partialPaymentEvents.map((payment) => payment.id));
    const partialDefaultEvents = data.defaultEvents.filter(
      (event) => toDateKey(event.createdAt) === TARGET.occurredAt,
    );
    const partialDefaultIds = new Set(partialDefaultEvents.map((event) => event.id));
    const partialDefaultCreditoIds = new Set(partialDefaultEvents.map((event) => event.creditoId));
    const partialStartedAt = [...partialPaymentEvents, ...partialDefaultEvents]
      .map((event) => event.createdAt)
      .sort((left, right) => left.getTime() - right.getTime())[0] ?? null;
    const partialExtraWeekIds = new Set(
      data.extraWeekEvents
        .filter(
          (event) =>
            partialStartedAt &&
            partialDefaultCreditoIds.has(event.creditoId) &&
            event.createdAt >= partialStartedAt,
        )
        .map((event) => event.id),
    );

    const expectedRows = buildExpectedRows({
      data,
      excludePartialEvents: true,
      partialPaymentIds,
      partialDefaultIds,
      partialExtraWeekIds,
    });
    const impactedCreditoIds = new Set([
      ...partialPaymentEvents.map((payment) => payment.creditoId),
      ...partialDefaultEvents.map((event) => event.creditoId),
    ]);
    const impactedRows = expectedRows.filter((row) => impactedCreditoIds.has(row.creditoId));
    const missingExpectedRows = expectedRows.filter((row) => !impactedCreditoIds.has(row.creditoId));
    const paymentEventById = new Map(data.paymentEvents.map((payment) => [payment.id, payment]));
    const paymentEventsOnDateByCreditoId = groupBy(partialPaymentEvents, (payment) => payment.creditoId);
    const allocationsOnDate = data.paymentAllocations.filter((allocation) => partialPaymentIds.has(allocation.paymentEventId));
    const allocationsOnDateByCreditoId = groupBy(allocationsOnDate, (allocation) => {
      const payment = paymentEventById.get(allocation.paymentEventId);
      return payment?.creditoId;
    });
    const defaultsByScheduleId = groupBy(data.defaultEvents, (event) => event.scheduleId);
    const recoveriesOnDateByDefaultId = groupBy(
      data.recoveryEvents.filter((event) => partialPaymentIds.has(event.paymentEventId)),
      (event) => event.defaultEventId,
    );
    const advancesOnDateByCreditoId = groupBy(
      data.advanceEvents.filter((event) => partialPaymentIds.has(event.paymentEventId)),
      (event) => event.creditoId,
    );

    const missingRows = missingExpectedRows.map((row) => ({
      ...row,
      ...classifyMissingRow({
        row,
        paymentEventsOnDateByCreditoId,
        allocationsOnDateByCreditoId,
        defaultsByScheduleId,
        recoveriesOnDateByDefaultId,
        advancesOnDateByCreditoId,
      }),
    }));

    const impactPayload = getJsonRecord(data.impactAudits[0]?.afterJson);
    const currentAuditRowsCount = Array.isArray(impactPayload?.rowsSnapshot) ? impactPayload.rowsSnapshot.length : 0;

    printReport({
      entityId: data.entityId,
      impactAudits: data.impactAudits,
      liquidationAudits: data.liquidationAudits,
      expectedRows,
      impactedRows,
      missingRows,
      currentAuditRowsCount,
      materializedCounts: {
        PaymentEvent: partialPaymentEvents.length,
        PaymentAllocation: allocationsOnDate.length,
        DefaultEvent: partialDefaultEvents.length,
        RecoveryEvent: data.recoveryEvents.filter((event) => partialPaymentIds.has(event.paymentEventId)).length,
        AdvanceEvent: data.advanceEvents.filter((event) => partialPaymentIds.has(event.paymentEventId)).length,
        ExtraWeekEventGeneratedByPartialDefaults: partialExtraWeekIds.size,
      },
    });
  } finally {
    await client.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
