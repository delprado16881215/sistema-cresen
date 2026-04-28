'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  formatCobranzaDateTime,
  getExpedienteAlertaSeveridadLabel,
  getExpedienteAlertaStatusLabel,
  getExpedienteAlertaTipoLabel,
} from '@/lib/cobranza-operativa-display';
import type { ExpedienteAlertaItem } from '@/server/services/expediente-alert-engine';

function getSeverityVariant(severidad: ExpedienteAlertaItem['severidad']) {
  if (severidad === 'CRITICAL') return 'destructive' as const;
  if (severidad === 'HIGH') return 'warning' as const;
  if (severidad === 'MEDIUM') return 'secondary' as const;
  return 'outline' as const;
}

function getStatusVariant(status: ExpedienteAlertaItem['status']) {
  if (status === 'OPEN') return 'destructive' as const;
  if (status === 'CONFIRMED_PATTERN') return 'warning' as const;
  if (status === 'REVIEWED') return 'secondary' as const;
  return 'outline' as const;
}

function getAlertScopeLabel(alert: ExpedienteAlertaItem) {
  return alert.creditoId ? 'Originada por crédito' : 'Nivel cliente';
}

function buildEvidenceSummary(alert: ExpedienteAlertaItem) {
  const evidence = alert.evidencia;

  if (alert.tipoAlerta === 'SHARED_PHONE') {
    return `${String(evidence.telefonoMasked ?? evidence.telefono ?? 'Sin teléfono')} · ${String(
      evidence.totalClientes ?? 0,
    )} clientes`;
  }
  if (alert.tipoAlerta === 'SHARED_ADDRESS') {
    return `${String(evidence.totalClientes ?? 0)} clientes · ${String(
      evidence.direccion ?? 'Sin dirección',
    )}`;
  }
  if (alert.tipoAlerta === 'SHARED_GUARANTOR') {
    return `${String(evidence.totalCreditos ?? 0)} créditos vinculados al mismo aval`;
  }
  if (alert.tipoAlerta === 'CLIENT_GUARANTOR_SAME_PHONE') {
    const phones = Array.isArray(evidence.telefonosCoincidentes)
      ? evidence.telefonosCoincidentes
          .map((item) =>
            typeof item === 'object' && item && 'telefonoMasked' in item
              ? String(item.telefonoMasked)
              : null,
          )
          .filter(Boolean)
      : [];
    return phones.length ? phones.join(' · ') : 'Cliente y aval comparten teléfono';
  }
  if (alert.tipoAlerta === 'EARLY_CONTACT_FAILURE') {
    return `Edad ${String(evidence.creditAgeDays ?? 0)} días · ${String(
      evidence.failedContactAttemptsEarlyCount ?? 0,
    )} intentos fallidos`;
  }
  if (alert.tipoAlerta === 'ADDRESS_NOT_LOCATED_EARLY') {
    return `${String(evidence.failedVisitsEarlyCount ?? 0)} visitas fallidas tempranas`;
  }
  if (alert.tipoAlerta === 'CLUSTERED_RISK_BY_PROMOTORIA') {
    return `${String(evidence.casosSospechosos ?? 0)} casos sospechosos de ${String(
      evidence.totalCasos ?? 0,
    )}`;
  }
  if (alert.tipoAlerta === 'EXPEDIENTE_DEBIL') {
    const signals = Array.isArray(evidence.signalCodes)
      ? evidence.signalCodes.map((signal) => String(signal)).slice(0, 3)
      : [];
    return signals.length ? signals.join(' · ') : 'Varias señales de expediente débil';
  }

  return 'Evidencia operativa disponible';
}

export function CobranzaAlertasCard({
  alerts,
  detailHref,
  title = 'Alertas de revisión',
  description = 'Señales operativas explicables. No implican fraude confirmado ni ejecutan acciones automáticas.',
  emptyMessage = 'No hay alertas activas de revisión para este caso.',
  showScopeBadge = false,
  creditoDetailHrefBase,
  renderActions,
}: {
  alerts: ExpedienteAlertaItem[];
  detailHref?: string;
  title?: string;
  description?: string;
  emptyMessage?: string;
  showScopeBadge?: boolean;
  creditoDetailHrefBase?: string;
  renderActions?: (alert: ExpedienteAlertaItem) => ReactNode;
}) {
  return (
    <Card className="border-primary/15">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>{title}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {detailHref ? (
          <Button asChild variant="outline" size="sm">
            <Link href={detailHref}>Ver alertas</Link>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {alerts.length ? (
          alerts.map((alert) => (
            <div key={alert.id} className="rounded-xl border border-border/70 bg-muted/10 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={getSeverityVariant(alert.severidad)}>
                      {getExpedienteAlertaSeveridadLabel(alert.severidad)}
                    </Badge>
                    <Badge variant="outline">{getExpedienteAlertaTipoLabel(alert.tipoAlerta)}</Badge>
                    <Badge variant={getStatusVariant(alert.status)}>
                      {getExpedienteAlertaStatusLabel(alert.status)}
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm font-medium text-foreground">{alert.descripcion}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Detectada {formatCobranzaDateTime(alert.detectedAt)}
                </p>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{buildEvidenceSummary(alert)}</p>
              {alert.reviewedBy || alert.reviewedAt ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Revisó {alert.reviewedBy?.name ?? 'Usuario'} el {formatCobranzaDateTime(alert.reviewedAt)}
                </p>
              ) : null}
              {alert.reviewNotes ? (
                <p className="mt-2 text-xs text-muted-foreground">Revisión: {alert.reviewNotes}</p>
              ) : null}
              {renderActions ? (
                renderActions(alert)
              ) : showScopeBadge || (creditoDetailHrefBase && alert.credito) ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {showScopeBadge ? (
                    <Badge variant={alert.creditoId ? 'secondary' : 'outline'}>
                      {getAlertScopeLabel(alert)}
                    </Badge>
                  ) : null}
                  {creditoDetailHrefBase && alert.credito ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`${creditoDetailHrefBase}/${alert.credito.id}`}>
                        Ver expediente del crédito
                      </Link>
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-border/80 px-4 py-5 text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
