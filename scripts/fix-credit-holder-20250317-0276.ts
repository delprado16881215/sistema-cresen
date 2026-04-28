import { prisma } from '@/lib/prisma';
import { correctCreditoAcreditado } from '@/server/services/creditos-service';

const CREDIT_FOLIO = 'CRED-20250317-0276';
const TARGET_CLIENT_CODE = '1811';

async function main() {
  const creditoBefore = await prisma.credito.findFirst({
    where: { folio: CREDIT_FOLIO },
    select: {
      id: true,
      folio: true,
      loanNumber: true,
      createdByUserId: true,
      clienteId: true,
      avalClienteId: true,
      cliente: {
        select: {
          id: true,
          code: true,
          fullName: true,
        },
      },
      aval: {
        select: {
          id: true,
          code: true,
          fullName: true,
        },
      },
      _count: {
        select: {
          payments: true,
          schedules: true,
          defaults: true,
          recoveries: true,
          advances: true,
          penalties: true,
        },
      },
    },
  });

  if (!creditoBefore) {
    throw new Error(`No encontré el crédito ${CREDIT_FOLIO}.`);
  }

  const targetClient = await prisma.cliente.findFirst({
    where: { code: TARGET_CLIENT_CODE, deletedAt: null, isActive: true },
    select: {
      id: true,
      code: true,
      fullName: true,
    },
  });

  if (!targetClient) {
    throw new Error(`No encontré el cliente ${TARGET_CLIENT_CODE}.`);
  }

  if (creditoBefore.clienteId === targetClient.id) {
    console.log(
      JSON.stringify(
        {
          status: 'noop',
          message: 'El crédito ya está asignado al acreditado correcto.',
          credito: creditoBefore,
          targetClient,
        },
        null,
        2,
      ),
    );
    return;
  }

  const fallbackUser =
    creditoBefore.createdByUserId ||
    (
      await prisma.user.findFirst({
        where: { isActive: true },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      })
    )?.id;

  if (!fallbackUser) {
    throw new Error('No encontré un usuario activo para registrar la corrección.');
  }

  const result = await correctCreditoAcreditado(
    {
      creditoId: creditoBefore.id,
      clienteId: targetClient.id,
      reason: 'Corrección puntual de importación: titular real 1811 · SINAHI GUADALUPE.',
    },
    fallbackUser,
  );

  const creditoAfter = await prisma.credito.findUnique({
    where: { id: creditoBefore.id },
    select: {
      id: true,
      folio: true,
      loanNumber: true,
      clienteId: true,
      avalClienteId: true,
      cliente: {
        select: {
          id: true,
          code: true,
          fullName: true,
        },
      },
      aval: {
        select: {
          id: true,
          code: true,
          fullName: true,
        },
      },
      _count: {
        select: {
          payments: true,
          schedules: true,
          defaults: true,
          recoveries: true,
          advances: true,
          penalties: true,
        },
      },
    },
  });

  console.log(
    JSON.stringify(
      {
        status: 'corrected',
        correctedField: result.correctedField,
        beforeHolder: creditoBefore.cliente,
        afterHolder: creditoAfter?.cliente,
        avalUnchanged: creditoBefore.aval?.id === creditoAfter?.aval?.id,
        relatedCountsBefore: creditoBefore._count,
        relatedCountsAfter: creditoAfter?._count,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
