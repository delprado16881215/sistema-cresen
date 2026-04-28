import type { Prisma } from '@prisma/client';
import { AppError } from '@/lib/errors';
import { writeAuditLog } from '@/lib/audit';
import { normalizeToIsoDate, parseFlexibleDateInput } from '@/lib/date-input';
import { normalizeText } from '@/lib/utils';
import { normalizePhone } from '@/modules/clientes/cliente-normalizers';
import type { CobranzaExpedienteCorto } from '@/server/services/cobranza-expediente-service';
import { getCobranzaExpedienteCorto } from '@/server/services/cobranza-expediente-service';
import { getCobranzaWorkbenchData } from '@/server/services/cobranza-service';
import {
  listClientCreditsForRisk,
  listRiskInteraccionesByContext,
  listRiskVisitasCampoByContext,
} from '@/server/repositories/cobranza-risk-repository';
import {
  findAlertClienteContextById,
  findAlertCreditoContextById,
  findExpedienteAlertaRecordByFingerprint,
  findExpedienteAlertaRecordById,
  listClientesByNormalizedAddress,
  listClientesByNormalizedPhone,
  listCreditosByAvalClienteId,
  listExpedienteAlertaRecords,
  updateExpedienteAlertaRecord,
  updateManyExpedienteAlertaRecords,
  upsertExpedienteAlertaRecord,
  type AlertClienteContext,
  type AlertCreditoContext,
  type ListedExpedienteAlertaRecord,
  type SharedAddressClienteRecord,
  type SharedAvalCreditoRecord,
  type SharedPhoneClienteRecord,
} from '@/server/repositories/expediente-alert-repository';

export const EXPEDIENTE_ALERTA_TIPOS = [
  'SHARED_PHONE',
  'SHARED_ADDRESS',
  'SHARED_GUARANTOR',
  'CLIENT_GUARANTOR_SAME_PHONE',
  'EARLY_CONTACT_FAILURE',
  'ADDRESS_NOT_LOCATED_EARLY',
  'CLUSTERED_RISK_BY_PROMOTORIA',
  'EXPEDIENTE_DEBIL',
  'OTHER',
] as const;

export const EXPEDIENTE_ALERTA_SEVERIDADES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const EXPEDIENTE_ALERTA_STATUS = ['OPEN', 'REVIEWED', 'DISMISSED', 'CONFIRMED_PATTERN'] as const;

export type ExpedienteAlertaTipoCode = (typeof EXPEDIENTE_ALERTA_TIPOS)[number];
export type ExpedienteAlertaSeveridadCode = (typeof EXPEDIENTE_ALERTA_SEVERIDADES)[number];
export type ExpedienteAlertaStatusCode = (typeof EXPEDIENTE_ALERTA_STATUS)[number];

type AlertEvidence = Prisma.InputJsonObject;

type DetectedExpedienteAlertaCandidate = {
  fingerprint: string;
  clienteId?: string | null;
  creditoId?: string | null;
  promotoriaId?: string | null;
  tipoAlerta: ExpedienteAlertaTipoCode;
  severidad: ExpedienteAlertaSeveridadCode;
  descripcion: string;
  evidencia: AlertEvidence;
};

type SyncAlertResult = {
  currentAlerts: ExpedienteAlertaItem[];
  summary?: {
    creditoId: string;
    clienteId: string;
    promotoriaId: string;
    suspicious: boolean;
    weakExpediente: boolean;
    riskLevel: CobranzaExpedienteCorto['risk']['nivelRiesgo'];
  };
};

type AlertDetectionCache = {
  expedienteByCreditoId: Map<string, CobranzaExpedienteCorto | null>;
  creditoContextById: Map<string, AlertCreditoContext>;
  clienteContextById: Map<string, AlertClienteContext>;
  sharedPhoneByPhone: Map<string, SharedPhoneClienteRecord[]>;
  sharedAddressByKey: Map<string, SharedAddressClienteRecord[]>;
  sharedAvalByAvalId: Map<string, SharedAvalCreditoRecord[]>;
};

export type ExpedienteAlertaItem = {
  id: string;
  fingerprint: string;
  clienteId: string | null;
  creditoId: string | null;
  promotoriaId: string | null;
  tipoAlerta: ExpedienteAlertaTipoCode;
  severidad: ExpedienteAlertaSeveridadCode;
  descripcion: string;
  evidencia: AlertEvidence;
  status: ExpedienteAlertaStatusCode;
  isCurrent: boolean;
  detectedAt: string;
  lastSeenAt: string;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
  updatedAt: string;
  cliente: {
    id: string;
    code: string;
    fullName: string;
  } | null;
  credito: {
    id: string;
    folio: string;
    loanNumber: string;
  } | null;
  promotoria: {
    id: string;
    code: string;
    name: string;
  } | null;
  reviewedBy: {
    id: string;
    name: string;
  } | null;
};

type ListExpedienteAlertasInput = {
  clienteId?: string;
  creditoId?: string;
  promotoriaId?: string;
  tipoAlerta?: ExpedienteAlertaTipoCode;
  severidad?: ExpedienteAlertaSeveridadCode;
  status?: ExpedienteAlertaStatusCode;
  isCurrent?: boolean;
};

type UpdateExpedienteAlertaInput = {
  status: ExpedienteAlertaStatusCode;
  reviewNotes?: string | null;
};

const SHARED_PHONE_MIN_CLIENTS = 3;
const SHARED_ADDRESS_MIN_CLIENTS = 3;
const SHARED_GUARANTOR_MIN_CREDITS = 3;
const EARLY_WINDOW_DAYS = 35;
const EARLY_SIGNAL_WINDOW_DAYS = 21;
const GUARANTOR_LOOKBACK_DAYS = 365;
const CLUSTERED_RISK_MIN_CASES = 5;

const CLIENT_LEVEL_ALERT_TYPES: ExpedienteAlertaTipoCode[] = ['SHARED_PHONE', 'SHARED_ADDRESS'];
const CREDIT_LEVEL_ALERT_TYPES: ExpedienteAlertaTipoCode[] = [
  'SHARED_GUARANTOR',
  'CLIENT_GUARANTOR_SAME_PHONE',
  'EARLY_CONTACT_FAILURE',
  'ADDRESS_NOT_LOCATED_EARLY',
  'EXPEDIENTE_DEBIL',
];
const SUCCESSFUL_INTERACTION_RESULTS = new Set(['CONTACTED', 'PROMISE_REGISTERED', 'PAID_REPORTED']);
const FAILED_VISIT_RESULTS = new Set(['CLIENT_NOT_HOME', 'ADDRESS_NOT_FOUND', 'FOLLOW_UP_REQUIRED', 'REFUSED_CONTACT']);

function createDetectionCache(): AlertDetectionCache {
  return {
    expedienteByCreditoId: new Map(),
    creditoContextById: new Map(),
    clienteContextById: new Map(),
    sharedPhoneByPhone: new Map(),
    sharedAddressByKey: new Map(),
    sharedAvalByAvalId: new Map(),
  };
}

function toDateAtNoon(value: string | Date) {
  const parsed = parseFlexibleDateInput(value);
  if (parsed) {
    parsed.setHours(12, 0, 0, 0);
    return parsed;
  }

  const fallback = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(fallback.getTime())) {
    throw new Error(`No se pudo interpretar la fecha ${String(value)}`);
  }
  fallback.setHours(12, 0, 0, 0);
  return fallback;
}

function toIsoDate(value: string | Date) {
  if (typeof value === 'string') {
    const normalized = normalizeToIsoDate(value);
    if (normalized) return normalized;
  }
  return toDateAtNoon(value).toISOString().slice(0, 10);
}

function toIsoDateTime(value: Date) {
  return value.toISOString();
}

function getDefaultOccurredAt(value?: string) {
  return normalizeToIsoDate(value) ?? normalizeToIsoDate(new Date()) ?? new Date().toISOString().slice(0, 10);
}

function diffDays(fromIso: string, toValue: string | Date) {
  const from = toDateAtNoon(fromIso);
  const to = toDateAtNoon(toValue);
  return Math.max(0, Math.floor((from.getTime() - to.getTime()) / 86_400_000));
}

function addDays(baseIso: string, days: number) {
  const date = toDateAtNoon(baseIso);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function maskPhone(phone: string) {
  const normalized = normalizePhone(phone);
  if (normalized.length < 4) return normalized;
  return `${normalized.slice(0, 3)}XXXX${normalized.slice(-3)}`;
}

function serializeExpedienteAlerta(record: ListedExpedienteAlertaRecord): ExpedienteAlertaItem {
  return {
    id: record.id,
    fingerprint: record.fingerprint,
    clienteId: record.clienteId ?? null,
    creditoId: record.creditoId ?? null,
    promotoriaId: record.promotoriaId ?? null,
    tipoAlerta: record.tipoAlerta,
    severidad: record.severidad,
    descripcion: record.descripcion,
    evidencia:
      record.evidenciaJson && typeof record.evidenciaJson === 'object' && !Array.isArray(record.evidenciaJson)
        ? (record.evidenciaJson as Prisma.InputJsonObject)
        : ({} as Prisma.InputJsonObject),
    status: record.status,
    isCurrent: record.isCurrent,
    detectedAt: toIsoDateTime(record.detectedAt),
    lastSeenAt: toIsoDateTime(record.lastSeenAt),
    reviewedAt: record.reviewedAt ? toIsoDateTime(record.reviewedAt) : null,
    reviewNotes: record.reviewNotes ?? null,
    createdAt: toIsoDateTime(record.createdAt),
    updatedAt: toIsoDateTime(record.updatedAt),
    cliente: record.cliente
      ? {
          id: record.cliente.id,
          code: record.cliente.code,
          fullName: record.cliente.fullName,
        }
      : null,
    credito: record.credito
      ? {
          id: record.credito.id,
          folio: record.credito.folio,
          loanNumber: record.credito.loanNumber,
        }
      : null,
    promotoria: record.promotoria
      ? {
          id: record.promotoria.id,
          code: record.promotoria.code,
          name: record.promotoria.name,
        }
      : null,
    reviewedBy: record.reviewedByUser
      ? {
          id: record.reviewedByUser.id,
          name: record.reviewedByUser.name,
        }
      : null,
  };
}

function uniquePhones(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => normalizePhone(value)).filter((value) => value.length === 10))];
}

function buildAddressSignature(client: NonNullable<AlertClienteContext>) {
  const searchableAddress = client.searchableAddress?.trim() ?? '';
  const neighborhood = client.neighborhood?.trim() ?? null;
  const city = client.city?.trim() ?? null;

  if (!searchableAddress || searchableAddress.length < 12) return null;
  if (!neighborhood && !city) return null;

  const label = [client.address, neighborhood, city, client.state].filter(Boolean).join(', ');
  return {
    key: `${searchableAddress}|${normalizeText(neighborhood ?? '')}|${normalizeText(city ?? '')}`,
    searchableAddress,
    neighborhood,
    city,
    label,
  };
}

function getSharedPhoneSeverity(totalClients: number): ExpedienteAlertaSeveridadCode {
  if (totalClients >= 6) return 'CRITICAL';
  if (totalClients >= 4) return 'HIGH';
  return 'MEDIUM';
}

function getSharedAddressSeverity(totalClients: number): ExpedienteAlertaSeveridadCode {
  if (totalClients >= 7) return 'CRITICAL';
  if (totalClients >= 5) return 'HIGH';
  return 'MEDIUM';
}

function getSharedGuarantorSeverity(totalCredits: number): ExpedienteAlertaSeveridadCode {
  if (totalCredits >= 6) return 'CRITICAL';
  if (totalCredits >= 4) return 'HIGH';
  return 'MEDIUM';
}

async function getExpedienteCached(
  creditoId: string,
  occurredAt: string,
  cache: AlertDetectionCache,
) {
  if (!cache.expedienteByCreditoId.has(creditoId)) {
    cache.expedienteByCreditoId.set(
      creditoId,
      await getCobranzaExpedienteCorto({ creditoId, occurredAt }),
    );
  }
  return cache.expedienteByCreditoId.get(creditoId) ?? null;
}

async function getCreditoContextCached(creditoId: string, cache: AlertDetectionCache) {
  if (!cache.creditoContextById.has(creditoId)) {
    const context = await findAlertCreditoContextById(creditoId);
    if (!context) {
      throw new AppError('Crédito no encontrado para alertas.', 'CREDITO_NOT_FOUND', 404);
    }
    cache.creditoContextById.set(creditoId, context);
  }
  return cache.creditoContextById.get(creditoId)!;
}

async function getClienteContextCached(clienteId: string, cache: AlertDetectionCache) {
  if (!cache.clienteContextById.has(clienteId)) {
    const context = await findAlertClienteContextById(clienteId);
    if (!context) {
      throw new AppError('Cliente no encontrado para alertas.', 'CLIENTE_NOT_FOUND', 404);
    }
    cache.clienteContextById.set(clienteId, context);
  }
  return cache.clienteContextById.get(clienteId)!;
}

async function getPhoneMatchesCached(phone: string, cache: AlertDetectionCache) {
  if (!cache.sharedPhoneByPhone.has(phone)) {
    cache.sharedPhoneByPhone.set(phone, await listClientesByNormalizedPhone(phone));
  }
  return cache.sharedPhoneByPhone.get(phone) ?? [];
}

async function getAddressMatchesCached(
  key: string,
  input: { searchableAddress: string; neighborhood?: string | null; city?: string | null },
  cache: AlertDetectionCache,
) {
  if (!cache.sharedAddressByKey.has(key)) {
    cache.sharedAddressByKey.set(key, await listClientesByNormalizedAddress(input));
  }
  return cache.sharedAddressByKey.get(key) ?? [];
}

async function getSharedAvalCreditsCached(avalClienteId: string, occurredAt: string, cache: AlertDetectionCache) {
  if (!cache.sharedAvalByAvalId.has(avalClienteId)) {
    const startedFrom = toDateAtNoon(addDays(occurredAt, -GUARANTOR_LOOKBACK_DAYS));
    cache.sharedAvalByAvalId.set(
      avalClienteId,
      await listCreditosByAvalClienteId({
        avalClienteId,
        startedFrom,
      }),
    );
  }
  return cache.sharedAvalByAvalId.get(avalClienteId) ?? [];
}

function buildClientScopeWhere(clienteId: string): Prisma.ExpedienteAlertaWhereInput {
  return {
    clienteId,
    creditoId: null,
    tipoAlerta: {
      in: CLIENT_LEVEL_ALERT_TYPES,
    },
  };
}

function buildCreditScopeWhere(creditoId: string): Prisma.ExpedienteAlertaWhereInput {
  return {
    creditoId,
    tipoAlerta: {
      in: CREDIT_LEVEL_ALERT_TYPES,
    },
  };
}

function buildPromotoriaScopeWhere(promotoriaId: string): Prisma.ExpedienteAlertaWhereInput {
  return {
    promotoriaId,
    clienteId: null,
    creditoId: null,
    tipoAlerta: 'CLUSTERED_RISK_BY_PROMOTORIA',
  };
}

async function persistDetectedAlertCandidates(input: {
  candidates: DetectedExpedienteAlertaCandidate[];
  scopeWhere: Prisma.ExpedienteAlertaWhereInput;
  detectedAt: Date;
}) {
  const seenFingerprints: string[] = [];

  for (const candidate of input.candidates) {
    const existing = await findExpedienteAlertaRecordByFingerprint(candidate.fingerprint);
    const preserveManualStatus =
      existing?.status === 'DISMISSED' || existing?.status === 'CONFIRMED_PATTERN';
    const reopenReviewed = existing?.status === 'REVIEWED';

    await upsertExpedienteAlertaRecord({
      fingerprint: candidate.fingerprint,
      create: {
        fingerprint: candidate.fingerprint,
        clienteId: candidate.clienteId ?? null,
        creditoId: candidate.creditoId ?? null,
        promotoriaId: candidate.promotoriaId ?? null,
        tipoAlerta: candidate.tipoAlerta,
        severidad: candidate.severidad,
        descripcion: candidate.descripcion,
        evidenciaJson: candidate.evidencia,
        status: 'OPEN',
        isCurrent: true,
        detectedAt: input.detectedAt,
        lastSeenAt: input.detectedAt,
        reviewedAt: null,
        reviewedByUserId: null,
        reviewNotes: null,
      },
      update: {
        clienteId: candidate.clienteId ?? null,
        creditoId: candidate.creditoId ?? null,
        promotoriaId: candidate.promotoriaId ?? null,
        tipoAlerta: candidate.tipoAlerta,
        severidad: candidate.severidad,
        descripcion: candidate.descripcion,
        evidenciaJson: candidate.evidencia,
        detectedAt: input.detectedAt,
        lastSeenAt: input.detectedAt,
        isCurrent: true,
        status: preserveManualStatus ? existing!.status : 'OPEN',
        reviewedAt: preserveManualStatus ? existing!.reviewedAt : reopenReviewed ? null : existing?.reviewedAt ?? null,
        reviewedByUserId: preserveManualStatus
          ? existing!.reviewedByUserId ?? null
          : reopenReviewed
            ? null
            : existing?.reviewedByUserId ?? null,
        reviewNotes: preserveManualStatus ? existing!.reviewNotes ?? null : reopenReviewed ? null : existing?.reviewNotes ?? null,
      },
    });

    seenFingerprints.push(candidate.fingerprint);
  }

  await updateManyExpedienteAlertaRecords(
    {
      ...input.scopeWhere,
      isCurrent: true,
      fingerprint: {
        notIn: seenFingerprints,
      },
    },
    {
      isCurrent: false,
    },
  );
}

function buildRelatedClientEvidence(records: SharedPhoneClienteRecord[] | SharedAddressClienteRecord[]) {
  return records.slice(0, 5).map((item) => ({
    clienteId: item.id,
    code: item.code,
    nombre: item.fullName,
  }));
}

async function detectSharedPhoneAlertForCliente(input: {
  cliente: NonNullable<AlertClienteContext>;
  cache: AlertDetectionCache;
}): Promise<DetectedExpedienteAlertaCandidate | null> {
  const phones = uniquePhones([input.cliente.phone, input.cliente.secondaryPhone]);
  if (!phones.length) return null;

  let best:
    | {
        phone: string;
        matches: SharedPhoneClienteRecord[];
      }
    | null = null;

  for (const phone of phones) {
    const matches = (await getPhoneMatchesCached(phone, input.cache)).filter(
      (item) => item.id !== input.cliente.id,
    );
    const totalClients = matches.length + 1;
    if (totalClients < SHARED_PHONE_MIN_CLIENTS) continue;

    if (!best || matches.length > best.matches.length) {
      best = { phone, matches };
    }
  }

  if (!best) return null;

  const totalClients = best.matches.length + 1;

  return {
    fingerprint: `CLIENT:${input.cliente.id}|SHARED_PHONE|${best.phone}`,
    clienteId: input.cliente.id,
    tipoAlerta: 'SHARED_PHONE',
    severidad: getSharedPhoneSeverity(totalClients),
    descripcion: `El teléfono ${maskPhone(best.phone)} aparece compartido entre ${totalClients} clientes distintos.`,
    evidencia: {
      telefono: best.phone,
      telefonoMasked: maskPhone(best.phone),
      totalClientes: totalClients,
      clientesRelacionados: buildRelatedClientEvidence(best.matches),
    },
  };
}

async function detectSharedAddressAlertForCliente(input: {
  cliente: NonNullable<AlertClienteContext>;
  cache: AlertDetectionCache;
}): Promise<DetectedExpedienteAlertaCandidate | null> {
  const signature = buildAddressSignature(input.cliente);
  if (!signature) return null;

  const matches = (
    await getAddressMatchesCached(
      signature.key,
      {
        searchableAddress: signature.searchableAddress,
        neighborhood: signature.neighborhood,
        city: signature.city,
      },
      input.cache,
    )
  ).filter((item) => item.id !== input.cliente.id);
  const totalClients = matches.length + 1;

  if (totalClients < SHARED_ADDRESS_MIN_CLIENTS) {
    return null;
  }

  return {
    fingerprint: `CLIENT:${input.cliente.id}|SHARED_ADDRESS|${signature.key}`,
    clienteId: input.cliente.id,
    tipoAlerta: 'SHARED_ADDRESS',
    severidad: getSharedAddressSeverity(totalClients),
    descripcion: `El domicilio ${signature.label} aparece repetido entre ${totalClients} clientes.`,
    evidencia: {
      direccion: signature.label,
      totalClientes: totalClients,
      clientesRelacionados: buildRelatedClientEvidence(matches),
    },
  };
}

async function detectSharedGuarantorAlertForCredito(input: {
  credito: NonNullable<AlertCreditoContext>;
  occurredAt: string;
  cache: AlertDetectionCache;
}): Promise<DetectedExpedienteAlertaCandidate | null> {
  if (!input.credito.avalClienteId || !input.credito.aval) return null;

  const matches = await getSharedAvalCreditsCached(input.credito.avalClienteId, input.occurredAt, input.cache);
  const totalCredits = matches.length;

  if (totalCredits < SHARED_GUARANTOR_MIN_CREDITS) {
    return null;
  }

  return {
    fingerprint: `CREDIT:${input.credito.id}|SHARED_GUARANTOR|${input.credito.avalClienteId}`,
    clienteId: input.credito.clienteId,
    creditoId: input.credito.id,
    promotoriaId: input.credito.promotoriaId,
    tipoAlerta: 'SHARED_GUARANTOR',
    severidad: getSharedGuarantorSeverity(totalCredits),
    descripcion: `El aval ${input.credito.aval.code} · ${input.credito.aval.fullName} aparece asociado a ${totalCredits} créditos activos o recientes.`,
    evidencia: {
      aval: {
        clienteId: input.credito.aval.id,
        code: input.credito.aval.code,
        nombre: input.credito.aval.fullName,
      },
      totalCreditos: totalCredits,
      creditosRelacionados: matches.slice(0, 6).map((item) => ({
        creditoId: item.id,
        folio: item.folio,
        loanNumber: item.loanNumber,
        cliente: `${item.cliente.code} · ${item.cliente.fullName}`,
        promotoria: item.promotoria.name,
      })),
    },
  };
}

function detectClientGuarantorSamePhoneAlertForCredito(input: {
  credito: NonNullable<AlertCreditoContext>;
}): DetectedExpedienteAlertaCandidate | null {
  const clientePhones = uniquePhones([input.credito.cliente.phone, input.credito.cliente.secondaryPhone]);
  const avalPhones = uniquePhones([input.credito.aval?.phone, input.credito.aval?.secondaryPhone]);
  const overlappingPhones = clientePhones.filter((phone) => avalPhones.includes(phone));

  if (!overlappingPhones.length || !input.credito.aval) {
    return null;
  }

  const samePrimaryPhone = normalizePhone(input.credito.cliente.phone) === normalizePhone(input.credito.aval.phone);

  return {
    fingerprint: `CREDIT:${input.credito.id}|CLIENT_GUARANTOR_SAME_PHONE`,
    clienteId: input.credito.clienteId,
    creditoId: input.credito.id,
    promotoriaId: input.credito.promotoriaId,
    tipoAlerta: 'CLIENT_GUARANTOR_SAME_PHONE',
    severidad: samePrimaryPhone || overlappingPhones.length > 1 ? 'HIGH' : 'MEDIUM',
    descripcion: `Cliente y aval comparten ${overlappingPhones.length > 1 ? 'más de un' : 'un'} teléfono de contacto.`,
    evidencia: {
      telefonosCoincidentes: overlappingPhones.map((phone) => ({
        telefono: phone,
        telefonoMasked: maskPhone(phone),
      })),
      cliente: {
        clienteId: input.credito.cliente.id,
        code: input.credito.cliente.code,
        nombre: input.credito.cliente.fullName,
      },
      aval: {
        clienteId: input.credito.aval.id,
        code: input.credito.aval.code,
        nombre: input.credito.aval.fullName,
      },
    },
  };
}

async function getCreditEarlySignals(input: {
  expediente: CobranzaExpedienteCorto;
}) {
  const clienteId = input.expediente.operativaPanel.cliente.id;
  const creditoId = input.expediente.operativaPanel.credito.id;
  const [interacciones, visitas] = await Promise.all([
    listRiskInteraccionesByContext({ clienteId, creditoId }),
    listRiskVisitasCampoByContext({ clienteId, creditoId }),
  ]);

  const contextInteracciones = interacciones.filter(
    (item) => item.creditoId === creditoId || item.creditoId == null,
  );
  const contextVisitas = visitas.filter((item) => item.creditoId === creditoId || item.creditoId == null);
  const occurredAt = input.expediente.occurredAt;
  const openedAt = input.expediente.header.creditOpenedAt;
  const creditAgeDays = diffDays(occurredAt, openedAt);
  const earlySignalCutoff = addDays(openedAt, EARLY_SIGNAL_WINDOW_DAYS);
  const earlyAge = creditAgeDays <= EARLY_WINDOW_DAYS;

  const earlyInteracciones = contextInteracciones.filter(
    (item) => toIsoDate(item.fechaHora) <= earlySignalCutoff,
  );
  const earlyVisitas = contextVisitas.filter((item) => toIsoDate(item.fechaHora) <= earlySignalCutoff);

  const wrongNumberEarly = earlyInteracciones.some((item) => item.resultado === 'WRONG_NUMBER');
  const failedContactAttemptsEarlyCount = earlyInteracciones.filter((item) => {
    if (item.tipo === 'NOTE') return false;
    return !SUCCESSFUL_INTERACTION_RESULTS.has(item.resultado);
  }).length;
  const successfulContactEarly = earlyInteracciones.some((item) =>
    SUCCESSFUL_INTERACTION_RESULTS.has(item.resultado),
  );
  const addressNotLocatedEarly = earlyVisitas.some((item) => item.resultado === 'ADDRESS_NOT_FOUND');
  const failedVisitsEarlyCount = earlyVisitas.filter((item) =>
    FAILED_VISIT_RESULTS.has(item.resultado),
  ).length;
  const successfulVisitEarly = earlyVisitas.some((item) => item.resultado === 'VISIT_SUCCESSFUL');
  const earlyDelinquency =
    earlyAge &&
    (input.expediente.actionable.pendingFailuresCount > 0 || input.expediente.risk.diasAtraso >= 7);

  return {
    earlyAge,
    creditAgeDays,
    wrongNumberEarly,
    failedContactAttemptsEarlyCount,
    successfulContactEarly,
    addressNotLocatedEarly,
    failedVisitsEarlyCount,
    successfulVisitEarly,
    earlyDelinquency,
  };
}

async function detectEarlyOperationalAlertsForCredito(input: {
  expediente: CobranzaExpedienteCorto;
  credito: NonNullable<AlertCreditoContext>;
}) {
  const signals = await getCreditEarlySignals({ expediente: input.expediente });
  const phoneInvalid = input.expediente.contactability.phoneStatus === 'INVALID';
  const addressNotLocated = input.expediente.contactability.addressStatus === 'NOT_LOCATED';
  const noRecentSuccessfulContact = !input.expediente.contactability.hasRecentSuccessfulContact;
  const noEarlySuccessfulContact = !signals.successfulContactEarly && !signals.successfulVisitEarly;
  const noOperationalPromise =
    input.expediente.promises.pendingCount === 0 &&
    input.expediente.promises.brokenCount === 0 &&
    input.expediente.promises.latestRegistered == null;

  const candidates: DetectedExpedienteAlertaCandidate[] = [];

  if (
    signals.earlyAge &&
    (signals.addressNotLocatedEarly || (addressNotLocated && signals.failedVisitsEarlyCount > 0))
  ) {
    const severity: ExpedienteAlertaSeveridadCode =
      signals.failedVisitsEarlyCount >= 2 || noEarlySuccessfulContact ? 'HIGH' : 'MEDIUM';

    candidates.push({
      fingerprint: `CREDIT:${input.credito.id}|ADDRESS_NOT_LOCATED_EARLY`,
      clienteId: input.credito.clienteId,
      creditoId: input.credito.id,
      promotoriaId: input.credito.promotoriaId,
      tipoAlerta: 'ADDRESS_NOT_LOCATED_EARLY',
      severidad: severity,
      descripcion: 'El domicilio no pudo localizarse durante la etapa temprana de vida del crédito.',
      evidencia: {
        creditAgeDays: signals.creditAgeDays,
        failedVisitsEarlyCount: signals.failedVisitsEarlyCount,
        addressNotLocatedEarly: signals.addressNotLocatedEarly,
        addressStatus: input.expediente.contactability.addressStatus,
      },
    });
  }

  if (
    signals.earlyAge &&
    signals.earlyDelinquency &&
    (signals.wrongNumberEarly ||
      signals.addressNotLocatedEarly ||
      signals.failedContactAttemptsEarlyCount >= 3 ||
      signals.failedVisitsEarlyCount >= 1)
  ) {
    const severity: ExpedienteAlertaSeveridadCode =
      (signals.wrongNumberEarly && signals.addressNotLocatedEarly) ||
      (signals.failedContactAttemptsEarlyCount >= 4 && signals.failedVisitsEarlyCount >= 1)
        ? 'HIGH'
        : 'MEDIUM';

    candidates.push({
      fingerprint: `CREDIT:${input.credito.id}|EARLY_CONTACT_FAILURE`,
      clienteId: input.credito.clienteId,
      creditoId: input.credito.id,
      promotoriaId: input.credito.promotoriaId,
      tipoAlerta: 'EARLY_CONTACT_FAILURE',
      severidad: severity,
      descripcion: 'El crédito muestra deterioro temprano acompañado por fallas tempranas de contacto o localización.',
      evidencia: {
        creditAgeDays: signals.creditAgeDays,
        earlyDelinquency: signals.earlyDelinquency,
        wrongNumberEarly: signals.wrongNumberEarly,
        addressNotLocatedEarly: signals.addressNotLocatedEarly,
        failedContactAttemptsEarlyCount: signals.failedContactAttemptsEarlyCount,
        failedVisitsEarlyCount: signals.failedVisitsEarlyCount,
      },
    });
  }

  const weakSignalCodes = [
    phoneInvalid ? 'PHONE_INVALID' : null,
    addressNotLocated ? 'ADDRESS_NOT_LOCATED' : null,
    signals.earlyDelinquency ? 'EARLY_DELINQUENCY' : null,
    signals.failedContactAttemptsEarlyCount >= 3 ? 'MULTIPLE_FAILED_CONTACT_ATTEMPTS_EARLY' : null,
    signals.failedVisitsEarlyCount >= 1 ? 'FAILED_VISIT_EARLY' : null,
    (noRecentSuccessfulContact && noEarlySuccessfulContact) ? 'NO_SUCCESSFUL_CONTACT' : null,
    (noOperationalPromise && signals.failedContactAttemptsEarlyCount >= 2) ? 'NO_OPERATIONAL_PROMISE' : null,
  ].filter((value): value is string => Boolean(value));

  if (
    signals.earlyAge &&
    (weakSignalCodes.length >= 3 || (phoneInvalid && addressNotLocated))
  ) {
    const severity: ExpedienteAlertaSeveridadCode =
      weakSignalCodes.length >= 4 || (phoneInvalid && addressNotLocated && signals.earlyDelinquency)
        ? 'HIGH'
        : 'MEDIUM';

    candidates.push({
      fingerprint: `CREDIT:${input.credito.id}|EXPEDIENTE_DEBIL`,
      clienteId: input.credito.clienteId,
      creditoId: input.credito.id,
      promotoriaId: input.credito.promotoriaId,
      tipoAlerta: 'EXPEDIENTE_DEBIL',
      severidad: severity,
      descripcion: 'El expediente presenta varias señales tempranas de debilidad operativa y baja calidad de localización.',
      evidencia: {
        creditAgeDays: signals.creditAgeDays,
        signalCodes: weakSignalCodes,
        phoneStatus: input.expediente.contactability.phoneStatus,
        addressStatus: input.expediente.contactability.addressStatus,
        pendingFailuresCount: input.expediente.actionable.pendingFailuresCount,
        diasAtraso: input.expediente.risk.diasAtraso,
      },
    });
  }

  return {
    candidates,
    weakExpediente: candidates.some((item) => item.tipoAlerta === 'EXPEDIENTE_DEBIL'),
  };
}

async function detectClientScopedAlerts(input: {
  clienteId: string;
  cache: AlertDetectionCache;
}) {
  const cliente = await getClienteContextCached(input.clienteId, input.cache);
  const candidates = (
    await Promise.all([
      detectSharedPhoneAlertForCliente({ cliente, cache: input.cache }),
      detectSharedAddressAlertForCliente({ cliente, cache: input.cache }),
    ])
  ).filter((item): item is DetectedExpedienteAlertaCandidate => item != null);

  return { cliente, candidates };
}

async function detectCreditScopedAlerts(input: {
  creditoId: string;
  occurredAt: string;
  cache: AlertDetectionCache;
}) {
  const credito = await getCreditoContextCached(input.creditoId, input.cache);
  const expediente = await getExpedienteCached(input.creditoId, input.occurredAt, input.cache);
  if (!expediente) {
    throw new AppError('No se pudo resolver el expediente corto para alertas.', 'COBRANZA_EXPEDIENTE_NOT_FOUND', 404);
  }

  const earlyOperational = await detectEarlyOperationalAlertsForCredito({
    expediente,
    credito,
  });

  const candidates = (
    await Promise.all([
      detectSharedGuarantorAlertForCredito({
        credito,
        occurredAt: input.occurredAt,
        cache: input.cache,
      }),
      Promise.resolve(detectClientGuarantorSamePhoneAlertForCredito({ credito })),
    ])
  ).filter((item): item is DetectedExpedienteAlertaCandidate => item != null);

  candidates.push(...earlyOperational.candidates);

  return {
    credito,
    expediente,
    candidates,
    summary: {
      creditoId: credito.id,
      clienteId: credito.clienteId,
      promotoriaId: credito.promotoriaId,
      suspicious:
        candidates.some((candidate) => candidate.severidad === 'HIGH' || candidate.severidad === 'CRITICAL') ||
        earlyOperational.weakExpediente,
      weakExpediente: earlyOperational.weakExpediente,
      riskLevel: expediente.risk.nivelRiesgo,
    },
  };
}

function getCurrentCaseAlertWhere(input: {
  creditoId: string;
  clienteId: string;
}) {
  return {
    OR: [
      {
        creditoId: input.creditoId,
        isCurrent: true,
        status: { not: 'DISMISSED' as const },
      },
      {
        clienteId: input.clienteId,
        creditoId: null,
        isCurrent: true,
        status: { not: 'DISMISSED' as const },
        tipoAlerta: {
          in: CLIENT_LEVEL_ALERT_TYPES,
        },
      },
    ],
  } satisfies Prisma.ExpedienteAlertaWhereInput;
}

async function listCurrentCaseAlerts(input: {
  creditoId: string;
  clienteId: string;
}) {
  const rows = await listExpedienteAlertaRecords(getCurrentCaseAlertWhere(input));
  return rows.map(serializeExpedienteAlerta);
}

export async function syncExpedienteAlertasForCredito(input: {
  creditoId: string;
  occurredAt?: string;
  cache?: AlertDetectionCache;
}): Promise<SyncAlertResult> {
  const occurredAt = getDefaultOccurredAt(input.occurredAt);
  const cache = input.cache ?? createDetectionCache();
  const detectedAt = new Date();
  const creditScope = await detectCreditScopedAlerts({
    creditoId: input.creditoId,
    occurredAt,
    cache,
  });
  const clientScope = await detectClientScopedAlerts({
    clienteId: creditScope.credito.clienteId,
    cache,
  });

  await persistDetectedAlertCandidates({
    candidates: clientScope.candidates,
    scopeWhere: buildClientScopeWhere(creditScope.credito.clienteId),
    detectedAt,
  });
  await persistDetectedAlertCandidates({
    candidates: creditScope.candidates,
    scopeWhere: buildCreditScopeWhere(creditScope.credito.id),
    detectedAt,
  });

  return {
    currentAlerts: await listCurrentCaseAlerts({
      creditoId: creditScope.credito.id,
      clienteId: creditScope.credito.clienteId,
    }),
    summary: creditScope.summary,
  };
}

export async function syncExpedienteAlertasForCliente(input: {
  clienteId: string;
  occurredAt?: string;
}): Promise<ExpedienteAlertaItem[]> {
  const occurredAt = getDefaultOccurredAt(input.occurredAt);
  const cache = createDetectionCache();
  const detectedAt = new Date();

  const clientScope = await detectClientScopedAlerts({
    clienteId: input.clienteId,
    cache,
  });
  await persistDetectedAlertCandidates({
    candidates: clientScope.candidates,
    scopeWhere: buildClientScopeWhere(input.clienteId),
    detectedAt,
  });

  const credits = await listClientCreditsForRisk(input.clienteId);
  for (const credit of credits) {
    await syncExpedienteAlertasForCredito({
      creditoId: credit.id,
      occurredAt,
      cache,
    });
  }

  const rows = await listExpedienteAlertaRecords({
    clienteId: input.clienteId,
    isCurrent: true,
    status: { not: 'DISMISSED' },
  });

  return rows.map(serializeExpedienteAlerta);
}

async function syncPromotoriaClusterAlert(input: {
  promotoriaId: string;
  promotoriaCode: string;
  promotoriaName: string;
  totalCases: number;
  suspiciousCases: number;
  weakExpedienteCases: number;
  criticalRiskCases: number;
  creditSamples: Array<{
    creditoId: string;
    cliente: string;
    folio: string;
    riskLevel: string;
  }>;
  detectedAt: Date;
}) {
  let candidate: DetectedExpedienteAlertaCandidate | null = null;
  const suspiciousRatio = input.totalCases > 0 ? input.suspiciousCases / input.totalCases : 0;

  if (
    input.totalCases >= CLUSTERED_RISK_MIN_CASES &&
    input.criticalRiskCases >= 4 &&
    suspiciousRatio >= 0.6
  ) {
    candidate = {
      fingerprint: `PROMOTORIA:${input.promotoriaId}|CLUSTERED_RISK_BY_PROMOTORIA`,
      promotoriaId: input.promotoriaId,
      tipoAlerta: 'CLUSTERED_RISK_BY_PROMOTORIA',
      severidad: 'CRITICAL',
      descripcion: `La promotoría ${input.promotoriaName} concentra casos críticos y expedientes sospechosos por encima de lo esperado.`,
      evidencia: {
        totalCasos: input.totalCases,
        casosSospechosos: input.suspiciousCases,
        casosExpedienteDebil: input.weakExpedienteCases,
        casosRiesgoCritico: input.criticalRiskCases,
        ratioSospechoso: Number(suspiciousRatio.toFixed(2)),
        muestras: input.creditSamples.slice(0, 6),
      },
    };
  } else if (
    input.totalCases >= CLUSTERED_RISK_MIN_CASES &&
    input.suspiciousCases >= 3 &&
    suspiciousRatio >= 0.45
  ) {
    candidate = {
      fingerprint: `PROMOTORIA:${input.promotoriaId}|CLUSTERED_RISK_BY_PROMOTORIA`,
      promotoriaId: input.promotoriaId,
      tipoAlerta: 'CLUSTERED_RISK_BY_PROMOTORIA',
      severidad: 'HIGH',
      descripcion: `La promotoría ${input.promotoriaName} muestra una concentración alta de expedientes débiles o casos sospechosos.`,
      evidencia: {
        totalCasos: input.totalCases,
        casosSospechosos: input.suspiciousCases,
        casosExpedienteDebil: input.weakExpedienteCases,
        casosRiesgoCritico: input.criticalRiskCases,
        ratioSospechoso: Number(suspiciousRatio.toFixed(2)),
        muestras: input.creditSamples.slice(0, 6),
      },
    };
  } else if (
    input.totalCases >= CLUSTERED_RISK_MIN_CASES &&
    input.suspiciousCases >= 3 &&
    suspiciousRatio >= 0.3
  ) {
    candidate = {
      fingerprint: `PROMOTORIA:${input.promotoriaId}|CLUSTERED_RISK_BY_PROMOTORIA`,
      promotoriaId: input.promotoriaId,
      tipoAlerta: 'CLUSTERED_RISK_BY_PROMOTORIA',
      severidad: 'MEDIUM',
      descripcion: `La promotoría ${input.promotoriaName} empieza a mostrar una concentración operativa anómala que conviene revisar.`,
      evidencia: {
        totalCasos: input.totalCases,
        casosSospechosos: input.suspiciousCases,
        casosExpedienteDebil: input.weakExpedienteCases,
        casosRiesgoCritico: input.criticalRiskCases,
        ratioSospechoso: Number(suspiciousRatio.toFixed(2)),
        muestras: input.creditSamples.slice(0, 6),
      },
    };
  }

  await persistDetectedAlertCandidates({
    candidates: candidate ? [candidate] : [],
    scopeWhere: buildPromotoriaScopeWhere(input.promotoriaId),
    detectedAt: input.detectedAt,
  });
}

export async function syncExpedienteAlertasForPortfolio(input: {
  occurredAt?: string;
  supervisionId?: string;
  promotoriaId?: string;
}) {
  const occurredAt = getDefaultOccurredAt(input.occurredAt);
  const detectedAt = new Date();
  const cache = createDetectionCache();
  const workbench = await getCobranzaWorkbenchData({
    occurredAt,
    scope: 'all',
    supervisionId: input.supervisionId,
    promotoriaId: input.promotoriaId,
    rowMode: 'all',
    cycle: 'all',
  });

  const rows = [...new Map(workbench.rows.map((row) => [row.creditoId, row])).values()];
  const uniqueClientIds = [...new Set(rows.map((row) => row.clienteId))];

  for (const clienteId of uniqueClientIds) {
    const clientScope = await detectClientScopedAlerts({ clienteId, cache });
    await persistDetectedAlertCandidates({
      candidates: clientScope.candidates,
      scopeWhere: buildClientScopeWhere(clienteId),
      detectedAt,
    });
  }

  const creditSummaries: NonNullable<SyncAlertResult['summary']>[] = [];
  for (const row of rows) {
    const result = await syncExpedienteAlertasForCredito({
      creditoId: row.creditoId,
      occurredAt,
      cache,
    });
    if (result.summary) {
      creditSummaries.push(result.summary);
    }
  }

  const byPromotoria = new Map<
    string,
    {
      promotoriaId: string;
      promotoriaCode: string;
      promotoriaName: string;
      totalCases: number;
      suspiciousCases: number;
      weakExpedienteCases: number;
      criticalRiskCases: number;
      creditSamples: Array<{
        creditoId: string;
        cliente: string;
        folio: string;
        riskLevel: string;
      }>;
    }
  >();

  for (const row of rows) {
    const current = byPromotoria.get(row.promotoriaId) ?? {
      promotoriaId: row.promotoriaId,
      promotoriaCode: row.promotoriaCode,
      promotoriaName: row.promotoriaName,
      totalCases: 0,
      suspiciousCases: 0,
      weakExpedienteCases: 0,
      criticalRiskCases: 0,
      creditSamples: [],
    };

    current.totalCases += 1;
    const summary = creditSummaries.find((item) => item.creditoId === row.creditoId);
    if (summary?.suspicious) current.suspiciousCases += 1;
    if (summary?.weakExpediente) current.weakExpedienteCases += 1;
    if (summary?.riskLevel === 'CRITICAL') current.criticalRiskCases += 1;
    if (summary) {
      current.creditSamples.push({
        creditoId: row.creditoId,
        cliente: row.clienteLabel,
        folio: row.folio,
        riskLevel: summary.riskLevel,
      });
    }
    byPromotoria.set(row.promotoriaId, current);
  }

  for (const promotoria of byPromotoria.values()) {
    await syncPromotoriaClusterAlert({
      ...promotoria,
      detectedAt,
    });
  }

  return {
    refreshedClients: uniqueClientIds.length,
    refreshedCredits: rows.length,
    refreshedPromotorias: byPromotoria.size,
  };
}

export async function listExpedienteAlertas(
  input: ListExpedienteAlertasInput,
): Promise<ExpedienteAlertaItem[]> {
  const rows = await listExpedienteAlertaRecords({
    ...(input.clienteId ? { clienteId: input.clienteId } : {}),
    ...(input.creditoId ? { creditoId: input.creditoId } : {}),
    ...(input.promotoriaId ? { promotoriaId: input.promotoriaId } : {}),
    ...(input.tipoAlerta ? { tipoAlerta: input.tipoAlerta } : {}),
    ...(input.severidad ? { severidad: input.severidad } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.isCurrent === undefined ? {} : { isCurrent: input.isCurrent }),
  });

  return rows.map(serializeExpedienteAlerta);
}

export async function updateExpedienteAlerta(
  alertaId: string,
  input: UpdateExpedienteAlertaInput,
  userId: string,
): Promise<ExpedienteAlertaItem> {
  const current = await findExpedienteAlertaRecordById(alertaId);
  if (!current) {
    throw new AppError('Alerta de expediente no encontrada.', 'EXPEDIENTE_ALERTA_NOT_FOUND', 404);
  }

  const updated = await updateExpedienteAlertaRecord(alertaId, {
    status: input.status,
    reviewedAt: input.status === 'OPEN' ? null : new Date(),
    reviewedByUserId: input.status === 'OPEN' ? null : userId,
    reviewNotes: input.reviewNotes ?? null,
  });

  await writeAuditLog({
    userId,
    module: 'cobranza-alertas',
    entity: 'ExpedienteAlerta',
    entityId: updated.id,
    action: 'REVIEW_UPDATE',
    beforeJson: serializeExpedienteAlerta(current),
    afterJson: serializeExpedienteAlerta(updated),
  });

  return serializeExpedienteAlerta(updated);
}
