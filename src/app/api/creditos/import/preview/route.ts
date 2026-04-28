import { NextResponse } from 'next/server';
import { PERMISSIONS } from '@/config/permissions';
import { requireApiPermission } from '@/server/policies/guard';
import { previewCreditoImport } from '@/server/services/creditos-import-service';
import { AppError, toErrorMessage } from '@/lib/errors';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    await requireApiPermission(PERMISSIONS.CREDITOS_WRITE);
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ message: 'Adjunta un archivo CSV o XLSX para continuar.' }, { status: 422 });
    }

    const preview = await previewCreditoImport(file);
    return NextResponse.json(preview);
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ message: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ message: toErrorMessage(error) }, { status: 500 });
  }
}
