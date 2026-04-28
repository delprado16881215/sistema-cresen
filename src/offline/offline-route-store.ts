import type {
  RutaCobranzaPlannerItem,
  RutaCobranzaPlannerResult,
} from '@/server/services/ruta-cobranza-planner';
import {
  getOfflineRecord,
  listOfflineRecords,
  putOfflineRecord,
} from '@/offline/offline-storage';

export type OfflineRouteCase = {
  clienteId: string;
  creditoId: string;
  nombre: string;
  telefono: string | null;
  direccion: string;
  colonia: string | null;
  montoAccionable: number;
  tipoCartera: string;
  riesgoScore: number;
  accionSugerida: string;
};

export type OfflineRouteRecord = {
  routeId: string;
  fechaOperativa: string;
  downloadedAt: string;
  availableOffline: true;
  filters: RutaCobranzaPlannerResult['filters'];
  cachedCaseIds: string[];
  cases: OfflineRouteCase[];
  planSnapshot: RutaCobranzaPlannerResult;
};

function sanitizeRouteToken(value: string | null | undefined) {
  return value && value.trim() ? value.trim() : 'all';
}

export function buildOfflineRouteId(filters: RutaCobranzaPlannerResult['filters']) {
  return [
    filters.occurredAt,
    filters.mode,
    sanitizeRouteToken(filters.supervisionId),
    sanitizeRouteToken(filters.promotoriaId),
    sanitizeRouteToken(filters.zone),
    String(filters.limit),
  ].join('::');
}

function mapPlannerItemToOfflineCase(item: RutaCobranzaPlannerItem): OfflineRouteCase {
  return {
    clienteId: item.clienteId,
    creditoId: item.creditoId,
    nombre: item.clienteNombre,
    telefono: item.telefono,
    direccion: item.addressLabel || 'Sin dirección operativa',
    colonia: item.zoneLabel || null,
    montoAccionable: item.actionable.totalAmount,
    tipoCartera: item.caseLabel,
    riesgoScore: item.risk.scoreTotal,
    accionSugerida: item.suggestedAction.label,
  };
}

export async function saveOfflineRoute(
  plan: RutaCobranzaPlannerResult,
  options?: {
    cachedCaseIds?: string[];
  },
) {
  const routeId = buildOfflineRouteId(plan.filters);
  const record: OfflineRouteRecord = {
    routeId,
    fechaOperativa: plan.filters.occurredAt,
    downloadedAt: new Date().toISOString(),
    availableOffline: true,
    filters: plan.filters,
    cachedCaseIds: options?.cachedCaseIds ?? [],
    cases: plan.items.map(mapPlannerItemToOfflineCase),
    planSnapshot: plan,
  };

  await putOfflineRecord('routes', routeId, record);
  return record;
}

export async function getOfflineRoute(routeId: string) {
  return getOfflineRecord<OfflineRouteRecord>('routes', routeId);
}

export async function listOfflineRoutes() {
  const routes = await listOfflineRecords<OfflineRouteRecord>('routes');
  return [...routes].sort((left, right) => right.downloadedAt.localeCompare(left.downloadedAt));
}

export async function isRouteAvailableOffline(routeId: string) {
  const route = await getOfflineRoute(routeId);
  return Boolean(route?.availableOffline);
}
