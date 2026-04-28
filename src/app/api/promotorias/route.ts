import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PERMISSIONS } from '@/config/permissions';
import { requireApiPermission } from '@/server/policies/guard';
import { AppError, toErrorMessage } from '@/lib/errors';
import { createPromotoria } from '@/server/services/promotorias-service';
import { createPromotoriaSchema } from '@/server/validators/promotoria';

export async function POST(request: Request) {
  try {
    const session = await requireApiPermission(PERMISSIONS.PROMOTORIAS_WRITE);
    const payload = await request.json();
    const parsed = createPromotoriaSchema.parse(payload);
    const created = await createPromotoria(parsed, session.user.id);
    return NextResponse.json(created, { status: 201 });
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
