import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const promotorias = await prisma.promotoria.findMany({
    where: { deletedAt: null },
    select: { id: true, code: true, name: true },
    orderBy: { name: 'asc' },
  });

  console.log(JSON.stringify(promotorias, null, 2));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
