import type { RutaCobranzaPlannerItem } from '@/server/services/ruta-cobranza-planner';

export function getRouteLabelVariant(code: RutaCobranzaPlannerItem['routeLabel']['code']) {
  if (code === 'COBRO_CRITICO') return 'destructive' as const;
  if (code === 'VISITA_VERIFICACION' || code === 'RECUPERACION_DIFICIL') return 'warning' as const;
  if (code === 'SEGUIMIENTO_PROMESA') return 'secondary' as const;
  if (code === 'COBRO_RAPIDO') return 'success' as const;
  return 'outline' as const;
}

export function getRoutePriorityVariant(code: RutaCobranzaPlannerItem['routePriority']['code']) {
  if (code === 'URGENT') return 'destructive' as const;
  if (code === 'HIGH') return 'warning' as const;
  if (code === 'MEDIUM') return 'secondary' as const;
  return 'success' as const;
}

export function getRiskVariant(level: RutaCobranzaPlannerItem['risk']['nivelRiesgo']) {
  if (level === 'CRITICAL') return 'destructive' as const;
  if (level === 'HIGH') return 'warning' as const;
  if (level === 'MEDIUM') return 'secondary' as const;
  return 'success' as const;
}

export function getActionVariant(code: RutaCobranzaPlannerItem['suggestedAction']['code']) {
  if (code === 'PREPARE_OPERATIVE_CLOSURE') return 'destructive' as const;
  if (code === 'PROGRAM_FIELD_VISIT' || code === 'VERIFY_ADDRESS' || code === 'VERIFY_PHONE') {
    return 'warning' as const;
  }
  if (code === 'FOLLOW_UP_PROMISE') return 'secondary' as const;
  return 'outline' as const;
}

export function getRouteLabelMapColor(code: RutaCobranzaPlannerItem['routeLabel']['code']) {
  if (code === 'COBRO_CRITICO') return '#dc2626';
  if (code === 'VISITA_VERIFICACION') return '#d97706';
  if (code === 'RECUPERACION_DIFICIL') return '#f59e0b';
  if (code === 'SEGUIMIENTO_PROMESA') return '#1d4ed8';
  if (code === 'COBRO_RAPIDO') return '#059669';
  return '#64748b';
}

export function getRiskMapColor(level: RutaCobranzaPlannerItem['risk']['nivelRiesgo']) {
  if (level === 'CRITICAL') return '#b91c1c';
  if (level === 'HIGH') return '#c2410c';
  if (level === 'MEDIUM') return '#1d4ed8';
  return '#047857';
}

export function getPriorityShortLabel(code: RutaCobranzaPlannerItem['routePriority']['code']) {
  if (code === 'URGENT') return 'U';
  if (code === 'HIGH') return 'A';
  if (code === 'MEDIUM') return 'M';
  return 'B';
}

export function buildCompactAddress(item: RutaCobranzaPlannerItem) {
  return item.addressLabel || item.zoneLabel || 'Sin dirección operativa';
}

export function hasReliableRouteCoordinates(item: RutaCobranzaPlannerItem) {
  return item.geo.isReliable && item.geo.latitude != null && item.geo.longitude != null;
}
