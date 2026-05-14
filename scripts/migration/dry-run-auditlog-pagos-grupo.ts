import { disconnectAll } from './migration-utils';
import {
  TARGET_ENTITY_ID,
  assertCompatibleMetadataSupport,
  assertProductionAdminAndReturnId,
  createMigrationClientsFromEnv,
  findAuditLogs,
  getAuditLogCountsByEntity,
  getAuditLogSchemaInfo,
  printAuditLogExamples,
  summarizeDuplicates,
} from './auditlog-pagos-grupo-utils';

async function main() {
  const { local, production } = createMigrationClientsFromEnv();

  try {
    const productionAdminUserId = await assertProductionAdminAndReturnId(production);
    const [localSchema, productionSchema] = await Promise.all([
      getAuditLogSchemaInfo(local),
      getAuditLogSchemaInfo(production),
    ]);
    assertCompatibleMetadataSupport(localSchema, productionSchema);

    console.log('\nSchema AuditLog');
    console.table([
      { database: 'local', hasMetadata: localSchema.hasMetadata, columns: localSchema.columns.join(', ') },
      {
        database: 'production',
        hasMetadata: productionSchema.hasMetadata,
        columns: productionSchema.columns.join(', '),
      },
    ]);
    console.log(`Usuario destino para AuditLog.userId: ${productionAdminUserId}`);

    const [localCounts, productionCounts, localRows, productionRows, localExamples, productionExamples] =
      await Promise.all([
        getAuditLogCountsByEntity(local),
        getAuditLogCountsByEntity(production),
        findAuditLogs(local),
        findAuditLogs(production),
        findAuditLogs(local, { entityId: TARGET_ENTITY_ID }),
        findAuditLogs(production, { entityId: TARGET_ENTITY_ID }),
      ]);

    console.log('\nConteos locales');
    console.table(localCounts);
    console.log('\nConteos produccion');
    console.table(productionCounts);

    console.log('\nDuplicados / existentes');
    console.table([summarizeDuplicates(localRows, productionRows)]);

    printAuditLogExamples(`Ejemplos locales para ${TARGET_ENTITY_ID}`, localExamples);
    printAuditLogExamples(`Ejemplos produccion para ${TARGET_ENTITY_ID}`, productionExamples);

    console.log('\nDRY-RUN OK: no se escribio ningun dato.');
  } finally {
    await disconnectAll(local, production);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

