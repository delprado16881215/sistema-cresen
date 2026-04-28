import { AppError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { writeAuditLog } from '@/lib/audit';
import type { CreatePromotoriaInput, UpdatePromotoriaInput } from '@/server/validators/promotoria';

async function assertSupervisionExists(supervisionId: string) {
  const supervision = await prisma.supervision.findUnique({
    where: { id: supervisionId },
    select: { id: true },
  });

  if (!supervision) {
    throw new AppError('Selecciona una supervisión válida.', 'INVALID_SUPERVISION', 422);
  }
}

export async function createPromotoria(input: CreatePromotoriaInput, userId: string) {
  await assertSupervisionExists(input.supervisionId);

  try {
    const created = await prisma.promotoria.create({
      data: {
        code: input.code,
        name: input.name,
        supervisionId: input.supervisionId,
        isActive: input.isActive,
      },
    });

    await writeAuditLog({
      userId,
      module: 'promotorias',
      entity: 'Promotoria',
      entityId: created.id,
      action: 'CREATE',
      afterJson: created,
    });

    return created;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'P2002') {
      throw new AppError('Ya existe una promotoría con esa clave.', 'DUPLICATE_CODE', 409);
    }
    throw error;
  }
}

export async function updatePromotoria(input: UpdatePromotoriaInput, userId: string) {
  const current = await prisma.promotoria.findFirst({
    where: { id: input.id, deletedAt: null },
  });
  if (!current) throw new AppError('Promotoría no encontrada.', 'NOT_FOUND', 404);

  await assertSupervisionExists(input.supervisionId);

  try {
    const updated = await prisma.promotoria.update({
      where: { id: input.id },
      data: {
        code: input.code,
        name: input.name,
        supervisionId: input.supervisionId,
        isActive: input.isActive,
      },
    });

    await writeAuditLog({
      userId,
      module: 'promotorias',
      entity: 'Promotoria',
      entityId: updated.id,
      action: 'UPDATE',
      beforeJson: current,
      afterJson: updated,
    });

    return updated;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'P2002') {
      throw new AppError('Ya existe una promotoría con esa clave.', 'DUPLICATE_CODE', 409);
    }
    throw error;
  }
}
