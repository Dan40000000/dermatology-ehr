import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE_URL, TENANT_HEADER_NAME } from '../../api';

export type SourceType = 'physician' | 'patient' | 'marketing' | 'web' | 'insurance' | 'other';

interface ReferralSourceOption {
  id: string;
  optionText: string;
  optionCategory: SourceType;
  requiresDetails: boolean;
  displayOrder: number;
}

interface ReferralSourcePickerProps {
  patientId?: string;
  onSourceSelected?: (data: ReferralSourceData) => void;
  initialValue?: string;
  compact?: boolean;
}

export interface ReferralSourceData {
  sourceType: SourceType;
  sourceName: string;
  howHeard: string;
  referringProviderName?: string;
  referringProviderNpi?: string;
  referringPracticeName?: string;
  campaignCode?: string;
  notes?: string;
}

export function ReferralSourcePicker({
  patientId,
  onSourceSelected,
  initialValue,
  compact = false,
}: ReferralSourcePickerProps) {
  const { session } = useAuth();
  const [options, setOptions] = useState<ReferralSourceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOption, setSelectedOption] = useState<string>(initialValue || '');
  const [showDetails, setShowDetails] = useState(false);
  const [details, setDetails] = useState('');
  const [saving, setSaving] = useState(false);

  const loadOptions = useCallback(async () => {
    if (!session) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/referral-sources/options`, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          [TENANT_HEADER_NAME]: session.tenantId,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setOptions(data.options || []);
      }
    } catch (err) {
      console.error('Failed to load referral source options:', err);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  const handleOptionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedOption(value);

    const option = options.find((o) => o.id === value);
    if (option) {
      setShowDetails(option.requiresDetails);
      if (!option.requiresDetails) {
        setDetails('');
        notifySelection(option.optionText, option.optionCategory, '');
      }
    } else {
      setShowDetails(false);
      setDetails('');
    }
  };

  const handleDetailsChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    setDetails(value);

    const option = options.find((o) => o.id === selectedOption);
    if (option) {
      notifySelection(option.optionText, option.optionCategory, value);
    }
  };

  const notifySelection = (optionText: string, category: SourceType, detailsText: string) => {
    if (onSourceSelected) {
      const data: ReferralSourceData = {
        sourceType: category,
        sourceName: optionText,
        howHeard: detailsText ? `${optionText}: ${detailsText}` : optionText,
        notes: detailsText,
      };

      // For physician referrals, try to extract details
      if (category === 'physician' && detailsText) {
        data.referringProviderName = detailsText;
      }

      onSourceSelected(data);
    }
  };

  const saveReferralSource = async () => {
    if (!session || !patientId || !selectedOption) return;

    const option = options.find((o) => o.id === selectedOption);
    if (!option) return;

    setSaving(true);
    try {
      const body: ReferralSourceData = {
        sourceType: option.optionCategory,
        sourceName: option.optionText,
        howHeard: details ? `${option.optionText}: ${details}` : option.optionText,
        notes: details,
      };

      if (option.optionCategory === 'physician' && details) {
        body.referringProviderName = details;
      }

      const res = await fetch(`${API_BASE_URL}/api/referral-sources/patient/${patientId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.accessToken}`,
          [TENANT_HEADER_NAME]: session.tenantId,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error('Failed to save referral source');
      }
    } catch (err) {
      console.error('Failed to save referral source:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="referral-source-picker loading">
        <span className="loading-text">Loading options...</span>
      </div>
    );
  }

  const groupedOptions = options.reduce(
    (acc, option) => {
      const category = option.optionCategory;
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(option);
      return acc;
    },
    {} as Record<SourceType, ReferralSourceOption[]>
  );

  const categoryLabels: Record<SourceType, string> = {
    physician: 'Doctor/Physician Referral',
    patient: 'Friend/Family/Patient Referral',
    web: 'Online/Web',
    marketing: 'Marketing/Advertising',
    insurance: 'Insurance Directory',
    other: 'Other',
  };

  return (
    <div className={`referral-source-picker ${compact ? 'compact' : ''}`}>
      <div className="picker-field">
        <label htmlFor="referral-source">How did you hear about us?</label>
        <select
          id="referral-source"
          value={selectedOption}
          onChange={handleOptionChange}
          className="referral-select"
        >
          <option value="">-- Select an option --</option>
          {Object.entries(groupedOptions).map(([category, categoryOptions]) => (
            <optgroup key={category} label={categoryLabels[category as SourceType]}>
              {categoryOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.optionText}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {showDetails && (
        <div className="picker-field details-field">
          <label htmlFor="referral-details">Please provide more details:</label>
          {selectedOption &&
          options.find((o) => o.id === selectedOption)?.optionCategory === 'physician' ? (
            <input
              type="text"
              id="referral-details"
              value={details}
              onChange={handleDetailsChange}
              placeholder="Doctor's name or practice name"
              className="referral-input"
            />
          ) : (
            <textarea
              id="referral-details"
              value={details}
              onChange={handleDetailsChange}
              placeholder="Please specify..."
              className="referral-textarea"
              rows={2}
            />
          )}
        </div>
      )}

      {patientId && selectedOption && (
        <div className="picker-actions">
          <button
            type="button"
            onClick={saveReferralSource}
            disabled={saving || !selectedOption}
            className="btn btn-primary btn-sm"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      )}

      <style>{`
        .referral-source-picker {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .referral-source-picker.compact {
          gap: 0.5rem;
        }

        .picker-field {
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
        }

        .picker-field label {
          font-weight: 500;
          font-size: 0.875rem;
          color: #374151;
        }

        .referral-select {
          padding: 0.5rem 0.75rem;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 0.9375rem;
          background: white;
          color: #111827;
          width: 100%;
        }

        .referral-select:focus {
          outline: none;
          border-color: #6B46C1;
          box-shadow: 0 0 0 3px rgba(107, 70, 193, 0.15);
        }

        .referral-input,
        .referral-textarea {
          padding: 0.5rem 0.75rem;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 0.9375rem;
          width: 100%;
          font-family: inherit;
        }

        .referral-input:focus,
        .referral-textarea:focus {
          outline: none;
          border-color: #6B46C1;
          box-shadow: 0 0 0 3px rgba(107, 70, 193, 0.15);
        }

        .referral-textarea {
          resize: vertical;
          min-height: 60px;
        }

        .details-field {
          animation: fadeIn 0.2s ease-out;
        }

        .picker-actions {
          display: flex;
          justify-content: flex-end;
        }

        .btn-sm {
          padding: 0.375rem 0.75rem;
          font-size: 0.875rem;
        }

        .btn-primary {
          background: #6B46C1;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 500;
          transition: background 0.2s;
        }

        .btn-primary:hover:not(:disabled) {
          background: #7c3aed;
        }

        .btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .loading-text {
          color: #6b7280;
          font-size: 0.875rem;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-5px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .compact .picker-field label {
          font-size: 0.8125rem;
        }

        .compact .referral-select,
        .compact .referral-input,
        .compact .referral-textarea {
          font-size: 0.875rem;
          padding: 0.375rem 0.5rem;
        }
      `}</style>
    </div>
  );
}
