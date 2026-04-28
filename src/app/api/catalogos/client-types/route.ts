import { NextResponse } from 'next/server';
import { PERMISSIONS } from '@/config/permissions';
import { prisma } from '@/lib/prisma';
import { AppError, toErrorMessage } from '@/lib/errors';
import { requireApiPermission } from '@/server/policies/guard';

export async function GET() {
  try {
    await requireApiPermission(PERMISSIONS.CLIENTES_READ);

    const rows = await prisma.clientTypeCatalog.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, code: true, name: true },
    });

    return NextResponse.json(rows);
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ message: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ message: toErrorMessage(error) }, { status: 500 });
  }
}
