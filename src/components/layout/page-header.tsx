import Link from 'next/link';

type BreadcrumbItem = {
  label: string;
  href?: string;
};

type PageHeaderProps = {
  title: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  action?: React.ReactNode;
};

export function PageHeader({ title, description, breadcrumbs, action }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
      <div>
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <nav className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            {breadcrumbs.map((item, index) => (
              <span key={`${item.label}-${index}`} className="flex items-center gap-2">
                {item.href ? <Link href={item.href}>{item.label}</Link> : <span>{item.label}</span>}
                {index < breadcrumbs.length - 1 ? <span>/</span> : null}
              </span>
            ))}
          </nav>
        ) : null}
        <h1 className="font-display text-3xl font-semibold text-primary">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
