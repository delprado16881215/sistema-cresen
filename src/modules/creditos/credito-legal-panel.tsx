'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatCobranzaDate, formatCobranzaDateTime } from '@/lib/cobranza-operativa-display';
import { normalizeToIsoDate } from '@/lib/date-input';

type CreditoLegalPanelProps = {
  creditoId: string;
  canSendToLegal: boolean;
  legal: {
    status: string;
    statusLabel: string;
    isInLegalProcess: boolean;
    sentToLegalAt: string | null;
    legalStatusChangedAt: string | null;
    reason: string | null;
    notes: string | null;
    latestEvent: {
      id: string;
      eventType: string;
      effectiveDate: string;
      motivo: string;
      observaciones: string | null;
      createdAt: string;
      createdByName: string;
      summary: string;
    } | null;
    events: Array<{
      id: string;
      eventType: string;
      effectiveDate: string;
      motivo: string;
      observaciones: string | null;
      createdAt: string;
      createdByName: string;
      summary: string;
    }>;
    customerPlacementStatusLabel: string;
    customerPlacementBlockedAt: string | null;
    customerPlacementBlockReason: string | null;
    isCustomerPlacementBlocked: boolean;
    operationalHoldMessage: string | null;
  };
};

function getLegalBadgeVariant(input: CreditoLegalPanelProps['legal']) {
  if (input.isInLegalProcess) return 'destructive' as const;
  if (input.status === 'LEGAL_CLOSED') return 'secondary' as const;
  return 'outline' as const;
}

export function CreditoLegalPanel({
  creditoId,
  canSendToLegal,
  legal,
}: CreditoLegalPanelProps) {
  const router = useRouter();
  const [openForm, setOpenForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fecha, setFecha] = useState(normalizeToIsoDate(new Date()) ?? new Date().toISOString().slice(0, 10));
  const [motivo, setMotivo] = useState('');
  const [observaciones, setObservaciones] = useState('');

  const canSendAction = canSendToLegal && legal.status === 'NONE';

  async function handleSubmit() {
    setError(null);
    setSuccess(null);

    if (!fecha) {
      setError('Captura la fecha de envío a jurídico.');
      return;
    }

    if (motivo.trim().length < 3) {
      setError('Captura un motivo claro para enviar el crédito a jurídico.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`/api/creditos/${creditoId}/juridico`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha,
          motivo: motivo.trim(),
          observaciones: observaciones.trim() || null,
        }),
      });

      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(body.message ?? 'No se pudo enviar el crédito a jurídico.');
        return;
      }

      setSuccess('Crédito enviado a jurídico y cliente bloqueado para nuevas colocaciones.');
      setOpenForm(false);
      router.refresh();
    } catch {
      setError('No se pudo enviar el crédito a jurídico. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className={legal.isInLegalProcess ? 'border-red-200 bg-red-50/40' : 'border-border/70'}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Cierre jurídico</CardTitle>
            <CardDescription>
              Capa formal para excluir el crédito de la cobranza operativa sin borrar historial ni pagos.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={getLegalBadgeVariant(legal)}>{legal.statusLabel}</Badge>
            <Badge variant={legal.isCustomerPlacementBlocked ? 'destructive' : 'outline'}>
              {legal.customerPlacementStatusLabel}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {legal.operationalHoldMessage ? (
          <p className="rounded-lg border border-red-200 bg-red-100/70 px-4 py-3 text-sm text-red-900">
            {legal.operationalHoldMessage}
          </p>
        ) : null}

        {error ? <p className="rounded-lg bg-red-100 px-4 py-3 text-sm text-red-800">{error}</p> : null}
        {success ? <p className="rounded-lg bg-emerald-100 px-4 py-3 text-sm text-emerald-800">{success}</p> : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <InfoItem label="Estado jurídico" value={legal.statusLabel} />
          <InfoItem label="Enviado a jurídico" value={legal.sentToLegalAt ? formatCobranzaDate(legal.sentToLegalAt) : 'No'} />
          <InfoItem
            label="Bloqueo de colocación"
            value={legal.isCustomerPlacementBlocked ? 'Activo' : 'No bloqueado'}
          />
          <InfoItem
            label="Fecha de bloqueo"
            value={legal.customerPlacementBlockedAt ? formatCobranzaDate(legal.customerPlacementBlockedAt) : '-'}
          />
        </div>

        {legal.reason || legal.customerPlacementBlockReason ? (
          <div className="grid gap-4 md:grid-cols-2">
            <InfoItem label="Motivo jurídico" value={legal.reason ?? '-'} />
            <InfoItem label="Motivo de bloqueo" value={legal.customerPlacementBlockReason ?? '-'} />
          </div>
        ) : null}

        {legal.notes ? <InfoItem label="Observaciones" value={legal.notes} /> : null}

        {legal.latestEvent ? (
          <div className="rounded-xl border border-border/70 bg-background/80 p-4">
            <p className="text-sm font-medium text-foreground">Último evento jurídico</p>
            <p className="mt-2 text-sm text-foreground">
              {legal.latestEvent.summary}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Registró {legal.latestEvent.createdByName} el {formatCobranzaDateTime(legal.latestEvent.createdAt)}
            </p>
            {legal.latestEvent.observaciones ? (
              <p className="mt-2 text-sm text-muted-foreground">{legal.latestEvent.observaciones}</p>
            ) : null}
          </div>
        ) : null}

        {legal.events.length ? (
          <div className="rounded-xl border border-border/70 bg-background/80 p-4">
            <p className="text-sm font-medium text-foreground">Historial jurídico</p>
            <div className="mt-3 space-y-3">
              {legal.events.map((event) => (
                <div key={event.id} className="rounded-lg border border-border/60 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{event.summary}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatCobranzaDate(event.effectiveDate)} · Registró {event.createdByName} el{' '}
                        {formatCobranzaDateTime(event.createdAt)}
                      </p>
                    </div>
                    <Badge variant="outline">{event.eventType}</Badge>
                  </div>
                  {event.observaciones ? (
                    <p className="mt-2 text-sm text-muted-foreground">{event.observaciones}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {canSendAction ? (
          <div className="space-y-4 rounded-xl border border-dashed border-border/80 p-4">
            {!openForm ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Si el caso ya no es recuperable por cobranza normal, puedes enviarlo a jurídico desde aquí.
                </p>
                <Button type="button" variant="destructive" onClick={() => setOpenForm(true)}>
                  Enviar a jurídico
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Fecha</Label>
                    <Input type="date" value={fecha} onChange={(event) => setFecha(event.target.value)} disabled={loading} />
                  </div>
                  <div className="space-y-2">
                    <Label>Motivo</Label>
                    <Input
                      value={motivo}
                      onChange={(event) => setMotivo(event.target.value)}
                      placeholder="Ejemplo: agotamiento de gestión operativa"
                      disabled={loading}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Observaciones</Label>
                  <Textarea
                    value={observaciones}
                    onChange={(event) => setObservaciones(event.target.value)}
                    placeholder="Notas adicionales para trazabilidad jurídica"
                    disabled={loading}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setOpenForm(false)} disabled={loading}>
                    Cancelar
                  </Button>
                  <Button type="button" variant="destructive" onClick={handleSubmit} disabled={loading}>
                    {loading ? 'Enviando...' : 'Confirmar envío'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
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
