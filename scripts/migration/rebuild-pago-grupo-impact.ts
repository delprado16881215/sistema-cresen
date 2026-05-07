import {
  assertProductionAdminId,
  buildPagoGrupoImpactAuditPayload,
  buildPagoGrupoImpactRebuild,
  createProductionClientFromEnv,
  printRebuildSummary,
  REBUILD_PAGO_GRUPO_TARGET,
} from './rebuild-pago-grupo-impact-utils';

async function main() {
  if (process.env.CONFIRM_REBUILD_PAGO_GRUPO_IMPACT !== 'YES') {
    throw new Error('Abortado. Define CONFIRM_REBUILD_PAGO_GRUPO_IMPACT=YES para crear el AuditLog faltante.');
  }

  const production = createProductionClientFromEnv();

  try {
    const rebuild = await buildPagoGrupoImpactRebuild(production, REBUILD_PAGO_GRUPO_TARGET);
    printRebuildSummary(rebuild);

    if (!rebuild.canCreateImpact) {
      throw new Error('No es seguro crear PagoGrupoImpact. Revisa el dry-run antes de continuar.');
    }

    const existingImpact = await production.auditLog.findFirst({
      where: {
        module: 'pagos',
        entity: 'PagoGrupoImpact',
        action: 'CREATE',
        entityId: rebuild.target.entityId,
      },
      select: { id: true },
    });

    if (existingImpact) {
      throw new Error(`Ya existe PagoGrupoImpact ${existingImpact.id}. No se creara otro.`);
    }

    const productionAdminUserId = await assertProductionAdminId(production);
    const payload = buildPagoGrupoImpactAuditPayload(rebuild);

    const created = await production.auditLog.create({
      data: {
        userId: productionAdminUserId,
        module: 'pagos',
        entity: 'PagoGrupoImpact',
        entityId: rebuild.target.entityId,
        action: 'CREATE',
        afterJson: payload,
      },
      select: { id: true, entityId: true, createdAt: true },
    });

    console.log('\nPagoGrupoImpact reconstruido');
    console.table([created]);
    console.log('\nPagoGrupoLiquidacion no fue creado: venta, bono y comision final no son inferibles con seguridad.');
    console.log('PaymentEvent/PaymentAllocation/DefaultEvent/PenaltyCharge/RecoveryEvent/AdvanceEvent no fueron modificados.');
  } finally {
    await production.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
