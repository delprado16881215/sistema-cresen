import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PERMISSIONS } from '@/config/permissions';
import { AppError, toErrorMessage } from '@/lib/errors';
import { requireApiPermission } from '@/server/policies/guard';
import { getCobranzaExpedienteCorto } from '@/server/services/cobranza-expediente-service';
import { offlineRouteSnapshotsSchema } from '@/server/validators/cobranza-offline';

export async function POST(request: Request) {
  try {
    await requireApiPermission(PERMISSIONS.PAGOS_READ);
    const payload = await request.json();
    const parsed = offlineRouteSnapshotsSchema.parse(payload);

    const rows = await Promise.all(
      parsed.creditoIds.map(async (creditoId) => ({
        creditoId,
        expediente: await getCobranzaExpedienteCorto({
          creditoId,
          occurredAt: parsed.occurredAt,
        }),
      })),
    );

    return NextResponse.json({
      rows: rows.filter((item) => item.expediente),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: 'Solicitud inválida', issues: error.flatten() }, { status: 422 });
    }
    if (error instanceof AppError) {
      return NextResponse.json({ message: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ message: toErrorMessage(error) }, { status: 500 });
  }
}
