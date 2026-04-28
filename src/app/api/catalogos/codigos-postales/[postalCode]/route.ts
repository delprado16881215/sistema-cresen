import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPostalCodeDatasetsSummary, getPostalCodeOptions } from '@/modules/clientes/postal-code-catalog';

const paramsSchema = z.object({
  postalCode: z.string().regex(/^\d{5}$/),
});

export async function GET(_: Request, context: { params: Promise<{ postalCode: string }> }) {
  const { postalCode } = paramsSchema.parse(await context.params);
  const options = getPostalCodeOptions(postalCode);

  return NextResponse.json({
    postalCode,
    options,
    datasets: getPostalCodeDatasetsSummary(),
  });
}
