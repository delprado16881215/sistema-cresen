import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/errors';
import { writeAuditLog } from '@/lib/audit';
import { getClientePlacementBlockMessage, isClientePlacementBlocked } from '@/lib/legal-status';
import type { Prisma } from '@prisma/client';
import { parseCreditoImportWorkbook, type ParsedImportCreditoRow } from '@/modules/creditos/import/creditos-import-utils';

const IMPORT_BATCH_SIZE = 100;
const IMPORT_TRANSACTION_OPTIONS = {
  timeout: 60_000,
  maxWait: 10_000,
} as const;

export type CreditoImportPreviewRow = {
  rowNumber: number;
  payload: ParsedImportCreditoRow;
  duplicateReason: string | null;
  errors: string[];
  resolved: {
    clienteName: string | null;
    avalName: string | null;
    promotoriaName: string | null;
    supervisionName: string | null;
    planCode: string | null;
    statusName: string | null;
  };
};

export type CreditoImportPreviewResult = {
  totalRows: number;
  validRows: CreditoImportPreviewRow[];
  duplicateRows: CreditoImportPreviewRow[];
  errorRows: CreditoImportPreviewRow[];
};

export type CreditoImportCommitErrorRow = {
  rowNumber: number;
  saleId: string;
  clientExternalId: string;
  message: string;
};

export type CreditoImportCommitResult = {
  imported: Array<{ id: string; saleId: string | null; folio: string; clienteName: string }>;
  importedCount: number;
  failedRows: CreditoImportCommitErrorRow[];
  failedCount: number;
  batchSize: number;
  summary: {
    importedCount: number;
    principalAmountTotal: number;
    weeklyAmountTotal: number;
    overdueCount: number;
    integrityIssues: {
      missingRequiredFields: number;
      duplicatePayments: number;
      incompleteSchedules: number;
      creditsWithoutClient: number;
      outOfRangeWeeks: number;
      inconsistentDates: number;
      invalidAmounts: number;
    };
    issueDetails: string[];
  };
};

type ResolvedMaps = {
  clientes: Map<string, { id: string; fullName: string; code: string; externalClientId: string | null; isActive: boolean; deletedAt: Date | null; placementStatus: 'ELIGIBLE' | 'BLOCKED_LEGAL' }>;
  promotorias: Map<string, { id: string; name: string; code: string; externalPromotoriaId: string | null; isActive: boolean; deletedAt: Date | null; supervision: { id: string; name: string } | null }>;
  promotoriasList: Array<{ id: string; name: string; code: string; externalPromotoriaId: string | null; isActive: boolean; deletedAt: Date | null; supervision: { id: string; name: string } | null }>;
  statuses: Map<string, { id: string; code: string; name: string }>;
  plansByWeeks: Map<number, { id: string; code: string; weeks: number; version: number }>;
  existingSaleIds: Set<string>;
};

function normalizeLookupText(value: string | null | undefined) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ');
}

function parseNumericIdentifier(value: string | null | undefined) {
  const normalized = normalizeLookupText(value);
  if (!normalized) return null;
  const match = normalized.match(/^(?:CR)?0*(\d+)$/);
  if (!match) return null;
  const [, digits = ''] = match;
  return Number.parseInt(digits, 10);
}

function buildClientLookupKeys(value: string | null | undefined) {
  const normalized = normalizeLookupText(value);
  if (!normalized) return [];

  const keys = new Set<string>([normalized]);
  const numericValue = parseNumericIdentifier(normalized);
  if (numericValue !== null) {
    keys.add(String(numericValue));
    keys.add(String(numericValue).padStart(4, '0'));
    keys.add(`CR${String(numericValue).padStart(4, '0')}`);
  }

  return [...keys];
}

function buildPromotoriaLookupKeys(value: string | null | undefined) {
  const normalized = normalizeLookupText(value);
  if (!normalized) return [];
  return [normalized];
}

function pickExampleClientValues(maps: ResolvedMaps) {
  const examples = new Set<string>();
  for (const cliente of maps.clientes.values()) {
    if (cliente.externalClientId) examples.add(cliente.externalClientId);
    else examples.add(cliente.code);
    if (examples.size >= 5) break;
  }
  return [...examples];
}

function pickPromotoriaCodes(maps: ResolvedMaps) {
  return maps.promotoriasList
    .map((promotoria) => promotoria.externalPromotoriaId ?? promotoria.code)
    .filter(Boolean)
    .slice(0, 10);
}

function buildClientResolutionMap(
  clientes: Array<{ id: string; fullName: string; code: string; externalClientId: string | null; isActive: boolean; deletedAt: Date | null; placementStatus: 'ELIGIBLE' | 'BLOCKED_LEGAL' }>,
): ResolvedMaps {
  const clientMap = new Map<string, { id: string; fullName: string; code: string; externalClientId: string | null; isActive: boolean; deletedAt: Date | null; placementStatus: 'ELIGIBLE' | 'BLOCKED_LEGAL' }>();
  for (const cliente of clientes) {
    for (const key of buildClientLookupKeys(cliente.code)) {
      clientMap.set(key, cliente);
    }
    if (cliente.externalClientId) {
      for (const key of buildClientLookupKeys(cliente.externalClientId)) {
        clientMap.set(key, cliente);
      }
    }
  }

  return {
    clientes: clientMap,
    promotorias: new Map(),
    promotoriasList: [],
    statuses: new Map(),
    plansByWeeks: new Map(),
    existingSaleIds: new Set(),
  };
}

function buildPlacementBlockedError(fullName: string, status: 'ELIGIBLE' | 'BLOCKED_LEGAL') {
  const message = getClientePlacementBlockMessage(status);
  return message ? `${message}: ${fullName}.` : `Cliente no elegible para colocación: ${fullName}.`;
}

function buildPromotoriaResolutionMap(
  promotorias: Array<{ id: string; name: string; code: string; externalPromotoriaId: string | null; isActive: boolean; deletedAt: Date | null; supervision: { id: string; name: string } | null }>,
): ResolvedMaps {
  const promotoriaMap = new Map<string, { id: string; name: string; code: string; externalPromotoriaId: string | null; isActive: boolean; deletedAt: Date | null; supervision: { id: string; name: string } | null }>();
  for (const promotoria of promotorias) {
    for (const key of buildPromotoriaLookupKeys(promotoria.code)) {
      promotoriaMap.set(key, promotoria);
    }
    for (const key of buildPromotoriaLookupKeys(promotoria.name)) {
      promotoriaMap.set(key, promotoria);
    }
    if (promotoria.externalPromotoriaId) {
      for (const key of buildPromotoriaLookupKeys(promotoria.externalPromotoriaId)) {
        promotoriaMap.set(key, promotoria);
      }
    }
  }

  return {
    clientes: new Map(),
    promotorias: promotoriaMap,
    promotoriasList: promotorias,
    statuses: new Map(),
    plansByWeeks: new Map(),
    existingSaleIds: new Set(),
  };
}

function resolveCliente(
  value: string | null | undefined,
  maps: ResolvedMaps,
) {
  for (const key of buildClientLookupKeys(value)) {
    const match = maps.clientes.get(key);
    if (match) return match;
  }
  return null;
}

function resolvePromotoria(
  value: string | null | undefined,
  maps: ResolvedMaps,
) {
  const keys = buildPromotoriaLookupKeys(value);
  for (const key of keys) {
    const exact = maps.promotorias.get(key);
    if (exact) return exact;
  }

  const normalizedValue = normalizeLookupText(value);
  if (!normalizedValue) return null;

  const partialMatches = maps.promotoriasList.filter((promotoria) => {
    const externalId = normalizeLookupText(promotoria.externalPromotoriaId);
    const code = normalizeLookupText(promotoria.code);
    const name = normalizeLookupText(promotoria.name);

    return (
      externalId.includes(normalizedValue) ||
      code.includes(normalizedValue) ||
      name.includes(normalizedValue) ||
      normalizedValue.includes(code) ||
      normalizedValue.includes(name)
    );
  });

  if (partialMatches.length === 1) return partialMatches[0];
  return null;
}

function formatLoanNumber(sequence: number) {
  return `LN${String(sequence).padStart(6, '0')}`;
}

function formatCreditFolio(sequence: number, startDate: Date) {
  const stamp = startDate.toISOString().slice(0, 10).replace(/-/g, '');
  return `CRED-${stamp}-${String(sequence).padStart(4, '0')}`;
}

async function generateCreditIdentifiers(tx: Prisma.TransactionClient, startDate: Date) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(2026031502)`;

  const lastCredito = await tx.credito.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { loanNumber: true },
  });

  const lastSequence = lastCredito ? Number.parseInt(lastCredito.loanNumber.replace(/^LN/, ''), 10) : 0;
  const nextSequence = (Number.isNaN(lastSequence) ? 0 : lastSequence) + 1;

  return {
    loanNumber: formatLoanNumber(nextSequence),
    folio: formatCreditFolio(nextSequence, startDate),
  };
}

function buildWeeklyDueDate(startDate: Date, installmentNumber: number) {
  const dueDate = new Date(startDate);
  dueDate.setDate(dueDate.getDate() + installmentNumber * 7);
  return dueDate;
}

function chunkRows<T>(rows: T[], batchSize: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += batchSize) {
    chunks.push(rows.slice(index, index + batchSize));
  }
  return chunks;
}

function isMonday(dateString: string) {
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  return date.getDay() === 1;
}

function toCommitErrorMessage(error: unknown) {
  if (error instanceof AppError) return error.message;
  if (error instanceof Error) {
    if ('code' in error && error.code === 'P2002') {
      return 'Crédito duplicado: el ID_VENTA o identificador único ya existe.';
    }
    return error.message;
  }
  return 'Ocurrió un error al importar la fila.';
}

function getOperationalWeek(startDate: Date, today: Date) {
  const diffInDays = Math.max(0, Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
  return Math.floor(diffInDays / 7) + 1;
}

async function buildImportIntegritySummary(importedIds: string[]) {
  if (!importedIds.length) {
    return {
      importedCount: 0,
      principalAmountTotal: 0,
      weeklyAmountTotal: 0,
      overdueCount: 0,
      integrityIssues: {
        missingRequiredFields: 0,
        duplicatePayments: 0,
        incompleteSchedules: 0,
        creditsWithoutClient: 0,
        outOfRangeWeeks: 0,
        inconsistentDates: 0,
        invalidAmounts: 0,
      },
      issueDetails: [] as string[],
    };
  }

  const rows = await prisma.credito.findMany({
    where: { id: { in: importedIds } },
    include: {
      cliente: { select: { id: true, fullName: true } },
      schedules: {
        select: {
          installmentNumber: true,
          dueDate: true,
          expectedAmount: true,
          paidAmount: true,
        },
        orderBy: [{ installmentNumber: 'asc' }],
      },
      payments: {
        select: {
          receivedAt: true,
          amountReceived: true,
          isReversed: true,
        },
      },
    },
  });

  const today = new Date();
  today.setHours(12, 0, 0, 0);

  const issueDetails: string[] = [];
  let missingRequiredFields = 0;
  let duplicatePayments = 0;
  let incompleteSchedules = 0;
  let creditsWithoutClient = 0;
  let outOfRangeWeeks = 0;
  let inconsistentDates = 0;
  let invalidAmounts = 0;
  let overdueCount = 0;

  for (const credito of rows) {
    const startDate = new Date(credito.startDate);
    startDate.setHours(12, 0, 0, 0);
    const operationalWeek = getOperationalWeek(startDate, today);
    if (operationalWeek >= 14) overdueCount += 1;

    if (!credito.startDate || !credito.weeklyAmount || !credito.totalWeeks) {
      missingRequiredFields += 1;
      issueDetails.push(`${credito.folio}: faltan startDate, weeklyAmount o plazo.`);
    }

    if (!credito.clienteId || !credito.cliente) {
      creditsWithoutClient += 1;
      issueDetails.push(`${credito.folio}: crédito sin relación válida con cliente.`);
    }

    if (Number(credito.principalAmount) <= 0 || Number(credito.weeklyAmount) <= 0 || credito.totalWeeks <= 0) {
      invalidAmounts += 1;
      issueDetails.push(`${credito.folio}: monto principal, cuota o plazo inválido.`);
    }

    if (![12, 15].includes(credito.totalWeeks)) {
      outOfRangeWeeks += 1;
      issueDetails.push(`${credito.folio}: plazo fuera de rango operativo (${credito.totalWeeks}).`);
    }

    if (credito.schedules.length !== credito.totalWeeks) {
      incompleteSchedules += 1;
      issueDetails.push(`${credito.folio}: cronograma incompleto (${credito.schedules.length}/${credito.totalWeeks}).`);
    }

    for (const schedule of credito.schedules) {
      const expectedDueDate = new Date(startDate);
      expectedDueDate.setDate(expectedDueDate.getDate() + schedule.installmentNumber * 7);
      expectedDueDate.setHours(12, 0, 0, 0);

      const dueDate = new Date(schedule.dueDate);
      dueDate.setHours(12, 0, 0, 0);

      if (
        schedule.installmentNumber < 1 ||
        schedule.installmentNumber > credito.totalWeeks
      ) {
        outOfRangeWeeks += 1;
        issueDetails.push(`${credito.folio}: semana ${schedule.installmentNumber} fuera de rango.`);
        break;
      }

      if (dueDate.getTime() !== expectedDueDate.getTime()) {
        inconsistentDates += 1;
        issueDetails.push(`${credito.folio}: fecha incoherente en semana ${schedule.installmentNumber}.`);
        break;
      }

      if (Number(schedule.expectedAmount) <= 0 || Number(schedule.paidAmount) < 0) {
        invalidAmounts += 1;
        issueDetails.push(`${credito.folio}: monto inválido en cronograma.`);
        break;
      }
    }

    const paymentKeys = new Set<string>();
    for (const payment of credito.payments) {
      const key = `${payment.receivedAt.toISOString().slice(0, 10)}::${Number(payment.amountReceived).toFixed(2)}::${payment.isReversed ? 'R' : 'A'}`;
      if (paymentKeys.has(key)) {
        duplicatePayments += 1;
        issueDetails.push(`${credito.folio}: posible pago duplicado ${key}.`);
        break;
      }
      paymentKeys.add(key);
    }
  }

  return {
    importedCount: rows.length,
    principalAmountTotal: rows.reduce((sum, row) => sum + Number(row.principalAmount), 0),
    weeklyAmountTotal: rows.reduce((sum, row) => sum + Number(row.weeklyAmount), 0),
    overdueCount,
    integrityIssues: {
      missingRequiredFields,
      duplicatePayments,
      incompleteSchedules,
      creditsWithoutClient,
      outOfRangeWeeks,
      inconsistentDates,
      invalidAmounts,
    },
    issueDetails: issueDetails.slice(0, 20),
  };
}

async function buildResolvedMaps(rows: ParsedImportCreditoRow[]): Promise<ResolvedMaps> {
  const clientKeys = [...new Set(rows.flatMap((row) => [row.clientExternalId, row.avalExternalId].flatMap((value) => buildClientLookupKeys(value))))];
  const promotoriaKeys = [...new Set(rows.flatMap((row) => buildPromotoriaLookupKeys(row.promotoriaExternalId)))];
  const statusCodes = [...new Set(rows.map((row) => row.statusCode).filter(Boolean))];
  const weeks = [...new Set(rows.map((row) => row.totalWeeks).filter((value) => Number.isInteger(value) && value > 0))];
  const saleIds = [...new Set(rows.map((row) => row.saleId).filter(Boolean))];

  const [clientes, promotorias, statuses, planRules, existingSaleRows] = await Promise.all([
    prisma.cliente.findMany({
      where: {
        OR: [
          { externalClientId: { in: clientKeys } },
          { code: { in: clientKeys } },
        ],
      },
      select: {
        id: true,
        fullName: true,
        code: true,
        externalClientId: true,
        isActive: true,
        deletedAt: true,
        placementStatus: true,
      },
    }),
    prisma.promotoria.findMany({
      where: {
        OR: [
          { externalPromotoriaId: { in: promotoriaKeys } },
          { code: { in: promotoriaKeys } },
        ],
      },
      select: {
        id: true,
        name: true,
        code: true,
        externalPromotoriaId: true,
        isActive: true,
        deletedAt: true,
        supervision: { select: { id: true, name: true } },
      },
    }),
    prisma.creditStatusCatalog.findMany({
      where: { code: { in: statusCodes } },
      select: { id: true, code: true, name: true },
    }),
    prisma.creditPlanRule.findMany({
      where: { isActive: true, weeks: { in: weeks } },
      orderBy: [{ weeks: 'asc' }, { version: 'desc' }],
      select: { id: true, code: true, weeks: true, version: true },
    }),
    prisma.credito.findMany({
      where: { saleId: { in: saleIds } },
      select: { saleId: true },
    }),
  ]);

  const statusMap = new Map(statuses.map((status) => [status.code.toUpperCase(), status]));
  const planMap = new Map<number, { id: string; code: string; weeks: number; version: number }>();
  for (const plan of planRules) {
    if (!planMap.has(plan.weeks)) {
      planMap.set(plan.weeks, plan);
    }
  }

  return {
    clientes: buildClientResolutionMap(clientes).clientes,
    promotorias: buildPromotoriaResolutionMap(promotorias).promotorias,
    promotoriasList: promotorias,
    statuses: statusMap,
    plansByWeeks: planMap,
    existingSaleIds: new Set(existingSaleRows.map((row) => String(row.saleId).toUpperCase())),
  };
}

function validatePreviewRow(
  row: ParsedImportCreditoRow,
  maps: ResolvedMaps,
  seenSaleIds: Set<string>,
): CreditoImportPreviewRow {
  const errors: string[] = [];
  let duplicateReason: string | null = null;

  if (!row.saleId) errors.push('ID_VENTA es obligatorio.');
  if (!Number.isInteger(row.controlNumber) || row.controlNumber <= 0) errors.push('NRO_CONTROL debe ser un entero positivo.');
  if (!row.startDate || Number.isNaN(new Date(`${row.startDate}T00:00:00`).getTime())) {
    errors.push(`FECHA debe ser válida. Valor recibido: ${String(row.receivedStartDate ?? '').trim() || '(vacío)'}.`);
  } else if (!isMonday(row.startDate)) {
    errors.push(
      `FECHA debe caer en lunes. Valor recibido: ${String(row.receivedStartDate ?? '').trim() || '(vacío)'} -> interpretado como ${row.startDate}.`,
    );
  }
  if (!row.clientExternalId) errors.push('ID_CLIENTE es obligatorio.');
  if (!Number.isFinite(row.principalAmount) || row.principalAmount <= 0) errors.push('MONTO_VENTA debe ser mayor a 0.');
  if (!Number.isFinite(row.weeklyAmount) || row.weeklyAmount <= 0) errors.push('MONTO_CUOTAS debe ser mayor a 0.');
  if (!Number.isInteger(row.totalWeeks) || row.totalWeeks <= 0) errors.push('NRO_SEMANA debe ser un entero positivo.');
  if (!Number.isFinite(row.totalPayableAmount) || row.totalPayableAmount <= 0) errors.push('MONTO_PAGAR debe ser mayor a 0.');
  if (!row.promotoriaExternalId) errors.push('ID_PROMOTORA es obligatorio.');
  if (!row.statusCode) errors.push('ESTADO es obligatorio.');

  if (row.saleId) {
    const saleId = row.saleId.toUpperCase();
    if (maps.existingSaleIds.has(saleId)) duplicateReason = 'ID_VENTA ya existe en la base.';
    else if (seenSaleIds.has(saleId)) duplicateReason = 'ID_VENTA duplicado dentro del archivo.';
    seenSaleIds.add(saleId);
  }

  const cliente = row.clientExternalId ? resolveCliente(row.clientExternalId, maps) : null;
  const aval = row.avalExternalId ? resolveCliente(row.avalExternalId, maps) : null;
  const promotoria = row.promotoriaExternalId ? resolvePromotoria(row.promotoriaExternalId, maps) : null;
  const status = row.statusCode ? maps.statuses.get(row.statusCode.toUpperCase()) ?? null : null;
  const plan = Number.isInteger(row.totalWeeks) ? maps.plansByWeeks.get(row.totalWeeks) ?? null : null;
  const clientExamples = pickExampleClientValues(maps);
  const promotoriaExamples = pickPromotoriaCodes(maps);

  if (!cliente) {
    errors.push(
      `ID_CLIENTE no existe en clientes importados. Valor recibido: ${String(row.receivedClientExternalId ?? '').trim() || '(vacío)'}. Ejemplos válidos: ${clientExamples.join(', ') || 'sin clientes disponibles'}.`,
    );
  }
  else if (!cliente.isActive || cliente.deletedAt) errors.push('El cliente titular está inactivo o dado de baja.');
  else if (isClientePlacementBlocked(cliente.placementStatus)) {
    errors.push(buildPlacementBlockedError(cliente.fullName, cliente.placementStatus));
  }

  if (row.avalExternalId) {
    if (!aval) {
      errors.push(
        `ID_AVAL no existe en clientes importados. Valor recibido: ${String(row.receivedAvalExternalId ?? '').trim() || '(vacío)'}. Ejemplos válidos: ${clientExamples.join(', ') || 'sin clientes disponibles'}.`,
      );
    }
    else if (!aval.isActive || aval.deletedAt) errors.push('El aval está inactivo o dado de baja.');
    else if (cliente && aval.id === cliente.id) errors.push('El aval debe ser distinto al cliente titular.');
  }

  if (!promotoria) {
    errors.push(
      `ID_PROMOTORA no existe en el catálogo. Valor recibido: ${String(row.receivedPromotoriaExternalId ?? '').trim() || '(vacío)'}. Códigos disponibles: ${promotoriaExamples.join(', ') || 'sin promotorías disponibles'}.`,
    );
  }
  else if (!promotoria.isActive || promotoria.deletedAt) errors.push('La promotoría está inactiva o dada de baja.');

  if (!status) errors.push('ESTADO no existe en catálogo de estados de crédito.');
  if (!plan) errors.push('No existe un plan de crédito activo para el número de semanas indicado.');

  return {
    rowNumber: row.rowNumber,
    payload: row,
    duplicateReason,
    errors,
    resolved: {
      clienteName: cliente?.fullName ?? null,
      avalName: aval?.fullName ?? null,
      promotoriaName: promotoria?.name ?? null,
      supervisionName: promotoria?.supervision?.name ?? null,
      planCode: plan?.code ?? null,
      statusName: status?.name ?? null,
    },
  };
}

export async function previewCreditoImport(file: File): Promise<CreditoImportPreviewResult> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const rows = parseCreditoImportWorkbook(buffer, file.name);
  if (!rows.length) {
    return { totalRows: 0, validRows: [], duplicateRows: [], errorRows: [] };
  }

  const maps = await buildResolvedMaps(rows);
  const seenSaleIds = new Set<string>();
  const previewRows = rows.map((row) => validatePreviewRow(row, maps, seenSaleIds));

  return {
    totalRows: previewRows.length,
    validRows: previewRows.filter((row) => !row.errors.length && !row.duplicateReason),
    duplicateRows: previewRows.filter((row) => !row.errors.length && Boolean(row.duplicateReason)),
    errorRows: previewRows.filter((row) => row.errors.length > 0),
  };
}

async function importSingleCreditoRow(row: CreditoImportPreviewRow, userId: string) {
  return prisma.$transaction(async (tx) => {
    const payload = row.payload;

    const [clientes, promotorias, planRule, creditStatus, pendingInstallmentStatus] = await Promise.all([
      tx.cliente.findMany({
        where: { deletedAt: null, isActive: true },
        select: { id: true, fullName: true, code: true, externalClientId: true, isActive: true, deletedAt: true, placementStatus: true },
      }),
      tx.promotoria.findMany({
        where: { deletedAt: null, isActive: true },
        select: { id: true, name: true, code: true, externalPromotoriaId: true, isActive: true, deletedAt: true, supervision: { select: { id: true, name: true } } },
      }),
      tx.creditPlanRule.findFirst({
        where: { isActive: true, weeks: payload.totalWeeks },
        orderBy: { version: 'desc' },
        select: { id: true, code: true, version: true, weeks: true, weeklyFactor: true },
      }),
      tx.creditStatusCatalog.findUnique({ where: { code: payload.statusCode } }),
      tx.installmentStatusCatalog.findUnique({ where: { code: 'PENDING' } }),
    ]);

    const clientMaps = buildClientResolutionMap(clientes);
    const promotoriaMaps = buildPromotoriaResolutionMap(promotorias);

    const cliente = resolveCliente(payload.clientExternalId, clientMaps);
    const aval = payload.avalExternalId ? resolveCliente(payload.avalExternalId, clientMaps) : null;
    const promotoria = resolvePromotoria(payload.promotoriaExternalId, promotoriaMaps);

    if (!cliente) throw new AppError('Cliente titular no encontrado para importar.', 'INVALID_CLIENTE', 422);
    if (isClientePlacementBlocked(cliente.placementStatus)) {
      throw new AppError(buildPlacementBlockedError(cliente.fullName, cliente.placementStatus), 'CLIENTE_BLOCKED_LEGAL', 422);
    }
    if (payload.avalExternalId && !aval) throw new AppError('Aval no encontrado para importar.', 'INVALID_AVAL', 422);
    if (aval && aval.id === cliente.id) throw new AppError('El aval debe ser diferente al cliente titular.', 'INVALID_AVAL', 422);
    if (!promotoria) throw new AppError('Promotoría no encontrada para importar.', 'INVALID_PROMOTORIA', 422);
    if (!planRule) throw new AppError('No existe un plan activo para las semanas indicadas.', 'INVALID_PLAN', 422);
    if (!creditStatus) throw new AppError('Estado de crédito inválido para importación.', 'INVALID_STATUS', 422);
    if (!pendingInstallmentStatus) throw new AppError('No existe el estado PENDING para cronograma.', 'CONFIGURATION_ERROR', 500);

    const startDate = new Date(`${payload.startDate}T00:00:00`);
    if (Number.isNaN(startDate.getTime())) throw new AppError('La fecha de la venta no es válida.', 'INVALID_DATE', 422);

    const existingBySaleId = await tx.credito.findFirst({ where: { saleId: payload.saleId }, select: { id: true } });
    if (existingBySaleId) throw new AppError('ID_VENTA ya existe en la base.', 'DUPLICATE_SALE_ID', 409);

    const identifiers = await generateCreditIdentifiers(tx, startDate);

    const created = await tx.credito.create({
      data: {
        folio: identifiers.folio,
        loanNumber: identifiers.loanNumber,
        saleId: payload.saleId,
        controlNumber: payload.controlNumber,
        cliente: { connect: { id: cliente.id } },
        ...(aval ? { aval: { connect: { id: aval.id } } } : {}),
        promotoria: { connect: { id: promotoria.id } },
        creditPlanRule: { connect: { id: planRule.id } },
        creditStatus: { connect: { id: creditStatus.id } },
        createdByUser: { connect: { id: userId } },
        planCodeSnapshot: planRule.code,
        planVersionSnapshot: planRule.version,
        planWeeksSnapshot: planRule.weeks,
        planFactorSnapshot: planRule.weeklyFactor,
        principalAmount: payload.principalAmount.toFixed(2),
        weeklyAmount: payload.weeklyAmount.toFixed(2),
        totalPayableAmount: payload.totalPayableAmount.toFixed(2),
        totalWeeks: payload.totalWeeks,
        startDate,
        notes: payload.notes,
      },
    });

    await tx.creditSchedule.createMany({
      data: Array.from({ length: payload.totalWeeks }, (_, index) => ({
        creditoId: created.id,
        installmentNumber: index + 1,
        dueDate: buildWeeklyDueDate(startDate, index + 1),
        expectedAmount: payload.weeklyAmount.toFixed(2),
        paidAmount: '0.00',
        installmentStatusId: pendingInstallmentStatus.id,
      })),
    });

    return {
      id: created.id,
      saleId: created.saleId,
      folio: created.folio,
      clienteName: cliente.fullName,
      avalName: aval?.fullName ?? null,
      promotoriaName: promotoria.name,
      supervisionName: promotoria.supervision?.name ?? null,
      statusName: creditStatus.name,
    };
  }, IMPORT_TRANSACTION_OPTIONS);
}

export async function commitCreditoImport(validRows: CreditoImportPreviewRow[], userId: string): Promise<CreditoImportCommitResult> {
  const imported: Array<{ id: string; saleId: string | null; folio: string; clienteName: string }> = [];
  const failedRows: CreditoImportCommitErrorRow[] = [];

  if (!validRows.length) {
    return {
      imported,
      importedCount: 0,
      failedRows,
      failedCount: 0,
      batchSize: IMPORT_BATCH_SIZE,
      summary: await buildImportIntegritySummary([]),
    };
  }

  const batches = chunkRows(validRows, IMPORT_BATCH_SIZE);

  for (const batch of batches) {
    for (const row of batch) {
      try {
        const created = await importSingleCreditoRow(row, userId);
        imported.push({ id: created.id, saleId: created.saleId, folio: created.folio, clienteName: created.clienteName });

        await writeAuditLog({
          userId,
          module: 'creditos',
          entity: 'Credito',
          entityId: created.id,
          action: 'IMPORT',
          afterJson: created,
        });
      } catch (error) {
        failedRows.push({
          rowNumber: row.rowNumber,
          saleId: row.payload.saleId,
          clientExternalId: row.payload.clientExternalId,
          message: toCommitErrorMessage(error),
        });
      }
    }
  }

  const summary = await buildImportIntegritySummary(imported.map((row) => row.id));

  return {
    imported,
    importedCount: imported.length,
    failedRows,
    failedCount: failedRows.length,
    batchSize: IMPORT_BATCH_SIZE,
    summary,
  };
}
