import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency } from '@/modules/creditos/credit-calculations';
import type { CobranzaWorkbenchRow } from '@/server/services/cobranza-service';
import type { CollectionScope } from '@/server/services/reportes-service';

type CobranzaTableProps = {
  occurredAt: string;
  scope: CollectionScope;
  rows: CobranzaWorkbenchRow[];
};

function formatDisplayDate(value: string | null) {
  if (!value) return 'Sin fecha';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function buildContactLabel(row: CobranzaWorkbenchRow) {
  const phones = [row.clientePhone, row.clienteSecondaryPhone].filter(Boolean);
  if (!phones.length) return 'Sin teléfono';
  return phones.join(' · ');
}

function buildLocationLabel(row: CobranzaWorkbenchRow) {
  return [row.clienteAddress, row.clienteNeighborhood, row.clienteCity, row.clienteState]
    .filter(Boolean)
    .join(', ');
}

function buildBadges(row: CobranzaWorkbenchRow) {
  const badges: Array<{
    label: string;
    variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline';
  }> = [];

  if (row.rowMode === 'final_closure') {
    badges.push({ label: 'Cierre operativo', variant: 'secondary' });
  } else if (row.rowMode === 'recovery_only') {
    badges.push({ label: 'Solo recuperado', variant: 'secondary' });
  } else if (row.rowMode === 'extra_week_only') {
    badges.push({ label: 'Solo semana 13', variant: 'secondary' });
  } else if (row.deAmount > 0) {
    badges.push({ label: 'Cobranza regular', variant: 'outline' });
  } else if (row.outgoingAdvanceAmount > 0) {
    badges.push({ label: 'Cubierto por adelanto', variant: 'outline' });
  }

  if (row.mode === 'historical') {
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
  if (row.operationalScope !== 'active') {
    badges.push({ label: 'Fuera de ciclo', variant: 'outline' });
  }

  return badges;
}

function buildSituationTitle(row: CobranzaWorkbenchRow) {
  if (row.rowMode === 'final_closure') return 'Cierre operativo';
  if (row.rowMode === 'recovery_only') return 'Solo recuperado';
  if (row.rowMode === 'extra_week_only') return 'Solo semana 13';
  return 'Cobranza regular';
}

function buildSituationDetail(row: CobranzaWorkbenchRow) {
  if (row.rowMode === 'final_closure') {
    const parts = [
      row.recoveryAnchorInstallmentNumber
        ? `Recuperado pendiente · Semana ${row.recoveryAnchorInstallmentNumber}`
        : null,
      row.extraWeekAmount > 0 ? 'Semana 13 pendiente' : null,
    ].filter(Boolean);
    return parts.join(' + ');
  }

  if (row.rowMode === 'recovery_only') {
    return row.recoveryAnchorInstallmentNumber
      ? `Semana ${row.recoveryAnchorInstallmentNumber}`
      : 'Recovery pendiente';
  }

  if (row.rowMode === 'extra_week_only') {
    return 'Semana 13 pendiente';
  }

  return row.installmentNumber > 0 ? `Semana ${row.installmentNumber}` : 'Semana operativa';
}

export function CobranzaTable({ occurredAt, scope, rows }: CobranzaTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Grupo</TableHead>
          <TableHead>Control</TableHead>
          <TableHead>Cliente</TableHead>
          <TableHead>Contacto</TableHead>
          <TableHead>Venta / prog.</TableHead>
          <TableHead>Situación</TableHead>
          <TableHead>Base</TableHead>
          <TableHead>DE</TableHead>
          <TableHead>Recup.</TableHead>
          <TableHead>Adelantos</TableHead>
          <TableHead>Semana 13</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length ? (
          rows.map((row) => {
            const badges = buildBadges(row);
            const groupHref = `/pagos?${new URLSearchParams({
              promotoriaId: row.promotoriaId,
              occurredAt,
              scope,
            }).toString()}`;
            const cobranzaCaseHref = `/cobranza/${row.creditoId}?${new URLSearchParams({
              occurredAt,
            }).toString()}`;

            return (
              <TableRow key={`${row.creditoId}-${row.mode}`}>
                <TableCell>
                  <div className="font-medium text-primary">{row.promotoriaName}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.supervisionName ?? 'Sin supervisión'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {row.mode === 'historical' ? 'Histórico' : 'Preview'}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="font-medium text-foreground">
                    {row.controlNumber ?? 'Sin control'}
                  </div>
                  <div className="text-xs text-muted-foreground">{row.folio}</div>
                  <div className="text-xs text-muted-foreground">{row.loanNumber}</div>
                </TableCell>
                <TableCell>
                  <div className="font-medium text-foreground">{row.clienteLabel}</div>
                  <div className="text-xs text-muted-foreground">{row.avalLabel ?? 'Sin aval'}</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm text-foreground">{buildContactLabel(row)}</div>
                  <div className="text-xs text-muted-foreground">
                    {buildLocationLabel(row) || 'Sin dirección operativa'}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm text-foreground">
                    Venta {formatDisplayDate(row.creditStartDate)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Prog. {formatDisplayDate(row.scheduledDate)}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="mb-1 text-sm font-medium text-foreground">{buildSituationTitle(row)}</div>
                  <div className="mb-2 text-xs text-muted-foreground">{buildSituationDetail(row)}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {badges.map((badge) => (
                      <Badge key={`${row.creditoId}-${badge.label}`} variant={badge.variant}>
                        {badge.label}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="font-medium text-foreground">
                  {formatCurrency(
                    row.mode === 'historical'
                      ? row.historicalCurrentPaymentAmount
                      : row.collectibleAmount,
                  )}
                </TableCell>
                <TableCell>{formatCurrency(row.deAmount)}</TableCell>
                <TableCell className="font-medium text-foreground">
                  {formatCurrency(
                    row.mode === 'historical'
                      ? row.historicalRecoveryAmount
                      : row.recoveryAmountAvailable,
                  )}
                </TableCell>
                <TableCell>
                  <div className="text-sm text-foreground">
                    {row.mode === 'historical'
                      ? `Ent. ${formatCurrency(row.historicalAdvanceIncomingAmount)}`
                      : `Disp. ${formatCurrency(row.advanceAmountAvailable)}`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Sal. {formatCurrency(row.outgoingAdvanceAmount)}
                  </div>
                </TableCell>
                <TableCell className="font-medium text-foreground">
                  {formatCurrency(
                    row.mode === 'historical'
                      ? row.historicalExtraWeekCollectedAmount
                      : row.extraWeekAmount,
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button asChild size="sm" variant="accent">
                      <Link href={cobranzaCaseHref}>Expediente</Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/creditos/${row.creditoId}`}>Crédito</Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link href={groupHref}>Grupo</Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })
        ) : (
          <TableRow>
            <TableCell colSpan={12} className="h-24 text-center text-muted-foreground">
              No hay filas de cobranza para los filtros seleccionados.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
