import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { PUBLIC_PATHS, ROUTE_PERMISSIONS } from '@/config/permissions';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApiRoute = pathname.startsWith('/api/');

  const isPublic =
    pathname.startsWith('/api/auth/') ||
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isPublic) {
    return NextResponse.next();
  }

  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });

  if (!token) {
    if (isApiRoute) {
      return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
    }

    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const rule = ROUTE_PERMISSIONS.find((entry) => pathname.startsWith(entry.prefix));
  if (rule) {
    const permissions = (token.permissions as string[] | undefined) ?? [];
    if (!permissions.includes(rule.permission)) {
      if (isApiRoute) {
        return NextResponse.json({ message: 'Acceso denegado' }, { status: 403 });
      }

      return NextResponse.redirect(new URL('/unauthorized', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
