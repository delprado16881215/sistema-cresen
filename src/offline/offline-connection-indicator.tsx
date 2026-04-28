'use client';

import { Badge } from '@/components/ui/badge';
import { useOfflineMode } from '@/offline/offline-mode-provider';

export function OfflineConnectionIndicator() {
  const { isOfflineMode, pendingEvents, failedEvents } = useOfflineMode();

  if (isOfflineMode) {
    return (
      <Badge variant="destructive" className="gap-2">
        Modo sin conexión
        {pendingEvents > 0 ? ` · ${pendingEvents} pendientes` : ''}
        {failedEvents > 0 ? ` · ${failedEvents} fallidos` : ''}
      </Badge>
    );
  }

  return <Badge variant="success">Conectado</Badge>;
}
