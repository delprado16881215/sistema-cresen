'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  OFFLINE_QUEUE_UPDATED_EVENT,
  getOfflineQueueStats,
} from '@/offline/offline-event-queue';
import { syncOfflineEvents, type OfflineSyncSummary } from '@/offline/offline-sync-service';

type OfflineModeContextValue = {
  currentUser: {
    id: string;
    name: string | null;
  };
  isOnline: boolean;
  isOfflineMode: boolean;
  pendingEvents: number;
  failedEvents: number;
  syncState: 'idle' | 'syncing' | 'success' | 'error';
  lastSyncAt: string | null;
  lastSyncMessage: string | null;
  refreshQueueState: () => Promise<void>;
  syncNow: () => Promise<OfflineSyncSummary>;
};

const OfflineModeContext = createContext<OfflineModeContextValue | null>(null);

export function OfflineModeProvider({
  children,
  currentUser,
}: {
  children: ReactNode;
  currentUser: {
    id: string;
    name: string | null;
  };
}) {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingEvents, setPendingEvents] = useState(0);
  const [failedEvents, setFailedEvents] = useState(0);
  const [syncState, setSyncState] = useState<OfflineModeContextValue['syncState']>('idle');
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastSyncMessage, setLastSyncMessage] = useState<string | null>(null);

  const refreshQueueState = useCallback(async () => {
    const stats = await getOfflineQueueStats();
    setPendingEvents(stats.pending);
    setFailedEvents(stats.failed);
  }, []);

  const syncNow = useCallback(async () => {
    setSyncState('syncing');
    setLastSyncMessage(null);

    try {
      const summary = await syncOfflineEvents();
      setSyncState(summary.failed > 0 ? 'error' : 'success');
      setLastSyncAt(new Date().toISOString());
      setLastSyncMessage(
        summary.attempted === 0
          ? 'No hay eventos pendientes por sincronizar.'
          : summary.failed > 0
            ? `Sincronización parcial: ${summary.synced + summary.duplicates} aplicados, ${summary.failed} fallidos.`
            : `Sincronización completa: ${summary.synced + summary.duplicates} eventos aplicados.`,
      );
      await refreshQueueState();
      return summary;
    } catch (error) {
      setSyncState('error');
      setLastSyncMessage(
        error instanceof Error ? error.message : 'No se pudo sincronizar la cola offline.',
      );
      await refreshQueueState();
      throw error;
    }
  }, [refreshQueueState]);

  useEffect(() => {
    setIsOnline(window.navigator.onLine);
    void refreshQueueState();
  }, [refreshQueueState]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      void refreshQueueState();
      void syncNow().catch(() => undefined);
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    const handleQueueUpdated = () => {
      void refreshQueueState();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener(OFFLINE_QUEUE_UPDATED_EVENT, handleQueueUpdated as EventListener);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener(OFFLINE_QUEUE_UPDATED_EVENT, handleQueueUpdated as EventListener);
    };
  }, [refreshQueueState, syncNow]);

  const value = useMemo<OfflineModeContextValue>(
    () => ({
      currentUser,
      isOnline,
      isOfflineMode: !isOnline,
      pendingEvents,
      failedEvents,
      syncState,
      lastSyncAt,
      lastSyncMessage,
      refreshQueueState,
      syncNow,
    }),
    [
      currentUser,
      failedEvents,
      isOnline,
      lastSyncAt,
      lastSyncMessage,
      pendingEvents,
      refreshQueueState,
      syncNow,
      syncState,
    ],
  );

  return <OfflineModeContext.Provider value={value}>{children}</OfflineModeContext.Provider>;
}

export function useOfflineMode() {
  const context = useContext(OfflineModeContext);
  if (!context) {
    throw new Error('useOfflineMode debe usarse dentro de OfflineModeProvider.');
  }
  return context;
}
