import { prisma } from '@/lib/prisma';
import { findActivePromotoriasForCobranza } from '@/server/repositories/pago-repository';

function formatDateLabel(value: string | Date | null) {
  if (!value) return null;
  const iso =
    value instanceof Date ? value.toISOString().slice(0, 10) : value;
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function toNumber(value: { toString(): string } | number | string | null | undefined) {
  return Number(value ?? 0);
}

function buildAddressLine(input: {
  address: string | null;
  neighborhood: string | null;
  city: string | null;
}) {
  return [input.address, input.neighborhood, input.city].filter(Boolean).join(', ');
}

function buildObservationLines(input: {
  avalLabel: string | null;
  avalPhone: string | null;
  avalAddressLine: string | null;
  notes: string | null;
  referencesNotes: string | null;
  observations: string | null;
}) {
  return [
    input.avalLabel
      ? [
          `Aval: ${input.avalLabel}`,
          input.avalAddressLine,
          input.avalPhone,
        ]
          .filter(Boolean)
          .join(' · ')
      : null,
    input.notes ? `Nota del crédito: ${input.notes}` : null,
    input.referencesNotes ? `Referencias: ${input.referencesNotes}` : null,
    input.observations ? `Obs. cliente: ${input.observations}` : null,
  ].filter(Boolean) as string[];
}

export type SalePaymentSheetWeekColumn = {
  installmentNumber: number;
  label: string;
  dueDateIso: string;
  dueDateLabel: string;
};

export type SalePaymentSheetRow = {
  creditoId: string;
  folio: string;
  clienteCode: string;
  clienteName: string;
  clienteLabel: string;
  phone: string | null;
  addressLine: string;
  avalLabel: string | null;
  avalPhone: string | null;
  avalAddressLine: string | null;
  weeklyAmount: number;
  principalAmount: number;
  totalPayableAmount: number;
  totalWeeks: number;
  observationLines: string[];
  activeInstallmentNumbers: number[];
};

export type SalePaymentSheetGroup = {
  controlNumber: number | null;
  controlLabel: string;
  folioLabel: string;
  saleDateIso: string;
  saleDateLabel: string;
  firstDueDateIso: string | null;
  firstDueDateLabel: string | null;
  promotoriaId: string;
  promotoriaName: string;
  supervisionName: string | null;
  clientsCount: number;
  totalPrincipalAmount: number;
  totalWeeklyAmount: number;
  totalPayableAmount: number;
  maxWeeks: number;
  weekColumns: SalePaymentSheetWeekColumn[];
  rows: SalePaymentSheetRow[];
};

export type SalePaymentSheetViewData = {
  promotorias: Array<{
    id: string;
    code: string;
    name: string;
    supervision: { id: string; name: string } | null;
  }>;
  selectedPromotoriaId?: string;
  selectedSaleDate?: string;
  selectedControlNumber?: number;
  groups: SalePaymentSheetGroup[];
  selectedGroup: SalePaymentSheetGroup | null;
};

export async function getSalePaymentSheetViewData(input: {
  promotoriaId?: string;
  saleDate?: string;
  controlNumber?: number;
}): Promise<SalePaymentSheetViewData> {
  const promotorias = await findActivePromotoriasForCobranza();

  if (!input.promotoriaId || !input.saleDate) {
    return {
      promotorias,
      selectedPromotoriaId: input.promotoriaId,
      selectedSaleDate: input.saleDate,
      selectedControlNumber: input.controlNumber,
      groups: [],
      selectedGroup: null,
    };
  }

  const credits = await prisma.credito.findMany({
    where: {
      promotoriaId: input.promotoriaId,
      cancelledAt: null,
      startDate: {
        gte: new Date(`${input.saleDate}T00:00:00.000Z`),
        lte: new Date(`${input.saleDate}T23:59:59.999Z`),
      },
    },
    select: {
      id: true,
      folio: true,
      controlNumber: true,
      startDate: true,
      principalAmount: true,
      weeklyAmount: true,
      totalPayableAmount: true,
      totalWeeks: true,
      notes: true,
      createdAt: true,
      cliente: {
        select: {
          code: true,
          fullName: true,
          phone: true,
          address: true,
          neighborhood: true,
          city: true,
          referencesNotes: true,
          observations: true,
        },
      },
      aval: {
        select: {
          code: true,
          fullName: true,
          phone: true,
          address: true,
          neighborhood: true,
          city: true,
        },
      },
      promotoria: {
        select: {
          id: true,
          name: true,
          supervision: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      schedules: {
        select: {
          installmentNumber: true,
          dueDate: true,
        },
        orderBy: [{ installmentNumber: 'asc' }],
      },
    },
    orderBy: [{ controlNumber: 'asc' }, { createdAt: 'asc' }],
  });

  const groupedCredits = new Map<string, typeof credits>();
  for (const credit of credits) {
    const key = credit.controlNumber == null ? `NO_CONTROL:${credit.id}` : `CONTROL:${credit.controlNumber}`;
    const existing = groupedCredits.get(key) ?? [];
    existing.push(credit);
    groupedCredits.set(key, existing);
  }

  const groups: SalePaymentSheetGroup[] = [];
  for (const groupCredits of groupedCredits.values()) {
    const firstCredit = groupCredits[0];
    if (!firstCredit) continue;

    const weekMap = new Map<number, SalePaymentSheetWeekColumn>();
    for (const credit of groupCredits) {
      for (const schedule of credit.schedules) {
        if (weekMap.has(schedule.installmentNumber)) continue;
        const dueDateIso = toIsoDate(schedule.dueDate);
        weekMap.set(schedule.installmentNumber, {
          installmentNumber: schedule.installmentNumber,
          label: String(schedule.installmentNumber).padStart(2, '0'),
          dueDateIso,
          dueDateLabel: formatDateLabel(dueDateIso) ?? dueDateIso,
        });
      }
    }

    const weekColumns = [...weekMap.values()].sort(
      (left, right) => left.installmentNumber - right.installmentNumber,
    );
    const folios = groupCredits.map((credit) => credit.folio);
    const rows: SalePaymentSheetRow[] = groupCredits.map((credit) => ({
      creditoId: credit.id,
      folio: credit.folio,
      clienteCode: credit.cliente.code,
      clienteName: credit.cliente.fullName,
      clienteLabel: `${credit.cliente.code} · ${credit.cliente.fullName}`,
      phone: credit.cliente.phone,
      addressLine: buildAddressLine({
        address: credit.cliente.address,
        neighborhood: credit.cliente.neighborhood,
        city: credit.cliente.city,
      }),
      avalLabel: credit.aval ? `${credit.aval.code} · ${credit.aval.fullName}` : null,
      avalPhone: credit.aval?.phone ?? null,
      avalAddressLine: credit.aval
        ? buildAddressLine({
            address: credit.aval.address,
            neighborhood: credit.aval.neighborhood,
            city: credit.aval.city,
          })
        : null,
      weeklyAmount: toNumber(credit.weeklyAmount),
      principalAmount: toNumber(credit.principalAmount),
      totalPayableAmount: toNumber(credit.totalPayableAmount),
      totalWeeks: credit.totalWeeks,
      observationLines: buildObservationLines({
        avalLabel: credit.aval ? `${credit.aval.code} · ${credit.aval.fullName}` : null,
        avalPhone: credit.aval?.phone ?? null,
        avalAddressLine: credit.aval
          ? buildAddressLine({
              address: credit.aval.address,
              neighborhood: credit.aval.neighborhood,
              city: credit.aval.city,
            })
          : null,
        notes: credit.notes,
        referencesNotes: credit.cliente.referencesNotes,
        observations: credit.cliente.observations,
      }),
      activeInstallmentNumbers: credit.schedules.map((schedule) => schedule.installmentNumber),
    }));

    groups.push({
      controlNumber: firstCredit.controlNumber,
      controlLabel:
        firstCredit.controlNumber == null
          ? 'Sin NRO_CONTROL'
          : `Control ${firstCredit.controlNumber}`,
      folioLabel:
        folios.length <= 1
          ? folios[0] ?? '-'
          : `${folios[0] ?? '-'} a ${folios[folios.length - 1] ?? '-'}`,
      saleDateIso: toIsoDate(firstCredit.startDate),
      saleDateLabel: formatDateLabel(firstCredit.startDate) ?? toIsoDate(firstCredit.startDate),
      firstDueDateIso: weekColumns[0]?.dueDateIso ?? null,
      firstDueDateLabel: weekColumns[0]?.dueDateLabel ?? null,
      promotoriaId: firstCredit.promotoria.id,
      promotoriaName: firstCredit.promotoria.name,
      supervisionName: firstCredit.promotoria.supervision?.name ?? null,
      clientsCount: groupCredits.length,
      totalPrincipalAmount: groupCredits.reduce(
        (sum, credit) => sum + toNumber(credit.principalAmount),
        0,
      ),
      totalWeeklyAmount: groupCredits.reduce(
        (sum, credit) => sum + toNumber(credit.weeklyAmount),
        0,
      ),
      totalPayableAmount: groupCredits.reduce(
        (sum, credit) => sum + toNumber(credit.totalPayableAmount),
        0,
      ),
      maxWeeks: weekColumns.length,
      weekColumns,
      rows,
    });
  }

  groups.sort((left, right) => {
      const leftControl = left.controlNumber ?? Number.MAX_SAFE_INTEGER;
      const rightControl = right.controlNumber ?? Number.MAX_SAFE_INTEGER;
      return leftControl - rightControl;
    });

  const selectedGroup =
    groups.find((group) => group.controlNumber === input.controlNumber) ?? groups[0] ?? null;

  return {
    promotorias,
    selectedPromotoriaId: input.promotoriaId,
    selectedSaleDate: input.saleDate,
    selectedControlNumber: selectedGroup?.controlNumber ?? input.controlNumber,
    groups,
    selectedGroup,
  };
}
