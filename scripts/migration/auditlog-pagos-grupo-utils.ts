import type { PrismaClient } from '@prisma/client';
import {
  assertDistinctDatabaseUrls,
  assertLocalhostDatabase,
  assertProductionAdmin,
  assertSupabaseDatabase,
  createClient,
  getRequiredEnv,
  redactDatabaseUrl,
} from './migration-utils';

export const AUDITLOG_ENTITIES = ['PagoGrupoImpact', 'PagoGrupoLiquidacion'] as const;
export const TARGET_PROMOTORIA_ID = 'cmmjj2gi10010yuv572tdpu2e';
export const TARGET_OCCURRED_AT = '2026-04-13';
export const TARGET_SCOPE = 'active';
export const TARGET_ENTITY_ID = `${TARGET_PROMOTORIA_ID}|${TARGET_OCCURRED_AT}|${TARGET_SCOPE}`;

export type AuditLogEntity = (typeof AUDITLOG_ENTITIES)[number];

export type AuditLogRow = {
  id: string;
  userId: string | null;
  module: string;
  entity: AuditLogEntity;
  entityId: string;
  action: string;
  beforeJson: unknown | null;
  afterJson: unknown | null;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: Date;
  metadata?: unknown | null;
};

export type AuditLogSchemaInfo = {
  columns: string[];
  hasMetadata: boolean;
};

export type DuplicateSummary = {
  duplicateLocalCompositeCount: number;
  alreadyInProductionByIdCount: number;
  alreadyInProductionByCompositeCount: number;
  toInsertCount: number;
};

export function createMigrationClientsFromEnv() {
  const localUrl = getRequiredEnv('LOCAL_DATABASE_URL');
  const productionUrl = getRequiredEnv('PROD_DATABASE_URL');

  assertDistinctDatabaseUrls(localUrl, productionUrl);
  assertLocalhostDatabase(localUrl);
  assertSupabaseDatabase(productionUrl);

  console.log(`LOCAL_DATABASE_URL: ${redactDatabaseUrl(localUrl)}`);
  console.log(`PROD_DATABASE_URL:  ${redactDatabaseUrl(productionUrl)}`);

  return {
    local: createClient(localUrl),
    production: createClient(productionUrl),
  };
}

export async function getAuditLogSchemaInfo(client: PrismaClient): Promise<AuditLogSchemaInfo> {
  const rows = await client.$queryRaw<Array<{ column_name: string }>>`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'AuditLog'
    order by ordinal_position
  `;
  const columns = rows.map((row) => row.column_name);
  return {
    columns,
    hasMetadata: columns.includes('metadata'),
  };
}

export async function assertProductionAdminAndReturnId(production: PrismaClient) {
  const admin = await assertProductionAdmin(production);
  return admin.id;
}

export async function getAuditLogCountsByEntity(client: PrismaClient) {
  const rows = await client.auditLog.groupBy({
    by: ['entity'],
    where: {
      entity: { in: [...AUDITLOG_ENTITIES] },
    },
    _count: { _all: true },
    orderBy: { entity: 'asc' },
  });

  const counts = Object.fromEntries(AUDITLOG_ENTITIES.map((entity) => [entity, 0]));
  for (const row of rows) {
    if (isAuditLogEntity(row.entity)) {
      counts[row.entity] = row._count._all;
    }
  }
  counts.total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return counts;
}

export async function findAuditLogs(client: PrismaClient, options?: { entityId?: string }) {
  const schemaInfo = await getAuditLogSchemaInfo(client);
  const metadataSelect = schemaInfo.hasMetadata ? ', "metadata"' : '';
  const entityIdFilter = options?.entityId ? 'and "entityId" = $3' : '';
  const params = options?.entityId
    ? [AUDITLOG_ENTITIES[0], AUDITLOG_ENTITIES[1], options.entityId]
    : [AUDITLOG_ENTITIES[0], AUDITLOG_ENTITIES[1]];

  const rows = await client.$queryRawUnsafe<AuditLogRow[]>(
    `
      select
        "id",
        "userId",
        "module",
        "entity",
        "entityId",
        "action",
        "beforeJson",
        "afterJson",
        "ip",
        "userAgent",
        "requestId",
        "createdAt"
        ${metadataSelect}
      from "AuditLog"
      where "entity" in ($1, $2)
      ${entityIdFilter}
      order by "createdAt" asc, "entity" asc, "id" asc
    `,
    ...params,
  );

  return rows;
}

export function buildCompositeKey(row: Pick<AuditLogRow, 'entity' | 'entityId' | 'action' | 'createdAt'>) {
  return [row.entity, row.entityId, row.action, new Date(row.createdAt).toISOString()].join('|');
}

export function summarizeDuplicates(localRows: AuditLogRow[], productionRows: AuditLogRow[]): DuplicateSummary {
  const productionIds = new Set(productionRows.map((row) => row.id));
  const productionComposites = new Set(productionRows.map(buildCompositeKey));
  const localCompositeCounts = new Map<string, number>();

  for (const row of localRows) {
    const key = buildCompositeKey(row);
    localCompositeCounts.set(key, (localCompositeCounts.get(key) ?? 0) + 1);
  }

  const duplicateLocalCompositeCount = [...localCompositeCounts.values()]
    .filter((count) => count > 1)
    .reduce((sum, count) => sum + count, 0);
  const alreadyInProductionByIdCount = localRows.filter((row) => productionIds.has(row.id)).length;
  const alreadyInProductionByCompositeCount = localRows.filter((row) =>
    productionComposites.has(buildCompositeKey(row)),
  ).length;
  const toInsertCount = localRows.filter(
    (row) => !productionIds.has(row.id) && !productionComposites.has(buildCompositeKey(row)),
  ).length;

  return {
    duplicateLocalCompositeCount,
    alreadyInProductionByIdCount,
    alreadyInProductionByCompositeCount,
    toInsertCount,
  };
}

export function getRowsToInsert(localRows: AuditLogRow[], productionRows: AuditLogRow[]) {
  const productionIds = new Set(productionRows.map((row) => row.id));
  const productionComposites = new Set(productionRows.map(buildCompositeKey));

  return localRows.filter(
    (row) => !productionIds.has(row.id) && !productionComposites.has(buildCompositeKey(row)),
  );
}

export function printAuditLogExamples(title: string, rows: AuditLogRow[]) {
  console.log(`\n${title}`);
  console.table(
    rows.map((row) => {
      const payload = row.afterJson && typeof row.afterJson === 'object' && !Array.isArray(row.afterJson)
        ? (row.afterJson as Record<string, unknown>)
        : {};
      const liquidation =
        payload.liquidation && typeof payload.liquidation === 'object' && !Array.isArray(payload.liquidation)
          ? (payload.liquidation as Record<string, unknown>)
          : null;

      return {
        id: row.id,
        module: row.module,
        entity: row.entity,
        entityId: row.entityId,
        action: row.action,
        createdAt: new Date(row.createdAt).toISOString(),
        userId: row.userId,
        hasRowsSnapshot: Array.isArray(payload.rowsSnapshot),
        rowsSnapshotCount: Array.isArray(payload.rowsSnapshot) ? payload.rowsSnapshot.length : null,
        paidCount: payload.paidCount ?? null,
        failedCount: payload.failedCount ?? null,
        saleAmount: liquidation?.saleAmount ?? null,
        commissionBase: liquidation?.commissionBase ?? null,
        commissionRate: liquidation?.commissionRate ?? null,
        totalToDeliver: liquidation?.totalToDeliver ?? null,
        finalCashAmount: liquidation?.finalCashAmount ?? null,
      };
    }),
  );
}

export async function insertAuditLogRow(
  production: PrismaClient,
  row: AuditLogRow,
  productionAdminUserId: string,
  includeMetadata: boolean,
) {
  const columns = [
    'id',
    'userId',
    'module',
    'entity',
    'entityId',
    'action',
    'beforeJson',
    'afterJson',
    'ip',
    'userAgent',
    'requestId',
    'createdAt',
  ];

  const values: unknown[] = [
    row.id,
    productionAdminUserId,
    row.module,
    row.entity,
    row.entityId,
    row.action,
    row.beforeJson == null ? null : JSON.stringify(row.beforeJson),
    row.afterJson == null ? null : JSON.stringify(row.afterJson),
    row.ip,
    row.userAgent,
    row.requestId,
    row.createdAt,
  ];

  if (includeMetadata) {
    columns.push('metadata');
    values.push(row.metadata == null ? null : JSON.stringify(row.metadata));
  }

  const quotedColumns = columns.map((column) => `"${column}"`).join(', ');
  const placeholders = columns
    .map((column, index) => {
      const placeholder = `$${index + 1}`;
      if (column === 'beforeJson' || column === 'afterJson' || column === 'metadata') {
        return `${placeholder}::jsonb`;
      }
      return placeholder;
    })
    .join(', ');

  await production.$executeRawUnsafe(
    `insert into "AuditLog" (${quotedColumns}) values (${placeholders})`,
    ...values,
  );
}

export function assertCompatibleMetadataSupport(localSchema: AuditLogSchemaInfo, productionSchema: AuditLogSchemaInfo) {
  if (localSchema.hasMetadata && !productionSchema.hasMetadata) {
    throw new Error('Local tiene AuditLog.metadata, pero produccion no. Abortando para no perder metadata.');
  }
}

function isAuditLogEntity(value: string): value is AuditLogEntity {
  return (AUDITLOG_ENTITIES as readonly string[]).includes(value);
}

