/**
 * AllergyList Component
 *
 * Displays a patient's allergies in a list format with severity badges.
 */

import { useState } from 'react';
import { AlertTriangle, Plus, Edit2, Trash2, CheckCircle, Clock } from 'lucide-react';
import { AllergyBadge, type AllergySeverity } from './AllergyBadge';

export type AllergenType = 'drug' | 'food' | 'environmental' | 'latex' | 'contact';
export type AllergyStatus = 'active' | 'inactive' | 'resolved' | 'entered_in_error';

export interface PatientAllergy {
  id: string;
  patientId: string;
  allergenType: AllergenType;
  allergenName: string;
  rxcui?: string;
  reactionType?: string;
  severity: AllergySeverity;
  onsetDate?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  status: AllergyStatus;
  notes?: string;
  source?: string;
  createdAt: string;
  updatedAt: string;
}

interface AllergyListProps {
  allergies: PatientAllergy[];
  onAdd?: () => void;
  onEdit?: (allergy: PatientAllergy) => void;
  onDelete?: (allergyId: string) => void;
  onVerify?: (allergyId: string) => void;
  showActions?: boolean;
  compact?: boolean;
  maxDisplay?: number;
}

const allergenTypeLabels: Record<AllergenType, string> = {
  drug: 'Drug',
  food: 'Food',
  environmental: 'Environmental',
  latex: 'Latex',
  contact: 'Contact',
};

const allergenTypeColors: Record<AllergenType, string> = {
  drug: '#dc2626',
  food: '#ea580c',
  environmental: '#16a34a',
  latex: '#7c3aed',
  contact: '#2563eb',
};

export function AllergyList({
  allergies,
  onAdd,
  onEdit,
  onDelete,
  onVerify,
  showActions = true,
  compact = false,
  maxDisplay,
}: AllergyListProps) {
  const [showAll, setShowAll] = useState(false);

  const activeAllergies = allergies.filter((a) => a.status === 'active');
  const displayAllergies =
    maxDisplay && !showAll ? activeAllergies.slice(0, maxDisplay) : activeAllergies;
  const hasMore = maxDisplay && activeAllergies.length > maxDisplay;

  if (activeAllergies.length === 0) {
    return (
      <div
        style={{
          padding: compact ? '12px' : '24px',
          textAlign: 'center',
          backgroundColor: '#f0fdf4',
          borderRadius: '8px',
          border: '1px solid #86efac',
        }}
      >
        <CheckCircle size={compact ? 20 : 32} style={{ color: '#22c55e', marginBottom: '8px' }} />
        <p style={{ color: '#166534', fontWeight: 500, margin: 0 }}>
          No Known Allergies (NKDA)
        </p>
        {showActions && onAdd && (
          <button
            onClick={onAdd}
            style={{
              marginTop: '12px',
              padding: '8px 16px',
              backgroundColor: '#16a34a',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Plus size={16} />
            Add Allergy
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? '8px' : '12px' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: compact ? '4px' : '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle size={compact ? 18 : 20} style={{ color: '#dc2626' }} />
          <span style={{ fontWeight: 600, color: '#991b1b', fontSize: compact ? '14px' : '16px' }}>
            Allergies ({activeAllergies.length})
          </span>
        </div>
        {showActions && onAdd && (
          <button
            onClick={onAdd}
            style={{
              padding: compact ? '4px 8px' : '6px 12px',
              backgroundColor: '#dc2626',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: compact ? '12px' : '14px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Plus size={compact ? 14 : 16} />
            Add
          </button>
        )}
      </div>

      {/* Allergy items */}
      {displayAllergies.map((allergy) => (
        <div
          key={allergy.id}
          style={{
            padding: compact ? '10px 12px' : '12px 16px',
            backgroundColor: 'white',
            border: '1px solid #fecaca',
            borderLeft: `4px solid ${allergenTypeColors[allergy.allergenType]}`,
            borderRadius: '6px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div style={{ flex: 1 }}>
              {/* Allergen name and type */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontWeight: 600,
                    color: '#111827',
                    fontSize: compact ? '14px' : '15px',
                  }}
                >
                  {allergy.allergenName}
                </span>
                <AllergyBadge severity={allergy.severity} size={compact ? 'sm' : 'md'} />
                <span
                  style={{
                    fontSize: '11px',
                    padding: '2px 6px',
                    backgroundColor: '#f3f4f6',
                    color: '#6b7280',
                    borderRadius: '4px',
                  }}
                >
                  {allergenTypeLabels[allergy.allergenType]}
                </span>
              </div>

              {/* Reaction info */}
              {allergy.reactionType && !compact && (
                <div style={{ marginTop: '6px', fontSize: '13px', color: '#6b7280' }}>
                  <strong>Reaction:</strong> {allergy.reactionType}
                </div>
              )}

              {/* Notes */}
              {allergy.notes && !compact && (
                <div
                  style={{ marginTop: '4px', fontSize: '13px', color: '#6b7280', fontStyle: 'italic' }}
                >
                  {allergy.notes}
                </div>
              )}

              {/* Verification status */}
              {!compact && (
                <div
                  style={{
                    marginTop: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    fontSize: '12px',
                  }}
                >
                  {allergy.verifiedAt ? (
                    <span style={{ color: '#16a34a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle size={12} />
                      Verified
                    </span>
                  ) : (
                    <span style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={12} />
                      Unverified
                    </span>
                  )}
                  {allergy.source && (
                    <span style={{ color: '#9ca3af' }}>Source: {allergy.source.replace('_', ' ')}</span>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            {showActions && (onEdit || onDelete || onVerify) && (
              <div style={{ display: 'flex', gap: '4px' }}>
                {onVerify && !allergy.verifiedAt && (
                  <button
                    onClick={() => onVerify(allergy.id)}
                    title="Verify allergy"
                    style={{
                      padding: '4px',
                      backgroundColor: 'transparent',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      color: '#16a34a',
                    }}
                  >
                    <CheckCircle size={16} />
                  </button>
                )}
                {onEdit && (
                  <button
                    onClick={() => onEdit(allergy)}
                    title="Edit allergy"
                    style={{
                      padding: '4px',
                      backgroundColor: 'transparent',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      color: '#6b7280',
                    }}
                  >
                    <Edit2 size={16} />
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={() => onDelete(allergy.id)}
                    title="Remove allergy"
                    style={{
                      padding: '4px',
                      backgroundColor: 'transparent',
                      border: '1px solid #fecaca',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      color: '#dc2626',
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Show more button */}
      {hasMore && (
        <button
          onClick={() => setShowAll(!showAll)}
          style={{
            padding: '8px',
            backgroundColor: '#fef2f2',
            color: '#dc2626',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          {showAll ? 'Show Less' : `Show ${activeAllergies.length - maxDisplay!} More`}
        </button>
      )}
    </div>
  );
}
