import {
  getPendingOfflineEvents,
  markOfflineEventStatus,
  type OfflineQueueEvent,
} from '@/offline/offline-event-queue';

type SyncApiResponse = {
  results: Array<{
    eventId: string;
    status: 'SYNCED' | 'DUPLICATE' | 'FAILED';
    serverRecordId: string | null;
    message: string | null;
  }>;
  summary: {
    total: number;
    synced: number;
    duplicates: number;
    failed: number;
  };
};

export type OfflineSyncSummary = SyncApiResponse['summary'] & {
  attempted: number;
};

async function requestSync(events: OfflineQueueEvent[]) {
  const response = await fetch('/api/cobranza/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      events: events.map((event) => ({
        eventId: event.eventId,
        type: event.type,
        createdAt: event.createdAt,
        payload: event.payload,
      })),
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as Partial<SyncApiResponse> & {
    message?: string;
  };

  if (!response.ok) {
    throw new Error(payload.message ?? 'No se pudo sincronizar la cola offline.');
  }

  return payload as SyncApiResponse;
}

export async function syncOfflineEvents(): Promise<OfflineSyncSummary> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('No hay conexión disponible para sincronizar.');
  }

  const events = await getPendingOfflineEvents();
  if (!events.length) {
    return {
      attempted: 0,
      total: 0,
      synced: 0,
      duplicates: 0,
      failed: 0,
    };
  }

  let payload: SyncApiResponse;

  try {
    payload = await requestSync(events);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'No se pudo sincronizar la cola offline.';

    await Promise.all(
      events.map((event) =>
        markOfflineEventStatus(event.eventId, {
          status: 'FAILED',
          lastError: message,
        }),
      ),
    );

    throw error;
  }

  await Promise.all(
    payload.results.map((result) =>
      markOfflineEventStatus(result.eventId, {
        status: result.status === 'FAILED' ? 'FAILED' : 'SYNCED',
        serverRecordId: result.serverRecordId,
        lastError: result.message,
      }),
    ),
  );

  return {
    attempted: events.length,
    ...payload.summary,
  };
}
