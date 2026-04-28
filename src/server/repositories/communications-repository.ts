import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

const messageTemplateSelect = {
  id: true,
  name: true,
  type: true,
  channel: true,
  subject: true,
  content: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  createdByUser: {
    select: {
      id: true,
      name: true,
    },
  },
  updatedByUser: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.MessageTemplateSelect;

const communicationLogSelect = {
  id: true,
  clienteId: true,
  creditoId: true,
  templateId: true,
  channel: true,
  type: true,
  sourceContext: true,
  status: true,
  recipient: true,
  subject: true,
  renderedContent: true,
  templateName: true,
  providerKey: true,
  providerMessageId: true,
  errorMessage: true,
  attemptedAt: true,
  sentAt: true,
  canceledAt: true,
  createdAt: true,
  updatedAt: true,
  createdByUser: {
    select: {
      id: true,
      name: true,
    },
  },
  template: {
    select: {
      id: true,
      name: true,
      type: true,
      channel: true,
    },
  },
  cliente: {
    select: {
      id: true,
      code: true,
      fullName: true,
    },
  },
  credito: {
    select: {
      id: true,
      folio: true,
      loanNumber: true,
    },
  },
} satisfies Prisma.CommunicationLogSelect;

const communicationClienteContextSelect = {
  id: true,
  code: true,
  fullName: true,
  phone: true,
  secondaryPhone: true,
  promotoria: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
} satisfies Prisma.ClienteSelect;

const communicationCreditoContextSelect = {
  id: true,
  clienteId: true,
  folio: true,
  loanNumber: true,
  weeklyAmount: true,
  legalStatus: true,
  promotoria: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
  schedules: {
    select: {
      id: true,
      dueDate: true,
      expectedAmount: true,
      paidAmount: true,
      installmentStatus: {
        select: {
          code: true,
        },
      },
    },
    orderBy: [{ installmentNumber: 'asc' }],
  },
  extraWeek: {
    select: {
      dueDate: true,
      expectedAmount: true,
      paidAmount: true,
      status: true,
    },
  },
} satisfies Prisma.CreditoSelect;

export type MessageTemplateRecord = Prisma.MessageTemplateGetPayload<{
  select: typeof messageTemplateSelect;
}>;

export type CommunicationLogRecord = Prisma.CommunicationLogGetPayload<{
  select: typeof communicationLogSelect;
}>;

export type CommunicationClienteContextRecord = Prisma.ClienteGetPayload<{
  select: typeof communicationClienteContextSelect;
}>;

export type CommunicationCreditoContextRecord = Prisma.CreditoGetPayload<{
  select: typeof communicationCreditoContextSelect;
}>;

export async function findCommunicationClienteContextById(clienteId: string) {
  return prisma.cliente.findFirst({
    where: {
      id: clienteId,
      deletedAt: null,
    },
    select: communicationClienteContextSelect,
  });
}

export async function findCommunicationCreditoContextById(creditoId: string) {
  return prisma.credito.findFirst({
    where: {
      id: creditoId,
      cancelledAt: null,
    },
    select: communicationCreditoContextSelect,
  });
}

export async function findMessageTemplateRecordById(id: string) {
  return prisma.messageTemplate.findUnique({
    where: { id },
    select: messageTemplateSelect,
  });
}

export async function listMessageTemplateRecords(input?: {
  isActive?: boolean;
  type?: Prisma.MessageTemplateWhereInput['type'];
  channel?: Prisma.MessageTemplateWhereInput['channel'];
}) {
  return prisma.messageTemplate.findMany({
    where: {
      ...(typeof input?.isActive === 'boolean' ? { isActive: input.isActive } : {}),
      ...(input?.type ? { type: input.type } : {}),
      ...(input?.channel ? { channel: input.channel } : {}),
    },
    select: messageTemplateSelect,
    orderBy: [{ isActive: 'desc' }, { type: 'asc' }, { channel: 'asc' }, { name: 'asc' }],
  });
}

export async function createMessageTemplateRecord(data: Prisma.MessageTemplateUncheckedCreateInput) {
  return prisma.messageTemplate.create({
    data,
    select: messageTemplateSelect,
  });
}

export async function updateMessageTemplateRecord(
  id: string,
  data: Prisma.MessageTemplateUncheckedUpdateInput,
) {
  return prisma.messageTemplate.update({
    where: { id },
    data,
    select: messageTemplateSelect,
  });
}

export async function createCommunicationLogRecord(data: Prisma.CommunicationLogUncheckedCreateInput) {
  return prisma.communicationLog.create({
    data,
    select: communicationLogSelect,
  });
}

export async function updateCommunicationLogRecord(
  id: string,
  data: Prisma.CommunicationLogUncheckedUpdateInput,
) {
  return prisma.communicationLog.update({
    where: { id },
    data,
    select: communicationLogSelect,
  });
}

export async function listCommunicationLogRecords(
  where: Prisma.CommunicationLogWhereInput,
  take: number,
) {
  return prisma.communicationLog.findMany({
    where,
    select: communicationLogSelect,
    orderBy: [{ attemptedAt: 'desc' }, { createdAt: 'desc' }],
    take,
  });
}
