import {
  ADMIN_EMAIL,
  assertDistinctDatabaseUrls,
  assertLocalhostDatabase,
  assertProductionAdmin,
  assertSupabaseDatabase,
  createClient,
  disconnectAll,
  getCounts,
  getRequiredEnv,
  printCounts,
  redactDatabaseUrl,
} from './migration-utils';

async function main() {
  const localUrl = getRequiredEnv('LOCAL_DATABASE_URL');
  const productionUrl = getRequiredEnv('PROD_DATABASE_URL');

  assertDistinctDatabaseUrls(localUrl, productionUrl);
  assertLocalhostDatabase(localUrl);
  assertSupabaseDatabase(productionUrl);

  console.log('Diagnostico de conexiones');
  console.log(`LOCAL_DATABASE_URL: ${redactDatabaseUrl(localUrl)}`);
  console.log(`PROD_DATABASE_URL:  ${redactDatabaseUrl(productionUrl)}`);

  const local = createClient(localUrl);
  const production = createClient(productionUrl);

  try {
    const productionAdmin = await assertProductionAdmin(production);
    console.log(`Admin produccion OK: ${ADMIN_EMAIL} (${productionAdmin.id})`);

    const [localCounts, productionCounts] = await Promise.all([getCounts(local), getCounts(production)]);
    printCounts('Conteos local', localCounts);
    printCounts('Conteos produccion', productionCounts);
  } finally {
    await disconnectAll(local, production);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

