import React from 'react';

export type FlowStatus =
  | 'checked_in'
  | 'rooming'
  | 'vitals_complete'
  | 'ready_for_provider'
  | 'with_provider'
  | 'checkout'
  | 'completed';

interface PatientStatusBadgeProps {
  status: FlowStatus;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

const statusConfig: Record<
  FlowStatus,
  { label: string; bgColor: string; textColor: string; icon: string }
> = {
  checked_in: {
    label: 'Checked In',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-800',
    icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  rooming: {
    label: 'Rooming',
    bgColor: 'bg-yellow-100',
    textColor: 'text-yellow-800',
    icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  },
  vitals_complete: {
    label: 'Vitals Done',
    bgColor: 'bg-purple-100',
    textColor: 'text-purple-800',
    icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  },
  ready_for_provider: {
    label: 'Ready',
    bgColor: 'bg-orange-100',
    textColor: 'text-orange-800',
    icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
  },
  with_provider: {
    label: 'With Provider',
    bgColor: 'bg-indigo-100',
    textColor: 'text-indigo-800',
    icon: 'M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  checkout: {
    label: 'Checkout',
    bgColor: 'bg-teal-100',
    textColor: 'text-teal-800',
    icon: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
  },
  completed: {
    label: 'Completed',
    bgColor: 'bg-green-100',
    textColor: 'text-green-800',
    icon: 'M5 13l4 4L19 7',
  },
};

const sizeClasses = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
  lg: 'px-3 py-1.5 text-base',
};

const iconSizes = {
  sm: 'w-3 h-3',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
};

export const PatientStatusBadge: React.FC<PatientStatusBadgeProps> = ({
  status,
  size = 'md',
  showIcon = true,
  className = '',
}) => {
  const config = statusConfig[status];

  if (!config) {
    return null;
  }

  return (
    <span
      className={`
        inline-flex items-center gap-1 rounded-full font-medium
        ${config.bgColor} ${config.textColor}
        ${sizeClasses[size]}
        ${className}
      `}
    >
      {showIcon && (
        <svg
          className={iconSizes[size]}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d={config.icon}
          />
        </svg>
      )}
      {config.label}
    </span>
  );
};

export const getStatusLabel = (status: FlowStatus): string => {
  return statusConfig[status]?.label || status;
};

export const getStatusColor = (status: FlowStatus): string => {
  const config = statusConfig[status];
  return config ? `${config.bgColor} ${config.textColor}` : 'bg-gray-100 text-gray-800';
};

export default PatientStatusBadge;
