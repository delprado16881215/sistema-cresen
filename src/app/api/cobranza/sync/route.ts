import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PERMISSIONS } from '@/config/permissions';
import { AppError, toErrorMessage } from '@/lib/errors';
import { requireApiPermission } from '@/server/policies/guard';
import { syncCobranzaOfflineEvents } from '@/server/services/cobranza-sync-service';
import { cobranzaSyncRequestSchema } from '@/server/validators/cobranza-offline';

export async function POST(request: Request) {
  try {
    const session = await requireApiPermission(PERMISSIONS.PAGOS_WRITE);
    const payload = await request.json();
    const parsed = cobranzaSyncRequestSchema.parse(payload);
    const result = await syncCobranzaOfflineEvents(parsed.events, session.user.id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: 'Eventos inválidos', issues: error.flatten() }, { status: 422 });
    }
    if (error instanceof AppError) {
      return NextResponse.json({ message: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ message: toErrorMessage(error) }, { status: 500 });
  }
}
