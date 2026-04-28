import type { LegalCreditStatus } from '@prisma/client';
import {
  getAllowedNextLegalStatuses,
  getClientePlacementStatusLabel,
  getLegalStatusActionLabel,
  JURIDICO_ACTIVE_STATUSES,
} from '@/lib/legal-status';
import {
  findJuridicoCases,
  findJuridicoPromotoriaOptions,
} from '@/server/repositories/juridico-repository';
import type { ListJuridicoCasesInput } from '@/server/validators/juridico';

export type JuridicoWorkbenchData = {
  rows: Array<{
    id: string;
    folio: string;
    loanNumber: string;
    controlNumber: string | null;
    startDate: string;
    sentToLegalAt: string | null;
    legalStatus: LegalCreditStatus;
    legalStatusLabel: string;
    legalStatusChangedAt: string | null;
    legalStatusReason: string | null;
    legalStatusNotes: string | null;
    creditStatusName: string;
    cliente: {
      id: string;
      code: string;
      fullName: string;
      phone: string;
      secondaryPhone: string | null;
      placementStatus: 'ELIGIBLE' | 'BLOCKED_LEGAL';
      placementStatusLabel: string;
      placementBlockReason: string | null;
    };
    promotoria: {
      id: string;
      code: string;
      name: string;
      supervisionId: string | null;
      supervisionName: string | null;
    };
    latestEvent: {
      id: string;
      eventType: string;
      effectiveDate: string;
      motivo: string;
      observaciones: string | null;
      createdAt: string;
      createdByName: string;
      summary: string;
    } | null;
    links: {
      creditHref: string;
      clientHref: string;
    };
    allowedNextStatuses: Array<{
      code: LegalCreditStatus;
      label: string;
    }>;
  }>;
  filters: {
    promotoriaId: string;
    supervisionId: string;
    legalStatus: 'all' | 'PRELEGAL' | 'LEGAL_REVIEW' | 'IN_LAWSUIT';
    sentToLegalDate: string;
  };
  options: {
    supervision: Array<{ id: string; name: string }>;
    promotoria: Array<{ id: string; code: string; name: string; supervisionId: string | null }>;
    legalStatus: Array<{ value: 'all' | 'PRELEGAL' | 'LEGAL_REVIEW' | 'IN_LAWSUIT'; label: string }>;
  };
  metrics: {
    total: number;
    prelegal: number;
    legalReview: number;
    inLawsuit: number;
  };
};

export async function getJuridicoWorkbenchData(input: ListJuridicoCasesInput): Promise<JuridicoWorkbenchData> {
  const [rows, promotorias] = await Promise.all([
    findJuridicoCases({
      promotoriaId: input.promotoriaId,
      supervisionId: input.supervisionId,
      legalStatus: input.legalStatus === 'all' ? undefined : input.legalStatus,
      sentToLegalDate: input.sentToLegalDate,
    }),
    findJuridicoPromotoriaOptions(),
  ]);

  const supervisionOptions = [...new Map(
    promotorias
      .filter((promotoria) => promotoria.supervision)
      .map((promotoria) => [
        promotoria.supervision!.id,
        {
          id: promotoria.supervision!.id,
          name: promotoria.supervision!.name,
        },
      ]),
  ).values()].sort((left, right) => left.name.localeCompare(right.name));

  const promotoriaOptions = promotorias
    .filter((promotoria) =>
      input.supervisionId ? promotoria.supervision?.id === input.supervisionId : true,
    )
    .map((promotoria) => ({
      id: promotoria.id,
      code: promotoria.code,
      name: promotoria.name,
      supervisionId: promotoria.supervision?.id ?? null,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  const enrichedRows = rows.map((row) => ({
    ...row,
    cliente: {
      ...row.cliente,
      placementStatusLabel: getClientePlacementStatusLabel(row.cliente.placementStatus),
    },
    allowedNextStatuses: getAllowedNextLegalStatuses(row.legalStatus)
      .filter((status): status is Exclude<LegalCreditStatus, 'NONE'> => status !== 'NONE')
      .map((status) => ({
        code: status,
        label: getLegalStatusActionLabel(status),
      })),
  }));

  const legalStatusOptions: JuridicoWorkbenchData['options']['legalStatus'] = [
    { value: 'all', label: 'Todos los estados' },
    ...JURIDICO_ACTIVE_STATUSES.map((status) => ({
      value: status as 'PRELEGAL' | 'LEGAL_REVIEW' | 'IN_LAWSUIT',
      label:
        status === 'PRELEGAL'
          ? 'Prejurídico'
          : status === 'LEGAL_REVIEW'
            ? 'Revisión legal'
            : 'En demanda',
    })),
  ];

  return {
    rows: enrichedRows,
    filters: {
      promotoriaId: input.promotoriaId ?? '',
      supervisionId: input.supervisionId ?? '',
      legalStatus: input.legalStatus,
      sentToLegalDate: input.sentToLegalDate ?? '',
    },
    options: {
      supervision: supervisionOptions,
      promotoria: promotoriaOptions,
      legalStatus: legalStatusOptions,
    },
    metrics: {
      total: enrichedRows.length,
      prelegal: enrichedRows.filter((row) => row.legalStatus === 'PRELEGAL').length,
      legalReview: enrichedRows.filter((row) => row.legalStatus === 'LEGAL_REVIEW').length,
      inLawsuit: enrichedRows.filter((row) => row.legalStatus === 'IN_LAWSUIT').length,
    },
  };
}
