import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PERMISSIONS } from '@/config/permissions';
import { AppError, toErrorMessage } from '@/lib/errors';
import { requireApiPermission } from '@/server/policies/guard';
import { updateExpedienteAlerta } from '@/server/services/expediente-alert-engine';
import { updateExpedienteAlertaSchema } from '@/server/validators/expediente-alertas';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ alertaId: string }> },
) {
  try {
    const session = await requireApiPermission(PERMISSIONS.PAGOS_WRITE);
    const { alertaId } = await context.params;
    const payload = await request.json();
    const parsed = updateExpedienteAlertaSchema.parse(payload);
    const updated = await updateExpedienteAlerta(alertaId, parsed, session.user.id);
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
