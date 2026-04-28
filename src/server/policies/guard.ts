import { auth } from '@/auth';
import { AppError } from '@/lib/errors';

export async function getSessionOrThrow() {
  const session = await auth();
  if (!session?.user) {
    throw new AppError('No autorizado.', 'UNAUTHORIZED', 401);
  }
  return session;
}

export async function requireApiPermission(permission: string) {
  const session = await getSessionOrThrow();
  const permissions = (session.user.permissions as string[] | undefined) ?? [];
  if (!permissions.includes(permission)) {
    throw new AppError('No tienes permisos para realizar esta acción.', 'FORBIDDEN', 403);
  }
  return session;
}
