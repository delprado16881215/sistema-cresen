import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PERMISSIONS } from '@/config/permissions';
import { requireApiPermission } from '@/server/policies/guard';
import { createCreditoSchema } from '@/server/validators/credito';
import { createCredito } from '@/server/services/creditos-service';
import { AppError, toErrorMessage } from '@/lib/errors';

export async function POST(request: Request) {
  try {
    const session = await requireApiPermission(PERMISSIONS.CREDITOS_WRITE);
    const payload = await request.json();
    const parsed = createCreditoSchema.parse(payload);
    const created = await createCredito(parsed, session.user.id);
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
