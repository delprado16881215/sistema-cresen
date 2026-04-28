import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency } from '@/modules/creditos/credit-calculations';

export type SupervisionReportRow = {
  supervisionId: string | null;
  supervisionCode: string | null;
  supervisionName: string;
  promotorias: number;
  promotoriasHistorical: number;
  promotoriasPreview: number;
  creditRows: number;
  deTotal: number;
  failureAmount: number;
  recoveryAmount: number;
  recoveryPendingAmount: number;
  extraWeekPendingAmount: number;
  totalToDeliver: number;
  finalCashAmount: number;
};

export function SupervisionReportTable({ rows }: { rows: SupervisionReportRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Supervisión</TableHead>
          <TableHead>Promotorías</TableHead>
          <TableHead>Hist.</TableHead>
          <TableHead>Preview</TableHead>
          <TableHead>Filas</TableHead>
          <TableHead>DE</TableHead>
          <TableHead>Fallas hist.</TableHead>
          <TableHead>Recuperado hist.</TableHead>
          <TableHead>Recup. pendiente</TableHead>
          <TableHead>Semana 13 pendiente</TableHead>
          <TableHead>Entrega</TableHead>
          <TableHead>Caja final</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length ? (
          rows.map((row) => (
            <TableRow key={row.supervisionId ?? row.supervisionName}>
              <TableCell>
                <div className="font-medium text-primary">{row.supervisionName}</div>
                {row.supervisionCode ? (
                  <div className="text-xs text-muted-foreground">{row.supervisionCode}</div>
                ) : null}
              </TableCell>
              <TableCell>{row.promotorias}</TableCell>
              <TableCell>{row.promotoriasHistorical}</TableCell>
              <TableCell>{row.promotoriasPreview}</TableCell>
              <TableCell>{row.creditRows}</TableCell>
              <TableCell>{formatCurrency(row.deTotal)}</TableCell>
              <TableCell>{formatCurrency(row.failureAmount)}</TableCell>
              <TableCell>{formatCurrency(row.recoveryAmount)}</TableCell>
              <TableCell>{formatCurrency(row.recoveryPendingAmount)}</TableCell>
              <TableCell>{formatCurrency(row.extraWeekPendingAmount)}</TableCell>
              <TableCell className="font-medium text-primary">{formatCurrency(row.totalToDeliver)}</TableCell>
              <TableCell className="font-medium">{formatCurrency(row.finalCashAmount)}</TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={12} className="h-24 text-center text-muted-foreground">
              No hay datos consolidados para la fecha y el alcance seleccionados.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
