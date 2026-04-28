import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type KpiCardProps = {
  label: string;
  value: number;
  hint: string;
};

export function KpiCard({ label, value, hint }: KpiCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold text-primary">{value.toLocaleString('es-MX')}</p>
        <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
