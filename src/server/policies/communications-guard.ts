import { PERMISSIONS } from '@/config/permissions';
import { AppError } from '@/lib/errors';
import { hasPermission } from '@/lib/rbac';
import { getSessionOrThrow } from '@/server/policies/guard';
import type {
  PreviewCommunicationInput,
  SendCommunicationInput,
} from '@/server/validators/comunicaciones';

const COMMUNICATION_WRITE_PERMISSION_BY_CONTEXT: Record<
  NonNullable<PreviewCommunicationInput['sourceContext']>,
  string
> = {
  CLIENTE: PERMISSIONS.CLIENTES_WRITE,
  CREDITO: PERMISSIONS.CREDITOS_WRITE,
  COBRANZA: PERMISSIONS.PAGOS_WRITE,
  JURIDICO: PERMISSIONS.CREDITOS_WRITE,
};

const COMMUNICATION_TEMPLATE_READ_PERMISSIONS = [
  PERMISSIONS.CLIENTES_READ,
  PERMISSIONS.CREDITOS_READ,
  PERMISSIONS.PAGOS_READ,
] as const;

function ensurePermission(session: Awaited<ReturnType<typeof getSessionOrThrow>>, permission: string) {
  const permissions = (session.user.permissions as string[]) ?? [];

  if (hasPermission(permission, permissions)) {
    return session;
  }

  throw new AppError('No tienes permisos para realizar esta acción.', 'FORBIDDEN', 403);
}

export async function requireCommunicationWritePermission(
  sourceContext: NonNullable<SendCommunicationInput['sourceContext']>,
) {
  const session = await getSessionOrThrow();
  return ensurePermission(session, COMMUNICATION_WRITE_PERMISSION_BY_CONTEXT[sourceContext]);
}

export async function requireCommunicationTemplateReadPermission() {
  const session = await getSessionOrThrow();
  const permissions = (session.user.permissions as string[]) ?? [];

  if (
    permissions.some((permission) =>
      COMMUNICATION_TEMPLATE_READ_PERMISSIONS.includes(
        permission as (typeof COMMUNICATION_TEMPLATE_READ_PERMISSIONS)[number],
      ),
    )
  ) {
    return session;
  }

  throw new AppError('No tienes permisos para consultar plantillas.', 'FORBIDDEN', 403);
}

export async function requireCommunicationTemplateWritePermission() {
  const session = await getSessionOrThrow();
  return ensurePermission(session, PERMISSIONS.CREDITOS_WRITE);
}
