import { useState, useEffect } from 'react';
import { Modal } from '../ui';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { searchICD10Codes, fetchSuggestedDiagnoses, type AdaptiveDiagnosisSuggestion } from '../../api';
import type { ICD10Code } from '../../types';

interface DiagnosisSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (code: ICD10Code, isPrimary: boolean) => void;
  providerId?: string;
}

export function DiagnosisSearchModal({ isOpen, onClose, onSelect, providerId }: DiagnosisSearchModalProps) {
  const { session } = useAuth();
  const { showError } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ICD10Code[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedCode, setSelectedCode] = useState<ICD10Code | null>(null);
  const [isPrimary, setIsPrimary] = useState(false);
  const [frequentlyUsed, setFrequentlyUsed] = useState<AdaptiveDiagnosisSuggestion[]>([]);
  const [loadingFrequent, setLoadingFrequent] = useState(false);

  // Load frequently used diagnoses when modal opens
  useEffect(() => {
    if (isOpen && session && providerId) {
      setLoadingFrequent(true);
      fetchSuggestedDiagnoses(session.tenantId, session.accessToken, providerId, 10)
        .then((res) => setFrequentlyUsed(res.suggestions))
        .catch((err) => {
          console.error('Failed to load frequent diagnoses:', err);
          setFrequentlyUsed([]);
        })
        .finally(() => setLoadingFrequent(false));
    }
  }, [isOpen, session, providerId]);

  const handleSearch = async () => {
    if (!session || !searchQuery.trim()) return;

    setSearching(true);
    try {
      const res = await searchICD10Codes(session.tenantId, session.accessToken, searchQuery);
      setSearchResults(res.codes || []);
    } catch (err: any) {
      showError(err.message || 'Failed to search diagnoses');
    } finally {
      setSearching(false);
    }
  };

  const handleAdd = () => {
    if (selectedCode) {
      onSelect(selectedCode, isPrimary);
      handleClose();
    }
  };

  const handleClose = () => {
    setSearchQuery('');
    setSearchResults([]);
    setSelectedCode(null);
    setIsPrimary(false);
    setFrequentlyUsed([]);
    onClose();
  };

  const getRecencyBadge = (lastUsed: string) => {
    const now = new Date();
    const lastUsedDate = new Date(lastUsed);
    const daysSince = Math.floor((now.getTime() - lastUsedDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysSince < 7) return { icon: '⏱️', color: '#10b981', label: 'Recent' };
    if (daysSince < 30) return null;
    return null;
  };

  const commonDiagnoses: ICD10Code[] = [
    { code: 'L57.0', description: 'Actinic keratosis', isCommon: true },
    { code: 'C44.91', description: 'Basal cell carcinoma of skin, unspecified', isCommon: true },
    { code: 'C44.92', description: 'Squamous cell carcinoma of skin, unspecified', isCommon: true },
    { code: 'C43.9', description: 'Malignant melanoma of skin, unspecified', isCommon: true },
    { code: 'L82.1', description: 'Seborrheic keratosis', isCommon: true },
    { code: 'L30.9', description: 'Dermatitis, unspecified', isCommon: true },
    { code: 'L40.0', description: 'Psoriasis vulgaris', isCommon: true },
    { code: 'L20.9', description: 'Atopic dermatitis, unspecified', isCommon: true },
    { code: 'L70.0', description: 'Acne vulgaris', isCommon: true },
    { code: 'L71.9', description: 'Rosacea, unspecified', isCommon: true },
  ];

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add Diagnosis (ICD-10)" size="lg">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Search */}
        <div>
          <label style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 500,
            color: '#374151',
            marginBottom: '0.5rem'
          }}>
            Search ICD-10 Codes
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Enter code or description..."
              style={{
                flex: 1,
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '0.875rem'
              }}
            />
            <button
              type="button"
              onClick={handleSearch}
              disabled={searching || !searchQuery.trim()}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#0369a1',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                fontWeight: 500,
                cursor: searching || !searchQuery.trim() ? 'not-allowed' : 'pointer',
                opacity: searching || !searchQuery.trim() ? 0.6 : 1
              }}
            >
              {searching ? 'Searching...' : 'Search'}
            </button>
          </div>
        </div>

        {/* Frequently Used (Adaptive Learning) */}
        {searchResults.length === 0 && frequentlyUsed.length > 0 && (
          <div>
            <h4 style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              color: '#7c3aed',
              marginBottom: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <span>🔥</span>
              <span>Frequently Used by You</span>
            </h4>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '0.5rem',
              marginBottom: '1.5rem'
            }}>
              {frequentlyUsed.map((dx) => {
                const recencyBadge = getRecencyBadge(dx.lastUsed);
                return (
                  <button
                    key={dx.icd10Code}
                    type="button"
                    onClick={() => setSelectedCode({ code: dx.icd10Code, description: dx.description, category: dx.category })}
                    style={{
                      padding: '0.75rem',
                      background: selectedCode?.code === dx.icd10Code ? '#f3e8ff' : '#faf5ff',
                      border: `1px solid ${selectedCode?.code === dx.icd10Code ? '#7c3aed' : '#e9d5ff'}`,
                      borderRadius: '8px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#7c3aed' }}>
                        {dx.icd10Code}
                      </div>
                      <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                        {recencyBadge && (
                          <span style={{ fontSize: '0.75rem' }} title={recencyBadge.label}>
                            {recencyBadge.icon}
                          </span>
                        )}
                        <span style={{
                          padding: '0.125rem 0.375rem',
                          background: '#ddd6fe',
                          color: '#5b21b6',
                          borderRadius: '4px',
                          fontSize: '0.625rem',
                          fontWeight: 600
                        }}>
                          {dx.frequencyCount}x
                        </span>
                      </div>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      {dx.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Common Diagnoses */}
        {searchResults.length === 0 && (
          <div>
            <h4 style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              color: '#374151',
              marginBottom: '0.75rem'
            }}>
              Common Dermatology Diagnoses
            </h4>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '0.5rem'
            }}>
              {commonDiagnoses.map((dx) => (
                <button
                  key={dx.code}
                  type="button"
                  onClick={() => setSelectedCode(dx)}
                  style={{
                    padding: '0.75rem',
                    background: selectedCode?.code === dx.code ? '#e0f2fe' : '#f9fafb',
                    border: `1px solid ${selectedCode?.code === dx.code ? '#0369a1' : '#e5e7eb'}`,
                    borderRadius: '8px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#0369a1' }}>
                    {dx.code}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                    {dx.description}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div>
            <h4 style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              color: '#374151',
              marginBottom: '0.75rem'
            }}>
              Search Results ({searchResults.length})
            </h4>
            <div style={{
              maxHeight: '300px',
              overflowY: 'auto',
              border: '1px solid #e5e7eb',
              borderRadius: '8px'
            }}>
              {searchResults.map((code) => (
                <button
                  key={code.code}
                  type="button"
                  onClick={() => setSelectedCode(code)}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    background: selectedCode?.code === code.code ? '#e0f2fe' : '#ffffff',
                    border: 'none',
                    borderBottom: '1px solid #e5e7eb',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'background 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#0369a1' }}>
                        {code.code}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#374151', marginTop: '0.25rem' }}>
                        {code.description}
                      </div>
                      {code.category && (
                        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                          {code.category}
                        </div>
                      )}
                    </div>
                    {code.isCommon && (
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        background: '#fef3c7',
                        color: '#92400e',
                        borderRadius: '4px',
                        fontSize: '0.625rem',
                        fontWeight: 600,
                        textTransform: 'uppercase'
                      }}>
                        Common
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Selected Code & Primary Toggle */}
        {selectedCode && (
          <div style={{
            padding: '1rem',
            background: '#f0fdf4',
            border: '1px solid #86efac',
            borderRadius: '8px'
          }}>
            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#065f46', marginBottom: '0.25rem' }}>
                Selected Diagnosis:
              </div>
              <div style={{ fontWeight: 600, color: '#047857' }}>
                {selectedCode.code} - {selectedCode.description}
              </div>
            </div>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                checked={isPrimary}
                onChange={(e) => setIsPrimary(e.target.checked)}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#065f46' }}>
                Mark as Primary Diagnosis
              </span>
            </label>
          </div>
        )}
      </div>

      <div className="modal-footer" style={{ marginTop: '1.5rem' }}>
        <button type="button" className="btn-secondary" onClick={handleClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={handleAdd}
          disabled={!selectedCode}
          style={{
            opacity: !selectedCode ? 0.5 : 1,
            cursor: !selectedCode ? 'not-allowed' : 'pointer'
          }}
        >
          Add Diagnosis
        </button>
      </div>
    </Modal>
  );
}
