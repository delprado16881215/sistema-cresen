'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LegalCreditStatus } from '@prisma/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatCobranzaDate, formatCobranzaDateTime } from '@/lib/cobranza-operativa-display';
import { CommunicationComposerCard } from '@/modules/comunicaciones/communication-composer-card';
import { normalizeToIsoDate } from '@/lib/date-input';
import type { JuridicoWorkbenchData } from '@/server/services/juridico-service';

type JuridicoRow = JuridicoWorkbenchData['rows'][number];

type FeedbackMessage = {
  type: 'success' | 'error';
  message: string;
};

type StatusDraft = {
  nextStatus: LegalCreditStatus | '';
  fecha: string;
  motivo: string;
  observaciones: string;
};

type NoteDraft = {
  fecha: string;
  motivo: string;
  observaciones: string;
};

type JuridicoWorkbenchProps = {
  rows: JuridicoRow[];
  canWrite: boolean;
};

function getDefaultIsoDate() {
  return normalizeToIsoDate(new Date()) ?? new Date().toISOString().slice(0, 10);
}

function getLegalBadgeVariant(status: JuridicoRow['legalStatus']) {
  if (status === 'IN_LAWSUIT') return 'destructive' as const;
  if (status === 'LEGAL_REVIEW') return 'warning' as const;
  return 'secondary' as const;
}

function getPlacementBadgeVariant(isBlocked: boolean) {
  return isBlocked ? ('destructive' as const) : ('outline' as const);
}

function getStatusDraft(row: JuridicoRow, current?: StatusDraft): StatusDraft {
  if (current) return current;

  return {
    nextStatus: row.allowedNextStatuses[0]?.code ?? '',
    fecha: getDefaultIsoDate(),
    motivo: '',
    observaciones: '',
  };
}

function getNoteDraft(current?: NoteDraft): NoteDraft {
  if (current) return current;

  return {
    fecha: getDefaultIsoDate(),
    motivo: '',
    observaciones: '',
  };
}

export function JuridicoWorkbench({ rows, canWrite }: JuridicoWorkbenchProps) {
  const router = useRouter();
  const [statusRowId, setStatusRowId] = useState<string | null>(null);
  const [noteRowId, setNoteRowId] = useState<string | null>(null);
  const [communicationRowId, setCommunicationRowId] = useState<string | null>(null);
  const [statusDrafts, setStatusDrafts] = useState<Record<string, StatusDraft>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, NoteDraft>>({});
  const [feedbackByRow, setFeedbackByRow] = useState<Record<string, FeedbackMessage>>({});
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);

  function setRowFeedback(rowId: string, feedback: FeedbackMessage | null) {
    setFeedbackByRow((current) => {
      if (!feedback) {
        const next = { ...current };
        delete next[rowId];
        return next;
      }

      return {
        ...current,
        [rowId]: feedback,
      };
    });
  }

  function updateStatusDraft(row: JuridicoRow, patch: Partial<StatusDraft>) {
    setStatusDrafts((current) => ({
      ...current,
      [row.id]: {
        ...getStatusDraft(row, current[row.id]),
        ...patch,
      },
    }));
  }

  function updateNoteDraft(rowId: string, patch: Partial<NoteDraft>) {
    setNoteDrafts((current) => ({
      ...current,
      [rowId]: {
        ...getNoteDraft(current[rowId]),
        ...patch,
      },
    }));
  }

  async function handleStatusSubmit(row: JuridicoRow) {
    const draft = getStatusDraft(row, statusDrafts[row.id]);
    setRowFeedback(row.id, null);

    if (!draft.nextStatus) {
      setRowFeedback(row.id, { type: 'error', message: 'Selecciona el siguiente estado jurídico.' });
      return;
    }

    if (draft.motivo.trim().length < 3) {
      setRowFeedback(row.id, { type: 'error', message: 'Captura un motivo claro para la transición.' });
      return;
    }

    const key = `${row.id}:status`;
    setSubmittingKey(key);

    try {
      const response = await fetch(`/api/creditos/${row.id}/juridico/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha: draft.fecha,
          nextStatus: draft.nextStatus,
          motivo: draft.motivo.trim(),
          observaciones: draft.observaciones.trim() || null,
        }),
      });
      const body = (await response.json()) as { message?: string; deduplicated?: boolean };

      if (!response.ok) {
        setRowFeedback(row.id, {
          type: 'error',
          message: body.message ?? 'No se pudo actualizar el estado jurídico.',
        });
        return;
      }

      setRowFeedback(row.id, {
        type: 'success',
        message: body.deduplicated ? 'El movimiento ya estaba registrado. Recargando bandeja...' : 'Estado jurídico actualizado. Recargando bandeja...',
      });
      setStatusRowId(null);
      await new Promise((resolve) => window.setTimeout(resolve, 300));
      router.refresh();
    } catch {
      setRowFeedback(row.id, {
        type: 'error',
        message: 'No se pudo actualizar el estado jurídico. Intenta nuevamente.',
      });
    } finally {
      setSubmittingKey(null);
    }
  }

  async function handleNoteSubmit(row: JuridicoRow) {
    const draft = getNoteDraft(noteDrafts[row.id]);
    setRowFeedback(row.id, null);

    if (draft.motivo.trim().length < 3) {
      setRowFeedback(row.id, { type: 'error', message: 'Captura un asunto claro para la nota jurídica.' });
      return;
    }

    const key = `${row.id}:note`;
    setSubmittingKey(key);

    try {
      const response = await fetch(`/api/creditos/${row.id}/juridico/nota`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha: draft.fecha,
          motivo: draft.motivo.trim(),
          observaciones: draft.observaciones.trim() || null,
        }),
      });
      const body = (await response.json()) as { message?: string; deduplicated?: boolean };

      if (!response.ok) {
        setRowFeedback(row.id, {
          type: 'error',
          message: body.message ?? 'No se pudo registrar la nota jurídica.',
        });
        return;
      }

      setRowFeedback(row.id, {
        type: 'success',
        message: body.deduplicated ? 'La nota ya estaba registrada. Recargando bandeja...' : 'Nota jurídica registrada. Recargando bandeja...',
      });
      setNoteRowId(null);
      setNoteDrafts((current) => ({
        ...current,
        [row.id]: getNoteDraft(),
      }));
      await new Promise((resolve) => window.setTimeout(resolve, 300));
      router.refresh();
    } catch {
      setRowFeedback(row.id, {
        type: 'error',
        message: 'No se pudo registrar la nota jurídica. Intenta nuevamente.',
      });
    } finally {
      setSubmittingKey(null);
    }
  }

  if (!rows.length) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No hay casos jurídicos activos con los filtros seleccionados.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {rows.map((row) => {
        const statusDraft = getStatusDraft(row, statusDrafts[row.id]);
        const noteDraft = getNoteDraft(noteDrafts[row.id]);
        const feedback = feedbackByRow[row.id] ?? null;
        const isSubmittingStatus = submittingKey === `${row.id}:status`;
        const isSubmittingNote = submittingKey === `${row.id}:note`;

        return (
          <Card key={row.id} className="border-border/70">
            <CardHeader className="gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">
                    {row.folio} · {row.loanNumber}
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {row.cliente.code} · {row.cliente.fullName}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {row.promotoria.code} · {row.promotoria.name}
                    {row.promotoria.supervisionName ? ` · ${row.promotoria.supervisionName}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={getLegalBadgeVariant(row.legalStatus)}>{row.legalStatusLabel}</Badge>
                  <Badge
                    variant={getPlacementBadgeVariant(row.cliente.placementStatus === 'BLOCKED_LEGAL')}
                  >
                    {row.cliente.placementStatusLabel}
                  </Badge>
                  {row.controlNumber ? <Badge variant="outline">Control {row.controlNumber}</Badge> : null}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {feedback ? (
                <div
                  className={
                    feedback.type === 'error'
                      ? 'rounded-lg bg-red-100 px-4 py-3 text-sm text-red-800'
                      : 'rounded-lg bg-emerald-100 px-4 py-3 text-sm text-emerald-800'
                  }
                >
                  {feedback.message}
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <InfoItem label="Enviado a jurídico" value={row.sentToLegalAt ? formatCobranzaDate(row.sentToLegalAt) : 'No'} />
                <InfoItem
                  label="Último cambio"
                  value={row.legalStatusChangedAt ? formatCobranzaDate(row.legalStatusChangedAt) : '-'}
                />
                <InfoItem label="Estado del crédito" value={row.creditStatusName} />
                <InfoItem
                  label="Bloqueo colocación"
                  value={row.cliente.placementBlockReason ?? row.cliente.placementStatusLabel}
                />
              </div>

              {row.legalStatusReason || row.legalStatusNotes ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <InfoItem label="Motivo jurídico vigente" value={row.legalStatusReason ?? '-'} />
                  <InfoItem label="Observaciones vigentes" value={row.legalStatusNotes ?? '-'} />
                </div>
              ) : null}

              {row.latestEvent ? (
                <div className="rounded-xl border border-border/70 bg-background/80 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{row.latestEvent.summary}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatCobranzaDate(row.latestEvent.effectiveDate)} · {formatCobranzaDateTime(row.latestEvent.createdAt)}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">Registró {row.latestEvent.createdByName}</p>
                  </div>
                  {row.latestEvent.observaciones ? (
                    <p className="mt-3 text-sm text-muted-foreground">{row.latestEvent.observaciones}</p>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <Button asChild variant="outline">
                  <Link href={row.links.creditHref}>Abrir crédito</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={row.links.clientHref}>Abrir cliente</Link>
                </Button>
                {canWrite && row.allowedNextStatuses.length ? (
                  <Button
                    type="button"
                    variant="accent"
                    onClick={() => {
                      setRowFeedback(row.id, null);
                      setStatusRowId((current) => (current === row.id ? null : row.id));
                      if (noteRowId === row.id) {
                        setNoteRowId(null);
                      }
                    }}
                  >
                    Actualizar estado
                  </Button>
                ) : null}
                {canWrite ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setRowFeedback(row.id, null);
                      setCommunicationRowId((current) => (current === row.id ? null : row.id));
                      if (statusRowId === row.id) {
                        setStatusRowId(null);
                      }
                      if (noteRowId === row.id) {
                        setNoteRowId(null);
                      }
                    }}
                  >
                    Enviar mensaje
                  </Button>
                ) : null}
                {canWrite ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setRowFeedback(row.id, null);
                      setNoteRowId((current) => (current === row.id ? null : row.id));
                      if (statusRowId === row.id) {
                        setStatusRowId(null);
                      }
                    }}
                  >
                    Registrar nota
                  </Button>
                ) : null}
              </div>

              {canWrite && communicationRowId === row.id ? (
                <CommunicationComposerCard
                  sourceContext="JURIDICO"
                  title="Comunicación jurídica"
                  description="Usa el mismo módulo de comunicaciones con trazabilidad explícita de contexto jurídico."
                  cliente={{
                    id: row.cliente.id,
                    code: row.cliente.code,
                    fullName: row.cliente.fullName,
                    phone: row.cliente.phone,
                    secondaryPhone: row.cliente.secondaryPhone,
                  }}
                  credito={{
                    id: row.id,
                    folio: row.folio,
                    loanNumber: row.loanNumber,
                  }}
                  canSend={canWrite}
                  compact
                  notice={`Caso en ${row.legalStatusLabel.toLowerCase()}. El envío queda marcado como comunicación jurídica.`}
                />
              ) : null}

              {canWrite && statusRowId === row.id && row.allowedNextStatuses.length ? (
                <div className="rounded-xl border border-dashed border-border/80 p-4">
                  <p className="text-sm font-medium text-foreground">Transición jurídica</p>
                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Siguiente estado</Label>
                      <Select
                        value={statusDraft.nextStatus}
                        onChange={(event) =>
                          updateStatusDraft(row, {
                            nextStatus: event.target.value as LegalCreditStatus,
                          })
                        }
                        disabled={isSubmittingStatus}
                      >
                        <option value="" disabled>
                          Selecciona un estado
                        </option>
                        {row.allowedNextStatuses.map((status) => (
                          <option key={status.code} value={status.code}>
                            {status.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Fecha</Label>
                      <Input
                        type="date"
                        value={statusDraft.fecha}
                        onChange={(event) =>
                          updateStatusDraft(row, {
                            fecha: event.target.value,
                          })
                        }
                        disabled={isSubmittingStatus}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Motivo</Label>
                      <Input
                        value={statusDraft.motivo}
                        onChange={(event) =>
                          updateStatusDraft(row, {
                            motivo: event.target.value,
                          })
                        }
                        placeholder="Ejemplo: expediente turnado al despacho"
                        disabled={isSubmittingStatus}
                      />
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    <Label>Observaciones</Label>
                    <Textarea
                      value={statusDraft.observaciones}
                      onChange={(event) =>
                        updateStatusDraft(row, {
                          observaciones: event.target.value,
                        })
                      }
                      placeholder="Notas adicionales para trazabilidad jurídica"
                      disabled={isSubmittingStatus}
                    />
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setStatusRowId(null)}
                      disabled={isSubmittingStatus}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      variant="accent"
                      onClick={() => void handleStatusSubmit(row)}
                      disabled={isSubmittingStatus}
                    >
                      {isSubmittingStatus ? 'Guardando...' : 'Guardar transición'}
                    </Button>
                  </div>
                </div>
              ) : null}

              {canWrite && noteRowId === row.id ? (
                <div className="rounded-xl border border-dashed border-border/80 p-4">
                  <p className="text-sm font-medium text-foreground">Nota jurídica</p>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Fecha</Label>
                      <Input
                        type="date"
                        value={noteDraft.fecha}
                        onChange={(event) =>
                          updateNoteDraft(row.id, {
                            fecha: event.target.value,
                          })
                        }
                        disabled={isSubmittingNote}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Asunto</Label>
                      <Input
                        value={noteDraft.motivo}
                        onChange={(event) =>
                          updateNoteDraft(row.id, {
                            motivo: event.target.value,
                          })
                        }
                        placeholder="Ejemplo: contacto con despacho"
                        disabled={isSubmittingNote}
                      />
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    <Label>Detalle</Label>
                    <Textarea
                      value={noteDraft.observaciones}
                      onChange={(event) =>
                        updateNoteDraft(row.id, {
                          observaciones: event.target.value,
                        })
                      }
                      placeholder="Notas de seguimiento jurídico"
                      disabled={isSubmittingNote}
                    />
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setNoteRowId(null)}
                      disabled={isSubmittingNote}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      variant="accent"
                      onClick={() => void handleNoteSubmit(row)}
                      disabled={isSubmittingNote}
                    >
                      {isSubmittingNote ? 'Guardando...' : 'Guardar nota'}
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/80 p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
