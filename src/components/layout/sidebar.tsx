'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS } from '@/config/navigation';
import { cn } from '@/lib/utils';

type SidebarProps = {
  permissions: string[];
};

export function Sidebar({ permissions }: SidebarProps) {
  const pathname = usePathname();

  const items = NAV_ITEMS.filter((item) => permissions.includes(item.permission));

  return (
    <aside className="w-full border-r border-white/10 bg-primary text-primary-foreground md:w-72">
      <div className="border-b border-white/10 px-6 py-5">
        <p className="text-xs uppercase tracking-[0.2em] text-primary-foreground/70">ERP Financiero</p>
        <h1 className="font-display text-2xl font-semibold">Sistema Cresen</h1>
      </div>
      <nav className="space-y-1 p-4">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active ? 'bg-white/15 text-white' : 'text-primary-foreground/80 hover:bg-white/10 hover:text-white',
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
