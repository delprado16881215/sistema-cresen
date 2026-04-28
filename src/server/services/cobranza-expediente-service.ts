import { normalizeToIsoDate, parseFlexibleDateInput } from '@/lib/date-input';
import type { ClientePlacementStatus, LegalCreditStatus } from '@prisma/client';
import {
  buildLegalEventSummary,
  getClientePlacementStatusLabel,
  getLegalCreditStatusLabel,
  isActiveLegalCreditStatus,
} from '@/lib/legal-status';
import {
  formatCobranzaDate,
  getCanalLabel,
  getInteraccionLabel,
  getPromesaEstadoLabel,
  getVisitaResultadoLabel,
} from '@/lib/cobranza-operativa-display';
import type {
  CobranzaInteraccionItem,
  CobranzaPromesaPagoItem,
  CobranzaVisitaCampoItem,
} from '@/server/services/cobranza-operativa-shared';
import {
  calculateCobranzaRiskForResolvedCase,
  type CobranzaRiskSnapshot,
} from '@/server/services/cobranza-risk-engine';
import {
  recommendCobranzaActionsForExpediente,
  type CobranzaRecommendation,
} from '@/server/services/cobranza-recommendation-engine';
import { resolveCobranzaGeoReference } from '@/server/services/cliente-geo-reference-service';
import { getCobranzaCaseDetail, type CobranzaCaseDetail } from '@/server/services/cobranza-service';
import { listInteracciones } from '@/server/services/interacciones-service';
import { listPromesasPago } from '@/server/services/promesas-pago-service';
import { listVisitasCampo } from '@/server/services/visitas-campo-service';

type TimelineKind = 'INTERACCION' | 'PROMESA_PAGO' | 'VISITA_CAMPO';

export type CobranzaExpedienteTimelineItem = {
  id: string;
  kind: TimelineKind;
  occurredAt: string;
  status: string;
  summary: string;
  note: string | null;
  userName: string | null;
};

export type CobranzaExpedienteCorto = {
  occurredAt: string;
  hasActionableRow: boolean;
  geo: {
    latitude: number | null;
    longitude: number | null;
    source: 'VISIT_GPS' | 'MANUAL' | 'GEOCODE' | 'NONE';
    isReliable: boolean;
    isApproximate: boolean;
    confidence: number;
    provider: string | null;
    placeId: string | null;
    normalizedAddressQuery: string | null;
    referenceId: string | null;
    resolvedFrom: 'PERSISTED_CREDITO' | 'PERSISTED_CLIENTE' | 'VISIT_FALLBACK' | 'NONE';
    resolvedFromVisitAt: string | null;
    updatedAt: string | null;
  };
  header: {
    clientName: string;
    clientCode: string;
    clientLabel: string;
    creditFolio: string;
    loanNumber: string;
    controlNumber: string | null;
    creditOpenedAt: string;
    creditStatusName: string;
    caseLabel: string;
    caseCode:
      | 'COBRANZA_REGULAR'
      | 'CIERRE_OPERATIVO'
      | 'SOLO_RECUPERADO'
      | 'SOLO_SEMANA_13'
      | 'SIN_SALDO_ACCIONABLE';
    technicalCycleLabel: string;
    collectionMode: 'preview' | 'historical';
    promotoriaName: string;
    supervisionName: string | null;
  };
  customer: {
    fullName: string;
    code: string;
    phone: string | null;
    secondaryPhone: string | null;
    address: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    betweenStreets: string | null;
    referencesNotes: string | null;
    observations: string | null;
    avalLabel: string | null;
  };
  actionable: {
    regularAmount: number;
    recoveryAmount: number;
    extraWeekAmount: number;
    penaltyAmount: number;
    totalAmount: number;
    penaltiesIncludedInTotal: false;
    pendingFailuresCount: number;
    pendingFailuresPreview: Array<{
      id: string;
      installmentNumber: number;
      dueDate: string;
      pendingAmount: number;
    }>;
    pendingFailuresOverflowCount: number;
    extraWeek: {
      dueDate: string;
      expectedAmount: number;
      paidAmount: number;
      pendingAmount: number;
      status: string;
    } | null;
    lastPayment: {
      receivedAt: string;
      amountReceived: number;
      statusName: string;
      notes: string | null;
      breakdown: Array<{ label: string; amount: number }>;
    } | null;
  };
  risk: CobranzaRiskSnapshot;
  promises: {
    pendingCount: number;
    pendingOverdueCount: number;
    brokenCount: number;
    nextPending: {
      fechaPromesa: string;
      montoPrometido: number | null;
      daysUntilDue: number;
      isOverdue: boolean;
    } | null;
    latestRegistered: CobranzaPromesaPagoItem | null;
    recentItems: CobranzaPromesaPagoItem[];
  };
  visits: {
    latestVisit: CobranzaVisitaCampoItem | null;
    failedRecentCount: number;
    recentItems: CobranzaVisitaCampoItem[];
  };
  contactability: {
    phoneStatus: 'VALID' | 'INVALID' | 'UNKNOWN';
    addressStatus: 'LOCATED' | 'NOT_LOCATED' | 'UNKNOWN';
    hasRecentSuccessfulContact: boolean;
    lastSuccessfulContactAt: string | null;
    unsuccessfulContactAttemptsRecentCount: number;
    failedPhoneAttemptsRecentCount: number;
    recentNotes: CobranzaInteraccionItem[];
  };
  timeline: {
    items: CobranzaExpedienteTimelineItem[];
  };
  links: {
    creditHref: string;
    clientHref: string;
    paymentHref: string;
    groupHref: string;
    saleSheetHref: string;
  };
  legal: {
    status: LegalCreditStatus;
    statusLabel: string;
    isInLegalProcess: boolean;
    sentToLegalAt: string | null;
    legalStatusChangedAt: string | null;
    reason: string | null;
    notes: string | null;
    latestEvent: {
      id: string;
      eventType: string;
      effectiveDate: string;
      motivo: string;
      observaciones: string | null;
      createdAt: string;
      createdByName: string;
      summary: string;
    } | null;
    events: Array<{
      id: string;
      eventType: string;
      effectiveDate: string;
      motivo: string;
      observaciones: string | null;
      createdAt: string;
      createdByName: string;
      summary: string;
    }>;
    customerPlacementStatus: ClientePlacementStatus;
    customerPlacementStatusLabel: string;
    customerPlacementBlockedAt: string | null;
    customerPlacementBlockReason: string | null;
    isCustomerPlacementBlocked: boolean;
    operationalHoldMessage: string | null;
  };
  operativaPanel: {
    cliente: {
      id: string;
      code: string;
      fullName: string;
      phone: string;
      secondaryPhone: string | null;
      address: string;
      neighborhood: string | null;
      city: string | null;
      state: string | null;
      betweenStreets: string | null;
      referencesNotes: string | null;
    };
    credito: {
      id: string;
      folio: string;
      loanNumber: string;
    };
    interacciones: CobranzaInteraccionItem[];
    promesasPago: CobranzaPromesaPagoItem[];
    visitasCampo: CobranzaVisitaCampoItem[];
  };
  recommendation: CobranzaRecommendation;
};

export type CobranzaExpedienteCortoBase = Omit<CobranzaExpedienteCorto, 'recommendation'>;

function getDefaultOccurredAt(value?: string) {
  return normalizeToIsoDate(value) ?? normalizeToIsoDate(new Date()) ?? new Date().toISOString().slice(0, 10);
}

function toDateAtNoon(value: string) {
  const parsed = parseFlexibleDateInput(value);
  if (!parsed) {
    throw new Error(`No se pudo interpretar la fecha ${value}`);
  }
  parsed.setHours(12, 0, 0, 0);
  return parsed;
}

function diffDays(fromIso: string, toIso: string) {
  const from = toDateAtNoon(fromIso);
  const to = toDateAtNoon(toIso);
  return Math.max(0, Math.floor((from.getTime() - to.getTime()) / 86_400_000));
}

function toCaseCode(label: CobranzaExpedienteCorto['header']['caseLabel']) {
  if (label === 'Cierre operativo') return 'CIERRE_OPERATIVO' as const;
  if (label === 'Solo recuperado') return 'SOLO_RECUPERADO' as const;
  if (label === 'Solo semana 13') return 'SOLO_SEMANA_13' as const;
  if (label === 'Cobranza regular') return 'COBRANZA_REGULAR' as const;
  return 'SIN_SALDO_ACCIONABLE' as const;
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

function sortByDateTimeDesc<T>(items: T[], getValue: (item: T) => string) {
  return [...items].sort((left, right) => getValue(right).localeCompare(getValue(left)));
}

function sortByDateAsc<T>(items: T[], getValue: (item: T) => string) {
  return [...items].sort((left, right) => getValue(left).localeCompare(getValue(right)));
}

function buildTimeline(input: {
  interacciones: CobranzaInteraccionItem[];
  promesasPago: CobranzaPromesaPagoItem[];
  visitasCampo: CobranzaVisitaCampoItem[];
}) {
  const items: CobranzaExpedienteTimelineItem[] = [
    ...input.interacciones.map((item) => ({
      id: item.id,
      kind: 'INTERACCION' as const,
      occurredAt: item.fechaHora,
      status: item.resultado,
      summary: buildInteraccionSummary(item),
      note: item.notas ?? null,
      userName: item.createdBy.name,
    })),
    ...input.promesasPago.map((item) => ({
      id: item.id,
      kind: 'PROMESA_PAGO' as const,
      occurredAt: item.createdAt,
      status: item.estado,
      summary: buildPromesaSummary(item),
      note: item.notas ?? null,
      userName: item.createdBy.name,
    })),
    ...input.visitasCampo.map((item) => ({
      id: item.id,
      kind: 'VISITA_CAMPO' as const,
      occurredAt: item.fechaHora,
      status: item.resultado,
      summary: buildVisitaSummary(item),
      note: item.notas ?? null,
      userName: item.createdBy.name,
    })),
  ];

  return sortByDateTimeDesc(items, (item) => item.occurredAt).slice(0, 8);
}

export async function buildCobranzaExpedienteCortoBase(input: {
  detail: CobranzaCaseDetail;
  occurredAt?: string;
  clienteInteracciones: CobranzaInteraccionItem[];
  clientePromesas: CobranzaPromesaPagoItem[];
  clienteVisitas: CobranzaVisitaCampoItem[];
}): Promise<CobranzaExpedienteCortoBase> {
  const occurredAt = getDefaultOccurredAt(input.occurredAt ?? input.detail.occurredAt);
  const { detail } = input;
  const clienteInteracciones = input.clienteInteracciones;
  const clientePromesas = input.clientePromesas;
  const clienteVisitas = input.clienteVisitas;
  const contextInteracciones = clienteInteracciones.filter(
    (item) => item.creditoId === detail.credito.id || item.creditoId == null,
  );
  const contextPromesas = clientePromesas.filter(
    (item) => item.creditoId === detail.credito.id || item.creditoId == null,
  );
  const contextVisitas = clienteVisitas.filter(
    (item) => item.creditoId === detail.credito.id || item.creditoId == null,
  );

  const risk = await calculateCobranzaRiskForResolvedCase({
    detail,
    occurredAt,
    history: {
      interacciones: contextInteracciones.map((item) => ({
        tipo: item.tipo,
        resultado: item.resultado,
        fechaHora: item.fechaHora,
        canal: item.canal,
        telefonoUsado: item.telefonoUsado,
      })),
      promesas: contextPromesas.map((item) => ({
        estado: item.estado,
        fechaPromesa: item.fechaPromesa,
      })),
      visitas: contextVisitas.map((item) => ({
        resultado: item.resultado,
        fechaHora: item.fechaHora,
      })),
    },
  });

  const penalties = Number(
    detail.credito.penalties
      .filter((penalty) => penalty.penaltyStatus.code === 'PENDING')
      .reduce((sum, penalty) => sum + Number(penalty.amount), 0)
      .toFixed(2),
  );

  const recentPromesas = sortByDateTimeDesc(contextPromesas, (item) => item.createdAt).slice(0, 4);
  const latestRegisteredPromise = recentPromesas[0] ?? null;
  const nextPendingPromise = sortByDateAsc(
    contextPromesas.filter((item) => item.estado === 'PENDING'),
    (item) => item.fechaPromesa,
  )[0] ?? null;
  const recentVisitas = sortByDateTimeDesc(contextVisitas, (item) => item.fechaHora).slice(0, 4);
  const latestVisit = recentVisitas[0] ?? null;
  const recentNotes = sortByDateTimeDesc(
    contextInteracciones.filter((item) => item.tipo === 'NOTE' && item.notas),
    (item) => item.fechaHora,
  ).slice(0, 3);
  const unsuccessfulContactAttemptsRecentCount = contextInteracciones.filter((item) => {
    if (item.tipo === 'NOTE') return false;
    if (item.resultado === 'CONTACTED' || item.resultado === 'PROMISE_REGISTERED' || item.resultado === 'PAID_REPORTED') {
      return false;
    }
    return diffDays(occurredAt, item.fechaHora.slice(0, 10)) <= 14;
  }).length;
  const failedPhoneAttemptsRecentCount = contextInteracciones.filter((item) => {
    if (!(item.tipo === 'CALL' || item.canal === 'PHONE')) return false;
    if (item.resultado === 'CONTACTED' || item.resultado === 'PROMISE_REGISTERED' || item.resultado === 'PAID_REPORTED') {
      return false;
    }
    return diffDays(occurredAt, item.fechaHora.slice(0, 10)) <= 14;
  }).length;

  const lastSuccessfulContactAt = risk.ultimoContactoExitosoAt;
  const hasRecentSuccessfulContact = lastSuccessfulContactAt
    ? diffDays(occurredAt, lastSuccessfulContactAt.slice(0, 10)) <= 7
    : false;
  const geo = await resolveCobranzaGeoReference({
    clienteId: detail.credito.cliente.id,
    creditoId: detail.credito.id,
    fallbackVisits: contextVisitas.map((item) => ({
      fechaHora: item.fechaHora,
      latitud: item.latitud,
      longitud: item.longitud,
    })),
  });
  const latestLegalEvent = detail.credito.legalEvents[0] ?? null;
  const isInLegalProcess = isActiveLegalCreditStatus(detail.credito.legalStatus);

  return {
    occurredAt,
    hasActionableRow: Boolean(detail.row),
    geo,
    header: {
      clientName: detail.credito.cliente.fullName,
      clientCode: detail.credito.cliente.code,
      clientLabel: `${detail.credito.cliente.code} · ${detail.credito.cliente.fullName}`,
      creditFolio: detail.credito.folio,
      loanNumber: detail.credito.loanNumber,
      controlNumber: detail.credito.controlNumber != null ? String(detail.credito.controlNumber) : null,
      creditOpenedAt: detail.credito.startDate.toISOString().slice(0, 10),
      creditStatusName: detail.credito.creditStatus.name,
      caseLabel: detail.caseLabel,
      caseCode: toCaseCode(detail.caseLabel),
      technicalCycleLabel: detail.technicalCycleLabel,
      collectionMode: detail.collectionMode,
      promotoriaName: detail.credito.promotoria.name,
      supervisionName: detail.credito.promotoria.supervision?.name ?? null,
    },
    customer: {
      fullName: detail.credito.cliente.fullName,
      code: detail.credito.cliente.code,
      phone: detail.credito.cliente.phone ?? null,
      secondaryPhone: detail.credito.cliente.secondaryPhone ?? null,
      address: detail.credito.cliente.address ?? null,
      neighborhood: detail.credito.cliente.neighborhood ?? null,
      city: detail.credito.cliente.city ?? null,
      state: detail.credito.cliente.state ?? null,
      betweenStreets: detail.credito.cliente.betweenStreets ?? null,
      referencesNotes: detail.credito.cliente.referencesNotes ?? null,
      observations: detail.credito.cliente.observations ?? null,
      avalLabel: detail.credito.aval
        ? `${detail.credito.aval.code} · ${detail.credito.aval.fullName}`
        : null,
    },
    actionable: {
      regularAmount: detail.actionable.regularAmount,
      recoveryAmount: detail.actionable.recoveryAmount,
      extraWeekAmount: detail.actionable.extraWeekAmount,
      penaltyAmount: penalties,
      totalAmount: detail.actionable.totalAmount,
      penaltiesIncludedInTotal: false as const,
      pendingFailuresCount: detail.pendingFailures.length,
      pendingFailuresPreview: detail.pendingFailures.slice(0, 4).map((item) => ({
        id: item.id,
        installmentNumber: item.installmentNumber,
        dueDate: item.dueDate,
        pendingAmount: item.pendingAmount,
      })),
      pendingFailuresOverflowCount: Math.max(0, detail.pendingFailures.length - 4),
      extraWeek: detail.extraWeek,
      lastPayment: detail.lastPayment
        ? {
            receivedAt: detail.lastPayment.receivedAt,
            amountReceived: detail.lastPayment.amountReceived,
            statusName: detail.lastPayment.statusName,
            notes: detail.lastPayment.notes,
            breakdown: detail.lastPayment.breakdown,
          }
        : null,
    },
    risk,
    promises: {
      pendingCount: risk.promesasPendientes,
      pendingOverdueCount: risk.promesasPendientesVencidas,
      brokenCount: risk.promesasIncumplidas,
      nextPending: nextPendingPromise
        ? (() => {
            const isOverdue = nextPendingPromise.fechaPromesa < occurredAt;
            return {
              fechaPromesa: nextPendingPromise.fechaPromesa,
              montoPrometido: nextPendingPromise.montoPrometido,
              daysUntilDue: isOverdue
                ? -diffDays(occurredAt, nextPendingPromise.fechaPromesa)
                : diffDays(nextPendingPromise.fechaPromesa, occurredAt),
              isOverdue,
            };
          })()
        : null,
      latestRegistered: latestRegisteredPromise,
      recentItems: recentPromesas,
    },
    visits: {
      latestVisit,
      failedRecentCount: risk.visitasFallidas,
      recentItems: recentVisitas,
    },
    contactability: {
      phoneStatus:
        risk.telefonoValidoInferido == null ? 'UNKNOWN' : risk.telefonoValidoInferido ? 'VALID' : 'INVALID',
      addressStatus:
        risk.domicilioUbicadoInferido == null
          ? 'UNKNOWN'
          : risk.domicilioUbicadoInferido
            ? 'LOCATED'
            : 'NOT_LOCATED',
      hasRecentSuccessfulContact,
      lastSuccessfulContactAt,
      unsuccessfulContactAttemptsRecentCount,
      failedPhoneAttemptsRecentCount,
      recentNotes,
    },
    timeline: {
      items: buildTimeline({
        interacciones: contextInteracciones,
        promesasPago: contextPromesas,
        visitasCampo: contextVisitas,
      }),
    },
    links: detail.links,
    legal: {
      status: detail.credito.legalStatus,
      statusLabel: getLegalCreditStatusLabel(detail.credito.legalStatus),
      isInLegalProcess,
      sentToLegalAt: detail.credito.sentToLegalAt?.toISOString().slice(0, 10) ?? null,
      legalStatusChangedAt: detail.credito.legalStatusChangedAt?.toISOString().slice(0, 10) ?? null,
      reason: detail.credito.legalStatusReason ?? null,
      notes: detail.credito.legalStatusNotes ?? null,
      latestEvent: latestLegalEvent
        ? {
            id: latestLegalEvent.id,
            eventType: latestLegalEvent.eventType,
            effectiveDate: latestLegalEvent.effectiveDate.toISOString().slice(0, 10),
            motivo: latestLegalEvent.motivo,
            observaciones: latestLegalEvent.observaciones ?? null,
            createdAt: latestLegalEvent.createdAt.toISOString(),
            createdByName: latestLegalEvent.createdByUser.name,
            summary: buildLegalEventSummary({
              eventType: latestLegalEvent.eventType,
              previousStatus: latestLegalEvent.previousStatus,
              nextStatus: latestLegalEvent.nextStatus,
              motivo: latestLegalEvent.motivo,
            }),
          }
        : null,
      events: detail.credito.legalEvents.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        effectiveDate: event.effectiveDate.toISOString().slice(0, 10),
        motivo: event.motivo,
        observaciones: event.observaciones ?? null,
        createdAt: event.createdAt.toISOString(),
        createdByName: event.createdByUser.name,
        summary: buildLegalEventSummary({
          eventType: event.eventType,
          previousStatus: event.previousStatus,
          nextStatus: event.nextStatus,
          motivo: event.motivo,
        }),
      })),
      customerPlacementStatus: detail.credito.cliente.placementStatus,
      customerPlacementStatusLabel: getClientePlacementStatusLabel(detail.credito.cliente.placementStatus),
      customerPlacementBlockedAt: detail.credito.cliente.placementBlockedAt?.toISOString().slice(0, 10) ?? null,
      customerPlacementBlockReason: detail.credito.cliente.placementBlockReason ?? null,
      isCustomerPlacementBlocked: detail.credito.cliente.placementStatus === 'BLOCKED_LEGAL',
      operationalHoldMessage: isInLegalProcess
        ? 'Este crédito quedó fuera de la cobranza operativa normal y del trabajo de campo por proceso jurídico.'
        : null,
    },
    operativaPanel: {
      cliente: {
        id: detail.credito.cliente.id,
        code: detail.credito.cliente.code,
        fullName: detail.credito.cliente.fullName,
        phone: detail.credito.cliente.phone,
        secondaryPhone: detail.credito.cliente.secondaryPhone ?? null,
        address: detail.credito.cliente.address,
        neighborhood: detail.credito.cliente.neighborhood ?? null,
        city: detail.credito.cliente.city ?? null,
        state: detail.credito.cliente.state ?? null,
        betweenStreets: detail.credito.cliente.betweenStreets ?? null,
        referencesNotes: detail.credito.cliente.referencesNotes ?? null,
      },
      credito: {
        id: detail.credito.id,
        folio: detail.credito.folio,
        loanNumber: detail.credito.loanNumber,
      },
      interacciones: contextInteracciones.filter((item) => item.creditoId === detail.credito.id),
      promesasPago: contextPromesas.filter((item) => item.creditoId === detail.credito.id),
      visitasCampo: contextVisitas.filter((item) => item.creditoId === detail.credito.id),
    },
  };
}

export async function getCobranzaExpedienteCorto(input: {
  creditoId: string;
  occurredAt?: string;
}): Promise<CobranzaExpedienteCorto | null> {
  const occurredAt = getDefaultOccurredAt(input.occurredAt);
  const detail = await getCobranzaCaseDetail({
    creditoId: input.creditoId,
    occurredAt,
  });

  if (!detail) {
    return null;
  }

  const clienteId = detail.credito.cliente.id;
  const [clienteInteracciones, clientePromesas, clienteVisitas] = await Promise.all([
    listInteracciones({ clienteId, limit: 24 }),
    listPromesasPago({ clienteId, limit: 24 }),
    listVisitasCampo({ clienteId, limit: 24 }),
  ]);

  const expedienteBase = await buildCobranzaExpedienteCortoBase({
    detail,
    occurredAt,
    clienteInteracciones,
    clientePromesas,
    clienteVisitas,
  });

  return {
    ...expedienteBase,
    recommendation: recommendCobranzaActionsForExpediente(expedienteBase),
  };
}
