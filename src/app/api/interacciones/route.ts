import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PERMISSIONS } from '@/config/permissions';
import { AppError, toErrorMessage } from '@/lib/errors';
import { requireApiPermission } from '@/server/policies/guard';
import { createInteraccion, listInteracciones } from '@/server/services/interacciones-service';
import {
  createInteraccionSchema,
  listInteraccionesSchema,
} from '@/server/validators/cobranza-operativa';

export async function GET(request: Request) {
  try {
    await requireApiPermission(PERMISSIONS.PAGOS_READ);
    const { searchParams } = new URL(request.url);
    const parsed = listInteraccionesSchema.parse({
      clienteId: searchParams.get('clienteId') ?? undefined,
      creditoId: searchParams.get('creditoId') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
    });

    const rows = await listInteracciones(parsed);
    return NextResponse.json({ rows });
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

export async function POST(request: Request) {
  try {
    const session = await requireApiPermission(PERMISSIONS.PAGOS_WRITE);
    const payload = await request.json();
    const parsed = createInteraccionSchema.parse(payload);
    const created = await createInteraccion(parsed, session.user.id);
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
