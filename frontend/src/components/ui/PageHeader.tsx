import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  breadcrumbs?: Array<{ label: string; href?: string }>;
}

export function PageHeader({ title, subtitle, actions, breadcrumbs }: PageHeaderProps) {
  return (
    <div className="page-header">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <ol>
            {breadcrumbs.map((crumb, index) => (
              <li key={index}>
                {crumb.href ? (
                  <a href={crumb.href}>{crumb.label}</a>
                ) : (
                  <span aria-current="page">{crumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div className="page-header-content">
        <div className="page-header-text">
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>

        {actions && (
          <div className="page-header-actions">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
