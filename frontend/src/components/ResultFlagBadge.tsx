import React from 'react';

export type ResultFlagType =
  | 'benign'
  | 'inconclusive'
  | 'precancerous'
  | 'cancerous'
  | 'normal'
  | 'abnormal'
  | 'low'
  | 'high'
  | 'out_of_range'
  | 'panic_value'
  | 'none';

interface ResultFlagBadgeProps {
  flag: ResultFlagType | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

interface FlagConfig {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

const FLAG_CONFIGS: Record<ResultFlagType, FlagConfig> = {
  benign: {
    label: 'Benign',
    color: '#059669',
    bgColor: '#d1fae5',
    borderColor: '#10b981',
  },
  inconclusive: {
    label: 'Inconclusive',
    color: '#d97706',
    bgColor: '#fef3c7',
    borderColor: '#f59e0b',
  },
  precancerous: {
    label: 'Precancerous',
    color: '#dc2626',
    bgColor: '#fee2e2',
    borderColor: '#ef4444',
  },
  cancerous: {
    label: 'Cancerous/Malignant',
    color: '#ffffff',
    bgColor: '#dc2626',
    borderColor: '#991b1b',
  },
  normal: {
    label: 'Normal (WNL)',
    color: '#059669',
    bgColor: '#d1fae5',
    borderColor: '#10b981',
  },
  abnormal: {
    label: 'Abnormal',
    color: '#d97706',
    bgColor: '#fee2e2',
    borderColor: '#f59e0b',
  },
  low: {
    label: 'Low',
    color: '#d97706',
    bgColor: '#fef3c7',
    borderColor: '#f59e0b',
  },
  high: {
    label: 'High',
    color: '#d97706',
    bgColor: '#fef3c7',
    borderColor: '#f59e0b',
  },
  out_of_range: {
    label: 'Out of Range',
    color: '#dc2626',
    bgColor: '#fee2e2',
    borderColor: '#ef4444',
  },
  panic_value: {
    label: 'Panic Value',
    color: '#ffffff',
    bgColor: '#dc2626',
    borderColor: '#991b1b',
  },
  none: {
    label: 'Not Specified',
    color: '#6b7280',
    bgColor: '#f3f4f6',
    borderColor: '#d1d5db',
  },
};

export function ResultFlagBadge({ flag, size = 'md', showLabel = true }: ResultFlagBadgeProps) {
  if (!flag || flag === 'none') {
    return <span style={{ color: '#9ca3af', fontSize: '0.875rem' }}>--</span>;
  }

  const config = FLAG_CONFIGS[flag];

  const sizeStyles = {
    sm: {
      padding: '0.125rem 0.5rem',
      fontSize: '0.75rem',
      borderRadius: '6px',
    },
    md: {
      padding: '0.25rem 0.75rem',
      fontSize: '0.875rem',
      borderRadius: '8px',
    },
    lg: {
      padding: '0.375rem 1rem',
      fontSize: '0.875rem',
      borderRadius: '8px',
    },
  };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.375rem',
        ...sizeStyles[size],
        backgroundColor: config.bgColor,
        color: config.color,
        border: `1px solid ${config.borderColor}`,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        transition: 'all 0.2s ease',
      }}
    >
      {/* Indicator dot */}
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: config.color,
          flexShrink: 0,
        }}
      />
      {showLabel && config.label}
    </span>
  );
}

interface ResultFlagSelectProps {
  value: ResultFlagType | null | undefined;
  onChange: (flag: ResultFlagType) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ResultFlagSelect({
  value,
  onChange,
  disabled = false,
  placeholder = 'Select flag...',
}: ResultFlagSelectProps) {
  return (
    <select
      value={value || 'none'}
      onChange={(e) => onChange(e.target.value as ResultFlagType)}
      disabled={disabled}
      style={{
        width: '100%',
        padding: '0.5rem',
        border: '2px solid #e5e7eb',
        borderRadius: '8px',
        fontSize: '0.875rem',
        fontWeight: 600,
        backgroundColor: '#ffffff',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <option value="none">{placeholder}</option>
      <optgroup label="Pathology Results">
        <option value="benign">Benign</option>
        <option value="precancerous">Precancerous</option>
        <option value="cancerous">Cancerous/Malignant</option>
        <option value="inconclusive">Inconclusive</option>
      </optgroup>
      <optgroup label="Lab Results">
        <option value="normal">Normal (WNL)</option>
        <option value="abnormal">Abnormal</option>
        <option value="low">Low</option>
        <option value="high">High</option>
        <option value="out_of_range">Out of Range</option>
        <option value="panic_value">Panic Value (Critical)</option>
      </optgroup>
    </select>
  );
}

interface ResultFlagFilterProps {
  selectedFlags: ResultFlagType[];
  onChange: (flags: ResultFlagType[]) => void;
}

export function ResultFlagFilter({ selectedFlags, onChange }: ResultFlagFilterProps) {
  const toggleFlag = (flag: ResultFlagType) => {
    if (selectedFlags.includes(flag)) {
      onChange(selectedFlags.filter((f) => f !== flag));
    } else {
      onChange([...selectedFlags, flag]);
    }
  };

  const criticalFlags: ResultFlagType[] = ['cancerous', 'panic_value'];
  const warningFlags: ResultFlagType[] = ['precancerous', 'abnormal', 'out_of_range'];
  const cautionFlags: ResultFlagType[] = ['inconclusive', 'high', 'low'];
  const normalFlags: ResultFlagType[] = ['normal', 'benign'];

  const renderFlagGroup = (title: string, flags: ResultFlagType[]) => (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {flags.map((flag) => {
          const config = FLAG_CONFIGS[flag];
          const isSelected = selectedFlags.includes(flag);
          return (
            <label
              key={flag}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem',
                background: isSelected ? config.bgColor : '#f9fafb',
                border: `2px solid ${isSelected ? config.borderColor : '#e5e7eb'}`,
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleFlag(flag)}
                style={{ cursor: 'pointer' }}
              />
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151', flex: 1 }}>
                {config.label}
              </span>
              <span
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  backgroundColor: config.color,
                  flexShrink: 0,
                }}
              />
            </label>
          );
        })}
      </div>
    </div>
  );

  return (
    <div style={{ padding: '0.5rem' }}>
      {renderFlagGroup('Critical', criticalFlags)}
      {renderFlagGroup('Warning', warningFlags)}
      {renderFlagGroup('Caution', cautionFlags)}
      {renderFlagGroup('Normal', normalFlags)}
    </div>
  );
}

// Quick filter buttons for critical results
interface QuickFilterButtonsProps {
  onFilterCritical: () => void;
  onFilterAbnormal: () => void;
  onClearFilters: () => void;
}

export function QuickFilterButtons({
  onFilterCritical,
  onFilterAbnormal,
  onClearFilters,
}: QuickFilterButtonsProps) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
      <button
        type="button"
        onClick={onFilterCritical}
        style={{
          padding: '0.5rem 1rem',
          background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
          color: '#ffffff',
          border: 'none',
          borderRadius: '6px',
          fontSize: '0.75rem',
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(220, 38, 38, 0.3)',
          transition: 'all 0.3s ease',
        }}
      >
        Critical Results
      </button>
      <button
        type="button"
        onClick={onFilterAbnormal}
        style={{
          padding: '0.5rem 1rem',
          background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
          color: '#ffffff',
          border: 'none',
          borderRadius: '6px',
          fontSize: '0.75rem',
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)',
          transition: 'all 0.3s ease',
        }}
      >
        Abnormal Results
      </button>
      <button
        type="button"
        onClick={onClearFilters}
        style={{
          padding: '0.5rem 1rem',
          background: '#ffffff',
          color: '#6b7280',
          border: '2px solid #d1d5db',
          borderRadius: '6px',
          fontSize: '0.75rem',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.3s ease',
        }}
      >
        Clear Filters
      </button>
    </div>
  );
}
