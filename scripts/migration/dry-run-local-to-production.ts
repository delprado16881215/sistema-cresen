import {
  assertDistinctDatabaseUrls,
  assertLocalhostDatabase,
  assertNoOperationalData,
  assertProductionAdmin,
  assertSupabaseDatabase,
  buildUserIdMap,
  createClient,
  disconnectAll,
  findUniqueCollisions,
  getCounts,
  getRelationshipIssues,
  getRequiredEnv,
  migrationOrder,
  neverMigrateTables,
  printCounts,
  userMappedTables,
} from './migration-utils';

function hasNonZeroIssue(issues: Record<string, number>) {
  return Object.values(issues).some((count) => count !== 0);
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
    await assertProductionAdmin(production);

    const [localCounts, productionCounts] = await Promise.all([getCounts(local), getCounts(production)]);
    printCounts('Conteos local', localCounts);
    printCounts('Conteos produccion', productionCounts);
    assertNoOperationalData(productionCounts);

    const relationshipIssues = await getRelationshipIssues(local);
    console.log('\nValidacion de relaciones locales');
    console.table(relationshipIssues);
    if (hasNonZeroIssue(relationshipIssues)) {
      throw new Error('Hay relaciones huerfanas en local. No es seguro migrar.');
    }

    const collisions = await findUniqueCollisions(local, production);
    console.log('\nChoques de claves unicas contra produccion');
    console.table(collisions);
    const blockingCollisions = collisions.filter((collision) => collision.count > 0);
    if (blockingCollisions.length) {
      throw new Error('Hay choques de claves unicas contra produccion. No es seguro migrar.');
    }

    const { productionAdmin, localUsers, userIdMap } = await buildUserIdMap(local, production);
    console.log('\nAdmin destino para mapeo de usuarios');
    console.log(`${productionAdmin.email} -> ${productionAdmin.id}`);
    console.log('\nUsuarios locales que seran mapeados al admin de produccion');
    console.table(localUsers.map((user) => ({ ...user, mapsTo: userIdMap[user.id] })));

    console.log('\nCampos de usuario que se remapearan');
    for (const table of userMappedTables) {
      console.log(`${table.key}: ${(table.userFields ?? []).join(', ')}`);
    }

    console.log('\nTablas que NO se migraran');
    console.log(neverMigrateTables.join(', '));

    console.log('\nOrden de migracion confirmado');
    migrationOrder.forEach((table, index) => {
      console.log(`${String(index + 1).padStart(2, '0')}. ${table}`);
    });

    console.log('\nDRY-RUN OK: no se escribio ningun dato.');
  } finally {
    await disconnectAll(local, production);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

