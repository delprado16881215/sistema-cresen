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
import type { PromotoriaWeeklyCollectionResult } from '@/server/repositories/pago-repository';

type PromotoriaCollectionDetailTableProps = {
  collection: PromotoriaWeeklyCollectionResult;
};

function buildBadges(
  row: PromotoriaWeeklyCollectionResult['rows'][number],
  mode: PromotoriaWeeklyCollectionResult['mode'],
) {
  const badges: Array<{
    label: string;
    variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline';
  }> = [];

  if (row.rowMode === 'final_closure') {
    badges.push({ label: 'Cierre operativo', variant: 'secondary' });
  } else if (row.rowMode === 'recovery_only') {
    badges.push({ label: 'Recuperado final', variant: 'secondary' });
  } else if (row.rowMode === 'extra_week_only') {
    badges.push({ label: 'Fila semana 13', variant: 'secondary' });
  } else if (row.deAmount > 0) {
    badges.push({ label: 'Pago normal', variant: 'outline' });
  }

  if (mode === 'historical') {
    if (row.historicalFailureAmount > 0) {
      badges.push({ label: 'Falla', variant: 'destructive' });
    }
    if (row.historicalRecoveryAmount > 0) {
      badges.push({ label: 'Recuperado', variant: 'warning' });
    }
    if (row.historicalAdvanceIncomingAmount > 0) {
      badges.push({ label: 'Adelanto entrante', variant: 'success' });
    }
    if (row.outgoingAdvanceAmount > 0) {
      badges.push({ label: 'Adelanto saliente', variant: 'outline' });
    }
    if (row.historicalExtraWeekCollectedAmount > 0 || row.extraWeekAmount > 0) {
      badges.push({ label: 'Semana 13', variant: 'secondary' });
    }
    return badges;
  }

  if (row.recoveryAmountAvailable > 0) {
    badges.push({ label: 'Recuperado pendiente', variant: 'warning' });
  }
  if (row.advanceAmountAvailable > 0) {
    badges.push({ label: 'Adelanto disponible', variant: 'success' });
  }
  if (row.outgoingAdvanceAmount > 0) {
    badges.push({ label: 'Adelanto saliente', variant: 'outline' });
  }
  if (row.extraWeekAmount > 0) {
    badges.push({ label: 'Semana 13 pendiente', variant: 'secondary' });
  }

  return badges;
}

export function PromotoriaCollectionDetailTable({
  collection,
}: PromotoriaCollectionDetailTableProps) {
  const sortedRows = [...collection.rows].sort(
    (left, right) =>
      (left.controlNumber ?? Number.MAX_SAFE_INTEGER) -
        (right.controlNumber ?? Number.MAX_SAFE_INTEGER) ||
      left.clienteLabel.localeCompare(right.clienteLabel),
  );

  const isHistorical = collection.mode === 'historical';

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Control</TableHead>
          <TableHead>Cliente</TableHead>
          <TableHead>Fecha de venta</TableHead>
          <TableHead>Etiquetas</TableHead>
          <TableHead>DE</TableHead>
          {isHistorical ? (
            <>
              <TableHead>Pago base</TableHead>
              <TableHead>Falla</TableHead>
              <TableHead>Recuperado</TableHead>
              <TableHead>Adel. ent.</TableHead>
              <TableHead>Adel. sal.</TableHead>
              <TableHead>Semana 13</TableHead>
              <TableHead>Total fila</TableHead>
            </>
          ) : (
            <>
              <TableHead>Cobranza base</TableHead>
              <TableHead>Recup. pendiente</TableHead>
              <TableHead>Adel. disp.</TableHead>
              <TableHead>Adel. sal.</TableHead>
              <TableHead>Semana 13 pendiente</TableHead>
            </>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedRows.length ? (
          sortedRows.map((row) => {
            const badges = buildBadges(row, collection.mode);
            const historicalBase = row.historicalCurrentPaymentAmount;
            const historicalTotal =
              historicalBase +
              row.historicalRecoveryAmount +
              row.historicalAdvanceIncomingAmount +
              row.historicalExtraWeekCollectedAmount;

            return (
              <TableRow key={row.creditoId}>
                <TableCell>{row.controlNumber ?? 'Sin control'}</TableCell>
                <TableCell>
                  <div className="font-medium text-foreground">{row.clienteLabel}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.loanNumber} · {row.avalLabel ?? 'Sin aval'}
                  </div>
                </TableCell>
                <TableCell>{row.creditStartDate ?? 'Sin fecha'}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1.5">
                    {badges.map((badge) => (
                      <Badge key={`${row.creditoId}-${badge.label}`} variant={badge.variant}>
                        {badge.label}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>{formatCurrency(row.deAmount)}</TableCell>
                {isHistorical ? (
                  <>
                    <TableCell>{formatCurrency(historicalBase)}</TableCell>
                    <TableCell>{formatCurrency(row.historicalFailureAmount)}</TableCell>
                    <TableCell>{formatCurrency(row.historicalRecoveryAmount)}</TableCell>
                    <TableCell>{formatCurrency(row.historicalAdvanceIncomingAmount)}</TableCell>
                    <TableCell>{formatCurrency(row.outgoingAdvanceAmount)}</TableCell>
                    <TableCell>{formatCurrency(row.historicalExtraWeekCollectedAmount)}</TableCell>
                    <TableCell className="font-medium text-primary">
                      {formatCurrency(historicalTotal)}
                    </TableCell>
                  </>
                ) : (
                  <>
                    <TableCell>{formatCurrency(row.collectibleAmount)}</TableCell>
                    <TableCell>{formatCurrency(row.recoveryAmountAvailable)}</TableCell>
                    <TableCell>{formatCurrency(row.advanceAmountAvailable)}</TableCell>
                    <TableCell>{formatCurrency(row.outgoingAdvanceAmount)}</TableCell>
                    <TableCell className="font-medium text-primary">
                      {formatCurrency(row.extraWeekAmount)}
                    </TableCell>
                  </>
                )}
              </TableRow>
            );
          })
        ) : (
          <TableRow>
            <TableCell colSpan={isHistorical ? 12 : 10} className="h-24 text-center text-muted-foreground">
              No hay filas operativas para esta promotoría en la fecha y el alcance seleccionados.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
