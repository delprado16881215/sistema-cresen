import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export type CreditoRow = {
  id: string;
  folio: string;
  loanNumber: string;
  controlNumber: number | null;
  clienteName: string;
  avalName: string | null;
  principalAmount: string;
  weeklyAmount: string;
  totalWeeks: number;
  promotoriaName: string;
  supervisionName: string | null;
  statusName: string;
  startDate: string;
  weeklyOperationalStatus: 'PAID' | 'PENDING' | 'FAILED' | 'ADVANCED' | 'OVERDUE';
  weeklyOperationalLabel: string;
  weeklyOperationalAmount: string;
  operationalCreditStatus: 'ACTIVE' | 'ACTIVE_WITH_EXTRA_WEEK' | 'OVERDUE';
  operationalCreditStatusLabel: string;
};

type CreditosTableProps = {
  rows: CreditoRow[];
};

function getWeeklyStatusClass(status: CreditoRow['weeklyOperationalStatus']) {
  if (status === 'OVERDUE') return 'border-red-300 bg-red-100 text-red-800';
  if (status === 'FAILED') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'PENDING') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'ADVANCED') return 'border-sky-200 bg-sky-50 text-sky-700';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
}

function getCreditStatusClass(status: CreditoRow['operationalCreditStatus']) {
  if (status === 'OVERDUE') return 'border-red-300 bg-red-100 text-red-800';
  if (status === 'ACTIVE_WITH_EXTRA_WEEK') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
}

export function CreditosTable({ rows }: CreditosTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>NRO_CONTROL</TableHead>
          <TableHead>Folio</TableHead>
          <TableHead>Cliente</TableHead>
          <TableHead>Aval</TableHead>
          <TableHead>Monto</TableHead>
          <TableHead>Semanal</TableHead>
          <TableHead>Monto a pagar</TableHead>
          <TableHead>Estado semanal</TableHead>
          <TableHead>Plazo</TableHead>
          <TableHead>Promotoría</TableHead>
          <TableHead>Supervisión</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead className="text-right">Acción</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length ? (
          rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium text-primary">{row.controlNumber ?? 'Sin control'}</TableCell>
              <TableCell>
                <div className="font-medium text-primary">{row.folio}</div>
                <div className="text-xs text-muted-foreground">{row.loanNumber}</div>
              </TableCell>
              <TableCell>
                <div className="font-medium">{row.clienteName}</div>
                <div className="text-xs text-muted-foreground">{row.startDate}</div>
              </TableCell>
              <TableCell>{row.avalName ?? 'Sin aval'}</TableCell>
              <TableCell>{row.principalAmount}</TableCell>
              <TableCell>{row.weeklyAmount}</TableCell>
              <TableCell className="font-medium">{row.weeklyOperationalAmount}</TableCell>
              <TableCell>
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getWeeklyStatusClass(row.weeklyOperationalStatus)}`}>
                  {row.weeklyOperationalLabel}
                </span>
              </TableCell>
              <TableCell>{row.totalWeeks} semanas</TableCell>
              <TableCell>{row.promotoriaName}</TableCell>
              <TableCell>{row.supervisionName ?? 'Sin supervisión'}</TableCell>
              <TableCell>
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getCreditStatusClass(row.operationalCreditStatus)}`}>
                  {row.operationalCreditStatusLabel}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/creditos/${row.id}`}>Ver estado</Link>
                  </Button>
                  <Button asChild size="sm" variant="accent">
                    <Link href={`/pagos/nuevo?creditoId=${row.id}`}>Registrar pago</Link>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={13} className="h-24 text-center text-muted-foreground">
              Aún no hay créditos originados.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
