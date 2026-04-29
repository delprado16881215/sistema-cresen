import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getToken } from 'next-auth/jwt';
import type { Session } from 'next-auth';
import { auth } from '@/auth';

async function getSessionFromToken(): Promise<Session | null> {
  const token = await getToken({
    req: { headers: await headers() },
    secret: process.env.AUTH_SECRET,
    secureCookie: process.env.VERCEL === '1' || process.env.AUTH_URL?.startsWith('https://'),
  });

  if (!token) {
    return null;
  }

  return {
    user: {
      id: token.sub ?? '',
      name: token.name ?? null,
      email: token.email ?? null,
      image: token.picture ?? null,
      roles: token.roles ?? [],
      permissions: token.permissions ?? [],
    },
    expires: typeof token.exp === 'number' ? new Date(token.exp * 1000).toISOString() : '',
  };
}

export async function getServerSessionOrThrow() {
  const session = (await auth()) ?? (await getSessionFromToken());
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
