import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PERMISSIONS } from '@/config/permissions';
import { AppError, toErrorMessage } from '@/lib/errors';
import { requireApiPermission } from '@/server/policies/guard';
import {
  exportCobranzaRouteDocument,
  type CobranzaRouteDocumentFormat,
  type CobranzaRouteDocumentType,
} from '@/server/services/cobranza-route-document-batch-service';
import type { RutaCobranzaPlannerMode } from '@/server/services/ruta-cobranza-planner';

export const runtime = 'nodejs';

const modeSchema = z.enum(['balanced', 'urgent', 'verification'] satisfies [RutaCobranzaPlannerMode, ...RutaCobranzaPlannerMode[]]);
const documentTypeSchema = z.enum(['citatorio_primera_visita'] satisfies [CobranzaRouteDocumentType, ...CobranzaRouteDocumentType[]]);
const formatSchema = z.enum(['pdf'] satisfies [CobranzaRouteDocumentFormat, ...CobranzaRouteDocumentFormat[]]);

const payloadSchema = z.object({
  documentType: documentTypeSchema,
  format: formatSchema.default('pdf'),
  routeLabel: z.string().trim().max(240).optional().nullable(),
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
    const session = await requireApiPermission(PERMISSIONS.PAGOS_READ);
    const payload = await request.json();
    const parsed = payloadSchema.parse(payload);

    const file = await exportCobranzaRouteDocument({
      documentType: parsed.documentType,
      format: parsed.format,
      routeLabel: parsed.routeLabel,
      creditoIds: parsed.creditoIds,
      filters: parsed.filters,
      generatedBy: {
        userId: session.user.id,
        userName:
          (typeof session.user.name === 'string' && session.user.name.trim()) ||
          (typeof session.user.email === 'string' && session.user.email.trim()) ||
          session.user.id,
      },
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
        { message: 'Solicitud invalida', issues: error.flatten() },
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
