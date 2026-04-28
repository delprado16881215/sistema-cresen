import { Prisma } from '@prisma/client';
import { JURIDICO_ACTIVE_STATUSES, buildLegalEventSummary, getLegalCreditStatusLabel } from '@/lib/legal-status';
import { prisma } from '@/lib/prisma';

const juridicoCaseSelect = {
  id: true,
  folio: true,
  loanNumber: true,
  controlNumber: true,
  startDate: true,
  sentToLegalAt: true,
  legalStatus: true,
  legalStatusChangedAt: true,
  legalStatusReason: true,
  legalStatusNotes: true,
  cliente: {
    select: {
      id: true,
      code: true,
      fullName: true,
      phone: true,
      secondaryPhone: true,
      placementStatus: true,
      placementBlockReason: true,
    },
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
  creditStatus: {
    select: {
      code: true,
      name: true,
    },
  },
  legalEvents: {
    select: {
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
    },
    orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
    take: 1,
  },
} satisfies Prisma.CreditoSelect;

type JuridicoCaseRecord = Prisma.CreditoGetPayload<{
  select: typeof juridicoCaseSelect;
}>;

function buildDateRange(isoDate: string) {
  const start = new Date(`${isoDate}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  return { gte: start, lt: end };
}

export async function findJuridicoCases(input: {
  promotoriaId?: string;
  supervisionId?: string;
  legalStatus?: 'PRELEGAL' | 'LEGAL_REVIEW' | 'IN_LAWSUIT';
  sentToLegalDate?: string;
}) {
  const where: Prisma.CreditoWhereInput = {
    cancelledAt: null,
    legalStatus: {
      in: input.legalStatus ? [input.legalStatus] : JURIDICO_ACTIVE_STATUSES,
    },
    ...(input.promotoriaId ? { promotoriaId: input.promotoriaId } : {}),
    ...(input.supervisionId
      ? {
          promotoria: {
            is: {
              supervisionId: input.supervisionId,
            },
          },
        }
      : {}),
    ...(input.sentToLegalDate
      ? {
          sentToLegalAt: buildDateRange(input.sentToLegalDate),
        }
      : {}),
  };

  const rows = await prisma.credito.findMany({
    where,
    select: juridicoCaseSelect,
    orderBy: [{ sentToLegalAt: 'desc' }, { legalStatusChangedAt: 'desc' }, { createdAt: 'desc' }],
  });

  return rows.map((row) => {
    const latestEvent = row.legalEvents[0] ?? null;

    return {
      id: row.id,
      folio: row.folio,
      loanNumber: row.loanNumber,
      controlNumber: row.controlNumber != null ? String(row.controlNumber) : null,
      startDate: row.startDate.toISOString().slice(0, 10),
      sentToLegalAt: row.sentToLegalAt?.toISOString().slice(0, 10) ?? null,
      legalStatus: row.legalStatus,
      legalStatusLabel: getLegalCreditStatusLabel(row.legalStatus),
      legalStatusChangedAt: row.legalStatusChangedAt?.toISOString().slice(0, 10) ?? null,
      legalStatusReason: row.legalStatusReason ?? null,
      legalStatusNotes: row.legalStatusNotes ?? null,
      creditStatusName: row.creditStatus.name,
      cliente: {
        id: row.cliente.id,
        code: row.cliente.code,
        fullName: row.cliente.fullName,
        phone: row.cliente.phone,
        secondaryPhone: row.cliente.secondaryPhone ?? null,
        placementStatus: row.cliente.placementStatus,
        placementBlockReason: row.cliente.placementBlockReason ?? null,
      },
      promotoria: {
        id: row.promotoria.id,
        code: row.promotoria.code,
        name: row.promotoria.name,
        supervisionId: row.promotoria.supervision?.id ?? null,
        supervisionName: row.promotoria.supervision?.name ?? null,
      },
      latestEvent: latestEvent
        ? {
            id: latestEvent.id,
            eventType: latestEvent.eventType,
            effectiveDate: latestEvent.effectiveDate.toISOString().slice(0, 10),
            motivo: latestEvent.motivo,
            observaciones: latestEvent.observaciones ?? null,
            createdAt: latestEvent.createdAt.toISOString(),
            createdByName: latestEvent.createdByUser.name,
            summary: buildLegalEventSummary({
              eventType: latestEvent.eventType,
              previousStatus: latestEvent.previousStatus,
              nextStatus: latestEvent.nextStatus,
              motivo: latestEvent.motivo,
            }),
          }
        : null,
      links: {
        creditHref: `/creditos/${row.id}`,
        clientHref: `/clientes/${row.cliente.id}`,
      },
    };
  });
}

export async function findJuridicoPromotoriaOptions() {
  return prisma.promotoria.findMany({
    where: {
      deletedAt: null,
      isActive: true,
    },
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
    orderBy: [{ name: 'asc' }],
  });
}
