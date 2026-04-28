import { normalizeToIsoDate, parseFlexibleDateInput } from '@/lib/date-input';
import {
  formatCobranzaDate,
  getCanalLabel,
  getCobranzaOutcomeBadgeVariant,
  getExpedienteAlertaSeveridadLabel,
  getExpedienteAlertaStatusLabel,
  getExpedienteAlertaTipoLabel,
  getInteraccionLabel,
  getPromesaEstadoLabel,
  getResultadoInteraccionLabel,
  getVisitaResultadoLabel,
} from '@/lib/cobranza-operativa-display';
import {
  findClienteById,
  listClientTypeCatalogBitacora,
  listClienteExpedienteAuditLogsBitacora,
  listClienteCreditosBitacora,
  listClienteLegalEventsBitacora,
} from '@/server/repositories/cliente-repository';
import {
  buildLegalEventSummary,
  getClientePlacementStatusLabel,
  getLegalCreditStatusLabel,
  isActiveLegalCreditStatus,
} from '@/lib/legal-status';
import {
  buildCobranzaExpedienteCortoBase,
  type CobranzaExpedienteCortoBase,
} from '@/server/services/cobranza-expediente-service';
import { listExpedienteAlertas, type ExpedienteAlertaItem } from '@/server/services/expediente-alert-engine';
import {
  recommendCobranzaActionsForExpediente,
  type CobranzaRecommendation,
} from '@/server/services/cobranza-recommendation-engine';
import type {
  CobranzaInteraccionItem,
  CobranzaPromesaPagoItem,
  CobranzaVisitaCampoItem,
} from '@/server/services/cobranza-operativa-shared';
import { getCobranzaCaseDetail } from '@/server/services/cobranza-service';
import { listInteracciones } from '@/server/services/interacciones-service';
import { listPromesasPago } from '@/server/services/promesas-pago-service';
import { listVisitasCampo } from '@/server/services/visitas-campo-service';

type ClienteBitacoraTone =
  | 'default'
  | 'success'
  | 'warning'
  | 'destructive'
  | 'secondary'
  | 'outline';
type ClienteBitacoraKind = 'INTERACCION' | 'PROMESA_PAGO' | 'VISITA_CAMPO' | 'ALERTA' | 'LEGAL_EVENT';
type ClienteBitacoraCreditBucket = 'ACTIVE' | 'HISTORICAL' | 'OTHER';
type ClienteBitacoraCreditSupport = 'SUPPORTED' | 'LIMITED';
type ClienteBitacoraContactStatus = 'VALID' | 'INVALID' | 'UNKNOWN';
type ClienteBitacoraAddressStatus = 'LOCATED' | 'NOT_LOCATED' | 'UNKNOWN';
type ClienteBitacoraExpedienteChangeField = 'PHONE' | 'SECONDARY_PHONE' | 'ADDRESS' | 'CLIENT_TYPE';

type ClienteBitacoraClienteRecord = Awaited<ReturnType<typeof findClienteById>>;
type ClienteBitacoraAuditLogItem = Awaited<ReturnType<typeof listClienteExpedienteAuditLogsBitacora>>[number];

export type ClienteBitacoraPattern = {
  code: string;
  label: string;
  description: string;
  tone: ClienteBitacoraTone;
};

export type ClienteBitacoraTimelineItem = {
  id: string;
  kind: ClienteBitacoraKind;
  kindLabel: string;
  kindTone: ClienteBitacoraTone;
  occurredAt: string;
  statusLabel: string;
  statusTone: ClienteBitacoraTone;
  summary: string;
  note: string | null;
  userName: string | null;
  scopeLabel: string;
  credito: {
    id: string;
    label: string;
    expedienteHref: string;
  } | null;
};

export type ClienteBitacoraExpedienteChangeItem = {
  id: string;
  fieldKey: ClienteBitacoraExpedienteChangeField;
  fieldLabel: string;
  occurredAt: string;
  userName: string | null;
  previousValue: string;
  nextValue: string;
  reason: string;
};

export type ClienteBitacoraCreditoItem = {
  id: string;
  label: string;
  controlNumber: string | null;
  openedAt: string;
  statusCode: string;
  statusName: string;
  legalStatus: string;
  legalStatusLabel: string;
  isInLegalProcess: boolean;
  bucket: ClienteBitacoraCreditBucket;
  bucketLabel: string;
  support: ClienteBitacoraCreditSupport;
  supportNote: string | null;
  promotoriaName: string;
  avalLabel: string | null;
  actionableAmount: number | null;
  risk: {
    scoreTotal: number;
    nivelRiesgo: CobranzaExpedienteCortoBase['risk']['nivelRiesgo'];
  } | null;
  recommendation: {
    primaryActionLabel: string;
    priorityLabel: string;
    summary: string;
  } | null;
  links: {
    expedienteHref: string;
    creditHref: string;
  };
};

export type ClienteBitacoraData = {
  occurredAt: string;
  cliente: {
    id: string;
    code: string;
    fullName: string;
    statusLabel: string;
    isActive: boolean;
    placementStatus: string;
    placementStatusLabel: string;
    isPlacementBlocked: boolean;
    placementBlockReason: string | null;
    phone: string | null;
    secondaryPhone: string | null;
    address: string | null;
    postalCode: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    betweenStreets: string | null;
    referencesNotes: string | null;
    observations: string | null;
    clientTypeName: string | null;
    promotoriaName: string | null;
    supervisionName: string | null;
    locationLine: string;
  };
  metrics: {
    relatedCreditsCount: number;
    activeAlertsCount: number;
    pendingPromisesCount: number;
    lastContactAt: string | null;
  };
  credits: {
    totalCount: number;
    activeCount: number;
    historicalCount: number;
    unsupportedCount: number;
    scopeNote: string | null;
    items: ClienteBitacoraCreditoItem[];
  };
  contactability: {
    hasRecentSuccessfulContact: boolean;
    lastSuccessfulContactAt: string | null;
    lastOperationalContactAt: string | null;
    phoneStatus: ClienteBitacoraContactStatus;
    addressStatus: ClienteBitacoraAddressStatus;
    unsuccessfulContactAttemptsRecentCount: number;
    failedVisitsRecentCount: number;
  };
  promises: {
    pendingCount: number;
    brokenCount: number;
    latestRegistered: CobranzaPromesaPagoItem | null;
    nextPending: {
      fechaPromesa: string;
      montoPrometido: number | null;
      daysUntilDue: number;
      isOverdue: boolean;
      creditoLabel: string | null;
    } | null;
    recentItems: CobranzaPromesaPagoItem[];
  };
  alerts: {
    activeCount: number;
    totalCount: number;
    historicalCount: number;
    clientScopedActiveCount: number;
    creditScopedActiveCount: number;
    repeatedTypeCount: number;
    activeItems: ExpedienteAlertaItem[];
    recentItems: ExpedienteAlertaItem[];
  };
  patterns: ClienteBitacoraPattern[];
  timeline: {
    items: ClienteBitacoraTimelineItem[];
    truncated: boolean;
  };
  expedienteChanges: {
    items: ClienteBitacoraExpedienteChangeItem[];
    truncated: boolean;
  };
  documentation: {
    ineFrontPath: string | null;
    ineBackPath: string | null;
    pagareFrontPath: string | null;
    pagareBackPath: string | null;
    proofOfAddressPath: string | null;
  };
};

const SUPPORTED_CREDIT_STATUS_CODES = new Set(['ACTIVE', 'COMPLETED']);
const SUCCESSFUL_INTERACTION_RESULTS = new Set(['CONTACTED', 'PROMISE_REGISTERED', 'PAID_REPORTED']);
const SUCCESSFUL_VISIT_RESULTS = new Set(['VISIT_SUCCESSFUL', 'PAYMENT_COLLECTED_REPORTED']);
const FAILED_VISIT_RESULTS = new Set([
  'CLIENT_NOT_HOME',
  'ADDRESS_NOT_FOUND',
  'FOLLOW_UP_REQUIRED',
  'REFUSED_CONTACT',
]);
const CONTACT_ATTEMPT_TYPES = new Set(['CALL', 'WHATSAPP', 'SMS', 'VISIT']);
const CLIENT_TIMELINE_LIMIT = 20;
const CLIENT_OPERATIVE_LIMIT = 100;
const CLIENT_EXPEDIENTE_CHANGE_LIMIT = 20;

function getDefaultOccurredAt(value?: string) {
  return normalizeToIsoDate(value) ?? normalizeToIsoDate(new Date()) ?? new Date().toISOString().slice(0, 10);
}

function toDateAtNoon(value: string | Date) {
  const parsed = parseFlexibleDateInput(value);
  if (!parsed) {
    throw new Error(`No se pudo interpretar la fecha ${String(value)}`);
  }
  parsed.setHours(12, 0, 0, 0);
  return parsed;
}

function diffDays(fromIso: string, toValue: string | Date) {
  const from = toDateAtNoon(fromIso);
  const to = toDateAtNoon(toValue);
  return Math.max(0, Math.floor((from.getTime() - to.getTime()) / 86_400_000));
}

function getMostRecentIso(values: Array<string | null | undefined>) {
  const filtered = values.filter((value): value is string => Boolean(value));
  if (!filtered.length) return null;
  return [...filtered].sort((left, right) => right.localeCompare(left))[0] ?? null;
}

function sortByIsoDesc<T>(items: T[], getValue: (item: T) => string) {
  return [...items].sort((left, right) => getValue(right).localeCompare(getValue(left)));
}

function sortByIsoAsc<T>(items: T[], getValue: (item: T) => string) {
  return [...items].sort((left, right) => getValue(left).localeCompare(getValue(right)));
}

function getCreditBucket(statusCode: string): ClienteBitacoraCreditBucket {
  if (statusCode === 'ACTIVE') return 'ACTIVE';
  if (statusCode === 'COMPLETED') return 'HISTORICAL';
  return 'OTHER';
}

function getCreditBucketLabel(bucket: ClienteBitacoraCreditBucket) {
  if (bucket === 'ACTIVE') return 'Activo';
  if (bucket === 'HISTORICAL') return 'Histórico soportado';
  return 'Cobertura limitada';
}

function getAlertSeverityTone(severidad: ExpedienteAlertaItem['severidad']): ClienteBitacoraTone {
  if (severidad === 'CRITICAL') return 'destructive';
  if (severidad === 'HIGH') return 'warning';
  if (severidad === 'MEDIUM') return 'secondary';
  return 'outline';
}

function buildInteraccionSummary(item: CobranzaInteraccionItem) {
  const parts = [
    getInteraccionLabel(item.tipo),
    item.canal ? getCanalLabel(item.canal) : null,
    item.telefonoUsado ? `a ${item.telefonoUsado}` : null,
  ].filter(Boolean);
  return parts.join(' · ') || 'Interacción registrada';
}

function buildPromesaSummary(item: CobranzaPromesaPagoItem) {
  const parts = [`Promesa para ${formatCobranzaDate(item.fechaPromesa)}`];
  if (item.montoPrometido != null) {
    parts.push(`por ${item.montoPrometido.toFixed(2)}`);
  }
  parts.push(getPromesaEstadoLabel(item.estado));
  return parts.join(' · ');
}

function buildVisitaSummary(item: CobranzaVisitaCampoItem) {
  const location = item.direccionTexto || item.referenciaLugar || 'domicilio registrado';
  return `${getVisitaResultadoLabel(item.resultado)} · ${location}`;
}

function buildLocationLine(cliente: NonNullable<ClienteBitacoraClienteRecord>) {
  return [cliente.neighborhood, cliente.city, cliente.state].filter(Boolean).join(' · ') || 'Sin ubicación complementaria';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toOptionalTrimmedString(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length ? normalized : null;
}

function buildAuditAddressLine(input: Record<string, unknown>) {
  const address = toOptionalTrimmedString(input.address);
  const neighborhood = toOptionalTrimmedString(input.neighborhood);
  const city = toOptionalTrimmedString(input.city);
  const state = toOptionalTrimmedString(input.state);
  const postalCode = toOptionalTrimmedString(input.postalCode);
  const betweenStreets = toOptionalTrimmedString(input.betweenStreets);

  const locationLine = [neighborhood, city, state].filter(Boolean).join(' · ');
  const lines = [
    address,
    locationLine || null,
    postalCode ? `CP ${postalCode}` : null,
    betweenStreets ? `Entre calles: ${betweenStreets}` : null,
  ].filter(Boolean);

  return lines.length ? lines.join('\n') : 'Sin domicilio registrado';
}

function hasAddressChanged(left: Record<string, unknown>, right: Record<string, unknown>) {
  const fields = ['address', 'postalCode', 'neighborhood', 'city', 'state', 'betweenStreets'] as const;
  return fields.some((field) => toOptionalTrimmedString(left[field]) !== toOptionalTrimmedString(right[field]));
}

function getClientTypeLabel(clientTypeId: string | null, clientTypeNames: Map<string, string>) {
  if (!clientTypeId) return 'Sin clasificación';
  return clientTypeNames.get(clientTypeId) ?? `Tipo no encontrado (${clientTypeId})`;
}

function getExpedienteChangeEmptyValue(fieldKey: ClienteBitacoraExpedienteChangeField) {
  if (fieldKey === 'PHONE') return 'Sin teléfono principal';
  if (fieldKey === 'SECONDARY_PHONE') return 'Sin teléfono secundario';
  if (fieldKey === 'CLIENT_TYPE') return 'Sin clasificación';
  return 'Sin domicilio registrado';
}

function formatExpedienteChangeValue(
  fieldKey: ClienteBitacoraExpedienteChangeField,
  rawValue: string | null,
  options?: { clientTypeNames?: Map<string, string>; snapshot?: Record<string, unknown> },
) {
  if (fieldKey === 'ADDRESS' && options?.snapshot) {
    return buildAuditAddressLine(options.snapshot);
  }

  if (fieldKey === 'CLIENT_TYPE') {
    return getClientTypeLabel(rawValue, options?.clientTypeNames ?? new Map<string, string>());
  }

  return rawValue ?? getExpedienteChangeEmptyValue(fieldKey);
}

function extractExpedienteChangeReason(beforeRecord: Record<string, unknown>, afterRecord: Record<string, unknown>) {
  const candidateKeys = ['changeReason', 'motivoCambio', 'reason', 'motivo'] as const;

  for (const key of candidateKeys) {
    const afterValue = toOptionalTrimmedString(afterRecord[key]);
    if (afterValue) return afterValue;

    const beforeValue = toOptionalTrimmedString(beforeRecord[key]);
    if (beforeValue) return beforeValue;
  }

  return 'Actualización registrada desde la edición del expediente.';
}

function buildClienteExpedienteChangeItems(
  auditLogs: ClienteBitacoraAuditLogItem[],
  clientTypeNames: Map<string, string>,
) {
  const items: ClienteBitacoraExpedienteChangeItem[] = [];

  for (const audit of auditLogs) {
    if (!isRecord(audit.beforeJson) || !isRecord(audit.afterJson)) {
      continue;
    }

    const beforeRecord = audit.beforeJson;
    const afterRecord = audit.afterJson;
    const reason = extractExpedienteChangeReason(beforeRecord, afterRecord);
    const occurredAt = audit.createdAt.toISOString();
    const userName = audit.user?.name ?? null;

    const phoneBefore = toOptionalTrimmedString(beforeRecord.phone);
    const phoneAfter = toOptionalTrimmedString(afterRecord.phone);
    if (phoneBefore !== phoneAfter) {
      items.push({
        id: `${audit.id}:phone`,
        fieldKey: 'PHONE',
        fieldLabel: 'Teléfono principal',
        occurredAt,
        userName,
        previousValue: formatExpedienteChangeValue('PHONE', phoneBefore),
        nextValue: formatExpedienteChangeValue('PHONE', phoneAfter),
        reason,
      });
    }

    const secondaryPhoneBefore = toOptionalTrimmedString(beforeRecord.secondaryPhone);
    const secondaryPhoneAfter = toOptionalTrimmedString(afterRecord.secondaryPhone);
    if (secondaryPhoneBefore !== secondaryPhoneAfter) {
      items.push({
        id: `${audit.id}:secondaryPhone`,
        fieldKey: 'SECONDARY_PHONE',
        fieldLabel: 'Teléfono secundario',
        occurredAt,
        userName,
        previousValue: formatExpedienteChangeValue('SECONDARY_PHONE', secondaryPhoneBefore),
        nextValue: formatExpedienteChangeValue('SECONDARY_PHONE', secondaryPhoneAfter),
        reason,
      });
    }

    if (hasAddressChanged(beforeRecord, afterRecord)) {
      items.push({
        id: `${audit.id}:address`,
        fieldKey: 'ADDRESS',
        fieldLabel: 'Domicilio',
        occurredAt,
        userName,
        previousValue: formatExpedienteChangeValue('ADDRESS', null, { snapshot: beforeRecord }),
        nextValue: formatExpedienteChangeValue('ADDRESS', null, { snapshot: afterRecord }),
        reason,
      });
    }

    const clientTypeBefore = toOptionalTrimmedString(beforeRecord.clientTypeId);
    const clientTypeAfter = toOptionalTrimmedString(afterRecord.clientTypeId);
    if (clientTypeBefore !== clientTypeAfter) {
      items.push({
        id: `${audit.id}:clientType`,
        fieldKey: 'CLIENT_TYPE',
        fieldLabel: 'Tipo de cliente',
        occurredAt,
        userName,
        previousValue: formatExpedienteChangeValue('CLIENT_TYPE', clientTypeBefore, { clientTypeNames }),
        nextValue: formatExpedienteChangeValue('CLIENT_TYPE', clientTypeAfter, { clientTypeNames }),
        reason,
      });
    }
  }

  return sortByIsoDesc(items, (item) => item.occurredAt);
}

function buildCreditLabel(input: {
  folio: string;
  loanNumber: string;
  controlNumber?: string | number | null;
}) {
  const base = `${input.folio} · ${input.loanNumber}`;
  if (input.controlNumber == null) return base;
  return `${base} · Ctrl ${String(input.controlNumber)}`;
}

function aggregatePrimaryRisk(expedientes: CobranzaExpedienteCortoBase[]) {
  return [...expedientes]
    .sort((left, right) => {
      if (left.risk.scoreTotal !== right.risk.scoreTotal) {
        return right.risk.scoreTotal - left.risk.scoreTotal;
      }
      if (left.actionable.totalAmount !== right.actionable.totalAmount) {
        return right.actionable.totalAmount - left.actionable.totalAmount;
      }
      return `${right.header.creditFolio} · ${right.header.loanNumber}`.localeCompare(
        `${left.header.creditFolio} · ${left.header.loanNumber}`,
      );
    })[0]?.risk ?? null;
}

function buildInteraccionTimelineItem(item: CobranzaInteraccionItem): ClienteBitacoraTimelineItem {
  return {
    id: item.id,
    kind: 'INTERACCION',
    kindLabel: 'Interacción',
    kindTone: 'secondary',
    occurredAt: item.fechaHora,
    statusLabel: getResultadoInteraccionLabel(item.resultado),
    statusTone: getCobranzaOutcomeBadgeVariant(item.resultado),
    summary: buildInteraccionSummary(item),
    note: item.notas ?? null,
    userName: item.createdBy.name,
    scopeLabel: item.creditoId ? 'Ligada a crédito' : 'General del cliente',
    credito: item.credito
      ? {
          id: item.credito.id,
          label: buildCreditLabel(item.credito),
          expedienteHref: `/cobranza/${item.credito.id}`,
        }
      : null,
  };
}

function buildPromesaTimelineItem(item: CobranzaPromesaPagoItem): ClienteBitacoraTimelineItem {
  return {
    id: item.id,
    kind: 'PROMESA_PAGO',
    kindLabel: 'Promesa',
    kindTone: 'warning',
    occurredAt: item.createdAt,
    statusLabel: getPromesaEstadoLabel(item.estado),
    statusTone: getCobranzaOutcomeBadgeVariant(item.estado),
    summary: buildPromesaSummary(item),
    note: item.notas ?? null,
    userName: item.createdBy.name,
    scopeLabel: item.creditoId ? 'Ligada a crédito' : 'General del cliente',
    credito: item.credito
      ? {
          id: item.credito.id,
          label: buildCreditLabel(item.credito),
          expedienteHref: `/cobranza/${item.credito.id}`,
        }
      : null,
  };
}

function buildVisitaTimelineItem(item: CobranzaVisitaCampoItem): ClienteBitacoraTimelineItem {
  return {
    id: item.id,
    kind: 'VISITA_CAMPO',
    kindLabel: 'Visita',
    kindTone: 'outline',
    occurredAt: item.fechaHora,
    statusLabel: getVisitaResultadoLabel(item.resultado),
    statusTone: getCobranzaOutcomeBadgeVariant(item.resultado),
    summary: buildVisitaSummary(item),
    note: item.notas ?? null,
    userName: item.createdBy.name,
    scopeLabel: item.creditoId ? 'Ligada a crédito' : 'General del cliente',
    credito: item.credito
      ? {
          id: item.credito.id,
          label: buildCreditLabel(item.credito),
          expedienteHref: `/cobranza/${item.credito.id}`,
        }
      : null,
  };
}

function buildAlertTimelineItem(item: ExpedienteAlertaItem): ClienteBitacoraTimelineItem {
  const note = [
    item.isCurrent ? 'Alerta vigente' : 'Alerta histórica',
    item.reviewNotes ? `Revisión: ${item.reviewNotes}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    id: item.id,
    kind: 'ALERTA',
    kindLabel: 'Alerta',
    kindTone: getAlertSeverityTone(item.severidad),
    occurredAt: item.detectedAt,
    statusLabel: `${getExpedienteAlertaStatusLabel(item.status)} · ${getExpedienteAlertaSeveridadLabel(item.severidad)}`,
    statusTone: getAlertSeverityTone(item.severidad),
    summary: `${getExpedienteAlertaTipoLabel(item.tipoAlerta)} · ${item.descripcion}`,
    note: note || null,
    userName: item.reviewedBy?.name ?? null,
    scopeLabel: item.creditoId ? 'Alerta originada por crédito' : 'Alerta a nivel cliente',
    credito: item.credito
      ? {
          id: item.credito.id,
          label: buildCreditLabel(item.credito),
          expedienteHref: `/cobranza/${item.credito.id}`,
        }
      : null,
  };
}

function buildLegalTimelineItem(
  item: Awaited<ReturnType<typeof listClienteLegalEventsBitacora>>[number],
): ClienteBitacoraTimelineItem {
  return {
    id: item.id,
    kind: 'LEGAL_EVENT',
    kindLabel: 'Jurídico',
    kindTone: 'destructive',
    occurredAt: item.effectiveDate.toISOString(),
    statusLabel: getLegalCreditStatusLabel(item.nextStatus),
    statusTone: 'destructive',
    summary: buildLegalEventSummary({
      eventType: item.eventType,
      previousStatus: item.previousStatus,
      nextStatus: item.nextStatus,
      motivo: item.motivo,
    }),
    note: item.observaciones ?? null,
    userName: item.createdByUser.name,
    scopeLabel: 'Evento jurídico del crédito',
    credito: item.credito
      ? {
          id: item.credito.id,
          label: buildCreditLabel(item.credito),
          expedienteHref: `/cobranza/${item.credito.id}`,
        }
      : null,
  };
}

function buildPatterns(input: {
  occurredAt: string;
  promesas: CobranzaPromesaPagoItem[];
  visits: CobranzaVisitaCampoItem[];
  activeAlerts: ExpedienteAlertaItem[];
  allAlerts: ExpedienteAlertaItem[];
  primaryRisk: CobranzaExpedienteCortoBase['risk'] | null;
  highRiskCreditCount: number;
  lastSuccessfulContactAt: string | null;
  unsuccessfulContactAttemptsRecentCount: number;
}) {
  const patterns: ClienteBitacoraPattern[] = [];
  const brokenPromises = input.promesas.filter((item) => item.estado === 'BROKEN').length;
  const failedVisits = input.visits.filter((item) => {
    if (!FAILED_VISIT_RESULTS.has(item.resultado)) return false;
    return diffDays(input.occurredAt, item.fechaHora) <= 90;
  }).length;
  const repeatedAlertTypes = [...new Map(
    input.allAlerts.map((item) => [item.tipoAlerta, input.allAlerts.filter((alert) => alert.tipoAlerta === item.tipoAlerta).length]),
  ).entries()].filter(([, count]) => count >= 2);

  if (brokenPromises >= 2) {
    patterns.push({
      code: 'MULTIPLE_BROKEN_PROMISES',
      label: 'Promesas incumplidas repetidas',
      description: `El cliente acumula ${brokenPromises} promesas incumplidas registradas.`,
      tone: 'warning',
    });
  }

  if (failedVisits >= 2) {
    patterns.push({
      code: 'REPEATED_FAILED_VISITS',
      label: 'Visitas fallidas repetidas',
      description: `Se registraron ${failedVisits} visitas fallidas en los últimos 90 días.`,
      tone: 'warning',
    });
  }

  if (input.highRiskCreditCount >= 2) {
    patterns.push({
      code: 'MULTIPLE_HIGH_RISK_CREDITS',
      label: 'Más de un crédito en riesgo alto',
      description: `${input.highRiskCreditCount} créditos soportados están en nivel HIGH o CRITICAL.`,
      tone: 'destructive',
    });
  }

  if (input.activeAlerts.length >= 2 || repeatedAlertTypes.length) {
    patterns.push({
      code: 'REPEATED_ALERTS',
      label: 'Alertas reiteradas',
      description:
        input.activeAlerts.length >= 2
          ? `Hay ${input.activeAlerts.length} alertas activas para revisión en este cliente.`
          : 'El historial de alertas repite tipos de señal que conviene seguir de cerca.',
      tone: 'destructive',
    });
  }

  if (input.primaryRisk?.telefonoValidoInferido === false && input.unsuccessfulContactAttemptsRecentCount >= 3) {
    patterns.push({
      code: 'LOW_PHONE_CONTACTABILITY',
      label: 'Baja contactabilidad telefónica',
      description: 'La evidencia reciente sugiere teléfono inválido y varios intentos sin éxito.',
      tone: 'warning',
    });
  }

  if (input.lastSuccessfulContactAt) {
    const daysWithoutSuccessfulContact = diffDays(input.occurredAt, input.lastSuccessfulContactAt);
    if (daysWithoutSuccessfulContact > 30) {
      patterns.push({
        code: 'STALE_SUCCESSFUL_CONTACT',
        label: 'Sin contacto exitoso reciente',
        description: `No hay contacto exitoso registrado desde hace ${daysWithoutSuccessfulContact} días.`,
        tone: 'secondary',
      });
    }
  } else if (input.unsuccessfulContactAttemptsRecentCount >= 3) {
    patterns.push({
      code: 'NO_SUCCESSFUL_CONTACT',
      label: 'Sin contacto efectivo reciente',
      description: 'Se acumulan intentos recientes sin evidencia de contacto exitoso.',
      tone: 'secondary',
    });
  }

  return patterns.slice(0, 6);
}

export async function getClienteBitacora(input: {
  clienteId: string;
  occurredAt?: string;
}): Promise<ClienteBitacoraData | null> {
  const occurredAt = getDefaultOccurredAt(input.occurredAt);
  const cliente = await findClienteById(input.clienteId);
  if (!cliente) {
    return null;
  }

  const [creditos, interacciones, promesas, visitas, alertas, legalEvents, expedienteAuditLogs, clientTypes] = await Promise.all([
    listClienteCreditosBitacora(cliente.id),
    listInteracciones({ clienteId: cliente.id, limit: CLIENT_OPERATIVE_LIMIT }),
    listPromesasPago({ clienteId: cliente.id, limit: CLIENT_OPERATIVE_LIMIT }),
    listVisitasCampo({ clienteId: cliente.id, limit: CLIENT_OPERATIVE_LIMIT }),
    listExpedienteAlertas({ clienteId: cliente.id }),
    listClienteLegalEventsBitacora(cliente.id),
    listClienteExpedienteAuditLogsBitacora(cliente.id),
    listClientTypeCatalogBitacora(),
  ]);

  const supportedCredits = creditos.filter((credito) =>
    SUPPORTED_CREDIT_STATUS_CODES.has(credito.creditStatus.code),
  );

  const supportedExpedienteEntries = (
    await Promise.all(
      supportedCredits.map(async (credito) => {
        const detail = await getCobranzaCaseDetail({
          creditoId: credito.id,
          occurredAt,
        });

        if (!detail) return null;

        const expediente = await buildCobranzaExpedienteCortoBase({
          detail,
          occurredAt,
          clienteInteracciones: interacciones,
          clientePromesas: promesas,
          clienteVisitas: visitas,
        });

        return {
          creditoId: credito.id,
          expediente,
          recommendation: recommendCobranzaActionsForExpediente(expediente),
        };
      }),
    )
  ).filter(
    (
      entry,
    ): entry is {
      creditoId: string;
      expediente: CobranzaExpedienteCortoBase;
      recommendation: CobranzaRecommendation;
    } => Boolean(entry),
  );

  const supportedExpedienteByCreditId = new Map(
    supportedExpedienteEntries.map((entry) => [entry.creditoId, entry]),
  );
  const supportedExpedientes = supportedExpedienteEntries.map((entry) => entry.expediente);
  const primaryRisk = aggregatePrimaryRisk(supportedExpedientes);
  const highRiskCreditCount = supportedExpedientes.filter(
    (item) => item.risk.nivelRiesgo === 'HIGH' || item.risk.nivelRiesgo === 'CRITICAL',
  ).length;

  const lastSuccessfulInteractionAt =
    sortByIsoDesc(
      interacciones.filter((item) => SUCCESSFUL_INTERACTION_RESULTS.has(item.resultado)),
      (item) => item.fechaHora,
    )[0]?.fechaHora ?? null;
  const lastSuccessfulVisitAt =
    sortByIsoDesc(
      visitas.filter((item) => SUCCESSFUL_VISIT_RESULTS.has(item.resultado)),
      (item) => item.fechaHora,
    )[0]?.fechaHora ?? null;
  const lastSuccessfulContactAt = getMostRecentIso([lastSuccessfulInteractionAt, lastSuccessfulVisitAt]);
  const lastOperationalContactAt = getMostRecentIso([interacciones[0]?.fechaHora, visitas[0]?.fechaHora]);
  const hasRecentSuccessfulContact = lastSuccessfulContactAt
    ? diffDays(occurredAt, lastSuccessfulContactAt) <= 7
    : false;

  const unsuccessfulContactAttemptsRecentCount = interacciones.filter((item) => {
    if (!CONTACT_ATTEMPT_TYPES.has(item.tipo)) return false;
    if (SUCCESSFUL_INTERACTION_RESULTS.has(item.resultado)) return false;
    return diffDays(occurredAt, item.fechaHora) <= 14;
  }).length;

  const failedVisitsRecentCount = visitas.filter((item) => {
    if (!FAILED_VISIT_RESULTS.has(item.resultado)) return false;
    return diffDays(occurredAt, item.fechaHora) <= 90;
  }).length;

  const latestRegisteredPromise = sortByIsoDesc(promesas, (item) => item.createdAt)[0] ?? null;
  const nextPendingPromise =
    sortByIsoAsc(
      promesas.filter((item) => item.estado === 'PENDING'),
      (item) => item.fechaPromesa,
    )[0] ?? null;

  const activeAlerts = alertas.filter((item) => item.isCurrent && item.status !== 'DISMISSED');
  const historicalAlerts = alertas.filter((item) => !item.isCurrent || item.status === 'DISMISSED');
  const repeatedAlertTypes = [
    ...new Map(
      alertas.map((item) => [
        item.tipoAlerta,
        alertas.filter((candidate) => candidate.tipoAlerta === item.tipoAlerta).length,
      ]),
    ).entries(),
  ].filter(([, count]) => count >= 2);

  const creditItems: ClienteBitacoraCreditoItem[] = creditos.map((credito) => {
    const bucket = getCreditBucket(credito.creditStatus.code);
    const supportedEntry = supportedExpedienteByCreditId.get(credito.id) ?? null;
    const support: ClienteBitacoraCreditSupport = supportedEntry ? 'SUPPORTED' : 'LIMITED';

    return {
      id: credito.id,
      label: buildCreditLabel({
        folio: credito.folio,
        loanNumber: credito.loanNumber,
        controlNumber: credito.controlNumber,
      }),
      controlNumber: credito.controlNumber != null ? String(credito.controlNumber) : null,
      openedAt: credito.startDate.toISOString().slice(0, 10),
      statusCode: credito.creditStatus.code,
      statusName: credito.creditStatus.name,
      legalStatus: credito.legalStatus,
      legalStatusLabel: getLegalCreditStatusLabel(credito.legalStatus),
      isInLegalProcess: isActiveLegalCreditStatus(credito.legalStatus),
      bucket,
      bucketLabel: getCreditBucketLabel(bucket),
      support,
      supportNote: supportedEntry
        ? null
        : 'El estado actual del crédito no entra todavía en la composición operativa de score y acción sugerida.',
      promotoriaName: credito.promotoria.name,
      avalLabel: credito.aval ? `${credito.aval.code} · ${credito.aval.fullName}` : null,
      actionableAmount: supportedEntry ? supportedEntry.expediente.actionable.totalAmount : null,
      risk: supportedEntry
        ? {
            scoreTotal: supportedEntry.expediente.risk.scoreTotal,
            nivelRiesgo: supportedEntry.expediente.risk.nivelRiesgo,
          }
        : null,
      recommendation: supportedEntry
        ? {
            primaryActionLabel: supportedEntry.recommendation.primaryAction.label,
            priorityLabel: supportedEntry.recommendation.priority.label,
            summary: supportedEntry.recommendation.summary,
          }
        : null,
      links: {
        expedienteHref: `/cobranza/${credito.id}`,
        creditHref: supportedEntry?.expediente.links.creditHref ?? `/creditos/${credito.id}`,
      },
    };
  });

  const patterns = buildPatterns({
    occurredAt,
    promesas,
    visits: visitas,
    activeAlerts,
    allAlerts: alertas,
    primaryRisk,
    highRiskCreditCount,
    lastSuccessfulContactAt,
    unsuccessfulContactAttemptsRecentCount,
  });

  const timelineItems = sortByIsoDesc(
    [
      ...interacciones.map(buildInteraccionTimelineItem),
      ...promesas.map(buildPromesaTimelineItem),
      ...visitas.map(buildVisitaTimelineItem),
      ...alertas.map(buildAlertTimelineItem),
      ...legalEvents.map(buildLegalTimelineItem),
    ],
    (item) => item.occurredAt,
  );
  const clientTypeNames = new Map(clientTypes.map((item) => [item.id, item.name]));
  const expedienteChangeItems = buildClienteExpedienteChangeItems(expedienteAuditLogs, clientTypeNames);

  const activeCreditCount = creditItems.filter((item) => item.bucket === 'ACTIVE').length;
  const historicalCreditCount = creditItems.filter((item) => item.bucket === 'HISTORICAL').length;
  const unsupportedCreditCount = creditItems.filter((item) => item.support === 'LIMITED').length;
  const creditScopeNote =
    unsupportedCreditCount > 0
      ? unsupportedCreditCount === 1
        ? 'Hay 1 crédito adicional visible con cobertura limitada; se muestra sin score ni acción sugerida para no inventar composición operativa.'
        : `Hay ${unsupportedCreditCount} créditos visibles con cobertura limitada; se muestran sin score ni acción sugerida para mantener consistencia operativa.`
      : supportedCredits.length === 0 && creditos.length === 0
        ? 'Este cliente aún no tiene créditos relacionados visibles en el modelo actual.'
        : null;

  return {
    occurredAt,
    cliente: {
      id: cliente.id,
      code: cliente.code,
      fullName: cliente.fullName,
      statusLabel: cliente.isActive ? 'Activo' : 'Inactivo',
      isActive: cliente.isActive,
      placementStatus: cliente.placementStatus,
      placementStatusLabel: getClientePlacementStatusLabel(cliente.placementStatus),
      isPlacementBlocked: cliente.placementStatus === 'BLOCKED_LEGAL',
      placementBlockReason: cliente.placementBlockReason ?? null,
      phone: cliente.phone ?? null,
      secondaryPhone: cliente.secondaryPhone ?? null,
      address: cliente.address ?? null,
      postalCode: cliente.postalCode ?? null,
      neighborhood: cliente.neighborhood ?? null,
      city: cliente.city ?? null,
      state: cliente.state ?? null,
      betweenStreets: cliente.betweenStreets ?? null,
      referencesNotes: cliente.referencesNotes ?? null,
      observations: cliente.observations ?? null,
      clientTypeName: cliente.clientType?.name ?? null,
      promotoriaName: cliente.promotoria?.name ?? null,
      supervisionName: cliente.promotoria?.supervision?.name ?? null,
      locationLine: buildLocationLine(cliente),
    },
    metrics: {
      relatedCreditsCount: creditItems.length,
      activeAlertsCount: activeAlerts.length,
      pendingPromisesCount: promesas.filter((item) => item.estado === 'PENDING').length,
      lastContactAt: lastOperationalContactAt,
    },
    credits: {
      totalCount: creditItems.length,
      activeCount: activeCreditCount,
      historicalCount: historicalCreditCount,
      unsupportedCount: unsupportedCreditCount,
      scopeNote: creditScopeNote,
      items: creditItems,
    },
    contactability: {
      hasRecentSuccessfulContact,
      lastSuccessfulContactAt,
      lastOperationalContactAt,
      phoneStatus:
        primaryRisk?.telefonoValidoInferido == null
          ? 'UNKNOWN'
          : primaryRisk.telefonoValidoInferido
            ? 'VALID'
            : 'INVALID',
      addressStatus:
        primaryRisk?.domicilioUbicadoInferido == null
          ? 'UNKNOWN'
          : primaryRisk.domicilioUbicadoInferido
            ? 'LOCATED'
            : 'NOT_LOCATED',
      unsuccessfulContactAttemptsRecentCount,
      failedVisitsRecentCount,
    },
    promises: {
      pendingCount: promesas.filter((item) => item.estado === 'PENDING').length,
      brokenCount: promesas.filter((item) => item.estado === 'BROKEN').length,
      latestRegistered: latestRegisteredPromise,
      nextPending: nextPendingPromise
        ? {
            fechaPromesa: nextPendingPromise.fechaPromesa,
            montoPrometido: nextPendingPromise.montoPrometido,
            daysUntilDue:
              nextPendingPromise.fechaPromesa < occurredAt
                ? -diffDays(occurredAt, nextPendingPromise.fechaPromesa)
                : diffDays(nextPendingPromise.fechaPromesa, occurredAt),
            isOverdue: nextPendingPromise.fechaPromesa < occurredAt,
            creditoLabel: nextPendingPromise.credito
              ? buildCreditLabel(nextPendingPromise.credito)
              : null,
          }
        : null,
      recentItems: sortByIsoDesc(promesas, (item) => item.createdAt).slice(0, 5),
    },
    alerts: {
      activeCount: activeAlerts.length,
      totalCount: alertas.length,
      historicalCount: historicalAlerts.length,
      clientScopedActiveCount: activeAlerts.filter((item) => !item.creditoId).length,
      creditScopedActiveCount: activeAlerts.filter((item) => Boolean(item.creditoId)).length,
      repeatedTypeCount: repeatedAlertTypes.length,
      activeItems: activeAlerts,
      recentItems: alertas.slice(0, 6),
    },
    patterns,
    timeline: {
      items: timelineItems.slice(0, CLIENT_TIMELINE_LIMIT),
      truncated: timelineItems.length > CLIENT_TIMELINE_LIMIT,
    },
    expedienteChanges: {
      items: expedienteChangeItems.slice(0, CLIENT_EXPEDIENTE_CHANGE_LIMIT),
      truncated: expedienteChangeItems.length > CLIENT_EXPEDIENTE_CHANGE_LIMIT,
    },
    documentation: {
      ineFrontPath: cliente.ineFrontPath ?? null,
      ineBackPath: cliente.ineBackPath ?? null,
      pagareFrontPath: cliente.pagareFrontPath ?? null,
      pagareBackPath: cliente.pagareBackPath ?? null,
      proofOfAddressPath: cliente.proofOfAddressPath ?? null,
    },
  };
}
