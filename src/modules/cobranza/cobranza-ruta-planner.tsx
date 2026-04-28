'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  buildAppleMapsHref,
  buildGoogleMapsHref,
  buildMapNavigationQuery,
} from '@/lib/map-navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ReportMetricCard } from '@/modules/reportes/report-metric-card';
import { formatCurrency } from '@/modules/creditos/credit-calculations';
import { formatCobranzaDateTime } from '@/lib/cobranza-operativa-display';
import { OfflineRestrictedLinkButton } from '@/offline/offline-restricted-link-button';
import {
  CobranzaRutaMapPanel,
  type CobranzaRutaMapCommand,
} from '@/modules/cobranza/cobranza-ruta-map-panel';
import {
  buildCompactAddress,
  getActionVariant,
  getRiskVariant,
  getRouteLabelVariant,
  getRoutePriorityVariant,
  hasReliableRouteCoordinates,
} from '@/modules/cobranza/cobranza-ruta-ui';
import type {
  RutaCobranzaPlannerItem,
  RutaCobranzaPlannerResult,
} from '@/server/services/ruta-cobranza-planner';

function Metric({
  label,
  value,
  emphasized,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-1 font-semibold ${emphasized ? 'text-xl text-primary' : 'text-base text-foreground'}`}>
        {value}
      </p>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}

function getContactLabel(value: RutaCobranzaPlannerItem['contactability']['phoneStatus']) {
  if (value === 'VALID') return 'Aparentemente válido';
  if (value === 'INVALID') return 'Aparentemente inválido';
  return 'Sin inferencia';
}

function getAddressLabel(value: RutaCobranzaPlannerItem['contactability']['addressStatus']) {
  if (value === 'LOCATED') return 'Ubicado';
  if (value === 'NOT_LOCATED') return 'No ubicado';
  return 'Sin inferencia';
}

function getItemNavigationQuery(item: RutaCobranzaPlannerItem) {
  const rawAddress = item.addressLabel?.trim();
  const address = rawAddress && rawAddress !== 'Sin dirección operativa' ? rawAddress : null;
  return buildMapNavigationQuery([address]);
}

function ExternalMapButtons({ item }: { item: RutaCobranzaPlannerItem }) {
  const coordinates = hasReliableRouteCoordinates(item)
    ? {
        latitude: item.geo.latitude!,
        longitude: item.geo.longitude!,
      }
    : null;
  const query = getItemNavigationQuery(item);
  const googleHref = buildGoogleMapsHref({
    coordinates,
    query,
  });
  const appleHref = buildAppleMapsHref({
    coordinates,
    query,
    label: item.clienteNombre,
  });

  return (
    <>
      {googleHref ? (
        <Button asChild variant="outline" size="sm">
          <a href={googleHref} target="_blank" rel="noreferrer">
            Abrir en Google Maps
          </a>
        </Button>
      ) : (
        <Button type="button" variant="outline" size="sm" disabled>
          Abrir en Google Maps
        </Button>
      )}
      {appleHref ? (
        <Button asChild variant="outline" size="sm">
          <a href={appleHref} target="_blank" rel="noreferrer">
            Abrir en Apple Maps
          </a>
        </Button>
      ) : (
        <Button type="button" variant="outline" size="sm" disabled>
          Abrir en Apple Maps
        </Button>
      )}
    </>
  );
}

function RouteItemCard({
  item,
  showOrder,
  onOpenCase,
  onFocusMap,
  isSelected,
  registerItemRef,
}: {
  item: RutaCobranzaPlannerItem;
  showOrder: boolean;
  onOpenCase?: ((item: RutaCobranzaPlannerItem) => void) | undefined;
  onFocusMap?: ((item: RutaCobranzaPlannerItem) => void) | undefined;
  isSelected?: boolean;
  registerItemRef?: ((creditoId: string, element: HTMLDivElement | null) => void) | undefined;
}) {
  const isPendingGeo = !hasReliableRouteCoordinates(item);

  const handleFocusMap = useCallback(() => {
    onFocusMap?.(item);
  }, [item, onFocusMap]);

  return (
    <div
      ref={(element) => registerItemRef?.(item.creditoId, element)}
      role={onFocusMap ? 'button' : undefined}
      tabIndex={onFocusMap ? 0 : undefined}
      onClick={onFocusMap ? handleFocusMap : undefined}
      onKeyDown={
        onFocusMap
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleFocusMap();
              }
            }
          : undefined
      }
      className={cn(
        'rounded-2xl border bg-background p-4 text-left transition',
        isSelected ? 'border-primary/50 ring-2 ring-primary/15' : 'border-border/70',
        onFocusMap ? 'hover:border-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring' : '',
      )}
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {showOrder && item.routeOrder ? (
              <Badge variant="outline">#{String(item.routeOrder).padStart(2, '0')}</Badge>
            ) : null}
            <Badge variant={getRouteLabelVariant(item.routeLabel.code)}>{item.routeLabel.label}</Badge>
            <Badge variant={getRoutePriorityVariant(item.routePriority.code)}>
              Prioridad {item.routePriority.label}
            </Badge>
            <Badge variant={getRiskVariant(item.risk.nivelRiesgo)}>
              Riesgo {item.risk.nivelRiesgo}
            </Badge>
            {isPendingGeo ? <Badge variant="outline">Pendiente geográfico</Badge> : null}
          </div>

          <div>
            <p className="text-lg font-semibold text-foreground">{item.clienteNombre}</p>
            <p className="text-sm text-muted-foreground">
              {item.clienteCodigo} · {item.creditFolio} · {item.loanNumber}
              {item.controlNumber ? ` · Control ${item.controlNumber}` : ''}
            </p>
          </div>

          <div className="space-y-1 text-sm">
            <p className="text-foreground">{buildCompactAddress(item)}</p>
            <p className="text-muted-foreground">
              {item.zoneLabel} · {item.promotoriaName}
              {item.supervisionName ? ` · ${item.supervisionName}` : ''}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant={getActionVariant(item.suggestedAction.code)}>
              {item.suggestedAction.label}
            </Badge>
            {item.signals.slice(0, 3).map((signal) => (
              <Badge key={signal} variant="outline">
                {signal}
              </Badge>
            ))}
          </div>
        </div>

        <div className="grid min-w-[260px] gap-3 md:grid-cols-2 xl:grid-cols-1">
          <Metric label="Total accionable" value={formatCurrency(item.actionable.totalAmount)} emphasized />
          <Metric label="Score de ruta" value={String(item.routePriorityScore)} />
          <Metric label="Score de riesgo" value={String(item.risk.scoreTotal)} />
          <Metric label="Días de atraso" value={String(item.risk.diasAtraso)} />
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-border/70 bg-muted/10 p-4">
          <p className="text-sm font-medium text-foreground">Motivo principal</p>
          <p className="mt-2 text-sm text-foreground">{item.mainReason}</p>
          <p className="mt-3 text-xs text-muted-foreground">{item.inclusionReason}</p>
          {isPendingGeo ? (
            <p className="mt-3 text-xs text-amber-700">
              Este caso permanece en la lista operativa, pero no aparece en el mapa porque no tiene
              coordenadas GPS confiables de visita.
            </p>
          ) : null}
        </div>

        <div className="rounded-xl border border-border/70 bg-muted/10 p-4">
          <p className="text-sm font-medium text-foreground">Señales rápidas</p>
          <dl className="mt-3 space-y-2 text-sm">
            <MetaRow label="Teléfono" value={getContactLabel(item.contactability.phoneStatus)} />
            <MetaRow label="Domicilio" value={getAddressLabel(item.contactability.addressStatus)} />
            <MetaRow
              label="Contacto exitoso"
              value={
                item.contactability.lastSuccessfulContactAt
                  ? formatCobranzaDateTime(item.contactability.lastSuccessfulContactAt)
                  : 'Sin registro'
              }
            />
          </dl>
        </div>
      </div>

      <div
        className="mt-4 flex flex-wrap gap-2"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        {onOpenCase ? (
          <Button variant="accent" size="sm" onClick={() => onOpenCase(item)}>
            Abrir expediente
          </Button>
        ) : (
          <Button asChild variant="accent" size="sm">
            <Link href={item.cobranzaHref}>Abrir expediente</Link>
          </Button>
        )}
        <ExternalMapButtons item={item} />
        <OfflineRestrictedLinkButton
          href={item.links.paymentHref}
          variant="outline"
          size="sm"
          offlineLabel="Los pagos permanecen bloqueados en modo sin conexión."
        >
          Registrar pago
        </OfflineRestrictedLinkButton>
        <Button asChild variant="outline" size="sm">
          <Link href={item.links.groupHref}>Grupo operativo</Link>
        </Button>
      </div>
    </div>
  );
}

export function CobranzaRutaPlannerView({
  plan,
  onOpenCase,
}: {
  plan: RutaCobranzaPlannerResult;
  onOpenCase?: ((item: RutaCobranzaPlannerItem) => void) | undefined;
}) {
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const [selectedItemId, setSelectedItemId] = useState<string | null>(plan.items[0]?.creditoId ?? null);
  const [mapCommand, setMapCommand] = useState<CobranzaRutaMapCommand | null>(null);

  useEffect(() => {
    setSelectedItemId(plan.items[0]?.creditoId ?? null);
    setMapCommand(null);
  }, [plan.items]);

  const pendingGeoItems = useMemo(
    () => plan.items.filter((item) => !hasReliableRouteCoordinates(item)),
    [plan.items],
  );

  const registerItemRef = useCallback((creditoId: string, element: HTMLDivElement | null) => {
    if (element) {
      itemRefs.current.set(creditoId, element);
      return;
    }
    itemRefs.current.delete(creditoId);
  }, []);

  const scrollToItem = useCallback((creditoId: string) => {
    itemRefs.current.get(creditoId)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }, []);

  const focusItemFromMap = useCallback(
    (item: RutaCobranzaPlannerItem) => {
      setSelectedItemId(item.creditoId);
      scrollToItem(item.creditoId);
    },
    [scrollToItem],
  );

  const focusMapFromItem = useCallback((item: RutaCobranzaPlannerItem) => {
    setSelectedItemId(item.creditoId);

    if (!hasReliableRouteCoordinates(item)) {
      return;
    }

    setMapCommand({
      type: 'item',
      itemId: item.creditoId,
      nonce: Date.now(),
    });
  }, []);

  const focusZoneOnMap = useCallback(
    (zoneKey: string) => {
      const zoneGroup = plan.groups.find((group) => group.zoneKey === zoneKey) ?? null;
      const firstItem = zoneGroup?.items[0] ?? null;

      if (firstItem) {
        setSelectedItemId(firstItem.creditoId);
        scrollToItem(firstItem.creditoId);
      }

      setMapCommand({
        type: 'zone',
        zoneKey,
        nonce: Date.now(),
      });
    },
    [plan.groups, scrollToItem],
  );

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <ReportMetricCard
          label="Casos sugeridos"
          value={String(plan.summary.totalSuggestedCases)}
          helper={`${plan.summary.optionalCases} opcionales`}
        />
        <ReportMetricCard
          label="Total accionable"
          value={formatCurrency(plan.summary.totalActionableAmount)}
          helper="Ruta sugerida del día"
        />
        <ReportMetricCard
          label="Casos críticos"
          value={String(plan.summary.criticalCases)}
          helper="Riesgo CRITICAL"
        />
        <ReportMetricCard
          label="Zonas cubiertas"
          value={String(plan.summary.zonesCovered)}
          helper="Agrupación textual v1"
        />
        <ReportMetricCard
          label="Modo"
          value={plan.filters.mode === 'urgent' ? 'Urgencia' : plan.filters.mode === 'verification' ? 'Verificación' : 'Balanceada'}
          helper={`Límite ${plan.filters.limit} casos`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Resumen de la ruta</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-xl border border-border/70 bg-muted/10 p-4">
            <p className="text-sm font-medium text-foreground">Casos por etiqueta</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {plan.summary.byLabel.length ? (
                plan.summary.byLabel.map((item) => (
                  <Badge key={item.code} variant={getRouteLabelVariant(item.code)}>
                    {item.label}: {item.cases}
                  </Badge>
                ))
              ) : (
                <Badge variant="outline">Sin casos sugeridos</Badge>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/10 p-4">
            <p className="text-sm font-medium text-foreground">Zonas cubiertas</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {plan.summary.zones.length ? (
                plan.summary.zones.map((zone) => (
                  <button
                    key={zone.key}
                    type="button"
                    onClick={() => focusZoneOnMap(zone.key)}
                    className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Badge variant="outline">
                      {zone.label}: {zone.cases}
                    </Badge>
                  </button>
                ))
              ) : (
                <Badge variant="outline">Sin zonas sugeridas</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.95fr)]">
        <div className="space-y-6">
          {plan.groups.length ? (
            <div className="grid gap-6">
              {plan.groups.map((group) => (
                <Card key={group.zoneKey}>
                  <CardHeader>
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                      <div>
                        <CardTitle>{group.zoneLabel}</CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {group.suggestedCases} casos sugeridos · {formatCurrency(group.totalActionableAmount)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => focusZoneOnMap(group.zoneKey)}
                      >
                        Ver zona en mapa
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {group.items.map((item) => (
                      <RouteItemCard
                        key={item.creditoId}
                        item={item}
                        showOrder
                        onOpenCase={onOpenCase}
                        onFocusMap={focusMapFromItem}
                        isSelected={selectedItemId === item.creditoId}
                        registerItemRef={registerItemRef}
                      />
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No hay casos sugeridos para visita con los filtros actuales. Ajusta fecha, zona o modo
                de ruta para revisar más cartera.
              </CardContent>
            </Card>
          )}

          {plan.optionalItems.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Opcionales o fuera de ruta por ahora</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {plan.optionalItems.map((item) => (
                  <div
                    key={`${item.creditoId}-${item.routePriorityScore}`}
                    className="rounded-xl border border-border/70 bg-muted/10 p-4"
                  >
                    <div className="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
                      <div>
                        <p className="font-medium text-foreground">
                          {item.clienteNombre} · {item.creditFolio}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {item.zoneLabel} · {formatCurrency(item.actionable.totalAmount)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={getRouteLabelVariant(item.routeLabel.code)}>{item.routeLabel.label}</Badge>
                        <Badge variant="outline">Score {item.routePriorityScore}</Badge>
                      </div>
                    </div>
                    <p className="mt-3 text-sm text-foreground">{item.inclusionReason}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <CobranzaRutaMapPanel
            plan={plan}
            selectedItemId={selectedItemId}
            command={mapCommand}
            onSelectItem={focusItemFromMap}
          />

          {pendingGeoItems.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Pendientes geográficos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Estos casos siguen en la lista operativa actual, pero no generan marcador porque no
                  tienen una visita con GPS confiable en Fase A.
                </p>
                {pendingGeoItems.map((item) => (
                  <button
                    key={item.creditoId}
                    type="button"
                    onClick={() => {
                      setSelectedItemId(item.creditoId);
                      scrollToItem(item.creditoId);
                    }}
                    className="flex w-full items-start justify-between gap-3 rounded-xl border border-border/70 bg-muted/10 px-4 py-3 text-left transition hover:border-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div>
                      <p className="font-medium text-foreground">{item.clienteNombre}</p>
                      <p className="text-sm text-muted-foreground">{buildCompactAddress(item)}</p>
                    </div>
                    <Badge variant="outline">{item.routeLabel.label}</Badge>
                  </button>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
