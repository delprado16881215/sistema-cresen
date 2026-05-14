import {
  assertBackupEvidence,
  assertDistinctDatabaseUrls,
  assertLocalhostDatabase,
  assertNoOperationalData,
  assertProductionAdmin,
  assertSupabaseDatabase,
  buildUserIdMap,
  createClient,
  createManifest,
  disconnectAll,
  getCounts,
  getMaxClienteCodeNumber,
  getRequiredEnv,
  mapUserFields,
  migrationOrder,
  prismaTables,
} from './migration-utils';

type InsertedManifest = Record<string, string[]>;

const tableByKey = Object.fromEntries(prismaTables.map((table) => [table.key, table]));

async function main() {
  if (process.env.CONFIRM_PRODUCTION_MIGRATION !== 'YES') {
    throw new Error('CONFIRM_PRODUCTION_MIGRATION=YES es obligatorio para ejecutar la migracion real.');
  }

  const localUrl = getRequiredEnv('LOCAL_DATABASE_URL');
  const productionUrl = getRequiredEnv('PROD_DATABASE_URL');

  assertBackupEvidence();
  assertDistinctDatabaseUrls(localUrl, productionUrl);
  assertLocalhostDatabase(localUrl);
  assertSupabaseDatabase(productionUrl);

  const local = createClient(localUrl);
  const production = createClient(productionUrl);

  const inserted: InsertedManifest = {};

  try {
    await assertProductionAdmin(production);
    const productionCounts = await getCounts(production);
    assertNoOperationalData(productionCounts);

    const { userIdMap } = await buildUserIdMap(local, production);

    for (const key of migrationOrder) {
      const table = tableByKey[key];
      if (!table?.migrates) {
        throw new Error(`La tabla ${key} no esta habilitada para migracion.`);
      }

      const localDelegate = (local as unknown as Record<string, { findMany: () => Promise<Record<string, unknown>[]> }>)[
        table.delegate
      ];
      const productionDelegate = (
        production as unknown as Record<string, { createMany: (args: unknown) => Promise<{ count: number }> }>
      )[table.delegate];

      const rows = await localDelegate.findMany();
      const mappedRows = rows.map((row) => mapUserFields(row, table, userIdMap));

      inserted[key] = mappedRows
        .map((row) => row.id)
        .filter((id): id is string => typeof id === 'string');

      if (mappedRows.length === 0) {
        console.log(`${key}: 0 registros`);
        continue;
      }

      const result = await productionDelegate.createMany({
        data: mappedRows,
        skipDuplicates: false,
      });
      console.log(`${key}: ${result.count} registros insertados`);
    }

    await adjustSystemCounter(local, production, inserted);

    const manifestPath = await createManifest(inserted);
    console.log(`Manifiesto generado: ${manifestPath}`);
  } finally {
    await disconnectAll(local, production);
  }
}

async function adjustSystemCounter(local: ReturnType<typeof createClient>, production: ReturnType<typeof createClient>, inserted: InsertedManifest) {
  const [localCounter, maxClienteCode] = await Promise.all([
    local.systemCounter.findUnique({
      where: { key: 'CLIENTE_CODE_SEQUENCE' },
      select: { value: true },
    }),
    getMaxClienteCodeNumber(local),
  ]);

  const value = Math.max(localCounter?.value ?? 0, maxClienteCode ?? 0);
  if (value <= 0) {
    console.log('SystemCounter: sin valor local para ajustar');
    return;
  }

  await production.systemCounter.create({
    data: {
      key: 'CLIENTE_CODE_SEQUENCE',
      value,
    },
  });
  inserted.SystemCounter = ['CLIENTE_CODE_SEQUENCE'];
  console.log(`SystemCounter.CLIENTE_CODE_SEQUENCE ajustado a ${value}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

