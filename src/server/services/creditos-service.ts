import { AppError } from '@/lib/errors';
import { getClientePlacementBlockMessage, isClientePlacementBlocked } from '@/lib/legal-status';
import { prisma } from '@/lib/prisma';
import { writeAuditLog } from '@/lib/audit';
import type { Prisma } from '@prisma/client';
import type {
  CorrectCreditoAvalInput,
  CorrectCreditoAcreditadoInput,
  CreateCreditoGroupInput,
  CreateCreditoInput,
} from '@/server/validators/credito';
import { calculateWeeklyAmount } from '@/modules/creditos/credit-calculations';

function formatLoanNumber(sequence: number): string {
  return `LN${String(sequence).padStart(6, '0')}`;
}

function formatCreditFolio(sequence: number, startDate: Date): string {
  const stamp = startDate.toISOString().slice(0, 10).replace(/-/g, '');
  return `CRED-${stamp}-${String(sequence).padStart(4, '0')}`;
}

async function generateCreditIdentifiers(tx: Prisma.TransactionClient, startDate: Date) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(2026031502)`;

  const lastCredito = await tx.credito.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { loanNumber: true },
  });

  const lastSequence = lastCredito
    ? Number.parseInt(lastCredito.loanNumber.replace(/^LN/, ''), 10)
    : 0;
  const nextSequence = (Number.isNaN(lastSequence) ? 0 : lastSequence) + 1;

  return {
    loanNumber: formatLoanNumber(nextSequence),
    folio: formatCreditFolio(nextSequence, startDate),
  };
}

function toDecimalString(value: number): string {
  return value.toFixed(2);
}

function buildWeeklyDueDate(startDate: Date, installmentNumber: number) {
  const dueDate = new Date(startDate);
  dueDate.setDate(dueDate.getDate() + installmentNumber * 7);
  return dueDate;
}

function subtractMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() - minutes * 60_000);
}

function buildGroupItemFingerprint(input: {
  clienteId: string;
  avalClienteId: string | null;
  principalAmount: string;
  totalWeeks: number;
}) {
  return [input.clienteId, input.avalClienteId ?? 'SIN_AVAL', input.principalAmount, input.totalWeeks].join('|');
}

function assertClientePlacementEligible(input: {
  fullName: string;
  placementStatus: Parameters<typeof isClientePlacementBlocked>[0];
}) {
  if (!isClientePlacementBlocked(input.placementStatus)) {
    return;
  }

  throw new AppError(
    `${getClientePlacementBlockMessage(input.placementStatus) ?? 'Cliente bloqueado'}: ${input.fullName}.`,
    'CLIENTE_BLOCKED_LEGAL',
    422,
  );
}

export async function createCredito(input: CreateCreditoInput, userId: string) {
  const startDate = new Date(input.startDate);

  const [cliente, aval, promotoria, planRule, activeStatus, pendingInstallmentStatus] =
    await Promise.all([
      prisma.cliente.findFirst({
        where: { id: input.clienteId, deletedAt: null, isActive: true },
        select: { id: true, fullName: true, promotoriaId: true, placementStatus: true },
      }),
      input.avalClienteId
        ? prisma.cliente.findFirst({
            where: { id: input.avalClienteId, deletedAt: null, isActive: true },
            select: { id: true, fullName: true },
          })
        : Promise.resolve(null),
      prisma.promotoria.findFirst({
        where: { id: input.promotoriaId, deletedAt: null, isActive: true },
        select: {
          id: true,
          name: true,
          supervision: {
            select: { id: true, name: true },
          },
        },
      }),
      prisma.creditPlanRule.findFirst({
        where: { code: input.planCode, isActive: true },
        orderBy: { version: 'desc' },
      }),
      prisma.creditStatusCatalog.findUnique({
        where: { code: 'ACTIVE' },
      }),
      prisma.installmentStatusCatalog.findUnique({
        where: { code: 'PENDING' },
      }),
    ]);

  if (!cliente) throw new AppError('Selecciona un cliente válido.', 'INVALID_CLIENTE', 422);
  assertClientePlacementEligible({
    fullName: cliente.fullName,
    placementStatus: cliente.placementStatus,
  });
  if (input.avalClienteId && !aval) throw new AppError('Selecciona un aval válido.', 'INVALID_AVAL', 422);
  if (aval && aval.id === cliente.id) {
    throw new AppError('El aval debe ser diferente al cliente acreditado.', 'INVALID_AVAL', 422);
  }
  if (!promotoria) throw new AppError('Selecciona una promotoría válida.', 'INVALID_PROMOTORIA', 422);
  if (!planRule?.weeklyFactor) throw new AppError('No existe un plan de crédito activo para el plazo seleccionado.', 'INVALID_PLAN', 422);
  if (!activeStatus) throw new AppError('No existe el estado ACTIVE para créditos.', 'CONFIGURATION_ERROR', 500);
  if (!pendingInstallmentStatus) {
    throw new AppError('No existe el estado PENDING para el cronograma.', 'CONFIGURATION_ERROR', 500);
  }

  const weeklyAmount = calculateWeeklyAmount(input.principalAmount, Number(planRule.weeklyFactor));

  const credito = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(2026032003)`;

    const duplicateCreatedAfter = subtractMinutes(new Date(), 10);
    const duplicateWhere: Prisma.CreditoWhereInput = {
      clienteId: cliente.id,
      promotoriaId: promotoria.id,
      startDate,
      principalAmount: toDecimalString(input.principalAmount),
      weeklyAmount: toDecimalString(weeklyAmount),
      totalWeeks: planRule.weeks,
      createdByUserId: userId,
      createdAt: {
        gte: duplicateCreatedAfter,
      },
      ...(aval ? { avalClienteId: aval.id } : { avalClienteId: null }),
    };

    const existingDuplicate = await tx.credito.findFirst({
      where: duplicateWhere,
      orderBy: { createdAt: 'asc' },
    });

    if (existingDuplicate) {
      return existingDuplicate;
    }

    const identifiers = await generateCreditIdentifiers(tx, startDate);

    const createData: Prisma.CreditoCreateInput = {
      folio: identifiers.folio,
      loanNumber: identifiers.loanNumber,
      cliente: { connect: { id: cliente.id } },
      promotoria: { connect: { id: promotoria.id } },
      creditPlanRule: { connect: { id: planRule.id } },
      creditStatus: { connect: { id: activeStatus.id } },
      createdByUser: { connect: { id: userId } },
      planCodeSnapshot: planRule.code,
      planVersionSnapshot: planRule.version,
      planWeeksSnapshot: planRule.weeks,
      planFactorSnapshot: planRule.weeklyFactor,
      principalAmount: toDecimalString(input.principalAmount),
      weeklyAmount: toDecimalString(weeklyAmount),
      totalWeeks: planRule.weeks,
      startDate,
      notes: input.notes ?? null,
      ...(aval ? { aval: { connect: { id: aval.id } } } : {}),
    };

    const created = await tx.credito.create({
      data: createData,
    });

    await tx.creditSchedule.createMany({
      data: Array.from({ length: planRule.weeks }, (_, index) => ({
        creditoId: created.id,
        installmentNumber: index + 1,
        dueDate: buildWeeklyDueDate(startDate, index + 1),
        expectedAmount: toDecimalString(weeklyAmount),
        paidAmount: '0.00',
        installmentStatusId: pendingInstallmentStatus.id,
      })),
    });

    return created;
  });

  await writeAuditLog({
    userId,
    module: 'creditos',
    entity: 'Credito',
    entityId: credito.id,
    action: 'CREATE',
    afterJson: {
      ...credito,
      clienteName: cliente.fullName,
      avalName: aval?.fullName ?? null,
      promotoriaName: promotoria.name,
      supervisionName: promotoria.supervision?.name ?? null,
      planCode: planRule.code,
    },
  });

  return credito;
}

export async function createCreditoGroup(input: CreateCreditoGroupInput, userId: string) {
  const startDate = new Date(input.startDate);

  const clienteIds = [...new Set(input.items.map((item) => item.clienteId))];
  const avalIds = [...new Set(input.items.map((item) => item.avalClienteId).filter((value): value is string => Boolean(value)))];
  const planCodes = [...new Set(input.items.map((item) => item.planCode))];

  const [promotoria, clientes, avales, planRules, activeStatus, pendingInstallmentStatus] = await Promise.all([
    prisma.promotoria.findFirst({
      where: { id: input.promotoriaId, deletedAt: null, isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        supervision: {
          select: { id: true, name: true },
        },
      },
    }),
    prisma.cliente.findMany({
      where: { id: { in: clienteIds }, deletedAt: null, isActive: true },
      select: { id: true, fullName: true, placementStatus: true },
    }),
    avalIds.length
      ? prisma.cliente.findMany({
          where: { id: { in: avalIds }, deletedAt: null, isActive: true },
          select: { id: true, fullName: true },
        })
      : Promise.resolve([]),
    prisma.creditPlanRule.findMany({
      where: { code: { in: planCodes }, isActive: true },
      orderBy: [{ code: 'asc' }, { version: 'desc' }],
    }),
    prisma.creditStatusCatalog.findUnique({ where: { code: 'ACTIVE' } }),
    prisma.installmentStatusCatalog.findUnique({ where: { code: 'PENDING' } }),
  ]);

  if (!promotoria) throw new AppError('Selecciona una promotoría válida.', 'INVALID_PROMOTORIA', 422);
  if (!activeStatus) throw new AppError('No existe el estado ACTIVE para créditos.', 'CONFIGURATION_ERROR', 500);
  if (!pendingInstallmentStatus) {
    throw new AppError('No existe el estado PENDING para el cronograma.', 'CONFIGURATION_ERROR', 500);
  }

  const clienteMap = new Map(clientes.map((cliente) => [cliente.id, cliente]));
  const avalMap = new Map(avales.map((aval) => [aval.id, aval]));
  const planRuleMap = new Map<string, (typeof planRules)[number]>();
  for (const planRule of planRules) {
    if (!planRuleMap.has(planRule.code)) {
      planRuleMap.set(planRule.code, planRule);
    }
  }

  const seenClientes = new Set<string>();
  const normalizedItems = input.items.map((item, index) => {
    const cliente = clienteMap.get(item.clienteId);
    if (!cliente) {
      throw new AppError(`El cliente en la fila ${index + 1} ya no existe o está inactivo.`, 'INVALID_CLIENTE', 422);
    }
    assertClientePlacementEligible({
      fullName: cliente.fullName,
      placementStatus: cliente.placementStatus,
    });

    if (seenClientes.has(item.clienteId)) {
      throw new AppError(`El cliente ${cliente.fullName} está repetido dentro de la misma venta.`, 'DUPLICATE_CLIENT_IN_GROUP', 422);
    }
    seenClientes.add(item.clienteId);

    const aval = item.avalClienteId ? avalMap.get(item.avalClienteId) : null;
    if (item.avalClienteId && !aval) {
      throw new AppError(`El aval en la fila ${index + 1} ya no existe o está inactivo.`, 'INVALID_AVAL', 422);
    }
    if (aval && aval.id === cliente.id) {
      throw new AppError(`El aval debe ser diferente al cliente en la fila ${index + 1}.`, 'INVALID_AVAL', 422);
    }

    const planRule = planRuleMap.get(item.planCode);
    if (!planRule?.weeklyFactor) {
      throw new AppError(`No existe un plan activo para ${item.planCode}.`, 'INVALID_PLAN', 422);
    }

    const weeklyAmount = calculateWeeklyAmount(item.principalAmount, Number(planRule.weeklyFactor));

    return {
      cliente,
      aval,
      planRule,
      principalAmount: item.principalAmount,
      weeklyAmount,
      totalWeeks: planRule.weeks,
      notes: item.notes ?? null,
      fingerprint: buildGroupItemFingerprint({
        clienteId: cliente.id,
        avalClienteId: aval?.id ?? null,
        principalAmount: toDecimalString(item.principalAmount),
        totalWeeks: planRule.weeks,
      }),
    };
  });

  const created = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(2026032004)`;

    const duplicateCreatedAfter = subtractMinutes(new Date(), 10);
    const recentCredits = await tx.credito.findMany({
      where: {
        promotoriaId: promotoria.id,
        startDate,
        createdByUserId: userId,
        createdAt: { gte: duplicateCreatedAfter },
        controlNumber: { not: null },
      },
      select: {
        id: true,
        folio: true,
        loanNumber: true,
        controlNumber: true,
        clienteId: true,
        avalClienteId: true,
        principalAmount: true,
        totalWeeks: true,
      },
      orderBy: [{ controlNumber: 'asc' }, { createdAt: 'asc' }],
    });

    const expectedFingerprints = normalizedItems.map((item) => item.fingerprint).sort();
    const creditsByControl = new Map<number, typeof recentCredits>();
    for (const credito of recentCredits) {
      if (credito.controlNumber == null) continue;
      const rows = creditsByControl.get(credito.controlNumber) ?? [];
      rows.push(credito);
      creditsByControl.set(credito.controlNumber, rows);
    }

    for (const [controlNumber, credits] of creditsByControl) {
      if (credits.length !== normalizedItems.length) continue;
      const fingerprints = credits
        .map((credito) =>
          buildGroupItemFingerprint({
            clienteId: credito.clienteId,
            avalClienteId: credito.avalClienteId,
            principalAmount: credito.principalAmount.toString(),
            totalWeeks: credito.totalWeeks,
          }),
        )
        .sort();

      if (fingerprints.join('||') === expectedFingerprints.join('||')) {
        return {
          controlNumber,
          createdCount: credits.length,
          duplicated: true,
          createdCredits: [] as Array<{
            id: string;
            clienteName: string;
            avalName: string | null;
            planCode: string;
          }>,
        };
      }
    }

    const lastControl = await tx.credito.findFirst({
      where: { promotoriaId: promotoria.id, controlNumber: { not: null } },
      orderBy: [{ controlNumber: 'desc' }],
      select: { controlNumber: true },
    });

    const nextControlNumber = (lastControl?.controlNumber ?? 0) + 1;

    const createdCredits: Array<{
      id: string;
      clienteName: string;
      avalName: string | null;
      planCode: string;
    }> = [];

    for (const item of normalizedItems) {
      const identifiers = await generateCreditIdentifiers(tx, startDate);
      const createdCredito = await tx.credito.create({
        data: {
          folio: identifiers.folio,
          loanNumber: identifiers.loanNumber,
          controlNumber: nextControlNumber,
          cliente: { connect: { id: item.cliente.id } },
          promotoria: { connect: { id: promotoria.id } },
          creditPlanRule: { connect: { id: item.planRule.id } },
          creditStatus: { connect: { id: activeStatus.id } },
          createdByUser: { connect: { id: userId } },
          planCodeSnapshot: item.planRule.code,
          planVersionSnapshot: item.planRule.version,
          planWeeksSnapshot: item.planRule.weeks,
          planFactorSnapshot: item.planRule.weeklyFactor,
          principalAmount: toDecimalString(item.principalAmount),
          weeklyAmount: toDecimalString(item.weeklyAmount),
          totalPayableAmount: toDecimalString(item.weeklyAmount * item.totalWeeks),
          totalWeeks: item.totalWeeks,
          startDate,
          notes: item.notes,
          ...(item.aval ? { aval: { connect: { id: item.aval.id } } } : {}),
        },
      });

      await tx.creditSchedule.createMany({
        data: Array.from({ length: item.totalWeeks }, (_, index) => ({
          creditoId: createdCredito.id,
          installmentNumber: index + 1,
          dueDate: buildWeeklyDueDate(startDate, index + 1),
          expectedAmount: toDecimalString(item.weeklyAmount),
          paidAmount: '0.00',
          installmentStatusId: pendingInstallmentStatus.id,
        })),
      });

      createdCredits.push({
        id: createdCredito.id,
        clienteName: item.cliente.fullName,
        avalName: item.aval?.fullName ?? null,
        planCode: item.planRule.code,
      });
    }

    return {
      controlNumber: nextControlNumber,
      createdCount: normalizedItems.length,
      duplicated: false,
      createdCredits,
    };
  });

  if (!created.duplicated) {
    for (const credito of created.createdCredits) {
      await writeAuditLog({
        userId,
        module: 'creditos',
        entity: 'Credito',
        entityId: credito.id,
        action: 'CREATE',
        afterJson: {
          clienteName: credito.clienteName,
          avalName: credito.avalName,
          promotoriaName: promotoria.name,
          supervisionName: promotoria.supervision?.name ?? null,
          planCode: credito.planCode,
          controlNumber: created.controlNumber,
          source: 'GROUP_SALE',
          startDate: input.startDate,
        },
      });
    }
  }

  return {
    ...created,
    promotoriaName: promotoria.name,
    startDate: input.startDate,
  };
}

export async function correctCreditoAcreditado(input: CorrectCreditoAcreditadoInput, userId: string) {
  const [credito, nuevoAcreditado] = await Promise.all([
    prisma.credito.findFirst({
      where: { id: input.creditoId, cancelledAt: null },
      select: {
        id: true,
        folio: true,
        loanNumber: true,
        clienteId: true,
        avalClienteId: true,
        promotoriaId: true,
        cliente: {
          select: {
            id: true,
            code: true,
            fullName: true,
            phone: true,
            promotoriaId: true,
          },
        },
        aval: {
          select: {
            id: true,
            code: true,
            fullName: true,
            phone: true,
          },
        },
        _count: {
          select: {
            payments: true,
            schedules: true,
            defaults: true,
            recoveries: true,
            advances: true,
            penalties: true,
          },
        },
      },
    }),
    prisma.cliente.findFirst({
      where: { id: input.clienteId, deletedAt: null, isActive: true },
      select: {
        id: true,
        code: true,
        fullName: true,
        phone: true,
        promotoriaId: true,
      },
    }),
  ]);

  if (!credito) {
    throw new AppError('No encontré el crédito a corregir.', 'CREDITO_NOT_FOUND', 404);
  }

  if (!nuevoAcreditado) {
    throw new AppError('Selecciona un acreditado válido y activo.', 'INVALID_CLIENTE', 422);
  }

  if (credito.clienteId === nuevoAcreditado.id) {
    throw new AppError('Ese cliente ya es el acreditado actual del crédito.', 'SAME_CREDITO_HOLDER', 422);
  }

  if (credito.avalClienteId && credito.avalClienteId === nuevoAcreditado.id) {
    throw new AppError('El aval no puede quedar asignado también como acreditado.', 'INVALID_AVAL', 422);
  }

  const updatedCredito = await prisma.credito.update({
    where: { id: credito.id },
    data: {
      clienteId: nuevoAcreditado.id,
      updatedByUserId: userId,
    },
    select: {
      id: true,
      folio: true,
      loanNumber: true,
      clienteId: true,
      updatedByUserId: true,
      cliente: {
        select: {
          id: true,
          code: true,
          fullName: true,
          phone: true,
          promotoriaId: true,
        },
      },
      aval: {
        select: {
          id: true,
          code: true,
          fullName: true,
          phone: true,
        },
      },
      _count: {
        select: {
          payments: true,
          schedules: true,
          defaults: true,
          recoveries: true,
          advances: true,
          penalties: true,
        },
      },
    },
  });

  await writeAuditLog({
    userId,
    module: 'creditos',
    entity: 'Credito',
    entityId: credito.id,
    action: 'CORRECT_HOLDER',
    beforeJson: {
      folio: credito.folio,
      loanNumber: credito.loanNumber,
      clienteId: credito.cliente.id,
      clienteCode: credito.cliente.code,
      clienteName: credito.cliente.fullName,
      clientePhone: credito.cliente.phone,
      avalId: credito.aval?.id ?? null,
      avalCode: credito.aval?.code ?? null,
      avalName: credito.aval?.fullName ?? null,
      relatedCounts: credito._count,
    },
    afterJson: {
      folio: updatedCredito.folio,
      loanNumber: updatedCredito.loanNumber,
      clienteId: updatedCredito.cliente.id,
      clienteCode: updatedCredito.cliente.code,
      clienteName: updatedCredito.cliente.fullName,
      clientePhone: updatedCredito.cliente.phone,
      avalId: updatedCredito.aval?.id ?? null,
      avalCode: updatedCredito.aval?.code ?? null,
      avalName: updatedCredito.aval?.fullName ?? null,
      relatedCounts: updatedCredito._count,
      correctedField: 'clienteId',
      reason: input.reason?.trim() || null,
    },
  });

  return {
    creditoId: updatedCredito.id,
    folio: updatedCredito.folio,
    loanNumber: updatedCredito.loanNumber,
    correctedField: 'clienteId',
    previousHolder: credito.cliente,
    nextHolder: updatedCredito.cliente,
    aval: updatedCredito.aval,
    relatedCounts: updatedCredito._count,
  };
}

export async function correctCreditoAval(input: CorrectCreditoAvalInput, userId: string) {
  const [credito, nuevoAval] = await Promise.all([
    prisma.credito.findFirst({
      where: { id: input.creditoId, cancelledAt: null },
      select: {
        id: true,
        folio: true,
        loanNumber: true,
        clienteId: true,
        avalClienteId: true,
        promotoriaId: true,
        cliente: {
          select: {
            id: true,
            code: true,
            fullName: true,
            phone: true,
            promotoriaId: true,
          },
        },
        aval: {
          select: {
            id: true,
            code: true,
            fullName: true,
            phone: true,
            promotoriaId: true,
          },
        },
        _count: {
          select: {
            payments: true,
            schedules: true,
            defaults: true,
            recoveries: true,
            advances: true,
            penalties: true,
          },
        },
      },
    }),
    prisma.cliente.findFirst({
      where: { id: input.clienteId, deletedAt: null, isActive: true },
      select: {
        id: true,
        code: true,
        fullName: true,
        phone: true,
        promotoriaId: true,
      },
    }),
  ]);

  if (!credito) {
    throw new AppError('No encontré el crédito a corregir.', 'CREDITO_NOT_FOUND', 404);
  }

  if (!nuevoAval) {
    throw new AppError('Selecciona un aval válido y activo.', 'INVALID_AVAL', 422);
  }

  if (credito.avalClienteId === nuevoAval.id) {
    throw new AppError('Ese cliente ya es el aval actual del crédito.', 'SAME_CREDIT_AVAL', 422);
  }

  if (credito.clienteId === nuevoAval.id) {
    throw new AppError('El acreditado no puede quedar asignado también como aval.', 'INVALID_AVAL', 422);
  }

  const updatedCredito = await prisma.credito.update({
    where: { id: credito.id },
    data: {
      avalClienteId: nuevoAval.id,
      updatedByUserId: userId,
    },
    select: {
      id: true,
      folio: true,
      loanNumber: true,
      avalClienteId: true,
      updatedByUserId: true,
      cliente: {
        select: {
          id: true,
          code: true,
          fullName: true,
          phone: true,
          promotoriaId: true,
        },
      },
      aval: {
        select: {
          id: true,
          code: true,
          fullName: true,
          phone: true,
          promotoriaId: true,
        },
      },
      _count: {
        select: {
          payments: true,
          schedules: true,
          defaults: true,
          recoveries: true,
          advances: true,
          penalties: true,
        },
      },
    },
  });

  await writeAuditLog({
    userId,
    module: 'creditos',
    entity: 'Credito',
    entityId: credito.id,
    action: 'CORRECT_AVAL',
    beforeJson: {
      folio: credito.folio,
      loanNumber: credito.loanNumber,
      clienteId: credito.cliente.id,
      clienteCode: credito.cliente.code,
      clienteName: credito.cliente.fullName,
      avalId: credito.aval?.id ?? null,
      avalCode: credito.aval?.code ?? null,
      avalName: credito.aval?.fullName ?? null,
      avalPhone: credito.aval?.phone ?? null,
      relatedCounts: credito._count,
    },
    afterJson: {
      folio: updatedCredito.folio,
      loanNumber: updatedCredito.loanNumber,
      clienteId: updatedCredito.cliente.id,
      clienteCode: updatedCredito.cliente.code,
      clienteName: updatedCredito.cliente.fullName,
      avalId: updatedCredito.aval?.id ?? null,
      avalCode: updatedCredito.aval?.code ?? null,
      avalName: updatedCredito.aval?.fullName ?? null,
      avalPhone: updatedCredito.aval?.phone ?? null,
      relatedCounts: updatedCredito._count,
      correctedField: 'avalClienteId',
      reason: input.reason?.trim() || null,
    },
  });

  return {
    creditoId: updatedCredito.id,
    folio: updatedCredito.folio,
    loanNumber: updatedCredito.loanNumber,
    correctedField: 'avalClienteId',
    currentHolder: updatedCredito.cliente,
    previousAval: credito.aval,
    nextAval: updatedCredito.aval,
    relatedCounts: updatedCredito._count,
  };
}
