'use client';

import 'maplibre-gl/dist/maplibre-gl.css';

import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { type LngLatBoundsLike, type StyleSpecification } from 'maplibre-gl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  buildAppleMapsHref,
  buildGoogleMapsHref,
  buildMapNavigationQuery,
  type MapCoordinates,
} from '@/lib/map-navigation';
import { formatCurrency } from '@/modules/creditos/credit-calculations';
import {
  buildCompactAddress,
  getPriorityShortLabel,
  getRiskMapColor,
  getRouteLabelMapColor,
  hasReliableRouteCoordinates,
} from '@/modules/cobranza/cobranza-ruta-ui';
import type {
  RutaCobranzaPlannerGroup,
  RutaCobranzaPlannerItem,
  RutaCobranzaPlannerResult,
} from '@/server/services/ruta-cobranza-planner';

const DEFAULT_CENTER: [number, number] = [-102.5528, 23.6345];
const DEFAULT_ZOOM = 4.6;

const DEFAULT_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: [process.env.NEXT_PUBLIC_COBRANZA_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors',
    },
  },
  layers: [
    {
      id: 'osm',
      type: 'raster',
      source: 'osm',
    },
  ],
};

export type CobranzaRutaMapCommand =
  | { type: 'item'; itemId: string; nonce: number }
  | { type: 'zone'; zoneKey: string; nonce: number };

function getMapStyle(): string | StyleSpecification {
  return process.env.NEXT_PUBLIC_COBRANZA_MAP_STYLE_URL || DEFAULT_STYLE;
}

function getItemCoordinates(item: RutaCobranzaPlannerItem): MapCoordinates | null {
  if (!hasReliableRouteCoordinates(item)) return null;

  return {
    latitude: item.geo.latitude!,
    longitude: item.geo.longitude!,
  };
}

function getItemNavigationQuery(item: RutaCobranzaPlannerItem) {
  const rawAddress = item.addressLabel?.trim();
  const address = rawAddress && rawAddress !== 'Sin dirección operativa' ? rawAddress : null;
  return buildMapNavigationQuery([address]);
}

function createMetricRow(label: string, value: string) {
  const row = document.createElement('div');
  row.className = 'flex items-start justify-between gap-3 text-sm';

  const title = document.createElement('span');
  title.className = 'text-slate-500';
  title.textContent = label;

  const content = document.createElement('span');
  content.className = 'text-right font-medium text-slate-900';
  content.textContent = value;

  row.append(title, content);
  return row;
}

function createPopupLink(input: {
  label: string;
  href: string;
  external?: boolean;
  variant?: 'accent' | 'outline';
}) {
  const anchor = document.createElement('a');
  anchor.className = cn(
    buttonVariants({
      variant: input.variant ?? 'outline',
      size: 'sm',
    }),
    'min-w-fit no-underline',
  );
  anchor.textContent = input.label;
  anchor.href = input.href;

  if (input.external) {
    anchor.target = '_blank';
    anchor.rel = 'noreferrer';
  }

  return anchor;
}

function buildPopupContent(item: RutaCobranzaPlannerItem) {
  const wrapper = document.createElement('div');
  wrapper.className = 'w-[280px] space-y-3';

  const heading = document.createElement('div');
  heading.className = 'space-y-1';

  const title = document.createElement('p');
  title.className = 'text-sm font-semibold text-slate-900';
  title.textContent = item.clienteNombre;

  const subtitle = document.createElement('p');
  subtitle.className = 'text-xs text-slate-500';
  subtitle.textContent = item.creditFolio || item.loanNumber;

  heading.append(title, subtitle);

  const address = document.createElement('p');
  address.className = 'text-sm text-slate-700';
  address.textContent = buildCompactAddress(item);

  const metrics = document.createElement('div');
  metrics.className = 'space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3';
  metrics.append(
    createMetricRow('Monto accionable', formatCurrency(item.actionable.totalAmount)),
    createMetricRow('Score de riesgo', String(item.risk.scoreTotal)),
    createMetricRow('Acción sugerida', item.suggestedAction.label),
  );

  const actions = document.createElement('div');
  actions.className = 'flex flex-wrap gap-2';

  actions.append(
    createPopupLink({
      label: 'Abrir expediente',
      href: item.cobranzaHref,
      variant: 'accent',
    }),
  );

  const coordinates = getItemCoordinates(item);
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

  if (googleHref) {
    actions.append(
      createPopupLink({
        label: 'Abrir en Google Maps',
        href: googleHref,
        external: true,
      }),
    );
  }

  if (appleHref) {
    actions.append(
      createPopupLink({
        label: 'Abrir en Apple Maps',
        href: appleHref,
        external: true,
      }),
    );
  }

  wrapper.append(heading, address, metrics, actions);
  return wrapper;
}

function createMarkerElement(item: RutaCobranzaPlannerItem, isSelected: boolean) {
  const marker = document.createElement('button');
  marker.type = 'button';
  marker.className = 'cobranza-map-marker';
  marker.style.background = getRouteLabelMapColor(item.routeLabel.code);
  marker.style.borderColor = isSelected ? '#0f172a' : '#ffffff';
  marker.style.boxShadow = isSelected
    ? '0 0 0 3px rgba(15, 23, 42, 0.2)'
    : '0 8px 20px rgba(15, 23, 42, 0.18)';

  const label = document.createElement('span');
  label.className = 'cobranza-map-marker__label';
  label.textContent = item.routeOrder ? String(item.routeOrder) : item.clienteNombre.slice(0, 1).toUpperCase();

  const chip = document.createElement('span');
  chip.className = 'cobranza-map-marker__chip';
  chip.style.background = getRiskMapColor(item.risk.nivelRiesgo);
  chip.textContent = getPriorityShortLabel(item.routePriority.code);

  marker.append(label, chip);
  return marker;
}

function getBoundsFromItems(items: RutaCobranzaPlannerItem[]) {
  const coordinates = items
    .map(getItemCoordinates)
    .filter((item): item is MapCoordinates => item != null);

  if (!coordinates.length) return null;
  const firstCoordinate = coordinates[0];
  if (!firstCoordinate) return null;

  const bounds = new maplibregl.LngLatBounds(
    [firstCoordinate.longitude, firstCoordinate.latitude],
    [firstCoordinate.longitude, firstCoordinate.latitude],
  );

  for (const coordinate of coordinates.slice(1)) {
    bounds.extend([coordinate.longitude, coordinate.latitude]);
  }

  return bounds as LngLatBoundsLike;
}

function fitMapToItems(map: maplibregl.Map, items: RutaCobranzaPlannerItem[]) {
  const bounds = getBoundsFromItems(items);
  if (!bounds) return false;

  if (items.length === 1) {
    const firstItem = items[0];
    if (!firstItem) return false;
    const coordinate = getItemCoordinates(firstItem);
    if (!coordinate) return false;
    map.flyTo({
      center: [coordinate.longitude, coordinate.latitude],
      zoom: 14.8,
      essential: true,
    });
    return true;
  }

  map.fitBounds(bounds, {
    padding: 48,
    maxZoom: 15,
    duration: 900,
  });
  return true;
}

function findGroupByZoneKey(groups: RutaCobranzaPlannerGroup[], zoneKey: string) {
  return groups.find((group) => group.zoneKey === zoneKey) ?? null;
}

export function CobranzaRutaMapPanel({
  plan,
  selectedItemId,
  command,
  onSelectItem,
}: {
  plan: RutaCobranzaPlannerResult;
  selectedItemId: string | null;
  command: CobranzaRutaMapCommand | null;
  onSelectItem: (item: RutaCobranzaPlannerItem) => void;
}) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const initialBoundsAppliedRef = useRef(false);
  const onSelectItemRef = useRef(onSelectItem);
  const [isMapReady, setIsMapReady] = useState(false);

  const mappableItems = useMemo(
    () => plan.items.filter((item) => hasReliableRouteCoordinates(item)),
    [plan.items],
  );
  const mappableIds = useMemo(
    () => mappableItems.map((item) => item.creditoId).join('::'),
    [mappableItems],
  );

  useEffect(() => {
    onSelectItemRef.current = onSelectItem;
  }, [onSelectItem]);

  useEffect(() => {
    initialBoundsAppliedRef.current = false;
  }, [mappableIds, plan.filters.occurredAt, plan.filters.mode, plan.filters.zone]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: getMapStyle(),
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    const handleLoad = () => {
      setIsMapReady(true);
      map.resize();
    };

    if (map.loaded()) {
      handleLoad();
    } else {
      map.on('load', handleLoad);
    }

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            map.resize();
          });

    resizeObserver?.observe(mapContainerRef.current);
    mapRef.current = map;

    return () => {
      resizeObserver?.disconnect();
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
      setIsMapReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    for (const item of mappableItems) {
      const coordinates = getItemCoordinates(item);
      if (!coordinates) continue;

      const markerElement = createMarkerElement(item, item.creditoId === selectedItemId);
      const popup = new maplibregl.Popup({
        offset: 20,
        closeButton: true,
        className: 'cobranza-map-popup',
      }).setDOMContent(buildPopupContent(item));

      markerElement.addEventListener('click', () => {
        onSelectItemRef.current(item);
      });

      const marker = new maplibregl.Marker({
        element: markerElement,
        anchor: 'bottom',
      })
        .setLngLat([coordinates.longitude, coordinates.latitude])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
    }

    if (!initialBoundsAppliedRef.current) {
      const didFit = fitMapToItems(map, mappableItems);
      initialBoundsAppliedRef.current = didFit;
    }
  }, [isMapReady, mappableItems, selectedItemId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady || !command) return;

    if (command.type === 'item') {
      const item = plan.items.find((entry) => entry.creditoId === command.itemId);
      const coordinates = item ? getItemCoordinates(item) : null;
      if (!coordinates) return;

      map.flyTo({
        center: [coordinates.longitude, coordinates.latitude],
        zoom: Math.max(map.getZoom(), 14.8),
        essential: true,
      });
      return;
    }

    const group = findGroupByZoneKey(plan.groups, command.zoneKey);
    if (!group) return;
    fitMapToItems(map, group.items);
  }, [command, isMapReady, plan.groups, plan.items]);

  const selectedItem = plan.items.find((item) => item.creditoId === selectedItemId) ?? null;

  return (
    <Card className="xl:sticky xl:top-6">
      <CardHeader>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Mapa visual de la ruta</CardTitle>
            <Badge variant="outline">
              {mappableItems.length}/{plan.items.length} con GPS
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Esta capa solo proyecta el plan actual. No recalcula la ruta ni inventa coordenadas.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <div
            ref={mapContainerRef}
            className="min-h-[380px] overflow-hidden rounded-xl border border-border/70"
          />
          {!mappableItems.length ? (
            <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-background/88 px-4 text-center text-sm text-muted-foreground backdrop-blur-[1px]">
              Ningún caso sugerido tiene coordenadas confiables de visita en esta ruta.
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="destructive">Cobro crítico</Badge>
          <Badge variant="warning">Verificación / difícil</Badge>
          <Badge variant="secondary">Seguimiento promesa</Badge>
          <Badge variant="success">Cobro rápido</Badge>
        </div>

        <div className="rounded-xl border border-border/70 bg-muted/10 p-4 text-sm">
          <p className="font-medium text-foreground">
            Estrategia geo: primero se usa la referencia persistida del caso o cliente; si aún no
            existe, se cae al GPS de visitas históricas. Si no hay ninguna coordenada confiable, el
            caso queda pendiente geográfico y no se marca.
          </p>
          {selectedItem ? (
            <p className="mt-2 text-muted-foreground">
              Caso activo: <span className="font-medium text-foreground">{selectedItem.clienteNombre}</span>
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
