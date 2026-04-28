import { Prisma } from '@prisma/client';
import { getClientePlacementBlockMessage, isClientePlacementBlocked } from '@/lib/legal-status';
import { prisma } from '@/lib/prisma';

export async function findClientes(input: {
  search?: string;
  isActive?: boolean;
  page: number;
  pageSize: number;
}) {
  const where: Prisma.ClienteWhereInput = {
    deletedAt: null,
    ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
    ...(input.search
      ? {
          OR: [
            { fullName: { contains: input.search, mode: 'insensitive' } },
            { phone: { contains: input.search, mode: 'insensitive' } },
            { searchableAddress: { contains: input.search, mode: 'insensitive' } },
            { postalCode: { contains: input.search, mode: 'insensitive' } },
            { code: { contains: input.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [rows, total] = await prisma.$transaction([
    prisma.cliente.findMany({
      where,
      include: {
        clientType: true,
        promotoria: {
          include: {
            supervision: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.cliente.count({ where }),
  ]);

  return { rows, total };
}

export async function findClienteById(id: string) {
  return prisma.cliente.findFirst({
    where: { id, deletedAt: null },
    include: {
      clientType: true,
      promotoria: {
        include: {
          supervision: true,
        },
      },
    },
  });
}

const clienteBitacoraCreditoSelect = {
  id: true,
  folio: true,
  loanNumber: true,
  controlNumber: true,
  startDate: true,
  cancelledAt: true,
  legalStatus: true,
  sentToLegalAt: true,
  legalStatusReason: true,
  legalStatusNotes: true,
  creditStatus: {
    select: {
      code: true,
      name: true,
    },
  },
  promotoria: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
  aval: {
    select: {
      id: true,
      code: true,
      fullName: true,
    },
  },
} satisfies Prisma.CreditoSelect;

const clienteLegalEventBitacoraSelect = {
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
      controlNumber: true,
    },
  },
} satisfies Prisma.CreditoLegalEventSelect;

const clienteExpedienteAuditSelect = {
  id: true,
  action: true,
  beforeJson: true,
  afterJson: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.AuditLogSelect;

export async function listClienteCreditosBitacora(clienteId: string) {
  return prisma.credito.findMany({
    where: {
      clienteId,
      cancelledAt: null,
    },
    select: clienteBitacoraCreditoSelect,
    orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function listClienteLegalEventsBitacora(clienteId: string) {
  return prisma.creditoLegalEvent.findMany({
    where: { clienteId },
    select: clienteLegalEventBitacoraSelect,
    orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function listClienteExpedienteAuditLogsBitacora(clienteId: string) {
  return prisma.auditLog.findMany({
    where: {
      module: 'clientes',
      entity: 'Cliente',
      entityId: clienteId,
      action: 'UPDATE',
    },
    select: clienteExpedienteAuditSelect,
    orderBy: [{ createdAt: 'desc' }],
    take: 100,
  });
}

export async function listClientTypeCatalogBitacora() {
  return prisma.clientTypeCatalog.findMany({
    select: {
      id: true,
      name: true,
    },
    orderBy: [{ name: 'asc' }],
  });
}

export async function searchClientesForPicker(input: {
  q?: string;
  excludeId?: string;
  limit: number;
}) {
  const query = input.q?.trim();

  if (!query) {
    return [];
  }

  const rows = await prisma.cliente.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
      OR: [
        { code: { contains: query, mode: 'insensitive' } },
        { fullName: { contains: query, mode: 'insensitive' } },
        { phone: { contains: query, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      code: true,
      fullName: true,
      phone: true,
      address: true,
      neighborhood: true,
      city: true,
      promotoriaId: true,
      placementStatus: true,
      placementBlockReason: true,
    },
    orderBy: [{ fullName: 'asc' }],
    take: input.limit,
  });

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    fullName: row.fullName,
    phone: row.phone,
    addressLabel: [row.address, row.neighborhood, row.city].filter(Boolean).join(', ') || null,
    promotoriaId: row.promotoriaId,
    placementStatus: row.placementStatus,
    placementBlockReason: row.placementBlockReason,
    isPlacementBlocked: isClientePlacementBlocked(row.placementStatus),
    placementBlockMessage: getClientePlacementBlockMessage(row.placementStatus),
  }));
}
