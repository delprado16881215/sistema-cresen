import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCobranzaDateTime } from '@/lib/cobranza-operativa-display';
import type { CommunicationLogItem } from '@/server/services/communications-service';

function getStatusVariant(status: CommunicationLogItem['status']) {
  if (status === 'SENT') return 'success' as const;
  if (status === 'FAILED') return 'destructive' as const;
  if (status === 'PENDING') return 'secondary' as const;
  return 'outline' as const;
}

export function CommunicationHistoryCard({
  title = 'Historial de comunicaciones',
  description = 'Bitácora central de mensajes enviados o intentados.',
  logs,
  emptyMessage = 'Aún no hay comunicaciones registradas en este contexto.',
}: {
  title?: string;
  description?: string;
  logs: CommunicationLogItem[];
  emptyMessage?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {logs.length ? (
          logs.map((log) => (
            <div key={log.id} className="rounded-xl border border-border/70 bg-muted/10 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={getStatusVariant(log.status)}>{log.statusLabel}</Badge>
                    <Badge variant="outline">{log.channelLabel}</Badge>
                    <Badge variant="outline">{log.typeLabel}</Badge>
                    <Badge variant="secondary">{log.sourceContextLabel}</Badge>
                    {log.templateName ? <Badge variant="outline">{log.templateName}</Badge> : null}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{log.recipient}</p>
                    {log.subject ? <p className="mt-1 text-sm text-foreground">{log.subject}</p> : null}
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{log.renderedContent}</p>
                  </div>
                </div>

                <div className="text-right text-xs text-muted-foreground">
                  <p>Intento {formatCobranzaDateTime(log.attemptedAt)}</p>
                  {log.sentAt ? <p className="mt-1">Enviado {formatCobranzaDateTime(log.sentAt)}</p> : null}
                  {log.createdByName ? <p className="mt-1">Registró {log.createdByName}</p> : null}
                </div>
              </div>

              {log.credito ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Crédito relacionado: {log.credito.folio} · {log.credito.loanNumber}
                </p>
              ) : null}

              {log.errorMessage ? (
                <p className="mt-3 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800">{log.errorMessage}</p>
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
