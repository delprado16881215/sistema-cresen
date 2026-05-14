import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const ADMIN_EMAIL = 'admin@cresen.local';
const NEW_ADMIN_PASSWORD = 'Cresen2026';
const BCRYPT_ROUNDS = 12;

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Falta configurar ${name}.`);
  }
  return value;
}

function createProductionClient() {
  const productionDatabaseUrl = getRequiredEnv('PROD_DATABASE_URL');

  return new PrismaClient({
    datasources: {
      db: {
        url: productionDatabaseUrl,
      },
    },
  });
}

async function main() {
  const prisma = createProductionClient();

  try {
    const admin = await prisma.user.findUnique({
      where: { email: ADMIN_EMAIL },
      select: {
        id: true,
        email: true,
        isActive: true,
      },
    });

    if (!admin) {
      throw new Error(`No existe el usuario ${ADMIN_EMAIL}. No se creara ningun usuario nuevo.`);
    }

    const passwordHash = await hash(NEW_ADMIN_PASSWORD, BCRYPT_ROUNDS);

    await prisma.user.update({
      where: { email: ADMIN_EMAIL },
      data: { passwordHash },
      select: { id: true },
    });

    console.log(`Password actualizado para ${admin.email}. Roles y permisos no fueron modificados.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
