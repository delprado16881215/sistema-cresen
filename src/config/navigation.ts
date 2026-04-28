import {
  BadgeDollarSign,
  ChartColumnBig,
  Coins,
  HandCoins,
  LayoutDashboard,
  Network,
  Scale,
  Users,
  Waypoints,
} from 'lucide-react';
import { PERMISSIONS } from './permissions';

export const NAV_ITEMS = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    permission: PERMISSIONS.DASHBOARD_READ,
  },
  {
    href: '/clientes',
    label: 'Clientes',
    icon: Users,
    permission: PERMISSIONS.CLIENTES_READ,
  },
  {
    href: '/creditos',
    label: 'Créditos',
    icon: BadgeDollarSign,
    permission: PERMISSIONS.CREDITOS_READ,
  },
  {
    href: '/juridico',
    label: 'Jurídico',
    icon: Scale,
    permission: PERMISSIONS.CREDITOS_READ,
  },
  {
    href: '/pagos',
    label: 'Pagos',
    icon: Coins,
    permission: PERMISSIONS.PAGOS_READ,
  },
  {
    href: '/cobranza',
    label: 'Cobranza',
    icon: HandCoins,
    permission: PERMISSIONS.PAGOS_READ,
  },
  {
    href: '/reportes',
    label: 'Reportes',
    icon: ChartColumnBig,
    permission: PERMISSIONS.REPORTES_READ,
  },
  {
    href: '/supervisiones',
    label: 'Supervisiones',
    icon: Network,
    permission: PERMISSIONS.SUPERVISIONES_READ,
  },
  {
    href: '/promotorias',
    label: 'Promotorías',
    icon: Waypoints,
    permission: PERMISSIONS.PROMOTORIAS_READ,
  },
] as const;
