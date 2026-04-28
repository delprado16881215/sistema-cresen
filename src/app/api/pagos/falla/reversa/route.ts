import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PERMISSIONS } from '@/config/permissions';
import { requireApiPermission } from '@/server/policies/guard';
import { reverseFallaSchema } from '@/server/validators/pago';
import { reverseFalla } from '@/server/services/pagos-service';
import { AppError, toErrorMessage } from '@/lib/errors';

export async function POST(request: Request) {
  try {
    const session = await requireApiPermission(PERMISSIONS.PAGOS_WRITE);
    const payload = await request.json();
    const parsed = reverseFallaSchema.parse(payload);
    const result = await reverseFalla(parsed, session.user.id);
    return NextResponse.json(result);
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
