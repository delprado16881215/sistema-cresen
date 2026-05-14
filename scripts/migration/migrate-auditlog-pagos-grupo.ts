import { disconnectAll } from './migration-utils';
import {
  assertCompatibleMetadataSupport,
  assertProductionAdminAndReturnId,
  createMigrationClientsFromEnv,
  findAuditLogs,
  getAuditLogSchemaInfo,
  getRowsToInsert,
  insertAuditLogRow,
  summarizeDuplicates,
} from './auditlog-pagos-grupo-utils';

async function main() {
  if (process.env.CONFIRM_AUDITLOG_MIGRATION !== 'YES') {
    throw new Error('CONFIRM_AUDITLOG_MIGRATION=YES es obligatorio para ejecutar esta migracion.');
  }

  const { local, production } = createMigrationClientsFromEnv();

  try {
    const productionAdminUserId = await assertProductionAdminAndReturnId(production);
    const [localSchema, productionSchema, localRows, productionRows] = await Promise.all([
      getAuditLogSchemaInfo(local),
      getAuditLogSchemaInfo(production),
      findAuditLogs(local),
      findAuditLogs(production),
    ]);
    assertCompatibleMetadataSupport(localSchema, productionSchema);

    const duplicateSummary = summarizeDuplicates(localRows, productionRows);
    const rowsToInsert = getRowsToInsert(localRows, productionRows);
    const includeMetadata = localSchema.hasMetadata && productionSchema.hasMetadata;

    console.log('\nResumen previo');
    console.table([duplicateSummary]);
    console.log(`Usuario destino para AuditLog.userId: ${productionAdminUserId}`);
    console.log(`Registros a insertar: ${rowsToInsert.length}`);

    let inserted = 0;
    for (const row of rowsToInsert) {
      await insertAuditLogRow(production, row, productionAdminUserId, includeMetadata);
      inserted += 1;
    }

    console.log(`Migracion complementaria completada. AuditLog insertados: ${inserted}`);
  } finally {
    await disconnectAll(local, production);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

