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

export type PagoQueueRow = {
  creditoId: string;
  folio: string;
  clienteLabel: string;
  avalLabel: string | null;
  promotoriaName: string;
  supervisionName: string | null;
  nextInstallment: string;
  outstandingAmount: string;
};

export function PagosTable({ rows }: { rows: PagoQueueRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Crédito</TableHead>
          <TableHead>Acreditado</TableHead>
          <TableHead>Aval</TableHead>
          <TableHead>Promotoría</TableHead>
          <TableHead>Próxima semana</TableHead>
          <TableHead>Saldo abierto</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length ? (
          rows.map((row) => (
            <TableRow key={row.creditoId}>
              <TableCell className="font-medium text-primary">{row.folio}</TableCell>
              <TableCell>{row.clienteLabel}</TableCell>
              <TableCell>{row.avalLabel ?? 'Sin aval'}</TableCell>
              <TableCell>
                <div>{row.promotoriaName}</div>
                <div className="text-xs text-muted-foreground">{row.supervisionName ?? 'Sin supervisión'}</div>
              </TableCell>
              <TableCell>{row.nextInstallment}</TableCell>
              <TableCell>{row.outstandingAmount}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/creditos/${row.creditoId}`}>Ver estado</Link>
                  </Button>
                  <Button asChild size="sm" variant="accent">
                    <Link href={`/pagos/nuevo?creditoId=${row.creditoId}`}>Registrar pago</Link>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
              No hay créditos activos con semanas pendientes.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
