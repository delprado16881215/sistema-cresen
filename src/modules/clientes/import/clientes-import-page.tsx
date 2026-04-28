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
  payload: {
    externalClientId: string | null;
    code: string | null;
    fullName: string;
    phone: string;
    postalCode: string;
    isActive: boolean;
  };
};

type PreviewResult = {
  totalRows: number;
  validRows: PreviewRow[];
  duplicateRows: PreviewRow[];
  errorRows: PreviewRow[];
};

export function ClientesImportPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [commitWarnings, setCommitWarnings] = useState<Array<{ rowNumber: number; externalClientId: string | null; code: string | null; fullName: string; message: string }>>([]);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const validPreviewRows = useMemo(() => preview?.validRows.slice(0, 100) ?? [], [preview]);
  const errorPreviewRows = useMemo(() => preview?.errorRows.slice(0, 50) ?? [], [preview]);
  const duplicatePreviewRows = useMemo(() => preview?.duplicateRows.slice(0, 50) ?? [], [preview]);

  const handlePreview = async () => {
    if (!file) {
      setError('Selecciona un archivo CSV o XLSX para continuar.');
      return;
    }

    setError(null);
    setSuccess(null);
    setCommitWarnings([]);
    setIsPreviewing(true);

    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/clientes/import/preview', {
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
    setIsImporting(true);

    const response = await fetch('/api/clientes/import/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: preview.validRows }),
    });

    setIsImporting(false);

    const body = (await response.json()) as { message?: string; importedCount?: number; failedCount?: number; failedRows?: Array<{ rowNumber: number; externalClientId: string | null; code: string | null; fullName: string; message: string }>; batchSize?: number };
    if (!response.ok) {
      setError(body.message ?? 'No se pudo importar el archivo.');
      return;
    }

    const failedCount = body.failedCount ?? 0;
    setSuccess(`Importación completada: ${body.importedCount ?? 0} clientes creados${failedCount ? `, ${failedCount} con error` : ''}.`);
    setCommitWarnings(body.failedRows ?? []);
    setPreview(null);
    setFile(null);
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Importación masiva</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Formato esperado</p>
            <p>Archivo CSV o XLSX con el identificador externo del cliente en <code>externalClientId</code> o <code>ID_CLIENTE</code>, más los datos propios del cliente. El sistema conservará ese ID externo para futuras importaciones de créditos y generará el código interno <code>CR0001</code>, <code>CR0002</code>, etc.</p>
            <p className="mt-2">La promotoría y la supervisión no forman parte de la importación del cliente y se asignan después, en el origen del crédito.</p>
            <p className="mt-2">Si <code>code</code> viene vacío, el sistema genera uno nuevo automáticamente.</p>
          </div>

          {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
          {success ? <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p> : null}
          {commitWarnings.length ? (
            <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
              <p className="font-medium">Algunas filas no se importaron durante la ejecución.</p>
              <p className="mt-1">El proceso continuó con las demás filas válidas. Mostrando las primeras {Math.min(commitWarnings.length, 20)}.</p>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-[1fr_auto_auto_auto] md:items-end">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Archivo de clientes</label>
              <Input
                type="file"
                accept=".csv,.xlsx"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </div>
            <Button variant="secondary" onClick={handlePreview} disabled={isPreviewing}>
              {isPreviewing ? 'Analizando...' : 'Analizar archivo'}
            </Button>
            <Button variant="outline" onClick={() => window.open('/templates/clientes-import-template.csv', '_blank')}>
              Plantilla CSV
            </Button>
            <Button variant="outline" onClick={() => window.open('/templates/clientes-import-template.xlsx', '_blank')}>
              Plantilla XLSX
            </Button>
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
                  <TableHead>ID externo</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commitWarnings.slice(0, 20).map((row) => (
                  <TableRow key={`commit-${row.rowNumber}-${row.code ?? row.fullName}`}>
                    <TableCell>{row.rowNumber}</TableCell>
                    <TableCell>{row.externalClientId ?? '-'}</TableCell>
                    <TableCell>{row.code ?? 'AUTO'}</TableCell>
                    <TableCell>{row.fullName}</TableCell>
                    <TableCell>{row.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
                    <TableHead>Fila</TableHead>
                    <TableHead>ID externo</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead>CP</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {validPreviewRows.length ? (
                    validPreviewRows.map((row) => (
                      <TableRow key={`valid-${row.rowNumber}`}>
                        <TableCell>{row.rowNumber}</TableCell>
                        <TableCell>{row.payload.externalClientId ?? '-'}</TableCell>
                        <TableCell>{row.payload.code ?? 'AUTO'}</TableCell>
                        <TableCell>{row.payload.fullName}</TableCell>
                        <TableCell>{row.payload.phone}</TableCell>
                        <TableCell>{row.payload.postalCode}</TableCell>
                        <TableCell>{row.payload.isActive ? 'Activo' : 'Inactivo'}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="h-20 text-center text-muted-foreground">
                        No hay registros válidos para importar.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {preview.validRows.length > validPreviewRows.length ? (
                <p className="text-xs text-muted-foreground">
                  Mostrando los primeros {validPreviewRows.length} de {preview.validRows.length} registros válidos.
                </p>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setPreview(null)}>
                  Cancelar revisión
                </Button>
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
                  <TableHead>Fila</TableHead>
                  <TableHead>ID externo</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
                </TableHeader>
                <TableBody>
                  {duplicatePreviewRows.length ? (
                    duplicatePreviewRows.map((row) => (
                      <TableRow key={`duplicate-${row.rowNumber}`}>
                        <TableCell>{row.rowNumber}</TableCell>
                        <TableCell>{row.payload.externalClientId ?? '-'}</TableCell>
                        <TableCell>{row.payload.fullName}</TableCell>
                        <TableCell>{row.duplicateReason}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">Sin duplicados detectados.</TableCell>
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
                  <TableHead>Fila</TableHead>
                  <TableHead>ID externo</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Errores</TableHead>
                </TableRow>
                </TableHeader>
                <TableBody>
                  {errorPreviewRows.length ? (
                    errorPreviewRows.map((row) => (
                      <TableRow key={`error-${row.rowNumber}`}>
                        <TableCell>{row.rowNumber}</TableCell>
                        <TableCell>{row.payload.externalClientId ?? '-'}</TableCell>
                        <TableCell>{row.payload.fullName || 'Sin nombre'}</TableCell>
                        <TableCell>{row.errors.join(' · ')}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">Sin errores de validación.</TableCell>
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
