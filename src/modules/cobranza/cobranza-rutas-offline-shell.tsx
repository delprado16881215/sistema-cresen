'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CobranzaCaseOfflineShell } from '@/modules/cobranza/cobranza-case-offline-shell';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { CobranzaRutaPlannerView } from '@/modules/cobranza/cobranza-ruta-planner';
import {
  getOfflineCaseSnapshot,
  saveOfflineCaseSnapshot,
} from '@/offline/offline-case-store';
import { useOfflineMode } from '@/offline/offline-mode-provider';
import {
  buildOfflineRouteId,
  getOfflineRoute,
  saveOfflineRoute,
} from '@/offline/offline-route-store';
import { OfflineRestrictedLinkButton } from '@/offline/offline-restricted-link-button';
import type {
  RutaCobranzaPlannerItem,
  RutaCobranzaPlannerMode,
  RutaCobranzaPlannerResult,
} from '@/server/services/ruta-cobranza-planner';
import type { CobranzaExpedienteCorto } from '@/server/services/cobranza-expediente-service';

const MODE_OPTIONS: Array<{ value: RutaCobranzaPlannerMode; label: string }> = [
  { value: 'balanced', label: 'Balanceada' },
  { value: 'urgent', label: 'Urgencia' },
  { value: 'verification', label: 'Verificación' },
];

type RouteFiltersState = RutaCobranzaPlannerResult['filters'];

function createSearchParams(filters: RouteFiltersState) {
  const searchParams = new URLSearchParams();
  searchParams.set('occurredAt', filters.occurredAt);
  searchParams.set('mode', filters.mode);
  searchParams.set('limit', String(filters.limit));

  if (filters.supervisionId) searchParams.set('supervisionId', filters.supervisionId);
  if (filters.promotoriaId) searchParams.set('promotoriaId', filters.promotoriaId);
  if (filters.zone) searchParams.set('zone', filters.zone);

  return searchParams.toString();
}

function appendReturnToHref(targetHref: string, returnToHref: string) {
  const url = new URL(targetHref, 'http://localhost');
  url.searchParams.set('returnTo', returnToHref);
  const query = url.searchParams.toString();
  return query ? `${url.pathname}?${query}` : url.pathname;
}

type OfflineSnapshotsResponse = {
  rows: Array<{
    creditoId: string;
    expediente: NonNullable<unknown>;
  }>;
  message?: string;
};

type RouteBulkExportFormat = 'zip' | 'pdf';

const ROUTE_BULK_EXPORT_OPTIONS: Array<{ value: RouteBulkExportFormat; label: string }> = [
  { value: 'pdf', label: 'PDF consolidado' },
  { value: 'zip', label: 'ZIP por crédito' },
];

function getRouteModeLabel(mode: RutaCobranzaPlannerMode) {
  if (mode === 'urgent') return 'Urgencia';
  if (mode === 'verification') return 'Verificación';
  return 'Balanceada';
}

function buildRouteDocumentLabel(plan: RutaCobranzaPlannerResult) {
  const supervisionName =
    plan.options.supervision.find((option) => option.id === plan.filters.supervisionId)?.name ??
    'Todas las supervisiones';
  const promotoriaName =
    plan.options.promotoria.find((option) => option.id === plan.filters.promotoriaId)?.name ??
    'Todas las promotorías';
  const zoneLabel =
    plan.options.zones.find((option) => option.key === plan.filters.zone)?.label ??
    'Todas las zonas';

  return [
    `Ruta ${getRouteModeLabel(plan.filters.mode)}`,
    `Fecha ${plan.filters.occurredAt}`,
    `Supervisión ${supervisionName}`,
    `Promotoría ${promotoriaName}`,
    `Zona ${zoneLabel}`,
    `Límite ${plan.filters.limit}`,
  ].join(' · ');
}

function getFileNameFromDisposition(disposition: string | null) {
  if (!disposition) return null;

  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const plainMatch = disposition.match(/filename="?([^"]+)"?/i);
  return plainMatch?.[1] ?? null;
}

async function downloadResponseAsFile(response: Response, fallbackFileName: string) {
  const blob = await response.blob();
  const fileName =
    getFileNameFromDisposition(response.headers.get('Content-Disposition')) ?? fallbackFileName;
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.style.display = 'none';

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    window.URL.revokeObjectURL(objectUrl);
  }, 0);

  return fileName;
}

export function CobranzaRutasOfflineShell({ initialPlan }: { initialPlan: RutaCobranzaPlannerResult }) {
  const router = useRouter();
  const { isOfflineMode } = useOfflineMode();
  const [displayPlan, setDisplayPlan] = useState(initialPlan);
  const [filters, setFilters] = useState<RouteFiltersState>(initialPlan.filters);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isAvailableOffline, setIsAvailableOffline] = useState(false);
  const [offlineLookupMessage, setOfflineLookupMessage] = useState<string | null>(null);
  const [bulkExportFormat, setBulkExportFormat] = useState<RouteBulkExportFormat>('pdf');
  const [isBulkExporting, setIsBulkExporting] = useState(false);
  const [bulkExportMessage, setBulkExportMessage] = useState<string | null>(null);
  const [bulkExportError, setBulkExportError] = useState<string | null>(null);
  const [isCitatorioExporting, setIsCitatorioExporting] = useState(false);
  const [citatorioExportMessage, setCitatorioExportMessage] = useState<string | null>(null);
  const [citatorioExportError, setCitatorioExportError] = useState<string | null>(null);
  const [offlineCaseError, setOfflineCaseError] = useState<string | null>(null);
  const [selectedOfflineExpediente, setSelectedOfflineExpediente] =
    useState<CobranzaExpedienteCorto | null>(null);
  const offlineCaseRef = useRef<HTMLDivElement | null>(null);

  const selectedRouteId = useMemo(() => buildOfflineRouteId(filters), [filters]);
  const routeReturnHref = useMemo(
    () => `/cobranza/rutas?${createSearchParams(displayPlan.filters)}`,
    [displayPlan.filters],
  );
  const planWithReturnContext = useMemo<RutaCobranzaPlannerResult>(() => {
    const decorateItem = (item: RutaCobranzaPlannerItem): RutaCobranzaPlannerItem => ({
      ...item,
      cobranzaHref: appendReturnToHref(item.cobranzaHref, routeReturnHref),
    });

    return {
      ...displayPlan,
      items: displayPlan.items.map(decorateItem),
      optionalItems: displayPlan.optionalItems.map(decorateItem),
      groups: displayPlan.groups.map((group) => ({
        ...group,
        items: group.items.map(decorateItem),
      })),
    };
  }, [displayPlan, routeReturnHref]);

  const refreshAvailability = useCallback(async () => {
    const cachedRoute = await getOfflineRoute(selectedRouteId);
    setIsAvailableOffline(Boolean(cachedRoute?.availableOffline));
  }, [selectedRouteId]);

  useEffect(() => {
    setDisplayPlan(initialPlan);
    setFilters(initialPlan.filters);
    setOfflineCaseError(null);
    setSelectedOfflineExpediente(null);
  }, [initialPlan]);

  useEffect(() => {
    void refreshAvailability();
  }, [refreshAvailability]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setOfflineLookupMessage(null);

    if (isOfflineMode) {
      const cachedRoute = await getOfflineRoute(selectedRouteId);
      if (!cachedRoute) {
        setOfflineLookupMessage(
          'No hay una ruta descargada para esos filtros. Usa una ruta ya descargada o reconéctate para actualizar.',
        );
        return;
      }

      setDisplayPlan(cachedRoute.planSnapshot);
      setFilters(cachedRoute.filters);
      setIsAvailableOffline(true);
      setOfflineLookupMessage('Ruta offline cargada desde el dispositivo.');
      return;
    }

    router.push(`/cobranza/rutas?${createSearchParams(filters)}`);
  };

  const handleDownloadRoute = async () => {
    setIsDownloading(true);
    setDownloadError(null);
    setDownloadMessage(null);

    try {
      const response = await fetch('/api/cobranza/expedientes/offline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          occurredAt: planWithReturnContext.filters.occurredAt,
          creditoIds: planWithReturnContext.items.map((item) => item.creditoId),
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as Partial<OfflineSnapshotsResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? 'No se pudo descargar la ruta offline.');
      }

      const rows = (payload.rows ?? []) as Array<{
        creditoId: string;
        expediente: Parameters<typeof saveOfflineCaseSnapshot>[0];
      }>;

      await Promise.all(rows.map((row) => saveOfflineCaseSnapshot(row.expediente)));
      await saveOfflineRoute(planWithReturnContext, {
        cachedCaseIds: rows.map((row) => row.creditoId),
      });

      setIsAvailableOffline(true);
      setDownloadMessage(
        `Ruta descargada offline con ${planWithReturnContext.items.length} casos y ${rows.length} expedientes cortos.`,
      );
    } catch (error) {
      setDownloadError(
        error instanceof Error ? error.message : 'No se pudo descargar la ruta offline.',
      );
    } finally {
      setIsDownloading(false);
    }
  };

  const handleBulkExport = useCallback(async () => {
    if (isOfflineMode) {
      setBulkExportError('La exportación masiva requiere conexión.');
      setBulkExportMessage(null);
      return;
    }

    if (!planWithReturnContext.items.length) {
      setBulkExportError('La ruta actual no tiene casos sugeridos para exportar.');
      setBulkExportMessage(null);
      return;
    }

    setIsBulkExporting(true);
    setBulkExportError(null);
    setBulkExportMessage(null);

    try {
      const response = await fetch('/api/cobranza/rutas/expedientes/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          format: bulkExportFormat,
          filters: planWithReturnContext.filters,
          creditoIds: planWithReturnContext.items.map((item) => item.creditoId),
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(payload.message ?? 'No se pudieron descargar los expedientes de la ruta.');
      }

      const downloadedFileName = await downloadResponseAsFile(
        response,
        bulkExportFormat === 'pdf'
          ? 'expedientes-ruta-cobranza.pdf'
          : 'expedientes-ruta-cobranza.zip',
      );

      setBulkExportMessage(
        bulkExportFormat === 'pdf'
          ? `PDF consolidado descargado: ${downloadedFileName}.`
          : `ZIP de expedientes descargado: ${downloadedFileName}.`,
      );
    } catch (error) {
      setBulkExportError(
        error instanceof Error
          ? error.message
          : 'No se pudieron descargar los expedientes de la ruta.',
      );
    } finally {
      setIsBulkExporting(false);
    }
  }, [bulkExportFormat, isOfflineMode, planWithReturnContext.filters, planWithReturnContext.items]);

  const handleCitatorioExport = useCallback(async () => {
    if (isOfflineMode) {
      setCitatorioExportError('La generación de citatorios requiere conexión.');
      setCitatorioExportMessage(null);
      return;
    }

    if (!planWithReturnContext.items.length) {
      setCitatorioExportError('La ruta actual no tiene casos sugeridos para exportar.');
      setCitatorioExportMessage(null);
      return;
    }

    setIsCitatorioExporting(true);
    setCitatorioExportError(null);
    setCitatorioExportMessage(null);

    try {
      const response = await fetch('/api/cobranza/rutas/documentos/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentType: 'citatorio_primera_visita',
          format: 'pdf',
          routeLabel: buildRouteDocumentLabel(planWithReturnContext),
          filters: planWithReturnContext.filters,
          creditoIds: planWithReturnContext.items.map((item) => item.creditoId),
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(payload.message ?? 'No se pudieron descargar los citatorios de la ruta.');
      }

      const downloadedFileName = await downloadResponseAsFile(
        response,
        'citatorios-primera-visita-ruta-cobranza.pdf',
      );

      setCitatorioExportMessage(`PDF consolidado de citatorios descargado: ${downloadedFileName}.`);
    } catch (error) {
      setCitatorioExportError(
        error instanceof Error
          ? error.message
          : 'No se pudieron descargar los citatorios de la ruta.',
      );
    } finally {
      setIsCitatorioExporting(false);
    }
  }, [isOfflineMode, planWithReturnContext]);

  const scrollToOfflineCase = useCallback(() => {
    window.setTimeout(() => {
      offlineCaseRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 0);
  }, []);

  const handleOpenOfflineCase = useCallback(
    async (item: RutaCobranzaPlannerItem) => {
      setOfflineCaseError(null);

      if (!isOfflineMode) {
        router.push(item.cobranzaHref);
        return;
      }

      const cached = await getOfflineCaseSnapshot(item.creditoId, displayPlan.filters.occurredAt);
      if (!cached?.expediente) {
        setSelectedOfflineExpediente(null);
        setOfflineCaseError(
          'Este expediente no está descargado en el dispositivo para la fecha operativa seleccionada. Vuelve a descargar la ruta con conexión antes de salir a campo.',
        );
        scrollToOfflineCase();
        return;
      }

      setSelectedOfflineExpediente(cached.expediente);
      setOfflineCaseError(null);
      scrollToOfflineCase();
    },
    [displayPlan.filters.occurredAt, isOfflineMode, router, scrollToOfflineCase],
  );

  return (
    <>
      <Card className="mb-6">
        <CardHeader>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <CardTitle>Filtros de planeación</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                En modo sin conexión no se llaman APIs: se cargan únicamente rutas descargadas.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="accent" onClick={handleDownloadRoute} disabled={isOfflineMode || isDownloading}>
                {isDownloading ? 'Descargando...' : 'Descargar ruta offline'}
              </Button>
              <Select
                className="w-[190px]"
                value={bulkExportFormat}
                onChange={(event) =>
                  setBulkExportFormat(event.target.value as RouteBulkExportFormat)
                }
                disabled={isOfflineMode || isBulkExporting || !planWithReturnContext.items.length}
              >
                {ROUTE_BULK_EXPORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <Button
                type="button"
                variant="outline"
                className="border-sky-300 bg-sky-50 text-sky-900 hover:bg-sky-100"
                onClick={() => {
                  void handleBulkExport();
                }}
                disabled={isOfflineMode || isBulkExporting || !planWithReturnContext.items.length}
              >
                {isBulkExporting ? 'Exportando...' : 'Descargar expedientes'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                onClick={() => {
                  void handleCitatorioExport();
                }}
                disabled={isOfflineMode || isCitatorioExporting || !planWithReturnContext.items.length}
              >
                {isCitatorioExporting ? 'Generando...' : 'Descargar citatorios'}
              </Button>
              <Button asChild variant="outline">
                <Link href={`/cobranza?occurredAt=${displayPlan.filters.occurredAt}`}>Bandeja de cobranza</Link>
              </Button>
              <OfflineRestrictedLinkButton
                href="/pagos"
                variant="outline"
                offlineLabel="Los pagos grupales no están disponibles sin conexión."
              >
                Pagos grupales
              </OfflineRestrictedLinkButton>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-[180px_200px_240px_240px_240px_160px_auto] xl:items-end"
            onSubmit={(event) => {
              void handleSubmit(event);
            }}
          >
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Fecha operativa</label>
              <Input
                type="date"
                value={filters.occurredAt}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, occurredAt: event.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Modo de ruta</label>
              <Select
                value={filters.mode}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    mode: event.target.value as RutaCobranzaPlannerMode,
                  }))
                }
              >
                {MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Supervisión</label>
              <Select
                value={filters.supervisionId}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, supervisionId: event.target.value }))
                }
              >
                <option value="">Todas las supervisiones</option>
                {displayPlan.options.supervision.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Promotoría</label>
              <Select
                value={filters.promotoriaId}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, promotoriaId: event.target.value }))
                }
              >
                <option value="">Todas las promotorías</option>
                {displayPlan.options.promotoria.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Zona textual</label>
              <Select
                value={filters.zone}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, zone: event.target.value }))
                }
              >
                <option value="">Todas las zonas</option>
                {displayPlan.options.zones.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label} ({option.cases})
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Límite de casos</label>
              <Input
                type="number"
                min={1}
                max={40}
                value={String(filters.limit)}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    limit: Math.min(Math.max(Number(event.target.value) || 1, 1), 40),
                  }))
                }
              />
            </div>

            <Button type="submit" variant="accent">
              {isOfflineMode ? 'Cargar cache local' : 'Actualizar ruta'}
            </Button>
          </form>

          <div className="mt-4 rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Regla v1 de balance</p>
            <p>
              La ruta primero prioriza urgencia táctica y saldo accionable; después agrupa por zona
              textual para reducir dispersión. El mapa de esta vista solo proyecta la ruta ya
              calculada; no hace geocodificación ni optimización vial avanzada en esta fase.
            </p>
          </div>

          <div className="mt-4 space-y-2">
            {isAvailableOffline ? (
              <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                La ruta seleccionada está disponible offline en este dispositivo.
              </p>
            ) : null}
            {downloadMessage ? (
              <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {downloadMessage}
              </p>
            ) : null}
            {downloadError ? (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{downloadError}</p>
            ) : null}
            {offlineLookupMessage ? (
              <p className="rounded-md bg-secondary/30 px-3 py-2 text-sm text-muted-foreground">
                {offlineLookupMessage}
              </p>
            ) : null}
            {bulkExportMessage ? (
              <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {bulkExportMessage}
              </p>
            ) : null}
            {bulkExportError ? (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {bulkExportError}
              </p>
            ) : null}
            {citatorioExportMessage ? (
              <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {citatorioExportMessage}
              </p>
            ) : null}
            {citatorioExportError ? (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {citatorioExportError}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <CobranzaRutaPlannerView
        plan={planWithReturnContext}
        onOpenCase={isOfflineMode ? handleOpenOfflineCase : undefined}
      />

      {isOfflineMode && (selectedOfflineExpediente || offlineCaseError) ? (
        <div ref={offlineCaseRef} className="mt-6">
          <Card className="border-primary/15">
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Expediente offline</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Esta vista se abre desde el snapshot descargado en el dispositivo, sin llamar a
                    APIs.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setOfflineCaseError(null);
                    setSelectedOfflineExpediente(null);
                  }}
                >
                  Cerrar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {offlineCaseError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {offlineCaseError}
                </div>
              ) : selectedOfflineExpediente ? (
                <CobranzaCaseOfflineShell
                  initialExpediente={selectedOfflineExpediente}
                  communicationHistory={[]}
                  communicationFeatureAvailable={false}
                  canSendMessage={false}
                />
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}
