import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

export const ADMIN_EMAIL = 'admin@cresen.local';

export type DbName = 'local' | 'production';

export type CountKey =
  | 'User'
  | 'Account'
  | 'Session'
  | 'VerificationToken'
  | 'UserType'
  | 'Role'
  | 'Permission'
  | 'UserRole'
  | 'RolePermission'
  | 'Zone'
  | 'ClientTypeCatalog'
  | 'CreditStatusCatalog'
  | 'PenaltyStatusCatalog'
  | 'PaymentStatusCatalog'
  | 'InstallmentStatusCatalog'
  | 'Grupo'
  | 'Cliente'
  | 'CreditPlanRule'
  | 'Credito'
  | 'CreditoLegalEvent'
  | 'CreditoLegalMetadata'
  | 'MessageTemplate'
  | 'CommunicationLog'
  | 'CreditSchedule'
  | 'PaymentEvent'
  | 'PaymentAllocation'
  | 'DefaultEvent'
  | 'PenaltyCharge'
  | 'RecoveryEvent'
  | 'AdvanceEvent'
  | 'ExtraWeekEvent'
  | 'Interaccion'
  | 'PromesaPago'
  | 'VisitaCampo'
  | 'ClienteGeoReference'
  | 'CobranzaSyncLedger'
  | 'ExpedienteAlerta'
  | 'BusinessRule'
  | 'SystemCounter'
  | 'AuditLog'
  | 'FinancialEventLog'
  | 'FinancialReversal'
  | 'Promotora'
  | 'PromotoraGrupo';

type PrismaDelegateName =
  | 'user'
  | 'account'
  | 'session'
  | 'verificationToken'
  | 'userType'
  | 'role'
  | 'permission'
  | 'userRole'
  | 'rolePermission'
  | 'supervision'
  | 'clientTypeCatalog'
  | 'creditStatusCatalog'
  | 'penaltyStatusCatalog'
  | 'paymentStatusCatalog'
  | 'installmentStatusCatalog'
  | 'promotoria'
  | 'cliente'
  | 'creditPlanRule'
  | 'credito'
  | 'creditoLegalEvent'
  | 'creditoLegalMetadata'
  | 'messageTemplate'
  | 'communicationLog'
  | 'creditSchedule'
  | 'paymentEvent'
  | 'paymentAllocation'
  | 'defaultEvent'
  | 'penaltyCharge'
  | 'recoveryEvent'
  | 'advanceEvent'
  | 'extraWeekEvent'
  | 'interaccion'
  | 'promesaPago'
  | 'visitaCampo'
  | 'clienteGeoReference'
  | 'cobranzaSyncLedger'
  | 'expedienteAlerta'
  | 'businessRule'
  | 'systemCounter'
  | 'auditLog'
  | 'financialEventLog'
  | 'financialReversal';

export type PrismaTable = {
  key: CountKey;
  delegate: PrismaDelegateName;
  migrates: boolean;
  userFields?: string[];
};

export const prismaTables: PrismaTable[] = [
  { key: 'User', delegate: 'user', migrates: false },
  { key: 'Account', delegate: 'account', migrates: false },
  { key: 'Session', delegate: 'session', migrates: false },
  { key: 'VerificationToken', delegate: 'verificationToken', migrates: false },
  { key: 'UserType', delegate: 'userType', migrates: false },
  { key: 'Role', delegate: 'role', migrates: false },
  { key: 'Permission', delegate: 'permission', migrates: false },
  { key: 'UserRole', delegate: 'userRole', migrates: false },
  { key: 'RolePermission', delegate: 'rolePermission', migrates: false },
  { key: 'Zone', delegate: 'supervision', migrates: true },
  { key: 'ClientTypeCatalog', delegate: 'clientTypeCatalog', migrates: true },
  { key: 'CreditStatusCatalog', delegate: 'creditStatusCatalog', migrates: true },
  { key: 'PenaltyStatusCatalog', delegate: 'penaltyStatusCatalog', migrates: true },
  { key: 'PaymentStatusCatalog', delegate: 'paymentStatusCatalog', migrates: true },
  { key: 'InstallmentStatusCatalog', delegate: 'installmentStatusCatalog', migrates: true },
  { key: 'Grupo', delegate: 'promotoria', migrates: true },
  { key: 'Cliente', delegate: 'cliente', migrates: true },
  { key: 'CreditPlanRule', delegate: 'creditPlanRule', migrates: true },
  {
    key: 'Credito',
    delegate: 'credito',
    migrates: true,
    userFields: ['createdByUserId', 'updatedByUserId', 'legalUpdatedByUserId'],
  },
  {
    key: 'CreditoLegalEvent',
    delegate: 'creditoLegalEvent',
    migrates: true,
    userFields: ['createdByUserId'],
  },
  { key: 'CreditoLegalMetadata', delegate: 'creditoLegalMetadata', migrates: true },
  {
    key: 'MessageTemplate',
    delegate: 'messageTemplate',
    migrates: true,
    userFields: ['createdByUserId', 'updatedByUserId'],
  },
  {
    key: 'CommunicationLog',
    delegate: 'communicationLog',
    migrates: true,
    userFields: ['createdByUserId'],
  },
  { key: 'CreditSchedule', delegate: 'creditSchedule', migrates: true },
  {
    key: 'PaymentEvent',
    delegate: 'paymentEvent',
    migrates: true,
    userFields: ['capturedByUserId', 'reversedByUserId'],
  },
  { key: 'PaymentAllocation', delegate: 'paymentAllocation', migrates: true },
  {
    key: 'DefaultEvent',
    delegate: 'defaultEvent',
    migrates: true,
    userFields: ['createdByUserId'],
  },
  {
    key: 'PenaltyCharge',
    delegate: 'penaltyCharge',
    migrates: true,
    userFields: ['createdByUserId'],
  },
  {
    key: 'RecoveryEvent',
    delegate: 'recoveryEvent',
    migrates: true,
    userFields: ['createdByUserId'],
  },
  {
    key: 'AdvanceEvent',
    delegate: 'advanceEvent',
    migrates: true,
    userFields: ['registeredByUserId'],
  },
  {
    key: 'ExtraWeekEvent',
    delegate: 'extraWeekEvent',
    migrates: true,
    userFields: ['generatedByUserId'],
  },
  {
    key: 'Interaccion',
    delegate: 'interaccion',
    migrates: true,
    userFields: ['createdByUserId'],
  },
  {
    key: 'PromesaPago',
    delegate: 'promesaPago',
    migrates: true,
    userFields: ['createdByUserId'],
  },
  {
    key: 'VisitaCampo',
    delegate: 'visitaCampo',
    migrates: true,
    userFields: ['createdByUserId'],
  },
  { key: 'ClienteGeoReference', delegate: 'clienteGeoReference', migrates: true },
  { key: 'CobranzaSyncLedger', delegate: 'cobranzaSyncLedger', migrates: false },
  {
    key: 'ExpedienteAlerta',
    delegate: 'expedienteAlerta',
    migrates: true,
    userFields: ['reviewedByUserId'],
  },
  { key: 'BusinessRule', delegate: 'businessRule', migrates: true },
  { key: 'SystemCounter', delegate: 'systemCounter', migrates: false },
  { key: 'AuditLog', delegate: 'auditLog', migrates: false },
  { key: 'FinancialEventLog', delegate: 'financialEventLog', migrates: false },
  {
    key: 'FinancialReversal',
    delegate: 'financialReversal',
    migrates: true,
    userFields: ['reversedByUserId'],
  },
];

export const migrationOrder: CountKey[] = [
  'ClientTypeCatalog',
  'CreditStatusCatalog',
  'PenaltyStatusCatalog',
  'PaymentStatusCatalog',
  'InstallmentStatusCatalog',
  'BusinessRule',
  'CreditPlanRule',
  'Zone',
  'Grupo',
  'Cliente',
  'Credito',
  'ClienteGeoReference',
  'CreditSchedule',
  'PaymentEvent',
  'DefaultEvent',
  'PenaltyCharge',
  'ExtraWeekEvent',
  'PaymentAllocation',
  'RecoveryEvent',
  'AdvanceEvent',
  'FinancialReversal',
  'Interaccion',
  'PromesaPago',
  'VisitaCampo',
  'ExpedienteAlerta',
  'CreditoLegalEvent',
  'CreditoLegalMetadata',
  'MessageTemplate',
  'CommunicationLog',
];

export const neverMigrateTables: CountKey[] = [
  'User',
  'Role',
  'Permission',
  'UserRole',
  'RolePermission',
  'Account',
  'Session',
  'VerificationToken',
  'AuditLog',
  'CobranzaSyncLedger',
  'FinancialEventLog',
  'Promotora',
  'PromotoraGrupo',
];

export const userMappedTables = prismaTables.filter((table) => table.userFields?.length);

export function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Falta configurar ${name}.`);
  }
  return value;
}

export function getOptionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function createClient(url: string): PrismaClient {
  return new PrismaClient({
    datasources: {
      db: { url },
    },
  });
}

export function redactDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '***';
    }
    if (parsed.username) {
      parsed.username = '***';
    }
    return parsed.toString();
  } catch {
    return '[url invalida]';
  }
}

export function assertDistinctDatabaseUrls(localUrl: string, productionUrl: string): void {
  if (localUrl === productionUrl) {
    throw new Error('LOCAL_DATABASE_URL y PROD_DATABASE_URL son identicas. Abortando.');
  }

  const local = new URL(localUrl);
  const production = new URL(productionUrl);
  const sameTarget =
    local.hostname === production.hostname &&
    local.port === production.port &&
    local.pathname === production.pathname &&
    local.searchParams.get('schema') === production.searchParams.get('schema');

  if (sameTarget) {
    throw new Error('LOCAL_DATABASE_URL y PROD_DATABASE_URL parecen apuntar a la misma base. Abortando.');
  }
}

export function assertLocalhostDatabase(localUrl: string): void {
  const hostname = new URL(localUrl).hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) {
    throw new Error(`LOCAL_DATABASE_URL debe apuntar a localhost. Host recibido: ${hostname}`);
  }
}

export function assertSupabaseDatabase(productionUrl: string): void {
  const hostname = new URL(productionUrl).hostname;
  const looksLikeSupabase =
    hostname.includes('supabase.co') ||
    hostname.includes('supabase.com') ||
    hostname.includes('pooler.supabase.com');

  if (!looksLikeSupabase) {
    throw new Error(`PROD_DATABASE_URL debe apuntar a Supabase. Host recibido: ${hostname}`);
  }
}

export async function getAdminUser(client: PrismaClient) {
  return client.user.findUnique({
    where: { email: ADMIN_EMAIL },
    select: { id: true, email: true, name: true, isActive: true },
  });
}

export async function assertProductionAdmin(client: PrismaClient) {
  const admin = await getAdminUser(client);
  if (!admin) {
    throw new Error(`No existe ${ADMIN_EMAIL} en produccion. Abortando.`);
  }
  if (!admin.isActive) {
    throw new Error(`${ADMIN_EMAIL} existe en produccion, pero esta inactivo. Abortando.`);
  }
  return admin;
}

export async function countPrismaTable(client: PrismaClient, table: PrismaTable): Promise<number> {
  const delegate = (client as unknown as Record<string, { count: () => Promise<number> }>)[table.delegate];
  return delegate.count();
}

export async function countRawTable(client: PrismaClient, tableName: string): Promise<number> {
  const rows = await client.$queryRawUnsafe<Array<{ count: number }>>(
    `select count(*)::int as count from "${tableName}"`,
  );
  return Number(rows[0]?.count ?? 0);
}

export async function getCounts(client: PrismaClient): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  for (const table of prismaTables) {
    counts[table.key] = await countPrismaTable(client, table);
  }

  counts.Promotora = await countRawTable(client, 'Promotora').catch(() => -1);
  counts.PromotoraGrupo = await countRawTable(client, 'PromotoraGrupo').catch(() => -1);

  return counts;
}

export function printCounts(title: string, counts: Record<string, number>): void {
  console.log(`\n${title}`);
  for (const key of Object.keys(counts).sort()) {
    console.log(`${key.padEnd(28)} ${counts[key]}`);
  }
}

export async function buildUserIdMap(local: PrismaClient, production: PrismaClient) {
  const productionAdmin = await assertProductionAdmin(production);
  const localUsers = await local.user.findMany({
    select: { id: true, email: true, name: true, isActive: true },
    orderBy: { email: 'asc' },
  });

  return {
    productionAdmin,
    localUsers,
    userIdMap: Object.fromEntries(localUsers.map((user) => [user.id, productionAdmin.id])),
  };
}

export function mapUserFields(
  row: Record<string, unknown>,
  table: PrismaTable,
  userIdMap: Record<string, string>,
): Record<string, unknown> {
  const mapped = { ...row };

  for (const field of table.userFields ?? []) {
    const value = mapped[field];
    if (typeof value === 'string') {
      const replacement = userIdMap[value];
      if (!replacement) {
        throw new Error(`No hay mapeo de usuario para ${table.key}.${field}=${value}`);
      }
      mapped[field] = replacement;
    }
  }

  return mapped;
}

export async function findUniqueCollisions(local: PrismaClient, production: PrismaClient) {
  const checks = [
    {
      label: 'Cliente.code',
      sql: `select l.code from "Cliente" l join dblink_placeholder p on true`,
      localTable: 'Cliente',
      productionTable: 'Cliente',
      columns: ['code'],
    },
    {
      label: 'Cliente.externalClientId',
      localTable: 'Cliente',
      productionTable: 'Cliente',
      columns: ['externalClientId'],
      nullable: true,
    },
    { label: 'Credito.folio', localTable: 'Credito', productionTable: 'Credito', columns: ['folio'] },
    {
      label: 'Credito.loanNumber',
      localTable: 'Credito',
      productionTable: 'Credito',
      columns: ['loanNumber'],
    },
    {
      label: 'Credito.saleId',
      localTable: 'Credito',
      productionTable: 'Credito',
      columns: ['saleId'],
      nullable: true,
    },
    { label: 'Grupo.code', localTable: 'Grupo', productionTable: 'Grupo', columns: ['code'] },
    { label: 'Zone.code', localTable: 'Zone', productionTable: 'Zone', columns: ['code'] },
  ];

  const collisions: Array<{ label: string; count: number; samples: unknown[] }> = [];

  for (const check of checks) {
    const [column] = check.columns;
    const where = check.nullable ? { NOT: { [column]: null } } : undefined;
    const localRows = await findManyByPhysicalTable(local, check.localTable, column, where);
    const productionRows = await findManyByPhysicalTable(production, check.productionTable, column, where);
    const productionValues = new Set(productionRows.map((row) => row[column]));
    const matches = localRows.filter((row) => productionValues.has(row[column]));

    collisions.push({
      label: check.label,
      count: matches.length,
      samples: matches.slice(0, 10).map((row) => row[column]),
    });
  }

  return collisions;
}

async function findManyByPhysicalTable(
  client: PrismaClient,
  tableName: string,
  column: string,
  where?: Record<string, unknown>,
) {
  const delegateByPhysicalTable: Record<string, PrismaDelegateName> = {
    Cliente: 'cliente',
    Credito: 'credito',
    Grupo: 'promotoria',
    Zone: 'supervision',
  };
  const delegateName = delegateByPhysicalTable[tableName];
  if (!delegateName) {
    throw new Error(`Tabla no soportada para unique collision check: ${tableName}`);
  }

  const delegate = (client as unknown as Record<string, { findMany: (args: unknown) => Promise<unknown[]> }>)[
    delegateName
  ];
  return delegate.findMany({
    where,
    select: { [column]: true },
  }) as Promise<Array<Record<string, unknown>>>;
}

export async function getRelationshipIssues(client: PrismaClient) {
  const checks: Record<string, string> = {
    creditosSinCliente: `select count(*)::int as count from "Credito" c left join "Cliente" cl on cl.id=c."clienteId" where cl.id is null`,
    creditosSinGrupo: `select count(*)::int as count from "Credito" c left join "Grupo" g on g.id=c."grupoId" where g.id is null`,
    creditosSinPlan: `select count(*)::int as count from "Credito" c left join "CreditPlanRule" p on p.id=c."creditPlanRuleId" where p.id is null`,
    creditosSinStatus: `select count(*)::int as count from "Credito" c left join "CreditStatusCatalog" s on s.id=c."creditStatusId" where s.id is null`,
    calendariosSinCredito: `select count(*)::int as count from "CreditSchedule" s left join "Credito" c on c.id=s."creditoId" where c.id is null`,
    pagosSinCredito: `select count(*)::int as count from "PaymentEvent" p left join "Credito" c on c.id=p."creditoId" where c.id is null`,
    pagosSinStatus: `select count(*)::int as count from "PaymentEvent" p left join "PaymentStatusCatalog" s on s.id=p."paymentStatusId" where s.id is null`,
    allocationsSinPago: `select count(*)::int as count from "PaymentAllocation" a left join "PaymentEvent" p on p.id=a."paymentEventId" where p.id is null`,
    fallasSinCredito: `select count(*)::int as count from "DefaultEvent" d left join "Credito" c on c.id=d."creditoId" where c.id is null`,
    fallasSinCalendario: `select count(*)::int as count from "DefaultEvent" d left join "CreditSchedule" s on s.id=d."scheduleId" where s.id is null`,
    recuperacionesSinFalla: `select count(*)::int as count from "RecoveryEvent" r left join "DefaultEvent" d on d.id=r."defaultEventId" where d.id is null`,
    recuperacionesSinPago: `select count(*)::int as count from "RecoveryEvent" r left join "PaymentEvent" p on p.id=r."paymentEventId" where p.id is null`,
    semanaExtraSinCredito: `select count(*)::int as count from "ExtraWeekEvent" e left join "Credito" c on c.id=e."creditoId" where c.id is null`,
    juridicoSinCredito: `select count(*)::int as count from "CreditoLegalEvent" e left join "Credito" c on c.id=e."creditoId" where c.id is null`,
    juridicoSinCliente: `select count(*)::int as count from "CreditoLegalEvent" e left join "Cliente" c on c.id=e."clienteId" where c.id is null`,
    interaccionesSinCliente: `select count(*)::int as count from "Interaccion" i left join "Cliente" c on c.id=i."clienteId" where c.id is null`,
    promesasSinCliente: `select count(*)::int as count from "PromesaPago" p left join "Cliente" c on c.id=p."clienteId" where c.id is null`,
    visitasSinCliente: `select count(*)::int as count from "VisitaCampo" v left join "Cliente" c on c.id=v."clienteId" where c.id is null`,
  };

  const result: Record<string, number> = {};
  for (const [key, sql] of Object.entries(checks)) {
    const rows = await client.$queryRawUnsafe<Array<{ count: number }>>(sql);
    result[key] = Number(rows[0]?.count ?? 0);
  }
  return result;
}

export async function getFinancialSums(client: PrismaClient) {
  const rows = await client.$queryRawUnsafe<
    Array<{ metric: string; value: string | number | null }>
  >(`
    select 'Credito.principalAmount' as metric, coalesce(sum("principalAmount"), 0)::text as value from "Credito"
    union all select 'Credito.weeklyAmount', coalesce(sum("weeklyAmount"), 0)::text from "Credito"
    union all select 'Credito.totalPayableAmount', coalesce(sum("totalPayableAmount"), 0)::text from "Credito"
    union all select 'PaymentEvent.amountReceived.gross', coalesce(sum("amountReceived"), 0)::text from "PaymentEvent"
    union all select 'PaymentEvent.amountReceived.notReversed', coalesce(sum("amountReceived"), 0)::text from "PaymentEvent" where "isReversed" = false
    union all select 'PaymentAllocation.amount', coalesce(sum(amount), 0)::text from "PaymentAllocation"
    union all select 'DefaultEvent.amountMissed', coalesce(sum("amountMissed"), 0)::text from "DefaultEvent"
    union all select 'PenaltyCharge.amount', coalesce(sum(amount), 0)::text from "PenaltyCharge"
    union all select 'RecoveryEvent.recoveredAmount', coalesce(sum("recoveredAmount"), 0)::text from "RecoveryEvent"
    union all select 'AdvanceEvent.amount', coalesce(sum(amount), 0)::text from "AdvanceEvent"
    union all select 'ExtraWeekEvent.expectedAmount', coalesce(sum("expectedAmount"), 0)::text from "ExtraWeekEvent"
    union all select 'ExtraWeekEvent.paidAmount', coalesce(sum("paidAmount"), 0)::text from "ExtraWeekEvent"
  `);

  return Object.fromEntries(rows.map((row) => [row.metric, row.value?.toString() ?? '0']));
}

export async function getSystemCounterValue(client: PrismaClient) {
  const counter = await client.systemCounter.findUnique({
    where: { key: 'CLIENTE_CODE_SEQUENCE' },
    select: { value: true },
  });
  return counter?.value ?? null;
}

export async function getMaxClienteCodeNumber(client: PrismaClient) {
  const rows = await client.$queryRaw<Array<{ max: number | null }>>`
    select max(nullif(regexp_replace(code, '[^0-9]', '', 'g'), '')::int) as max
    from "Cliente"
  `;
  return rows[0]?.max ?? null;
}

export function assertNoOperationalData(counts: Record<string, number>): void {
  const guarded = ['Cliente', 'Credito', 'PaymentEvent'] as const;
  const present = guarded.filter((key) => (counts[key] ?? 0) > 0);
  if (present.length) {
    throw new Error(`Produccion ya tiene datos operativos en: ${present.join(', ')}. Abortando.`);
  }
}

export function assertBackupEvidence(): void {
  const evidence = getOptionalEnv('PROD_BACKUP_FILE') ?? getOptionalEnv('PROD_BACKUP_CONFIRMED_AT');
  if (!evidence) {
    throw new Error(
      'Falta evidencia de backup. Configura PROD_BACKUP_FILE o PROD_BACKUP_CONFIRMED_AT antes de migrar.',
    );
  }
}

export async function createManifest(inserted: Record<string, string[]>) {
  const manifestDir = path.join(process.cwd(), 'migration-manifests', 'database');
  await mkdir(manifestDir, { recursive: true });

  const manifest = {
    generatedAt: new Date().toISOString(),
    inserted,
  };
  const filePath = path.join(manifestDir, `local-to-production-${manifest.generatedAt.replace(/[:.]/g, '-')}.json`);
  await writeFile(filePath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return filePath;
}

export async function disconnectAll(...clients: PrismaClient[]): Promise<void> {
  await Promise.allSettled(clients.map((client) => client.$disconnect()));
}
