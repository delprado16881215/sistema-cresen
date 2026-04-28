import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CopyValueButton } from '@/modules/cobranza/copy-value-button';
import { CobranzaRecommendationCard } from '@/modules/cobranza/cobranza-recommendation-card';
import { CobranzaRiskCard } from '@/modules/cobranza/cobranza-risk-card';
import { formatCurrency } from '@/modules/creditos/credit-calculations';
import { OfflineRestrictedLinkButton } from '@/offline/offline-restricted-link-button';
import {
  formatCobranzaDate,
  formatCobranzaDateTime,
  getCobranzaOutcomeBadgeVariant,
  getCobranzaTimelineKindLabel,
  getPromesaEstadoLabel,
  getResultadoInteraccionLabel,
  getVisitaResultadoLabel,
} from '@/lib/cobranza-operativa-display';
import type { CobranzaExpedienteCorto } from '@/server/services/cobranza-expediente-service';

function buildAddress(expediente: CobranzaExpedienteCorto['customer']) {
  return [expediente.address, expediente.neighborhood, expediente.city, expediente.state]
    .filter(Boolean)
    .join(', ');
}

function buildPdfHref(expediente: CobranzaExpedienteCorto) {
  const searchParams = new URLSearchParams({
    creditoId: expediente.operativaPanel.credito.id,
    occurredAt: expediente.occurredAt,
  });

  return `/api/cobranza/expediente/pdf?${searchParams.toString()}`;
}

function getCollectionModeLabel(mode: CobranzaExpedienteCorto['header']['collectionMode']) {
  return mode === 'historical' ? 'Histórico' : 'Preview';
}

function getCollectionModeVariant(mode: CobranzaExpedienteCorto['header']['collectionMode']) {
  return mode === 'historical' ? 'success' : 'warning';
}

function getContactabilityLabel(value: CobranzaExpedienteCorto['contactability']['phoneStatus']) {
  if (value === 'VALID') return 'Válido';
  if (value === 'INVALID') return 'Inválido';
  return 'Sin inferencia';
}

function getAddressabilityLabel(value: CobranzaExpedienteCorto['contactability']['addressStatus']) {
  if (value === 'LOCATED') return 'Ubicado';
  if (value === 'NOT_LOCATED') return 'No ubicado';
  return 'Sin inferencia';
}

function getContactabilityVariant(value: 'VALID' | 'LOCATED' | 'YES' | 'INVALID' | 'NOT_LOCATED' | 'NO' | 'UNKNOWN') {
  if (value === 'VALID' || value === 'LOCATED' || value === 'YES') return 'success' as const;
  if (value === 'INVALID' || value === 'NOT_LOCATED' || value === 'NO') return 'destructive' as const;
  return 'secondary' as const;
}

export function CobranzaExpedienteCortoView({
  expediente,
  extraActions,
}: {
  expediente: CobranzaExpedienteCorto;
  extraActions?: React.ReactNode;
}) {
  const addressLabel = buildAddress(expediente.customer);
  const phoneLabel = [expediente.customer.phone, expediente.customer.secondaryPhone].filter(Boolean).join(' · ');
  const pdfHref = buildPdfHref(expediente);

  return (
    <div className="grid gap-6">
      <Card className="border-primary/15">
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{expediente.header.clientCode}</p>
              <CardTitle className="mt-1 text-2xl">{expediente.header.clientName}</CardTitle>
              <p className="mt-2 text-sm text-muted-foreground">
                {expediente.header.creditFolio} · {expediente.header.loanNumber}
                {expediente.header.controlNumber ? ` · Control ${expediente.header.controlNumber}` : ''}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge variant="secondary">{expediente.header.caseLabel}</Badge>
                <Badge variant="outline">{expediente.header.technicalCycleLabel}</Badge>
                <Badge variant={getCollectionModeVariant(expediente.header.collectionMode)}>
                  {getCollectionModeLabel(expediente.header.collectionMode)}
                </Badge>
                {expediente.legal.status !== 'NONE' ? (
                  <Badge variant={expediente.legal.isInLegalProcess ? 'destructive' : 'outline'}>
                    {expediente.legal.statusLabel}
                  </Badge>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <MiniMetric label="Apertura" value={formatCobranzaDate(expediente.header.creditOpenedAt)} />
              <MiniMetric label="Fecha operativa" value={formatCobranzaDate(expediente.occurredAt)} />
              <MiniMetric label="Promotoría" value={expediente.header.promotoriaName} />
              <MiniMetric
                label="Supervisión"
                value={expediente.header.supervisionName ?? 'Sin supervisión'}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MiniMetric label="Estado del crédito" value={expediente.header.creditStatusName} />
            <MiniMetric label="Tipo de cartera" value={expediente.header.caseLabel} />
            <MiniMetric label="Ciclo técnico" value={expediente.header.technicalCycleLabel} />
            <MiniMetric
              label="Total accionable"
              value={formatCurrency(expediente.actionable.totalAmount)}
              emphasized
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {extraActions}
            <OfflineRestrictedLinkButton
              href={expediente.links.paymentHref}
              variant="accent"
              offlineLabel="Los pagos no pueden registrarse mientras el dispositivo esté sin conexión."
            >
              Registrar pago
            </OfflineRestrictedLinkButton>
            <OfflineRestrictedLinkButton
              href={pdfHref}
              variant="outline"
              offlineLabel="La descarga del PDF requiere conexión."
            >
              Descargar PDF
            </OfflineRestrictedLinkButton>
            <Button asChild variant="outline">
              <Link href={expediente.links.creditHref}>Expediente del crédito</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={expediente.links.clientHref}>Cliente</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={expediente.links.groupHref}>Grupo operativo</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={expediente.links.saleSheetHref}>Hoja por venta</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <CardTitle>Datos principales y aval</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <InfoRow label="Cliente" value={expediente.header.clientLabel} />
            <InfoRow label="Aval" value={expediente.customer.avalLabel ?? 'Sin aval'} />
            <div className="rounded-xl border border-border/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-muted-foreground">Teléfonos</p>
                  <p className="font-medium text-foreground">{phoneLabel || 'Sin teléfono'}</p>
                </div>
                <CopyValueButton label="Copiar teléfono" value={phoneLabel || null} />
              </div>
            </div>
            <div className="rounded-xl border border-border/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-muted-foreground">Dirección</p>
                  <p className="font-medium text-foreground">
                    {addressLabel || 'Sin dirección operativa'}
                  </p>
                </div>
                <CopyValueButton label="Copiar dirección" value={addressLabel || null} />
              </div>
              {expediente.customer.betweenStreets ? (
                <p className="mt-3 text-muted-foreground">
                  Entre calles: {expediente.customer.betweenStreets}
                </p>
              ) : null}
              {expediente.customer.referencesNotes ? (
                <p className="mt-2 text-muted-foreground">
                  Referencias: {expediente.customer.referencesNotes}
                </p>
              ) : null}
              {expediente.customer.observations ? (
                <p className="mt-2 text-muted-foreground">
                  Observaciones: {expediente.customer.observations}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/15">
          <CardHeader>
            <CardTitle>Saldo accionable</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total accionable</p>
              <p className="mt-1 text-5xl font-semibold text-primary">
                {formatCurrency(expediente.actionable.totalAmount)}
              </p>
              {expediente.actionable.penaltyAmount > 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Las multas pendientes se muestran aparte para no reinterpretar el total accionable vigente.
                </p>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MiniMetric
                label="Cobranza regular"
                value={formatCurrency(expediente.actionable.regularAmount)}
              />
              <MiniMetric
                label="Recuperado pendiente"
                value={formatCurrency(expediente.actionable.recoveryAmount)}
              />
              <MiniMetric
                label="Semana 13 pendiente"
                value={formatCurrency(expediente.actionable.extraWeekAmount)}
              />
              <MiniMetric
                label="Multas pendientes"
                value={formatCurrency(expediente.actionable.penaltyAmount)}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <SupportCard title="Fallas pendientes">
                <p className="text-2xl font-semibold text-foreground">
                  {expediente.actionable.pendingFailuresCount}
                </p>
                {expediente.actionable.pendingFailuresPreview.length ? (
                  <div className="mt-3 space-y-2">
                    {expediente.actionable.pendingFailuresPreview.map((failure) => (
                      <div
                        key={failure.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2"
                      >
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            Semana {String(failure.installmentNumber).padStart(2, '0')}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatCobranzaDate(failure.dueDate)}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-primary">
                          {formatCurrency(failure.pendingAmount)}
                        </span>
                      </div>
                    ))}
                    {expediente.actionable.pendingFailuresOverflowCount > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        +{expediente.actionable.pendingFailuresOverflowCount} fallas más en el expediente.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Este caso no tiene fallas pendientes por recuperar.
                  </p>
                )}
              </SupportCard>

              <SupportCard title="Semana 13">
                {expediente.actionable.extraWeek ? (
                  <div className="space-y-2 text-sm">
                    <InfoRow label="Vencimiento" value={formatCobranzaDate(expediente.actionable.extraWeek.dueDate)} />
                    <InfoRow
                      label="Pendiente"
                      value={formatCurrency(expediente.actionable.extraWeek.pendingAmount)}
                    />
                    <InfoRow label="Estado" value={expediente.actionable.extraWeek.status} />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Este crédito no tiene semana 13 vigente.
                  </p>
                )}
              </SupportCard>

              <SupportCard title="Último pago real">
                {expediente.actionable.lastPayment ? (
                  <div className="space-y-2 text-sm">
                    <InfoRow
                      label="Fecha"
                      value={formatCobranzaDate(expediente.actionable.lastPayment.receivedAt)}
                    />
                    <InfoRow
                      label="Monto"
                      value={formatCurrency(expediente.actionable.lastPayment.amountReceived)}
                    />
                    <InfoRow label="Estado" value={expediente.actionable.lastPayment.statusName} />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Aún no hay pagos reales registrados en este crédito.
                  </p>
                )}
              </SupportCard>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <CobranzaRecommendationCard recommendation={expediente.recommendation} />
        <CobranzaRiskCard snapshot={expediente.risk} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Promesas de pago</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <MiniMetric label="Pendientes" value={String(expediente.promises.pendingCount)} />
              <MiniMetric label="Incumplidas" value={String(expediente.promises.brokenCount)} />
            </div>
            <div className="rounded-xl border border-border/70 p-4 text-sm">
              <p className="text-muted-foreground">Última promesa registrada</p>
              {expediente.promises.latestRegistered ? (
                <div className="mt-2 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={getCobranzaOutcomeBadgeVariant(expediente.promises.latestRegistered.estado)}>
                      {getPromesaEstadoLabel(expediente.promises.latestRegistered.estado)}
                    </Badge>
                    <span className="text-muted-foreground">
                      {formatCobranzaDateTime(expediente.promises.latestRegistered.createdAt)}
                    </span>
                  </div>
                  <p className="font-medium text-foreground">
                    {formatCobranzaDate(expediente.promises.latestRegistered.fechaPromesa)}
                    {expediente.promises.latestRegistered.montoPrometido != null
                      ? ` · ${formatCurrency(expediente.promises.latestRegistered.montoPrometido)}`
                      : ''}
                  </p>
                  {expediente.promises.latestRegistered.notas ? (
                    <p className="text-muted-foreground">{expediente.promises.latestRegistered.notas}</p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-muted-foreground">No hay promesas registradas para este caso.</p>
              )}
            </div>
            <CompactList
              emptyLabel="Sin promesas recientes."
              items={expediente.promises.recentItems.map((item) => ({
                id: item.id,
                primary: `${formatCobranzaDate(item.fechaPromesa)}${
                  item.montoPrometido != null ? ` · ${formatCurrency(item.montoPrometido)}` : ''
                }`,
                secondary: item.notas,
                badge: getPromesaEstadoLabel(item.estado),
                badgeVariant: getCobranzaOutcomeBadgeVariant(item.estado),
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Visitas de campo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <MiniMetric
                label="Visitas fallidas recientes"
                value={String(expediente.visits.failedRecentCount)}
              />
              <MiniMetric
                label="Última visita"
                value={
                  expediente.visits.latestVisit
                    ? formatCobranzaDateTime(expediente.visits.latestVisit.fechaHora)
                    : 'Sin visita'
                }
              />
            </div>
            <div className="rounded-xl border border-border/70 p-4 text-sm">
              <p className="text-muted-foreground">Resultado de la última visita</p>
              {expediente.visits.latestVisit ? (
                <div className="mt-2 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={getCobranzaOutcomeBadgeVariant(expediente.visits.latestVisit.resultado)}>
                      {getVisitaResultadoLabel(expediente.visits.latestVisit.resultado)}
                    </Badge>
                  </div>
                  {expediente.visits.latestVisit.direccionTexto ? (
                    <p className="font-medium text-foreground">
                      {expediente.visits.latestVisit.direccionTexto}
                    </p>
                  ) : null}
                  {expediente.visits.latestVisit.notas ? (
                    <p className="text-muted-foreground">{expediente.visits.latestVisit.notas}</p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-muted-foreground">No hay visitas registradas para este caso.</p>
              )}
            </div>
            <CompactList
              emptyLabel="Sin visitas recientes."
              items={expediente.visits.recentItems.map((item) => ({
                id: item.id,
                primary: formatCobranzaDateTime(item.fechaHora),
                secondary: item.notas ?? item.direccionTexto ?? item.referenciaLugar ?? null,
                badge: getVisitaResultadoLabel(item.resultado),
                badgeVariant: getCobranzaOutcomeBadgeVariant(item.resultado),
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contactabilidad</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              <SignalRow
                label="Teléfono"
                badge={getContactabilityLabel(expediente.contactability.phoneStatus)}
                variant={getContactabilityVariant(expediente.contactability.phoneStatus)}
              />
              <SignalRow
                label="Domicilio"
                badge={getAddressabilityLabel(expediente.contactability.addressStatus)}
                variant={getContactabilityVariant(expediente.contactability.addressStatus)}
              />
              <SignalRow
                label="Contacto reciente"
                badge={expediente.contactability.hasRecentSuccessfulContact ? 'Sí' : 'No'}
                variant={getContactabilityVariant(
                  expediente.contactability.hasRecentSuccessfulContact ? 'YES' : 'NO',
                )}
                helper={
                  expediente.contactability.lastSuccessfulContactAt
                    ? formatCobranzaDateTime(expediente.contactability.lastSuccessfulContactAt)
                    : 'Sin contacto exitoso'
                }
              />
            </div>

            <div className="rounded-xl border border-border/70 p-4 text-sm">
              <p className="font-medium text-foreground">Notas operativas recientes</p>
              {expediente.contactability.recentNotes.length ? (
                <div className="mt-3 space-y-3">
                  {expediente.contactability.recentNotes.map((note) => (
                    <div key={note.id} className="rounded-lg bg-muted/20 px-3 py-2">
                      <p className="text-xs text-muted-foreground">
                        {formatCobranzaDateTime(note.fechaHora)} · {note.createdBy.name}
                      </p>
                      <p className="mt-1 text-foreground">{note.notas}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-muted-foreground">
                  No hay notas operativas recientes en este caso.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bitácora operativa resumida</CardTitle>
        </CardHeader>
        <CardContent>
          {expediente.timeline.items.length ? (
            <div className="space-y-3">
              {expediente.timeline.items.map((item) => (
                <div key={`${item.kind}-${item.id}`} className="rounded-xl border border-border/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{getCobranzaTimelineKindLabel(item.kind)}</Badge>
                      <Badge variant={getCobranzaOutcomeBadgeVariant(item.status)}>
                        {item.kind === 'PROMESA_PAGO'
                          ? getPromesaEstadoLabel(item.status)
                          : item.kind === 'VISITA_CAMPO'
                            ? getVisitaResultadoLabel(item.status)
                            : getResultadoInteraccionLabel(item.status)}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatCobranzaDateTime(item.occurredAt)}
                      {item.userName ? ` · ${item.userName}` : ''}
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-medium text-foreground">{item.summary}</p>
                  {item.note ? <p className="mt-2 text-sm text-muted-foreground">{item.note}</p> : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border/80 px-4 py-5 text-sm text-muted-foreground">
              No hay movimientos operativos recientes para resumir en este caso.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={emphasized ? 'mt-1 text-xl font-semibold text-primary' : 'mt-1 text-base font-semibold text-foreground'}>
        {value}
      </p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

function SupportCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/10 p-4">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function CompactList({
  items,
  emptyLabel,
}: {
  items: Array<{
    id: string;
    primary: string;
    secondary: string | null;
    badge: string;
    badgeVariant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline';
  }>;
  emptyLabel: string;
}) {
  if (!items.length) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.id} className="rounded-xl border border-border/70 px-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">{item.primary}</p>
            <Badge variant={item.badgeVariant}>{item.badge}</Badge>
          </div>
          {item.secondary ? <p className="mt-2 text-sm text-muted-foreground">{item.secondary}</p> : null}
        </div>
      ))}
    </div>
  );
}

function SignalRow({
  label,
  badge,
  variant,
  helper,
}: {
  label: string;
  badge: string;
  variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline';
  helper?: string;
}) {
  return (
    <div className="rounded-xl border border-border/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <Badge variant={variant}>{badge}</Badge>
      </div>
      {helper ? <p className="mt-2 text-sm text-muted-foreground">{helper}</p> : null}
    </div>
  );
}
