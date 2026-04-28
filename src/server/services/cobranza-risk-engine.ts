import { AppError } from '@/lib/errors';
import { normalizeToIsoDate, parseFlexibleDateInput } from '@/lib/date-input';
import { getCobranzaCaseDetail, type CobranzaCaseDetail } from '@/server/services/cobranza-service';
import { findOperationalClienteById } from '@/server/repositories/cobranza-operativa-repository';
import {
  listClientCreditsForRisk,
  listRiskInteraccionesByContext,
  listRiskPromesasPagoByContext,
  listRiskVisitasCampoByContext,
} from '@/server/repositories/cobranza-risk-repository';

type RiskDirection = 'UP' | 'DOWN';
type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

type RiskFactor = {
  code: string;
  weight: number;
  direction: RiskDirection;
  reason: string;
};

type RiskContextSummary = {
  caseLabel: CobranzaCaseDetail['caseLabel'];
  technicalCycleLabel: CobranzaCaseDetail['technicalCycleLabel'];
  rowMode: CobranzaCaseDetail['row'] extends infer T ? (T extends { rowMode: infer R } ? R : null) : null;
};

type RiskDateInput = string | Date;

export type CobranzaRiskInteraccionEvent = {
  tipo: string;
  resultado: string;
  fechaHora: RiskDateInput;
  canal?: string | null;
  telefonoUsado?: string | null;
};

export type CobranzaRiskPromesaPagoEvent = {
  estado: string;
  fechaPromesa: RiskDateInput;
};

export type CobranzaRiskVisitaCampoEvent = {
  resultado: string;
  fechaHora: RiskDateInput;
};

export type CobranzaRiskOperationalHistory = {
  interacciones: CobranzaRiskInteraccionEvent[];
  promesas: CobranzaRiskPromesaPagoEvent[];
  visitas: CobranzaRiskVisitaCampoEvent[];
};

export type CobranzaRiskSnapshot = {
  scope: 'CREDIT';
  strategy: 'ON_DEMAND_RULES_V1';
  clienteId: string;
  creditoId: string;
  clientLabel: string;
  creditLabel: string;
  scoreTotal: number;
  nivelRiesgo: RiskLevel;
  diasAtraso: number;
  montoAccionable: number;
  totalFallas: number;
  fallasPendientes: number;
  promesasPendientes: number;
  promesasPendientesVencidas: number;
  promesasIncumplidas: number;
  visitasFallidas: number;
  tasaContactoEfectivo: number | null;
  ultimoContactoExitosoAt: string | null;
  ultimaVisitaAt: string | null;
  ultimoPagoRealAt: string | null;
  telefonoValidoInferido: boolean | null;
  domicilioUbicadoInferido: boolean | null;
  recoveryPendiente: number;
  semana13Pendiente: number;
  multasPendientes: number;
  factores: RiskFactor[];
  calculadoAt: string;
  occurredAt: string;
  contexto: RiskContextSummary;
};

export type CobranzaClientRiskSummary = {
  scope: 'CLIENT';
  strategy: 'MAX_CREDIT_SCORE_ON_DEMAND_RULES_V1';
  clienteId: string;
  clientLabel: string;
  scoreTotal: number;
  nivelRiesgo: RiskLevel;
  diasAtraso: number;
  montoAccionable: number;
  totalFallas: number;
  fallasPendientes: number;
  promesasPendientes: number;
  promesasPendientesVencidas: number;
  promesasIncumplidas: number;
  visitasFallidas: number;
  tasaContactoEfectivo: number | null;
  ultimoContactoExitosoAt: string | null;
  ultimaVisitaAt: string | null;
  ultimoPagoRealAt: string | null;
  telefonoValidoInferido: boolean | null;
  domicilioUbicadoInferido: boolean | null;
  recoveryPendiente: number;
  semana13Pendiente: number;
  multasPendientes: number;
  factores: RiskFactor[];
  calculadoAt: string;
  occurredAt: string;
  aggregation: {
    strategy: 'MAX_CREDIT_SCORE';
    creditCount: number;
    actionableCreditCount: number;
  };
  primaryCredit: {
    creditoId: string;
    creditLabel: string;
    scoreTotal: number;
    nivelRiesgo: RiskLevel;
    montoAccionable: number;
    diasAtraso: number;
  } | null;
  creditSummaries: Array<{
    creditoId: string;
    creditLabel: string;
    scoreTotal: number;
    nivelRiesgo: RiskLevel;
    montoAccionable: number;
    diasAtraso: number;
  }>;
};

const INTERACCION_RESULTADOS_EXITOSOS = new Set([
  'CONTACTED',
  'PROMISE_REGISTERED',
  'PAID_REPORTED',
]);

const INTERACCION_TIPOS_CONTACTO = new Set(['CALL', 'WHATSAPP', 'SMS', 'VISIT']);
const INTERACCION_TIPOS_TELEFONO = new Set(['CALL', 'WHATSAPP', 'SMS']);
const VISITA_RESULTADOS_EXITOSOS = new Set([
  'VISIT_SUCCESSFUL',
  'PAYMENT_COLLECTED_REPORTED',
]);
const VISITA_RESULTADOS_FALLIDOS = new Set([
  'CLIENT_NOT_HOME',
  'ADDRESS_NOT_FOUND',
  'FOLLOW_UP_REQUIRED',
  'REFUSED_CONTACT',
]);

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

function toIsoDateTime(value: Date) {
  return value.toISOString();
}

function toDateTime(value: RiskDateInput) {
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  return toDateAtNoon(value);
}

function toIsoDateInput(value: RiskDateInput) {
  if (typeof value === 'string') {
    const normalized = normalizeToIsoDate(value);
    if (normalized) return normalized;
  }
  return toDateTime(value).toISOString().slice(0, 10);
}

function toIsoDateTimeInput(value: RiskDateInput) {
  return toDateTime(value).toISOString();
}

function compareDateInputsDesc(left: RiskDateInput, right: RiskDateInput) {
  return toDateTime(right).getTime() - toDateTime(left).getTime();
}

function diffDays(fromIso: string, toIso: string) {
  const from = toDateAtNoon(fromIso);
  const to = toDateAtNoon(toIso);
  return Math.max(0, Math.floor((from.getTime() - to.getTime()) / 86_400_000));
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getRiskLevel(scoreTotal: number): RiskLevel {
  if (scoreTotal >= 80) return 'CRITICAL';
  if (scoreTotal >= 60) return 'HIGH';
  if (scoreTotal >= 30) return 'MEDIUM';
  return 'LOW';
}

function getMostRecentIso(values: Array<string | null | undefined>) {
  const filtered = values.filter((value): value is string => Boolean(value));
  if (!filtered.length) return null;
  return [...filtered].sort((left, right) => right.localeCompare(left))[0] ?? null;
}

function getTopFactors(factores: RiskFactor[], limit = 5) {
  return [...factores]
    .sort((left, right) => Math.abs(right.weight) - Math.abs(left.weight))
    .slice(0, limit);
}

function buildRiskContext(detail: CobranzaCaseDetail): RiskContextSummary {
  return {
    caseLabel: detail.caseLabel,
    technicalCycleLabel: detail.technicalCycleLabel,
    rowMode: detail.row?.rowMode ?? null,
  };
}

function resolveOldestPendingDate(detail: CobranzaCaseDetail) {
  const candidates: string[] = [];

  if (detail.actionable.regularAmount > 0 && detail.row?.scheduledDate) {
    candidates.push(detail.row.scheduledDate);
  }
  if (detail.pendingFailures.length) {
    candidates.push(...detail.pendingFailures.map((item) => item.dueDate));
  }
  if (detail.extraWeek && detail.extraWeek.pendingAmount > 0) {
    candidates.push(detail.extraWeek.dueDate);
  }

  return candidates.sort((left, right) => left.localeCompare(right))[0] ?? null;
}

function countTotalFallas(detail: CobranzaCaseDetail) {
  const reversedDefaultIds = new Set(
    detail.credito.reversals
      .filter((reversal) => reversal.sourceType === 'DEFAULT_EVENT')
      .map((reversal) => reversal.sourceId),
  );

  return detail.credito.defaults.filter((defaultEvent) => !reversedDefaultIds.has(defaultEvent.id)).length;
}

async function getCreditOperationalHistory(input: {
  clienteId: string;
  creditoId: string;
}): Promise<CobranzaRiskOperationalHistory> {
  const [interacciones, promesas, visitas] = await Promise.all([
    listRiskInteraccionesByContext(input),
    listRiskPromesasPagoByContext(input),
    listRiskVisitasCampoByContext(input),
  ]);

  return { interacciones, promesas, visitas };
}

function evaluatePhoneValidity(history: CobranzaRiskOperationalHistory) {
  const successfulPhoneContact = history.interacciones.find(
    (item) =>
      INTERACCION_TIPOS_TELEFONO.has(item.tipo) &&
      INTERACCION_RESULTADOS_EXITOSOS.has(item.resultado),
  );
  const wrongNumber = history.interacciones.find((item) => item.resultado === 'WRONG_NUMBER');

  if (
    wrongNumber &&
    (!successfulPhoneContact ||
      toDateTime(wrongNumber.fechaHora).getTime() > toDateTime(successfulPhoneContact.fechaHora).getTime())
  ) {
    return false;
  }
  if (successfulPhoneContact) {
    return true;
  }
  return null;
}

function evaluateAddressLocation(history: CobranzaRiskOperationalHistory) {
  const successfulVisit = history.visitas.find((item) => VISITA_RESULTADOS_EXITOSOS.has(item.resultado));
  const addressNotFoundVisit = history.visitas.find((item) => item.resultado === 'ADDRESS_NOT_FOUND');

  if (
    addressNotFoundVisit &&
    (!successfulVisit ||
      toDateTime(addressNotFoundVisit.fechaHora).getTime() > toDateTime(successfulVisit.fechaHora).getTime())
  ) {
    return false;
  }
  if (successfulVisit) {
    return true;
  }
  return null;
}

function addFactor(
  factors: RiskFactor[],
  runningScore: { value: number },
  input: { code: string; weight: number; reason: string },
) {
  if (input.weight === 0) return;
  runningScore.value += input.weight;
  factors.push({
    code: input.code,
    weight: input.weight,
    direction: input.weight > 0 ? 'UP' : 'DOWN',
    reason: input.reason,
  });
}

function buildCreditRiskFromSources(input: {
  occurredAt: string;
  detail: CobranzaCaseDetail;
  history: CobranzaRiskOperationalHistory;
}): CobranzaRiskSnapshot {
  const { detail, history, occurredAt } = input;
  const clientLabel = `${detail.credito.cliente.code} · ${detail.credito.cliente.fullName}`;
  const creditLabel = `${detail.credito.folio} · ${detail.credito.loanNumber}`;
  const diasAtraso = (() => {
    const oldestPendingDate = resolveOldestPendingDate(detail);
    return oldestPendingDate ? diffDays(occurredAt, oldestPendingDate) : 0;
  })();
  const montoAccionable = Number(detail.actionable.totalAmount.toFixed(2));
  const totalFallas = countTotalFallas(detail);
  const fallasPendientes = detail.pendingFailures.length;
  const recoveryPendiente = Number(detail.actionable.recoveryAmount.toFixed(2));
  const semana13Pendiente = Number(detail.actionable.extraWeekAmount.toFixed(2));
  const multasPendientes = Number(
    detail.credito.penalties
      .filter((penalty) => penalty.penaltyStatus.code === 'PENDING')
      .reduce((sum, penalty) => sum + Number(penalty.amount), 0)
      .toFixed(2),
  );

  const promesasPendientes = history.promesas.filter((item) => item.estado === 'PENDING').length;
  const promesasPendientesVencidas = history.promesas.filter(
    (item) =>
      item.estado === 'PENDING' &&
      normalizeToIsoDate(toIsoDateInput(item.fechaPromesa)) !== null &&
      toIsoDateInput(item.fechaPromesa) < occurredAt,
  ).length;
  const promesasVigentes = history.promesas.filter(
    (item) => item.estado === 'PENDING' && toIsoDateInput(item.fechaPromesa) >= occurredAt,
  ).length;
  const promesasIncumplidas = history.promesas.filter((item) => item.estado === 'BROKEN').length;
  const visitasFallidas = history.visitas.filter((item) => {
    if (!VISITA_RESULTADOS_FALLIDOS.has(item.resultado)) return false;
    return diffDays(occurredAt, toIsoDateInput(item.fechaHora)) <= 90;
  }).length;

  const contactAttempts = history.interacciones.filter((item) =>
    INTERACCION_TIPOS_CONTACTO.has(item.tipo),
  );
  const successfulContacts = history.interacciones.filter((item) =>
    INTERACCION_RESULTADOS_EXITOSOS.has(item.resultado),
  );
  const tasaContactoEfectivo =
    contactAttempts.length > 0
      ? Number((successfulContacts.length / contactAttempts.length).toFixed(2))
      : null;

  const successfulVisit = history.visitas.find((item) => VISITA_RESULTADOS_EXITOSOS.has(item.resultado));
  const ultimoContactoExitosoAt = getMostRecentIso([
    successfulContacts[0]?.fechaHora ? toIsoDateTimeInput(successfulContacts[0].fechaHora) : null,
    successfulVisit?.fechaHora ? toIsoDateTimeInput(successfulVisit.fechaHora) : null,
  ]);
  const ultimaVisitaAt = history.visitas[0]?.fechaHora ? toIsoDateTimeInput(history.visitas[0].fechaHora) : null;
  const ultimoPagoRealAt = detail.lastPayment
    ? `${detail.lastPayment.receivedAt}T12:00:00.000Z`
    : null;
  const telefonoValidoInferido = evaluatePhoneValidity(history);
  const domicilioUbicadoInferido = evaluateAddressLocation(history);
  const intentosSinExitoRecientes = history.interacciones.filter((item) => {
    if (!INTERACCION_TIPOS_CONTACTO.has(item.tipo)) return false;
    if (INTERACCION_RESULTADOS_EXITOSOS.has(item.resultado)) return false;
    return diffDays(occurredAt, toIsoDateInput(item.fechaHora)) <= 14;
  }).length;

  const factors: RiskFactor[] = [];
  const runningScore = { value: 0 };

  if (diasAtraso >= 45) {
    addFactor(factors, runningScore, {
      code: 'SEVERE_DELAY',
      weight: 30,
      reason: `El crédito tiene ${diasAtraso} días de atraso sobre la obligación accionable más antigua.`,
    });
  } else if (diasAtraso >= 22) {
    addFactor(factors, runningScore, {
      code: 'PROLONGED_DELAY',
      weight: 22,
      reason: `El crédito acumula ${diasAtraso} días de atraso operativo.`,
    });
  } else if (diasAtraso >= 8) {
    addFactor(factors, runningScore, {
      code: 'SUSTAINED_DELAY',
      weight: 15,
      reason: `El crédito ya superó una semana con atraso (${diasAtraso} días).`,
    });
  } else if (diasAtraso >= 1) {
    addFactor(factors, runningScore, {
      code: 'EARLY_DELAY',
      weight: 8,
      reason: `Existe atraso operativo reciente de ${diasAtraso} días.`,
    });
  }

  if (fallasPendientes >= 3) {
    addFactor(factors, runningScore, {
      code: 'MULTIPLE_PENDING_FAILURES',
      weight: 24,
      reason: `El crédito mantiene ${fallasPendientes} fallas pendientes por recuperar.`,
    });
  } else if (fallasPendientes === 2) {
    addFactor(factors, runningScore, {
      code: 'DOUBLE_PENDING_FAILURES',
      weight: 16,
      reason: 'El crédito mantiene 2 fallas pendientes por recuperar.',
    });
  } else if (fallasPendientes === 1) {
    addFactor(factors, runningScore, {
      code: 'SINGLE_PENDING_FAILURE',
      weight: 8,
      reason: 'El crédito mantiene 1 falla pendiente por recuperar.',
    });
  }

  if (montoAccionable >= 1_000) {
    addFactor(factors, runningScore, {
      code: 'HIGH_ACTIONABLE_AMOUNT',
      weight: 16,
      reason: `El monto accionable vigente es ${montoAccionable.toFixed(2)}.`,
    });
  } else if (montoAccionable >= 500) {
    addFactor(factors, runningScore, {
      code: 'MEDIUM_ACTIONABLE_AMOUNT',
      weight: 10,
      reason: `El monto accionable vigente es ${montoAccionable.toFixed(2)}.`,
    });
  } else if (montoAccionable > 0) {
    addFactor(factors, runningScore, {
      code: 'LOW_ACTIONABLE_AMOUNT',
      weight: 5,
      reason: `Existe saldo accionable vigente por ${montoAccionable.toFixed(2)}.`,
    });
  }

  if (recoveryPendiente > 0) {
    addFactor(factors, runningScore, {
      code: 'RECOVERY_PENDING',
      weight: 10,
      reason: `Hay ${recoveryPendiente.toFixed(2)} pendientes de recuperación sobre fallas históricas.`,
    });
  }

  if (semana13Pendiente > 0) {
    addFactor(factors, runningScore, {
      code: 'EXTRA_WEEK_PENDING',
      weight: 6,
      reason: `La semana 13 mantiene ${semana13Pendiente.toFixed(2)} pendientes.`,
    });
  }

  if (multasPendientes >= 300) {
    addFactor(factors, runningScore, {
      code: 'HIGH_PENDING_PENALTIES',
      weight: 8,
      reason: `El crédito acumula ${multasPendientes.toFixed(2)} en multas pendientes.`,
    });
  } else if (multasPendientes > 0) {
    addFactor(factors, runningScore, {
      code: 'PENDING_PENALTIES',
      weight: 4,
      reason: `El crédito mantiene multas pendientes por ${multasPendientes.toFixed(2)}.`,
    });
  }

  if (promesasPendientesVencidas >= 2) {
    addFactor(factors, runningScore, {
      code: 'MULTIPLE_OVERDUE_PROMISES',
      weight: 18,
      reason: `Existen ${promesasPendientesVencidas} promesas pendientes ya vencidas.`,
    });
  } else if (promesasPendientesVencidas === 1) {
    addFactor(factors, runningScore, {
      code: 'OVERDUE_PROMISE',
      weight: 10,
      reason: 'Existe 1 promesa pendiente ya vencida.',
    });
  }

  if (promesasIncumplidas >= 2) {
    addFactor(factors, runningScore, {
      code: 'MULTIPLE_BROKEN_PROMISES',
      weight: 16,
      reason: `El historial registra ${promesasIncumplidas} promesas incumplidas.`,
    });
  } else if (promesasIncumplidas === 1) {
    addFactor(factors, runningScore, {
      code: 'BROKEN_PROMISE',
      weight: 10,
      reason: 'El historial registra 1 promesa incumplida.',
    });
  }

  if (visitasFallidas >= 2) {
    addFactor(factors, runningScore, {
      code: 'MULTIPLE_FAILED_VISITS',
      weight: 12,
      reason: `Se registraron ${visitasFallidas} visitas fallidas en los últimos 90 días.`,
    });
  } else if (visitasFallidas === 1) {
    addFactor(factors, runningScore, {
      code: 'FAILED_VISIT',
      weight: 7,
      reason: 'Se registró 1 visita fallida en los últimos 90 días.',
    });
  }

  if (intentosSinExitoRecientes >= 3) {
    addFactor(factors, runningScore, {
      code: 'MULTIPLE_UNSUCCESSFUL_CONTACT_ATTEMPTS',
      weight: 8,
      reason: `Existen ${intentosSinExitoRecientes} intentos recientes sin contacto efectivo.`,
    });
  }

  if (telefonoValidoInferido === false) {
    addFactor(factors, runningScore, {
      code: 'PHONE_CONTACT_INVALID',
      weight: 12,
      reason: 'La evidencia operativa más reciente sugiere teléfono inválido o incorrecto.',
    });
  }

  if (domicilioUbicadoInferido === false) {
    addFactor(factors, runningScore, {
      code: 'ADDRESS_NOT_LOCATED',
      weight: 12,
      reason: 'La evidencia operativa más reciente sugiere domicilio no localizado.',
    });
  }

  if (ultimoContactoExitosoAt) {
    const diasSinContactoExitoso = diffDays(occurredAt, ultimoContactoExitosoAt.slice(0, 10));
    if (diasSinContactoExitoso > 30) {
      addFactor(factors, runningScore, {
        code: 'STALE_SUCCESSFUL_CONTACT',
        weight: 12,
        reason: `No hay contacto exitoso desde hace ${diasSinContactoExitoso} días.`,
      });
    } else if (diasSinContactoExitoso > 14) {
      addFactor(factors, runningScore, {
        code: 'AGING_SUCCESSFUL_CONTACT',
        weight: 8,
        reason: `No hay contacto exitoso en los últimos ${diasSinContactoExitoso} días.`,
      });
    }
  } else if (contactAttempts.length > 0) {
    addFactor(factors, runningScore, {
      code: 'NO_SUCCESSFUL_CONTACT',
      weight: 12,
      reason: 'No existe contacto exitoso registrado para este contexto de cobranza.',
    });
  }

  if (ultimoPagoRealAt) {
    const diasDesdeUltimoPago = diffDays(occurredAt, ultimoPagoRealAt.slice(0, 10));
    if (diasDesdeUltimoPago <= 7) {
      addFactor(factors, runningScore, {
        code: 'RECENT_PAYMENT',
        weight: -12,
        reason: `Existe pago real registrado en los últimos ${diasDesdeUltimoPago} días.`,
      });
    } else if (diasDesdeUltimoPago <= 30) {
      addFactor(factors, runningScore, {
        code: 'RECENT_PAYMENT_WINDOW',
        weight: -8,
        reason: `Existe pago real registrado en los últimos ${diasDesdeUltimoPago} días.`,
      });
    }
  }

  if (ultimoContactoExitosoAt) {
    const diasDesdeContactoExitoso = diffDays(occurredAt, ultimoContactoExitosoAt.slice(0, 10));
    if (diasDesdeContactoExitoso <= 3) {
      addFactor(factors, runningScore, {
        code: 'RECENT_SUCCESSFUL_CONTACT',
        weight: -10,
        reason: 'Se registró contacto exitoso en los últimos 3 días.',
      });
    } else if (diasDesdeContactoExitoso <= 7) {
      addFactor(factors, runningScore, {
        code: 'SUCCESSFUL_CONTACT_THIS_WEEK',
        weight: -6,
        reason: 'Se registró contacto exitoso en los últimos 7 días.',
      });
    }
  }

  if (successfulVisit) {
    const diasDesdeVisitaExitosa = diffDays(
      occurredAt,
      toIsoDateInput(successfulVisit.fechaHora),
    );
    if (diasDesdeVisitaExitosa <= 7) {
      addFactor(factors, runningScore, {
        code: 'RECENT_SUCCESSFUL_VISIT',
        weight: -8,
        reason: 'Se registró visita exitosa en la última semana.',
      });
    }
  }

  if (promesasVigentes > 0) {
    addFactor(factors, runningScore, {
      code: 'ACTIVE_PAYMENT_PROMISE',
      weight: -6,
      reason: `Existe ${promesasVigentes} promesa${promesasVigentes > 1 ? 's' : ''} vigente${promesasVigentes > 1 ? 's' : ''} aún no vencida${promesasVigentes > 1 ? 's' : ''}.`,
    });
  }

  const scoreTotal = clampScore(runningScore.value);
  const calculadoAt = toIsoDateTime(new Date());

  return {
    scope: 'CREDIT',
    strategy: 'ON_DEMAND_RULES_V1',
    clienteId: detail.credito.cliente.id,
    creditoId: detail.credito.id,
    clientLabel,
    creditLabel,
    scoreTotal,
    nivelRiesgo: getRiskLevel(scoreTotal),
    diasAtraso,
    montoAccionable,
    totalFallas,
    fallasPendientes,
    promesasPendientes,
    promesasPendientesVencidas,
    promesasIncumplidas,
    visitasFallidas,
    tasaContactoEfectivo,
    ultimoContactoExitosoAt,
    ultimaVisitaAt,
    ultimoPagoRealAt,
    telefonoValidoInferido,
    domicilioUbicadoInferido,
    recoveryPendiente,
    semana13Pendiente,
    multasPendientes,
    factores: factors,
    calculadoAt,
    occurredAt,
    contexto: buildRiskContext(detail),
  };
}

export async function calculateCobranzaRiskForResolvedCase(input: {
  detail: CobranzaCaseDetail;
  occurredAt?: string;
  history?: CobranzaRiskOperationalHistory;
}): Promise<CobranzaRiskSnapshot> {
  const occurredAt = getDefaultOccurredAt(input.occurredAt ?? input.detail.occurredAt);
  const history =
    input.history ??
    (await getCreditOperationalHistory({
      clienteId: input.detail.credito.cliente.id,
      creditoId: input.detail.credito.id,
    }));

  return buildCreditRiskFromSources({
    occurredAt,
    detail: input.detail,
    history: {
      interacciones: [...history.interacciones].sort((left, right) =>
        compareDateInputsDesc(left.fechaHora, right.fechaHora),
      ),
      promesas: [...history.promesas].sort((left, right) =>
        compareDateInputsDesc(left.fechaPromesa, right.fechaPromesa),
      ),
      visitas: [...history.visitas].sort((left, right) =>
        compareDateInputsDesc(left.fechaHora, right.fechaHora),
      ),
    },
  });
}

export async function calculateCobranzaRiskForCredito(input: {
  creditoId: string;
  occurredAt?: string;
}): Promise<CobranzaRiskSnapshot> {
  const occurredAt = getDefaultOccurredAt(input.occurredAt);
  const detail = await getCobranzaCaseDetail({
    creditoId: input.creditoId,
    occurredAt,
  });

  if (!detail) {
    throw new AppError('Crédito no encontrado para cálculo de riesgo.', 'CREDITO_NOT_FOUND', 404);
  }

  return calculateCobranzaRiskForResolvedCase({
    detail,
    occurredAt,
  });
}

export async function calculateCobranzaRiskForCliente(input: {
  clienteId: string;
  occurredAt?: string;
}): Promise<CobranzaClientRiskSummary> {
  const occurredAt = getDefaultOccurredAt(input.occurredAt);
  const cliente = await findOperationalClienteById(input.clienteId);
  if (!cliente) {
    throw new AppError('Cliente no encontrado para cálculo de riesgo.', 'CLIENTE_NOT_FOUND', 404);
  }

  const credits = await listClientCreditsForRisk(input.clienteId);
  if (!credits.length) {
    throw new AppError('El cliente no tiene créditos elegibles para evaluación de riesgo.', 'CLIENT_NO_CREDITS', 404);
  }

  const riskSnapshots = await Promise.all(
    credits.map((credit) =>
      calculateCobranzaRiskForCredito({
        creditoId: credit.id,
        occurredAt,
      }),
    ),
  );

  const sorted = [...riskSnapshots].sort((left, right) => {
    if (left.scoreTotal !== right.scoreTotal) {
      return right.scoreTotal - left.scoreTotal;
    }
    if (left.montoAccionable !== right.montoAccionable) {
      return right.montoAccionable - left.montoAccionable;
    }
    return right.creditLabel.localeCompare(left.creditLabel);
  });
  const primary = sorted[0] ?? null;
  if (!primary) {
    throw new AppError('No fue posible calcular riesgo para los créditos del cliente.', 'RISK_CALCULATION_EMPTY', 500);
  }

  return {
    scope: 'CLIENT',
    strategy: 'MAX_CREDIT_SCORE_ON_DEMAND_RULES_V1',
    clienteId: cliente.id,
    clientLabel: `${cliente.code} · ${cliente.fullName}`,
    scoreTotal: primary.scoreTotal,
    nivelRiesgo: primary.nivelRiesgo,
    diasAtraso: primary.diasAtraso,
    montoAccionable: primary.montoAccionable,
    totalFallas: primary.totalFallas,
    fallasPendientes: primary.fallasPendientes,
    promesasPendientes: primary.promesasPendientes,
    promesasPendientesVencidas: primary.promesasPendientesVencidas,
    promesasIncumplidas: primary.promesasIncumplidas,
    visitasFallidas: primary.visitasFallidas,
    tasaContactoEfectivo: primary.tasaContactoEfectivo,
    ultimoContactoExitosoAt: primary.ultimoContactoExitosoAt,
    ultimaVisitaAt: primary.ultimaVisitaAt,
    ultimoPagoRealAt: primary.ultimoPagoRealAt,
    telefonoValidoInferido: primary.telefonoValidoInferido,
    domicilioUbicadoInferido: primary.domicilioUbicadoInferido,
    recoveryPendiente: primary.recoveryPendiente,
    semana13Pendiente: primary.semana13Pendiente,
    multasPendientes: primary.multasPendientes,
    factores: primary.factores,
    calculadoAt: toIsoDateTime(new Date()),
    occurredAt,
    aggregation: {
      strategy: 'MAX_CREDIT_SCORE',
      creditCount: riskSnapshots.length,
      actionableCreditCount: riskSnapshots.filter((item) => item.montoAccionable > 0).length,
    },
    primaryCredit: {
      creditoId: primary.creditoId,
      creditLabel: primary.creditLabel,
      scoreTotal: primary.scoreTotal,
      nivelRiesgo: primary.nivelRiesgo,
      montoAccionable: primary.montoAccionable,
      diasAtraso: primary.diasAtraso,
    },
    creditSummaries: sorted.map((item) => ({
      creditoId: item.creditoId,
      creditLabel: item.creditLabel,
      scoreTotal: item.scoreTotal,
      nivelRiesgo: item.nivelRiesgo,
      montoAccionable: item.montoAccionable,
      diasAtraso: item.diasAtraso,
    })),
  };
}

export function summarizeCobranzaRiskFactors(factores: RiskFactor[], limit = 5) {
  return getTopFactors(factores, limit);
}
