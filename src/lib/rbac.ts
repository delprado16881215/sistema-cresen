import { redirect } from 'next/navigation';
import { auth } from '@/auth';

export async function getServerSessionOrThrow() {
  const session = await auth();
  if (!session?.user) {
    redirect('/login');
  }
  return session;
}

export async function requirePermission(permission: string): Promise<void> {
  const session = await getServerSessionOrThrow();
  const permissions = session.user.permissions as string[];
  if (!permissions.includes(permission)) {
    redirect('/unauthorized');
  }
}

export function hasPermission(permission: string, permissions: string[]): boolean {
  return permissions.includes(permission);
}
