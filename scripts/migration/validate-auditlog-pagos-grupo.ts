import { disconnectAll } from './migration-utils';
import {
  AUDITLOG_ENTITIES,
  TARGET_ENTITY_ID,
  assertProductionAdminAndReturnId,
  createMigrationClientsFromEnv,
  findAuditLogs,
  getAuditLogCountsByEntity,
  printAuditLogExamples,
} from './auditlog-pagos-grupo-utils';

async function main() {
  const { local, production } = createMigrationClientsFromEnv();

  try {
    await assertProductionAdminAndReturnId(production);

    const [localCounts, productionCounts, productionTargetRows] = await Promise.all([
      getAuditLogCountsByEntity(local),
      getAuditLogCountsByEntity(production),
      findAuditLogs(production, { entityId: TARGET_ENTITY_ID }),
    ]);

    console.log('\nConteos locales');
    console.table(localCounts);
    console.log('\nConteos produccion');
    console.table(productionCounts);

    const entitiesPresent = new Set(productionTargetRows.map((row) => row.entity));
    const hasImpact = entitiesPresent.has('PagoGrupoImpact');
    const hasLiquidation = entitiesPresent.has('PagoGrupoLiquidacion');

    printAuditLogExamples(`Registros produccion para ${TARGET_ENTITY_ID}`, productionTargetRows);

    console.log('\nValidacion del caso objetivo');
    console.table([
      {
        entityId: TARGET_ENTITY_ID,
        hasPagoGrupoImpact: hasImpact,
        hasPagoGrupoLiquidacion: hasLiquidation,
        shouldEnterHistoricalMode: hasImpact,
      },
    ]);

    const missing = AUDITLOG_ENTITIES.filter((entity) => !entitiesPresent.has(entity));
    if (missing.length) {
      throw new Error(`Faltan AuditLog objetivo en produccion: ${missing.join(', ')}`);
    }

    console.log('\nVALIDACION OK: la pantalla deberia entrar en historicalMode para el entityId objetivo.');
  } finally {
    await disconnectAll(local, production);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
