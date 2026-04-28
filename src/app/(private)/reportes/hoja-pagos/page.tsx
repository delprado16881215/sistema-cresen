import Link from 'next/link';
import { PERMISSIONS } from '@/config/permissions';
import { requirePermission } from '@/lib/rbac';
import { normalizeToIsoDate } from '@/lib/date-input';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { PaymentSaleSheet } from '@/modules/reportes/payment-sale-sheet';
import { PrintSheetButton } from '@/modules/reportes/print-sheet-button';
import { getSalePaymentSheetViewData } from '@/server/services/hoja-pagos-venta-service';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function parseControlNumber(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function getDefaultDate() {
  return normalizeToIsoDate(new Date()) ?? new Date().toISOString().slice(0, 10);
}

export default async function HojaPagosVentaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requirePermission(PERMISSIONS.REPORTES_READ);

  const raw = await searchParams;
  const promotoriaId =
    typeof raw.promotoriaId === 'string' && raw.promotoriaId.trim()
      ? raw.promotoriaId
      : undefined;
  const saleDateRaw =
    typeof raw.saleDate === 'string' && raw.saleDate.trim() ? raw.saleDate : undefined;
  const saleDate = normalizeToIsoDate(saleDateRaw) ?? undefined;
  const controlNumber = parseControlNumber(
    typeof raw.controlNumber === 'string' ? raw.controlNumber : undefined,
  );

  const viewData = await getSalePaymentSheetViewData({
    promotoriaId,
    saleDate,
    controlNumber,
  });
  const effectiveSaleDate = saleDate ?? getDefaultDate();
  const hasFilters = Boolean(promotoriaId && saleDate);

  return (
    <section data-report-shell="payment-sheet">
      <div data-print-hidden="true">
        <PageHeader
          title="Hoja de pagos por venta"
          description="Genera una hoja imprimible por promotora y fecha de venta usando la originación real del sistema."
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Reportes', href: '/reportes' },
            { label: 'Hoja de pagos por venta' },
          ]}
          action={
            <div className="flex flex-wrap gap-2" data-print-hidden="true">
              <Button asChild variant="outline">
                <Link href="/reportes">Volver a reportes</Link>
              </Button>
              {viewData.selectedGroup ? <PrintSheetButton /> : null}
            </div>
          }
        />
      </div>

      <Card className="mb-6" data-print-hidden="true">
        <CardHeader>
          <CardTitle>Filtros de la hoja</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-[1fr_220px_220px_auto] md:items-end">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Promotora</label>
              <Select name="promotoriaId" defaultValue={viewData.selectedPromotoriaId ?? ''}>
                <option value="">Selecciona una promotora</option>
                {viewData.promotorias.map((promotoria) => (
                  <option key={promotoria.id} value={promotoria.id}>
                    {promotoria.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Fecha de venta</label>
              <Input type="date" name="saleDate" defaultValue={saleDate ?? effectiveSaleDate} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Venta encontrada</label>
              <Select
                name="controlNumber"
                defaultValue={String(viewData.selectedControlNumber ?? '')}
                disabled={viewData.groups.length <= 1}
              >
                {viewData.groups.length ? null : <option value="">Sin coincidencias todavía</option>}
                {viewData.groups.map((group) => (
                  <option
                    key={`${group.controlNumber ?? 'sin-control'}-${group.folioLabel}`}
                    value={String(group.controlNumber ?? '')}
                  >
                    {group.controlLabel} · {group.clientsCount} clientes
                  </option>
                ))}
              </Select>
            </div>

            <Button type="submit" variant="accent">
              Generar hoja
            </Button>
          </form>

          <div className="mt-4 rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Fuente de verdad</p>
            <p>
              La hoja se arma con los créditos creados en esa `promotora + fecha de venta`,
              agrupados por `NRO_CONTROL` cuando exista, reutilizando el cronograma real del
              crédito.
            </p>
            {viewData.groups.length > 1 ? (
              <p className="mt-2 text-amber-700">
                Se encontraron varias ventas para esa misma fecha. Usa el selector “Venta
                encontrada” para cambiar de control sin alterar los filtros base.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {hasFilters ? (
        viewData.selectedGroup ? (
          <div className="space-y-4">
            <PaymentSaleSheet group={viewData.selectedGroup} />
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No encontramos una venta grupal real para esa promotora y esa fecha.
            </CardContent>
          </Card>
        )
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Selecciona la promotora y la fecha de venta para generar la hoja de pagos.
          </CardContent>
        </Card>
      )}

      <style>{`
        [data-payment-sale-sheet='true'] {
          --sheet-client-width: 43%;
          --sheet-observations-width: 22%;
          --sheet-week-width: calc((100% - var(--sheet-client-width) - var(--sheet-observations-width)) / 13);
          width: 100%;
          max-width: none;
          print-color-adjust: exact;
          -webkit-print-color-adjust: exact;
        }

        [data-payment-sheet-table='true'] {
          table-layout: fixed;
          width: 100%;
        }

        [data-payment-sheet-col='client'] {
          width: var(--sheet-client-width);
        }

        [data-payment-sheet-col='week'] {
          width: var(--sheet-week-width);
        }

        [data-payment-sheet-col='observations'] {
          width: var(--sheet-observations-width);
        }

        [data-payment-sheet-week-date='true'] {
          display: inline-block;
          white-space: nowrap;
          writing-mode: vertical-rl;
          text-orientation: mixed;
          line-height: 1.05;
          letter-spacing: 0.01em;
          font-size: 8px;
          color: #0f172a;
        }

        [data-payment-sheet-row='true'],
        [data-payment-sheet-footer='true'],
        [data-payment-sheet-section='header'] {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        @page {
          size: letter landscape;
          margin: 20mm 4mm 4mm 4mm;
        }

        @media print {
          html,
          body {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            max-width: none !important;
            min-height: auto !important;
            height: auto !important;
            overflow: visible !important;
          }

          body > div {
            min-height: auto !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
          }

          body > div:not([hidden]) {
            display: block !important;
            width: 100% !important;
            max-width: none !important;
          }

          .min-h-screen {
            min-height: auto !important;
            height: auto !important;
            max-height: none !important;
          }

          .min-w-0 {
            min-width: 0 !important;
            width: 100% !important;
            max-width: none !important;
          }

          [class*='grid-cols-[18rem_1fr]'] {
            display: block !important;
            width: 100% !important;
            max-width: none !important;
            min-height: auto !important;
            height: auto !important;
            overflow: visible !important;
          }

          [class*='grid-cols-[18rem_1fr]'] > div {
            width: 100% !important;
            max-width: none !important;
            min-height: auto !important;
            height: auto !important;
            overflow: visible !important;
          }

          aside,
          header {
            display: none !important;
          }

          main {
            padding: 0 !important;
            width: 100% !important;
            max-width: none !important;
            min-height: auto !important;
            height: auto !important;
            overflow: visible !important;
          }

          [data-print-hidden='true'] {
            display: none !important;
          }

          [data-report-shell='payment-sheet'] {
            display: block !important;
            width: 100% !important;
            max-width: none !important;
            padding: 0 !important;
            margin: 0 auto !important;
            min-height: auto !important;
            height: auto !important;
            overflow: visible !important;
          }

          [data-payment-sale-sheet='true'] {
            --sheet-client-width: 43%;
            --sheet-observations-width: 22%;
            --sheet-week-width: calc((100% - var(--sheet-client-width) - var(--sheet-observations-width)) / 13);
            border: none !important;
            box-shadow: none !important;
            box-sizing: border-box !important;
            width: 266mm !important;
            max-width: 266mm !important;
            min-width: 0 !important;
            padding: 0 !important;
            margin: 0 auto !important;
            page-break-inside: avoid;
            break-after: avoid-page;
            page-break-after: avoid;
          }

          [data-payment-sheet-grid='true'] {
            width: 100% !important;
            overflow: visible !important;
          }

          [data-payment-sheet-table='true'] {
            min-width: 100% !important;
            width: 100% !important;
            max-width: none !important;
            font-size: 8px !important;
          }

          [data-payment-sheet-table='true'] thead {
            display: table-header-group;
          }

          [data-payment-sheet-week-date='true'] {
            font-size: 7.1px !important;
            line-height: 1.08 !important;
            transform: none !important;
          }

          [data-payment-sheet-section='header'] {
            width: 100% !important;
            margin-bottom: 2.5mm !important;
            padding-bottom: 2mm !important;
          }

          [data-payment-sheet-row='true'] td {
            padding-top: 1.6mm !important;
            padding-bottom: 1.6mm !important;
          }

          [data-payment-sheet-cell='observations'] {
            padding-top: 1.1mm !important;
            padding-bottom: 1.1mm !important;
          }

          [data-payment-sheet-footer='true'] {
            width: 100% !important;
            margin-top: 3.2mm !important;
          }
        }
      `}</style>
    </section>
  );
}
