import { NextResponse } from 'next/server';
import { PERMISSIONS } from '@/config/permissions';
import { requireApiPermission } from '@/server/policies/guard';
import { exportClientes, exportClientesVcf, exportClientesVcfZip } from '@/server/services/clientes-import-service';
import { AppError, toErrorMessage } from '@/lib/errors';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    await requireApiPermission(PERMISSIONS.CLIENTES_READ);
    const { searchParams } = new URL(request.url);
    const rawFormat = searchParams.get('format');
    const format = rawFormat === 'xlsx' ? 'xlsx' : rawFormat === 'vcf' ? 'vcf' : rawFormat === 'vcf-zip' ? 'vcf-zip' : 'csv';
    const file =
      format === 'vcf'
        ? await exportClientesVcf()
        : format === 'vcf-zip'
          ? await exportClientesVcfZip(500)
          : await exportClientes(format);
    const stamp = new Date().toISOString().slice(0, 10);

    return new NextResponse(new Uint8Array(file), {
      headers: {
        'Content-Type':
          format === 'xlsx'
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : format === 'vcf'
              ? 'text/vcard; charset=utf-8'
              : format === 'vcf-zip'
                ? 'application/zip'
              : 'text/csv; charset=utf-8',
        'Content-Disposition':
          format === 'vcf'
            ? 'attachment; filename="clientes-cresen.vcf"'
            : format === 'vcf-zip'
              ? `attachment; filename="clientes-cresen-bloques-${stamp}.zip"`
            : `attachment; filename="clientes-${stamp}.${format}"`,
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ message: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ message: toErrorMessage(error) }, { status: 500 });
  }
}
