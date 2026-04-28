import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PERMISSIONS } from '@/config/permissions';
import { AppError, toErrorMessage } from '@/lib/errors';
import { requireApiPermission } from '@/server/policies/guard';
import { changeCreditoLegalStatus } from '@/server/services/credito-legal-service';
import { changeCreditoLegalStatusSchema } from '@/server/validators/juridico';

type Params = Promise<{ creditoId: string }>;

export async function POST(
  request: Request,
  context: { params: Params },
) {
  try {
    const session = await requireApiPermission(PERMISSIONS.CREDITOS_WRITE);
    const { creditoId } = await context.params;
    const payload = await request.json();
    const parsed = changeCreditoLegalStatusSchema.parse(payload);

    const result = await changeCreditoLegalStatus({
      creditoId,
      payload: parsed,
      userId: session.user.id,
    });

    return NextResponse.json(result, { status: 201 });
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
