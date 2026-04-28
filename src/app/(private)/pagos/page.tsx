import { PERMISSIONS } from '@/config/permissions';
import { requirePermission } from '@/lib/rbac';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { findActivePromotoriasForCobranza, findPromotoriaWeeklyCollection, type PromotoriaWeeklyCollectionResult } from '@/server/repositories/pago-repository';
import { listPagosSchema } from '@/server/validators/pago';
import { PagosGrupoForm } from '@/modules/pagos/pagos-grupo-form';
import { normalizeToIsoDate } from '@/lib/date-input';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function PagosPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission(PERMISSIONS.PAGOS_READ);

  const raw = await searchParams;
  const rawOccurredAt = typeof raw.occurredAt === 'string' ? raw.occurredAt : undefined;
  const normalizedOccurredAt =
    rawOccurredAt && rawOccurredAt.trim() ? normalizeToIsoDate(rawOccurredAt) ?? undefined : undefined;
  const parsed = listPagosSchema.parse({
    promotoriaId: typeof raw.promotoriaId === 'string' ? raw.promotoriaId : undefined,
    occurredAt: normalizedOccurredAt,
    scope: typeof raw.scope === 'string' ? raw.scope : undefined,
  });

  const promotorias = await findActivePromotoriasForCobranza();
  const selectedPromotoriaId = parsed.promotoriaId ?? promotorias[0]?.id;
  const occurredAt = parsed.occurredAt ?? new Date().toISOString().slice(0, 10);
  const scope = parsed.scope ?? 'active';
  const collection: PromotoriaWeeklyCollectionResult = selectedPromotoriaId
    ? await findPromotoriaWeeklyCollection(selectedPromotoriaId, {
        occurredAt,
        scope,
        legalView: 'group_payments',
      })
    : { mode: 'preview' as const, rows: [], groupCount: 0, liquidation: null };
  const rows = collection.rows;
  const selectedPromotoria = promotorias.find((promotoria) => promotoria.id === selectedPromotoriaId) ?? null;

  return (
    <section>
      <PageHeader
        title="Pagos grupales"
        description="Cobranza por promotora y semana, con DE, fallas, recuperados, adelantos y semana extra separados como en la hoja operativa."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Pagos' }]}
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Seleccionar grupo de cobranza</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-[1fr_220px_220px_auto] md:items-end">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Promotoría</label>
              <Select name="promotoriaId" defaultValue={selectedPromotoriaId}>
                {promotorias.map((promotoria) => (
                  <option key={promotoria.id} value={promotoria.id}>
                    {promotoria.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Fecha de cobranza</label>
              <Input type="date" name="occurredAt" defaultValue={occurredAt} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Cartera a mostrar</label>
              <Select name="scope" defaultValue={scope}>
                <option value="active">Solo activos</option>
                <option value="active_with_extra_week">Activos con SE</option>
                <option value="overdue">Vencidos</option>
                <option value="all">Todos</option>
              </Select>
            </div>
            <Button type="submit" variant="secondary">
              Cargar grupo
            </Button>
          </form>

          {selectedPromotoria ? (
            <div className="mt-4 rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">{selectedPromotoria.name}</p>
              <p>{selectedPromotoria.supervision?.name ?? 'Sin supervisión'} · {collection.mode === 'historical' ? 'Modo histórico: se muestra exactamente lo ocurrido en la fecha seleccionada.' : 'Modo preview: se muestra lo que se impactaría si todavía no hay movimientos en esa fecha.'} El resumen replica: DE - Falla + Recuperado + Adelanto entrante - Adelanto saliente + Semana extra.</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {selectedPromotoriaId ? (
        <PagosGrupoForm
          promotoriaId={selectedPromotoriaId}
          occurredAt={occurredAt}
          scope={scope}
          rows={rows}
          groupCount={collection.groupCount}
          mode={collection.mode}
          liquidation={collection.liquidation}
        />
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Selecciona una promotoría para cargar su grupo semanal de cobranza.
          </CardContent>
        </Card>
      )}
    </section>
  );
}
