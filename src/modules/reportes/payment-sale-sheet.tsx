import { formatCurrency } from '@/modules/creditos/credit-calculations';
import type {
  SalePaymentSheetGroup,
  SalePaymentSheetRow,
} from '@/server/services/hoja-pagos-venta-service';

type PaymentSaleSheetProps = {
  group: SalePaymentSheetGroup;
};

type OperationalWeekColumn = {
  installmentNumber: number;
  label: string;
  dueDateLabel: string;
};

function parseIsoDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
}

function formatShortDateLabel(value: Date) {
  const day = String(value.getUTCDate()).padStart(2, '0');
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const year = String(value.getUTCFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

function buildOperationalWeekColumns(group: SalePaymentSheetGroup): OperationalWeekColumn[] {
  const byInstallment = new Map(
    group.weekColumns.map((week) => [week.installmentNumber, week]),
  );

  return Array.from({ length: 13 }, (_, index) => {
    const installmentNumber = index + 1;
    const scheduledWeek = byInstallment.get(installmentNumber);

    if (scheduledWeek) {
      return {
        installmentNumber,
        label: scheduledWeek.label,
        dueDateLabel: formatShortDateLabel(parseIsoDate(scheduledWeek.dueDateIso)),
      };
    }

    const dueDate = parseIsoDate(group.saleDateIso);
    dueDate.setUTCDate(dueDate.getUTCDate() + installmentNumber * 7);

    return {
      installmentNumber,
      label: String(installmentNumber).padStart(2, '0'),
      dueDateLabel: formatShortDateLabel(dueDate),
    };
  });
}

function formatCompactAmount(value: number) {
  const isWhole = Math.abs(value - Math.round(value)) < 0.0001;
  return new Intl.NumberFormat('es-MX', {
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function buildClientDetail(row: SalePaymentSheetRow) {
  return [
    row.addressLine || null,
    row.phone ? row.phone : null,
    formatCompactAmount(row.weeklyAmount),
  ]
    .filter(Boolean)
    .join(' *** ');
}

function stripObservationPrefix(value: string) {
  return value
    .replace(/^Aval:\s*/, '')
    .replace(/^Nota del crédito:\s*/, '')
    .replace(/^Referencias:\s*/, '')
    .replace(/^Obs\. cliente:\s*/, '');
}

function buildObservationBlock(row: SalePaymentSheetRow) {
  const primary = [row.avalLabel, row.avalAddressLine || null, row.avalPhone || null]
    .filter(Boolean)
    .join(' *** ');
  const secondary = row.observationLines
    .filter((line) => !line.startsWith('Aval:'))
    .map(stripObservationPrefix)
    .filter(Boolean)
    .slice(0, 2)
    .join(' / ');

  return { primary, secondary };
}

function WeekHeaderCell({
  label,
  dueDateLabel,
}: {
  label: string;
  dueDateLabel: string;
}) {
  return (
    <th className="border border-slate-500 bg-white px-0 py-1 text-center align-top">
      <div className="flex min-h-[70px] h-full flex-col items-center justify-start">
        <span className="pt-1.5 text-[9px] font-bold tracking-[0.08em] text-slate-950">
          {label}
        </span>
        <span data-payment-sheet-week-date="true" className="mt-1">
          {dueDateLabel}
        </span>
      </div>
    </th>
  );
}

export function PaymentSaleSheet({ group }: PaymentSaleSheetProps) {
  const operationalWeeks = buildOperationalWeekColumns(group);
  const tableMinWidth = 420 + operationalWeeks.length * 34;

  return (
    <div
      data-payment-sale-sheet="true"
      data-payment-sheet-mode="operational"
      className="border border-slate-400 bg-white px-4 py-4 shadow-none"
    >
      <div
        data-payment-sheet-section="header"
        className="mb-3 border-b border-slate-500 pb-2"
      >
        <p className="text-[15px] font-bold text-slate-950">Hoja de Pagos Promotora</p>

        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-700">
              Grupo
            </p>
            <p className="mt-1 text-[24px] font-bold uppercase leading-none text-slate-950">
              {group.promotoriaName}
            </p>
          </div>

          <HeaderStat label="Fecha Cred:" value={group.saleDateLabel} />
          <HeaderStat label="Venta" value={formatCurrency(group.totalPrincipalAmount)} />
        </div>
      </div>

      <div className="overflow-x-auto" data-payment-sheet-grid="true">
        <table
          data-payment-sheet-table="true"
          className="w-full border-collapse text-xs text-slate-900"
          style={{ minWidth: `${tableMinWidth}px` }}
        >
          <colgroup>
            <col data-payment-sheet-col="client" />
            {operationalWeeks.map((week) => (
              <col key={`col-${week.installmentNumber}`} data-payment-sheet-col="week" />
            ))}
            <col data-payment-sheet-col="observations" />
          </colgroup>

          <thead>
            <tr className="bg-white">
              <th className="border border-slate-500 px-2 py-1 text-center text-[11px] font-bold italic text-slate-900">
                Cliente
              </th>
              {operationalWeeks.map((week) => (
                <WeekHeaderCell
                  key={week.installmentNumber}
                  label={week.label}
                  dueDateLabel={week.dueDateLabel}
                />
              ))}
              <th className="border border-slate-500 px-2 py-1 text-center text-[11px] font-bold italic text-slate-900">
                OBSERVACIONES
              </th>
            </tr>
          </thead>

          <tbody>
            {group.rows.map((row) => {
              const observationBlock = buildObservationBlock(row);

              return (
                <tr key={row.creditoId} data-payment-sheet-row="true">
                  <td className="border border-slate-500 px-2.5 py-2 align-top">
                    <div className="text-[10px] font-bold uppercase leading-[1.3] text-slate-950">
                      {row.clienteName}
                    </div>
                    <div className="mt-1.5 text-[10px] font-semibold leading-[1.34] text-slate-800">
                      {buildClientDetail(row)}
                    </div>
                  </td>

                  {operationalWeeks.map((week) => (
                    <td
                      key={`${row.creditoId}-${week.installmentNumber}`}
                      className="h-[58px] border border-slate-500 bg-white"
                    >
                      <div className="h-full w-full" />
                    </td>
                  ))}

                  <td
                    data-payment-sheet-cell="observations"
                    className="border border-slate-500 px-1.25 py-1 align-top"
                  >
                    {observationBlock.primary ? (
                      <div className="text-[10px] font-bold uppercase leading-[1.12] text-slate-950">
                        {observationBlock.primary}
                      </div>
                    ) : null}
                    {observationBlock.secondary ? (
                      <div className="mt-0.5 text-[8.5px] font-semibold leading-[1.08] text-slate-800">
                        {observationBlock.secondary}
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div
        data-payment-sheet-footer="true"
        className="mt-3 grid grid-cols-[230px_auto] items-center gap-6 text-slate-950"
      >
        <span className="text-[14px] font-bold">Debe de Entregar Semanal:</span>
        <span className="text-[15px] font-bold">
          {formatCurrency(group.totalWeeklyAmount)}
        </span>
      </div>
    </div>
  );
}

function HeaderStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="text-left">
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-700">{label}</p>
      <p className="mt-1 text-[15px] font-bold text-slate-950">{value}</p>
    </div>
  );
}
