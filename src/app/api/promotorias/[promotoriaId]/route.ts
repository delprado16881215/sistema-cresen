import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PERMISSIONS } from '@/config/permissions';
import { requireApiPermission } from '@/server/policies/guard';
import { AppError, toErrorMessage } from '@/lib/errors';
import { updatePromotoria } from '@/server/services/promotorias-service';
import { updatePromotoriaSchema } from '@/server/validators/promotoria';

const paramsSchema = z.object({ promotoriaId: z.string().cuid() });

export async function PATCH(request: Request, context: { params: Promise<{ promotoriaId: string }> }) {
  try {
    const session = await requireApiPermission(PERMISSIONS.PROMOTORIAS_WRITE);
    const { promotoriaId } = paramsSchema.parse(await context.params);
    const payload = await request.json();
    const parsed = updatePromotoriaSchema.parse({ ...payload, id: promotoriaId });
    const updated = await updatePromotoria(parsed, session.user.id);
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
