import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PERMISSIONS } from '@/config/permissions';
import { requireApiPermission } from '@/server/policies/guard';
import { commitCreditoImport } from '@/server/services/creditos-import-service';
import { AppError, toErrorMessage } from '@/lib/errors';

export const runtime = 'nodejs';

const importRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  duplicateReason: z.string().nullable(),
  errors: z.array(z.string()),
  resolved: z.object({
    clienteName: z.string().nullable(),
    avalName: z.string().nullable(),
    promotoriaName: z.string().nullable(),
    supervisionName: z.string().nullable(),
    planCode: z.string().nullable(),
    statusName: z.string().nullable(),
  }),
  payload: z.object({
    rowNumber: z.number().int().positive(),
    raw: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
    saleId: z.string(),
    controlNumber: z.number(),
    startDate: z.string(),
    receivedStartDate: z.union([z.string(), z.number(), z.boolean(), z.null()]),
    clientExternalId: z.string(),
    receivedClientExternalId: z.union([z.string(), z.number(), z.boolean(), z.null()]),
    avalExternalId: z.string().nullable(),
    receivedAvalExternalId: z.union([z.string(), z.number(), z.boolean(), z.null()]),
    principalAmount: z.number(),
    weeklyAmount: z.number(),
    totalWeeks: z.number(),
    totalPayableAmount: z.number(),
    promotoriaExternalId: z.string(),
    receivedPromotoriaExternalId: z.union([z.string(), z.number(), z.boolean(), z.null()]),
    statusCode: z.string(),
    notes: z.string().nullable(),
  }),
});

const commitSchema = z.object({ rows: z.array(importRowSchema) });

export async function POST(request: Request) {
  try {
    const session = await requireApiPermission(PERMISSIONS.CREDITOS_WRITE);
    const parsed = commitSchema.parse(await request.json());
    const result = await commitCreditoImport(parsed.rows, session.user.id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: 'Solicitud inválida', issues: error.flatten() }, { status: 422 });
    }
    if (error instanceof AppError) {
      return NextResponse.json({ message: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ message: toErrorMessage(error) }, { status: 500 });
  }
}
