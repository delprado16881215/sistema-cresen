import { PERMISSIONS } from '@/config/permissions';

export const TEMPORARY_AUTH_BYPASS = false;
export const TEMPORARY_ACCESS_COOKIE = 'cresen-demo-user';
export const TEMPORARY_DEMO_NAME = 'Mario Prueba';
export const TEMPORARY_DEMO_EMAIL = 'mario.prueba@cresen.local';

export const TEMPORARY_BYPASS_USER = {
  id: 'temporary-bypass-user',
  name: TEMPORARY_DEMO_NAME,
  email: TEMPORARY_DEMO_EMAIL,
  roles: ['SUPER_ADMIN'],
  permissions: Object.values(PERMISSIONS),
} as const;
