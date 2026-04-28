import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { writeAuditLog } from '@/lib/audit';
import {
  buildTemplateVariableValues,
  getCommunicationChannelLabel,
  getCommunicationSourceContextLabel,
  getDeliveryStatusLabel,
  getMessageTypeLabel,
  getTemplateVariableLabel,
  renderTemplateFragment,
} from '@/lib/communications';
import { AppError } from '@/lib/errors';
import { getLegalCreditStatusLabel } from '@/lib/legal-status';
import { prisma } from '@/lib/prisma';
import { normalizeOptionalPhone } from '@/modules/clientes/cliente-normalizers';
import {
  createCommunicationLogRecord,
  createMessageTemplateRecord,
  findCommunicationClienteContextById,
  findCommunicationCreditoContextById,
  findMessageTemplateRecordById,
  listCommunicationLogRecords,
  listMessageTemplateRecords,
  updateCommunicationLogRecord,
  updateMessageTemplateRecord,
  type CommunicationCreditoContextRecord,
  type CommunicationLogRecord,
  type MessageTemplateRecord,
} from '@/server/repositories/communications-repository';
import { resolveCommunicationProvider } from '@/server/services/communications-provider';
import type {
  CreateMessageTemplateInput,
  ListMessageTemplatesInput,
  PreviewCommunicationInput,
  SendCommunicationInput,
  UpdateMessageTemplateInput,
} from '@/server/validators/comunicaciones';

type CommunicationRuntimeContext = {
  cliente: NonNullable<Awaited<ReturnType<typeof findCommunicationClienteContextById>>>;
  credito: Awaited<ReturnType<typeof findCommunicationCreditoContextById>>;
};

type ResolvedCommunicationDraft = {
  template: MessageTemplateRecord | null;
  type: NonNullable<PreviewCommunicationInput['type']>;
  channel: NonNullable<PreviewCommunicationInput['channel']>;
  recipient: string;
  renderedSubject: string | null;
  renderedContent: string;
  variables: Array<{
    key: string;
    label: string;
    value: string | null;
  }>;
};

let communicationStorageUnavailableDetected = false;
let hasWarnedCommunicationStorageUnavailable = false;
let communicationStorageAvailabilityPromise: Promise<boolean> | null = null;

function isCommunicationStorageUnavailable(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2021') return true;
    if (
      error.code === 'P2022' &&
      (error.message.includes('CommunicationLog') || error.message.includes('MessageTemplate'))
    ) {
      return true;
    }
  }

  const message = error instanceof Error ? error.message : String(error);
  return (
    (message.includes('CommunicationLog') || message.includes('MessageTemplate')) &&
    (message.includes('does not exist') || message.includes('does not exist in the current database'))
  );
}

function warnCommunicationStorageUnavailable(error: unknown) {
  communicationStorageUnavailableDetected = true;

  if (hasWarnedCommunicationStorageUnavailable) {
    return;
  }

  hasWarnedCommunicationStorageUnavailable = true;
  const detail = error instanceof Error ? error.message : String(error);
  console.warn(
    'El storage de comunicaciones no está disponible todavía en la base activa. La aplicación seguirá operando sin historial ni envío de mensajes.',
    detail,
  );
}

export async function isCommunicationStorageAvailable() {
  if (communicationStorageUnavailableDetected) {
    return false;
  }

  if (!communicationStorageAvailabilityPromise) {
    communicationStorageAvailabilityPromise = (async () => {
      try {
        const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name IN ('CommunicationLog', 'MessageTemplate')
        `;

        const tableNames = new Set(rows.map((row) => row.table_name));
        const hasCommunicationLog = tableNames.has('CommunicationLog');
        const hasMessageTemplate = tableNames.has('MessageTemplate');
        const isAvailable = hasCommunicationLog && hasMessageTemplate;

        if (!isAvailable) {
          const missing = [
            hasCommunicationLog ? null : 'CommunicationLog',
            hasMessageTemplate ? null : 'MessageTemplate',
          ].filter((value): value is string => Boolean(value));

          warnCommunicationStorageUnavailable(
            new Error(`Faltan tablas de comunicaciones en public: ${missing.join(', ')}`),
          );
        }

        return isAvailable;
      } catch (error) {
        communicationStorageAvailabilityPromise = null;

        if (!isCommunicationStorageUnavailable(error)) {
          throw error;
        }

        warnCommunicationStorageUnavailable(error);
        return false;
      }
    })();
  }

  return communicationStorageAvailabilityPromise;
}

async function requireCommunicationStorage() {
  if (await isCommunicationStorageAvailable()) {
    return;
  }

  throw new AppError(
    'El módulo de comunicaciones aún no está disponible en la base activa.',
    'COMMUNICATION_STORAGE_UNAVAILABLE',
    503,
  );
}

export type MessageTemplateItem = {
  id: string;
  name: string;
  type: MessageTemplateRecord['type'];
  typeLabel: string;
  channel: MessageTemplateRecord['channel'];
  channelLabel: string;
  subject: string | null;
  content: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
  updatedByName: string | null;
};

export type CommunicationLogItem = {
  id: string;
  clienteId: string;
  creditoId: string | null;
  channel: CommunicationLogRecord['channel'];
  channelLabel: string;
  type: CommunicationLogRecord['type'];
  typeLabel: string;
  sourceContext: CommunicationLogRecord['sourceContext'];
  sourceContextLabel: string;
  status: CommunicationLogRecord['status'];
  statusLabel: string;
  recipient: string;
  subject: string | null;
  renderedContent: string;
  templateId: string | null;
  templateName: string | null;
  errorMessage: string | null;
  providerKey: string | null;
  attemptedAt: string;
  sentAt: string | null;
  canceledAt: string | null;
  createdByName: string | null;
  cliente: {
    id: string;
    code: string;
    fullName: string;
  };
  credito: {
    id: string;
    folio: string;
    loanNumber: string;
  } | null;
};

export type CommunicationPreviewResult = {
  template: {
    id: string;
    name: string;
  } | null;
  type: ResolvedCommunicationDraft['type'];
  typeLabel: string;
  channel: ResolvedCommunicationDraft['channel'];
  channelLabel: string;
  recipient: string;
  subject: string | null;
  renderedContent: string;
  variables: ResolvedCommunicationDraft['variables'];
};

export type SendCommunicationResult = {
  success: boolean;
  message: string;
  log: CommunicationLogItem;
};

function serializeMessageTemplate(record: MessageTemplateRecord): MessageTemplateItem {
  return {
    id: record.id,
    name: record.name,
    type: record.type,
    typeLabel: getMessageTypeLabel(record.type),
    channel: record.channel,
    channelLabel: getCommunicationChannelLabel(record.channel),
    subject: record.subject ?? null,
    content: record.content,
    isActive: record.isActive,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    createdByName: record.createdByUser?.name ?? null,
    updatedByName: record.updatedByUser?.name ?? null,
  };
}

function serializeCommunicationLog(record: CommunicationLogRecord): CommunicationLogItem {
  return {
    id: record.id,
    clienteId: record.clienteId,
    creditoId: record.creditoId ?? null,
    channel: record.channel,
    channelLabel: getCommunicationChannelLabel(record.channel),
    type: record.type,
    typeLabel: getMessageTypeLabel(record.type),
    sourceContext: record.sourceContext,
    sourceContextLabel: getCommunicationSourceContextLabel(record.sourceContext),
    status: record.status,
    statusLabel: getDeliveryStatusLabel(record.status),
    recipient: record.recipient,
    subject: record.subject ?? null,
    renderedContent: record.renderedContent,
    templateId: record.templateId ?? null,
    templateName: record.templateName ?? record.template?.name ?? null,
    errorMessage: record.errorMessage ?? null,
    providerKey: record.providerKey ?? null,
    attemptedAt: record.attemptedAt.toISOString(),
    sentAt: record.sentAt?.toISOString() ?? null,
    canceledAt: record.canceledAt?.toISOString() ?? null,
    createdByName: record.createdByUser?.name ?? null,
    cliente: {
      id: record.cliente.id,
      code: record.cliente.code,
      fullName: record.cliente.fullName,
    },
    credito: record.credito
      ? {
          id: record.credito.id,
          folio: record.credito.folio,
          loanNumber: record.credito.loanNumber,
        }
      : null,
  };
}

function ensureTemplateUniqueError(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    throw new AppError(
      'Ya existe una plantilla con el mismo nombre, tipo y canal.',
      'MESSAGE_TEMPLATE_DUPLICATED',
      409,
    );
  }

  throw error;
}

function resolveRecipient(channel: ResolvedCommunicationDraft['channel'], rawRecipient: string) {
  if (channel === 'EMAIL') {
    const parsed = z.string().trim().email('Captura un correo válido').safeParse(rawRecipient);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message ?? 'Captura un correo válido.', 'INVALID_RECIPIENT', 422);
    }
    return parsed.data;
  }

  const normalized = normalizeOptionalPhone(rawRecipient);
  if (!normalized || normalized.length !== 10) {
    throw new AppError(
      `Captura un teléfono válido de 10 dígitos para ${getCommunicationChannelLabel(channel).toLowerCase()}.`,
      'INVALID_RECIPIENT',
      422,
    );
  }

  return normalized;
}

function resolveNextPaymentContext(credito: CommunicationCreditoContextRecord | null) {
  if (!credito) {
    return {
      amount: null,
      dueDate: null,
    };
  }

  const pendingSchedule = credito.schedules.find((item) => {
    const pendingAmount = Number(item.expectedAmount) - Number(item.paidAmount);
    return pendingAmount > 0.001 && ['PENDING', 'PARTIAL', 'FAILED'].includes(item.installmentStatus.code);
  });

  if (pendingSchedule) {
    return {
      amount: Math.max(0, Number(pendingSchedule.expectedAmount) - Number(pendingSchedule.paidAmount)),
      dueDate: pendingSchedule.dueDate.toISOString().slice(0, 10),
    };
  }

  if (
    credito.extraWeek &&
    !['PAID', 'EXEMPT', 'REVERSED'].includes(credito.extraWeek.status)
  ) {
    return {
      amount: Math.max(0, Number(credito.extraWeek.expectedAmount) - Number(credito.extraWeek.paidAmount)),
      dueDate: credito.extraWeek.dueDate.toISOString().slice(0, 10),
    };
  }

  return {
    amount: Number(credito.weeklyAmount),
    dueDate: null,
  };
}

async function resolveCommunicationRuntimeContext(input: {
  clienteId: string;
  creditoId?: string | null;
}): Promise<CommunicationRuntimeContext> {
  const [cliente, credito] = await Promise.all([
    findCommunicationClienteContextById(input.clienteId),
    input.creditoId ? findCommunicationCreditoContextById(input.creditoId) : Promise.resolve(null),
  ]);

  if (!cliente) {
    throw new AppError('Cliente no encontrado para comunicaciones.', 'CLIENTE_NOT_FOUND', 404);
  }

  if (input.creditoId && !credito) {
    throw new AppError('Crédito no encontrado para comunicaciones.', 'CREDITO_NOT_FOUND', 404);
  }

  if (credito && credito.clienteId !== cliente.id) {
    throw new AppError('El crédito no pertenece al cliente indicado.', 'CLIENTE_CREDITO_MISMATCH', 422);
  }

  return {
    cliente,
    credito,
  };
}

async function resolveCommunicationDraft(
  input: PreviewCommunicationInput | SendCommunicationInput,
): Promise<ResolvedCommunicationDraft> {
  const runtime = await resolveCommunicationRuntimeContext({
    clienteId: input.clienteId,
    creditoId: input.creditoId,
  });

  const template = input.templateId ? await findMessageTemplateRecordById(input.templateId) : null;

  if (input.templateId && !template) {
    throw new AppError('La plantilla seleccionada no existe.', 'MESSAGE_TEMPLATE_NOT_FOUND', 404);
  }

  if (template && !template.isActive) {
    throw new AppError('La plantilla seleccionada está inactiva.', 'MESSAGE_TEMPLATE_INACTIVE', 422);
  }

  const type = (template?.type ?? input.type) as NonNullable<PreviewCommunicationInput['type']>;
  const channel = (template?.channel ?? input.channel) as NonNullable<PreviewCommunicationInput['channel']>;

  if (!type || !channel) {
    throw new AppError('No se pudo resolver el tipo y canal del mensaje.', 'MESSAGE_DRAFT_INCOMPLETE', 422);
  }

  const content = template?.content ?? input.content;
  if (!content) {
    throw new AppError('No se encontró contenido para renderizar el mensaje.', 'MESSAGE_CONTENT_REQUIRED', 422);
  }

  const subject = template?.subject ?? input.subject ?? null;
  const nextPayment = resolveNextPaymentContext(runtime.credito);
  const variableValues = buildTemplateVariableValues({
    clienteNombre: runtime.cliente.fullName,
    creditoFolio: runtime.credito?.folio ?? null,
    montoPago: nextPayment.amount,
    fechaPago: nextPayment.dueDate,
    estadoLegal: runtime.credito ? getLegalCreditStatusLabel(runtime.credito.legalStatus) : null,
    promotoriaNombre: runtime.credito?.promotoria.name ?? runtime.cliente.promotoria?.name ?? null,
  });

  const renderedSubject = renderTemplateFragment(subject, variableValues);
  const renderedContent = renderTemplateFragment(content, variableValues);
  const missingVariables = [...new Set([...renderedSubject.missingVariables, ...renderedContent.missingVariables])];

  if (missingVariables.length) {
    throw new AppError(
      `Faltan datos para renderizar: ${missingVariables.map((key) => getTemplateVariableLabel(key)).join(', ')}.`,
      'MESSAGE_VARIABLES_MISSING',
      422,
    );
  }

  const recipient = resolveRecipient(channel, input.recipient);

  return {
    template,
    type,
    channel,
    recipient,
    renderedSubject: renderedSubject.rendered,
    renderedContent: renderedContent.rendered ?? '',
    variables: Object.entries(variableValues).map(([key, value]) => ({
      key,
      label: getTemplateVariableLabel(key as keyof typeof variableValues),
      value,
    })),
  };
}

export async function listMessageTemplates(
  input: ListMessageTemplatesInput,
): Promise<MessageTemplateItem[]> {
  if (!(await isCommunicationStorageAvailable())) {
    return [];
  }

  const rows = await listMessageTemplateRecords({
    isActive: input.activeOnly ? true : undefined,
    type: input.type,
    channel: input.channel,
  });

  return rows.map(serializeMessageTemplate);
}

export async function createMessageTemplate(
  input: CreateMessageTemplateInput,
  userId: string,
): Promise<MessageTemplateItem> {
  await requireCommunicationStorage();

  try {
    const created = await createMessageTemplateRecord({
      name: input.name,
      type: input.type,
      channel: input.channel,
      subject: input.subject ?? null,
      content: input.content,
      isActive: input.isActive,
      createdByUserId: userId,
      updatedByUserId: userId,
    });

    await writeAuditLog({
      userId,
      module: 'comunicaciones',
      entity: 'MessageTemplate',
      entityId: created.id,
      action: 'CREATE',
      afterJson: serializeMessageTemplate(created),
    });

    return serializeMessageTemplate(created);
  } catch (error) {
    ensureTemplateUniqueError(error);
  }
}

export async function updateMessageTemplate(
  templateId: string,
  input: UpdateMessageTemplateInput,
  userId: string,
): Promise<MessageTemplateItem> {
  await requireCommunicationStorage();

  const current = await findMessageTemplateRecordById(templateId);
  if (!current) {
    throw new AppError('La plantilla seleccionada no existe.', 'MESSAGE_TEMPLATE_NOT_FOUND', 404);
  }

  try {
    const updated = await updateMessageTemplateRecord(templateId, {
      name: input.name,
      type: input.type,
      channel: input.channel,
      subject: input.subject ?? null,
      content: input.content,
      isActive: input.isActive,
      updatedByUserId: userId,
    });

    await writeAuditLog({
      userId,
      module: 'comunicaciones',
      entity: 'MessageTemplate',
      entityId: updated.id,
      action: 'UPDATE',
      beforeJson: serializeMessageTemplate(current),
      afterJson: serializeMessageTemplate(updated),
    });

    return serializeMessageTemplate(updated);
  } catch (error) {
    ensureTemplateUniqueError(error);
  }
}

export async function previewCommunication(
  input: PreviewCommunicationInput,
): Promise<CommunicationPreviewResult> {
  const draft = await resolveCommunicationDraft(input);

  return {
    template: draft.template
      ? {
          id: draft.template.id,
          name: draft.template.name,
        }
      : null,
    type: draft.type,
    typeLabel: getMessageTypeLabel(draft.type),
    channel: draft.channel,
    channelLabel: getCommunicationChannelLabel(draft.channel),
    recipient: draft.recipient,
    subject: draft.renderedSubject,
    renderedContent: draft.renderedContent,
    variables: draft.variables,
  };
}

export async function sendCommunication(
  input: SendCommunicationInput,
  userId: string,
): Promise<SendCommunicationResult> {
  await requireCommunicationStorage();

  const runtime = await resolveCommunicationRuntimeContext({
    clienteId: input.clienteId,
    creditoId: input.creditoId,
  });
  const draft = await resolveCommunicationDraft(input);

  const createdLog = await createCommunicationLogRecord({
    clienteId: runtime.cliente!.id,
    creditoId: runtime.credito?.id ?? null,
    templateId: draft.template?.id ?? null,
    channel: draft.channel,
    type: draft.type,
    sourceContext: input.sourceContext,
    status: 'PENDING',
    recipient: draft.recipient,
    subject: draft.renderedSubject ?? null,
    renderedContent: draft.renderedContent,
    templateName: draft.template?.name ?? null,
    createdByUserId: userId,
    attemptedAt: new Date(),
  });

  await writeAuditLog({
    userId,
    module: 'comunicaciones',
    entity: 'CommunicationLog',
    entityId: createdLog.id,
    action: 'CREATE',
    afterJson: serializeCommunicationLog(createdLog),
  });

  const provider = resolveCommunicationProvider(draft.channel);

  try {
    const providerResult = await provider.send({
      channel: draft.channel,
      recipient: draft.recipient,
      subject: draft.renderedSubject ?? null,
      renderedContent: draft.renderedContent,
    });

    const updated = await updateCommunicationLogRecord(createdLog.id, {
      status: providerResult.success ? 'SENT' : 'FAILED',
      providerKey: providerResult.providerKey,
      providerMessageId: providerResult.providerMessageId ?? null,
      errorMessage: providerResult.errorMessage ?? null,
      sentAt: providerResult.success ? providerResult.sentAt ?? new Date() : null,
    });

    await writeAuditLog({
      userId,
      module: 'comunicaciones',
      entity: 'CommunicationLog',
      entityId: updated.id,
      action: 'DELIVERY_RESULT',
      beforeJson: serializeCommunicationLog(createdLog),
      afterJson: serializeCommunicationLog(updated),
    });

    return {
      success: providerResult.success,
      message: providerResult.success
        ? 'Mensaje enviado y registrado en bitácora.'
        : providerResult.errorMessage ?? 'El envío falló, pero quedó registrado en bitácora.',
      log: serializeCommunicationLog(updated),
    };
  } catch (error) {
    const failed = await updateCommunicationLogRecord(createdLog.id, {
      status: 'FAILED',
      errorMessage: error instanceof Error ? error.message : 'Fallo inesperado del proveedor de comunicaciones.',
    });

    await writeAuditLog({
      userId,
      module: 'comunicaciones',
      entity: 'CommunicationLog',
      entityId: failed.id,
      action: 'DELIVERY_RESULT',
      beforeJson: serializeCommunicationLog(createdLog),
      afterJson: serializeCommunicationLog(failed),
    });

    return {
      success: false,
      message: failed.errorMessage ?? 'El envío falló, pero quedó registrado en bitácora.',
      log: serializeCommunicationLog(failed),
    };
  }
}

export async function listCommunicationHistory(input: {
  clienteId?: string;
  creditoId?: string;
  limit?: number;
}) {
  if (!(await isCommunicationStorageAvailable())) {
    return [];
  }

  if (!input.clienteId && !input.creditoId) {
    throw new AppError('Indica un cliente o un crédito para consultar comunicaciones.', 'COMMUNICATION_SCOPE_REQUIRED', 422);
  }

  if (input.creditoId) {
    const credito = await findCommunicationCreditoContextById(input.creditoId);
    if (!credito) {
      throw new AppError('Crédito no encontrado para consultar comunicaciones.', 'CREDITO_NOT_FOUND', 404);
    }

    if (input.clienteId && credito.clienteId !== input.clienteId) {
      throw new AppError('El crédito no pertenece al cliente indicado.', 'CLIENTE_CREDITO_MISMATCH', 422);
    }
  }

  if (input.clienteId) {
    const cliente = await findCommunicationClienteContextById(input.clienteId);
    if (!cliente) {
      throw new AppError('Cliente no encontrado para consultar comunicaciones.', 'CLIENTE_NOT_FOUND', 404);
    }
  }

  const rows = await listCommunicationLogRecords(
    {
      ...(input.clienteId ? { clienteId: input.clienteId } : {}),
      ...(input.creditoId ? { creditoId: input.creditoId } : {}),
    },
    input.limit ?? 10,
  );

  return rows.map(serializeCommunicationLog);
}
