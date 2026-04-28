'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CobranzaAlertasCard } from '@/modules/cobranza/cobranza-alertas-card';
import type { ExpedienteAlertaItem } from '@/server/services/expediente-alert-engine';

type ApiErrorResponse = {
  message?: string;
};

type CobranzaAlertasPanelProps = {
  alerts: ExpedienteAlertaItem[];
  canReview?: boolean;
  title?: string;
  description?: string;
  emptyMessage?: string;
};

async function requestJson<T>(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as T & ApiErrorResponse;

  if (!response.ok) {
    throw new Error(payload.message ?? 'No se pudo completar la operación.');
  }

  return payload;
}

function buildNotesState(alerts: ExpedienteAlertaItem[]) {
  return Object.fromEntries(alerts.map((alert) => [alert.id, alert.reviewNotes ?? '']));
}

export function CobranzaAlertasPanel({
  alerts,
  canReview = false,
  title,
  description,
  emptyMessage,
}: CobranzaAlertasPanelProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [updatingAlertId, setUpdatingAlertId] = useState<string | null>(null);
  const [notesByAlertId, setNotesByAlertId] = useState<Record<string, string>>(() => buildNotesState(alerts));
  const [, startTransition] = useTransition();

  useEffect(() => {
    setNotesByAlertId(buildNotesState(alerts));
  }, [alerts]);

  const updateAlert = (alert: ExpedienteAlertaItem, status: ExpedienteAlertaItem['status']) => {
    setError(null);
    setSuccess(null);
    setUpdatingAlertId(alert.id);

    startTransition(async () => {
      try {
        await requestJson(`/api/cobranza/alertas/${alert.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            status,
            reviewNotes: notesByAlertId[alert.id]?.trim() || null,
          }),
        });

        setSuccess('La alerta se actualizó correctamente.');
        router.refresh();
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'No se pudo actualizar la alerta.',
        );
      } finally {
        setUpdatingAlertId(null);
      }
    });
  };

  return (
    <div className="grid gap-4">
      {error ? <Message tone="error">{error}</Message> : null}
      {success ? <Message tone="success">{success}</Message> : null}

      <CobranzaAlertasCard
        alerts={alerts}
        title={title}
        description={description}
        emptyMessage={emptyMessage}
        renderActions={
          canReview
            ? (alert) => {
                const isUpdating = updatingAlertId === alert.id;

                return (
                  <div className="mt-4 space-y-3 border-t border-border/60 pt-4">
                    <Textarea
                      value={notesByAlertId[alert.id] ?? ''}
                      onChange={(event) =>
                        setNotesByAlertId((current) => ({
                          ...current,
                          [alert.id]: event.target.value,
                        }))
                      }
                      placeholder="Notas de revisión, contexto operativo o criterios para confirmar/descartar."
                    />

                    <div className="flex flex-wrap gap-2">
                      {alert.status !== 'OPEN' ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={isUpdating}
                          onClick={() => updateAlert(alert, 'OPEN')}
                        >
                          {isUpdating ? 'Actualizando...' : 'Reabrir'}
                        </Button>
                      ) : null}

                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={isUpdating}
                        onClick={() => updateAlert(alert, 'REVIEWED')}
                      >
                        {isUpdating ? 'Actualizando...' : 'Marcar revisada'}
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant="accent"
                        disabled={isUpdating}
                        onClick={() => updateAlert(alert, 'CONFIRMED_PATTERN')}
                      >
                        {isUpdating ? 'Actualizando...' : 'Confirmar patrón'}
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isUpdating}
                        onClick={() => updateAlert(alert, 'DISMISSED')}
                      >
                        {isUpdating ? 'Actualizando...' : 'Descartar'}
                      </Button>
                    </div>
                  </div>
                );
              }
            : undefined
        }
      />
    </div>
  );
}

function Message({
  tone,
  children,
}: {
  tone: 'error' | 'success';
  children: React.ReactNode;
}) {
  return (
    <p
      className={
        tone === 'error'
          ? 'rounded-md bg-red-50 px-3 py-2 text-sm text-red-700'
          : 'rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700'
      }
    >
      {children}
    </p>
  );
}
