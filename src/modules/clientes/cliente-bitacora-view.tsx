import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  formatCobranzaDate,
  formatCobranzaDateTime,
  getExpedienteAlertaTipoLabel,
  getPromesaEstadoLabel,
} from '@/lib/cobranza-operativa-display';
import { CobranzaAlertasCard } from '@/modules/cobranza/cobranza-alertas-card';
import { CommunicationComposerCard } from '@/modules/comunicaciones/communication-composer-card';
import { CommunicationHistoryCard } from '@/modules/comunicaciones/communication-history-card';
import { formatCurrency } from '@/modules/creditos/credit-calculations';
import {
  isClienteDocumentStorageKey,
  isLegacyClienteDocumentPath,
  type ClienteDocumentType,
} from '@/modules/clientes/cliente-document-utils';
import { DeactivateClienteButton } from '@/modules/clientes/deactivate-cliente-button';
import { ClienteDocumentLink } from '@/modules/clientes/cliente-document-link';
import type {
  ClienteBitacoraCreditoItem,
  ClienteBitacoraData,
  ClienteBitacoraExpedienteChangeItem,
  ClienteBitacoraPattern,
  ClienteBitacoraTimelineItem,
} from '@/server/services/cliente-bitacora-service';
import type { CommunicationLogItem } from '@/server/services/communications-service';

function getClienteStatusVariant(isActive: boolean) {
  return isActive ? ('success' as const) : ('secondary' as const);
}

function getCreditStatusVariant(code: string) {
  if (code === 'ACTIVE') return 'success' as const;
  if (code === 'COMPLETED') return 'secondary' as const;
  return 'outline' as const;
}

function getRiskVariant(item: NonNullable<ClienteBitacoraCreditoItem['risk']>['nivelRiesgo']) {
  if (item === 'CRITICAL') return 'destructive' as const;
  if (item === 'HIGH') return 'warning' as const;
  if (item === 'MEDIUM') return 'secondary' as const;
  return 'success' as const;
}

function getToneVariant(tone: ClienteBitacoraPattern['tone']) {
  return tone;
}

function getExpedienteChangeVariant(fieldKey: ClienteBitacoraExpedienteChangeItem['fieldKey']) {
  if (fieldKey === 'PHONE') return 'secondary' as const;
  if (fieldKey === 'SECONDARY_PHONE') return 'outline' as const;
  if (fieldKey === 'CLIENT_TYPE') return 'default' as const;
  return 'warning' as const;
}

function getScopeBadge(alert: ClienteBitacoraData['alerts']['activeItems'][number]) {
  return alert.creditoId ? 'Originada por crédito' : 'Nivel cliente';
}

function getPhoneLine(bitacora: ClienteBitacoraData) {
  const phones = [bitacora.cliente.phone, bitacora.cliente.secondaryPhone].filter(Boolean);
  return phones.length ? phones.join(' · ') : 'Sin teléfono registrado';
}

function getAddressLine(bitacora: ClienteBitacoraData) {
  return [bitacora.cliente.address, bitacora.cliente.locationLine].filter(Boolean).join(' · ') || 'Sin dirección registrada';
}

function getPromiseDueLabel(bitacora: ClienteBitacoraData) {
  if (!bitacora.promises.nextPending) return 'Sin promesa pendiente';
  if (bitacora.promises.nextPending.isOverdue) {
    return `Vencida hace ${Math.abs(bitacora.promises.nextPending.daysUntilDue)} días`;
  }
  if (bitacora.promises.nextPending.daysUntilDue === 0) {
    return 'Vence hoy';
  }
  return `Vence en ${bitacora.promises.nextPending.daysUntilDue} días`;
}

export function ClienteBitacoraView({
  bitacora,
  communicationHistory,
  canSendMessage,
}: {
  bitacora: ClienteBitacoraData;
  communicationHistory: CommunicationLogItem[];
  canSendMessage: boolean;
}) {
  return (
    <section className="space-y-6">
      <PageHeader
        title={bitacora.cliente.fullName}
        description={`${bitacora.cliente.code} · Bitácora transversal por cliente`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Clientes', href: '/clientes' },
          { label: bitacora.cliente.code },
        ]}
        action={
          <div className="flex gap-2">
            <Button asChild variant="secondary">
              <Link href={`/clientes/${bitacora.cliente.id}/editar`}>Editar</Link>
            </Button>
            <DeactivateClienteButton clienteId={bitacora.cliente.id} />
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="Créditos relacionados"
          value={String(bitacora.metrics.relatedCreditsCount)}
          hint={`${bitacora.credits.activeCount} activos · ${bitacora.credits.historicalCount} históricos soportados`}
        />
        <MetricTile
          label="Alertas activas"
          value={String(bitacora.metrics.activeAlertsCount)}
          hint={`${bitacora.alerts.clientScopedActiveCount} cliente · ${bitacora.alerts.creditScopedActiveCount} crédito`}
        />
        <MetricTile
          label="Promesas pendientes"
          value={String(bitacora.metrics.pendingPromisesCount)}
          hint={`${bitacora.promises.brokenCount} incumplidas acumuladas`}
        />
        <MetricTile
          label="Último contacto"
          value={formatCobranzaDateTime(bitacora.metrics.lastContactAt, 'Sin registro')}
          hint={bitacora.contactability.hasRecentSuccessfulContact ? 'Con contacto exitoso reciente' : 'Sin contacto exitoso reciente'}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
        <CommunicationComposerCard
          sourceContext="CLIENTE"
          title="Comunicaciones del cliente"
          description="Envía mensajes manuales o basados en plantilla sin alterar el flujo financiero."
          cliente={{
            id: bitacora.cliente.id,
            code: bitacora.cliente.code,
            fullName: bitacora.cliente.fullName,
            phone: bitacora.cliente.phone,
            secondaryPhone: bitacora.cliente.secondaryPhone,
          }}
          creditOptions={bitacora.credits.items.map((credito) => ({
            id: credito.id,
            label: credito.label,
          }))}
          canSend={canSendMessage}
        />
        <CommunicationHistoryCard
          logs={communicationHistory}
          emptyMessage="Aún no hay mensajes registrados para este cliente."
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr,1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Encabezado del cliente</CardTitle>
            <CardDescription>Identidad, contacto y ubicación breve para operación.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Item label="Estado operativo">
              <div className="flex flex-wrap gap-2">
                <Badge variant={getClienteStatusVariant(bitacora.cliente.isActive)}>
                  {bitacora.cliente.statusLabel}
                </Badge>
                <Badge variant={bitacora.cliente.isPlacementBlocked ? 'destructive' : 'outline'}>
                  {bitacora.cliente.placementStatusLabel}
                </Badge>
                {bitacora.cliente.clientTypeName ? <Badge variant="outline">{bitacora.cliente.clientTypeName}</Badge> : null}
              </div>
            </Item>
            <Item label="Teléfonos">{getPhoneLine(bitacora)}</Item>
            <Item label="Dirección">{bitacora.cliente.address ?? 'Sin dirección registrada'}</Item>
            <Item label="Colonia / ciudad / estado">{bitacora.cliente.locationLine}</Item>
            <Item label="Entre calles">{bitacora.cliente.betweenStreets ?? '-'}</Item>
            <Item label="Código postal">{bitacora.cliente.postalCode ?? '-'}</Item>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contexto operativo</CardTitle>
            <CardDescription>Asignación actual y referencias de apoyo del cliente.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Item label="Promotoría">{bitacora.cliente.promotoriaName ?? 'Sin asignar'}</Item>
            <Item label="Supervisión">{bitacora.cliente.supervisionName ?? 'Derivada al asignar'}</Item>
            <Item label="Colocación">
              {bitacora.cliente.isPlacementBlocked
                ? bitacora.cliente.placementBlockReason
                  ? `${bitacora.cliente.placementStatusLabel} · ${bitacora.cliente.placementBlockReason}`
                  : bitacora.cliente.placementStatusLabel
                : bitacora.cliente.placementStatusLabel}
            </Item>
            <Item label="Referencias">{bitacora.cliente.referencesNotes ?? '-'}</Item>
            <Item label="Observaciones">{bitacora.cliente.observations ?? '-'}</Item>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Créditos relacionados</CardTitle>
          <CardDescription>
            Vista operativa por crédito del mismo cliente, con score y acción sugerida solo cuando el estado actual ya está cubierto por la capa de cobranza.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {bitacora.credits.scopeNote ? (
            <p className="rounded-xl border border-dashed border-border/80 px-4 py-3 text-sm text-muted-foreground">
              {bitacora.credits.scopeNote}
            </p>
          ) : null}

          {bitacora.credits.items.length ? (
            bitacora.credits.items.map((credito) => <CreditoRow key={credito.id} credito={credito} />)
          ) : (
            <p className="rounded-xl border border-dashed border-border/80 px-4 py-5 text-sm text-muted-foreground">
              No hay créditos relacionados visibles para este cliente.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Señales acumuladas y contactabilidad</CardTitle>
            <CardDescription>Señales compactas y explicables para orientar la gestión operativa.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <StatusTile
                label="Contacto exitoso reciente"
                value={bitacora.contactability.hasRecentSuccessfulContact ? 'Sí' : 'No'}
                hint={formatCobranzaDateTime(bitacora.contactability.lastSuccessfulContactAt, 'Sin registro')}
                tone={bitacora.contactability.hasRecentSuccessfulContact ? 'success' : 'secondary'}
              />
              <StatusTile
                label="Teléfono inferido"
                value={
                  bitacora.contactability.phoneStatus === 'VALID'
                    ? 'Válido'
                    : bitacora.contactability.phoneStatus === 'INVALID'
                      ? 'Inválido'
                      : 'Sin inferencia'
                }
                hint={getPhoneLine(bitacora)}
                tone={
                  bitacora.contactability.phoneStatus === 'VALID'
                    ? 'success'
                    : bitacora.contactability.phoneStatus === 'INVALID'
                      ? 'destructive'
                      : 'outline'
                }
              />
              <StatusTile
                label="Domicilio inferido"
                value={
                  bitacora.contactability.addressStatus === 'LOCATED'
                    ? 'Ubicado'
                    : bitacora.contactability.addressStatus === 'NOT_LOCATED'
                      ? 'No ubicado'
                      : 'Sin inferencia'
                }
                hint={getAddressLine(bitacora)}
                tone={
                  bitacora.contactability.addressStatus === 'LOCATED'
                    ? 'success'
                    : bitacora.contactability.addressStatus === 'NOT_LOCATED'
                      ? 'destructive'
                      : 'outline'
                }
              />
              <StatusTile
                label="Intentos fallidos recientes"
                value={String(bitacora.contactability.unsuccessfulContactAttemptsRecentCount)}
                hint="Ventana operativa reciente"
                tone={bitacora.contactability.unsuccessfulContactAttemptsRecentCount >= 3 ? 'warning' : 'secondary'}
              />
              <StatusTile
                label="Visitas fallidas recientes"
                value={String(bitacora.contactability.failedVisitsRecentCount)}
                hint="Últimos 90 días"
                tone={bitacora.contactability.failedVisitsRecentCount >= 2 ? 'warning' : 'secondary'}
              />
              <StatusTile
                label="Último movimiento operativo"
                value={formatCobranzaDateTime(bitacora.contactability.lastOperationalContactAt, 'Sin registro')}
                hint="Última interacción o visita registrada"
                tone="outline"
              />
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">Señales acumuladas</p>
              {bitacora.patterns.length ? (
                bitacora.patterns.map((pattern) => (
                  <div key={pattern.code} className="rounded-xl border border-border/70 bg-muted/10 p-4">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={getToneVariant(pattern.tone)}>{pattern.label}</Badge>
                      <Badge variant="outline">{pattern.code}</Badge>
                    </div>
                    <p className="mt-3 text-sm text-foreground">{pattern.description}</p>
                  </div>
                ))
              ) : (
                <p className="rounded-xl border border-dashed border-border/80 px-4 py-5 text-sm text-muted-foreground">
                  No se detectan señales acumuladas dominantes para este cliente al corte actual.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Resumen de promesas</CardTitle>
            <CardDescription>Seguimiento compacto de promesas pendientes e incumplidas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3">
              <MiniMetric label="Pendientes" value={String(bitacora.promises.pendingCount)} />
              <MiniMetric label="Incumplidas acumuladas" value={String(bitacora.promises.brokenCount)} />
              <MiniMetric
                label="Última promesa registrada"
                value={formatCobranzaDateTime(bitacora.promises.latestRegistered?.createdAt ?? null, 'Sin registro')}
              />
              <MiniMetric
                label="Próxima promesa"
                value={
                  bitacora.promises.nextPending
                    ? `${formatCobranzaDate(bitacora.promises.nextPending.fechaPromesa)} · ${getPromiseDueLabel(bitacora)}`
                    : 'Sin promesa pendiente'
                }
              />
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">Listado reciente</p>
              {bitacora.promises.recentItems.length ? (
                bitacora.promises.recentItems.map((item) => (
                  <div key={item.id} className="rounded-xl border border-border/70 bg-muted/10 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={item.estado === 'BROKEN' ? 'destructive' : item.estado === 'PENDING' ? 'warning' : 'success'}>
                          {getPromesaEstadoLabel(item.estado)}
                        </Badge>
                        {item.credito ? <Badge variant="outline">{`${item.credito.folio} · ${item.credito.loanNumber}`}</Badge> : null}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Registrada {formatCobranzaDateTime(item.createdAt)}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-foreground">
                      Promesa para {formatCobranzaDate(item.fechaPromesa)}
                      {item.montoPrometido != null ? ` por ${formatCurrency(item.montoPrometido)}` : ''}
                    </p>
                    {item.notas ? <p className="mt-2 text-xs text-muted-foreground">{item.notas}</p> : null}
                  </div>
                ))
              ) : (
                <p className="rounded-xl border border-dashed border-border/80 px-4 py-5 text-sm text-muted-foreground">
                  No hay promesas registradas para este cliente.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Resumen de alertas</CardTitle>
            <CardDescription>Consumo de alertas persistidas de la Fase 6, distinguiendo cliente vs créditos relacionados.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2">
              <MiniMetric label="Activas" value={String(bitacora.alerts.activeCount)} />
              <MiniMetric label="Históricas" value={String(bitacora.alerts.historicalCount)} />
              <MiniMetric label="Nivel cliente" value={String(bitacora.alerts.clientScopedActiveCount)} />
              <MiniMetric label="Nacidas de crédito" value={String(bitacora.alerts.creditScopedActiveCount)} />
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">Alertas recientes</p>
              {bitacora.alerts.recentItems.length ? (
                bitacora.alerts.recentItems.map((alert) => (
                  <div key={alert.id} className="rounded-xl border border-border/70 bg-muted/10 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={getClienteStatusVariant(alert.isCurrent)}>{alert.isCurrent ? 'Vigente' : 'Histórica'}</Badge>
                        <Badge variant="outline">{getExpedienteAlertaTipoLabel(alert.tipoAlerta)}</Badge>
                        <Badge variant={alert.creditoId ? 'secondary' : 'outline'}>{getScopeBadge(alert)}</Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatCobranzaDateTime(alert.detectedAt)}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-foreground">{alert.descripcion}</p>
                  </div>
                ))
              ) : (
                <p className="rounded-xl border border-dashed border-border/80 px-4 py-5 text-sm text-muted-foreground">
                  No hay alertas persistidas para este cliente.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <CobranzaAlertasCard
          alerts={bitacora.alerts.activeItems}
          title="Alertas activas de revisión"
          description="Señales operativas persistidas del cliente y de sus créditos relacionados."
          emptyMessage="No hay alertas activas de revisión para este cliente."
          showScopeBadge
          creditoDetailHrefBase="/cobranza"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cambios recientes del expediente</CardTitle>
          <CardDescription>
            Cambios auditados en teléfono, domicilio y tipo de cliente, ordenados del más reciente al más antiguo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {bitacora.expedienteChanges.items.length ? (
            bitacora.expedienteChanges.items.map((item) => (
              <ExpedienteChangeRow key={item.id} item={item} />
            ))
          ) : (
            <p className="rounded-xl border border-dashed border-border/80 px-4 py-5 text-sm text-muted-foreground">
              Todavía no se detectan cambios auditados en los datos principales de este expediente.
            </p>
          )}

          {bitacora.expedienteChanges.truncated ? (
            <p className="text-xs text-muted-foreground">
              Se muestran los cambios auditados más recientes para conservar una lectura rápida del historial.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bitácora cronológica transversal</CardTitle>
          <CardDescription>
            Línea de tiempo compacta por cliente mezclando interacciones, promesas, visitas y alertas recientes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {bitacora.timeline.items.length ? (
            bitacora.timeline.items.map((item) => <TimelineRow key={`${item.kind}-${item.id}`} item={item} />)
          ) : (
            <p className="rounded-xl border border-dashed border-border/80 px-4 py-5 text-sm text-muted-foreground">
              No hay eventos operativos registrados para este cliente.
            </p>
          )}

          {bitacora.timeline.truncated ? (
            <p className="text-xs text-muted-foreground">
              La línea de tiempo muestra los eventos más recientes para mantener legibilidad operativa.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Documentación</CardTitle>
          <CardDescription>Soporte visual disponible en el expediente del cliente.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <DocumentItem
            clienteId={bitacora.cliente.id}
            documentType="ineFront"
            label="INE frente"
            filePath={bitacora.documentation.ineFrontPath}
          />
          <DocumentItem
            clienteId={bitacora.cliente.id}
            documentType="ineBack"
            label="INE reverso"
            filePath={bitacora.documentation.ineBackPath}
          />
          <DocumentItem
            clienteId={bitacora.cliente.id}
            documentType="pagareFront"
            label="Pagaré frente"
            filePath={bitacora.documentation.pagareFrontPath}
          />
          <DocumentItem
            clienteId={bitacora.cliente.id}
            documentType="pagareBack"
            label="Pagaré reverso"
            filePath={bitacora.documentation.pagareBackPath}
          />
          <DocumentItem
            clienteId={bitacora.cliente.id}
            documentType="proofOfAddress"
            label="Comprobante de domicilio"
            filePath={bitacora.documentation.proofOfAddressPath}
          />
        </CardContent>
      </Card>
    </section>
  );
}

function MetricTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card className="border-primary/10">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold text-primary">{value}</p>
        <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function StatusTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: ClienteBitacoraPattern['tone'];
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Badge variant={getToneVariant(tone)}>{value}</Badge>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-semibold text-foreground">{value}</p>
    </div>
  );
}

function CreditoRow({ credito }: { credito: ClienteBitacoraCreditoItem }) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant={getCreditStatusVariant(credito.statusCode)}>{credito.statusName}</Badge>
            <Badge variant="outline">{credito.bucketLabel}</Badge>
            <Badge variant={credito.isInLegalProcess ? 'destructive' : 'outline'}>
              {credito.legalStatusLabel}
            </Badge>
            {credito.risk ? (
              <Badge variant={getRiskVariant(credito.risk.nivelRiesgo)}>
                Riesgo {credito.risk.nivelRiesgo} · {credito.risk.scoreTotal}
              </Badge>
            ) : null}
            {credito.support === 'LIMITED' ? <Badge variant="outline">Cobertura limitada</Badge> : null}
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{credito.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Apertura {formatCobranzaDate(credito.openedAt)} · Promotoría {credito.promotoriaName}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={credito.links.creditHref}>Ver crédito</Link>
          </Button>
          <Button asChild size="sm">
            <Link href={credito.links.expedienteHref}>Ver expediente</Link>
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MiniMetric
          label="Saldo accionable"
          value={credito.actionableAmount != null ? formatCurrency(credito.actionableAmount) : 'No disponible'}
        />
        <MiniMetric
          label="Acción sugerida"
          value={credito.recommendation?.primaryActionLabel ?? 'Sin composición disponible'}
        />
        <MiniMetric
          label="Prioridad"
          value={credito.recommendation?.priorityLabel ?? 'Sin prioridad'}
        />
        <MiniMetric label="Aval" value={credito.avalLabel ?? 'Sin aval'} />
      </div>

      {credito.recommendation?.summary ? (
        <p className="mt-3 text-sm text-muted-foreground">{credito.recommendation.summary}</p>
      ) : null}
      {credito.supportNote ? <p className="mt-3 text-sm text-muted-foreground">{credito.supportNote}</p> : null}
    </div>
  );
}

function ExpedienteChangeRow({ item }: { item: ClienteBitacoraExpedienteChangeItem }) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/10 p-4">
      <div className="space-y-3">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Campo cambiado</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant={getExpedienteChangeVariant(item.fieldKey)}>{item.fieldLabel}</Badge>
            <Badge variant="outline">Auditado</Badge>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-border/70 bg-background/70 p-3">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Valor anterior</p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground">{item.previousValue}</p>
          </div>
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Valor nuevo</p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground">{item.nextValue}</p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-border/70 bg-background/70 p-3">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Fecha</p>
            <p className="mt-2 text-sm text-foreground">{formatCobranzaDateTime(item.occurredAt)}</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/70 p-3">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Usuario</p>
            <p className="mt-2 text-sm text-foreground">{item.userName ?? 'Usuario no disponible'}</p>
          </div>
        </div>

        <div className="rounded-lg border border-border/70 bg-background/70 p-3">
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Motivo</p>
          <p className="mt-2 text-sm text-muted-foreground">{item.reason}</p>
        </div>
      </div>
    </div>
  );
}

function TimelineRow({ item }: { item: ClienteBitacoraTimelineItem }) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant={item.kindTone}>{item.kindLabel}</Badge>
            <Badge variant={item.statusTone}>{item.statusLabel}</Badge>
            <Badge variant="outline">{item.scopeLabel}</Badge>
            {item.credito ? (
              <Button asChild variant="outline" size="sm">
                <Link href={item.credito.expedienteHref}>{item.credito.label}</Link>
              </Button>
            ) : null}
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{item.summary}</p>
            {item.note ? <p className="mt-2 text-sm text-muted-foreground">{item.note}</p> : null}
          </div>
        </div>

        <div className="text-right text-xs text-muted-foreground">
          <p>{formatCobranzaDateTime(item.occurredAt)}</p>
          {item.userName ? <p className="mt-1">Registró {item.userName}</p> : null}
        </div>
      </div>
    </div>
  );
}

function DocumentItem({
  clienteId,
  documentType,
  label,
  filePath,
}: {
  clienteId: string;
  documentType: ClienteDocumentType;
  label: string;
  filePath: string | null;
}) {
  const hasStorageDocument = isClienteDocumentStorageKey(filePath);
  const hasLegacyDocument = isLegacyClienteDocumentPath(filePath);

  return (
    <div className="rounded-xl border border-border/80 bg-secondary/20 p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      {hasStorageDocument ? (
        <div className="mt-3 space-y-3">
          <Badge variant="success">Cargado</Badge>
          <ClienteDocumentLink clienteId={clienteId} documentType={documentType}>
            Ver documento
          </ClienteDocumentLink>
        </div>
      ) : hasLegacyDocument ? (
        <div className="mt-3 space-y-2">
          <Badge variant="warning">Pendiente</Badge>
          <p className="text-sm text-muted-foreground">Documento pendiente de migración</p>
        </div>
      ) : filePath ? (
        <div className="mt-3 space-y-2">
          <Badge variant="secondary">No disponible</Badge>
          <p className="text-sm text-muted-foreground">La referencia del documento no es compatible.</p>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <Badge variant="secondary">No cargado</Badge>
          <p className="text-sm text-muted-foreground">No hay documento adjunto en el expediente.</p>
        </div>
      )}
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm text-foreground">{children}</div>
    </div>
  );
}
