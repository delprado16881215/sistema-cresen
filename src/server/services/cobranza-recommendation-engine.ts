import { AppError } from '@/lib/errors';
import { getLegalCreditStatusLabel } from '@/lib/legal-status';
import type { CobranzaExpedienteCortoBase } from '@/server/services/cobranza-expediente-service';

export type CobranzaRecommendationActionCode =
  | 'CALL_NOW'
  | 'SEND_WHATSAPP'
  | 'REGISTER_PROMISE'
  | 'FOLLOW_UP_PROMISE'
  | 'PROGRAM_FIELD_VISIT'
  | 'VERIFY_ADDRESS'
  | 'VERIFY_PHONE'
  | 'CONTACT_GUARANTOR'
  | 'ESCALATE_TO_SUPERVISOR'
  | 'PREPARE_OPERATIVE_CLOSURE'
  | 'LEGAL_PROCESS'
  | 'MAINTAIN_MONITORING'
  | 'NO_IMMEDIATE_ACTION';

export type CobranzaRecommendationPriorityCode = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type CobranzaRecommendationConfidenceCode = 'LOW' | 'MEDIUM' | 'HIGH';

export type CobranzaRecommendationReason = {
  code: string;
  reason: string;
};

type RecommendationAction = {
  code: CobranzaRecommendationActionCode;
  label: string;
};

type RecommendationPriority = {
  code: CobranzaRecommendationPriorityCode;
  label: string;
};

type RecommendationConfidence = {
  code: CobranzaRecommendationConfidenceCode;
  label: string;
};

export type CobranzaRecommendation = {
  strategy: 'RULES_V1';
  primaryAction: RecommendationAction;
  secondaryActions: RecommendationAction[];
  priority: RecommendationPriority;
  confidence: RecommendationConfidence;
  reasons: CobranzaRecommendationReason[];
  summary: string;
};

const ACTION_LABELS: Record<CobranzaRecommendationActionCode, string> = {
  CALL_NOW: 'Llamar ahora',
  SEND_WHATSAPP: 'Enviar WhatsApp',
  REGISTER_PROMISE: 'Registrar promesa de pago',
  FOLLOW_UP_PROMISE: 'Dar seguimiento a promesa',
  PROGRAM_FIELD_VISIT: 'Programar visita de campo',
  VERIFY_ADDRESS: 'Verificar domicilio',
  VERIFY_PHONE: 'Verificar teléfono',
  CONTACT_GUARANTOR: 'Contactar aval',
  ESCALATE_TO_SUPERVISOR: 'Escalar a supervisión',
  PREPARE_OPERATIVE_CLOSURE: 'Preparar cierre operativo',
  LEGAL_PROCESS: 'Proceso jurídico activo',
  MAINTAIN_MONITORING: 'Mantener seguimiento',
  NO_IMMEDIATE_ACTION: 'Sin acción inmediata',
};

const PRIORITY_LABELS: Record<CobranzaRecommendationPriorityCode, string> = {
  LOW: 'Baja',
  MEDIUM: 'Media',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

const CONFIDENCE_LABELS: Record<CobranzaRecommendationConfidenceCode, string> = {
  LOW: 'Baja',
  MEDIUM: 'Media',
  HIGH: 'Alta',
};

function action(code: CobranzaRecommendationActionCode): RecommendationAction {
  return {
    code,
    label: ACTION_LABELS[code],
  };
}

function priority(code: CobranzaRecommendationPriorityCode): RecommendationPriority {
  return {
    code,
    label: PRIORITY_LABELS[code],
  };
}

function confidence(code: CobranzaRecommendationConfidenceCode): RecommendationConfidence {
  return {
    code,
    label: CONFIDENCE_LABELS[code],
  };
}

function hasRiskFactor(expediente: CobranzaExpedienteCortoBase, code: string) {
  return expediente.risk.factores.some((factor) => factor.code === code);
}

function addReason(
  reasons: CobranzaRecommendationReason[],
  input: CobranzaRecommendationReason | null | undefined,
) {
  if (!input) return;
  if (reasons.some((reason) => reason.code === input.code)) return;
  reasons.push(input);
}

function addSecondaryAction(
  target: RecommendationAction[],
  code: CobranzaRecommendationActionCode,
  primaryActionCode: CobranzaRecommendationActionCode,
) {
  if (code === primaryActionCode) return;
  if (target.some((item) => item.code === code)) return;
  if (target.length >= 3) return;
  target.push(action(code));
}

function createSummary(input: {
  action: CobranzaRecommendationActionCode;
  reasons: CobranzaRecommendationReason[];
}) {
  const normalizeReasonFragment = (value: string) => {
    const trimmed = value.trim().replace(/[.]+$/g, '');
    if (!trimmed) return 'la situación operativa vigente del caso';
    return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
  };

  const firstReason = normalizeReasonFragment(
    input.reasons[0]?.reason ?? 'la situación operativa vigente del caso',
  );

  if (input.action === 'PREPARE_OPERATIVE_CLOSURE') {
    return `Se sugiere preparar cierre operativo porque el caso ya está fuera de ciclo y presenta deterioro relevante: ${firstReason}.`;
  }
  if (input.action === 'LEGAL_PROCESS') {
    return `El crédito ya fue derivado a jurídico y debe mantenerse fuera de la cobranza operativa normal: ${firstReason}.`;
  }
  if (input.action === 'ESCALATE_TO_SUPERVISOR') {
    return `Se sugiere escalar a supervisión porque el caso muestra señales repetidas de incumplimiento: ${firstReason}.`;
  }
  if (input.action === 'FOLLOW_UP_PROMISE') {
    return `Se sugiere dar seguimiento a la promesa porque hay un compromiso de pago activo que requiere confirmación: ${firstReason}.`;
  }
  if (input.action === 'PROGRAM_FIELD_VISIT') {
    return `Se sugiere visita de campo porque el caso mantiene baja contactabilidad remota: ${firstReason}.`;
  }
  if (input.action === 'VERIFY_PHONE') {
    return `Se sugiere verificar el teléfono antes de insistir por contacto remoto: ${firstReason}.`;
  }
  if (input.action === 'VERIFY_ADDRESS') {
    return `Se sugiere verificar el domicilio porque la evidencia operativa actual no confirma la localización del caso: ${firstReason}.`;
  }
  if (input.action === 'SEND_WHATSAPP') {
    return `Se sugiere intentar por WhatsApp para mantener seguimiento táctico del caso: ${firstReason}.`;
  }
  if (input.action === 'CALL_NOW') {
    return `Se sugiere llamar ahora porque el caso sigue accionable y todavía hay margen de contacto remoto: ${firstReason}.`;
  }
  if (input.action === 'REGISTER_PROMISE') {
    return `Se sugiere formalizar una promesa de pago porque ya existe contacto reciente y el saldo sigue abierto: ${firstReason}.`;
  }
  if (input.action === 'MAINTAIN_MONITORING') {
    return `Se sugiere mantener seguimiento porque el caso no muestra una urgencia táctica mayor en este momento: ${firstReason}.`;
  }
  return `No se sugiere una acción inmediata porque ${firstReason}.`;
}

export function recommendCobranzaActionsForExpediente(
  expediente: CobranzaExpedienteCortoBase,
): CobranzaRecommendation {
  const reasons: CobranzaRecommendationReason[] = [];
  const secondaryActions: RecommendationAction[] = [];

  const hasActionableBalance = expediente.actionable.totalAmount > 0.001;
  const hasAval = Boolean(expediente.customer.avalLabel);
  const isCritical = expediente.risk.nivelRiesgo === 'CRITICAL';
  const isHighOrCritical =
    expediente.risk.nivelRiesgo === 'HIGH' || expediente.risk.nivelRiesgo === 'CRITICAL';
  const isClosureCase = expediente.header.caseCode === 'CIERRE_OPERATIVO';
  const hasPendingRecovery = expediente.actionable.recoveryAmount > 0.001;
  const hasPendingExtraWeek = expediente.actionable.extraWeekAmount > 0.001;
  const phoneInvalid = expediente.contactability.phoneStatus === 'INVALID';
  const addressNotLocated = expediente.contactability.addressStatus === 'NOT_LOCATED';
  const noRecentSuccessfulContact = !expediente.contactability.hasRecentSuccessfulContact;
  const multipleFailedContactAttempts =
    expediente.contactability.unsuccessfulContactAttemptsRecentCount >= 3 ||
    hasRiskFactor(expediente, 'MULTIPLE_UNSUCCESSFUL_CONTACT_ATTEMPTS');
  const failedPhoneAttempts = expediente.contactability.failedPhoneAttemptsRecentCount;
  const hasPhoneChannel = Boolean(expediente.customer.phone || expediente.customer.secondaryPhone);
  const hasOverduePromise =
    expediente.promises.pendingOverdueCount > 0 || expediente.promises.nextPending?.isOverdue === true;
  const hasUpcomingPromise =
    expediente.promises.nextPending != null &&
    !expediente.promises.nextPending.isOverdue &&
    expediente.promises.nextPending.daysUntilDue <= 1;
  const repeatedBrokenPromises = expediente.promises.brokenCount >= 2;
  const hasAnyBrokenPromise = expediente.promises.brokenCount >= 1;

  let primaryActionCode: CobranzaRecommendationActionCode = 'NO_IMMEDIATE_ACTION';
  let priorityCode: CobranzaRecommendationPriorityCode = 'LOW';
  let confidenceCode: CobranzaRecommendationConfidenceCode = 'LOW';

  if (expediente.legal.isInLegalProcess) {
    addReason(reasons, {
      code: 'LEGAL_PROCESS_ACTIVE',
      reason: `El crédito está en ${getLegalCreditStatusLabel(expediente.legal.status).toLowerCase()} y quedó fuera de la cobranza operativa normal.`,
    });
    addReason(
      reasons,
      expediente.legal.reason
        ? {
            code: 'LEGAL_PROCESS_REASON',
            reason: expediente.legal.reason,
          }
        : null,
    );
    primaryActionCode = 'LEGAL_PROCESS';
    priorityCode = 'LOW';
    confidenceCode = 'HIGH';
  } else if (!hasActionableBalance) {
    addReason(reasons, {
      code: 'NO_ACTIONABLE_BALANCE',
      reason: 'El caso no tiene saldo accionable real al corte operativo.',
    });
    primaryActionCode = 'NO_IMMEDIATE_ACTION';
    priorityCode = 'LOW';
    confidenceCode = 'HIGH';
  } else if (isClosureCase && isCritical && (hasPendingRecovery || hasPendingExtraWeek)) {
    addReason(reasons, {
      code: 'CRITICAL_CLOSURE_CASE',
      reason: 'El caso está en cierre operativo con riesgo CRITICAL.',
    });
    addReason(
      reasons,
      hasPendingRecovery
        ? {
            code: 'RECOVERY_BALANCE_PENDING',
            reason: 'El saldo pendiente principal proviene de recoveries por recuperar.',
          }
        : null,
    );
    addReason(
      reasons,
      hasPendingExtraWeek
        ? {
            code: 'EXTRA_WEEK_BALANCE_PENDING',
            reason: 'La semana 13 sigue pendiente dentro del cierre operativo.',
          }
        : null,
    );
    primaryActionCode = 'PREPARE_OPERATIVE_CLOSURE';
    priorityCode = 'URGENT';
    confidenceCode = 'HIGH';
  } else if (repeatedBrokenPromises && isHighOrCritical) {
    addReason(reasons, {
      code: 'REPEATED_BROKEN_PROMISES',
      reason: `El caso acumula ${expediente.promises.brokenCount} promesas incumplidas.`,
    });
    addReason(reasons, {
      code: 'HIGH_RISK_CASE',
      reason: `El score actual del caso es ${expediente.risk.nivelRiesgo}.`,
    });
    primaryActionCode = 'ESCALATE_TO_SUPERVISOR';
    priorityCode = isCritical ? 'URGENT' : 'HIGH';
    confidenceCode = 'HIGH';
  } else if (hasOverduePromise || hasUpcomingPromise) {
    addReason(
      reasons,
      hasOverduePromise
        ? {
            code: 'OVERDUE_PENDING_PROMISE',
            reason: 'Existe una promesa pendiente ya vencida que requiere seguimiento.',
          }
        : {
            code: 'PROMISE_DUE_SOON',
            reason: 'Existe una promesa pendiente próxima a vencerse en el corto plazo.',
          },
    );
    addReason(reasons, {
      code: 'PENDING_PROMISE_EXISTS',
      reason: `Hay ${expediente.promises.pendingCount} promesa${expediente.promises.pendingCount > 1 ? 's' : ''} pendiente${expediente.promises.pendingCount > 1 ? 's' : ''}.`,
    });
    primaryActionCode = 'FOLLOW_UP_PROMISE';
    priorityCode = hasOverduePromise ? 'HIGH' : 'MEDIUM';
    confidenceCode = 'HIGH';
  } else if (phoneInvalid) {
    addReason(reasons, {
      code: 'PHONE_INVALID',
      reason: 'La evidencia operativa actual sugiere teléfono inválido o incorrecto.',
    });
    addReason(
      reasons,
      noRecentSuccessfulContact
        ? {
            code: 'NO_RECENT_SUCCESSFUL_CONTACT',
            reason: 'No hay contacto exitoso reciente registrado.',
          }
        : null,
    );
    primaryActionCode = 'VERIFY_PHONE';
    priorityCode = isHighOrCritical ? 'HIGH' : 'MEDIUM';
    confidenceCode = 'HIGH';
  } else if (addressNotLocated) {
    addReason(reasons, {
      code: 'ADDRESS_NOT_LOCATED',
      reason: 'La evidencia operativa actual sugiere domicilio no ubicado.',
    });
    addReason(
      reasons,
      expediente.visits.failedRecentCount > 0
        ? {
            code: 'FAILED_FIELD_VISITS',
            reason: `Se registran ${expediente.visits.failedRecentCount} visitas fallidas recientes.`,
          }
        : null,
    );
    primaryActionCode = 'VERIFY_ADDRESS';
    priorityCode = isHighOrCritical ? 'HIGH' : 'MEDIUM';
    confidenceCode = 'HIGH';
  } else if (noRecentSuccessfulContact && multipleFailedContactAttempts) {
    addReason(reasons, {
      code: 'NO_RECENT_SUCCESSFUL_CONTACT',
      reason: 'No hay contacto exitoso reciente registrado.',
    });
    addReason(reasons, {
      code: 'MULTIPLE_FAILED_CONTACT_ATTEMPTS',
      reason: `Existen ${expediente.contactability.unsuccessfulContactAttemptsRecentCount} intentos recientes sin éxito.`,
    });
    addReason(reasons, {
      code: 'HIGH_RISK_CASE',
      reason: `El caso mantiene score ${expediente.risk.nivelRiesgo}.`,
    });
    primaryActionCode = 'PROGRAM_FIELD_VISIT';
    priorityCode = isHighOrCritical ? 'HIGH' : 'MEDIUM';
    confidenceCode = 'MEDIUM';
  } else if (noRecentSuccessfulContact && hasPhoneChannel && failedPhoneAttempts >= 1) {
    addReason(reasons, {
      code: 'FAILED_PHONE_ATTEMPTS',
      reason: `Se registran ${failedPhoneAttempts} intentos telefónicos recientes sin éxito.`,
    });
    addReason(reasons, {
      code: 'PHONE_STILL_AVAILABLE',
      reason: 'El caso todavía tiene un teléfono disponible para contacto remoto.',
    });
    primaryActionCode = 'SEND_WHATSAPP';
    priorityCode = isHighOrCritical ? 'HIGH' : 'MEDIUM';
    confidenceCode = 'MEDIUM';
  } else if (noRecentSuccessfulContact && hasPhoneChannel) {
    addReason(reasons, {
      code: 'NO_RECENT_SUCCESSFUL_CONTACT',
      reason: 'No hay contacto exitoso reciente registrado.',
    });
    addReason(reasons, {
      code: 'PHONE_AVAILABLE',
      reason: 'El expediente todavía tiene un teléfono disponible para contacto inmediato.',
    });
    primaryActionCode = 'CALL_NOW';
    priorityCode = isHighOrCritical ? 'HIGH' : 'MEDIUM';
    confidenceCode = 'MEDIUM';
  } else if (
    expediente.contactability.hasRecentSuccessfulContact &&
    expediente.promises.pendingCount === 0 &&
    hasActionableBalance
  ) {
    addReason(reasons, {
      code: 'RECENT_SUCCESSFUL_CONTACT',
      reason: 'Existe contacto exitoso reciente para este caso.',
    });
    addReason(reasons, {
      code: 'NO_ACTIVE_PROMISE',
      reason: 'No hay promesa activa registrada pese a que el saldo sigue accionable.',
    });
    primaryActionCode = 'REGISTER_PROMISE';
    priorityCode = isHighOrCritical ? 'HIGH' : 'MEDIUM';
    confidenceCode = 'MEDIUM';
  } else if (expediente.contactability.hasRecentSuccessfulContact || expediente.promises.pendingCount > 0) {
    addReason(reasons, {
      code: 'ACTIVE_FOLLOW_UP_STATE',
      reason: 'El caso ya tiene contacto reciente o un compromiso operativo vigente.',
    });
    addReason(
      reasons,
      expediente.promises.pendingCount > 0
        ? {
            code: 'PENDING_PROMISE_TRACKED',
            reason: 'Existe una promesa activa que todavía requiere monitoreo.',
          }
        : null,
    );
    primaryActionCode = 'MAINTAIN_MONITORING';
    priorityCode = isHighOrCritical ? 'MEDIUM' : 'LOW';
    confidenceCode = 'MEDIUM';
  } else {
    addReason(reasons, {
      code: 'INSUFFICIENT_OPERATIONAL_SIGNAL',
      reason: 'No hay una señal operativa dominante que justifique una acción distinta por ahora.',
    });
    primaryActionCode = hasActionableBalance ? 'MAINTAIN_MONITORING' : 'NO_IMMEDIATE_ACTION';
    priorityCode = hasActionableBalance ? 'MEDIUM' : 'LOW';
    confidenceCode = 'LOW';
  }

  if (expediente.legal.isInLegalProcess) {
    return {
      strategy: 'RULES_V1',
      primaryAction: action(primaryActionCode),
      secondaryActions: [],
      priority: priority(priorityCode),
      confidence: confidence(confidenceCode),
      reasons: reasons.slice(0, 4),
      summary: createSummary({
        action: primaryActionCode,
        reasons,
      }),
    };
  }

  if (hasAval && (isHighOrCritical || noRecentSuccessfulContact || hasAnyBrokenPromise)) {
    addSecondaryAction(secondaryActions, 'CONTACT_GUARANTOR', primaryActionCode);
  }
  if (isClosureCase && primaryActionCode !== 'PREPARE_OPERATIVE_CLOSURE' && isHighOrCritical) {
    addSecondaryAction(secondaryActions, 'PREPARE_OPERATIVE_CLOSURE', primaryActionCode);
  }
  if (phoneInvalid) {
    addSecondaryAction(secondaryActions, 'VERIFY_PHONE', primaryActionCode);
  }
  if (addressNotLocated) {
    addSecondaryAction(secondaryActions, 'VERIFY_ADDRESS', primaryActionCode);
  }
  if ((hasOverduePromise || hasUpcomingPromise) && primaryActionCode !== 'FOLLOW_UP_PROMISE') {
    addSecondaryAction(secondaryActions, 'FOLLOW_UP_PROMISE', primaryActionCode);
  }
  if (hasPhoneChannel && primaryActionCode === 'CALL_NOW') {
    addSecondaryAction(secondaryActions, 'SEND_WHATSAPP', primaryActionCode);
  }
  if (
    expediente.contactability.hasRecentSuccessfulContact &&
    expediente.promises.pendingCount === 0 &&
    primaryActionCode !== 'REGISTER_PROMISE' &&
    hasActionableBalance
  ) {
    addSecondaryAction(secondaryActions, 'REGISTER_PROMISE', primaryActionCode);
  }
  if (repeatedBrokenPromises && primaryActionCode !== 'ESCALATE_TO_SUPERVISOR') {
    addSecondaryAction(secondaryActions, 'ESCALATE_TO_SUPERVISOR', primaryActionCode);
  }

  return {
    strategy: 'RULES_V1',
    primaryAction: action(primaryActionCode),
    secondaryActions,
    priority: priority(priorityCode),
    confidence: confidence(confidenceCode),
    reasons: reasons.slice(0, 4),
    summary: createSummary({
      action: primaryActionCode,
      reasons,
    }),
  };
}

export async function recommendCobranzaActionsForCredito(input: {
  creditoId: string;
  occurredAt?: string;
}): Promise<CobranzaRecommendation> {
  const { getCobranzaExpedienteCorto } = await import('@/server/services/cobranza-expediente-service');
  const expediente = await getCobranzaExpedienteCorto(input);

  if (!expediente) {
    throw new AppError('Crédito no encontrado para recomendación de cobranza.', 'CREDITO_NOT_FOUND', 404);
  }

  return recommendCobranzaActionsForExpediente(expediente);
}
