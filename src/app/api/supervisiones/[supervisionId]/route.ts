import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PERMISSIONS } from '@/config/permissions';
import { requireApiPermission } from '@/server/policies/guard';
import { AppError, toErrorMessage } from '@/lib/errors';
import { deactivateSupervision, updateSupervision } from '@/server/services/supervisiones-service';
import { updateSupervisionSchema } from '@/server/validators/supervision';

const paramsSchema = z.object({ supervisionId: z.string().cuid() });

export async function PATCH(request: Request, context: { params: Promise<{ supervisionId: string }> }) {
  try {
    const session = await requireApiPermission(PERMISSIONS.SUPERVISIONES_WRITE);
    const { supervisionId } = paramsSchema.parse(await context.params);
    const payload = await request.json();
    const parsed = updateSupervisionSchema.parse({ ...payload, id: supervisionId });
    const updated = await updateSupervision(parsed, session.user.id);
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

export async function DELETE(_request: Request, context: { params: Promise<{ supervisionId: string }> }) {
  try {
    const session = await requireApiPermission(PERMISSIONS.SUPERVISIONES_WRITE);
    const { supervisionId } = paramsSchema.parse(await context.params);
    const updated = await deactivateSupervision(supervisionId, session.user.id);
    return NextResponse.json(updated);
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
