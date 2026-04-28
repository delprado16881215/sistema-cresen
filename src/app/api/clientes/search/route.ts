import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PERMISSIONS } from '@/config/permissions';
import { requireApiPermission } from '@/server/policies/guard';
import { searchClientesForPicker } from '@/server/repositories/cliente-repository';
import { toErrorMessage } from '@/lib/errors';

const searchSchema = z.object({
  q: z.string().trim().max(100).optional(),
  excludeId: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

export async function GET(request: Request) {
  try {
    await requireApiPermission(PERMISSIONS.CREDITOS_WRITE);

    const { searchParams } = new URL(request.url);
    const parsed = searchSchema.parse({
      q: searchParams.get('q') ?? undefined,
      excludeId: searchParams.get('excludeId') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
    });

    const rows = await searchClientesForPicker(parsed);
    return NextResponse.json({ rows });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: 'Parámetros inválidos', issues: error.flatten() }, { status: 422 });
    }

    return NextResponse.json({ message: toErrorMessage(error) }, { status: 500 });
  }
}
