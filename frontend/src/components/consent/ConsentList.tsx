import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE_URL, TENANT_HEADER_NAME } from '../../api';

interface ConsentSummary {
  id: string;
  templateId: string;
  templateName: string;
  formType: string;
  signedAt: string | null;
  status: 'pending' | 'signed' | 'revoked' | 'expired';
  signerName?: string;
  witnessName?: string;
  formVersion?: string;
}

interface ConsentListProps {
  patientId?: string;
  encounterId?: string;
  onSelectConsent?: (consentId: string) => void;
  onCreateConsent?: (templateId: string) => void;
  showActions?: boolean;
  filterStatus?: 'pending' | 'signed' | 'revoked' | 'expired' | 'all';
}

export function ConsentList({
  patientId,
  encounterId,
  onSelectConsent,
  onCreateConsent,
  showActions = true,
  filterStatus = 'all',
}: ConsentListProps) {
  const { session } = useAuth();
  const [consents, setConsents] = useState<ConsentSummary[]>([]);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; formType: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  // Fetch consents
  const fetchConsents = useCallback(async () => {
    if (!session) return;

    try {
      let url = `${API_BASE_URL}/api/consents/patient/${patientId}`;
      const params = new URLSearchParams();

      if (filterStatus !== 'all') {
        params.set('status', filterStatus);
      }

      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          [TENANT_HEADER_NAME]: session.tenantId,
        },
      });

      if (!res.ok) {
        throw new Error('Failed to fetch consents');
      }

      const data = await res.json();
      setConsents(data.consents || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [session, patientId, filterStatus]);

  // Fetch available templates
  const fetchTemplates = useCallback(async () => {
    if (!session) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/consents/templates?activeOnly=true`, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          [TENANT_HEADER_NAME]: session.tenantId,
        },
      });

      if (!res.ok) {
        throw new Error('Failed to fetch templates');
      }

      const data = await res.json();
      setTemplates(data.templates || []);
    } catch (err) {
      console.error('Error fetching templates:', err);
    }
  }, [session]);

  useEffect(() => {
    if (patientId) {
      fetchConsents();
    }
    fetchTemplates();
  }, [patientId, fetchConsents, fetchTemplates]);

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { bg: string; text: string; label: string }> = {
      pending: { bg: '#fef3c7', text: '#92400e', label: 'Pending' },
      signed: { bg: '#d1fae5', text: '#065f46', label: 'Signed' },
      revoked: { bg: '#fee2e2', text: '#991b1b', label: 'Revoked' },
      expired: { bg: '#f3f4f6', text: '#6b7280', label: 'Expired' },
    };

    const style = styles[status] || styles.pending;

    return (
      <span
        style={{
          display: 'inline-block',
          padding: '0.25rem 0.75rem',
          backgroundColor: style.bg,
          color: style.text,
          borderRadius: '9999px',
          fontSize: '0.75rem',
          fontWeight: 500,
        }}
      >
        {style.label}
      </span>
    );
  };

  const getFormTypeLabel = (formType: string) => {
    const labels: Record<string, string> = {
      general: 'General',
      biopsy: 'Biopsy',
      excision: 'Excision/Mohs',
      cosmetic: 'Cosmetic',
      phototherapy: 'Phototherapy',
      isotretinoin: 'Isotretinoin',
    };
    return labels[formType] || formType;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Not signed';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
        Loading consents...
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
        }}
      >
        <h2 style={{ fontSize: '1.25rem', fontWeight: '600', margin: 0 }}>
          Consent Forms
        </h2>
        {showActions && (
          <button
            onClick={() => setShowTemplateModal(true)}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span>+</span>
            New Consent
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            padding: '1rem',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            marginBottom: '1rem',
            color: '#dc2626',
          }}
        >
          {error}
        </div>
      )}

      {/* Consent List */}
      {consents.length === 0 ? (
        <div
          style={{
            padding: '3rem',
            textAlign: 'center',
            backgroundColor: '#f9fafb',
            borderRadius: '8px',
            border: '1px dashed #d1d5db',
          }}
        >
          <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
            No consent forms found for this patient.
          </p>
          {showActions && (
            <button
              onClick={() => setShowTemplateModal(true)}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              Create First Consent
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {consents.map((consent) => (
            <div
              key={consent.id}
              onClick={() => onSelectConsent?.(consent.id)}
              style={{
                padding: '1rem',
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                cursor: onSelectConsent ? 'pointer' : 'default',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                if (onSelectConsent) {
                  e.currentTarget.style.borderColor = '#2563eb';
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 500, margin: 0 }}>
                      {consent.templateName}
                    </h3>
                    {getStatusBadge(consent.status)}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: '1rem',
                      marginTop: '0.5rem',
                      fontSize: '0.875rem',
                      color: '#6b7280',
                    }}
                  >
                    <span>
                      <strong>Type:</strong> {getFormTypeLabel(consent.formType)}
                    </span>
                    {consent.formVersion && (
                      <span>
                        <strong>Version:</strong> {consent.formVersion}
                      </span>
                    )}
                  </div>
                  {consent.signedAt && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
                      <strong>Signed:</strong> {formatDate(consent.signedAt)}
                      {consent.signerName && ` by ${consent.signerName}`}
                      {consent.witnessName && ` (Witness: ${consent.witnessName})`}
                    </div>
                  )}
                </div>
                {consent.status === 'signed' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(`${API_BASE_URL}/api/consents/${consent.id}/pdf`, '_blank');
                    }}
                    style={{
                      padding: '0.25rem 0.75rem',
                      backgroundColor: '#f3f4f6',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                    }}
                  >
                    View PDF
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Template Selection Modal */}
      {showTemplateModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowTemplateModal(false)}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              padding: '1.5rem',
              width: '100%',
              maxWidth: '500px',
              maxHeight: '80vh',
              overflow: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>
              Select Consent Form
            </h3>
            <p style={{ color: '#6b7280', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
              Choose a consent form template to begin the signing process.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {templates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => {
                    onCreateConsent?.(template.id);
                    setShowTemplateModal(false);
                  }}
                  style={{
                    padding: '1rem',
                    textAlign: 'left',
                    backgroundColor: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#e0f2fe';
                    e.currentTarget.style.borderColor = '#2563eb';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#f9fafb';
                    e.currentTarget.style.borderColor = '#e5e7eb';
                  }}
                >
                  <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>
                    {template.name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    {getFormTypeLabel(template.formType)}
                  </div>
                </button>
              ))}
            </div>

            <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
              <button
                onClick={() => setShowTemplateModal(false)}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#f3f4f6',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ConsentList;
