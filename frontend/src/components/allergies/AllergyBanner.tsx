/**
 * AllergyBanner Component
 *
 * Header warning banner showing patient allergies.
 * Displays prominently at the top of patient views.
 */

import { AlertTriangle, ChevronDown, ChevronUp, Shield } from 'lucide-react';
import { useState } from 'react';
import { AllergyBadge, type AllergySeverity } from './AllergyBadge';

interface AllergyInfo {
  id: string;
  allergenName: string;
  allergenType: string;
  severity: AllergySeverity;
  reactionType?: string;
}

interface AllergyBannerProps {
  allergies: AllergyInfo[];
  patientName?: string;
  latexAllergy?: boolean;
  adhesiveAllergy?: boolean;
  onClick?: () => void;
  compact?: boolean;
}

export function AllergyBanner({
  allergies,
  patientName,
  latexAllergy = false,
  adhesiveAllergy = false,
  onClick,
  compact = false,
}: AllergyBannerProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Sort allergies by severity
  const sortedAllergies = [...allergies].sort((a, b) => {
    const severityOrder: Record<AllergySeverity, number> = {
      life_threatening: 0,
      severe: 1,
      moderate: 2,
      mild: 3,
    };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  const hasCriticalAllergy = sortedAllergies.some(
    (a) => a.severity === 'life_threatening' || a.severity === 'severe'
  );

  // No allergies - show green "NKDA" banner
  if (allergies.length === 0 && !latexAllergy && !adhesiveAllergy) {
    return (
      <div
        onClick={onClick}
        style={{
          padding: compact ? '8px 12px' : '10px 16px',
          backgroundColor: '#f0fdf4',
          borderBottom: '2px solid #22c55e',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: onClick ? 'pointer' : 'default',
        }}
      >
        <Shield size={compact ? 16 : 18} style={{ color: '#16a34a' }} />
        <span style={{ color: '#166534', fontWeight: 600, fontSize: compact ? '13px' : '14px' }}>
          NKDA - No Known Drug Allergies
        </span>
      </div>
    );
  }

  const displayedAllergies = isExpanded ? sortedAllergies : sortedAllergies.slice(0, 3);
  const hasMore = sortedAllergies.length > 3;

  return (
    <div
      style={{
        backgroundColor: hasCriticalAllergy ? '#fef2f2' : '#fffbeb',
        borderBottom: `2px solid ${hasCriticalAllergy ? '#dc2626' : '#f59e0b'}`,
      }}
    >
      {/* Main Banner */}
      <div
        onClick={onClick}
        style={{
          padding: compact ? '8px 12px' : '10px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: onClick ? 'pointer' : 'default',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
          <AlertTriangle
            size={compact ? 18 : 20}
            style={{ color: hasCriticalAllergy ? '#dc2626' : '#f59e0b', flexShrink: 0 }}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span
              style={{
                color: hasCriticalAllergy ? '#991b1b' : '#92400e',
                fontWeight: 700,
                fontSize: compact ? '13px' : '14px',
              }}
            >
              ALLERGIES:
            </span>

            {/* Allergy pills */}
            {displayedAllergies.map((allergy, index) => (
              <span
                key={allergy.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: compact ? '3px 8px' : '4px 10px',
                  backgroundColor: 'white',
                  border: '1px solid',
                  borderColor:
                    allergy.severity === 'life_threatening' || allergy.severity === 'severe'
                      ? '#dc2626'
                      : allergy.severity === 'moderate'
                      ? '#f59e0b'
                      : '#3b82f6',
                  borderRadius: '16px',
                  fontSize: compact ? '12px' : '13px',
                  fontWeight: 500,
                }}
              >
                {allergy.allergenName}
                <AllergyBadge severity={allergy.severity} showLabel={false} size="sm" />
              </span>
            ))}

            {/* Show more indicator */}
            {hasMore && !isExpanded && (
              <span
                style={{
                  color: '#6b7280',
                  fontSize: compact ? '12px' : '13px',
                  fontWeight: 500,
                }}
              >
                +{sortedAllergies.length - 3} more
              </span>
            )}
          </div>
        </div>

        {/* Special warnings */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '16px' }}>
          {latexAllergy && (
            <span
              style={{
                padding: compact ? '3px 8px' : '4px 10px',
                backgroundColor: '#7c3aed',
                color: 'white',
                borderRadius: '4px',
                fontSize: compact ? '11px' : '12px',
                fontWeight: 600,
              }}
            >
              LATEX
            </span>
          )}
          {adhesiveAllergy && (
            <span
              style={{
                padding: compact ? '3px 8px' : '4px 10px',
                backgroundColor: '#2563eb',
                color: 'white',
                borderRadius: '4px',
                fontSize: compact ? '11px' : '12px',
                fontWeight: 600,
              }}
            >
              ADHESIVE
            </span>
          )}

          {/* Expand/collapse button */}
          {hasMore && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              style={{
                padding: '4px',
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#6b7280',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'white',
            borderTop: '1px solid #e5e7eb',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#6b7280' }}>
                <th style={{ padding: '6px 8px', fontWeight: 600 }}>Allergen</th>
                <th style={{ padding: '6px 8px', fontWeight: 600 }}>Type</th>
                <th style={{ padding: '6px 8px', fontWeight: 600 }}>Severity</th>
                <th style={{ padding: '6px 8px', fontWeight: 600 }}>Reaction</th>
              </tr>
            </thead>
            <tbody>
              {sortedAllergies.map((allergy) => (
                <tr key={allergy.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '8px', fontWeight: 500 }}>{allergy.allergenName}</td>
                  <td style={{ padding: '8px', textTransform: 'capitalize' }}>
                    {allergy.allergenType}
                  </td>
                  <td style={{ padding: '8px' }}>
                    <AllergyBadge severity={allergy.severity} size="sm" />
                  </td>
                  <td style={{ padding: '8px', color: '#6b7280' }}>
                    {allergy.reactionType || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Minimal inline version for tight spaces
export function AllergyBannerInline({
  allergies,
  onClick,
}: {
  allergies: AllergyInfo[];
  onClick?: () => void;
}) {
  if (allergies.length === 0) {
    return (
      <span
        onClick={onClick}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 8px',
          backgroundColor: '#dcfce7',
          color: '#166534',
          borderRadius: '4px',
          fontSize: '12px',
          fontWeight: 500,
          cursor: onClick ? 'pointer' : 'default',
        }}
      >
        <Shield size={12} />
        NKDA
      </span>
    );
  }

  const hasCritical = allergies.some(
    (a) => a.severity === 'life_threatening' || a.severity === 'severe'
  );

  return (
    <span
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        backgroundColor: hasCritical ? '#fef2f2' : '#fef3c7',
        color: hasCritical ? '#991b1b' : '#92400e',
        borderRadius: '4px',
        fontSize: '12px',
        fontWeight: 600,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <AlertTriangle size={12} />
      {allergies.length} Allerg{allergies.length === 1 ? 'y' : 'ies'}
    </span>
  );
}
