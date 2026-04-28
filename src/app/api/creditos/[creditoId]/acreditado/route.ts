import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PERMISSIONS } from '@/config/permissions';
import { AppError, toErrorMessage } from '@/lib/errors';
import { requireApiPermission } from '@/server/policies/guard';
import { correctCreditoAcreditado } from '@/server/services/creditos-service';
import { correctCreditoAcreditadoSchema } from '@/server/validators/credito';

const idSchema = z.object({ creditoId: z.string().cuid() });
const ALLOWED_ROLES = new Set(['SUPER_ADMIN', 'ADMIN_FINANCIERA']);

export const runtime = 'nodejs';

export async function PATCH(request: Request, context: { params: Promise<{ creditoId: string }> }) {
  try {
    const session = await requireApiPermission(PERMISSIONS.CREDITOS_WRITE);
    const roles = (session.user.roles as string[]) ?? [];
    if (!roles.some((role) => ALLOWED_ROLES.has(role))) {
      return NextResponse.json(
        { message: 'Solo un administrador puede corregir el acreditado de un crédito.' },
        { status: 403 },
      );
    }

    const { creditoId } = idSchema.parse(await context.params);
    const payload = await request.json();
    const parsed = correctCreditoAcreditadoSchema.parse({
      ...payload,
      creditoId,
    });

    const updated = await correctCreditoAcreditado(parsed, session.user.id);
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
