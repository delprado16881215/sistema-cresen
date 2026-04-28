import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PERMISSIONS } from '@/config/permissions';
import { AppError, toErrorMessage } from '@/lib/errors';
import { requireApiPermission } from '@/server/policies/guard';
import { updatePromesaPagoEstado } from '@/server/services/promesas-pago-service';
import { updatePromesaPagoEstadoSchema } from '@/server/validators/cobranza-operativa';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ promesaPagoId: string }> },
) {
  try {
    const session = await requireApiPermission(PERMISSIONS.PAGOS_WRITE);
    const { promesaPagoId } = await context.params;
    const payload = await request.json();
    const parsed = updatePromesaPagoEstadoSchema.parse(payload);
    const updated = await updatePromesaPagoEstado(promesaPagoId, parsed, session.user.id);
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: 'Datos inválidos', issues: error.flatten() }, { status: 422 });
    }
    if (error instanceof AppError) {
      return NextResponse.json({ message: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ message: toErrorMessage(error) }, { status: 500 });
  }
}
