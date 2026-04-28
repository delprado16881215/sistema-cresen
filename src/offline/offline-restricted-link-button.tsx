'use client';

import Link from 'next/link';
import { Button, type ButtonProps } from '@/components/ui/button';
import { useOfflineMode } from '@/offline/offline-mode-provider';

export function OfflineRestrictedLinkButton({
  href,
  children,
  offlineLabel,
  ...buttonProps
}: Omit<ButtonProps, 'asChild'> & {
  href: string;
  children: React.ReactNode;
  offlineLabel?: string;
}) {
  const { isOfflineMode } = useOfflineMode();

  if (isOfflineMode) {
    return (
      <Button type="button" disabled title={offlineLabel ?? 'Esta acción no está disponible sin conexión'} {...buttonProps}>
        {children}
      </Button>
    );
  }

  return (
    <Button asChild {...buttonProps}>
      <Link href={href}>{children}</Link>
    </Button>
  );
}
