import { useState, type ReactNode } from 'react';

interface PanelProps {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  className?: string;
}

export function Panel({
  title,
  children,
  actions,
  collapsible = false,
  defaultCollapsed = false,
  className = '',
}: PanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className={`panel ${collapsed ? 'collapsed' : ''} ${className}`}>
      <div className="panel-header">
        <p className="panel-title">
          {collapsible && (
            <button
              type="button"
              className="collapse-toggle"
              onClick={() => setCollapsed(!collapsed)}
              aria-expanded={!collapsed}
            >
              {collapsed ? '▶' : '▼'}
            </button>
          )}
          {title}
        </p>
        {actions && <div className="panel-actions">{actions}</div>}
      </div>
      {!collapsed && <div className="panel-content">{children}</div>}
    </div>
  );
}
