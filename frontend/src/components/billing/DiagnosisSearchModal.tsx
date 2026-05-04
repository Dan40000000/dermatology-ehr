import { useState, useEffect } from 'react';
import { Modal } from '../ui';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { searchICD10Codes, fetchSuggestedDiagnoses, type AdaptiveDiagnosisSuggestion, type PatientDiagnosisSummary } from '../../api';
import type { EncounterDiagnosis, ICD10Code } from '../../types';

interface DiagnosisSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (code: ICD10Code, isPrimary: boolean) => void;
  providerId?: string;
  patientDiagnoses?: PatientDiagnosisSummary[];
  currentDiagnoses?: EncounterDiagnosis[];
  defaultPrimary?: boolean;
  contextText?: string;
}

const DOCUMENTATION_DIAGNOSIS_SUGGESTIONS: Array<ICD10Code & { keywords: string[]; reason: string }> = [
  {
    code: 'C44.41',
    description: 'Basal cell carcinoma of skin of scalp and neck',
    category: 'Skin cancer - BCC',
    isCommon: true,
    keywords: ['basal cell', 'bcc', 'neck', 'scalp', 'mohs', 'trapezial'],
    reason: 'BCC/Mohs documentation',
  },
  {
    code: 'C44.319',
    description: 'Basal cell carcinoma of skin of other parts of face',
    category: 'Skin cancer - BCC',
    isCommon: true,
    keywords: ['basal cell', 'bcc', 'face', 'cheek', 'forehead', 'temple'],
    reason: 'facial BCC documentation',
  },
  {
    code: 'C44.42',
    description: 'Squamous cell carcinoma of skin of scalp and neck',
    category: 'Skin cancer - SCC',
    isCommon: true,
    keywords: ['squamous cell', 'scc', 'neck', 'scalp', 'mohs'],
    reason: 'SCC/Mohs documentation',
  },
  {
    code: 'D48.5',
    description: 'Neoplasm of uncertain behavior of skin',
    category: 'Neoplasm - uncertain behavior',
    isCommon: true,
    keywords: ['rule out', 'r/o', 'uncertain behavior', 'biopsy', 'atypical lesion', 'neoplasm'],
    reason: 'biopsy/uncertain lesion documentation',
  },
  {
    code: 'L57.0',
    description: 'Actinic keratosis',
    category: 'Premalignant',
    isCommon: true,
    keywords: ['actinic keratosis', 'ak ', 'aks', 'cryotherapy', 'liquid nitrogen'],
    reason: 'AK/cryotherapy documentation',
  },
  {
    code: 'L82.1',
    description: 'Other seborrheic keratosis',
    category: 'Benign Neoplasm',
    isCommon: true,
    keywords: ['seborrheic keratosis', 'sk ', 'sks'],
    reason: 'SK documentation',
  },
  {
    code: 'L70.0',
    description: 'Acne vulgaris',
    category: 'Acne',
    isCommon: true,
    keywords: ['acne'],
    reason: 'acne documentation',
  },
  {
    code: 'L40.0',
    description: 'Psoriasis vulgaris',
    category: 'Psoriasis',
    isCommon: true,
    keywords: ['psoriasis', 'plaque'],
    reason: 'psoriasis documentation',
  },
];

function normalizeDiagnosisCode(code?: string | null): string {
  return String(code || '').trim().toUpperCase();
}

function dedupeByCode<T extends { code: string }>(codes: T[]): T[] {
  const seen = new Set<string>();
  return codes.filter((item) => {
    const normalized = normalizeDiagnosisCode(item.code);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

export function DiagnosisSearchModal({
  isOpen,
  onClose,
  onSelect,
  providerId,
  patientDiagnoses = [],
  currentDiagnoses = [],
  defaultPrimary = false,
  contextText = '',
}: DiagnosisSearchModalProps) {
  const { session } = useAuth();
  const { showError } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ICD10Code[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedCode, setSelectedCode] = useState<ICD10Code | null>(null);
  const [isPrimary, setIsPrimary] = useState(false);
  const [frequentlyUsed, setFrequentlyUsed] = useState<AdaptiveDiagnosisSuggestion[]>([]);
  const [loadingFrequent, setLoadingFrequent] = useState(false);
  const currentDiagnosisCodes = new Set(currentDiagnoses.map((dx) => normalizeDiagnosisCode(dx.icd10Code)));

  const patientDiagnosisChoices = dedupeByCode(
    patientDiagnoses
      .filter((dx) => dx.icd10Code && !currentDiagnosisCodes.has(normalizeDiagnosisCode(dx.icd10Code)))
      .map((dx) => ({
        code: dx.icd10Code,
        description: dx.description || 'Diagnosis',
        category: dx.isPrimary ? 'Prior primary diagnosis' : 'Prior patient diagnosis',
        isCommon: Boolean(dx.isPrimary),
        encounterDate: dx.encounterDate,
      }))
  ).slice(0, 8);

  const normalizedContextText = contextText.toLowerCase();
  const contextualDiagnosisChoices = DOCUMENTATION_DIAGNOSIS_SUGGESTIONS
    .filter((dx) => !currentDiagnosisCodes.has(normalizeDiagnosisCode(dx.code)))
    .filter((dx) => dx.keywords.some((keyword) => normalizedContextText.includes(keyword.toLowerCase())))
    .slice(0, 6);

  // Load frequently used diagnoses when modal opens
  useEffect(() => {
    if (isOpen && session && providerId) {
      setLoadingFrequent(true);
      fetchSuggestedDiagnoses(session.tenantId, session.accessToken, providerId, 10)
        .then((res) => setFrequentlyUsed(Array.isArray(res.suggestions) ? res.suggestions : []))
        .catch((err) => {
          console.error('Failed to load frequent diagnoses:', err);
          setFrequentlyUsed([]);
        })
        .finally(() => setLoadingFrequent(false));
    }
  }, [isOpen, session, providerId]);

  useEffect(() => {
    if (isOpen) {
      setIsPrimary(defaultPrimary);
    }
  }, [isOpen, defaultPrimary]);

  const handleSearch = async () => {
    if (!session || !searchQuery.trim()) return;

    setSearching(true);
    try {
      const res = await searchICD10Codes(session.tenantId, session.accessToken, searchQuery);
      setSearchResults(Array.isArray(res.codes) ? res.codes : []);
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

    if (daysSince < 7) return { icon: '', color: '#10b981', label: 'Recent' };
    if (daysSince < 30) return null;
    return null;
  };

  const commonDiagnoses: ICD10Code[] = [
    { code: 'L57.0', description: 'Actinic keratosis', isCommon: true },
    { code: 'D48.5', description: 'Neoplasm of uncertain behavior of skin', isCommon: true },
    { code: 'Z12.83', description: 'Encounter for screening for malignant neoplasm of skin', isCommon: true },
    { code: 'Z85.820', description: 'Personal history of malignant melanoma of skin', isCommon: true },
    { code: 'Z85.828', description: 'Personal history of other malignant neoplasm of skin', isCommon: true },
    { code: 'C44.41', description: 'Basal cell carcinoma of skin of scalp and neck', isCommon: true },
    { code: 'C44.319', description: 'Basal cell carcinoma of skin of other parts of face', isCommon: true },
    { code: 'C44.91', description: 'Basal cell carcinoma of skin, unspecified', isCommon: true },
    { code: 'C44.42', description: 'Squamous cell carcinoma of skin of scalp and neck', isCommon: true },
    { code: 'C44.329', description: 'Squamous cell carcinoma of skin of other parts of face', isCommon: true },
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
              <span></span>
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

        {/* Patient Diagnoses */}
        {searchResults.length === 0 && patientDiagnosisChoices.length > 0 && (
          <div>
            <h4 style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              color: '#0f766e',
              marginBottom: '0.75rem'
            }}>
              Pull From Patient Diagnosis History
            </h4>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '0.5rem',
              marginBottom: '1.5rem'
            }}>
              {patientDiagnosisChoices.map((dx) => (
                <button
                  key={dx.code}
                  type="button"
                  onClick={() => setSelectedCode(dx)}
                  style={{
                    padding: '0.75rem',
                    background: selectedCode?.code === dx.code ? '#ccfbf1' : '#f0fdfa',
                    border: `1px solid ${selectedCode?.code === dx.code ? '#0f766e' : '#99f6e4'}`,
                    borderRadius: '8px',
                    textAlign: 'left',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#0f766e' }}>
                    {dx.code}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#374151', marginTop: '0.25rem' }}>
                    {dx.description}
                  </div>
                  {dx.encounterDate && (
                    <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '0.35rem' }}>
                      Prior encounter: {new Date(dx.encounterDate).toLocaleDateString()}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Documentation Suggestions */}
        {searchResults.length === 0 && contextualDiagnosisChoices.length > 0 && (
          <div>
            <h4 style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              color: '#92400e',
              marginBottom: '0.75rem'
            }}>
              Suggested From Appointment Documentation
            </h4>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '0.5rem',
              marginBottom: '1.5rem'
            }}>
              {contextualDiagnosisChoices.map((dx) => (
                <button
                  key={dx.code}
                  type="button"
                  onClick={() => setSelectedCode(dx)}
                  style={{
                    padding: '0.75rem',
                    background: selectedCode?.code === dx.code ? '#fef3c7' : '#fffbeb',
                    border: `1px solid ${selectedCode?.code === dx.code ? '#d97706' : '#fde68a'}`,
                    borderRadius: '8px',
                    textAlign: 'left',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#92400e' }}>
                    {dx.code}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#374151', marginTop: '0.25rem' }}>
                    {dx.description}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#92400e', marginTop: '0.35rem', fontWeight: 600 }}>
                    {dx.reason}
                  </div>
                </button>
              ))}
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
