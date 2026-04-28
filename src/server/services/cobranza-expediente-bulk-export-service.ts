import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { AppError } from '@/lib/errors';
import { getCobranzaExpedienteCorto } from '@/server/services/cobranza-expediente-service';
import { generateCobranzaExpedientePdf } from '@/server/services/cobranza-expediente-pdf-service';
import type {
  RutaCobranzaPlannerMode,
  RutaCobranzaPlannerResult,
} from '@/server/services/ruta-cobranza-planner';

export type CobranzaRouteBulkExportFormat = 'zip' | 'pdf';

type RouteFilters = RutaCobranzaPlannerResult['filters'];

type RouteBulkExportInput = {
  creditoIds: string[];
  filters: RouteFilters;
  format: CobranzaRouteBulkExportFormat;
};

function sanitizeFileNamePart(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function getModeLabel(mode: RutaCobranzaPlannerMode) {
  if (mode === 'urgent') return 'urgencia';
  if (mode === 'verification') return 'verificacion';
  return 'balanceada';
}

function buildRouteExportBaseName(filters: RouteFilters, count: number) {
  return [
    'expedientes-ruta-cobranza',
    sanitizeFileNamePart(filters.occurredAt),
    getModeLabel(filters.mode),
    `${count}-casos`,
  ].join('-');
}

async function resolveExpedientes(input: {
  creditoIds: string[];
  occurredAt: string;
}) {
  const creditoIds = Array.from(new Set(input.creditoIds));
  const expedientes = await Promise.all(
    creditoIds.map(async (creditoId) => ({
      creditoId,
      expediente: await getCobranzaExpedienteCorto({
        creditoId,
        occurredAt: input.occurredAt,
      }),
    })),
  );

  const missing = expedientes.filter((item) => !item.expediente).map((item) => item.creditoId);
  if (missing.length > 0) {
    throw new AppError(
      `No se pudieron cargar ${missing.length} expediente(s) de la ruta seleccionada.`,
      'ROUTE_EXPEDIENTE_EXPORT_INCOMPLETE',
      409,
    );
  }

  return expedientes.map((item) => item.expediente!);
}

async function buildZipExport(input: {
  expedientes: Awaited<ReturnType<typeof resolveExpedientes>>;
  baseName: string;
}) {
  const zip = new JSZip();

  for (const expediente of input.expedientes) {
    const file = await generateCobranzaExpedientePdf(expediente);
    zip.file(file.fileName, file.bytes);
  }

  const bytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return {
    bytes,
    fileName: `${input.baseName}.zip`,
    contentType: 'application/zip',
  };
}

async function buildConsolidatedPdfExport(input: {
  expedientes: Awaited<ReturnType<typeof resolveExpedientes>>;
  baseName: string;
}) {
  const consolidated = await PDFDocument.create();

  for (const expediente of input.expedientes) {
    const file = await generateCobranzaExpedientePdf(expediente);
    const source = await PDFDocument.load(file.bytes);
    const pages = await consolidated.copyPages(source, source.getPageIndices());

    pages.forEach((page) => {
      consolidated.addPage(page);
    });
  }

  const bytes = await consolidated.save();

  return {
    bytes,
    fileName: `${input.baseName}.pdf`,
    contentType: 'application/pdf',
  };
}

export async function exportCobranzaRouteExpedientes(input: RouteBulkExportInput) {
  const expedientes = await resolveExpedientes({
    creditoIds: input.creditoIds,
    occurredAt: input.filters.occurredAt,
  });

  if (!expedientes.length) {
    throw new AppError(
      'La ruta seleccionada no tiene expedientes para exportar.',
      'ROUTE_EXPEDIENTE_EXPORT_EMPTY',
      404,
    );
  }

  const baseName = buildRouteExportBaseName(input.filters, expedientes.length);

  if (input.format === 'pdf') {
    return buildConsolidatedPdfExport({ expedientes, baseName });
  }

  return buildZipExport({ expedientes, baseName });
}
