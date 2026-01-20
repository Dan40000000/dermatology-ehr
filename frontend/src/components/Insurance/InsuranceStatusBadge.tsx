/**
 * Insurance Status Badge Component
 *
 * Displays the current insurance verification status with color coding
 * - Active (Green): Insurance is verified and active
 * - Inactive (Red): Insurance coverage is inactive or terminated
 * - Pending (Yellow): Verification in progress
 * - Error (Gray): Unable to verify
 * - Unverified (Gray): Not yet verified
 */

import React from 'react';

interface InsuranceStatusBadgeProps {
  status?: string;
  verifiedAt?: string | Date;
  hasIssues?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showDate?: boolean;
}

const statusConfig = {
  active: {
    label: 'Verified Active',
    color: 'bg-green-100 text-green-800 border-green-200',
    icon: '✓',
  },
  inactive: {
    label: 'Inactive',
    color: 'bg-red-100 text-red-800 border-red-200',
    icon: '✗',
  },
  terminated: {
    label: 'Terminated',
    color: 'bg-red-100 text-red-800 border-red-200',
    icon: '✗',
  },
  pending: {
    label: 'Pending',
    color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    icon: '○',
  },
  error: {
    label: 'Verification Error',
    color: 'bg-gray-100 text-gray-800 border-gray-200',
    icon: '!',
  },
};

const sizeClasses = {
  sm: 'text-xs px-2 py-0.5',
  md: 'text-sm px-3 py-1',
  lg: 'text-base px-4 py-2',
};

export const InsuranceStatusBadge: React.FC<InsuranceStatusBadgeProps> = ({
  status,
  verifiedAt,
  hasIssues,
  size = 'md',
  showDate = false,
}) => {
  if (!status) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-md border bg-gray-50 text-gray-600 border-gray-200 ${sizeClasses[size]}`}
      >
        <span>○</span>
        <span>Not Verified</span>
      </span>
    );
  }

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.error;
  const isStale = verifiedAt && new Date().getTime() - new Date(verifiedAt).getTime() > 30 * 24 * 60 * 60 * 1000; // 30 days

  return (
    <div className="inline-flex flex-col gap-1">
      <span
        className={`inline-flex items-center gap-1 rounded-md border ${config.color} ${sizeClasses[size]}`}
      >
        <span>{config.icon}</span>
        <span>{config.label}</span>
      </span>

      {hasIssues && (
        <span className="text-xs text-red-600 font-medium">
          ⚠ Has Issues
        </span>
      )}

      {showDate && verifiedAt && (
        <span className={`text-xs ${isStale ? 'text-yellow-600 font-medium' : 'text-gray-500'}`}>
          {isStale && '⚠ '}
          Verified {formatVerificationDate(verifiedAt)}
        </span>
      )}
    </div>
  );
};

function formatVerificationDate(date: string | Date): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'today';
  } else if (diffDays === 1) {
    return 'yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  } else {
    return d.toLocaleDateString();
  }
}
