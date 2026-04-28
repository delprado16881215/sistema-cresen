import { NextResponse } from 'next/server';
import { PERMISSIONS } from '@/config/permissions';
import { requireApiPermission } from '@/server/policies/guard';
import { previewClienteImport } from '@/server/services/clientes-import-service';
import { AppError, toErrorMessage } from '@/lib/errors';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    await requireApiPermission(PERMISSIONS.CLIENTES_WRITE);
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ message: 'Selecciona un archivo CSV o XLSX.' }, { status: 422 });
    }

    const result = await previewClienteImport(file);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ message: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ message: toErrorMessage(error) }, { status: 500 });
  }
}
