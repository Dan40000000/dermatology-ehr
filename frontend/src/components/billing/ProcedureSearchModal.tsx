import { useState, useEffect } from 'react';
import { Modal } from '../ui';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import {
  searchCPTCodes,
  fetchFeeForCPT,
  fetchSuggestedProcedures,
  fetchProceduresForDiagnosis,
  type AdaptiveProcedureSuggestion
} from '../../api';
import type { CPTCode, EncounterDiagnosis } from '../../types';

interface ProcedureSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (procedure: {
    code: string;
    description: string;
    quantity: number;
    feeCents: number;
    linkedDiagnosisIds: string[];
  }) => void;
  diagnoses: EncounterDiagnosis[];
  providerId?: string;
}

export function ProcedureSearchModal({ isOpen, onClose, onSelect, diagnoses, providerId }: ProcedureSearchModalProps) {
  const { session } = useAuth();
  const { showError } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CPTCode[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedCode, setSelectedCode] = useState<CPTCode | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [feeCents, setFeeCents] = useState<number>(0);
  const [linkedDiagnosisIds, setLinkedDiagnosisIds] = useState<string[]>([]);
  const [frequentlyUsed, setFrequentlyUsed] = useState<AdaptiveProcedureSuggestion[]>([]);
  const [pairedProcedures, setPairedProcedures] = useState<AdaptiveProcedureSuggestion[]>([]);
  const [loadingFrequent, setLoadingFrequent] = useState(false);

  // Load frequently used procedures when modal opens
  useEffect(() => {
    if (isOpen && session && providerId) {
      setLoadingFrequent(true);
      fetchSuggestedProcedures(session.tenantId, session.accessToken, providerId, 10)
        .then((res) => setFrequentlyUsed(res.suggestions))
        .catch((err) => {
          console.error('Failed to load frequent procedures:', err);
          setFrequentlyUsed([]);
        })
        .finally(() => setLoadingFrequent(false));
    }
  }, [isOpen, session, providerId]);

  // Load procedures commonly paired with primary diagnosis
  useEffect(() => {
    if (isOpen && session && providerId) {
      const primaryDx = diagnoses.find(d => d.isPrimary);
      if (primaryDx && primaryDx.icd10Code) {
        fetchProceduresForDiagnosis(session.tenantId, session.accessToken, providerId, primaryDx.icd10Code, 10)
          .then((res) => setPairedProcedures(res.suggestions))
          .catch((err) => {
            console.error('Failed to load paired procedures:', err);
            setPairedProcedures([]);
          });
      } else {
        setPairedProcedures([]);
      }
    }
  }, [isOpen, session, providerId, diagnoses]);

  const handleSearch = async () => {
    if (!session || !searchQuery.trim()) return;

    setSearching(true);
    try {
      const res = await searchCPTCodes(session.tenantId, session.accessToken, searchQuery);
      setSearchResults(res.codes || []);
    } catch (err: any) {
      showError(err.message || 'Failed to search procedures');
    } finally {
      setSearching(false);
    }
  };

  const handleCodeSelect = async (code: CPTCode) => {
    setSelectedCode(code);
    setFeeCents(code.defaultFeeCents || 0);

    // Try to fetch fee from fee schedule
    if (session && code.code) {
      try {
        const res = await fetchFeeForCPT(session.tenantId, session.accessToken, code.code);
        if (res.fee) {
          setFeeCents(res.fee);
        }
      } catch (err) {
        // Use default fee if no fee schedule entry
      }
    }

    // Auto-link to primary diagnosis if available
    const primaryDx = diagnoses.find(d => d.isPrimary);
    if (primaryDx) {
      setLinkedDiagnosisIds([primaryDx.id]);
    }
  };

  const handleAdd = () => {
    if (selectedCode) {
      onSelect({
        code: selectedCode.code,
        description: selectedCode.description,
        quantity,
        feeCents,
        linkedDiagnosisIds,
      });
      handleClose();
    }
  };

  const handleClose = () => {
    setSearchQuery('');
    setSearchResults([]);
    setSelectedCode(null);
    setQuantity(1);
    setFeeCents(0);
    setLinkedDiagnosisIds([]);
    setFrequentlyUsed([]);
    setPairedProcedures([]);
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

  const handleSelectAdaptive = async (suggestion: AdaptiveProcedureSuggestion) => {
    const code: CPTCode = {
      code: suggestion.cptCode,
      description: suggestion.description,
      category: suggestion.category,
      defaultFeeCents: suggestion.defaultFeeCents,
      isCommon: false
    };
    await handleCodeSelect(code);
  };

  const toggleDiagnosis = (diagnosisId: string) => {
    setLinkedDiagnosisIds(prev =>
      prev.includes(diagnosisId)
        ? prev.filter(id => id !== diagnosisId)
        : [...prev, diagnosisId]
    );
  };

  const commonProcedures: CPTCode[] = [
    { code: '11100', description: 'Biopsy of skin, subcutaneous tissue and/or mucous membrane; single lesion', defaultFeeCents: 15000, isCommon: true },
    { code: '11101', description: 'Biopsy of skin; each additional lesion', defaultFeeCents: 7500, isCommon: true },
    { code: '11200', description: 'Removal of skin tags, multiple fibrocutaneous tags, any area; up to and including 15 lesions', defaultFeeCents: 12000, isCommon: true },
    { code: '11400', description: 'Excision, benign lesion including margins, except skin tag; trunk, arms or legs; excised diameter 0.5 cm or less', defaultFeeCents: 18000, isCommon: true },
    { code: '11600', description: 'Excision, malignant lesion including margins, trunk, arms, or legs; excised diameter 0.5 cm or less', defaultFeeCents: 25000, isCommon: true },
    { code: '17000', description: 'Destruction (eg, laser surgery, electrosurgery, cryosurgery), premalignant lesions; first lesion', defaultFeeCents: 10000, isCommon: true },
    { code: '17003', description: 'Destruction, premalignant lesions; second through 14 lesions, each', defaultFeeCents: 3000, isCommon: true },
    { code: '17110', description: 'Destruction of benign lesions other than skin tags or cutaneous vascular lesions; up to 14 lesions', defaultFeeCents: 14000, isCommon: true },
    { code: '99202', description: 'Office visit, new patient, low complexity', defaultFeeCents: 12000, isCommon: true },
    { code: '99213', description: 'Office visit, established patient, low complexity', defaultFeeCents: 11000, isCommon: true },
  ];

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add Procedure/Charge (CPT)" size="lg">
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
            Search CPT Codes
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

        {/* Paired Procedures (Based on Primary Diagnosis) */}
        {searchResults.length === 0 && pairedProcedures.length > 0 && (
          <div>
            <h4 style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              color: '#0369a1',
              marginBottom: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <span>🔗</span>
              <span>Often Paired with {diagnoses.find(d => d.isPrimary)?.icd10Code}</span>
            </h4>
            <div style={{
              maxHeight: '200px',
              overflowY: 'auto',
              border: '1px solid #bfdbfe',
              borderRadius: '8px',
              marginBottom: '1.5rem',
              background: '#eff6ff'
            }}>
              {pairedProcedures.map((proc) => {
                const recencyBadge = getRecencyBadge(proc.lastUsed);
                return (
                  <button
                    key={proc.cptCode}
                    type="button"
                    onClick={() => handleSelectAdaptive(proc)}
                    style={{
                      width: '100%',
                      padding: '0.75rem 1rem',
                      background: selectedCode?.code === proc.cptCode ? '#dbeafe' : '#ffffff',
                      border: 'none',
                      borderBottom: '1px solid #bfdbfe',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'background 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#0369a1' }}>
                            {proc.cptCode}
                          </div>
                          {recencyBadge && (
                            <span style={{ fontSize: '0.75rem' }} title={recencyBadge.label}>
                              {recencyBadge.icon}
                            </span>
                          )}
                          <span style={{
                            padding: '0.125rem 0.375rem',
                            background: '#bfdbfe',
                            color: '#1e40af',
                            borderRadius: '4px',
                            fontSize: '0.625rem',
                            fontWeight: 600
                          }}>
                            {proc.pairCount}x paired
                          </span>
                        </div>
                        <div style={{ fontSize: '0.875rem', color: '#374151', marginTop: '0.25rem' }}>
                          {proc.description}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', marginLeft: '1rem' }}>
                        {proc.defaultFeeCents && (
                          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#047857' }}>
                            ${((proc.defaultFeeCents || 0) / 100).toFixed(2)}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

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
              maxHeight: '200px',
              overflowY: 'auto',
              border: '1px solid #e9d5ff',
              borderRadius: '8px',
              marginBottom: '1.5rem',
              background: '#faf5ff'
            }}>
              {frequentlyUsed.map((proc) => {
                const recencyBadge = getRecencyBadge(proc.lastUsed);
                return (
                  <button
                    key={proc.cptCode}
                    type="button"
                    onClick={() => handleSelectAdaptive(proc)}
                    style={{
                      width: '100%',
                      padding: '0.75rem 1rem',
                      background: selectedCode?.code === proc.cptCode ? '#f3e8ff' : '#ffffff',
                      border: 'none',
                      borderBottom: '1px solid #e9d5ff',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'background 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#7c3aed' }}>
                            {proc.cptCode}
                          </div>
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
                            {proc.frequencyCount}x
                          </span>
                        </div>
                        <div style={{ fontSize: '0.875rem', color: '#374151', marginTop: '0.25rem' }}>
                          {proc.description}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', marginLeft: '1rem' }}>
                        {proc.defaultFeeCents && (
                          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#047857' }}>
                            ${((proc.defaultFeeCents || 0) / 100).toFixed(2)}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Common Procedures */}
        {searchResults.length === 0 && (
          <div>
            <h4 style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              color: '#374151',
              marginBottom: '0.75rem'
            }}>
              Common Dermatology Procedures
            </h4>
            <div style={{
              maxHeight: '300px',
              overflowY: 'auto',
              border: '1px solid #e5e7eb',
              borderRadius: '8px'
            }}>
              {commonProcedures.map((proc) => (
                <button
                  key={proc.code}
                  type="button"
                  onClick={() => handleCodeSelect(proc)}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    background: selectedCode?.code === proc.code ? '#e0f2fe' : '#ffffff',
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
                        {proc.code}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#374151', marginTop: '0.25rem' }}>
                        {proc.description}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', marginLeft: '1rem' }}>
                      <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#047857' }}>
                        ${((proc.defaultFeeCents || 0) / 100).toFixed(2)}
                      </div>
                    </div>
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
                  onClick={() => handleCodeSelect(code)}
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
                    <div style={{ textAlign: 'right', marginLeft: '1rem' }}>
                      {code.defaultFeeCents && (
                        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#047857' }}>
                          ${(code.defaultFeeCents / 100).toFixed(2)}
                        </div>
                      )}
                      {code.isCommon && (
                        <span style={{
                          padding: '0.25rem 0.5rem',
                          background: '#fef3c7',
                          color: '#92400e',
                          borderRadius: '4px',
                          fontSize: '0.625rem',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          marginTop: '0.25rem',
                          display: 'inline-block'
                        }}>
                          Common
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Selected Code Configuration */}
        {selectedCode && (
          <div style={{
            padding: '1rem',
            background: '#f0fdf4',
            border: '1px solid #86efac',
            borderRadius: '8px'
          }}>
            <div style={{ fontSize: '0.75rem', color: '#065f46', marginBottom: '0.25rem' }}>
              Selected Procedure:
            </div>
            <div style={{ fontWeight: 600, color: '#047857', marginBottom: '1rem' }}>
              {selectedCode.code} - {selectedCode.description}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  color: '#065f46',
                  marginBottom: '0.25rem'
                }}>
                  Quantity
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #86efac',
                    borderRadius: '4px',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  color: '#065f46',
                  marginBottom: '0.25rem'
                }}>
                  Fee (USD)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={(feeCents / 100).toFixed(2)}
                  onChange={(e) => setFeeCents(Math.round(parseFloat(e.target.value) * 100) || 0)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #86efac',
                    borderRadius: '4px',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
            </div>

            {/* Link to Diagnoses */}
            <div>
              <label style={{
                display: 'block',
                fontSize: '0.75rem',
                fontWeight: 500,
                color: '#065f46',
                marginBottom: '0.5rem'
              }}>
                Link to Diagnoses (Required for CMS Compliance)
              </label>
              {diagnoses.length === 0 ? (
                <div style={{
                  padding: '0.75rem',
                  background: '#fef3c7',
                  border: '1px solid #fbbf24',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  color: '#92400e'
                }}>
                  No diagnoses added yet. Add diagnoses first to link them to this charge.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {diagnoses.map((dx) => (
                    <label
                      key={dx.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.5rem',
                        background: '#ffffff',
                        border: '1px solid #86efac',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={linkedDiagnosisIds.includes(dx.id)}
                        onChange={() => toggleDiagnosis(dx.id)}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 600, fontSize: '0.75rem' }}>
                          {dx.icd10Code}
                        </span>
                        {' - '}
                        <span style={{ fontSize: '0.75rem' }}>
                          {dx.description}
                        </span>
                        {dx.isPrimary && (
                          <span style={{
                            marginLeft: '0.5rem',
                            padding: '0.125rem 0.375rem',
                            background: '#0369a1',
                            color: '#ffffff',
                            borderRadius: '4px',
                            fontSize: '0.625rem',
                            fontWeight: 600
                          }}>
                            PRIMARY
                          </span>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
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
          disabled={!selectedCode || linkedDiagnosisIds.length === 0}
          style={{
            opacity: !selectedCode || linkedDiagnosisIds.length === 0 ? 0.5 : 1,
            cursor: !selectedCode || linkedDiagnosisIds.length === 0 ? 'not-allowed' : 'pointer'
          }}
        >
          Add Procedure
        </button>
      </div>
    </Modal>
  );
}
