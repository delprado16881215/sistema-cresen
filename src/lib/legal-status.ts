import type {
  ClientePlacementStatus,
  LegalCreditEventType,
  LegalCreditStatus,
} from '@prisma/client';

export const ACTIVE_LEGAL_CREDIT_STATUSES: LegalCreditStatus[] = [
  'PRELEGAL',
  'LEGAL_REVIEW',
  'IN_LAWSUIT',
  'LEGAL_CLOSED',
];

export const GROUP_PAYMENTS_EXCLUDED_LEGAL_CREDIT_STATUSES: LegalCreditStatus[] = [
  'IN_LAWSUIT',
  'LEGAL_CLOSED',
];

export const JURIDICO_ACTIVE_STATUSES: LegalCreditStatus[] = [
  'PRELEGAL',
  'LEGAL_REVIEW',
  'IN_LAWSUIT',
];

export const LEGAL_STATUS_TRANSITIONS: Record<LegalCreditStatus, LegalCreditStatus[]> = {
  NONE: ['PRELEGAL'],
  PRELEGAL: ['LEGAL_REVIEW'],
  LEGAL_REVIEW: ['IN_LAWSUIT', 'LEGAL_CLOSED'],
  IN_LAWSUIT: ['LEGAL_CLOSED'],
  LEGAL_CLOSED: [],
};

export function isActiveLegalCreditStatus(status: LegalCreditStatus) {
  return ACTIVE_LEGAL_CREDIT_STATUSES.includes(status);
}

export function isJuridicoWorkbenchStatus(status: LegalCreditStatus) {
  return JURIDICO_ACTIVE_STATUSES.includes(status);
}

export function getAllowedNextLegalStatuses(status: LegalCreditStatus) {
  return LEGAL_STATUS_TRANSITIONS[status];
}

export function canTransitionLegalStatus(
  currentStatus: LegalCreditStatus,
  nextStatus: LegalCreditStatus,
) {
  return getAllowedNextLegalStatuses(currentStatus).includes(nextStatus);
}

export function getLegalCreditStatusLabel(status: LegalCreditStatus) {
  if (status === 'PRELEGAL') return 'Prejurídico';
  if (status === 'LEGAL_REVIEW') return 'Revisión legal';
  if (status === 'IN_LAWSUIT') return 'En demanda';
  if (status === 'LEGAL_CLOSED') return 'Jurídico cerrado';
  return 'Sin jurídico';
}

export function getLegalStatusActionLabel(nextStatus: LegalCreditStatus) {
  if (nextStatus === 'LEGAL_REVIEW') return 'Pasar a revisión legal';
  if (nextStatus === 'IN_LAWSUIT') return 'Enviar a demanda';
  if (nextStatus === 'LEGAL_CLOSED') return 'Cerrar jurídico';
  if (nextStatus === 'PRELEGAL') return 'Enviar a jurídico';
  return 'Actualizar estado jurídico';
}

export function getLegalEventTypeLabel(eventType: LegalCreditEventType) {
  if (eventType === 'SEND_TO_LEGAL') return 'Envío a jurídico';
  if (eventType === 'CHANGE_LEGAL_STATUS') return 'Cambio de estado';
  return 'Nota jurídica';
}

export function buildLegalEventSummary(input: {
  eventType: LegalCreditEventType;
  previousStatus: LegalCreditStatus;
  nextStatus: LegalCreditStatus;
  motivo: string;
}) {
  if (input.eventType === 'SEND_TO_LEGAL') {
    return `Enviado a jurídico · ${input.motivo}`;
  }

  if (input.eventType === 'LEGAL_NOTE') {
    return `Nota jurídica · ${input.motivo}`;
  }

  return `${getLegalCreditStatusLabel(input.previousStatus)} -> ${getLegalCreditStatusLabel(input.nextStatus)} · ${input.motivo}`;
}

export function isClientePlacementBlocked(status: ClientePlacementStatus) {
  return status === 'BLOCKED_LEGAL';
}

export function getClientePlacementStatusLabel(status: ClientePlacementStatus) {
  return status === 'BLOCKED_LEGAL' ? 'Bloqueado por jurídico' : 'Colocable';
}

export function getClientePlacementBlockMessage(status: ClientePlacementStatus) {
  return status === 'BLOCKED_LEGAL' ? 'Cliente bloqueado por proceso jurídico' : null;
}
