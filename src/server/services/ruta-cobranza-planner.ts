import { normalizeToIsoDate, parseFlexibleDateInput } from '@/lib/date-input';
import { normalizeText } from '@/lib/utils';
import {
  listBatchRiskInteraccionesByContext,
  listBatchRiskPromesasPagoByContext,
  listBatchRiskVisitasCampoByContext,
} from '@/server/repositories/cobranza-risk-repository';
import type { CobranzaExpedienteCorto } from '@/server/services/cobranza-expediente-service';
import { getCobranzaExpedienteCorto } from '@/server/services/cobranza-expediente-service';
import {
  getCobranzaActionableBreakdownFromRow,
  getCobranzaWorkbenchData,
  type CobranzaWorkbenchRow,
} from '@/server/services/cobranza-service';
import { summarizeCobranzaRiskFactors } from '@/server/services/cobranza-risk-engine';

export type RutaCobranzaPlannerMode = 'balanced' | 'urgent' | 'verification';
export type RutaCobranzaLabelCode =
  | 'COBRO_CRITICO'
  | 'COBRO_RAPIDO'
  | 'SEGUIMIENTO_PROMESA'
  | 'VISITA_VERIFICACION'
  | 'RECUPERACION_DIFICIL'
  | 'BAJA_PRIORIDAD';
export type RutaCobranzaPriorityCode = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

type RutaCobranzaLabel = {
  code: RutaCobranzaLabelCode;
  label: string;
};

type RutaCobranzaPriority = {
  code: RutaCobranzaPriorityCode;
  label: string;
};

type BatchInteraccion = Awaited<ReturnType<typeof listBatchRiskInteraccionesByContext>>[number];
type BatchPromesaPago = Awaited<ReturnType<typeof listBatchRiskPromesasPagoByContext>>[number];
type BatchVisitaCampo = Awaited<ReturnType<typeof listBatchRiskVisitasCampoByContext>>[number];

type BaseRouteCandidate = {
  row: CobranzaWorkbenchRow;
  occurredAt: string;
  zoneKey: string;
  zoneLabel: string;
  addressLabel: string;
  actionable: ReturnType<typeof getCobranzaActionableBreakdownFromRow>;
  promiseSignals: {
    pendingCount: number;
    pendingOverdueCount: number;
    brokenCount: number;
    nextPendingAt: string | null;
    nextPendingDueSoon: boolean;
  };
  contactSignals: {
    phoneStatus: 'VALID' | 'INVALID' | 'UNKNOWN';
    addressStatus: 'LOCATED' | 'NOT_LOCATED' | 'UNKNOWN';
    hasRecentSuccessfulContact: boolean;
    lastSuccessfulContactAt: string | null;
    unsuccessfulContactAttemptsRecentCount: number;
    failedPhoneAttemptsRecentCount: number;
  };
  visitSignals: {
    failedRecentCount: number;
    latestVisitAt: string | null;
    latestVisitResult: string | null;
    latestVisitDaysAgo: number | null;
  };
  baseRouteLabel: RutaCobranzaLabel;
  baseRoutePriorityScore: number;
  baseRecommendedVisit: boolean;
  baseSignals: string[];
  baseMainReason: string;
};

export type RutaCobranzaPlannerItem = {
  routeOrder: number | null;
  creditoId: string;
  clienteId: string;
  clienteCodigo: string;
  clienteNombre: string;
  telefono: string | null;
  clienteLabel: string;
  creditFolio: string;
  loanNumber: string;
  controlNumber: string | null;
  caseLabel: CobranzaExpedienteCorto['header']['caseLabel'];
  promotoriaName: string;
  supervisionName: string | null;
  zoneKey: string;
  zoneLabel: string;
  addressLabel: string;
  routePriorityScore: number;
  routePriority: RutaCobranzaPriority;
  routeLabel: RutaCobranzaLabel;
  recommendedVisit: boolean;
  includeInRoute: boolean;
  inclusionReason: string;
  mainReason: string;
  signals: string[];
  actionable: {
    regularAmount: number;
    recoveryAmount: number;
    extraWeekAmount: number;
    totalAmount: number;
  };
  risk: {
    scoreTotal: number;
    nivelRiesgo: CobranzaExpedienteCorto['risk']['nivelRiesgo'];
    diasAtraso: number;
  };
  suggestedAction: {
    code: CobranzaExpedienteCorto['recommendation']['primaryAction']['code'];
    label: string;
  };
  contactability: {
    phoneStatus: CobranzaExpedienteCorto['contactability']['phoneStatus'];
    addressStatus: CobranzaExpedienteCorto['contactability']['addressStatus'];
    hasRecentSuccessfulContact: boolean;
    lastSuccessfulContactAt: string | null;
  };
  geo: CobranzaExpedienteCorto['geo'];
  links: CobranzaExpedienteCorto['links'];
  cobranzaHref: string;
};

export type RutaCobranzaPlannerGroup = {
  zoneKey: string;
  zoneLabel: string;
  suggestedCases: number;
  totalActionableAmount: number;
  items: RutaCobranzaPlannerItem[];
};

export type RutaCobranzaPlannerResult = {
  strategy: 'HYBRID_WORKBENCH_ROUTE_PLANNER_V1';
  filters: {
    occurredAt: string;
    supervisionId: string;
    promotoriaId: string;
    zone: string;
    limit: number;
    mode: RutaCobranzaPlannerMode;
  };
  options: {
    supervision: Array<{ id: string; name: string }>;
    promotoria: Array<{ id: string; name: string }>;
    zones: Array<{ key: string; label: string; cases: number }>;
  };
  summary: {
    totalSuggestedCases: number;
    totalActionableAmount: number;
    criticalCases: number;
    zonesCovered: number;
    optionalCases: number;
    byLabel: Array<{ code: RutaCobranzaLabelCode; label: string; cases: number }>;
    zones: Array<{ key: string; label: string; cases: number; totalActionableAmount: number }>;
  };
  items: RutaCobranzaPlannerItem[];
  groups: RutaCobranzaPlannerGroup[];
  optionalItems: RutaCobranzaPlannerItem[];
  diagnostics: RutaCobranzaPlannerDiagnostics;
};

type RutaCobranzaPlannerDiscardReasonCode =
  | 'PRESELECTION_THRESHOLD'
  | 'EXPEDIENTE_NOT_FOUND'
  | 'EXPEDIENTE_ERROR'
  | 'NOT_RECOMMENDED_VISIT'
  | 'EXCLUDED_BY_INCLUSION_RULE'
  | 'OVERFLOW_LIMIT';

type RutaCobranzaPlannerPortfolioCoverageBucket = {
  code: CobranzaWorkbenchRow['rowMode'];
  label: string;
  cases: number;
  amount: number;
};

type RutaCobranzaPlannerPortfolioCoverage = {
  totalCases: number;
  totalAmount: number;
  buckets: RutaCobranzaPlannerPortfolioCoverageBucket[];
};

export type RutaCobranzaPlannerDiagnostics = {
  totalWorkbenchRows: number;
  totalCreditsEvaluated: number;
  totalDiscarded: number;
  stages: {
    dedupedCredits: number;
    zoneFilteredCredits: number;
    preselectedCredits: number;
    enrichedCredits: number;
    finalSuggestedCredits: number;
    optionalCredits: number;
  };
  portfolioCoverage: {
    workbench: RutaCobranzaPlannerPortfolioCoverage;
    evaluated: RutaCobranzaPlannerPortfolioCoverage;
    preselected: RutaCobranzaPlannerPortfolioCoverage;
    suggested: RutaCobranzaPlannerPortfolioCoverage;
    discarded: RutaCobranzaPlannerPortfolioCoverage;
  };
  discardReasons: Array<{
    code: RutaCobranzaPlannerDiscardReasonCode;
    label: string;
    cases: number;
  }>;
  expedienteFailures: Array<{
    creditoId: string;
    clienteId: string;
    message: string;
  }>;
};

type RutaCobranzaPlannerInput = {
  occurredAt?: string;
  supervisionId?: string;
  promotoriaId?: string;
  zone?: string;
  limit?: number;
  mode?: RutaCobranzaPlannerMode;
};

const INTERACCION_RESULTADOS_EXITOSOS = new Set(['CONTACTED', 'PROMISE_REGISTERED', 'PAID_REPORTED']);
const INTERACCION_TIPOS_CONTACTO = new Set(['CALL', 'WHATSAPP', 'SMS', 'VISIT']);
const INTERACCION_TIPOS_TELEFONO = new Set(['CALL', 'WHATSAPP', 'SMS']);
const VISITA_RESULTADOS_EXITOSOS = new Set(['VISIT_SUCCESSFUL', 'PAYMENT_COLLECTED_REPORTED']);
const VISITA_RESULTADOS_FALLIDOS = new Set([
  'CLIENT_NOT_HOME',
  'ADDRESS_NOT_FOUND',
  'FOLLOW_UP_REQUIRED',
  'REFUSED_CONTACT',
]);
const FIELD_RECOMMENDATION_ACTIONS = new Set([
  'PROGRAM_FIELD_VISIT',
  'VERIFY_ADDRESS',
  'VERIFY_PHONE',
  'PREPARE_OPERATIVE_CLOSURE',
]);
const REMOTE_FIRST_ACTIONS = new Set([
  'CALL_NOW',
  'SEND_WHATSAPP',
  'REGISTER_PROMISE',
  'MAINTAIN_MONITORING',
  'NO_IMMEDIATE_ACTION',
]);

const ROUTE_LABELS: Record<RutaCobranzaLabelCode, string> = {
  COBRO_CRITICO: 'Cobro crítico',
  COBRO_RAPIDO: 'Cobro rápido',
  SEGUIMIENTO_PROMESA: 'Seguimiento promesa',
  VISITA_VERIFICACION: 'Visita de verificación',
  RECUPERACION_DIFICIL: 'Recuperación difícil',
  BAJA_PRIORIDAD: 'Baja prioridad',
};

const ROUTE_PRIORITY_LABELS: Record<RutaCobranzaPriorityCode, string> = {
  LOW: 'Baja',
  MEDIUM: 'Media',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

const WORKBENCH_ROW_MODE_LABELS: Record<CobranzaWorkbenchRow['rowMode'], string> = {
  regular: 'Cobranza regular',
  final_closure: 'Cierre operativo',
  recovery_only: 'Recuperado pendiente',
  extra_week_only: 'Semana 13',
};

const DISCARD_REASON_LABELS: Record<RutaCobranzaPlannerDiscardReasonCode, string> = {
  PRESELECTION_THRESHOLD: 'Se quedó fuera en la preselección táctica del planner.',
  EXPEDIENTE_NOT_FOUND: 'No se pudo reconstruir el expediente operativo del crédito.',
  EXPEDIENTE_ERROR: 'El expediente falló durante el enriquecimiento del planner.',
  NOT_RECOMMENDED_VISIT: 'La recomendación final no marcó visita de campo para hoy.',
  EXCLUDED_BY_INCLUSION_RULE: 'Las reglas finales de inclusión dejaron el caso fuera de ruta.',
  OVERFLOW_LIMIT: 'El caso calificó, pero quedó fuera por límite operativo del día.',
};

function routeLabel(code: RutaCobranzaLabelCode): RutaCobranzaLabel {
  return {
    code,
    label: ROUTE_LABELS[code],
  };
}

function routePriority(code: RutaCobranzaPriorityCode): RutaCobranzaPriority {
  return {
    code,
    label: ROUTE_PRIORITY_LABELS[code],
  };
}

function buildPlannerPortfolioCoverage(
  entries: Array<{ rowMode: CobranzaWorkbenchRow['rowMode']; amount: number }>,
): RutaCobranzaPlannerPortfolioCoverage {
  const buckets = (Object.entries(WORKBENCH_ROW_MODE_LABELS) as Array<
    [CobranzaWorkbenchRow['rowMode'], string]
  >).map(([code, label]) => ({
    code,
    label,
    cases: 0,
    amount: 0,
  }));
  const bucketMap = new Map(buckets.map((bucket) => [bucket.code, bucket]));

  for (const entry of entries) {
    const bucket = bucketMap.get(entry.rowMode);
    if (!bucket) continue;
    bucket.cases += 1;
    bucket.amount = Number((bucket.amount + entry.amount).toFixed(2));
  }

  const totalCases = buckets.reduce((sum, bucket) => sum + bucket.cases, 0);
  const totalAmount = Number(buckets.reduce((sum, bucket) => sum + bucket.amount, 0).toFixed(2));

  return {
    totalCases,
    totalAmount,
    buckets,
  };
}

function getPlannerErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function getDefaultOccurredAt(value?: string) {
  return normalizeToIsoDate(value) ?? normalizeToIsoDate(new Date()) ?? new Date().toISOString().slice(0, 10);
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toDateAtNoon(value: string | Date) {
  const parsed = parseFlexibleDateInput(value);
  if (parsed) {
    parsed.setHours(12, 0, 0, 0);
    return parsed;
  }

  const asDate = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(asDate.getTime())) {
    throw new Error(`No se pudo interpretar la fecha ${String(value)}`);
  }
  asDate.setHours(12, 0, 0, 0);
  return asDate;
}

function toIsoDate(value: string | Date) {
  if (typeof value === 'string') {
    const normalized = normalizeToIsoDate(value);
    if (normalized) return normalized;
  }
  return toDateAtNoon(value).toISOString().slice(0, 10);
}

function diffDays(fromIso: string, toValue: string | Date) {
  const from = toDateAtNoon(fromIso);
  const to = toDateAtNoon(toValue);
  return Math.max(0, Math.floor((from.getTime() - to.getTime()) / 86_400_000));
}

function buildZone(row: CobranzaWorkbenchRow) {
  const primary = row.clienteNeighborhood?.trim() || row.clienteCity?.trim() || row.clienteState?.trim() || 'Sin zona clara';
  const secondary = row.clienteCity?.trim() || row.clienteState?.trim() || null;
  const label = secondary && secondary !== primary ? `${primary} · ${secondary}` : primary;

  return {
    zoneKey: normalizeText(label || 'sin-zona'),
    zoneLabel: label,
  };
}

function buildAddressLabel(row: CobranzaWorkbenchRow) {
  return [row.clienteAddress, row.clienteNeighborhood, row.clienteCity, row.clienteState]
    .filter(Boolean)
    .join(', ');
}

function buildPriorityFromScore(score: number) {
  if (score >= 80) return routePriority('URGENT');
  if (score >= 60) return routePriority('HIGH');
  if (score >= 35) return routePriority('MEDIUM');
  return routePriority('LOW');
}

function getMostRecentIsoDateTime(values: Array<string | Date | null | undefined>) {
  const normalized = values
    .filter((value): value is string | Date => value != null)
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()))
    .sort((left, right) => right.getTime() - left.getTime());

  return normalized[0]?.toISOString() ?? null;
}

function evaluatePhoneStatus(interacciones: BatchInteraccion[]) {
  const successfulPhoneContact = interacciones.find(
    (item) =>
      INTERACCION_TIPOS_TELEFONO.has(item.tipo) &&
      INTERACCION_RESULTADOS_EXITOSOS.has(item.resultado),
  );
  const wrongNumber = interacciones.find((item) => item.resultado === 'WRONG_NUMBER');

  if (
    wrongNumber &&
    (!successfulPhoneContact ||
      new Date(wrongNumber.fechaHora).getTime() > new Date(successfulPhoneContact.fechaHora).getTime())
  ) {
    return 'INVALID' as const;
  }
  if (successfulPhoneContact) return 'VALID' as const;
  return 'UNKNOWN' as const;
}

function evaluateAddressStatus(visitas: BatchVisitaCampo[]) {
  const successfulVisit = visitas.find((item) => VISITA_RESULTADOS_EXITOSOS.has(item.resultado));
  const addressNotFoundVisit = visitas.find((item) => item.resultado === 'ADDRESS_NOT_FOUND');

  if (
    addressNotFoundVisit &&
    (!successfulVisit ||
      new Date(addressNotFoundVisit.fechaHora).getTime() > new Date(successfulVisit.fechaHora).getTime())
  ) {
    return 'NOT_LOCATED' as const;
  }
  if (successfulVisit) return 'LOCATED' as const;
  return 'UNKNOWN' as const;
}

function buildBaseCandidate(input: {
  row: CobranzaWorkbenchRow;
  occurredAt: string;
  interacciones: BatchInteraccion[];
  promesas: BatchPromesaPago[];
  visitas: BatchVisitaCampo[];
  mode: RutaCobranzaPlannerMode;
}): BaseRouteCandidate {
  const { row, occurredAt, interacciones, promesas, visitas, mode } = input;
  const actionable = getCobranzaActionableBreakdownFromRow(row);
  const pendingPromises = promesas.filter((item) => item.estado === 'PENDING');
  const pendingOverdueCount = pendingPromises.filter((item) => toIsoDate(item.fechaPromesa) < occurredAt).length;
  const nextPending = [...pendingPromises]
    .sort((left, right) => toIsoDate(left.fechaPromesa).localeCompare(toIsoDate(right.fechaPromesa)))[0] ?? null;
  const brokenCount = promesas.filter((item) => item.estado === 'BROKEN').length;
  const phoneStatus = evaluatePhoneStatus(interacciones);
  const addressStatus = evaluateAddressStatus(visitas);

  const successfulInteractions = interacciones.filter((item) =>
    INTERACCION_RESULTADOS_EXITOSOS.has(item.resultado),
  );
  const successfulVisits = visitas.filter((item) => VISITA_RESULTADOS_EXITOSOS.has(item.resultado));
  const lastSuccessfulContactAt = getMostRecentIsoDateTime([
    successfulInteractions[0]?.fechaHora,
    successfulVisits[0]?.fechaHora,
  ]);
  const latestVisitAt = visitas[0]?.fechaHora.toISOString() ?? null;
  const latestVisitResult = visitas[0]?.resultado ?? null;
  const latestVisitDaysAgo = latestVisitAt ? diffDays(occurredAt, latestVisitAt) : null;
  const hasRecentSuccessfulContact = lastSuccessfulContactAt
    ? diffDays(occurredAt, lastSuccessfulContactAt.slice(0, 10)) <= 7
    : false;

  const unsuccessfulContactAttemptsRecentCount = interacciones.filter((item) => {
    if (!INTERACCION_TIPOS_CONTACTO.has(item.tipo)) return false;
    if (INTERACCION_RESULTADOS_EXITOSOS.has(item.resultado)) return false;
    return diffDays(occurredAt, item.fechaHora) <= 14;
  }).length;

  const failedPhoneAttemptsRecentCount = interacciones.filter((item) => {
    if (!INTERACCION_TIPOS_TELEFONO.has(item.tipo)) return false;
    if (INTERACCION_RESULTADOS_EXITOSOS.has(item.resultado)) return false;
    return diffDays(occurredAt, item.fechaHora) <= 14;
  }).length;

  const failedRecentVisitCount = visitas.filter((item) => {
    if (!VISITA_RESULTADOS_FALLIDOS.has(item.resultado)) return false;
    return diffDays(occurredAt, item.fechaHora) <= 30;
  }).length;

  const nextPendingDueSoon = Boolean(
    nextPending &&
      toIsoDate(nextPending.fechaPromesa) >= occurredAt &&
      diffDays(toIsoDate(nextPending.fechaPromesa), occurredAt) <= 1,
  );

  const signals: string[] = [];
  let score = 0;

  if (row.rowMode === 'final_closure') {
    score += 24;
    signals.push('FINAL_CLOSURE_CASE');
  } else if (row.rowMode === 'recovery_only') {
    score += 18;
    signals.push('RECOVERY_ONLY_CASE');
  } else if (row.rowMode === 'extra_week_only') {
    score += 12;
    signals.push('EXTRA_WEEK_ONLY_CASE');
  } else {
    score += 6;
    signals.push('REGULAR_COLLECTION_CASE');
  }

  if (actionable.totalAmount >= 1000) {
    score += 20;
    signals.push('HIGH_ACTIONABLE_AMOUNT');
  } else if (actionable.totalAmount >= 750) {
    score += 16;
    signals.push('ELEVATED_ACTIONABLE_AMOUNT');
  } else if (actionable.totalAmount >= 500) {
    score += 12;
    signals.push('MEDIUM_ACTIONABLE_AMOUNT');
  } else if (actionable.totalAmount >= 250) {
    score += 7;
    signals.push('LOW_ACTIONABLE_AMOUNT');
  }

  if (actionable.recoveryAmount > 0.001) {
    score += 8;
    signals.push('RECOVERY_PENDING');
  }
  if (actionable.extraWeekAmount > 0.001) {
    score += 6;
    signals.push('EXTRA_WEEK_PENDING');
  }

  if (pendingOverdueCount >= 2) {
    score += 18;
    signals.push('MULTIPLE_OVERDUE_PROMISES');
  } else if (pendingOverdueCount === 1) {
    score += 12;
    signals.push('OVERDUE_PROMISE');
  } else if (nextPendingDueSoon) {
    score += 7;
    signals.push('PROMISE_DUE_SOON');
  }

  if (brokenCount >= 2) {
    score += 14;
    signals.push('MULTIPLE_BROKEN_PROMISES');
  } else if (brokenCount === 1) {
    score += 8;
    signals.push('BROKEN_PROMISE');
  }

  if (phoneStatus === 'INVALID') {
    score += 12;
    signals.push('PHONE_INVALID');
  }
  if (addressStatus === 'NOT_LOCATED') {
    score += 12;
    signals.push('ADDRESS_NOT_LOCATED');
  }

  if (!hasRecentSuccessfulContact) {
    score += 8;
    signals.push('NO_RECENT_SUCCESSFUL_CONTACT');
  }
  if (unsuccessfulContactAttemptsRecentCount >= 3) {
    score += 10;
    signals.push('MULTIPLE_FAILED_CONTACT_ATTEMPTS');
  } else if (failedPhoneAttemptsRecentCount >= 2) {
    score += 6;
    signals.push('FAILED_PHONE_ATTEMPTS');
  }

  if (failedRecentVisitCount >= 2) {
    score += 10;
    signals.push('MULTIPLE_FAILED_VISITS');
  } else if (failedRecentVisitCount === 1) {
    score += 6;
    signals.push('FAILED_VISIT');
  }

  if (latestVisitDaysAgo != null && latestVisitDaysAgo <= 3 && pendingOverdueCount === 0) {
    score -= 10;
    signals.push('VERY_RECENT_VISIT');
  }
  if (hasRecentSuccessfulContact && pendingOverdueCount === 0) {
    score -= 8;
    signals.push('RECENT_SUCCESSFUL_CONTACT');
  }

  if (mode === 'urgent') {
    if (row.rowMode === 'final_closure' || actionable.totalAmount >= 750) {
      score += 6;
      signals.push('URGENT_MODE_BOOST');
    }
  }

  if (mode === 'verification') {
    if (phoneStatus === 'INVALID' || addressStatus === 'NOT_LOCATED' || failedRecentVisitCount > 0) {
      score += 10;
      signals.push('VERIFICATION_MODE_BOOST');
    } else {
      score -= 8;
      signals.push('VERIFICATION_MODE_PENALTY');
    }
  }

  const baseRouteLabel = (() => {
    if (row.rowMode === 'final_closure' && score >= 60) return routeLabel('COBRO_CRITICO');
    if (pendingOverdueCount > 0 || nextPendingDueSoon) return routeLabel('SEGUIMIENTO_PROMESA');
    if (phoneStatus === 'INVALID' || addressStatus === 'NOT_LOCATED' || failedRecentVisitCount > 0) {
      return routeLabel('VISITA_VERIFICACION');
    }
    if (
      row.rowMode !== 'regular' ||
      actionable.recoveryAmount > 0.001 ||
      actionable.extraWeekAmount > 0.001 ||
      brokenCount > 0
    ) {
      return routeLabel('RECUPERACION_DIFICIL');
    }
    if (hasRecentSuccessfulContact || addressStatus === 'LOCATED' || Boolean(row.clienteAddress)) {
      return routeLabel('COBRO_RAPIDO');
    }
    return routeLabel('BAJA_PRIORIDAD');
  })();

  const baseRecommendedVisit = (() => {
    if (baseRouteLabel.code === 'BAJA_PRIORIDAD') return false;
    if (mode === 'verification') return baseRouteLabel.code === 'VISITA_VERIFICACION';
    if (baseRouteLabel.code === 'SEGUIMIENTO_PROMESA') {
      return pendingOverdueCount > 0 && !hasRecentSuccessfulContact;
    }
    if (latestVisitDaysAgo != null && latestVisitDaysAgo <= 3 && score < 75) return false;
    return score >= 35;
  })();

  const mainReason =
    baseRouteLabel.code === 'COBRO_CRITICO'
      ? 'Caso en cierre operativo con saldo relevante y necesidad de intervención prioritaria.'
      : baseRouteLabel.code === 'SEGUIMIENTO_PROMESA'
        ? 'Existe promesa vencida o muy próxima a vencerse que conviene revisar en campo.'
        : baseRouteLabel.code === 'VISITA_VERIFICACION'
          ? 'La señal dominante es de verificación operativa por teléfono o domicilio.'
          : baseRouteLabel.code === 'RECUPERACION_DIFICIL'
            ? 'El caso arrastra recuperación o cierre pendiente con seguimiento operativo complejo.'
            : baseRouteLabel.code === 'COBRO_RAPIDO'
              ? 'Hay condiciones razonables para un cobro de campo con lectura rápida del caso.'
              : 'El caso no muestra urgencia táctica suficiente para meterlo hoy en ruta.';

  const zone = buildZone(row);

  return {
    row,
    occurredAt,
    zoneKey: zone.zoneKey,
    zoneLabel: zone.zoneLabel,
    addressLabel: buildAddressLabel(row),
    actionable,
    promiseSignals: {
      pendingCount: pendingPromises.length,
      pendingOverdueCount,
      brokenCount,
      nextPendingAt: nextPending ? toIsoDate(nextPending.fechaPromesa) : null,
      nextPendingDueSoon,
    },
    contactSignals: {
      phoneStatus,
      addressStatus,
      hasRecentSuccessfulContact,
      lastSuccessfulContactAt,
      unsuccessfulContactAttemptsRecentCount,
      failedPhoneAttemptsRecentCount,
    },
    visitSignals: {
      failedRecentCount: failedRecentVisitCount,
      latestVisitAt,
      latestVisitResult,
      latestVisitDaysAgo,
    },
    baseRouteLabel,
    baseRoutePriorityScore: clampScore(score),
    baseRecommendedVisit,
    baseSignals: [...new Set(signals)],
    baseMainReason: mainReason,
  };
}

function finalizeRouteLabel(
  expediente: CobranzaExpedienteCorto,
  primaryActionCode: CobranzaExpedienteCorto['recommendation']['primaryAction']['code'],
) {
  if (
    primaryActionCode === 'PREPARE_OPERATIVE_CLOSURE' ||
    (expediente.header.caseCode === 'CIERRE_OPERATIVO' && expediente.risk.nivelRiesgo === 'CRITICAL')
  ) {
    return routeLabel('COBRO_CRITICO');
  }
  if (
    primaryActionCode === 'FOLLOW_UP_PROMISE' ||
    expediente.promises.pendingOverdueCount > 0 ||
    expediente.promises.nextPending?.isOverdue === true
  ) {
    return routeLabel('SEGUIMIENTO_PROMESA');
  }
  if (
    primaryActionCode === 'VERIFY_ADDRESS' ||
    primaryActionCode === 'VERIFY_PHONE' ||
    expediente.contactability.addressStatus === 'NOT_LOCATED' ||
    expediente.contactability.phoneStatus === 'INVALID'
  ) {
    return routeLabel('VISITA_VERIFICACION');
  }
  if (
    expediente.header.caseCode === 'CIERRE_OPERATIVO' ||
    expediente.header.caseCode === 'SOLO_RECUPERADO' ||
    expediente.header.caseCode === 'SOLO_SEMANA_13' ||
    expediente.actionable.recoveryAmount > 0.001 ||
    expediente.actionable.extraWeekAmount > 0.001 ||
    expediente.promises.brokenCount > 0
  ) {
    return routeLabel('RECUPERACION_DIFICIL');
  }
  if (primaryActionCode === 'PROGRAM_FIELD_VISIT') {
    return routeLabel('COBRO_RAPIDO');
  }
  return routeLabel('BAJA_PRIORIDAD');
}

function finalizeRecommendedVisit(input: {
  expediente: CobranzaExpedienteCorto;
  primaryActionCode: CobranzaExpedienteCorto['recommendation']['primaryAction']['code'];
  routeLabelCode: RutaCobranzaLabelCode;
}) {
  if (FIELD_RECOMMENDATION_ACTIONS.has(input.primaryActionCode)) return true;
  if (input.primaryActionCode === 'FOLLOW_UP_PROMISE') {
    return (
      input.expediente.promises.pendingOverdueCount > 0 ||
      (input.expediente.risk.nivelRiesgo !== 'LOW' &&
        !input.expediente.contactability.hasRecentSuccessfulContact)
    );
  }
  if (input.routeLabelCode === 'COBRO_RAPIDO') {
    return input.expediente.actionable.totalAmount >= 250;
  }
  return false;
}

function finalizeInclusion(input: {
  expediente: CobranzaExpedienteCorto;
  mode: RutaCobranzaPlannerMode;
  routePriorityScore: number;
  primaryActionCode: CobranzaExpedienteCorto['recommendation']['primaryAction']['code'];
  routeLabelCode: RutaCobranzaLabelCode;
  recommendedVisit: boolean;
}) {
  const lastVisitAt = input.expediente.visits.latestVisit?.fechaHora ?? null;
  const recentVisitDaysAgo = lastVisitAt ? diffDays(input.expediente.occurredAt, lastVisitAt) : null;
  const hasOverduePromise =
    input.expediente.promises.pendingOverdueCount > 0 ||
    input.expediente.promises.nextPending?.isOverdue === true;

  if (input.expediente.actionable.totalAmount <= 0.001) {
    return {
      includeInRoute: false,
      inclusionReason: 'Se deja fuera porque el caso ya no tiene saldo accionable real.',
    };
  }

  if (
    recentVisitDaysAgo != null &&
    recentVisitDaysAgo <= 3 &&
    input.routePriorityScore < 80 &&
    input.primaryActionCode !== 'PREPARE_OPERATIVE_CLOSURE' &&
    input.primaryActionCode !== 'VERIFY_ADDRESS' &&
    input.primaryActionCode !== 'VERIFY_PHONE'
  ) {
    return {
      includeInRoute: false,
      inclusionReason: 'Se deja opcional porque ya tuvo visita muy reciente sin una nueva señal dominante.',
    };
  }

  if (input.mode === 'verification') {
    const includeVerification =
      input.primaryActionCode === 'VERIFY_ADDRESS' ||
      input.primaryActionCode === 'VERIFY_PHONE' ||
      input.routeLabelCode === 'VISITA_VERIFICACION';

    return {
      includeInRoute: includeVerification,
      inclusionReason: includeVerification
        ? 'Se incluye para verificación operativa de teléfono o domicilio.'
        : 'Se deja fuera porque hoy no domina una necesidad de verificación de campo.',
    };
  }

  if (input.primaryActionCode === 'PREPARE_OPERATIVE_CLOSURE') {
    return {
      includeInRoute: true,
      inclusionReason: 'Se incluye por cierre operativo con prioridad táctica alta.',
    };
  }

  if (FIELD_RECOMMENDATION_ACTIONS.has(input.primaryActionCode)) {
    return {
      includeInRoute: true,
      inclusionReason: 'Se incluye porque la acción sugerida principal ya requiere gestión de campo.',
    };
  }

  if (input.primaryActionCode === 'FOLLOW_UP_PROMISE') {
    const includePromise =
      hasOverduePromise ||
      (!input.expediente.contactability.hasRecentSuccessfulContact && input.routePriorityScore >= 65);

    return {
      includeInRoute: includePromise,
      inclusionReason: includePromise
        ? 'Se incluye para seguimiento de promesa con necesidad táctica de presencia.'
        : 'Se deja opcional porque la promesa puede seguirse primero por canal remoto.',
    };
  }

  if (input.recommendedVisit && input.routePriorityScore >= 60) {
    return {
      includeInRoute: true,
      inclusionReason: 'Se incluye por prioridad táctica suficiente y buena oportunidad de visita.',
    };
  }

  if (REMOTE_FIRST_ACTIONS.has(input.primaryActionCode) && input.routePriorityScore < 70) {
    return {
      includeInRoute: false,
      inclusionReason: 'Se deja fuera porque hoy conviene agotar primero el seguimiento remoto.',
    };
  }

  return {
    includeInRoute: false,
    inclusionReason: 'Se deja como opcional por prioridad táctica baja para esta ruta.',
  };
}

function computeFinalRouteScore(input: {
  base: BaseRouteCandidate;
  expediente: CobranzaExpedienteCorto;
}) {
  let score = input.base.baseRoutePriorityScore;
  const riskLevel = input.expediente.risk.nivelRiesgo;
  const actionCode = input.expediente.recommendation.primaryAction.code;
  const recommendationPriority = input.expediente.recommendation.priority.code;
  const lastVisitAt = input.expediente.visits.latestVisit?.fechaHora ?? null;
  const recentVisitDaysAgo = lastVisitAt ? diffDays(input.expediente.occurredAt, lastVisitAt) : null;

  if (riskLevel === 'CRITICAL') score += 22;
  else if (riskLevel === 'HIGH') score += 15;
  else if (riskLevel === 'MEDIUM') score += 7;

  if (recommendationPriority === 'URGENT') score += 10;
  else if (recommendationPriority === 'HIGH') score += 6;
  else if (recommendationPriority === 'MEDIUM') score += 3;

  if (actionCode === 'PREPARE_OPERATIVE_CLOSURE') score += 18;
  else if (actionCode === 'PROGRAM_FIELD_VISIT') score += 16;
  else if (actionCode === 'VERIFY_ADDRESS' || actionCode === 'VERIFY_PHONE') score += 14;
  else if (actionCode === 'FOLLOW_UP_PROMISE') score += 10;
  else if (REMOTE_FIRST_ACTIONS.has(actionCode)) score -= 10;

  if (input.expediente.promises.pendingOverdueCount > 0) score += 6;
  if (input.expediente.promises.brokenCount > 0) score += 4;

  if (
    input.expediente.contactability.hasRecentSuccessfulContact &&
    REMOTE_FIRST_ACTIONS.has(actionCode) &&
    input.expediente.promises.pendingOverdueCount === 0
  ) {
    score -= 12;
  }

  if (
    recentVisitDaysAgo != null &&
    recentVisitDaysAgo <= 3 &&
    actionCode !== 'PREPARE_OPERATIVE_CLOSURE' &&
    actionCode !== 'VERIFY_ADDRESS' &&
    actionCode !== 'VERIFY_PHONE'
  ) {
    score -= 10;
  }

  return clampScore(score);
}

function buildFinalItem(input: {
  base: BaseRouteCandidate;
  expediente: CobranzaExpedienteCorto;
  mode: RutaCobranzaPlannerMode;
}): RutaCobranzaPlannerItem {
  const { base, expediente, mode } = input;
  const routePriorityScore = computeFinalRouteScore({ base, expediente });
  const routePriorityValue = buildPriorityFromScore(routePriorityScore);
  const primaryActionCode = expediente.recommendation.primaryAction.code;
  const routeLabelValue = finalizeRouteLabel(expediente, primaryActionCode);
  const recommendedVisit = finalizeRecommendedVisit({
    expediente,
    primaryActionCode,
    routeLabelCode: routeLabelValue.code,
  });
  const inclusion = finalizeInclusion({
    expediente,
    mode,
    routePriorityScore,
    primaryActionCode,
    routeLabelCode: routeLabelValue.code,
    recommendedVisit,
  });
  const riskFactorCodes = summarizeCobranzaRiskFactors(expediente.risk.factores, 3).map((factor) => factor.code);
  const recommendationCodes = expediente.recommendation.reasons.map((reason) => reason.code);

  return {
    routeOrder: null,
    creditoId: expediente.operativaPanel.credito.id,
    clienteId: expediente.operativaPanel.cliente.id,
    clienteCodigo: expediente.operativaPanel.cliente.code,
    clienteNombre: expediente.operativaPanel.cliente.fullName,
    telefono:
      expediente.customer.phone ??
      expediente.customer.secondaryPhone ??
      expediente.operativaPanel.cliente.phone ??
      expediente.operativaPanel.cliente.secondaryPhone,
    clienteLabel: expediente.header.clientLabel,
    creditFolio: expediente.header.creditFolio,
    loanNumber: expediente.header.loanNumber,
    controlNumber: expediente.header.controlNumber,
    caseLabel: expediente.header.caseLabel,
    promotoriaName: expediente.header.promotoriaName,
    supervisionName: expediente.header.supervisionName,
    zoneKey: base.zoneKey,
    zoneLabel: base.zoneLabel,
    addressLabel: base.addressLabel || expediente.customer.address || 'Sin dirección operativa',
    routePriorityScore,
    routePriority: routePriorityValue,
    routeLabel: routeLabelValue,
    recommendedVisit,
    includeInRoute: inclusion.includeInRoute,
    inclusionReason: inclusion.inclusionReason,
    mainReason:
      expediente.recommendation.reasons[0]?.reason ??
      expediente.recommendation.summary ??
      base.baseMainReason,
    signals: [...new Set([...recommendationCodes, ...riskFactorCodes, ...base.baseSignals])].slice(0, 5),
    actionable: {
      regularAmount: expediente.actionable.regularAmount,
      recoveryAmount: expediente.actionable.recoveryAmount,
      extraWeekAmount: expediente.actionable.extraWeekAmount,
      totalAmount: expediente.actionable.totalAmount,
    },
    risk: {
      scoreTotal: expediente.risk.scoreTotal,
      nivelRiesgo: expediente.risk.nivelRiesgo,
      diasAtraso: expediente.risk.diasAtraso,
    },
    suggestedAction: {
      code: primaryActionCode,
      label: expediente.recommendation.primaryAction.label,
    },
    contactability: {
      phoneStatus: expediente.contactability.phoneStatus,
      addressStatus: expediente.contactability.addressStatus,
      hasRecentSuccessfulContact: expediente.contactability.hasRecentSuccessfulContact,
      lastSuccessfulContactAt: expediente.contactability.lastSuccessfulContactAt,
    },
    geo: expediente.geo,
    links: expediente.links,
    cobranzaHref: `/cobranza/${expediente.operativaPanel.credito.id}?occurredAt=${expediente.occurredAt}`,
  };
}

function rankZoneGroup(input: {
  items: RutaCobranzaPlannerItem[];
  mode: RutaCobranzaPlannerMode;
}) {
  const maxPriority = Math.max(...input.items.map((item) => item.routePriorityScore));
  const totalActionable = input.items.reduce((sum, item) => sum + item.actionable.totalAmount, 0);
  const verificationCases = input.items.filter((item) => item.routeLabel.code === 'VISITA_VERIFICACION').length;
  const countBonus = Math.min(input.items.length, 4) * (input.mode === 'balanced' ? 6 : 3);
  const actionableBonus = Math.min(totalActionable / 500, input.mode === 'balanced' ? 12 : 8);
  const verificationBonus = input.mode === 'verification' ? verificationCases * 6 : 0;

  return maxPriority + countBonus + actionableBonus + verificationBonus;
}

function sortPlannerItems(left: RutaCobranzaPlannerItem, right: RutaCobranzaPlannerItem) {
  if (left.routePriorityScore !== right.routePriorityScore) {
    return right.routePriorityScore - left.routePriorityScore;
  }
  if (left.risk.scoreTotal !== right.risk.scoreTotal) {
    return right.risk.scoreTotal - left.risk.scoreTotal;
  }
  if (left.actionable.totalAmount !== right.actionable.totalAmount) {
    return right.actionable.totalAmount - left.actionable.totalAmount;
  }
  return left.clienteNombre.localeCompare(right.clienteNombre);
}

function assignRouteOrder(items: RutaCobranzaPlannerItem[]) {
  return items.map((item, index) => ({
    ...item,
    routeOrder: index + 1,
  }));
}

export async function getRutaCobranzaPlan(
  input: RutaCobranzaPlannerInput = {},
): Promise<RutaCobranzaPlannerResult> {
  const occurredAt = getDefaultOccurredAt(input.occurredAt);
  const mode = input.mode ?? 'balanced';
  const limit = Math.min(Math.max(input.limit ?? 24, 1), 40);

  const workbench = await getCobranzaWorkbenchData({
    occurredAt,
    scope: 'all',
    supervisionId: input.supervisionId,
    promotoriaId: input.promotoriaId,
    rowMode: 'all',
    cycle: 'all',
  });

  const dedupedRows = [...new Map(workbench.rows.map((row) => [row.creditoId, row])).values()];
  const zoneOptionMap = new Map<string, { key: string; label: string; cases: number }>();

  for (const row of dedupedRows) {
    const zone = buildZone(row);
    const current = zoneOptionMap.get(zone.zoneKey);
    zoneOptionMap.set(zone.zoneKey, {
      key: zone.zoneKey,
      label: zone.zoneLabel,
      cases: (current?.cases ?? 0) + 1,
    });
  }

  const filteredRows = input.zone
    ? dedupedRows.filter((row) => buildZone(row).zoneKey === input.zone)
    : dedupedRows;

  const clienteIds = [...new Set(filteredRows.map((row) => row.clienteId))];
  const creditoIds = [...new Set(filteredRows.map((row) => row.creditoId))];

  const [interacciones, promesas, visitas] = await Promise.all([
    listBatchRiskInteraccionesByContext({ clienteIds, creditoIds }),
    listBatchRiskPromesasPagoByContext({ clienteIds, creditoIds }),
    listBatchRiskVisitasCampoByContext({ clienteIds, creditoIds }),
  ]);

  const interaccionesByCliente = new Map<string, BatchInteraccion[]>();
  const promesasByCliente = new Map<string, BatchPromesaPago[]>();
  const visitasByCliente = new Map<string, BatchVisitaCampo[]>();

  for (const item of interacciones) {
    const current = interaccionesByCliente.get(item.clienteId) ?? [];
    current.push(item);
    interaccionesByCliente.set(item.clienteId, current);
  }

  for (const item of promesas) {
    const current = promesasByCliente.get(item.clienteId) ?? [];
    current.push(item);
    promesasByCliente.set(item.clienteId, current);
  }

  for (const item of visitas) {
    const current = visitasByCliente.get(item.clienteId) ?? [];
    current.push(item);
    visitasByCliente.set(item.clienteId, current);
  }

  const baseCandidates = filteredRows
    .map((row) => {
      const contextInteracciones = (interaccionesByCliente.get(row.clienteId) ?? []).filter(
        (item) => item.creditoId == null || item.creditoId === row.creditoId,
      );
      const contextPromesas = (promesasByCliente.get(row.clienteId) ?? []).filter(
        (item) => item.creditoId == null || item.creditoId === row.creditoId,
      );
      const contextVisitas = (visitasByCliente.get(row.clienteId) ?? []).filter(
        (item) => item.creditoId == null || item.creditoId === row.creditoId,
      );

      return buildBaseCandidate({
        row,
        occurredAt,
        interacciones: contextInteracciones,
        promesas: contextPromesas,
        visitas: contextVisitas,
        mode,
      });
    })
    .sort((left, right) => right.baseRoutePriorityScore - left.baseRoutePriorityScore);

  const preselectionThreshold = mode === 'verification' ? 28 : mode === 'urgent' ? 40 : 34;
  const enrichmentWindow = Math.min(Math.max(limit + 12, 24), 42);
  const preselectedCandidates = (
    baseCandidates.filter(
      (candidate) =>
        candidate.baseRecommendedVisit || candidate.baseRoutePriorityScore >= preselectionThreshold,
    ).length
      ? baseCandidates.filter(
          (candidate) =>
            candidate.baseRecommendedVisit || candidate.baseRoutePriorityScore >= preselectionThreshold,
        )
      : baseCandidates
  ).slice(0, enrichmentWindow);

  const candidateMetaByCredito = new Map(
    baseCandidates.map((candidate) => [
      candidate.row.creditoId,
      {
        clienteId: candidate.row.clienteId,
        rowMode: candidate.row.rowMode,
        amount: candidate.actionable.totalAmount,
      },
    ]),
  );
  const discardedByCredito = new Map<
    string,
    {
      code: RutaCobranzaPlannerDiscardReasonCode;
      detail?: string;
    }
  >();
  const expedienteFailures: RutaCobranzaPlannerDiagnostics['expedienteFailures'] = [];
  const preselectedCreditoIds = new Set(preselectedCandidates.map((candidate) => candidate.row.creditoId));

  for (const candidate of baseCandidates) {
    if (preselectedCreditoIds.has(candidate.row.creditoId)) continue;
    discardedByCredito.set(candidate.row.creditoId, {
      code: 'PRESELECTION_THRESHOLD',
    });
  }

  const resolvedItems = await Promise.allSettled(
    preselectedCandidates.map(async (candidate) => {
      const expediente = await getCobranzaExpedienteCorto({
        creditoId: candidate.row.creditoId,
        occurredAt,
      });

      if (!expediente) return null;

      return buildFinalItem({
        base: candidate,
        expediente,
        mode,
      });
    }),
  );

  const enrichedItems: RutaCobranzaPlannerItem[] = [];

  for (const [index, result] of resolvedItems.entries()) {
    const candidate = preselectedCandidates[index];
    if (!candidate) continue;

    if (result.status === 'rejected') {
      const message = getPlannerErrorMessage(result.reason);
      expedienteFailures.push({
        creditoId: candidate.row.creditoId,
        clienteId: candidate.row.clienteId,
        message,
      });
      discardedByCredito.set(candidate.row.creditoId, {
        code: 'EXPEDIENTE_ERROR',
        detail: message,
      });
      continue;
    }

    if (!result.value) {
      discardedByCredito.set(candidate.row.creditoId, {
        code: 'EXPEDIENTE_NOT_FOUND',
      });
      continue;
    }

    enrichedItems.push(result.value);
  }

  const suggestedPool = enrichedItems.filter((item) => item.includeInRoute && item.recommendedVisit);
  const optionalPool = enrichedItems.filter((item) => !item.includeInRoute || !item.recommendedVisit);

  const groupedSuggested = new Map<string, RutaCobranzaPlannerItem[]>();
  for (const item of suggestedPool) {
    const current = groupedSuggested.get(item.zoneKey) ?? [];
    current.push(item);
    groupedSuggested.set(item.zoneKey, current);
  }

  const orderedGroups = [...groupedSuggested.entries()]
    .map(([zoneKey, items]) => ({
      zoneKey,
      zoneLabel: items[0]?.zoneLabel ?? 'Sin zona clara',
      items: [...items].sort(sortPlannerItems),
      totalActionableAmount: Number(items.reduce((sum, item) => sum + item.actionable.totalAmount, 0).toFixed(2)),
      rank: rankZoneGroup({ items, mode }),
    }))
    .sort((left, right) => {
      if (left.rank !== right.rank) return right.rank - left.rank;
      return left.zoneLabel.localeCompare(right.zoneLabel);
    });

  const orderedSuggested = orderedGroups.flatMap((group) => group.items);
  const finalSuggested = assignRouteOrder(orderedSuggested.slice(0, limit));
  const overflowOptional = orderedSuggested.slice(limit).map((item) => ({
    ...item,
    includeInRoute: false,
    routeOrder: null,
    inclusionReason: 'Quedó como opcional por límite operativo del día para esta ruta.',
  }));
  const finalOptional = [...overflowOptional, ...optionalPool]
    .sort(sortPlannerItems)
    .slice(0, 10)
    .map((item) => ({
      ...item,
      routeOrder: null,
    }));

  for (const item of overflowOptional) {
    discardedByCredito.set(item.creditoId, {
      code: 'OVERFLOW_LIMIT',
    });
  }

  for (const item of optionalPool) {
    discardedByCredito.set(item.creditoId, {
      code: item.recommendedVisit ? 'EXCLUDED_BY_INCLUSION_RULE' : 'NOT_RECOMMENDED_VISIT',
      detail: item.inclusionReason,
    });
  }

  const finalGroupMap = new Map<string, RutaCobranzaPlannerItem[]>();
  for (const item of finalSuggested) {
    const current = finalGroupMap.get(item.zoneKey) ?? [];
    current.push(item);
    finalGroupMap.set(item.zoneKey, current);
  }

  const groups: RutaCobranzaPlannerGroup[] = [...finalGroupMap.entries()].map(([zoneKey, items]) => ({
    zoneKey,
    zoneLabel: items[0]?.zoneLabel ?? 'Sin zona clara',
    suggestedCases: items.length,
    totalActionableAmount: Number(items.reduce((sum, item) => sum + item.actionable.totalAmount, 0).toFixed(2)),
    items,
  }));

  const byLabelMap = new Map<RutaCobranzaLabelCode, number>();
  for (const item of finalSuggested) {
    byLabelMap.set(item.routeLabel.code, (byLabelMap.get(item.routeLabel.code) ?? 0) + 1);
  }

  const workbenchCoverage = buildPlannerPortfolioCoverage(
    workbench.rows.map((row) => ({
      rowMode: row.rowMode,
      amount: getCobranzaActionableBreakdownFromRow(row).totalAmount,
    })),
  );
  const evaluatedCoverage = buildPlannerPortfolioCoverage(
    baseCandidates.map((candidate) => ({
      rowMode: candidate.row.rowMode,
      amount: candidate.actionable.totalAmount,
    })),
  );
  const preselectedCoverage = buildPlannerPortfolioCoverage(
    preselectedCandidates.map((candidate) => ({
      rowMode: candidate.row.rowMode,
      amount: candidate.actionable.totalAmount,
    })),
  );
  const suggestedCoverage = buildPlannerPortfolioCoverage(
    finalSuggested.map((item) => ({
      rowMode: candidateMetaByCredito.get(item.creditoId)?.rowMode ?? 'regular',
      amount: item.actionable.totalAmount,
    })),
  );
  const discardedCoverage = buildPlannerPortfolioCoverage(
    [...discardedByCredito.entries()].map(([creditoId]) => ({
      rowMode: candidateMetaByCredito.get(creditoId)?.rowMode ?? 'regular',
      amount: candidateMetaByCredito.get(creditoId)?.amount ?? 0,
    })),
  );
  const discardReasonMap = new Map<RutaCobranzaPlannerDiscardReasonCode, number>();

  for (const outcome of discardedByCredito.values()) {
    discardReasonMap.set(outcome.code, (discardReasonMap.get(outcome.code) ?? 0) + 1);
  }

  const diagnostics: RutaCobranzaPlannerDiagnostics = {
    totalWorkbenchRows: workbench.rows.length,
    totalCreditsEvaluated: baseCandidates.length,
    totalDiscarded: discardedByCredito.size,
    stages: {
      dedupedCredits: dedupedRows.length,
      zoneFilteredCredits: filteredRows.length,
      preselectedCredits: preselectedCandidates.length,
      enrichedCredits: enrichedItems.length,
      finalSuggestedCredits: finalSuggested.length,
      optionalCredits: overflowOptional.length + optionalPool.length,
    },
    portfolioCoverage: {
      workbench: workbenchCoverage,
      evaluated: evaluatedCoverage,
      preselected: preselectedCoverage,
      suggested: suggestedCoverage,
      discarded: discardedCoverage,
    },
    discardReasons: [...discardReasonMap.entries()]
      .map(([code, cases]) => ({
        code,
        label: DISCARD_REASON_LABELS[code],
        cases,
      }))
      .sort((left, right) => right.cases - left.cases),
    expedienteFailures,
  };

  console.info(
    '[ruta-cobranza-planner]',
    JSON.stringify({
      occurredAt,
      mode,
      totalWorkbenchRows: diagnostics.totalWorkbenchRows,
      totalCreditsEvaluated: diagnostics.totalCreditsEvaluated,
      totalDiscarded: diagnostics.totalDiscarded,
      stages: diagnostics.stages,
      workbenchCoverage: diagnostics.portfolioCoverage.workbench.buckets,
      evaluatedCoverage: diagnostics.portfolioCoverage.evaluated.buckets,
      preselectedCoverage: diagnostics.portfolioCoverage.preselected.buckets,
      suggestedCoverage: diagnostics.portfolioCoverage.suggested.buckets,
      discardReasons: diagnostics.discardReasons,
    }),
  );

  if (expedienteFailures.length) {
    console.warn(
      '[ruta-cobranza-planner] expediente enrichment failures',
      expedienteFailures.slice(0, 8),
    );
  }

  return {
    strategy: 'HYBRID_WORKBENCH_ROUTE_PLANNER_V1',
    filters: {
      occurredAt,
      supervisionId: input.supervisionId ?? '',
      promotoriaId: input.promotoriaId ?? '',
      zone: input.zone ?? '',
      limit,
      mode,
    },
    options: {
      supervision: workbench.options.supervision,
      promotoria: workbench.options.promotoria.map((item) => ({
        id: item.id,
        name: item.name,
      })),
      zones: [...zoneOptionMap.values()].sort((left, right) => left.label.localeCompare(right.label)),
    },
    summary: {
      totalSuggestedCases: finalSuggested.length,
      totalActionableAmount: Number(
        finalSuggested.reduce((sum, item) => sum + item.actionable.totalAmount, 0).toFixed(2),
      ),
      criticalCases: finalSuggested.filter((item) => item.risk.nivelRiesgo === 'CRITICAL').length,
      zonesCovered: groups.length,
      optionalCases: overflowOptional.length + optionalPool.length,
      byLabel: [...byLabelMap.entries()].map(([code, cases]) => ({
        code,
        label: ROUTE_LABELS[code],
        cases,
      })),
      zones: groups.map((group) => ({
        key: group.zoneKey,
        label: group.zoneLabel,
        cases: group.suggestedCases,
        totalActionableAmount: group.totalActionableAmount,
      })),
    },
    items: finalSuggested,
    groups,
    optionalItems: finalOptional,
    diagnostics,
  };
}
