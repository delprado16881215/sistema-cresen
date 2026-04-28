import { PERMISSIONS } from '@/config/permissions';
import { requirePermission } from '@/lib/rbac';
import { normalizeToIsoDate } from '@/lib/date-input';
import { PageHeader } from '@/components/layout/page-header';
import { CobranzaRutasOfflineShell } from '@/modules/cobranza/cobranza-rutas-offline-shell';
import {
  getRutaCobranzaPlan,
  type RutaCobranzaPlannerMode,
} from '@/server/services/ruta-cobranza-planner';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const MODE_OPTIONS: Array<{ value: RutaCobranzaPlannerMode; label: string }> = [
  { value: 'balanced', label: 'Balanceada' },
  { value: 'urgent', label: 'Urgencia' },
  { value: 'verification', label: 'Verificación' },
];

function getDefaultDate() {
  return normalizeToIsoDate(new Date()) ?? new Date().toISOString().slice(0, 10);
}

function parseMode(value: string | undefined): RutaCobranzaPlannerMode {
  return MODE_OPTIONS.some((option) => option.value === value)
    ? (value as RutaCobranzaPlannerMode)
    : 'balanced';
}

function parseLimit(value: string | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 24;
  return Math.min(Math.max(Math.trunc(parsed), 1), 40);
}

export default async function CobranzaRutasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requirePermission(PERMISSIONS.PAGOS_READ);

  const raw = await searchParams;
  const occurredAt =
    normalizeToIsoDate(typeof raw.occurredAt === 'string' ? raw.occurredAt : undefined) ?? getDefaultDate();
  const supervisionId =
    typeof raw.supervisionId === 'string' && raw.supervisionId.trim()
      ? raw.supervisionId
      : undefined;
  const promotoriaId =
    typeof raw.promotoriaId === 'string' && raw.promotoriaId.trim()
      ? raw.promotoriaId
      : undefined;
  const zone = typeof raw.zone === 'string' && raw.zone.trim() ? raw.zone : undefined;
  const mode = parseMode(typeof raw.mode === 'string' ? raw.mode : undefined);
  const limit = parseLimit(typeof raw.limit === 'string' ? raw.limit : undefined);

  const plan = await getRutaCobranzaPlan({
    occurredAt,
    supervisionId,
    promotoriaId,
    zone,
    limit,
    mode,
  });

  return (
    <section>
      <PageHeader
        title="Rutas inteligentes de cobranza"
        description="Planeación táctica diaria de visitas de campo con prioridad explicable, saldo accionable real y agrupación geográfica textual."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Cobranza', href: `/cobranza?occurredAt=${plan.filters.occurredAt}` },
          { label: 'Rutas' },
        ]}
      />

      <CobranzaRutasOfflineShell initialPlan={plan} />
    </section>
  );
}
