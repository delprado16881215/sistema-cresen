export const PERMISSIONS = {
  DASHBOARD_READ: 'dashboard.read',
  CLIENTES_READ: 'clientes.read',
  CLIENTES_WRITE: 'clientes.write',
  CLIENTES_DEACTIVATE: 'clientes.deactivate',
  CREDITOS_READ: 'creditos.read',
  CREDITOS_WRITE: 'creditos.write',
  PAGOS_READ: 'pagos.read',
  PAGOS_WRITE: 'pagos.write',
  REPORTES_READ: 'reportes.read',
  SUPERVISIONES_READ: 'supervisiones.read',
  SUPERVISIONES_WRITE: 'supervisiones.write',
  PROMOTORIAS_READ: 'promotorias.read',
  PROMOTORIAS_WRITE: 'promotorias.write',
  USUARIOS_READ: 'usuarios.read',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ROUTE_PERMISSIONS: Array<{ prefix: string; permission: PermissionCode }> = [
  { prefix: '/dashboard', permission: PERMISSIONS.DASHBOARD_READ },
  { prefix: '/clientes', permission: PERMISSIONS.CLIENTES_READ },
  { prefix: '/creditos', permission: PERMISSIONS.CREDITOS_READ },
  { prefix: '/juridico', permission: PERMISSIONS.CREDITOS_READ },
  { prefix: '/pagos', permission: PERMISSIONS.PAGOS_READ },
  { prefix: '/cobranza', permission: PERMISSIONS.PAGOS_READ },
  { prefix: '/reportes', permission: PERMISSIONS.REPORTES_READ },
  { prefix: '/supervisiones', permission: PERMISSIONS.SUPERVISIONES_READ },
  { prefix: '/promotorias', permission: PERMISSIONS.PROMOTORIAS_READ },
];

export const PUBLIC_PATHS = ['/login', '/unauthorized'];
