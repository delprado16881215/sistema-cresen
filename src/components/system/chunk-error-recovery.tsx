'use client';

import { useEffect } from 'react';

const RECOVERY_STORAGE_KEY = 'cresen:chunk-error-recovery';
const RECOVERABLE_PATTERNS = [
  'ChunkLoadError',
  'Loading chunk',
  'Loading CSS chunk',
  '_next/static/chunks',
  'Failed to fetch dynamically imported module',
];

function isRecoverableChunkError(message: string) {
  return RECOVERABLE_PATTERNS.some((pattern) => message.includes(pattern));
}

export function ChunkErrorRecovery() {
  useEffect(() => {
    const routeKey = `${RECOVERY_STORAGE_KEY}:${window.location.pathname}`;
    const clearRecoveryFlag = () => {
      window.sessionStorage.removeItem(routeKey);
    };

    const recover = (message: string) => {
      if (!isRecoverableChunkError(message)) return;
      if (window.sessionStorage.getItem(routeKey) === '1') return;
      window.sessionStorage.setItem(routeKey, '1');
      window.location.reload();
    };

    const handleError = (event: ErrorEvent) => {
      recover(event.message ?? event.error?.message ?? '');
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason =
        typeof event.reason === 'string'
          ? event.reason
          : event.reason instanceof Error
            ? event.reason.message
            : '';
      recover(reason);
    };

    const timer = window.setTimeout(clearRecoveryFlag, 3_000);
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  return null;
}
