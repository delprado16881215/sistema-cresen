import {
  buildPagoGrupoImpactAuditPayload,
  buildPagoGrupoImpactRebuild,
  createProductionClientFromEnv,
  printRebuildSummary,
  REBUILD_PAGO_GRUPO_TARGET,
} from './rebuild-pago-grupo-impact-utils';

async function main() {
  const production = createProductionClientFromEnv();

  try {
    const rebuild = await buildPagoGrupoImpactRebuild(production, REBUILD_PAGO_GRUPO_TARGET);
    const payload = buildPagoGrupoImpactAuditPayload(rebuild);

    printRebuildSummary(rebuild);

    console.log('\nResultado dry-run');
    console.log(`Puede construir PagoGrupoImpact faltante: ${rebuild.canCreateImpact ? 'SI' : 'NO'}`);
    console.log(`Puede construir PagoGrupoLiquidacion: ${rebuild.canCreateLiquidation ? 'SI' : 'NO'}`);
    console.log('Escrituras realizadas: 0');

    console.log('\nPayload PagoGrupoImpact propuesto (resumen)');
    console.log(
      JSON.stringify(
        {
          entityId: rebuild.target.entityId,
          paidCount: payload.paidCount,
          failedCount: payload.failedCount,
          rowCount: payload.rowCount,
          expectedCount: payload.expectedCount,
          liquidation: payload.liquidation,
          reconstruction: payload.reconstruction,
        },
        null,
        2,
      ),
    );
  } finally {
    await production.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
