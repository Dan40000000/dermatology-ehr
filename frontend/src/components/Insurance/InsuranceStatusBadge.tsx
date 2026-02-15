import React from 'react';

interface InsuranceStatusBadgeProps {
  status?: string;
  verifiedAt?: string;
  hasIssues?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function InsuranceStatusBadge({ status, verifiedAt, hasIssues, size = 'md' }: InsuranceStatusBadgeProps) {
  const getStatusColor = () => {
    if (hasIssues) return { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' };
    switch (status) {
      case 'verified':
        return { bg: '#d1fae5', text: '#059669', border: '#a7f3d0' };
      case 'pending':
        return { bg: '#fef3c7', text: '#d97706', border: '#fde68a' };
      case 'expired':
        return { bg: '#fee2e2', text: '#dc2626', border: '#fecaca' };
      case 'not_verified':
      default:
        return { bg: '#f3f4f6', text: '#6b7280', border: '#e5e7eb' };
    }
  };

  const getStatusLabel = () => {
    if (hasIssues) return 'Issues';
    switch (status) {
      case 'verified':
        return 'Verified';
      case 'pending':
        return 'Pending';
      case 'expired':
        return 'Expired';
      case 'not_verified':
        return 'Not Verified';
      default:
        return 'Unknown';
    }
  };

  const getSizeStyles = () => {
    switch (size) {
      case 'sm':
        return { padding: '0.125rem 0.375rem', fontSize: '0.625rem' };
      case 'lg':
        return { padding: '0.375rem 0.75rem', fontSize: '0.875rem' };
      case 'md':
      default:
        return { padding: '0.25rem 0.5rem', fontSize: '0.75rem' };
    }
  };

  const colors = getStatusColor();
  const sizeStyles = getSizeStyles();

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '';
    }
  };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
      <span
        style={{
          display: 'inline-block',
          backgroundColor: colors.bg,
          color: colors.text,
          border: `1px solid ${colors.border}`,
          borderRadius: '9999px',
          fontWeight: 500,
          ...sizeStyles,
        }}
      >
        {getStatusLabel()}
      </span>
      {verifiedAt && status === 'verified' && (
        <span style={{ fontSize: '0.625rem', color: '#9ca3af' }}>
          {formatDate(verifiedAt)}
        </span>
      )}
    </div>
  );
}
