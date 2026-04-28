import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

const ROLE_CODES = [
  'SUPER_ADMIN',
  'ADMIN_FINANCIERA',
  'CAJA',
  'ANALISTA',
  'AUDITOR',
  'LECTURA',
] as const;

const PERMISSIONS = [
  { code: 'dashboard.read', name: 'Ver dashboard' },
  { code: 'clientes.read', name: 'Ver clientes' },
  { code: 'clientes.write', name: 'Crear/editar clientes' },
  { code: 'clientes.deactivate', name: 'Baja lógica de clientes' },
  { code: 'creditos.read', name: 'Ver créditos' },
  { code: 'creditos.write', name: 'Originar créditos' },
  { code: 'pagos.read', name: 'Ver pagos' },
  { code: 'pagos.write', name: 'Registrar pagos' },
  { code: 'reportes.read', name: 'Ver reportes operativos' },
  { code: 'supervisiones.read', name: 'Ver supervisiones' },
  { code: 'supervisiones.write', name: 'Gestionar supervisiones' },
  { code: 'promotorias.read', name: 'Ver promotorías' },
  { code: 'promotorias.write', name: 'Gestionar promotorías' },
  { code: 'usuarios.read', name: 'Ver usuarios' },
] as const;

const DEMO_CLIENT_CODES = ['CR9001', 'CR9002', 'CR9003', 'CR9004', 'CR9005', 'CR9006', 'CR9007', 'CR9008'] as const;

function money(value: number) {
  return value.toFixed(2);
}

function addDays(baseDate: Date, days: number) {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + days);
  return date;
}

function withTime(baseDate: Date, hours: number, minutes = 0) {
  const date = new Date(baseDate);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

async function cleanupOperationalDemoData() {
  const credits = await prisma.credito.findMany({
    where: { folio: { startsWith: 'DEMO-OP-' } },
    select: {
      id: true,
      clienteId: true,
      avalClienteId: true,
      payments: { select: { id: true } },
      defaults: { select: { id: true } },
      penalties: { select: { id: true } },
      recoveries: { select: { id: true } },
      advances: { select: { id: true } },
      extraWeek: { select: { id: true } },
    },
  });

  const creditIds = credits.map((credit) => credit.id);
  if (!creditIds.length) {
    return;
  }

  const paymentIds = credits.flatMap((credit) => credit.payments.map((payment) => payment.id));
  const defaultIds = credits.flatMap((credit) => credit.defaults.map((item) => item.id));
  const penaltyIds = credits.flatMap((credit) => credit.penalties.map((item) => item.id));
  const recoveryIds = credits.flatMap((credit) => credit.recoveries.map((item) => item.id));
  const advanceIds = credits.flatMap((credit) => credit.advances.map((item) => item.id));
  const extraWeekIds = credits.flatMap((credit) => (credit.extraWeek ? [credit.extraWeek.id] : []));
  const auditEntityIds = [...creditIds, ...paymentIds, ...defaultIds, ...penaltyIds, ...recoveryIds, ...advanceIds, ...extraWeekIds];

  await prisma.$transaction([
    prisma.auditLog.deleteMany({ where: { entityId: { in: auditEntityIds } } }),
    prisma.financialEventLog.deleteMany({ where: { creditoId: { in: creditIds } } }),
    prisma.financialReversal.deleteMany({ where: { creditoId: { in: creditIds } } }),
    prisma.paymentAllocation.deleteMany({ where: { paymentEvent: { creditoId: { in: creditIds } } } }),
    prisma.recoveryEvent.deleteMany({ where: { creditoId: { in: creditIds } } }),
    prisma.advanceEvent.deleteMany({ where: { creditoId: { in: creditIds } } }),
    prisma.extraWeekEvent.deleteMany({ where: { creditoId: { in: creditIds } } }),
    prisma.penaltyCharge.deleteMany({ where: { creditoId: { in: creditIds } } }),
    prisma.defaultEvent.deleteMany({ where: { creditoId: { in: creditIds } } }),
    prisma.paymentEvent.deleteMany({ where: { creditoId: { in: creditIds } } }),
    prisma.creditSchedule.deleteMany({ where: { creditoId: { in: creditIds } } }),
    prisma.credito.deleteMany({ where: { id: { in: creditIds } } }),
    prisma.cliente.deleteMany({ where: { code: { in: [...DEMO_CLIENT_CODES] } } }),
  ]);
}

async function seedOperationalDemoData(params: { userId: string; clientTypeId: string }) {
  await cleanupOperationalDemoData();

  const [
    activeCreditStatus,
    completedCreditStatus,
    plan12,
    pendingInstallmentStatus,
    paidInstallmentStatus,
    failedInstallmentStatus,
    advancedInstallmentStatus,
    capturedPaymentStatus,
    pendingPenaltyStatus,
    paidPenaltyStatus,
  ] = await Promise.all([
    prisma.creditStatusCatalog.findUnique({ where: { code: 'ACTIVE' } }),
    prisma.creditStatusCatalog.findUnique({ where: { code: 'COMPLETED' } }),
    prisma.creditPlanRule.findUnique({ where: { code_version: { code: 'PLAN_12', version: 1 } } }),
    prisma.installmentStatusCatalog.findUnique({ where: { code: 'PENDING' } }),
    prisma.installmentStatusCatalog.findUnique({ where: { code: 'PAID' } }),
    prisma.installmentStatusCatalog.findUnique({ where: { code: 'FAILED' } }),
    prisma.installmentStatusCatalog.findUnique({ where: { code: 'ADVANCED' } }),
    prisma.paymentStatusCatalog.findUnique({ where: { code: 'CAPTURED' } }),
    prisma.penaltyStatusCatalog.findUnique({ where: { code: 'PENDING' } }),
    prisma.penaltyStatusCatalog.findUnique({ where: { code: 'PAID' } }),
  ]);

  if (
    !activeCreditStatus ||
    !completedCreditStatus ||
    !plan12 ||
    !pendingInstallmentStatus ||
    !paidInstallmentStatus ||
    !failedInstallmentStatus ||
    !advancedInstallmentStatus ||
    !capturedPaymentStatus ||
    !pendingPenaltyStatus ||
    !paidPenaltyStatus
  ) {
    throw new Error('Faltan catálogos base para sembrar escenarios operativos.');
  }

  const plan12Rule = plan12;
  const pendingInstallmentStatusId = pendingInstallmentStatus.id;
  const paidInstallmentStatusId = paidInstallmentStatus.id;
  const advancedInstallmentStatusId = advancedInstallmentStatus.id;

  const supervision = await prisma.supervision.upsert({
    where: { code: 'SUP_DEMO_CRESEN' },
    create: {
      code: 'SUP_DEMO_CRESEN',
      name: 'Supervisión Demo Cresen',
      isActive: true,
    },
    update: {
      name: 'Supervisión Demo Cresen',
      isActive: true,
    },
  });

  const [promotoriaCentro, promotoriaSur] = await Promise.all([
    prisma.promotoria.upsert({
      where: { code: 'PROMO_DEMO_CENTRO' },
      create: {
        code: 'PROMO_DEMO_CENTRO',
        name: 'Promotoría Centro Demo',
        supervisionId: supervision.id,
        isActive: true,
      },
      update: {
        name: 'Promotoría Centro Demo',
        supervisionId: supervision.id,
        isActive: true,
        deletedAt: null,
      },
    }),
    prisma.promotoria.upsert({
      where: { code: 'PROMO_DEMO_SUR' },
      create: {
        code: 'PROMO_DEMO_SUR',
        name: 'Promotoría Sur Demo',
        supervisionId: supervision.id,
        isActive: true,
      },
      update: {
        name: 'Promotoría Sur Demo',
        supervisionId: supervision.id,
        isActive: true,
        deletedAt: null,
      },
    }),
  ]);

  const demoClients = [
    {
      code: 'CR9001',
      fullName: 'JAVIER MENDEZ ROSALES',
      phone: '3111110001',
      address: 'CALLE LERDO 120',
      postalCode: '63000',
      neighborhood: 'TEPIC CENTRO',
      city: 'TEPIC',
      state: 'NAYARIT',
      promotoriaId: promotoriaCentro.id,
    },
    {
      code: 'CR9002',
      fullName: 'LUCIA HERNANDEZ GARCIA',
      phone: '3111110002',
      address: 'CALLE PUEBLA 45',
      postalCode: '63000',
      neighborhood: 'TEPIC CENTRO',
      city: 'TEPIC',
      state: 'NAYARIT',
      promotoriaId: promotoriaCentro.id,
    },
    {
      code: 'CR9003',
      fullName: 'MARIA ELENA TORRES LOPEZ',
      phone: '3111110003',
      address: 'AVENIDA INSURGENTES 88',
      postalCode: '63173',
      neighborhood: 'VILLAS DE LA CANTERA',
      city: 'TEPIC',
      state: 'NAYARIT',
      promotoriaId: promotoriaCentro.id,
    },
    {
      code: 'CR9004',
      fullName: 'PEDRO SALAZAR RUIZ',
      phone: '3111110004',
      address: 'CALLE EJIDO 12',
      postalCode: '63173',
      neighborhood: 'COLINAS DEL VALLE',
      city: 'TEPIC',
      state: 'NAYARIT',
      promotoriaId: promotoriaCentro.id,
    },
    {
      code: 'CR9005',
      fullName: 'CARLOS NAVARRO CARRILLO',
      phone: '3111110005',
      address: 'CALLE ROBLE 200',
      postalCode: '63190',
      neighborhood: 'LOS FRESNOS',
      city: 'TEPIC',
      state: 'NAYARIT',
      promotoriaId: promotoriaSur.id,
    },
    {
      code: 'CR9006',
      fullName: 'SONIA GONZALEZ PEREZ',
      phone: '3111110006',
      address: 'CALLE SAUCES 88',
      postalCode: '63190',
      neighborhood: 'LOS SAUCES',
      city: 'TEPIC',
      state: 'NAYARIT',
      promotoriaId: promotoriaSur.id,
    },
    {
      code: 'CR9007',
      fullName: 'ROBERTO RIVERA DIAZ',
      phone: '3111110007',
      address: 'CALLE INDEPENDENCIA 22',
      postalCode: '63030',
      neighborhood: 'MOLOLOA',
      city: 'TEPIC',
      state: 'NAYARIT',
      promotoriaId: promotoriaSur.id,
    },
    {
      code: 'CR9008',
      fullName: 'ELENA VARGAS CASTILLO',
      phone: '3111110008',
      address: 'CALLE GUANAJUATO 72',
      postalCode: '63030',
      neighborhood: 'MOLOLOA',
      city: 'TEPIC',
      state: 'NAYARIT',
      promotoriaId: promotoriaSur.id,
    },
  ] as const;

  const clientMap = new Map<string, string>();
  for (const client of demoClients) {
    const created = await prisma.cliente.create({
      data: {
        code: client.code,
        fullName: client.fullName,
        phone: client.phone,
        address: client.address,
        postalCode: client.postalCode,
        neighborhood: client.neighborhood,
        city: client.city,
        state: client.state,
        clientTypeId: params.clientTypeId,
        promotoriaId: client.promotoriaId,
        searchableName: client.fullName,
        searchablePhone: client.phone,
        searchableAddress: `${client.address} ${client.neighborhood} ${client.city} ${client.state}`,
        isActive: true,
      },
    });
    clientMap.set(client.code, created.id);
  }

  async function createCreditWithSchedules(input: {
    folio: string;
    loanNumber: string;
    clienteCode: string;
    avalCode: string;
    promotoriaId: string;
    startDate: Date;
    principalAmount: number;
    weeklyAmount: number;
    totalWeeks: number;
    statusId: string;
    closedAt?: Date | null;
    notes: string;
  }) {
    const credit = await prisma.credito.create({
      data: {
        folio: input.folio,
        loanNumber: input.loanNumber,
        clienteId: clientMap.get(input.clienteCode)!,
        avalClienteId: clientMap.get(input.avalCode)!,
        promotoriaId: input.promotoriaId,
        creditPlanRuleId: plan12Rule.id,
        planCodeSnapshot: plan12Rule.code,
        planVersionSnapshot: plan12Rule.version,
        planWeeksSnapshot: plan12Rule.weeks,
        planFactorSnapshot: plan12Rule.weeklyFactor,
        principalAmount: money(input.principalAmount),
        weeklyAmount: money(input.weeklyAmount),
        totalWeeks: input.totalWeeks,
        startDate: input.startDate,
        creditStatusId: input.statusId,
        notes: input.notes,
        closedAt: input.closedAt ?? null,
        createdByUserId: params.userId,
      },
    });

    const schedules = [];
    for (let week = 1; week <= input.totalWeeks; week += 1) {
      const schedule = await prisma.creditSchedule.create({
        data: {
          creditoId: credit.id,
          installmentNumber: week,
          dueDate: addDays(input.startDate, week * 7),
          expectedAmount: money(input.weeklyAmount),
          paidAmount: '0.00',
          installmentStatusId: pendingInstallmentStatusId,
        },
      });
      schedules.push(schedule);
    }

    return { credit, schedules };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = addDays(today, -1);

  const cleanScenario = await createCreditWithSchedules({
    folio: 'DEMO-OP-001',
    loanNumber: 'DEMO-LN-001',
    clienteCode: 'CR9001',
    avalCode: 'CR9002',
    promotoriaId: promotoriaCentro.id,
    startDate: addDays(today, -7),
    principalAmount: 1000,
    weeklyAmount: 125,
    totalWeeks: 12,
    statusId: activeCreditStatus.id,
    notes: 'ESCENARIO A · CREDITO LIMPIO CON PAGO NORMAL',
  });

  await prisma.creditSchedule.update({
    where: { id: cleanScenario.schedules[0]!.id },
    data: {
      paidAmount: '125.00',
      installmentStatusId: paidInstallmentStatusId,
    },
  });

  const cleanPayment = await prisma.paymentEvent.create({
    data: {
      creditoId: cleanScenario.credit.id,
      paymentStatusId: capturedPaymentStatus.id,
      receivedAt: withTime(today, 10, 0),
      amountReceived: '125.00',
      notes: 'PAGO SEMANAL NORMAL',
      capturedByUserId: params.userId,
    },
  });

  await prisma.paymentAllocation.create({
    data: {
      paymentEventId: cleanPayment.id,
      scheduleId: cleanScenario.schedules[0]!.id,
      allocationType: 'CURRENT',
      amount: '125.00',
    },
  });

  const failureScenario = await createCreditWithSchedules({
    folio: 'DEMO-OP-002',
    loanNumber: 'DEMO-LN-002',
    clienteCode: 'CR9003',
    avalCode: 'CR9004',
    promotoriaId: promotoriaCentro.id,
    startDate: addDays(today, -7),
    principalAmount: 1000,
    weeklyAmount: 125,
    totalWeeks: 12,
    statusId: activeCreditStatus.id,
    notes: 'ESCENARIO B · FALLA, MULTA Y COBRO EXPLICITO DE MULTA',
  });

  const defaultB = await prisma.defaultEvent.create({
    data: {
      creditoId: failureScenario.credit.id,
      scheduleId: failureScenario.schedules[0]!.id,
      amountMissed: '125.00',
      notes: 'FALLA REGISTRADA EN DIA DE PRUEBA',
      createdByUserId: params.userId,
      createdAt: withTime(today, 9, 0),
    },
  });

  const penaltyB = await prisma.penaltyCharge.create({
    data: {
      creditoId: failureScenario.credit.id,
      defaultEventId: defaultB.id,
      amount: '50.00',
      penaltyStatusId: paidPenaltyStatus.id,
      collectedAt: withTime(today, 15, 0),
      notes: 'MULTA COBRADA EXPLICITAMENTE',
      createdByUserId: params.userId,
      createdAt: withTime(today, 9, 0),
    },
  });

  const failurePayment = await prisma.paymentEvent.create({
    data: {
      creditoId: failureScenario.credit.id,
      paymentStatusId: capturedPaymentStatus.id,
      receivedAt: withTime(today, 15, 0),
      amountReceived: '175.00',
      notes: 'RECUPERA LA SEMANA Y COBRA MULTA',
      capturedByUserId: params.userId,
    },
  });

  await prisma.paymentAllocation.createMany({
    data: [
      {
        paymentEventId: failurePayment.id,
        scheduleId: failureScenario.schedules[0]!.id,
        defaultEventId: defaultB.id,
        allocationType: 'RECOVERY',
        amount: '125.00',
      },
      {
        paymentEventId: failurePayment.id,
        penaltyChargeId: penaltyB.id,
        allocationType: 'PENALTY',
        amount: '50.00',
      },
    ],
  });

  await prisma.recoveryEvent.create({
    data: {
      creditoId: failureScenario.credit.id,
      paymentEventId: failurePayment.id,
      defaultEventId: defaultB.id,
      recoveredAmount: '125.00',
      createdByUserId: params.userId,
      createdAt: withTime(today, 15, 0),
    },
  });

  await prisma.creditSchedule.update({
    where: { id: failureScenario.schedules[0]!.id },
    data: {
      paidAmount: '125.00',
      installmentStatusId: paidInstallmentStatusId,
    },
  });

  await prisma.extraWeekEvent.create({
    data: {
      creditoId: failureScenario.credit.id,
      extraWeekNumber: 1,
      dueDate: addDays(failureScenario.schedules[failureScenario.schedules.length - 1]!.dueDate, 7),
      expectedAmount: '125.00',
      paidAmount: '0.00',
      status: 'PENDING',
      generatedByUserId: params.userId,
      notes: 'SEMANA EXTRA ABIERTA POR FALLA DEL ESCENARIO B',
    },
  });

  const recoveryScenario = await createCreditWithSchedules({
    folio: 'DEMO-OP-003',
    loanNumber: 'DEMO-LN-003',
    clienteCode: 'CR9005',
    avalCode: 'CR9006',
    promotoriaId: promotoriaSur.id,
    startDate: addDays(today, -14),
    principalAmount: 1000,
    weeklyAmount: 125,
    totalWeeks: 12,
    statusId: activeCreditStatus.id,
    notes: 'ESCENARIO C · RECUPERACION Y ADELANTO',
  });

  const defaultC = await prisma.defaultEvent.create({
    data: {
      creditoId: recoveryScenario.credit.id,
      scheduleId: recoveryScenario.schedules[0]!.id,
      amountMissed: '125.00',
      notes: 'FALLA PREVIA PARA PROBAR RECUPERACION',
      createdByUserId: params.userId,
      createdAt: withTime(yesterday, 11, 0),
    },
  });

  await prisma.penaltyCharge.create({
    data: {
      creditoId: recoveryScenario.credit.id,
      defaultEventId: defaultC.id,
      amount: '50.00',
      penaltyStatusId: pendingPenaltyStatus.id,
      notes: 'MULTA PENDIENTE DEL ESCENARIO C',
      createdByUserId: params.userId,
      createdAt: withTime(yesterday, 11, 0),
    },
  });

  const recoveryPayment = await prisma.paymentEvent.create({
    data: {
      creditoId: recoveryScenario.credit.id,
      paymentStatusId: capturedPaymentStatus.id,
      receivedAt: withTime(today, 16, 30),
      amountReceived: '375.00',
      notes: 'PAGO QUE CUBRE SEMANA ACTUAL, RECUPERA ATRASO Y ADELANTA UNA FUTURA',
      capturedByUserId: params.userId,
    },
  });

  await prisma.paymentAllocation.createMany({
    data: [
      {
        paymentEventId: recoveryPayment.id,
        scheduleId: recoveryScenario.schedules[1]!.id,
        allocationType: 'CURRENT',
        amount: '125.00',
      },
      {
        paymentEventId: recoveryPayment.id,
        scheduleId: recoveryScenario.schedules[0]!.id,
        defaultEventId: defaultC.id,
        allocationType: 'RECOVERY',
        amount: '125.00',
      },
      {
        paymentEventId: recoveryPayment.id,
        scheduleId: recoveryScenario.schedules[2]!.id,
        allocationType: 'ADVANCE',
        amount: '125.00',
      },
    ],
  });

  await prisma.recoveryEvent.create({
    data: {
      creditoId: recoveryScenario.credit.id,
      paymentEventId: recoveryPayment.id,
      defaultEventId: defaultC.id,
      recoveredAmount: '125.00',
      createdByUserId: params.userId,
      createdAt: withTime(today, 16, 30),
    },
  });

  await prisma.advanceEvent.create({
    data: {
      creditoId: recoveryScenario.credit.id,
      paymentEventId: recoveryPayment.id,
      recordedOnInstallmentId: recoveryScenario.schedules[1]!.id,
      coversInstallmentId: recoveryScenario.schedules[2]!.id,
      amount: '125.00',
      status: 'PENDING',
      isApplied: false,
      registeredByUserId: params.userId,
      createdAt: withTime(today, 16, 30),
    },
  });

  await prisma.creditSchedule.updateMany({
    where: { id: { in: [recoveryScenario.schedules[0]!.id, recoveryScenario.schedules[1]!.id] } },
    data: {
      paidAmount: '125.00',
      installmentStatusId: paidInstallmentStatusId,
    },
  });

  await prisma.creditSchedule.update({
    where: { id: recoveryScenario.schedules[2]!.id },
    data: {
      paidAmount: '125.00',
      installmentStatusId: advancedInstallmentStatusId,
    },
  });

  await prisma.extraWeekEvent.create({
    data: {
      creditoId: recoveryScenario.credit.id,
      extraWeekNumber: 1,
      dueDate: addDays(recoveryScenario.schedules[recoveryScenario.schedules.length - 1]!.dueDate, 7),
      expectedAmount: '125.00',
      paidAmount: '0.00',
      status: 'PENDING',
      generatedByUserId: params.userId,
      notes: 'SEMANA EXTRA ABIERTA POR FALLA DEL ESCENARIO C',
    },
  });

  const extraWeekScenario = await createCreditWithSchedules({
    folio: 'DEMO-OP-004',
    loanNumber: 'DEMO-LN-004',
    clienteCode: 'CR9007',
    avalCode: 'CR9008',
    promotoriaId: promotoriaSur.id,
    startDate: addDays(today, -91),
    principalAmount: 1000,
    weeklyAmount: 125,
    totalWeeks: 12,
    statusId: completedCreditStatus.id,
    closedAt: withTime(today, 17, 45),
    notes: 'ESCENARIO D · SEMANA EXTRA COBRADA',
  });

  await prisma.creditSchedule.updateMany({
    where: { creditoId: extraWeekScenario.credit.id },
    data: {
      paidAmount: '125.00',
      installmentStatusId: paidInstallmentStatusId,
    },
  });

  const defaultD = await prisma.defaultEvent.create({
    data: {
      creditoId: extraWeekScenario.credit.id,
      scheduleId: extraWeekScenario.schedules[4]!.id,
      amountMissed: '125.00',
      notes: 'FALLA HISTORICA PARA GENERAR SEMANA EXTRA',
      createdByUserId: params.userId,
      createdAt: addDays(today, -40),
    },
  });

  const penaltyD = await prisma.penaltyCharge.create({
    data: {
      creditoId: extraWeekScenario.credit.id,
      defaultEventId: defaultD.id,
      amount: '50.00',
      penaltyStatusId: paidPenaltyStatus.id,
      collectedAt: addDays(today, -39),
      notes: 'MULTA HISTORICA COBRADA',
      createdByUserId: params.userId,
      createdAt: addDays(today, -40),
    },
  });

  const historicalRecoveryPayment = await prisma.paymentEvent.create({
    data: {
      creditoId: extraWeekScenario.credit.id,
      paymentStatusId: capturedPaymentStatus.id,
      receivedAt: addDays(today, -39),
      amountReceived: '175.00',
      notes: 'RECUPERACION HISTORICA DE FALLA Y MULTA',
      capturedByUserId: params.userId,
    },
  });

  await prisma.paymentAllocation.createMany({
    data: [
      {
        paymentEventId: historicalRecoveryPayment.id,
        scheduleId: extraWeekScenario.schedules[4]!.id,
        defaultEventId: defaultD.id,
        allocationType: 'RECOVERY',
        amount: '125.00',
      },
      {
        paymentEventId: historicalRecoveryPayment.id,
        penaltyChargeId: penaltyD.id,
        allocationType: 'PENALTY',
        amount: '50.00',
      },
    ],
  });

  await prisma.recoveryEvent.create({
    data: {
      creditoId: extraWeekScenario.credit.id,
      paymentEventId: historicalRecoveryPayment.id,
      defaultEventId: defaultD.id,
      recoveredAmount: '125.00',
      createdByUserId: params.userId,
      createdAt: addDays(today, -39),
    },
  });

  const extraWeekD = await prisma.extraWeekEvent.create({
    data: {
      creditoId: extraWeekScenario.credit.id,
      extraWeekNumber: 1,
      dueDate: today,
      expectedAmount: '125.00',
      paidAmount: '125.00',
      status: 'PAID',
      paidAt: withTime(today, 17, 45),
      generatedByUserId: params.userId,
      notes: 'SEMANA EXTRA COBRADA PARA PROBAR REPORTES',
    },
  });

  const extraWeekPayment = await prisma.paymentEvent.create({
    data: {
      creditoId: extraWeekScenario.credit.id,
      paymentStatusId: capturedPaymentStatus.id,
      receivedAt: withTime(today, 17, 45),
      amountReceived: '125.00',
      notes: 'COBRO DE SEMANA EXTRA',
      capturedByUserId: params.userId,
    },
  });

  await prisma.paymentAllocation.create({
    data: {
      paymentEventId: extraWeekPayment.id,
      extraWeekEventId: extraWeekD.id,
      allocationType: 'EXTRA_WEEK',
      amount: '125.00',
    },
  });

  await prisma.extraWeekEvent.update({
    where: { id: extraWeekD.id },
    data: {
      paymentEventId: extraWeekPayment.id,
    },
  });

  console.info('Datos operativos demo creados:');
  console.info('- 1 supervisión demo');
  console.info('- 2 promotorías demo');
  console.info('- 8 clientes demo');
  console.info('- 4 créditos demo (limpio, falla+multa, recuperación+adelanto, semana extra)');
}

async function main() {
  for (const roleCode of ROLE_CODES) {
    await prisma.role.upsert({
      where: { code: roleCode },
      create: { code: roleCode, name: roleCode.replace('_', ' ') },
      update: {},
    });
  }

  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      create: permission,
      update: { name: permission.name },
    });
  }

  const roles = await prisma.role.findMany();
  const permissions = await prisma.permission.findMany();

  const allRole = roles.find((r) => r.code === 'SUPER_ADMIN');
  if (!allRole) throw new Error('Rol SUPER_ADMIN no encontrado');

  for (const permission of permissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: allRole.id,
          permissionId: permission.id,
        },
      },
      create: {
        roleId: allRole.id,
        permissionId: permission.id,
      },
      update: {},
    });
  }

  const adminRoleCodes = ['ADMIN_FINANCIERA', 'CAJA'];
  for (const roleCode of adminRoleCodes) {
    const role = roles.find((item) => item.code === roleCode);
    if (!role) continue;

    for (const permission of permissions.filter((p) => p.code !== 'usuarios.read')) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        create: { roleId: role.id, permissionId: permission.id },
        update: {},
      });
    }
  }

  await prisma.userType.upsert({
    where: { code: 'INTERNAL' },
    create: { code: 'INTERNAL', name: 'Interno' },
    update: { name: 'Interno', isActive: true },
  });

  await prisma.clientTypeCatalog.upsert({
    where: { code: 'NUEVO' },
    create: { code: 'NUEVO', name: 'Nuevo' },
    update: { name: 'Nuevo', isActive: true },
  });

  await prisma.clientTypeCatalog.upsert({
    where: { code: 'RECURRENTE' },
    create: { code: 'RECURRENTE', name: 'Recurrente' },
    update: { name: 'Recurrente', isActive: true },
  });

  const creditStatuses = [
    ['ACTIVE', 'Activo'],
    ['COMPLETED', 'Completado'],
    ['CANCELLED', 'Cancelado'],
    ['DEFAULTED', 'Incumplido'],
  ] as const;

  for (const [code, name] of creditStatuses) {
    await prisma.creditStatusCatalog.upsert({
      where: { code },
      create: { code, name },
      update: { name, isActive: true },
    });
  }

  const penaltyStatuses = [
    ['PENDING', 'Pendiente'],
    ['PAID', 'Pagada'],
    ['FORGIVEN', 'Condonada'],
    ['REVERSED', 'Reversada'],
  ] as const;

  for (const [code, name] of penaltyStatuses) {
    await prisma.penaltyStatusCatalog.upsert({
      where: { code },
      create: { code, name },
      update: { name, isActive: true },
    });
  }

  const paymentStatuses = [
    ['CAPTURED', 'Capturado'],
    ['PARTIAL', 'Parcial'],
    ['REVERSED', 'Reversado'],
  ] as const;

  for (const [code, name] of paymentStatuses) {
    await prisma.paymentStatusCatalog.upsert({
      where: { code },
      create: { code, name },
      update: { name, isActive: true },
    });
  }

  const installmentStatuses = [
    ['PENDING', 'Pendiente'],
    ['PAID', 'Pagado'],
    ['FAILED', 'Falló'],
    ['PARTIAL', 'Parcial'],
    ['ADVANCED', 'Adelantado'],
  ] as const;

  for (const [code, name] of installmentStatuses) {
    await prisma.installmentStatusCatalog.upsert({
      where: { code },
      create: { code, name },
      update: { name, isActive: true },
    });
  }

  await prisma.creditPlanRule.upsert({
    where: { code_version: { code: 'PLAN_12', version: 1 } },
    create: {
      code: 'PLAN_12',
      version: 1,
      weeks: 12,
      weeklyFactor: '0.125',
      roundingRule: 'HALF_UP',
      formulaExpression: 'weekly = principal * 0.125',
    },
    update: {
      weeks: 12,
      weeklyFactor: '0.125',
      roundingRule: 'HALF_UP',
      formulaExpression: 'weekly = principal * 0.125',
      isActive: true,
    },
  });

  await prisma.creditPlanRule.upsert({
    where: { code_version: { code: 'PLAN_15', version: 1 } },
    create: {
      code: 'PLAN_15',
      version: 1,
      weeks: 15,
      weeklyFactor: '0.100000',
      roundingRule: 'HALF_UP',
      formulaExpression: 'weekly = principal * factor_plan_15',
    },
    update: {
      weeks: 15,
      weeklyFactor: '0.100000',
      roundingRule: 'HALF_UP',
      formulaExpression: 'weekly = principal * factor_plan_15',
      isActive: true,
    },
  });

  const businessRules = [
    {
      key: 'FAILURE_PENALTY_AMOUNT',
      valueType: 'NUMBER' as const,
      valueNumber: '50.0000',
      description: 'Monto de multa por cada falla registrada',
    },
    {
      key: 'ENABLE_EXTRA_WEEK',
      valueType: 'BOOLEAN' as const,
      valueBoolean: true,
      description: 'Activa la semana extra cuando existe al menos una falla en el crédito',
    },
  ];

  for (const rule of businessRules) {
    await prisma.businessRule.upsert({
      where: { key: rule.key },
      create: rule,
      update: rule,
    });
  }

  const supervision = await prisma.supervision.upsert({
    where: { code: 'ZONA_BASE' },
    create: { code: 'ZONA_BASE', name: 'Zona Base Operativa' },
    update: { name: 'Zona Base Operativa', isActive: true },
  });

  await prisma.promotoria.upsert({
    where: { code: 'PROMOTORIA_BASE' },
    create: {
      code: 'PROMOTORIA_BASE',
      name: 'Promotoría Base Operativa',
      supervisionId: supervision.id,
      isActive: true,
    },
    update: {
      name: 'Promotoría Base Operativa',
      supervisionId: supervision.id,
      isActive: true,
      deletedAt: null,
    },
  });

  const internalType = await prisma.userType.findUnique({ where: { code: 'INTERNAL' } });
  if (!internalType) throw new Error('No se encontró user type INTERNAL');

  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@cresen.local';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'Admin12345!';
  const passwordHash = await hash(adminPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail.toLowerCase() },
    create: {
      email: adminEmail.toLowerCase(),
      name: 'Administrador Inicial',
      passwordHash,
      userTypeId: internalType.id,
      isActive: true,
    },
    update: {
      name: 'Administrador Inicial',
      passwordHash,
      userTypeId: internalType.id,
      isActive: true,
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: admin.id,
        roleId: allRole.id,
      },
    },
    create: {
      userId: admin.id,
      roleId: allRole.id,
    },
    update: {},
  });

  const mario = await prisma.user.upsert({
    where: { email: 'mario.prueba@cresen.local' },
    create: {
      email: 'mario.prueba@cresen.local',
      name: 'Mario Prueba',
      passwordHash,
      userTypeId: internalType.id,
      isActive: true,
    },
    update: {
      name: 'Mario Prueba',
      passwordHash,
      userTypeId: internalType.id,
      isActive: true,
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: mario.id,
        roleId: allRole.id,
      },
    },
    create: {
      userId: mario.id,
      roleId: allRole.id,
    },
    update: {},
  });

  const communicationTemplates = [
    {
      name: 'Recordatorio de pago WhatsApp',
      type: 'PAYMENT_REMINDER' as const,
      channel: 'WHATSAPP' as const,
      subject: null,
      content:
        'Hola {{clienteNombre}}, te recordamos tu pago del crédito {{creditoFolio}} por {{montoPago}} con fecha {{fechaPago}}. Promotoría {{promotoriaNombre}}.',
    },
    {
      name: 'Seguimiento de cobranza WhatsApp',
      type: 'COLLECTION_FOLLOWUP' as const,
      channel: 'WHATSAPP' as const,
      subject: null,
      content:
        'Hola {{clienteNombre}}, seguimos pendientes del crédito {{creditoFolio}}. Tu importe de referencia es {{montoPago}} con vencimiento {{fechaPago}}.',
    },
    {
      name: 'Aviso jurídico WhatsApp',
      type: 'LEGAL_NOTICE' as const,
      channel: 'WHATSAPP' as const,
      subject: null,
      content:
        'Hola {{clienteNombre}}, tu crédito {{creditoFolio}} registra estado {{estadoLegal}}. Comunícate con Cresen para seguimiento.',
    },
    {
      name: 'Oferta de renovación WhatsApp',
      type: 'RENEWAL_OFFER' as const,
      channel: 'WHATSAPP' as const,
      subject: null,
      content:
        'Hola {{clienteNombre}}, en {{promotoriaNombre}} queremos compartirte una opción de renovación para tu crédito {{creditoFolio}}.',
    },
    {
      name: 'Mensaje manual base WhatsApp',
      type: 'MANUAL_MESSAGE' as const,
      channel: 'WHATSAPP' as const,
      subject: null,
      content: 'Hola {{clienteNombre}}, te contactamos de Cresen para dar seguimiento a tu cuenta.',
    },
  ];

  for (const template of communicationTemplates) {
    await prisma.messageTemplate.upsert({
      where: {
        type_channel_name: {
          type: template.type,
          channel: template.channel,
          name: template.name,
        },
      },
      create: {
        ...template,
        isActive: true,
        createdByUserId: admin.id,
        updatedByUserId: admin.id,
      },
      update: {
        subject: template.subject,
        content: template.content,
        isActive: true,
        updatedByUserId: admin.id,
      },
    });
  }

  const nuevoClientType = await prisma.clientTypeCatalog.findUnique({ where: { code: 'NUEVO' } });
  if (!nuevoClientType) throw new Error('No se encontró client type NUEVO');

  await seedOperationalDemoData({
    userId: mario.id,
    clientTypeId: nuevoClientType.id,
  });

  console.info('Seed ejecutado correctamente');
  console.info(`Usuario admin: ${adminEmail}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
