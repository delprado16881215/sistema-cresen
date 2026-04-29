import { PrismaClient } from '@prisma/client';
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
};

function parseOptions(argv: string[]): BootstrapOptions & { help: boolean } {
  const options = {
    dryRun: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      options.dryRun = true;
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

Variables:
  DATABASE_URL      Base de datos de producción.
  ADMIN_EMAIL       Correo del administrador inicial.
  ADMIN_PASSWORD    Contraseña inicial, mínimo 12 caracteres.
  ADMIN_NAME        Nombre visible opcional. Default: Administrador Inicial.
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

  await prisma.$transaction(async (tx) => {
    const internalType = await tx.userType.upsert({
      where: { code: 'INTERNAL' },
      create: { code: 'INTERNAL', name: 'Interno', isActive: true },
      update: { name: 'Interno', isActive: true },
    });

    for (const roleCode of ROLE_CODES) {
      await tx.role.upsert({
        where: { code: roleCode },
        create: { code: roleCode, name: getRoleName(roleCode) },
        update: { name: getRoleName(roleCode) },
      });
    }

    for (const permission of permissionEntries) {
      await tx.permission.upsert({
        where: { code: permission.code },
        create: permission,
        update: { name: permission.name },
      });
    }

    const superAdminRole = await tx.role.findUniqueOrThrow({
      where: { code: 'SUPER_ADMIN' },
      select: { id: true },
    });
    const permissions = await tx.permission.findMany({
      select: { id: true },
    });

    for (const permission of permissions) {
      await tx.rolePermission.upsert({
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

    const admin = await tx.user.upsert({
      where: { email: adminEmail },
      create: {
        email: adminEmail,
        name: adminName,
        passwordHash,
        userTypeId: internalType.id,
        isActive: true,
      },
      update: {
        name: adminName,
        passwordHash,
        userTypeId: internalType.id,
        isActive: true,
      },
      select: { id: true },
    });

    await tx.userRole.upsert({
      where: {
        userId_roleId: {
          userId: admin.id,
          roleId: superAdminRole.id,
        },
      },
      create: {
        userId: admin.id,
        roleId: superAdminRole.id,
      },
      update: {},
    });
  });

  console.log(
    JSON.stringify(
      {
        status: 'ok',
        adminEmail,
        adminName,
        role: 'SUPER_ADMIN',
        permissionsGrantedToSuperAdmin: permissionEntries.length,
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
