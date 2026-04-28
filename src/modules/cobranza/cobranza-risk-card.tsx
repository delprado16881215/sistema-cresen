import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/modules/creditos/credit-calculations';
import {
  summarizeCobranzaRiskFactors,
  type CobranzaRiskSnapshot,
} from '@/server/services/cobranza-risk-engine';

function formatDisplayDate(value: string | null) {
  if (!value) return 'Sin registro';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function getLevelVariant(level: CobranzaRiskSnapshot['nivelRiesgo']) {
  if (level === 'CRITICAL') return 'destructive' as const;
  if (level === 'HIGH') return 'warning' as const;
  if (level === 'MEDIUM') return 'secondary' as const;
  return 'success' as const;
}

function getDirectionVariant(weight: number) {
  return weight > 0 ? ('warning' as const) : ('success' as const);
}

export function CobranzaRiskCard({ snapshot }: { snapshot: CobranzaRiskSnapshot }) {
  const topFactors = summarizeCobranzaRiskFactors(snapshot.factores, 5);

  return (
    <Card className="border-primary/15">
      <CardHeader>
        <CardTitle>Riesgo de cobranza</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Score total</p>
            <p className="mt-1 text-5xl font-semibold text-primary">{snapshot.scoreTotal}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Cálculo {snapshot.strategy} al {snapshot.occurredAt}
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <Badge variant={getLevelVariant(snapshot.nivelRiesgo)}>{snapshot.nivelRiesgo}</Badge>
            <Badge variant="outline">{snapshot.contexto.caseLabel}</Badge>
            <Badge variant="outline">{snapshot.contexto.technicalCycleLabel}</Badge>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Metric label="Días de atraso" value={String(snapshot.diasAtraso)} />
          <Metric label="Monto accionable" value={formatCurrency(snapshot.montoAccionable)} />
          <Metric label="Promesas incumplidas" value={String(snapshot.promesasIncumplidas)} />
          <Metric label="Visitas fallidas" value={String(snapshot.visitasFallidas)} />
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Último contacto exitoso"
            value={formatDisplayDate(snapshot.ultimoContactoExitosoAt)}
          />
          <Metric label="Última visita" value={formatDisplayDate(snapshot.ultimaVisitaAt)} />
          <Metric
            label="Teléfono inferido"
            value={
              snapshot.telefonoValidoInferido == null
                ? 'Sin inferencia'
                : snapshot.telefonoValidoInferido
                  ? 'Válido'
                  : 'Inválido'
            }
          />
          <Metric
            label="Domicilio inferido"
            value={
              snapshot.domicilioUbicadoInferido == null
                ? 'Sin inferencia'
                : snapshot.domicilioUbicadoInferido
                  ? 'Ubicado'
                  : 'No ubicado'
            }
          />
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">Factores principales</p>
          {topFactors.length ? (
            topFactors.map((factor) => (
              <div
                key={`${factor.code}-${factor.weight}`}
                className="rounded-xl border border-border/70 bg-muted/10 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{factor.code}</Badge>
                    <Badge variant={getDirectionVariant(factor.weight)}>
                      {factor.weight > 0 ? `+${factor.weight}` : factor.weight}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">{factor.direction}</span>
                </div>
                <p className="mt-3 text-sm text-foreground">{factor.reason}</p>
              </div>
            ))
          ) : (
            <p className="rounded-xl border border-dashed border-border/80 px-4 py-5 text-sm text-muted-foreground">
              No hay señales relevantes que eleven el riesgo para este crédito.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-semibold text-foreground">{value}</p>
    </div>
  );
}
