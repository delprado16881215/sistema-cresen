import { AppError } from '@/lib/errors';
import { getCobranzaCaseDetail } from '@/server/services/cobranza-service';

export type CobranzaPrejuridicaCitatorioSummary = {
  creditoId: string;
  header: {
    fechaOperativa: string;
    fechaOperativaLabel: string;
    promotoria: string;
    supervision: string;
  };
  identification: {
    creditoFolio: string;
    clienteNombre: string;
    clienteCodigo: string;
    clienteDomicilio: string;
  };
  customer: {
    telefono: string;
    avalLabel: string;
  };
  financial: {
    montoColocado: number;
    semanasVencidas: number;
    multas: number;
    semanaExtra: number;
    saldoExigible: number;
  };
  operational: {
    fechaEmision: string;
    fechaEmisionLabel: string;
    ruta: string;
    usuarioGenerador: string;
  };
};

type BuildSummaryInput = {
  creditoId: string;
  occurredAt: string;
  routeLabel: string;
  generatedAt?: Date;
  generatedByName: string;
};

function buildAddress(parts: Array<string | null | undefined>) {
  const value = parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(', ');

  return value || 'Domicilio sin referencia registrada';
}

function formatDate(value: Date | string) {
  const date = typeof value === 'string' ? new Date(`${value}T12:00:00`) : value;
  if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value : value.toISOString();
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export async function buildCobranzaPrejuridicaCitatorioSummary(
  input: BuildSummaryInput,
): Promise<CobranzaPrejuridicaCitatorioSummary> {
  const detail = await getCobranzaCaseDetail({
    creditoId: input.creditoId,
    occurredAt: input.occurredAt,
  });

  if (!detail) {
    throw new AppError(
      `No se encontro el credito ${input.creditoId} para generar el citatorio.`,
      'COBRANZA_PREJURIDICA_CITATORIO_NOT_FOUND',
      404,
    );
  }

  const penalties = Number(
    detail.credito.penalties
      .filter((penalty) => penalty.penaltyStatus.code === 'PENDING')
      .reduce((sum, penalty) => sum + Number(penalty.amount), 0)
      .toFixed(2),
  );

  const saldoExigible = Number((detail.actionable.totalAmount + penalties).toFixed(2));
  const generatedAt = input.generatedAt ?? new Date();

  return {
    creditoId: detail.credito.id,
    header: {
      fechaOperativa: input.occurredAt,
      fechaOperativaLabel: formatDate(input.occurredAt),
      promotoria: detail.credito.promotoria.name,
      supervision: detail.credito.promotoria.supervision?.name ?? 'Sin supervision',
    },
    identification: {
      creditoFolio: detail.credito.folio,
      clienteNombre: detail.credito.cliente.fullName,
      clienteCodigo: detail.credito.cliente.code,
      clienteDomicilio: buildAddress([
        detail.credito.cliente.address,
        detail.credito.cliente.neighborhood,
        detail.credito.cliente.city,
        detail.credito.cliente.state,
      ]),
    },
    customer: {
      telefono: detail.credito.cliente.phone ?? detail.credito.cliente.secondaryPhone ?? 'Sin telefono registrado',
      avalLabel: detail.credito.aval
        ? `${detail.credito.aval.code} · ${detail.credito.aval.fullName}`
        : 'Sin aval registrado',
    },
    financial: {
      montoColocado: Number(detail.credito.principalAmount),
      semanasVencidas: detail.pendingFailures.length,
      multas: penalties,
      semanaExtra: Number(detail.actionable.extraWeekAmount.toFixed(2)),
      saldoExigible,
    },
    operational: {
      fechaEmision: generatedAt.toISOString(),
      fechaEmisionLabel: formatDate(generatedAt),
      ruta: input.routeLabel,
      usuarioGenerador: input.generatedByName,
    },
  };
}
