import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PERMISSIONS } from '@/config/permissions';
import { AppError, toErrorMessage } from '@/lib/errors';
import { requireApiPermission } from '@/server/policies/guard';
import { getCobranzaExpedienteCorto } from '@/server/services/cobranza-expediente-service';
import { generateCobranzaExpedientePdf } from '@/server/services/cobranza-expediente-pdf-service';

export const runtime = 'nodejs';

const querySchema = z.object({
  creditoId: z.string().trim().min(1, 'creditoId es obligatorio'),
  occurredAt: z.string().trim().optional(),
});

export async function GET(request: Request) {
  try {
    await requireApiPermission(PERMISSIONS.PAGOS_READ);

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.parse({
      creditoId: searchParams.get('creditoId'),
      occurredAt: searchParams.get('occurredAt') ?? undefined,
    });

    const expediente = await getCobranzaExpedienteCorto({
      creditoId: parsed.creditoId,
      occurredAt: parsed.occurredAt,
    });

    if (!expediente) {
      throw new AppError('Expediente de cobranza no encontrado.', 'EXPEDIENTE_NOT_FOUND', 404);
    }

    const file = await generateCobranzaExpedientePdf(expediente);

    return new NextResponse(new Uint8Array(file.bytes), {
      headers: {
        'Content-Type': 'application/pdf',
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
