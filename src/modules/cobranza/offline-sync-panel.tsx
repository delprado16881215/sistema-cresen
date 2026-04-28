'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  OFFLINE_QUEUE_UPDATED_EVENT,
  listOfflineEvents,
  listOfflineEventsByContext,
  type OfflineQueueEvent,
} from '@/offline/offline-event-queue';
import { useOfflineMode } from '@/offline/offline-mode-provider';

function getEventTypeLabel(type: OfflineQueueEvent['type']) {
  if (type === 'INTERACTION') return 'Interacción';
  if (type === 'PROMESA') return 'Promesa';
  return 'Visita';
}

function getStatusVariant(status: OfflineQueueEvent['status']) {
  if (status === 'FAILED') return 'destructive' as const;
  if (status === 'SYNCED') return 'success' as const;
  return 'warning' as const;
}

export function OfflineSyncPanel({
  clienteId,
  creditoId,
}: {
  clienteId?: string;
  creditoId?: string | null;
}) {
  const {
    isOfflineMode,
    syncNow,
    syncState,
    lastSyncAt,
    lastSyncMessage,
  } = useOfflineMode();
  const [events, setEvents] = useState<OfflineQueueEvent[]>([]);

  const loadEvents = useCallback(async () => {
    const rows =
      clienteId != null
        ? await listOfflineEventsByContext({ clienteId, creditoId: creditoId ?? null })
        : await listOfflineEvents();
    setEvents(rows.filter((event) => event.status !== 'SYNCED'));
  }, [clienteId, creditoId]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents, lastSyncAt]);

  useEffect(() => {
    const handleQueueUpdated = () => {
      void loadEvents();
    };

    window.addEventListener(OFFLINE_QUEUE_UPDATED_EVENT, handleQueueUpdated as EventListener);
    return () => {
      window.removeEventListener(OFFLINE_QUEUE_UPDATED_EVENT, handleQueueUpdated as EventListener);
    };
  }, [loadEvents]);

  return (
    <Card className="border-primary/15">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Sincronización offline</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            La captura operativa se guarda primero en local y se sincroniza por eventos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={isOfflineMode ? 'destructive' : 'success'}>
            {isOfflineMode ? 'Sin conexión' : 'Listo para sincronizar'}
          </Badge>
          <Button
            type="button"
            variant="accent"
            size="sm"
            disabled={isOfflineMode || syncState === 'syncing' || events.length === 0}
            onClick={() => {
              void syncNow();
            }}
          >
            {syncState === 'syncing' ? 'Sincronizando...' : 'Sincronizar'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {lastSyncMessage ? (
          <p className="rounded-md bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            {lastSyncMessage}
          </p>
        ) : null}

        {events.length ? (
          <div className="space-y-2">
            {events.map((event) => (
              <div key={event.eventId} className="rounded-xl border border-border/70 px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{getEventTypeLabel(event.type)}</Badge>
                    <Badge variant={getStatusVariant(event.status)}>{event.status}</Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(event.createdAt).toLocaleString('es-MX')}
                  </span>
                </div>
                {event.lastError ? (
                  <p className="mt-2 text-sm text-destructive">{event.lastError}</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No hay eventos pendientes en esta cola.
          </p>
        )}

        {isOfflineMode ? (
          <p className="text-xs text-muted-foreground">
            Los pagos y cambios financieros permanecen bloqueados sin conexión. Las interacciones,
            promesas y visitas quedarán en cola para enviarse después.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
