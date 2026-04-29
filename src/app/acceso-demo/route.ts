import { NextResponse } from 'next/server';
import { TEMPORARY_ACCESS_COOKIE, TEMPORARY_AUTH_BYPASS, TEMPORARY_DEMO_EMAIL } from '@/config/auth-mode';

export async function GET(request: Request) {
  if (!TEMPORARY_AUTH_BYPASS) {
    return NextResponse.json({ message: 'No encontrado' }, { status: 404 });
  }

  const { ensureTemporaryDemoUser } = await import('@/lib/temporary-access');
  await ensureTemporaryDemoUser();

  const response = NextResponse.redirect(new URL('/dashboard', request.url));
  response.cookies.set(TEMPORARY_ACCESS_COOKIE, TEMPORARY_DEMO_EMAIL, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });

  return response;
}
