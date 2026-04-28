import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { CobranzaRecommendation } from '@/server/services/cobranza-recommendation-engine';

function getPriorityVariant(code: CobranzaRecommendation['priority']['code']) {
  if (code === 'URGENT') return 'destructive' as const;
  if (code === 'HIGH') return 'warning' as const;
  if (code === 'MEDIUM') return 'secondary' as const;
  return 'success' as const;
}

function getConfidenceVariant(code: CobranzaRecommendation['confidence']['code']) {
  if (code === 'HIGH') return 'success' as const;
  if (code === 'MEDIUM') return 'secondary' as const;
  return 'outline' as const;
}

export function CobranzaRecommendationCard({
  recommendation,
}: {
  recommendation: CobranzaRecommendation;
}) {
  return (
    <Card className="border-primary/15">
      <CardHeader>
        <CardTitle>Acción sugerida</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Acción principal</p>
            <p className="mt-1 text-3xl font-semibold text-primary">
              {recommendation.primaryAction.label}
            </p>
            <p className="mt-3 text-sm text-foreground">{recommendation.summary}</p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <Badge variant={getPriorityVariant(recommendation.priority.code)}>
              Prioridad {recommendation.priority.label}
            </Badge>
            <Badge variant={getConfidenceVariant(recommendation.confidence.code)}>
              Confianza {recommendation.confidence.label}
            </Badge>
          </div>
        </div>

        {recommendation.secondaryActions.length ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Acciones secundarias</p>
            <div className="flex flex-wrap gap-2">
              {recommendation.secondaryActions.map((item) => (
                <Badge key={item.code} variant="outline">
                  {item.label}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">Motivos principales</p>
          {recommendation.reasons.length ? (
            recommendation.reasons.map((reason) => (
              <div
                key={reason.code}
                className="rounded-xl border border-border/70 bg-muted/10 p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{reason.code}</Badge>
                </div>
                <p className="mt-3 text-sm text-foreground">{reason.reason}</p>
              </div>
            ))
          ) : (
            <p className="rounded-xl border border-dashed border-border/80 px-4 py-5 text-sm text-muted-foreground">
              No hay razones operativas suficientes para sugerir una acción distinta por ahora.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
