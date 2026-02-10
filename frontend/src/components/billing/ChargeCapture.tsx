import { useState, useEffect, useCallback } from 'react';
import { Modal, LoadingSpinner } from '../ui';
import { searchSuperbillCodes, getSuperbillFee } from '../../api';
import type { CommonDermCode, SuperbillLineItem } from '../../types/superbill';

interface ChargeCaptureProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    cptCode: string;
    description?: string;
    icd10Codes?: string[];
    units?: number;
    fee?: number;
    modifier?: string;
  }) => void | Promise<void>;
  initialValues?: Partial<SuperbillLineItem>;
  existingDiagnoses?: string[];
  tenantId: string;
  accessToken: string;
}

const COMMON_MODIFIERS = [
  { code: '25', description: 'Significant, separately identifiable E/M' },
  { code: '59', description: 'Distinct procedural service' },
  { code: '76', description: 'Repeat procedure by same physician' },
  { code: 'TC', description: 'Technical component' },
  { code: '26', description: 'Professional component' },
  { code: 'LT', description: 'Left side' },
  { code: 'RT', description: 'Right side' },
];

export function ChargeCapture({
  isOpen,
  onClose,
  onSubmit,
  initialValues,
  existingDiagnoses = [],
  tenantId,
  accessToken,
}: ChargeCaptureProps) {
  const [cptCode, setCptCode] = useState(initialValues?.cptCode || '');
  const [description, setDescription] = useState(initialValues?.description || '');
  const [icd10Codes, setIcd10Codes] = useState<string[]>(initialValues?.icd10Codes || []);
  const [units, setUnits] = useState(initialValues?.units || 1);
  const [fee, setFee] = useState<number | undefined>(initialValues?.fee);
  const [modifier, setModifier] = useState(initialValues?.modifier || '');

  const [cptSearchQuery, setCptSearchQuery] = useState('');
  const [cptSearchResults, setCptSearchResults] = useState<CommonDermCode[]>([]);
  const [searchingCpt, setSearchingCpt] = useState(false);

  const [icdSearchQuery, setIcdSearchQuery] = useState('');
  const [icdSearchResults, setIcdSearchResults] = useState<CommonDermCode[]>([]);
  const [searchingIcd, setSearchingIcd] = useState(false);

  const [commonCptCodes, setCommonCptCodes] = useState<CommonDermCode[]>([]);
  const [loadingCommonCpt, setLoadingCommonCpt] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [loadingFee, setLoadingFee] = useState(false);

  // Load common CPT codes on mount
  useEffect(() => {
    const loadCommonCodes = async () => {
      try {
        setLoadingCommonCpt(true);
        const result = await searchSuperbillCodes(tenantId, accessToken, 'CPT', '', 20);
        setCommonCptCodes(result.codes || []);
      } catch (err) {
        console.error('Failed to load common CPT codes:', err);
      } finally {
        setLoadingCommonCpt(false);
      }
    };

    if (isOpen) {
      loadCommonCodes();
    }
  }, [isOpen, tenantId, accessToken]);

  // Auto-fetch fee when CPT code changes
  const fetchFee = useCallback(async (code: string) => {
    if (!code || code.length < 5) return;

    try {
      setLoadingFee(true);
      const result = await getSuperbillFee(tenantId, accessToken, code);
      if (result.fee !== undefined) {
        setFee(result.fee);
      }
    } catch (err) {
      console.error('Failed to fetch fee:', err);
    } finally {
      setLoadingFee(false);
    }
  }, [tenantId, accessToken]);

  useEffect(() => {
    if (cptCode && !initialValues?.fee) {
      fetchFee(cptCode);
    }
  }, [cptCode, fetchFee, initialValues?.fee]);

  const searchCptCodes = async (query: string) => {
    if (!query.trim()) {
      setCptSearchResults([]);
      return;
    }

    try {
      setSearchingCpt(true);
      const result = await searchSuperbillCodes(tenantId, accessToken, 'CPT', query);
      setCptSearchResults(result.codes || []);
    } catch (err) {
      console.error('Failed to search CPT codes:', err);
    } finally {
      setSearchingCpt(false);
    }
  };

  const searchIcdCodes = async (query: string) => {
    if (!query.trim()) {
      setIcdSearchResults([]);
      return;
    }

    try {
      setSearchingIcd(true);
      const result = await searchSuperbillCodes(tenantId, accessToken, 'ICD10', query);
      setIcdSearchResults(result.codes || []);
    } catch (err) {
      console.error('Failed to search ICD-10 codes:', err);
    } finally {
      setSearchingIcd(false);
    }
  };

  const handleCptSelect = (code: CommonDermCode) => {
    setCptCode(code.code);
    setDescription(code.description);
    setCptSearchQuery('');
    setCptSearchResults([]);
    fetchFee(code.code);
  };

  const handleIcdSelect = (code: CommonDermCode) => {
    if (!icd10Codes.includes(code.code)) {
      setIcd10Codes([...icd10Codes, code.code]);
    }
    setIcdSearchQuery('');
    setIcdSearchResults([]);
  };

  const handleRemoveIcd = (code: string) => {
    setIcd10Codes(icd10Codes.filter(c => c !== code));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!cptCode.trim()) {
      return;
    }

    try {
      setSubmitting(true);
      await onSubmit({
        cptCode: cptCode.trim(),
        description: description || undefined,
        icd10Codes: icd10Codes.length > 0 ? icd10Codes : undefined,
        units,
        fee,
        modifier: modifier || undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setCptCode('');
    setDescription('');
    setIcd10Codes([]);
    setUnits(1);
    setFee(undefined);
    setModifier('');
    setCptSearchQuery('');
    setCptSearchResults([]);
    setIcdSearchQuery('');
    setIcdSearchResults([]);
    onClose();
  };

  const formatCurrency = (cents: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  // Group common CPT codes by category
  const groupedCptCodes = commonCptCodes.reduce((acc, code) => {
    const category = code.category || 'Other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(code);
    return acc;
  }, {} as Record<string, CommonDermCode[]>);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={initialValues ? 'Edit Charge' : 'Add Charge'}
      size="lg"
    >
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* CPT Code Section */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: '#374151',
              marginBottom: '0.5rem',
            }}>
              CPT Code *
            </label>

            {/* Search Input */}
            <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
              <input
                type="text"
                value={cptSearchQuery}
                onChange={(e) => {
                  setCptSearchQuery(e.target.value);
                  searchCptCodes(e.target.value);
                }}
                placeholder="Search CPT codes..."
                style={{
                  width: '100%',
                  padding: '0.625rem 0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                }}
              />
              {searchingCpt && (
                <div style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)' }}>
                  <LoadingSpinner />
                </div>
              )}

              {/* Search Results Dropdown */}
              {cptSearchResults.length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  background: '#ffffff',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  maxHeight: '250px',
                  overflowY: 'auto',
                  zIndex: 50,
                }}>
                  {cptSearchResults.map((code) => (
                    <button
                      key={code.id}
                      type="button"
                      onClick={() => handleCptSelect(code)}
                      style={{
                        width: '100%',
                        padding: '0.625rem 0.75rem',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: '1px solid #e5e7eb',
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontWeight: 600, color: '#0369a1' }}>{code.code}</div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{code.description}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected CPT Code */}
            {cptCode && (
              <div style={{
                padding: '0.75rem',
                background: '#f0fdf4',
                border: '1px solid #86efac',
                borderRadius: '6px',
                marginBottom: '0.75rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, color: '#059669' }}>{cptCode}</div>
                    <div style={{ fontSize: '0.875rem', color: '#065f46' }}>{description}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCptCode('');
                      setDescription('');
                      setFee(undefined);
                    }}
                    style={{
                      padding: '0.25rem 0.5rem',
                      background: 'transparent',
                      border: 'none',
                      color: '#dc2626',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            )}

            {/* Common CPT Codes */}
            {!cptCode && !cptSearchQuery && (
              <div>
                <div style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: '#6b7280',
                  marginBottom: '0.5rem',
                  textTransform: 'uppercase',
                }}>
                  Common Codes
                </div>
                {loadingCommonCpt ? (
                  <LoadingSpinner />
                ) : (
                  <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    {Object.entries(groupedCptCodes).map(([category, codes]) => (
                      <div key={category} style={{ marginBottom: '0.75rem' }}>
                        <div style={{
                          fontSize: '0.625rem',
                          fontWeight: 600,
                          color: '#9ca3af',
                          textTransform: 'uppercase',
                          marginBottom: '0.25rem',
                        }}>
                          {category}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                          {codes.slice(0, 6).map((code) => (
                            <button
                              key={code.id}
                              type="button"
                              onClick={() => handleCptSelect(code)}
                              style={{
                                padding: '0.375rem 0.625rem',
                                background: '#f3f4f6',
                                border: '1px solid #e5e7eb',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                              }}
                              title={code.description}
                            >
                              {code.code}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Units and Fee */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#374151',
                marginBottom: '0.5rem',
              }}>
                Units
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={units}
                onChange={(e) => setUnits(parseInt(e.target.value) || 1)}
                style={{
                  width: '100%',
                  padding: '0.625rem 0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                }}
              />
            </div>

            <div>
              <label style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#374151',
                marginBottom: '0.5rem',
              }}>
                Fee (cents)
                {loadingFee && <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>Loading...</span>}
              </label>
              <input
                type="number"
                min={0}
                value={fee ?? ''}
                onChange={(e) => setFee(e.target.value ? parseInt(e.target.value) : undefined)}
                placeholder="Auto from fee schedule"
                style={{
                  width: '100%',
                  padding: '0.625rem 0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                }}
              />
              {fee !== undefined && (
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  {formatCurrency(fee)}
                </div>
              )}
            </div>

            <div>
              <label style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#374151',
                marginBottom: '0.5rem',
              }}>
                Modifier
              </label>
              <select
                value={modifier}
                onChange={(e) => setModifier(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.625rem 0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  background: '#ffffff',
                }}
              >
                <option value="">None</option>
                {COMMON_MODIFIERS.map((mod) => (
                  <option key={mod.code} value={mod.code}>
                    {mod.code} - {mod.description}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ICD-10 Diagnosis Codes */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: '#374151',
              marginBottom: '0.5rem',
            }}>
              Diagnosis Codes (ICD-10)
            </label>

            {/* Selected Diagnoses */}
            {icd10Codes.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginBottom: '0.75rem' }}>
                {icd10Codes.map((code) => (
                  <span
                    key={code}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.375rem',
                      padding: '0.375rem 0.625rem',
                      background: '#dbeafe',
                      color: '#1e40af',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: 500,
                    }}
                  >
                    {code}
                    <button
                      type="button"
                      onClick={() => handleRemoveIcd(code)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#1e40af',
                        cursor: 'pointer',
                        padding: 0,
                        fontSize: '0.875rem',
                        lineHeight: 1,
                      }}
                    >
                      x
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Existing Diagnoses from Encounter */}
            {existingDiagnoses.length > 0 && (
              <div style={{ marginBottom: '0.75rem' }}>
                <div style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: '#6b7280',
                  marginBottom: '0.375rem',
                }}>
                  From Encounter
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                  {existingDiagnoses.filter(code => !icd10Codes.includes(code)).map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setIcd10Codes([...icd10Codes, code])}
                      style={{
                        padding: '0.375rem 0.625rem',
                        background: '#f3f4f6',
                        border: '1px solid #e5e7eb',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                      }}
                    >
                      + {code}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ICD Search */}
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={icdSearchQuery}
                onChange={(e) => {
                  setIcdSearchQuery(e.target.value);
                  searchIcdCodes(e.target.value);
                }}
                placeholder="Search ICD-10 codes..."
                style={{
                  width: '100%',
                  padding: '0.625rem 0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                }}
              />
              {searchingIcd && (
                <div style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)' }}>
                  <LoadingSpinner />
                </div>
              )}

              {icdSearchResults.length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  background: '#ffffff',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  zIndex: 50,
                }}>
                  {icdSearchResults.map((code) => (
                    <button
                      key={code.id}
                      type="button"
                      onClick={() => handleIcdSelect(code)}
                      style={{
                        width: '100%',
                        padding: '0.625rem 0.75rem',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: '1px solid #e5e7eb',
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontWeight: 600, color: '#7c3aed' }}>{code.code}</div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{code.description}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Line Total Preview */}
          {cptCode && fee !== undefined && (
            <div style={{
              padding: '1rem',
              background: '#f9fafb',
              borderRadius: '8px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                {units} unit{units !== 1 ? 's' : ''} x {formatCurrency(fee)}
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>
                {formatCurrency(units * fee)}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '0.75rem',
          marginTop: '1.5rem',
          paddingTop: '1rem',
          borderTop: '1px solid #e5e7eb',
        }}>
          <button
            type="button"
            onClick={handleClose}
            style={{
              padding: '0.625rem 1.25rem',
              background: '#ffffff',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!cptCode || submitting}
            style={{
              padding: '0.625rem 1.25rem',
              background: !cptCode || submitting ? '#d1d5db' : '#0369a1',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 500,
              cursor: !cptCode || submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Saving...' : initialValues ? 'Update Charge' : 'Add Charge'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
