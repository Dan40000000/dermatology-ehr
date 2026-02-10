/**
 * AllergyBadge Component
 *
 * Visual severity indicator for allergies with color coding.
 */

import { AlertCircle, AlertTriangle, Info, Skull } from 'lucide-react';

export type AllergySeverity = 'mild' | 'moderate' | 'severe' | 'life_threatening';
export type AlertSeverity = 'info' | 'warning' | 'critical' | 'contraindicated';

interface AllergyBadgeProps {
  severity: AllergySeverity | AlertSeverity;
  showIcon?: boolean;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const severityConfig: Record<
  AllergySeverity | AlertSeverity,
  { bg: string; text: string; border: string; label: string }
> = {
  mild: {
    bg: '#dbeafe',
    text: '#1e40af',
    border: '#3b82f6',
    label: 'Mild',
  },
  info: {
    bg: '#dbeafe',
    text: '#1e40af',
    border: '#3b82f6',
    label: 'Info',
  },
  moderate: {
    bg: '#fef3c7',
    text: '#92400e',
    border: '#f59e0b',
    label: 'Moderate',
  },
  warning: {
    bg: '#fef3c7',
    text: '#92400e',
    border: '#f59e0b',
    label: 'Warning',
  },
  severe: {
    bg: '#fee2e2',
    text: '#991b1b',
    border: '#ef4444',
    label: 'Severe',
  },
  critical: {
    bg: '#fee2e2',
    text: '#991b1b',
    border: '#ef4444',
    label: 'Critical',
  },
  life_threatening: {
    bg: '#450a0a',
    text: '#ffffff',
    border: '#7f1d1d',
    label: 'Life-Threatening',
  },
  contraindicated: {
    bg: '#450a0a',
    text: '#ffffff',
    border: '#7f1d1d',
    label: 'Contraindicated',
  },
};

const sizeConfig = {
  sm: { padding: '2px 6px', fontSize: '11px', iconSize: 12 },
  md: { padding: '4px 8px', fontSize: '12px', iconSize: 14 },
  lg: { padding: '6px 12px', fontSize: '14px', iconSize: 16 },
};

export function AllergyBadge({
  severity,
  showIcon = true,
  showLabel = true,
  size = 'md',
  className = '',
}: AllergyBadgeProps) {
  const config = severityConfig[severity];
  const sizeStyles = sizeConfig[size];

  const getIcon = () => {
    if (!showIcon) return null;

    const iconProps = { size: sizeStyles.iconSize, style: { marginRight: showLabel ? 4 : 0 } };

    switch (severity) {
      case 'life_threatening':
      case 'contraindicated':
        return <Skull {...iconProps} />;
      case 'severe':
      case 'critical':
        return <AlertCircle {...iconProps} />;
      case 'moderate':
      case 'warning':
        return <AlertTriangle {...iconProps} />;
      default:
        return <Info {...iconProps} />;
    }
  };

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: sizeStyles.padding,
        fontSize: sizeStyles.fontSize,
        fontWeight: 600,
        backgroundColor: config.bg,
        color: config.text,
        border: `1px solid ${config.border}`,
        borderRadius: '4px',
        whiteSpace: 'nowrap',
      }}
    >
      {getIcon()}
      {showLabel && config.label}
    </span>
  );
}

// Compact version for lists
export function AllergyBadgeCompact({
  severity,
  className = '',
}: {
  severity: AllergySeverity | AlertSeverity;
  className?: string;
}) {
  return <AllergyBadge severity={severity} showLabel={false} size="sm" className={className} />;
}
