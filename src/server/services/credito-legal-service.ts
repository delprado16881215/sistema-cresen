import { type LegalCreditEventType, type LegalCreditStatus, type Prisma } from '@prisma/client';
import { writeAuditLog } from '@/lib/audit';
import { AppError } from '@/lib/errors';
import {
  buildLegalEventSummary,
  canTransitionLegalStatus,
  getAllowedNextLegalStatuses,
  getClientePlacementBlockMessage,
  getLegalCreditStatusLabel,
} from '@/lib/legal-status';
import { prisma } from '@/lib/prisma';
import type { SendCreditoToLegalInput } from '@/server/validators/credito';
import type {
  ChangeCreditoLegalStatusInput,
  CreateCreditoLegalNoteInput,
} from '@/server/validators/juridico';

const LEGAL_NOTE_DUPLICATE_WINDOW_MS = 2 * 60_000;

export const creditoLegalEventSelect = {
  id: true,
  eventType: true,
  previousStatus: true,
  nextStatus: true,
  effectiveDate: true,
  motivo: true,
  observaciones: true,
  createdAt: true,
  createdByUser: {
    select: {
      id: true,
      name: true,
    },
  },
  credito: {
    select: {
      id: true,
      folio: true,
      loanNumber: true,
    },
  },
  cliente: {
    select: {
      id: true,
      code: true,
      fullName: true,
    },
  },
} satisfies Prisma.CreditoLegalEventSelect;

const creditoLegalContextSelect = {
  id: true,
  folio: true,
  loanNumber: true,
  legalStatus: true,
  clienteId: true,
  cliente: {
    select: {
      id: true,
      code: true,
      fullName: true,
      placementStatus: true,
    },
  },
} satisfies Prisma.CreditoSelect;

type CreditoLegalEventRecord = Prisma.CreditoLegalEventGetPayload<{
  select: typeof creditoLegalEventSelect;
}>;

type CreditoLegalContextRecord = Prisma.CreditoGetPayload<{
  select: typeof creditoLegalContextSelect;
}>;

export type CreditoLegalEventItem = {
  id: string;
  eventType: CreditoLegalEventRecord['eventType'];
  previousStatus: CreditoLegalEventRecord['previousStatus'];
  nextStatus: CreditoLegalEventRecord['nextStatus'];
  effectiveDate: string;
  motivo: string;
  observaciones: string | null;
  createdAt: string;
  createdBy: {
    id: string;
    name: string;
  };
  credito: {
    id: string;
    folio: string;
    loanNumber: string;
  };
  cliente: {
    id: string;
    code: string;
    fullName: string;
  };
};

type CreditoLegalMutationResult = {
  event: CreditoLegalEventItem;
  credito: {
    id: string;
    folio: string;
    loanNumber: string;
    legalStatus: LegalCreditStatus;
    legalStatusLabel: string;
    allowedNextStatuses: LegalCreditStatus[];
  };
  cliente: {
    id: string;
    code: string;
    fullName: string;
    placementStatus: 'BLOCKED_LEGAL' | 'ELIGIBLE';
    placementBlockMessage: string | null;
  };
  deduplicated: boolean;
};

function serializeCreditoLegalEvent(record: CreditoLegalEventRecord): CreditoLegalEventItem {
  return {
    id: record.id,
    eventType: record.eventType,
    previousStatus: record.previousStatus,
    nextStatus: record.nextStatus,
    effectiveDate: record.effectiveDate.toISOString().slice(0, 10),
    motivo: record.motivo,
    observaciones: record.observaciones ?? null,
    createdAt: record.createdAt.toISOString(),
    createdBy: {
      id: record.createdByUser.id,
      name: record.createdByUser.name,
    },
    credito: {
      id: record.credito.id,
      folio: record.credito.folio,
      loanNumber: record.credito.loanNumber,
    },
    cliente: {
      id: record.cliente.id,
      code: record.cliente.code,
      fullName: record.cliente.fullName,
    },
  };
}

function toEffectiveDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    throw new AppError('La fecha jurídica no es válida.', 'INVALID_LEGAL_DATE', 422);
  }
  return date;
}

async function acquireCreditoLegalLock(tx: Prisma.TransactionClient, creditoId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`credito-legal:${creditoId}`}))`;
}

async function findCreditoLegalContext(
  tx: Prisma.TransactionClient,
  creditoId: string,
) {
  return tx.credito.findFirst({
    where: { id: creditoId, cancelledAt: null },
    select: creditoLegalContextSelect,
  });
}

function buildMutationResult(input: {
  event: CreditoLegalEventRecord;
  credito: CreditoLegalContextRecord;
  nextStatus: LegalCreditStatus;
  deduplicated: boolean;
}): CreditoLegalMutationResult {
  return {
    event: serializeCreditoLegalEvent(input.event),
    credito: {
      id: input.credito.id,
      folio: input.credito.folio,
      loanNumber: input.credito.loanNumber,
      legalStatus: input.nextStatus,
      legalStatusLabel: getLegalCreditStatusLabel(input.nextStatus),
      allowedNextStatuses: getAllowedNextLegalStatuses(input.nextStatus),
    },
    cliente: {
      id: input.credito.cliente.id,
      code: input.credito.cliente.code,
      fullName: input.credito.cliente.fullName,
      placementStatus: input.credito.cliente.placementStatus,
      placementBlockMessage: getClientePlacementBlockMessage(input.credito.cliente.placementStatus),
    },
    deduplicated: input.deduplicated,
  };
}

async function findMatchingStatusEvent(input: {
  tx: Prisma.TransactionClient;
  creditoId: string;
  eventType: Extract<LegalCreditEventType, 'SEND_TO_LEGAL' | 'CHANGE_LEGAL_STATUS'>;
  nextStatus: LegalCreditStatus;
  effectiveDate: Date;
  motivo: string;
  observaciones: string | null;
  createdByUserId: string;
}) {
  return input.tx.creditoLegalEvent.findFirst({
    where: {
      creditoId: input.creditoId,
      eventType: input.eventType,
      nextStatus: input.nextStatus,
      effectiveDate: input.effectiveDate,
      motivo: input.motivo,
      observaciones: input.observaciones,
      createdByUserId: input.createdByUserId,
    },
    select: creditoLegalEventSelect,
    orderBy: [{ createdAt: 'desc' }],
  });
}

async function findMatchingRecentLegalNote(input: {
  tx: Prisma.TransactionClient;
  creditoId: string;
  currentStatus: LegalCreditStatus;
  effectiveDate: Date;
  motivo: string;
  observaciones: string | null;
  createdByUserId: string;
}) {
  return input.tx.creditoLegalEvent.findFirst({
    where: {
      creditoId: input.creditoId,
      eventType: 'LEGAL_NOTE',
      previousStatus: input.currentStatus,
      nextStatus: input.currentStatus,
      effectiveDate: input.effectiveDate,
      motivo: input.motivo,
      observaciones: input.observaciones,
      createdByUserId: input.createdByUserId,
      createdAt: {
        gte: new Date(Date.now() - LEGAL_NOTE_DUPLICATE_WINDOW_MS),
      },
    },
    select: creditoLegalEventSelect,
    orderBy: [{ createdAt: 'desc' }],
  });
}

function buildInvalidTransitionError(currentStatus: LegalCreditStatus, nextStatus: LegalCreditStatus) {
  const currentLabel = getLegalCreditStatusLabel(currentStatus);
  const nextLabel = getLegalCreditStatusLabel(nextStatus);
  const allowed = getAllowedNextLegalStatuses(currentStatus).map(getLegalCreditStatusLabel);

  if (!allowed.length) {
    return new AppError(
      `El estado ${currentLabel} no tiene transiciones jurídicas disponibles.`,
      'INVALID_LEGAL_TRANSITION',
      409,
    );
  }

  return new AppError(
    `Transición jurídica inválida: ${currentLabel} -> ${nextLabel}. Transiciones permitidas: ${allowed.join(', ')}.`,
    'INVALID_LEGAL_TRANSITION',
    409,
  );
}

async function createLegalStatusEvent(input: {
  tx: Prisma.TransactionClient;
  credito: CreditoLegalContextRecord;
  eventType: Extract<LegalCreditEventType, 'SEND_TO_LEGAL' | 'CHANGE_LEGAL_STATUS'>;
  nextStatus: LegalCreditStatus;
  effectiveDate: Date;
  motivo: string;
  observaciones: string | null;
  userId: string;
  updateClientePlacement: boolean;
}) {
  const event = await input.tx.creditoLegalEvent.create({
    data: {
      creditoId: input.credito.id,
      clienteId: input.credito.clienteId,
      eventType: input.eventType,
      previousStatus: input.credito.legalStatus,
      nextStatus: input.nextStatus,
      effectiveDate: input.effectiveDate,
      motivo: input.motivo,
      observaciones: input.observaciones,
      createdByUserId: input.userId,
    },
    select: creditoLegalEventSelect,
  });

  await input.tx.credito.update({
    where: { id: input.credito.id },
    data: {
      legalStatus: input.nextStatus,
      legalStatusChangedAt: input.effectiveDate,
      sentToLegalAt: input.nextStatus === 'PRELEGAL'
        ? input.effectiveDate
        : undefined,
      legalStatusReason: input.motivo,
      legalStatusNotes: input.observaciones,
      legalUpdatedByUserId: input.userId,
      updatedByUserId: input.userId,
    },
  });

  if (input.updateClientePlacement) {
    await input.tx.cliente.update({
      where: { id: input.credito.clienteId },
      data: {
        placementStatus: 'BLOCKED_LEGAL',
        placementBlockedAt: input.effectiveDate,
        placementBlockReason: input.motivo,
        placementBlockSourceCreditoId: input.credito.id,
      },
    });
  }

  return event;
}

async function createLegalNoteEvent(input: {
  tx: Prisma.TransactionClient;
  credito: CreditoLegalContextRecord;
  effectiveDate: Date;
  motivo: string;
  observaciones: string | null;
  userId: string;
}) {
  return input.tx.creditoLegalEvent.create({
    data: {
      creditoId: input.credito.id,
      clienteId: input.credito.clienteId,
      eventType: 'LEGAL_NOTE',
      previousStatus: input.credito.legalStatus,
      nextStatus: input.credito.legalStatus,
      effectiveDate: input.effectiveDate,
      motivo: input.motivo,
      observaciones: input.observaciones,
      createdByUserId: input.userId,
    },
    select: creditoLegalEventSelect,
  });
}

async function commitStatusChange(input: {
  creditoId: string;
  currentStatus: LegalCreditStatus;
  eventType: Extract<LegalCreditEventType, 'SEND_TO_LEGAL' | 'CHANGE_LEGAL_STATUS'>;
  nextStatus: LegalCreditStatus;
  effectiveDate: Date;
  motivo: string;
  observaciones: string | null;
  userId: string;
  updateClientePlacement: boolean;
}) {
  const result = await prisma.$transaction(async (tx) => {
    await acquireCreditoLegalLock(tx, input.creditoId);

    const credito = await findCreditoLegalContext(tx, input.creditoId);
    if (!credito) {
      throw new AppError('Crédito no encontrado para el movimiento jurídico.', 'CREDITO_NOT_FOUND', 404);
    }

    if (credito.legalStatus === input.nextStatus) {
      const existingEvent = await findMatchingStatusEvent({
        tx,
        creditoId: credito.id,
        eventType: input.eventType,
        nextStatus: input.nextStatus,
        effectiveDate: input.effectiveDate,
        motivo: input.motivo,
        observaciones: input.observaciones,
        createdByUserId: input.userId,
      });

      if (existingEvent) {
        return buildMutationResult({
          event: existingEvent,
          credito,
          nextStatus: input.nextStatus,
          deduplicated: true,
        });
      }
    }

    if (credito.legalStatus !== input.currentStatus) {
      throw buildInvalidTransitionError(credito.legalStatus, input.nextStatus);
    }

    if (!canTransitionLegalStatus(credito.legalStatus, input.nextStatus)) {
      throw buildInvalidTransitionError(credito.legalStatus, input.nextStatus);
    }

    const event = await createLegalStatusEvent({
      tx,
      credito,
      eventType: input.eventType,
      nextStatus: input.nextStatus,
      effectiveDate: input.effectiveDate,
      motivo: input.motivo,
      observaciones: input.observaciones,
      userId: input.userId,
      updateClientePlacement: input.updateClientePlacement,
    });

    return buildMutationResult({
      event,
      credito: {
        ...credito,
        legalStatus: input.nextStatus,
      },
      nextStatus: input.nextStatus,
      deduplicated: false,
    });
  });

  if (!result.deduplicated) {
    await writeAuditLog({
      userId: input.userId,
      module: 'juridico',
      entity: 'CreditoLegalEvent',
      entityId: result.event.id,
      action: input.eventType,
      afterJson: {
        ...result.event,
        summary: buildLegalEventSummary({
          eventType: result.event.eventType,
          previousStatus: result.event.previousStatus,
          nextStatus: result.event.nextStatus,
          motivo: result.event.motivo,
        }),
        clientePlacementStatus: result.cliente.placementStatus,
        clientePlacementBlockMessage: result.cliente.placementBlockMessage,
        deduplicated: false,
      },
    });
  }

  return result;
}

export async function sendCreditoToLegal(input: {
  creditoId: string;
  payload: SendCreditoToLegalInput;
  userId: string;
}) {
  const motivo = input.payload.motivo.trim();
  const observaciones = input.payload.observaciones?.trim() || null;
  const effectiveDate = toEffectiveDate(input.payload.fecha);

  return commitStatusChange({
    creditoId: input.creditoId,
    currentStatus: 'NONE',
    eventType: 'SEND_TO_LEGAL',
    nextStatus: 'PRELEGAL',
    effectiveDate,
    motivo,
    observaciones,
    userId: input.userId,
    updateClientePlacement: true,
  });
}

export async function changeCreditoLegalStatus(input: {
  creditoId: string;
  payload: ChangeCreditoLegalStatusInput;
  userId: string;
}) {
  const motivo = input.payload.motivo.trim();
  const observaciones = input.payload.observaciones?.trim() || null;
  const effectiveDate = toEffectiveDate(input.payload.fecha);

  const result = await prisma.$transaction(async (tx) => {
    await acquireCreditoLegalLock(tx, input.creditoId);
    const credito = await findCreditoLegalContext(tx, input.creditoId);
    if (!credito) {
      throw new AppError('Crédito no encontrado para actualizar jurídico.', 'CREDITO_NOT_FOUND', 404);
    }

    const currentStatus = credito.legalStatus;
    const nextStatus = input.payload.nextStatus;

    if (currentStatus === 'NONE') {
      throw new AppError(
        'El crédito todavía no ha sido enviado a jurídico y no puede cambiar de estado.',
        'CREDITO_NOT_IN_LEGAL',
        409,
      );
    }

    if (currentStatus === nextStatus) {
      const existingEvent = await findMatchingStatusEvent({
        tx,
        creditoId: credito.id,
        eventType: 'CHANGE_LEGAL_STATUS',
        nextStatus,
        effectiveDate,
        motivo,
        observaciones,
        createdByUserId: input.userId,
      });

      if (existingEvent) {
        return buildMutationResult({
          event: existingEvent,
          credito,
          nextStatus,
          deduplicated: true,
        });
      }
    }

    if (!canTransitionLegalStatus(currentStatus, nextStatus)) {
      throw buildInvalidTransitionError(currentStatus, nextStatus);
    }

    const event = await createLegalStatusEvent({
      tx,
      credito,
      eventType: 'CHANGE_LEGAL_STATUS',
      nextStatus,
      effectiveDate,
      motivo,
      observaciones,
      userId: input.userId,
      updateClientePlacement: false,
    });

    const result = buildMutationResult({
      event,
      credito: {
        ...credito,
        legalStatus: nextStatus,
      },
      nextStatus,
      deduplicated: false,
    });

    return result;
  });

  if (!result.deduplicated) {
    await writeAuditLog({
      userId: input.userId,
      module: 'juridico',
      entity: 'CreditoLegalEvent',
      entityId: result.event.id,
      action: 'CHANGE_LEGAL_STATUS',
      afterJson: {
        ...result.event,
        summary: buildLegalEventSummary({
          eventType: result.event.eventType,
          previousStatus: result.event.previousStatus,
          nextStatus: result.event.nextStatus,
          motivo: result.event.motivo,
        }),
        clientePlacementStatus: result.cliente.placementStatus,
        clientePlacementBlockMessage: result.cliente.placementBlockMessage,
        deduplicated: false,
      },
    });
  }

  return result;
}

export async function addCreditoLegalNote(input: {
  creditoId: string;
  payload: CreateCreditoLegalNoteInput;
  userId: string;
}) {
  const motivo = input.payload.motivo.trim();
  const observaciones = input.payload.observaciones?.trim() || null;
  const effectiveDate = toEffectiveDate(input.payload.fecha);

  const result = await prisma.$transaction(async (tx) => {
    await acquireCreditoLegalLock(tx, input.creditoId);

    const credito = await findCreditoLegalContext(tx, input.creditoId);
    if (!credito) {
      throw new AppError('Crédito no encontrado para registrar nota jurídica.', 'CREDITO_NOT_FOUND', 404);
    }

    if (credito.legalStatus === 'NONE') {
      throw new AppError(
        'No se pueden registrar notas jurídicas antes de enviar el crédito a jurídico.',
        'CREDITO_NOT_IN_LEGAL',
        409,
      );
    }

    const existingEvent = await findMatchingRecentLegalNote({
      tx,
      creditoId: credito.id,
      currentStatus: credito.legalStatus,
      effectiveDate,
      motivo,
      observaciones,
      createdByUserId: input.userId,
    });

    if (existingEvent) {
      return buildMutationResult({
        event: existingEvent,
        credito,
        nextStatus: credito.legalStatus,
        deduplicated: true,
      });
    }

    const event = await createLegalNoteEvent({
      tx,
      credito,
      effectiveDate,
      motivo,
      observaciones,
      userId: input.userId,
    });

    return buildMutationResult({
      event,
      credito,
      nextStatus: credito.legalStatus,
      deduplicated: false,
    });
  });

  if (!result.deduplicated) {
    await writeAuditLog({
      userId: input.userId,
      module: 'juridico',
      entity: 'CreditoLegalEvent',
      entityId: result.event.id,
      action: 'LEGAL_NOTE',
      afterJson: {
        ...result.event,
        summary: buildLegalEventSummary({
          eventType: result.event.eventType,
          previousStatus: result.event.previousStatus,
          nextStatus: result.event.nextStatus,
          motivo: result.event.motivo,
        }),
        clientePlacementStatus: result.cliente.placementStatus,
        clientePlacementBlockMessage: result.cliente.placementBlockMessage,
        deduplicated: false,
      },
    });
  }

  return result;
}
