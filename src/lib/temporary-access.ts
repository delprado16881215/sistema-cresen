import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import {
  TEMPORARY_ACCESS_COOKIE,
  TEMPORARY_AUTH_BYPASS,
  TEMPORARY_BYPASS_USER,
  TEMPORARY_DEMO_EMAIL,
  TEMPORARY_DEMO_NAME,
} from '@/config/auth-mode';

const TEMPORARY_DEMO_PASSWORD_HASH = '$2a$12$U7d7L0qMiib1j9fJxnfK/.nI6BvQvA7X3Q6XH8GfVz1I6EXAMPLEu';

export async function ensureTemporaryDemoUser() {
  const internalUserType = await prisma.userType.findUnique({
    where: { code: 'INTERNAL' },
    select: { id: true },
  });

  return prisma.user.upsert({
    where: { email: TEMPORARY_DEMO_EMAIL },
    update: {
      name: TEMPORARY_DEMO_NAME,
      isActive: true,
      userTypeId: internalUserType?.id ?? null,
    },
    create: {
      email: TEMPORARY_DEMO_EMAIL,
      name: TEMPORARY_DEMO_NAME,
      passwordHash: TEMPORARY_DEMO_PASSWORD_HASH,
      isActive: true,
      userTypeId: internalUserType?.id ?? null,
    },
    select: {
      id: true,
      email: true,
      name: true,
      isActive: true,
    },
  });
}

export async function getTemporaryBypassSession() {
  if (!TEMPORARY_AUTH_BYPASS) {
    return null;
  }

  const cookieStore = await cookies();
  const activeEmail = cookieStore.get(TEMPORARY_ACCESS_COOKIE)?.value ?? TEMPORARY_DEMO_EMAIL;

  if (activeEmail !== TEMPORARY_DEMO_EMAIL) {
    return { user: { ...TEMPORARY_BYPASS_USER } };
  }

  const user = await ensureTemporaryDemoUser();

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      roles: [...TEMPORARY_BYPASS_USER.roles],
      permissions: [...TEMPORARY_BYPASS_USER.permissions],
    },
  };
}
