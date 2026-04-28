import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

type AuditInput = {
  userId?: string;
  module: string;
  entity: string;
  entityId: string;
  action: string;
  beforeJson?: unknown;
  afterJson?: unknown;
};

function toJsonValue(value: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

export async function writeAuditLog(input: AuditInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: input.userId,
      module: input.module,
      entity: input.entity,
      entityId: input.entityId,
      action: input.action,
      beforeJson: toJsonValue(input.beforeJson),
      afterJson: toJsonValue(input.afterJson),
    },
  });
}
