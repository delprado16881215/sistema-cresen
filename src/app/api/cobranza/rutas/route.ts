import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PERMISSIONS } from '@/config/permissions';
import { AppError, toErrorMessage } from '@/lib/errors';
import { requireApiPermission } from '@/server/policies/guard';
import { getRutaCobranzaPlan } from '@/server/services/ruta-cobranza-planner';
import { cobranzaRutasQuerySchema } from '@/server/validators/cobranza-rutas';

export async function GET(request: Request) {
  try {
    await requireApiPermission(PERMISSIONS.PAGOS_READ);

    const { searchParams } = new URL(request.url);
    const parsed = cobranzaRutasQuerySchema.parse({
      occurredAt: searchParams.get('occurredAt') ?? undefined,
      supervisionId: searchParams.get('supervisionId') ?? undefined,
      promotoriaId: searchParams.get('promotoriaId') ?? undefined,
      zone: searchParams.get('zone') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
      mode: searchParams.get('mode') ?? undefined,
    });

    const result = await getRutaCobranzaPlan(parsed);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: 'Parámetros inválidos', issues: error.flatten() }, { status: 422 });
    }
    if (error instanceof AppError) {
      return NextResponse.json({ message: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ message: toErrorMessage(error) }, { status: 500 });
  }
}
