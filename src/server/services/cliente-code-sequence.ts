import type { Prisma } from '@prisma/client';

const CLIENTE_CODE_COUNTER_KEY = 'CLIENTE_CODE_SEQUENCE';

function parseNumericClienteCode(code: string | null | undefined) {
  if (!code) return null;
  const normalized = code.trim().toUpperCase();
  const match = normalized.match(/^(?:CR)?(\d+)$/);
  const numericPart = match?.[1];
  if (!numericPart) return null;
  return Number.parseInt(numericPart, 10);
}

async function getBootstrapValue(tx: Prisma.TransactionClient) {
  const existingCodes = await tx.cliente.findMany({ select: { code: true } });
  const maxCurrentCode = existingCodes.reduce((max, row) => {
    const sequence = parseNumericClienteCode(row.code);
    if (!Number.isFinite(sequence)) return max;
    return Math.max(max, sequence ?? 0);
  }, 0);

  return maxCurrentCode;
}

export async function generateNextClienteCode(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(2026031201)`;

  const currentCounter = await tx.systemCounter.findUnique({
    where: { key: CLIENTE_CODE_COUNTER_KEY },
  });

  const currentValue =
    currentCounter?.value ??
    (await getBootstrapValue(tx));

  const nextValue = currentValue + 1;

  await tx.systemCounter.upsert({
    where: { key: CLIENTE_CODE_COUNTER_KEY },
    update: { value: nextValue },
    create: { key: CLIENTE_CODE_COUNTER_KEY, value: nextValue },
  });

  return String(nextValue);
}

export { CLIENTE_CODE_COUNTER_KEY };
