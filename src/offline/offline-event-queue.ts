import {
  INTERACCION_CANALES,
  INTERACCION_RESULTADOS,
  INTERACCION_TIPOS,
  VISITA_CAMPO_RESULTADOS,
} from '@/server/validators/cobranza-operativa';
import {
  getOfflineRecord,
  listOfflineRecords,
  putOfflineRecord,
} from '@/offline/offline-storage';

export type OfflineEventType = 'INTERACTION' | 'PROMESA' | 'VISITA';
export type OfflineEventStatus = 'PENDING' | 'SYNCED' | 'FAILED';

export type OfflineInteractionPayload = {
  clienteId: string;
  creditoId: string | null;
  tipo: (typeof INTERACCION_TIPOS)[number];
  canal: (typeof INTERACCION_CANALES)[number] | null;
  resultado: (typeof INTERACCION_RESULTADOS)[number];
  fechaHora: string;
  duracionSegundos: number | null;
  notas: string | null;
  telefonoUsado: string | null;
};

export type OfflinePromisePayload = {
  clienteId: string;
  creditoId: string | null;
  interaccionId: string | null;
  fechaPromesa: string;
  montoPrometido: number | null;
  notas: string | null;
};

export type OfflineVisitPayload = {
  clienteId: string;
  creditoId: string | null;
  interaccionId: string | null;
  fechaHora: string;
  resultado: (typeof VISITA_CAMPO_RESULTADOS)[number];
  notas: string | null;
  direccionTexto: string | null;
  referenciaLugar: string | null;
  latitud: number | null;
  longitud: number | null;
};

type OfflinePayloadMap = {
  INTERACTION: OfflineInteractionPayload;
  PROMESA: OfflinePromisePayload;
  VISITA: OfflineVisitPayload;
};

export type OfflineQueueEvent<T extends OfflineEventType = OfflineEventType> = {
  eventId: string;
  type: T;
  payload: OfflinePayloadMap[T];
  createdAt: string;
  status: OfflineEventStatus;
  serverRecordId: string | null;
  lastError: string | null;
  lastAttemptAt: string | null;
  clienteId: string;
  creditoId: string | null;
  capturedByUserId: string;
  capturedByUserName: string | null;
};

export type OfflineQueueStats = {
  pending: number;
  synced: number;
  failed: number;
};

export const OFFLINE_QUEUE_UPDATED_EVENT = 'cobranza-offline-queue-updated';

function emitQueueUpdated() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OFFLINE_QUEUE_UPDATED_EVENT));
}

function buildOfflineEventId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `offline-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function saveOfflineEvent<T extends OfflineEventType>(event: OfflineQueueEvent<T>) {
  await putOfflineRecord('events', event.eventId, event);
  emitQueueUpdated();
  return event;
}

export async function enqueueOfflineEvent<T extends OfflineEventType>(input: {
  type: T;
  payload: OfflinePayloadMap[T];
  capturedByUserId: string;
  capturedByUserName: string | null;
}) {
  const event: OfflineQueueEvent<T> = {
    eventId: buildOfflineEventId(),
    type: input.type,
    payload: input.payload,
    createdAt: new Date().toISOString(),
    status: 'PENDING',
    serverRecordId: null,
    lastError: null,
    lastAttemptAt: null,
    clienteId: input.payload.clienteId,
    creditoId: input.payload.creditoId ?? null,
    capturedByUserId: input.capturedByUserId,
    capturedByUserName: input.capturedByUserName,
  };

  return saveOfflineEvent(event);
}

export async function listOfflineEvents() {
  const events = await listOfflineRecords<OfflineQueueEvent>('events');
  return [...events].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function getOfflineEvent(eventId: string) {
  return getOfflineRecord<OfflineQueueEvent>('events', eventId);
}

export async function listOfflineEventsByContext(input: {
  clienteId: string;
  creditoId: string | null;
}) {
  const events = await listOfflineEvents();
  return events.filter(
    (event) =>
      event.clienteId === input.clienteId &&
      (input.creditoId ? event.creditoId === input.creditoId : true) &&
      event.status !== 'SYNCED',
  );
}

export async function getPendingOfflineEvents() {
  const events = await listOfflineEvents();
  return events.filter((event) => event.status === 'PENDING' || event.status === 'FAILED');
}

export async function getOfflineQueueStats(): Promise<OfflineQueueStats> {
  const events = await listOfflineEvents();

  return {
    pending: events.filter((event) => event.status === 'PENDING').length,
    synced: events.filter((event) => event.status === 'SYNCED').length,
    failed: events.filter((event) => event.status === 'FAILED').length,
  };
}

export async function markOfflineEventStatus(
  eventId: string,
  input: {
    status: OfflineEventStatus;
    serverRecordId?: string | null;
    lastError?: string | null;
  },
) {
  const current = await getOfflineEvent(eventId);
  if (!current) return null;

  return saveOfflineEvent({
    ...current,
    status: input.status,
    serverRecordId: input.serverRecordId ?? current.serverRecordId,
    lastError: input.lastError ?? null,
    lastAttemptAt: new Date().toISOString(),
  });
}
