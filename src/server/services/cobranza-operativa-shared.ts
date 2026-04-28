import { AppError } from '@/lib/errors';
import { getLegalCreditStatusLabel, isActiveLegalCreditStatus } from '@/lib/legal-status';
import {
  findInteraccionReferenceById,
  findOperationalClienteById,
  findOperationalCreditoById,
  type InteraccionRecord,
  type PromesaPagoRecord,
  type VisitaCampoRecord,
} from '@/server/repositories/cobranza-operativa-repository';

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function toIsoDateTime(value: Date) {
  return value.toISOString();
}

function toNumber(value: { toString(): string } | number | string | null | undefined) {
  return value == null ? null : Number(value);
}

export type CobranzaInteraccionItem = {
  id: string;
  clienteId: string;
  creditoId: string | null;
  tipo: string;
  canal: string | null;
  resultado: string;
  fechaHora: string;
  duracionSegundos: number | null;
  notas: string | null;
  telefonoUsado: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    name: string;
  };
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

export type CobranzaPromesaPagoItem = {
  id: string;
  clienteId: string;
  creditoId: string | null;
  interaccionId: string | null;
  fechaPromesa: string;
  montoPrometido: number | null;
  estado: string;
  notas: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    name: string;
  };
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
  interaccion: {
    id: string;
    tipo: string;
    resultado: string;
    fechaHora: string;
  } | null;
};

export type CobranzaVisitaCampoItem = {
  id: string;
  clienteId: string;
  creditoId: string | null;
  interaccionId: string | null;
  fechaHora: string;
  resultado: string;
  notas: string | null;
  direccionTexto: string | null;
  referenciaLugar: string | null;
  latitud: number | null;
  longitud: number | null;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    name: string;
  };
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
  interaccion: {
    id: string;
    tipo: string;
    resultado: string;
    fechaHora: string;
  } | null;
};

export async function assertClienteCreditoConsistency(input: {
  clienteId: string;
  creditoId?: string | null;
}) {
  const cliente = await findOperationalClienteById(input.clienteId);
  if (!cliente) {
    throw new AppError('Cliente no encontrado para registrar operación de cobranza.', 'CLIENTE_NOT_FOUND', 404);
  }

  if (!input.creditoId) {
    return {
      cliente,
      credito: null,
    };
  }

  const credito = await findOperationalCreditoById(input.creditoId);
  if (!credito) {
    throw new AppError('Crédito no encontrado para registrar operación de cobranza.', 'CREDITO_NOT_FOUND', 404);
  }

  if (credito.clienteId !== cliente.id) {
    throw new AppError(
      'El crédito no pertenece al cliente seleccionado.',
      'CLIENTE_CREDITO_MISMATCH',
      422,
    );
  }

  if (isActiveLegalCreditStatus(credito.legalStatus)) {
    throw new AppError(
      `La gestión operativa normal está bloqueada porque el crédito está en ${getLegalCreditStatusLabel(credito.legalStatus).toLowerCase()}.`,
      'CREDITO_IN_LEGAL_PROCESS',
      422,
    );
  }

  return {
    cliente,
    credito,
  };
}

export async function assertOperationalListScope(input: {
  clienteId?: string;
  creditoId?: string;
}) {
  if (input.clienteId && input.creditoId) {
    await assertClienteCreditoConsistency({
      clienteId: input.clienteId,
      creditoId: input.creditoId,
    });
    return;
  }

  if (input.clienteId) {
    const cliente = await findOperationalClienteById(input.clienteId);
    if (!cliente) {
      throw new AppError('Cliente no encontrado.', 'CLIENTE_NOT_FOUND', 404);
    }
  }

  if (input.creditoId) {
    const credito = await findOperationalCreditoById(input.creditoId);
    if (!credito) {
      throw new AppError('Crédito no encontrado.', 'CREDITO_NOT_FOUND', 404);
    }
  }
}

export async function assertInteraccionLink(input: {
  interaccionId?: string | null;
  clienteId: string;
  creditoId?: string | null;
  expectedTipo?: 'VISIT';
}) {
  if (!input.interaccionId) {
    return null;
  }

  const interaccion = await findInteraccionReferenceById(input.interaccionId);
  if (!interaccion) {
    throw new AppError('La interacción seleccionada no existe.', 'INTERACCION_NOT_FOUND', 404);
  }

  if (interaccion.clienteId !== input.clienteId) {
    throw new AppError(
      'La interacción seleccionada no pertenece al cliente indicado.',
      'INTERACCION_CLIENTE_MISMATCH',
      422,
    );
  }

  if (
    input.creditoId &&
    interaccion.creditoId &&
    interaccion.creditoId !== input.creditoId
  ) {
    throw new AppError(
      'La interacción seleccionada está vinculada a otro crédito.',
      'INTERACCION_CREDITO_MISMATCH',
      422,
    );
  }

  if (input.expectedTipo && interaccion.tipo !== input.expectedTipo) {
    throw new AppError(
      'La interacción vinculada no corresponde al tipo operativo esperado.',
      'INTERACCION_INVALID_TYPE',
      422,
    );
  }

  return interaccion;
}

export function serializeInteraccion(record: InteraccionRecord): CobranzaInteraccionItem {
  return {
    id: record.id,
    clienteId: record.clienteId,
    creditoId: record.creditoId ?? null,
    tipo: record.tipo,
    canal: record.canal ?? null,
    resultado: record.resultado,
    fechaHora: toIsoDateTime(record.fechaHora),
    duracionSegundos: record.duracionSegundos ?? null,
    notas: record.notas ?? null,
    telefonoUsado: record.telefonoUsado ?? null,
    createdAt: toIsoDateTime(record.createdAt),
    updatedAt: toIsoDateTime(record.updatedAt),
    createdBy: {
      id: record.createdByUser.id,
      name: record.createdByUser.name,
    },
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

export function serializePromesaPago(record: PromesaPagoRecord): CobranzaPromesaPagoItem {
  return {
    id: record.id,
    clienteId: record.clienteId,
    creditoId: record.creditoId ?? null,
    interaccionId: record.interaccionId ?? null,
    fechaPromesa: toIsoDate(record.fechaPromesa),
    montoPrometido: toNumber(record.montoPrometido),
    estado: record.estado,
    notas: record.notas ?? null,
    createdAt: toIsoDateTime(record.createdAt),
    updatedAt: toIsoDateTime(record.updatedAt),
    createdBy: {
      id: record.createdByUser.id,
      name: record.createdByUser.name,
    },
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
    interaccion: record.interaccion
      ? {
          id: record.interaccion.id,
          tipo: record.interaccion.tipo,
          resultado: record.interaccion.resultado,
          fechaHora: toIsoDateTime(record.interaccion.fechaHora),
        }
      : null,
  };
}

export function serializeVisitaCampo(record: VisitaCampoRecord): CobranzaVisitaCampoItem {
  return {
    id: record.id,
    clienteId: record.clienteId,
    creditoId: record.creditoId ?? null,
    interaccionId: record.interaccionId ?? null,
    fechaHora: toIsoDateTime(record.fechaHora),
    resultado: record.resultado,
    notas: record.notas ?? null,
    direccionTexto: record.direccionTexto ?? null,
    referenciaLugar: record.referenciaLugar ?? null,
    latitud: toNumber(record.latitud),
    longitud: toNumber(record.longitud),
    createdAt: toIsoDateTime(record.createdAt),
    updatedAt: toIsoDateTime(record.updatedAt),
    createdBy: {
      id: record.createdByUser.id,
      name: record.createdByUser.name,
    },
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
    interaccion: record.interaccion
      ? {
          id: record.interaccion.id,
          tipo: record.interaccion.tipo,
          resultado: record.interaccion.resultado,
          fechaHora: toIsoDateTime(record.interaccion.fechaHora),
        }
      : null,
  };
}
