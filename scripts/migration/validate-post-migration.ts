import {
  ADMIN_EMAIL,
  assertDistinctDatabaseUrls,
  assertLocalhostDatabase,
  assertProductionAdmin,
  assertSupabaseDatabase,
  createClient,
  disconnectAll,
  getCounts,
  getFinancialSums,
  getMaxClienteCodeNumber,
  getRelationshipIssues,
  getRequiredEnv,
  getSystemCounterValue,
  migrationOrder,
  printCounts,
} from './migration-utils';

function diffRecords(local: Record<string, unknown>, production: Record<string, unknown>) {
  return Object.keys(local)
    .sort()
    .map((key) => ({
      metric: key,
      local: local[key],
      production: production[key],
      matches: String(local[key]) === String(production[key]),
    }));
}

async function main() {
  const localUrl = getRequiredEnv('LOCAL_DATABASE_URL');
  const productionUrl = getRequiredEnv('PROD_DATABASE_URL');

  assertDistinctDatabaseUrls(localUrl, productionUrl);
  assertLocalhostDatabase(localUrl);
  assertSupabaseDatabase(productionUrl);

  const local = createClient(localUrl);
  const production = createClient(productionUrl);

  try {
    const productionAdmin = await assertProductionAdmin(production);
    console.log(`Admin produccion preservado: ${ADMIN_EMAIL} (${productionAdmin.id})`);

    const [localCounts, productionCounts] = await Promise.all([getCounts(local), getCounts(production)]);
    printCounts('Conteos local', localCounts);
    printCounts('Conteos produccion', productionCounts);

    console.log('\nComparacion de conteos migrados');
    console.table(
      migrationOrder.map((key) => ({
        table: key,
        local: localCounts[key],
        production: productionCounts[key],
        matches: localCounts[key] === productionCounts[key],
      })),
    );

    const [localSums, productionSums] = await Promise.all([getFinancialSums(local), getFinancialSums(production)]);
    console.log('\nComparacion de sumas financieras');
    console.table(diffRecords(localSums, productionSums));

    const productionIssues = await getRelationshipIssues(production);
    console.log('\nValidacion de huerfanos en produccion');
    console.table(productionIssues);

    const [localCounter, productionCounter, localMaxCode, productionMaxCode] = await Promise.all([
      getSystemCounterValue(local),
      getSystemCounterValue(production),
      getMaxClienteCodeNumber(local),
      getMaxClienteCodeNumber(production),
    ]);

    console.log('\nValidacion SystemCounter');
    console.table([
      {
        key: 'CLIENTE_CODE_SEQUENCE',
        localCounter,
        productionCounter,
        localMaxCode,
        productionMaxCode,
        productionIsSafe:
          productionCounter !== null && productionMaxCode !== null && productionCounter >= productionMaxCode,
      },
    ]);
  } finally {
    await disconnectAll(local, production);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

