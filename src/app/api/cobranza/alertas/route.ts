import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PERMISSIONS } from '@/config/permissions';
import { AppError, toErrorMessage } from '@/lib/errors';
import { requireApiPermission } from '@/server/policies/guard';
import {
  listExpedienteAlertas,
  syncExpedienteAlertasForCliente,
  syncExpedienteAlertasForCredito,
  syncExpedienteAlertasForPortfolio,
} from '@/server/services/expediente-alert-engine';
import { listExpedienteAlertasSchema } from '@/server/validators/expediente-alertas';

export async function GET(request: Request) {
  try {
    await requireApiPermission(PERMISSIONS.PAGOS_READ);
    const { searchParams } = new URL(request.url);
    const parsed = listExpedienteAlertasSchema.parse({
      clienteId: searchParams.get('clienteId') ?? undefined,
      creditoId: searchParams.get('creditoId') ?? undefined,
      promotoriaId: searchParams.get('promotoriaId') ?? undefined,
      supervisionId: searchParams.get('supervisionId') ?? undefined,
      tipoAlerta: searchParams.get('tipoAlerta') ?? undefined,
      severidad: searchParams.get('severidad') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      occurredAt: searchParams.get('occurredAt') ?? undefined,
      refresh: searchParams.get('refresh') ?? undefined,
    });

    if (parsed.creditoId && parsed.refresh !== false) {
      const rows = await syncExpedienteAlertasForCredito({
        creditoId: parsed.creditoId,
        occurredAt: parsed.occurredAt,
      });
      return NextResponse.json({ rows: rows.currentAlerts });
    }

    if (parsed.clienteId && parsed.refresh !== false) {
      const rows = await syncExpedienteAlertasForCliente({
        clienteId: parsed.clienteId,
        occurredAt: parsed.occurredAt,
      });
      return NextResponse.json({ rows });
    }

    if (!parsed.creditoId && !parsed.clienteId && parsed.refresh) {
      await syncExpedienteAlertasForPortfolio({
        occurredAt: parsed.occurredAt,
        supervisionId: parsed.supervisionId,
        promotoriaId: parsed.promotoriaId,
      });
    }

    const rows = await listExpedienteAlertas({
      clienteId: parsed.clienteId,
      creditoId: parsed.creditoId,
      promotoriaId: parsed.promotoriaId,
      tipoAlerta: parsed.tipoAlerta,
      severidad: parsed.severidad,
      status: parsed.status,
      isCurrent: true,
    });
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
