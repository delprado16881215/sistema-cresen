'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type PreviewRow = {
  rowNumber: number;
  duplicateReason: string | null;
  errors: string[];
  resolved: {
    clienteName: string | null;
    avalName: string | null;
    promotoriaName: string | null;
    supervisionName: string | null;
    planCode: string | null;
    statusName: string | null;
  };
  payload: {
    saleId: string;
    controlNumber: number;
    startDate: string;
    clientExternalId: string;
    avalExternalId: string | null;
    principalAmount: number;
    weeklyAmount: number;
    totalWeeks: number;
    totalPayableAmount: number;
    promotoriaExternalId: string;
    statusCode: string;
    notes: string | null;
  };
};

type PreviewResult = {
  totalRows: number;
  validRows: PreviewRow[];
  duplicateRows: PreviewRow[];
  errorRows: PreviewRow[];
};

type CommitWarning = {
  rowNumber: number;
  saleId: string;
  clientExternalId: string;
  message: string;
};

type CommitSummary = {
  importedCount: number;
  principalAmountTotal: number;
  weeklyAmountTotal: number;
  overdueCount: number;
  integrityIssues: {
    missingRequiredFields: number;
    duplicatePayments: number;
    incompleteSchedules: number;
    creditsWithoutClient: number;
    outOfRangeWeeks: number;
    inconsistentDates: number;
    invalidAmounts: number;
  };
  issueDetails: string[];
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  }).format(value);
}

export function CreditosImportPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [commitWarnings, setCommitWarnings] = useState<CommitWarning[]>([]);
  const [commitSummary, setCommitSummary] = useState<CommitSummary | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const validPreviewRows = useMemo(() => preview?.validRows.slice(0, 100) ?? [], [preview]);
  const duplicatePreviewRows = useMemo(() => preview?.duplicateRows.slice(0, 50) ?? [], [preview]);
  const errorPreviewRows = useMemo(() => preview?.errorRows.slice(0, 50) ?? [], [preview]);

  const handlePreview = async () => {
    if (!file) {
      setError('Selecciona un archivo CSV o XLSX para continuar.');
      return;
    }

    setError(null);
    setSuccess(null);
    setCommitWarnings([]);
    setCommitSummary(null);
    setIsPreviewing(true);

    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/creditos/import/preview', {
      method: 'POST',
      body: formData,
    });

    setIsPreviewing(false);
    const body = (await response.json()) as PreviewResult & { message?: string };

    if (!response.ok) {
      setPreview(null);
      setError(body.message ?? 'No se pudo analizar el archivo.');
      return;
    }

    setPreview(body);
  };

  const handleCommit = async () => {
    if (!preview?.validRows.length) {
      setError('No hay registros válidos para importar.');
      return;
    }

    setError(null);
    setSuccess(null);
    setCommitWarnings([]);
    setCommitSummary(null);
    setIsImporting(true);

    const response = await fetch('/api/creditos/import/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: preview.validRows }),
    });

    setIsImporting(false);
    const body = (await response.json()) as {
      message?: string;
      importedCount?: number;
      failedCount?: number;
      failedRows?: CommitWarning[];
      summary?: CommitSummary;
    };

    if (!response.ok) {
      setError(body.message ?? 'No se pudo importar el archivo.');
      return;
    }

    const failedCount = body.failedCount ?? 0;
    setSuccess(`Importación completada: ${body.importedCount ?? 0} créditos creados${failedCount ? `, ${failedCount} con error` : ''}.`);
    setCommitWarnings(body.failedRows ?? []);
    setCommitSummary(body.summary ?? null);
    setPreview(null);
    setFile(null);
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Importación masiva de ventas / créditos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Formato esperado</p>
            <p>Archivo CSV o XLSX con la estructura operativa real: <code>ID_VENTA</code>, <code>NRO_CONTROL</code>, <code>FECHA</code>, <code>ID_CLIENTE</code>, <code>ID_AVAL</code>, <code>MONTO_VENTA</code>, <code>MONTO_CUOTAS</code>, <code>NRO_SEMANA</code>, <code>MONTO_PAGAR</code>, <code>ID_PROMOTORA</code>, <code>ESTADO</code> y <code>OBSERVACIONES</code>.</p>
            <p className="mt-2">Usa <code>ID_VENTA</code>, <code>ID_CLIENTE</code> e <code>ID_AVAL</code> con valores numéricos simples, como se manejan en operación. La fecha puede venir como fecha natural de Excel, <code>DD/MM/YY</code>, <code>DD/MM/YYYY</code> o <code>YYYY-MM-DD</code>; el sistema la interpreta internamente y valida que corresponda a lunes.</p>
            <p className="mt-2">En <code>ID_PROMOTORA</code> usa el identificador o nombre real que ya existe en Sistema Cresen, por ejemplo <code>VICTORIA GUTIERREZ MORALES</code>.</p>
          </div>

          {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
          {success ? <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p> : null}
          {commitWarnings.length ? (
            <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
              <p className="font-medium">Algunas filas no se importaron durante la ejecución.</p>
              <p className="mt-1">El proceso continuó con las demás filas válidas. Mostrando las primeras {Math.min(commitWarnings.length, 20)}.</p>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-[1fr_auto_auto] md:items-end">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Archivo de ventas</label>
              <Input type="file" accept=".csv,.xlsx" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            </div>
            <Button variant="secondary" onClick={handlePreview} disabled={isPreviewing}>
              {isPreviewing ? 'Analizando...' : 'Analizar archivo'}
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => window.open('/templates/creditos-import-template.csv', '_blank')}>
                Plantilla CSV
              </Button>
              <Button variant="outline" onClick={() => window.open('/templates/creditos-import-template.xlsx', '_blank')}>
                Plantilla XLSX
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {commitWarnings.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Filas con error durante la importación</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fila</TableHead>
                  <TableHead>ID_VENTA</TableHead>
                  <TableHead>ID_CLIENTE</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commitWarnings.slice(0, 20).map((row) => (
                  <TableRow key={`commit-${row.rowNumber}-${row.saleId}`}>
                    <TableCell>{row.rowNumber}</TableCell>
                    <TableCell>{row.saleId}</TableCell>
                    <TableCell>{row.clientExternalId}</TableCell>
                    <TableCell>{row.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {commitSummary ? (
        <Card>
          <CardHeader>
            <CardTitle>Resumen post-carga</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <SummaryCard label="Créditos cargados" value={String(commitSummary.importedCount)} tone="success" />
              <SummaryCard label="Monto colocado" value={formatCurrency(commitSummary.principalAmountTotal)} />
              <SummaryCard label="Total semanal" value={formatCurrency(commitSummary.weeklyAmountTotal)} />
              <SummaryCard label="Vencidos" value={String(commitSummary.overdueCount)} tone={commitSummary.overdueCount ? 'warning' : 'default'} />
            </div>

            <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
              <SummaryCard label="Campos faltantes" value={String(commitSummary.integrityIssues.missingRequiredFields)} tone={commitSummary.integrityIssues.missingRequiredFields ? 'danger' : 'success'} />
              <SummaryCard label="Pagos duplicados" value={String(commitSummary.integrityIssues.duplicatePayments)} tone={commitSummary.integrityIssues.duplicatePayments ? 'danger' : 'success'} />
              <SummaryCard label="Cronogramas incompletos" value={String(commitSummary.integrityIssues.incompleteSchedules)} tone={commitSummary.integrityIssues.incompleteSchedules ? 'danger' : 'success'} />
              <SummaryCard label="Sin cliente" value={String(commitSummary.integrityIssues.creditsWithoutClient)} tone={commitSummary.integrityIssues.creditsWithoutClient ? 'danger' : 'success'} />
              <SummaryCard label="Semanas fuera de rango" value={String(commitSummary.integrityIssues.outOfRangeWeeks)} tone={commitSummary.integrityIssues.outOfRangeWeeks ? 'danger' : 'success'} />
              <SummaryCard label="Fechas incoherentes" value={String(commitSummary.integrityIssues.inconsistentDates)} tone={commitSummary.integrityIssues.inconsistentDates ? 'danger' : 'success'} />
              <SummaryCard label="Montos inválidos" value={String(commitSummary.integrityIssues.invalidAmounts)} tone={commitSummary.integrityIssues.invalidAmounts ? 'danger' : 'success'} />
            </div>

            {commitSummary.issueDetails.length ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-medium">Posibles errores detectados</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {commitSummary.issueDetails.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
                No se detectaron inconsistencias de integridad en los créditos importados.
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {preview ? (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <SummaryCard label="Filas totales" value={String(preview.totalRows)} />
            <SummaryCard label="Válidos" value={String(preview.validRows.length)} tone="success" />
            <SummaryCard label="Duplicados" value={String(preview.duplicateRows.length)} tone="warning" />
            <SummaryCard label="Con error" value={String(preview.errorRows.length)} tone="danger" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Vista previa de registros válidos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID_VENTA</TableHead>
                    <TableHead>NRO_CONTROL</TableHead>
                    <TableHead>Fecha de venta</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Aval</TableHead>
                    <TableHead>Promotoría</TableHead>
                    <TableHead>Monto venta</TableHead>
                    <TableHead>Cuota</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {validPreviewRows.length ? (
                    validPreviewRows.map((row) => (
                      <TableRow key={`valid-${row.rowNumber}`}>
                        <TableCell>{row.payload.saleId}</TableCell>
                        <TableCell className="font-medium text-primary">{row.payload.controlNumber}</TableCell>
                        <TableCell>{row.payload.startDate}</TableCell>
                        <TableCell>{row.resolved.clienteName}</TableCell>
                        <TableCell>{row.resolved.avalName ?? 'Sin aval'}</TableCell>
                        <TableCell>
                          <div>{row.resolved.promotoriaName}</div>
                          <div className="text-xs text-muted-foreground">{row.resolved.supervisionName ?? 'Sin supervisión'}</div>
                        </TableCell>
                        <TableCell>{row.payload.principalAmount}</TableCell>
                        <TableCell>{row.payload.weeklyAmount}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="h-20 text-center text-muted-foreground">No hay registros válidos para importar.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {preview.validRows.length > validPreviewRows.length ? (
                <p className="text-xs text-muted-foreground">Mostrando los primeros {validPreviewRows.length} de {preview.validRows.length} registros válidos.</p>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setPreview(null)}>Cancelar revisión</Button>
                <Button variant="accent" onClick={handleCommit} disabled={!preview.validRows.length || isImporting}>
                  {isImporting ? 'Importando...' : `Importar ${preview.validRows.length} válidos`}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Duplicados detectados</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID_VENTA</TableHead>
                    <TableHead>NRO_CONTROL</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Fila</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {duplicatePreviewRows.length ? duplicatePreviewRows.map((row) => (
                    <TableRow key={`duplicate-${row.rowNumber}`}>
                      <TableCell>{row.payload.saleId}</TableCell>
                      <TableCell className="font-medium text-primary">{row.payload.controlNumber}</TableCell>
                      <TableCell>{row.payload.clientExternalId}</TableCell>
                      <TableCell>{row.duplicateReason}</TableCell>
                      <TableCell className="text-muted-foreground">{row.rowNumber}</TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">Sin duplicados detectados.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Registros con error</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID_VENTA</TableHead>
                    <TableHead>NRO_CONTROL</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Errores</TableHead>
                    <TableHead>Fila</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {errorPreviewRows.length ? errorPreviewRows.map((row) => (
                    <TableRow key={`error-${row.rowNumber}`}>
                      <TableCell>{row.payload.saleId || 'Sin ID'}</TableCell>
                      <TableCell className="font-medium text-primary">{row.payload.controlNumber || 'Sin control'}</TableCell>
                      <TableCell>{row.payload.clientExternalId || 'Sin cliente'}</TableCell>
                      <TableCell>{row.errors.join(' · ')}</TableCell>
                      <TableCell className="text-muted-foreground">{row.rowNumber}</TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">Sin errores de validación.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function SummaryCard({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'success' | 'warning' | 'danger' }) {
  const toneClass =
    tone === 'success'
      ? 'text-emerald-700'
      : tone === 'warning'
        ? 'text-amber-700'
        : tone === 'danger'
          ? 'text-red-700'
          : 'text-primary';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className={`text-2xl font-semibold ${toneClass}`}>{value}</CardContent>
    </Card>
  );
}
