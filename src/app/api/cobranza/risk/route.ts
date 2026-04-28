import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PERMISSIONS } from '@/config/permissions';
import { AppError, toErrorMessage } from '@/lib/errors';
import { requireApiPermission } from '@/server/policies/guard';
import {
  calculateCobranzaRiskForCliente,
  calculateCobranzaRiskForCredito,
} from '@/server/services/cobranza-risk-engine';
import { cobranzaRiskQuerySchema } from '@/server/validators/cobranza-risk';

export async function GET(request: Request) {
  try {
    await requireApiPermission(PERMISSIONS.PAGOS_READ);

    const { searchParams } = new URL(request.url);
    const parsed = cobranzaRiskQuerySchema.parse({
      creditoId: searchParams.get('creditoId') ?? undefined,
      clienteId: searchParams.get('clienteId') ?? undefined,
      occurredAt: searchParams.get('occurredAt') ?? undefined,
    });

    if (parsed.creditoId) {
      const snapshot = await calculateCobranzaRiskForCredito({
        creditoId: parsed.creditoId,
        occurredAt: parsed.occurredAt,
      });
      return NextResponse.json(snapshot);
    }

    const snapshot = await calculateCobranzaRiskForCliente({
      clienteId: parsed.clienteId!,
      occurredAt: parsed.occurredAt,
    });
    return NextResponse.json(snapshot);
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
