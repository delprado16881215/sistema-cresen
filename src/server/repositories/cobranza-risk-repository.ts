import { prisma } from '@/lib/prisma';

export async function listClientCreditsForRisk(clienteId: string) {
  return prisma.credito.findMany({
    where: {
      clienteId,
      cancelledAt: null,
      creditStatus: {
        code: {
          in: ['ACTIVE', 'COMPLETED'],
        },
      },
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
    },
    orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function listRiskInteraccionesByContext(input: {
  clienteId: string;
  creditoId?: string;
}) {
  return prisma.interaccion.findMany({
    where: {
      clienteId: input.clienteId,
      ...(input.creditoId
        ? {
            OR: [{ creditoId: input.creditoId }, { creditoId: null }],
          }
        : {}),
    },
    orderBy: [{ fechaHora: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function listRiskPromesasPagoByContext(input: {
  clienteId: string;
  creditoId?: string;
}) {
  return prisma.promesaPago.findMany({
    where: {
      clienteId: input.clienteId,
      ...(input.creditoId
        ? {
            OR: [{ creditoId: input.creditoId }, { creditoId: null }],
          }
        : {}),
    },
    orderBy: [{ fechaPromesa: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function listRiskVisitasCampoByContext(input: {
  clienteId: string;
  creditoId?: string;
}) {
  return prisma.visitaCampo.findMany({
    where: {
      clienteId: input.clienteId,
      ...(input.creditoId
        ? {
            OR: [{ creditoId: input.creditoId }, { creditoId: null }],
          }
        : {}),
    },
    orderBy: [{ fechaHora: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function listBatchRiskInteraccionesByContext(input: {
  clienteIds: string[];
  creditoIds: string[];
}) {
  if (!input.clienteIds.length) return [];

  return prisma.interaccion.findMany({
    where: {
      clienteId: {
        in: input.clienteIds,
      },
      OR: [{ creditoId: null }, { creditoId: { in: input.creditoIds } }],
    },
    select: {
      id: true,
      clienteId: true,
      creditoId: true,
      tipo: true,
      canal: true,
      resultado: true,
      fechaHora: true,
      telefonoUsado: true,
      createdAt: true,
    },
    orderBy: [{ fechaHora: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function listBatchRiskPromesasPagoByContext(input: {
  clienteIds: string[];
  creditoIds: string[];
}) {
  if (!input.clienteIds.length) return [];

  return prisma.promesaPago.findMany({
    where: {
      clienteId: {
        in: input.clienteIds,
      },
      OR: [{ creditoId: null }, { creditoId: { in: input.creditoIds } }],
    },
    select: {
      id: true,
      clienteId: true,
      creditoId: true,
      estado: true,
      fechaPromesa: true,
      montoPrometido: true,
      createdAt: true,
    },
    orderBy: [{ fechaPromesa: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function listBatchRiskVisitasCampoByContext(input: {
  clienteIds: string[];
  creditoIds: string[];
}) {
  if (!input.clienteIds.length) return [];

  return prisma.visitaCampo.findMany({
    where: {
      clienteId: {
        in: input.clienteIds,
      },
      OR: [{ creditoId: null }, { creditoId: { in: input.creditoIds } }],
    },
    select: {
      id: true,
      clienteId: true,
      creditoId: true,
      resultado: true,
      fechaHora: true,
      direccionTexto: true,
      referenciaLugar: true,
      createdAt: true,
    },
    orderBy: [{ fechaHora: 'desc' }, { createdAt: 'desc' }],
  });
}
