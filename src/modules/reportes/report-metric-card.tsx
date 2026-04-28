import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function ReportMetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold text-primary">{value}</div>
        {helper ? <p className="mt-1 text-xs text-muted-foreground">{helper}</p> : null}
      </CardContent>
    </Card>
  );
}
