import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

const operationalClienteSelect = {
  id: true,
  code: true,
  fullName: true,
  phone: true,
  secondaryPhone: true,
  address: true,
  neighborhood: true,
  city: true,
  state: true,
  betweenStreets: true,
  referencesNotes: true,
  observations: true,
} satisfies Prisma.ClienteSelect;

const operationalCreditoSelect = {
  id: true,
  folio: true,
  loanNumber: true,
  clienteId: true,
  controlNumber: true,
  startDate: true,
  legalStatus: true,
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
} satisfies Prisma.CreditoSelect;

const interaccionSelect = {
  id: true,
  clienteId: true,
  creditoId: true,
  tipo: true,
  canal: true,
  resultado: true,
  fechaHora: true,
  duracionSegundos: true,
  notas: true,
  telefonoUsado: true,
  createdAt: true,
  updatedAt: true,
  createdByUser: {
    select: {
      id: true,
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
  credito: {
    select: {
      id: true,
      folio: true,
      loanNumber: true,
    },
  },
} satisfies Prisma.InteraccionSelect;

const promesaPagoSelect = {
  id: true,
  clienteId: true,
  creditoId: true,
  interaccionId: true,
  fechaPromesa: true,
  montoPrometido: true,
  estado: true,
  notas: true,
  createdAt: true,
  updatedAt: true,
  createdByUser: {
    select: {
      id: true,
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
  credito: {
    select: {
      id: true,
      folio: true,
      loanNumber: true,
    },
  },
  interaccion: {
    select: {
      id: true,
      tipo: true,
      resultado: true,
      fechaHora: true,
    },
  },
} satisfies Prisma.PromesaPagoSelect;

const visitaCampoSelect = {
  id: true,
  clienteId: true,
  creditoId: true,
  interaccionId: true,
  fechaHora: true,
  resultado: true,
  notas: true,
  direccionTexto: true,
  referenciaLugar: true,
  latitud: true,
  longitud: true,
  createdAt: true,
  updatedAt: true,
  createdByUser: {
    select: {
      id: true,
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
  credito: {
    select: {
      id: true,
      folio: true,
      loanNumber: true,
    },
  },
  interaccion: {
    select: {
      id: true,
      tipo: true,
      resultado: true,
      fechaHora: true,
    },
  },
} satisfies Prisma.VisitaCampoSelect;

export type OperationalClienteReference = Awaited<ReturnType<typeof findOperationalClienteById>>;
export type OperationalCreditoReference = Awaited<ReturnType<typeof findOperationalCreditoById>>;
export type InteraccionRecord = Awaited<ReturnType<typeof createInteraccionRecord>>;
export type PromesaPagoRecord = Awaited<ReturnType<typeof createPromesaPagoRecord>>;
export type VisitaCampoRecord = Awaited<ReturnType<typeof createVisitaCampoRecord>>;
export type InteraccionReference = Awaited<ReturnType<typeof findInteraccionReferenceById>>;

export async function findOperationalClienteById(clienteId: string) {
  return prisma.cliente.findFirst({
    where: {
      id: clienteId,
      deletedAt: null,
    },
    select: operationalClienteSelect,
  });
}

export async function findOperationalCreditoById(creditoId: string) {
  return prisma.credito.findFirst({
    where: {
      id: creditoId,
    },
    select: operationalCreditoSelect,
  });
}

export async function findInteraccionReferenceById(interaccionId: string) {
  return prisma.interaccion.findUnique({
    where: { id: interaccionId },
    select: {
      id: true,
      clienteId: true,
      creditoId: true,
      tipo: true,
      resultado: true,
      fechaHora: true,
    },
  });
}

export async function findInteraccionRecordById(id: string) {
  return prisma.interaccion.findUnique({
    where: { id },
    select: interaccionSelect,
  });
}

export async function createInteraccionRecord(data: Prisma.InteraccionUncheckedCreateInput) {
  return prisma.interaccion.create({
    data,
    select: interaccionSelect,
  });
}

export async function listInteraccionRecords(where: Prisma.InteraccionWhereInput, take: number) {
  return prisma.interaccion.findMany({
    where,
    select: interaccionSelect,
    orderBy: [{ fechaHora: 'desc' }, { createdAt: 'desc' }],
    take,
  });
}

export async function createPromesaPagoRecord(data: Prisma.PromesaPagoUncheckedCreateInput) {
  return prisma.promesaPago.create({
    data,
    select: promesaPagoSelect,
  });
}

export async function listPromesaPagoRecords(where: Prisma.PromesaPagoWhereInput, take: number) {
  return prisma.promesaPago.findMany({
    where,
    select: promesaPagoSelect,
    orderBy: [{ fechaPromesa: 'desc' }, { createdAt: 'desc' }],
    take,
  });
}

export async function findPromesaPagoRecordById(id: string) {
  return prisma.promesaPago.findUnique({
    where: { id },
    select: promesaPagoSelect,
  });
}

export async function updatePromesaPagoRecord(
  id: string,
  data: Prisma.PromesaPagoUncheckedUpdateInput,
) {
  return prisma.promesaPago.update({
    where: { id },
    data,
    select: promesaPagoSelect,
  });
}

export async function createVisitaCampoRecord(data: Prisma.VisitaCampoUncheckedCreateInput) {
  return prisma.visitaCampo.create({
    data,
    select: visitaCampoSelect,
  });
}

export async function findVisitaCampoRecordById(id: string) {
  return prisma.visitaCampo.findUnique({
    where: { id },
    select: visitaCampoSelect,
  });
}

export async function listVisitaCampoRecords(where: Prisma.VisitaCampoWhereInput, take: number) {
  return prisma.visitaCampo.findMany({
    where,
    select: visitaCampoSelect,
    orderBy: [{ fechaHora: 'desc' }, { createdAt: 'desc' }],
    take,
  });
}
