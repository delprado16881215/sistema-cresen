import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PERMISSIONS } from '@/config/permissions';
import { AppError, toErrorMessage } from '@/lib/errors';
import { requireApiPermission } from '@/server/policies/guard';
import {
  exportCobranzaRouteExpedientes,
  type CobranzaRouteBulkExportFormat,
} from '@/server/services/cobranza-expediente-bulk-export-service';
import type { RutaCobranzaPlannerMode } from '@/server/services/ruta-cobranza-planner';

export const runtime = 'nodejs';

const modeSchema = z.enum(['balanced', 'urgent', 'verification'] satisfies [RutaCobranzaPlannerMode, ...RutaCobranzaPlannerMode[]]);
const formatSchema = z.enum(['zip', 'pdf'] satisfies [CobranzaRouteBulkExportFormat, ...CobranzaRouteBulkExportFormat[]]);

const payloadSchema = z.object({
  format: formatSchema.default('pdf'),
  creditoIds: z.array(z.string().trim().min(1)).min(1).max(60),
  filters: z.object({
    occurredAt: z.string().trim().min(1),
    supervisionId: z.string(),
    promotoriaId: z.string(),
    zone: z.string(),
    limit: z.number().int().min(1).max(40),
    mode: modeSchema,
  }),
});

export async function POST(request: Request) {
  try {
    await requireApiPermission(PERMISSIONS.PAGOS_READ);
    const payload = await request.json();
    const parsed = payloadSchema.parse(payload);

    const file = await exportCobranzaRouteExpedientes({
      creditoIds: parsed.creditoIds,
      filters: parsed.filters,
      format: parsed.format,
    });

    return new NextResponse(new Uint8Array(file.bytes), {
      headers: {
        'Content-Type': file.contentType,
        'Content-Disposition': `attachment; filename="${file.fileName}"`,
        'Cache-Control': 'no-store, must-revalidate',
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Solicitud inválida', issues: error.flatten() },
        { status: 422 },
      );
    }
    if (error instanceof AppError) {
      return NextResponse.json(
        { message: error.message, code: error.code },
        { status: error.status },
      );
    }
    return NextResponse.json({ message: toErrorMessage(error) }, { status: 500 });
  }
}
