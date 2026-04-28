import { AppError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { writeAuditLog } from '@/lib/audit';
import type { CreateSupervisionInput, UpdateSupervisionInput } from '@/server/validators/supervision';

export async function createSupervision(input: CreateSupervisionInput, userId: string) {
  try {
    const created = await prisma.supervision.create({ data: input });

    await writeAuditLog({
      userId,
      module: 'supervisiones',
      entity: 'Supervision',
      entityId: created.id,
      action: 'CREATE',
      afterJson: created,
    });

    return created;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'P2002') {
      throw new AppError('Ya existe una supervisión con esa clave.', 'DUPLICATE_CODE', 409);
    }
    throw error;
  }
}

export async function updateSupervision(input: UpdateSupervisionInput, userId: string) {
  const current = await prisma.supervision.findUnique({ where: { id: input.id } });
  if (!current) throw new AppError('Supervisión no encontrada.', 'NOT_FOUND', 404);

  try {
    const updated = await prisma.supervision.update({
      where: { id: input.id },
      data: {
        code: input.code,
        name: input.name,
        isActive: input.isActive,
      },
    });

    await writeAuditLog({
      userId,
      module: 'supervisiones',
      entity: 'Supervision',
      entityId: updated.id,
      action: 'UPDATE',
      beforeJson: current,
      afterJson: updated,
    });

    return updated;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'P2002') {
      throw new AppError('Ya existe una supervisión con esa clave.', 'DUPLICATE_CODE', 409);
    }
    throw error;
  }
}

export async function deactivateSupervision(id: string, userId: string) {
  const current = await prisma.supervision.findUnique({
    where: { id },
    include: {
      promotorias: {
        where: { deletedAt: null, isActive: true },
        select: { id: true, code: true, name: true },
      },
    },
  });

  if (!current) {
    throw new AppError('Supervisión no encontrada.', 'NOT_FOUND', 404);
  }

  if (!current.isActive) {
    return current;
  }

  if (current.promotorias.length > 0) {
    throw new AppError(
      'No puedes dar de baja esta supervisión porque tiene promotorías activas asociadas.',
      'ACTIVE_PROMOTORIAS_EXIST',
      409,
    );
  }

  const updated = await prisma.supervision.update({
    where: { id },
    data: { isActive: false },
  });

  await writeAuditLog({
    userId,
    module: 'supervisiones',
    entity: 'Supervision',
    entityId: updated.id,
    action: 'DEACTIVATE',
    beforeJson: current,
    afterJson: updated,
  });

  return updated;
}
