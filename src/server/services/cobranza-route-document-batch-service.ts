import { randomUUID } from 'node:crypto';
import { writeAuditLog } from '@/lib/audit';
import { AppError } from '@/lib/errors';
import {
  buildCobranzaPrejuridicaCitatorioSummary,
  type CobranzaPrejuridicaCitatorioSummary,
} from '@/server/services/cobranza-prejuridica-citatorio-summary-service';
import { generateCobranzaPrejuridicaCitatorioPdf } from '@/server/services/cobranza-prejuridica-citatorio-pdf-service';
import type {
  RutaCobranzaPlannerMode,
  RutaCobranzaPlannerResult,
} from '@/server/services/ruta-cobranza-planner';

export type CobranzaRouteDocumentType = 'citatorio_primera_visita';
export type CobranzaRouteDocumentFormat = 'pdf';

type RouteFilters = RutaCobranzaPlannerResult['filters'];

type ExportCobranzaRouteDocumentInput = {
  documentType: CobranzaRouteDocumentType;
  format: CobranzaRouteDocumentFormat;
  creditoIds: string[];
  filters: RouteFilters;
  routeLabel?: string | null;
  generatedBy: {
    userId: string;
    userName: string;
  };
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

function buildFallbackRouteLabel(filters: RouteFilters) {
  return [
    'Ruta',
    getModeLabel(filters.mode),
    filters.occurredAt,
    filters.supervisionId || 'sin-supervision',
    filters.promotoriaId || 'sin-promotoria',
    filters.zone || 'sin-zona',
  ].join(' · ');
}

function buildBaseFileName(filters: RouteFilters, creditCount: number) {
  return [
    'citatorios-primera-visita-ruta-cobranza',
    sanitizeFileNamePart(filters.occurredAt),
    getModeLabel(filters.mode),
    `${creditCount}-creditos`,
  ].join('-');
}

async function resolveCitatorioSummaries(input: {
  creditoIds: string[];
  filters: RouteFilters;
  routeLabel: string;
  generatedAt: Date;
  generatedByName: string;
}) {
  const creditoIds = Array.from(new Set(input.creditoIds));
  const summaries = await Promise.all(
    creditoIds.map((creditoId) =>
      buildCobranzaPrejuridicaCitatorioSummary({
        creditoId,
        occurredAt: input.filters.occurredAt,
        routeLabel: input.routeLabel,
        generatedAt: input.generatedAt,
        generatedByName: input.generatedByName,
      }),
    ),
  );

  return summaries as CobranzaPrejuridicaCitatorioSummary[];
}

async function exportCitatorioPrimeraVisita(input: ExportCobranzaRouteDocumentInput) {
  const generatedAt = new Date();
  const routeLabel = input.routeLabel?.trim() || buildFallbackRouteLabel(input.filters);
  const summaries = await resolveCitatorioSummaries({
    creditoIds: input.creditoIds,
    filters: input.filters,
    routeLabel,
    generatedAt,
    generatedByName: input.generatedBy.userName,
  });

  if (!summaries.length) {
    throw new AppError(
      'La ruta seleccionada no tiene creditos para exportar.',
      'ROUTE_DOCUMENT_EXPORT_EMPTY',
      404,
    );
  }

  const fileName = `${buildBaseFileName(input.filters, summaries.length)}.pdf`;
  const file = await generateCobranzaPrejuridicaCitatorioPdf({
    summaries,
    fileName,
  });

  const batchId = randomUUID();
  await writeAuditLog({
    userId: input.generatedBy.userId,
    module: 'cobranza_documentos',
    entity: 'citatorio_primera_visita',
    entityId: batchId,
    action: 'GENERATE',
    afterJson: {
      batchId,
      documentType: input.documentType,
      outputFormat: input.format,
      creditCount: summaries.length,
      fileName,
      creditoIds: summaries.map((summary) => summary.creditoId),
      creditos: summaries.map((summary) => ({
        creditoId: summary.creditoId,
        creditoFolio: summary.identification.creditoFolio,
      })),
      occurredAt: input.filters.occurredAt,
      routeFilters: input.filters,
      routeLabel,
      generatedAt: generatedAt.toISOString(),
      generatedByUserId: input.generatedBy.userId,
      generatedByName: input.generatedBy.userName,
    },
  });

  return file;
}

export async function exportCobranzaRouteDocument(input: ExportCobranzaRouteDocumentInput) {
  if (input.documentType === 'citatorio_primera_visita') {
    return exportCitatorioPrimeraVisita(input);
  }

  throw new AppError(
    `Documento no soportado: ${String(input.documentType)}`,
    'ROUTE_DOCUMENT_EXPORT_UNSUPPORTED',
    422,
  );
}
