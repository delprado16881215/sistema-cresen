import { PrismaClient, type Prisma } from '@prisma/client';
import { hash } from 'bcryptjs';
import { PERMISSIONS } from '../src/config/permissions';

const prisma = new PrismaClient();

const ROLE_CODES = [
  'SUPER_ADMIN',
  'ADMIN_FINANCIERA',
  'CAJA',
  'ANALISTA',
  'AUDITOR',
  'LECTURA',
] as const;

const PERMISSION_LABELS: Record<string, string> = {
  [PERMISSIONS.DASHBOARD_READ]: 'Ver dashboard',
  [PERMISSIONS.CLIENTES_READ]: 'Ver clientes',
  [PERMISSIONS.CLIENTES_WRITE]: 'Crear/editar clientes',
  [PERMISSIONS.CLIENTES_DEACTIVATE]: 'Baja lógica de clientes',
  [PERMISSIONS.CREDITOS_READ]: 'Ver créditos',
  [PERMISSIONS.CREDITOS_WRITE]: 'Originar créditos',
  [PERMISSIONS.PAGOS_READ]: 'Ver pagos',
  [PERMISSIONS.PAGOS_WRITE]: 'Registrar pagos',
  [PERMISSIONS.REPORTES_READ]: 'Ver reportes operativos',
  [PERMISSIONS.SUPERVISIONES_READ]: 'Ver supervisiones',
  [PERMISSIONS.SUPERVISIONES_WRITE]: 'Gestionar supervisiones',
  [PERMISSIONS.PROMOTORIAS_READ]: 'Ver promotorías',
  [PERMISSIONS.PROMOTORIAS_WRITE]: 'Gestionar promotorías',
  [PERMISSIONS.USUARIOS_READ]: 'Ver usuarios',
};

type BootstrapOptions = {
  dryRun: boolean;
  noTransaction: boolean;
};

function parseOptions(argv: string[]): BootstrapOptions & { help: boolean } {
  const options = {
    dryRun: false,
    noTransaction: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg === '--no-transaction') {
      options.noTransaction = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    throw new Error(`Argumento no soportado: ${arg}`);
  }

  return options;
}

function printHelp() {
  console.log(`
Uso:
  ADMIN_EMAIL="admin@tu-dominio.com" ADMIN_PASSWORD="contraseña-segura" npm run prod:bootstrap-admin
  ADMIN_EMAIL="admin@tu-dominio.com" ADMIN_PASSWORD="contraseña-segura" npm run prod:bootstrap-admin:dry-run
  ADMIN_EMAIL="admin@tu-dominio.com" ADMIN_PASSWORD="contraseña-segura" npm run prod:bootstrap-admin -- --no-transaction

Variables:
  DATABASE_URL      Base de datos de producción.
  ADMIN_EMAIL       Correo del administrador inicial.
  ADMIN_PASSWORD    Contraseña inicial, mínimo 12 caracteres.
  ADMIN_NAME        Nombre visible opcional. Default: Administrador Inicial.

Opciones:
  --dry-run          Muestra qué haría sin escribir datos.
  --no-transaction   Ejecuta upserts idempotentes sin transacción larga.
`.trim());
}

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Falta configurar ${name}.`);
  }
  return value;
}

function validateAdminPassword(password: string) {
  if (password.length < 12) {
    throw new Error('ADMIN_PASSWORD debe tener al menos 12 caracteres.');
  }
}

function getRoleName(roleCode: string) {
  return roleCode
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}

type BootstrapClient = PrismaClient | Prisma.TransactionClient;

async function upsertUserType(client: BootstrapClient) {
  return client.userType.upsert({
    where: { code: 'INTERNAL' },
    create: { code: 'INTERNAL', name: 'Interno', isActive: true },
    update: { name: 'Interno', isActive: true },
  });
}

async function upsertRoles(client: BootstrapClient) {
  for (const roleCode of ROLE_CODES) {
    await client.role.upsert({
      where: { code: roleCode },
      create: { code: roleCode, name: getRoleName(roleCode) },
      update: { name: getRoleName(roleCode) },
    });
  }
}

async function upsertPermissions(
  client: BootstrapClient,
  permissionEntries: Array<{ code: string; name: string }>,
) {
  for (const permission of permissionEntries) {
    await client.permission.upsert({
      where: { code: permission.code },
      create: permission,
      update: { name: permission.name },
    });
  }
}

async function grantAllPermissionsToSuperAdmin(client: BootstrapClient) {
  const superAdminRole = await client.role.findUniqueOrThrow({
    where: { code: 'SUPER_ADMIN' },
    select: { id: true },
  });
  const permissions = await client.permission.findMany({
    select: { id: true },
  });

  for (const permission of permissions) {
    await client.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: superAdminRole.id,
          permissionId: permission.id,
        },
      },
      create: {
        roleId: superAdminRole.id,
        permissionId: permission.id,
      },
      update: {},
    });
  }

  return superAdminRole;
}

async function upsertAdminUser(input: {
  client: BootstrapClient;
  adminEmail: string;
  adminName: string;
  passwordHash: string;
  internalTypeId: string;
  superAdminRoleId: string;
}) {
  const admin = await input.client.user.upsert({
    where: { email: input.adminEmail },
    create: {
      email: input.adminEmail,
      name: input.adminName,
      passwordHash: input.passwordHash,
      userTypeId: input.internalTypeId,
      isActive: true,
    },
    update: {
      name: input.adminName,
      passwordHash: input.passwordHash,
      userTypeId: input.internalTypeId,
      isActive: true,
    },
    select: { id: true },
  });

  await input.client.userRole.upsert({
    where: {
      userId_roleId: {
        userId: admin.id,
        roleId: input.superAdminRoleId,
      },
    },
    create: {
      userId: admin.id,
      roleId: input.superAdminRoleId,
    },
    update: {},
  });
}

async function applyBootstrap(input: {
  client: BootstrapClient;
  adminEmail: string;
  adminName: string;
  passwordHash: string;
  permissionEntries: Array<{ code: string; name: string }>;
}) {
  const internalType = await upsertUserType(input.client);
  await upsertRoles(input.client);
  await upsertPermissions(input.client, input.permissionEntries);
  const superAdminRole = await grantAllPermissionsToSuperAdmin(input.client);
  await upsertAdminUser({
    client: input.client,
    adminEmail: input.adminEmail,
    adminName: input.adminName,
    passwordHash: input.passwordHash,
    internalTypeId: internalType.id,
    superAdminRoleId: superAdminRole.id,
  });
}

async function bootstrapProductionAdmin(options: BootstrapOptions) {
  const adminEmail = getRequiredEnv('ADMIN_EMAIL').toLowerCase();
  const adminPassword = getRequiredEnv('ADMIN_PASSWORD');
  const adminName = process.env.ADMIN_NAME?.trim() || 'Administrador Inicial';
  validateAdminPassword(adminPassword);

  const permissionEntries = Object.values(PERMISSIONS).map((code) => ({
    code,
    name: PERMISSION_LABELS[code] ?? code,
  }));

  if (options.dryRun) {
    const existingAdmin = await prisma.user.findUnique({
      where: { email: adminEmail },
      select: {
        id: true,
        email: true,
        isActive: true,
        roles: {
          select: {
            role: { select: { code: true } },
          },
        },
      },
    });

    console.log(
      JSON.stringify(
        {
          dryRun: true,
          noTransaction: options.noTransaction,
          willCreateOrUpdateUserType: 'INTERNAL',
          willUpsertRoles: ROLE_CODES,
          willUpsertPermissions: permissionEntries.map((permission) => permission.code),
          willGrantSuperAdminAllPermissions: true,
          admin: {
            email: adminEmail,
            name: adminName,
            exists: Boolean(existingAdmin),
            isActive: existingAdmin?.isActive ?? null,
            roles: existingAdmin?.roles.map((item) => item.role.code) ?? [],
          },
        },
        null,
        2,
      ),
    );
    return;
  }

  const passwordHash = await hash(adminPassword, 12);

  if (options.noTransaction) {
    await applyBootstrap({
      client: prisma,
      adminEmail,
      adminName,
      passwordHash,
      permissionEntries,
    });
  } else {
    await prisma.$transaction(
      async (tx) => {
        await applyBootstrap({
          client: tx,
          adminEmail,
          adminName,
          passwordHash,
          permissionEntries,
        });
      },
      {
        maxWait: 30000,
        timeout: 30000,
      },
    );
  }

  const admin = await prisma.user.findUnique({
    where: { email: adminEmail },
    select: {
      roles: {
        where: { role: { code: 'SUPER_ADMIN' } },
        select: { roleId: true },
      },
    },
  });

  if (!admin?.roles.length) {
    throw new Error('El bootstrap terminó sin asignar SUPER_ADMIN al usuario.');
  }

  const permissionsGrantedToSuperAdmin = await prisma.rolePermission.count({
    where: {
      role: {
        code: 'SUPER_ADMIN',
      },
    },
  });

  console.log(
    JSON.stringify(
      {
        status: 'ok',
        adminEmail,
        adminName,
        role: 'SUPER_ADMIN',
        noTransaction: options.noTransaction,
        permissionsGrantedToSuperAdmin,
      },
      null,
      2,
    ),
  );
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  await bootstrapProductionAdmin(options);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
