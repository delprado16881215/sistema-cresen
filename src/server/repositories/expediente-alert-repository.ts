import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

const alertClientSelect = {
  id: true,
  code: true,
  fullName: true,
  phone: true,
  secondaryPhone: true,
  address: true,
  searchableAddress: true,
  neighborhood: true,
  city: true,
  state: true,
  promotoriaId: true,
} satisfies Prisma.ClienteSelect;

const alertCreditSelect = {
  id: true,
  folio: true,
  loanNumber: true,
  startDate: true,
  cancelledAt: true,
  clienteId: true,
  avalClienteId: true,
  promotoriaId: true,
  creditStatus: {
    select: {
      code: true,
      name: true,
    },
  },
  cliente: {
    select: alertClientSelect,
  },
  aval: {
    select: alertClientSelect,
  },
  promotoria: {
    select: {
      id: true,
      code: true,
      name: true,
      supervision: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
} satisfies Prisma.CreditoSelect;

const expedienteAlertaSelect = {
  id: true,
  fingerprint: true,
  clienteId: true,
  creditoId: true,
  promotoriaId: true,
  tipoAlerta: true,
  severidad: true,
  descripcion: true,
  evidenciaJson: true,
  status: true,
  isCurrent: true,
  detectedAt: true,
  lastSeenAt: true,
  reviewedAt: true,
  reviewedByUserId: true,
  reviewNotes: true,
  createdAt: true,
  updatedAt: true,
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
  promotoria: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
  reviewedByUser: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.ExpedienteAlertaSelect;

export type AlertClienteContext = Awaited<ReturnType<typeof findAlertClienteContextById>>;
export type AlertCreditoContext = Awaited<ReturnType<typeof findAlertCreditoContextById>>;
export type SharedPhoneClienteRecord = Awaited<ReturnType<typeof listClientesByNormalizedPhone>>[number];
export type SharedAddressClienteRecord = Awaited<ReturnType<typeof listClientesByNormalizedAddress>>[number];
export type SharedAvalCreditoRecord = Awaited<ReturnType<typeof listCreditosByAvalClienteId>>[number];
export type ExpedienteAlertaRecord = Awaited<ReturnType<typeof upsertExpedienteAlertaRecord>>;
export type ListedExpedienteAlertaRecord = Awaited<ReturnType<typeof listExpedienteAlertaRecords>>[number];

export async function findAlertClienteContextById(clienteId: string) {
  return prisma.cliente.findFirst({
    where: {
      id: clienteId,
      deletedAt: null,
    },
    select: alertClientSelect,
  });
}

export async function findAlertCreditoContextById(creditoId: string) {
  return prisma.credito.findFirst({
    where: {
      id: creditoId,
    },
    select: alertCreditSelect,
  });
}

export async function listClientesByNormalizedPhone(phone: string) {
  return prisma.cliente.findMany({
    where: {
      deletedAt: null,
      OR: [{ phone }, { secondaryPhone: phone }],
    },
    select: alertClientSelect,
    orderBy: [{ fullName: 'asc' }],
  });
}

export async function listClientesByNormalizedAddress(input: {
  searchableAddress: string;
  neighborhood?: string | null;
  city?: string | null;
}) {
  return prisma.cliente.findMany({
    where: {
      deletedAt: null,
      searchableAddress: input.searchableAddress,
      ...(input.neighborhood ? { neighborhood: input.neighborhood } : {}),
      ...(input.city ? { city: input.city } : {}),
    },
    select: alertClientSelect,
    orderBy: [{ fullName: 'asc' }],
  });
}

export async function listCreditosByAvalClienteId(input: {
  avalClienteId: string;
  startedFrom: Date;
}) {
  return prisma.credito.findMany({
    where: {
      avalClienteId: input.avalClienteId,
      cancelledAt: null,
      OR: [
        {
          creditStatus: {
            code: 'ACTIVE',
          },
        },
        {
          startDate: {
            gte: input.startedFrom,
          },
        },
      ],
    },
    select: {
      id: true,
      folio: true,
      loanNumber: true,
      startDate: true,
      creditStatus: {
        select: {
          code: true,
          name: true,
        },
      },
      cliente: {
        select: {
          id: true,
          code: true,
          fullName: true,
        },
      },
      promotoria: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
    orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function listExpedienteAlertaRecords(where: Prisma.ExpedienteAlertaWhereInput) {
  return prisma.expedienteAlerta.findMany({
    where,
    select: expedienteAlertaSelect,
    orderBy: [{ detectedAt: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function findExpedienteAlertaRecordById(id: string) {
  return prisma.expedienteAlerta.findUnique({
    where: { id },
    select: expedienteAlertaSelect,
  });
}

export async function findExpedienteAlertaRecordByFingerprint(fingerprint: string) {
  return prisma.expedienteAlerta.findUnique({
    where: { fingerprint },
    select: expedienteAlertaSelect,
  });
}

export async function upsertExpedienteAlertaRecord(input: {
  fingerprint: string;
  create: Prisma.ExpedienteAlertaUncheckedCreateInput;
  update: Prisma.ExpedienteAlertaUncheckedUpdateInput;
}) {
  return prisma.expedienteAlerta.upsert({
    where: { fingerprint: input.fingerprint },
    create: input.create,
    update: input.update,
    select: expedienteAlertaSelect,
  });
}

export async function updateExpedienteAlertaRecord(
  id: string,
  data: Prisma.ExpedienteAlertaUncheckedUpdateInput,
) {
  return prisma.expedienteAlerta.update({
    where: { id },
    data,
    select: expedienteAlertaSelect,
  });
}

export async function updateManyExpedienteAlertaRecords(
  where: Prisma.ExpedienteAlertaWhereInput,
  data: Prisma.ExpedienteAlertaUpdateManyMutationInput,
) {
  return prisma.expedienteAlerta.updateMany({
    where,
    data,
  });
}
