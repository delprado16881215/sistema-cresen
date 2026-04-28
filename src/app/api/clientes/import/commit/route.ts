import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PERMISSIONS } from '@/config/permissions';
import { requireApiPermission } from '@/server/policies/guard';
import { commitClienteImport } from '@/server/services/clientes-import-service';
import { AppError, toErrorMessage } from '@/lib/errors';

export const runtime = 'nodejs';

const importRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  duplicateReason: z.string().nullable(),
  errors: z.array(z.string()),
  payload: z.object({
    rowNumber: z.number().int().positive(),
    raw: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
    externalClientId: z.string().nullable(),
    code: z.string().nullable(),
    fullName: z.string(),
    phone: z.string(),
    secondaryPhone: z.string().nullable(),
    address: z.string(),
    postalCode: z.string(),
    neighborhood: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    betweenStreets: z.string().nullable(),
    referencesNotes: z.string().nullable(),
    observations: z.string().nullable(),
    isActive: z.boolean(),
  }),
});

const commitSchema = z.object({
  rows: z.array(importRowSchema),
});

export async function POST(request: Request) {
  try {
    const session = await requireApiPermission(PERMISSIONS.CLIENTES_WRITE);
    const parsed = commitSchema.parse(await request.json());
    const result = await commitClienteImport(parsed.rows, session.user.id);
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
