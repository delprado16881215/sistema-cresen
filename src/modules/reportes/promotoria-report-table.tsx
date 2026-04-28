import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency } from '@/modules/creditos/credit-calculations';

export type PromotoriaReportRow = {
  promotoriaId: string;
  promotoriaCode: string;
  promotoriaName: string;
  supervisionName: string | null;
  mode: 'preview' | 'historical';
  creditRows: number;
  deTotal: number;
  failureAmount: number;
  recoveryAmount: number;
  incomingAdvanceAmount: number;
  outgoingAdvanceAmount: number;
  extraWeekCollectedAmount: number;
  recoveryPendingAmount: number;
  extraWeekPendingAmount: number;
  totalToDeliver: number;
  finalCashAmount: number;
  finalClosureRows: number;
  recoveryOnlyRows: number;
  extraWeekOnlyRows: number;
};

function formatSpecialRows(row: Pick<
  PromotoriaReportRow,
  'finalClosureRows' | 'recoveryOnlyRows' | 'extraWeekOnlyRows'
>) {
  const parts = [
    row.finalClosureRows ? `Cierre ${row.finalClosureRows}` : null,
    row.recoveryOnlyRows ? `Solo recuperado ${row.recoveryOnlyRows}` : null,
    row.extraWeekOnlyRows ? `Solo semana 13 ${row.extraWeekOnlyRows}` : null,
  ].filter(Boolean);

  return parts.length ? parts.join(' · ') : 'Sin filas especiales';
}

export function PromotoriaReportTable({ rows }: { rows: PromotoriaReportRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Promotoría</TableHead>
          <TableHead>Supervisión</TableHead>
          <TableHead>Modo</TableHead>
          <TableHead>Filas</TableHead>
          <TableHead>DE</TableHead>
          <TableHead>Fallas hist.</TableHead>
          <TableHead>Recuperado hist.</TableHead>
          <TableHead>Adel. ent.</TableHead>
          <TableHead>Adel. sal.</TableHead>
          <TableHead>Semana 13 hist.</TableHead>
          <TableHead>Recup. pendiente</TableHead>
          <TableHead>Semana 13 pendiente</TableHead>
          <TableHead>Entrega</TableHead>
          <TableHead>Caja final</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length ? (
          rows.map((row) => (
            <TableRow key={row.promotoriaId}>
              <TableCell>
                <div className="font-medium text-primary">{row.promotoriaName}</div>
                <div className="text-xs text-muted-foreground">{row.promotoriaCode}</div>
                <div className="text-xs text-muted-foreground">{formatSpecialRows(row)}</div>
              </TableCell>
              <TableCell>{row.supervisionName ?? 'Sin supervisión'}</TableCell>
              <TableCell>
                <Badge variant={row.mode === 'historical' ? 'success' : 'warning'}>
                  {row.mode === 'historical' ? 'Histórico' : 'Preview'}
                </Badge>
              </TableCell>
              <TableCell>{row.creditRows}</TableCell>
              <TableCell>{formatCurrency(row.deTotal)}</TableCell>
              <TableCell>{formatCurrency(row.failureAmount)}</TableCell>
              <TableCell>{formatCurrency(row.recoveryAmount)}</TableCell>
              <TableCell>{formatCurrency(row.incomingAdvanceAmount)}</TableCell>
              <TableCell>{formatCurrency(row.outgoingAdvanceAmount)}</TableCell>
              <TableCell>{formatCurrency(row.extraWeekCollectedAmount)}</TableCell>
              <TableCell>{formatCurrency(row.recoveryPendingAmount)}</TableCell>
              <TableCell>{formatCurrency(row.extraWeekPendingAmount)}</TableCell>
              <TableCell className="font-medium text-primary">{formatCurrency(row.totalToDeliver)}</TableCell>
              <TableCell className="font-medium">{formatCurrency(row.finalCashAmount)}</TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={14} className="h-24 text-center text-muted-foreground">
              No hay datos operativos para la fecha y el alcance seleccionados.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
