interface PAStatusBadgeProps {
  status: 'pending' | 'submitted' | 'approved' | 'denied' | 'needs_info' | 'error';
  size?: 'sm' | 'md' | 'lg';
}

const STATUS_CONFIG = {
  pending: {
    label: 'Pending',
    className: 'ema-status pending',
    icon: '',
  },
  submitted: {
    label: 'Submitted',
    className: 'ema-status pending',
    icon: '',
  },
  approved: {
    label: 'Approved',
    className: 'ema-status established',
    icon: '',
  },
  denied: {
    label: 'Denied',
    className: 'ema-status cancelled',
    icon: '',
  },
  needs_info: {
    label: 'Needs Info',
    className: 'ema-status pending',
    icon: '',
  },
  error: {
    label: 'Error',
    className: 'ema-status cancelled',
    icon: '',
  },
};

export function PAStatusBadge({ status, size = 'md' }: PAStatusBadgeProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;

  const sizeStyles = {
    sm: { fontSize: '0.75rem', padding: '0.125rem 0.5rem' },
    md: { fontSize: '0.875rem', padding: '0.25rem 0.75rem' },
    lg: { fontSize: '1rem', padding: '0.375rem 1rem' },
  };

  return (
    <span className={config.className} style={sizeStyles[size]}>
      <span style={{ marginRight: '0.25rem' }}>{config.icon}</span>
      {config.label}
    </span>
  );
}
