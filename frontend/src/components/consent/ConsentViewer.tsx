import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE_URL, TENANT_HEADER_NAME } from '../../api';

interface ConsentDetails {
  id: string;
  tenantId: string;
  patientId: string;
  templateId: string;
  templateName: string;
  formType: string;
  encounterId?: string;
  signedAt: string | null;
  signatureData: string | null;
  signatureType: string;
  signerName?: string;
  signerRelationship?: string;
  signatureHash?: string;
  witnessName?: string;
  witnessSignatureData?: string;
  witnessSignedAt?: string;
  formContentSnapshot?: string;
  formVersion?: string;
  fieldValues: Record<string, unknown>;
  status: 'pending' | 'signed' | 'revoked' | 'expired';
  revokedAt?: string;
  revocationReason?: string;
  pdfUrl?: string;
  createdAt: string;
  updatedAt: string;
}

interface AuditEntry {
  id: string;
  action: string;
  performedBy: string | null;
  performedByType: string;
  timestamp: string;
  details: Record<string, unknown> | null;
  ipAddress?: string;
}

interface ConsentViewerProps {
  consentId: string;
  onClose?: () => void;
  onRevoke?: (consentId: string) => void;
  showAuditLog?: boolean;
}

export function ConsentViewer({
  consentId,
  onClose,
  onRevoke,
  showAuditLog = true,
}: ConsentViewerProps) {
  const { session } = useAuth();
  const [consent, setConsent] = useState<ConsentDetails | null>(null);
  const [auditHistory, setAuditHistory] = useState<AuditEntry[]>([]);
  const [validation, setValidation] = useState<{ valid: boolean; details: Record<string, unknown> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'content' | 'audit'>('details');
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [revokeReason, setRevokeReason] = useState('');
  const [revoking, setRevoking] = useState(false);

  // Fetch consent details
  useEffect(() => {
    async function fetchConsent() {
      if (!session) return;

      try {
        const res = await fetch(`${API_BASE_URL}/api/consents/${consentId}`, {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            [TENANT_HEADER_NAME]: session.tenantId,
          },
        });

        if (!res.ok) {
          throw new Error('Failed to fetch consent');
        }

        const data = await res.json();
        setConsent(data.consent);

        // Validate signature
        if (data.consent.status === 'signed') {
          const validateRes = await fetch(`${API_BASE_URL}/api/consents/${consentId}/validate`, {
            headers: {
              Authorization: `Bearer ${session.accessToken}`,
              [TENANT_HEADER_NAME]: session.tenantId,
            },
          });
          if (validateRes.ok) {
            const validationData = await validateRes.json();
            setValidation(validationData);
          }
        }

        // Fetch audit history
        if (showAuditLog) {
          const auditRes = await fetch(`${API_BASE_URL}/api/consents/${consentId}/audit`, {
            headers: {
              Authorization: `Bearer ${session.accessToken}`,
              [TENANT_HEADER_NAME]: session.tenantId,
            },
          });
          if (auditRes.ok) {
            const auditData = await auditRes.json();
            setAuditHistory(auditData.auditHistory || []);
          }
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }

    fetchConsent();
  }, [session, consentId, showAuditLog]);

  const handleRevoke = async () => {
    if (!session || !revokeReason.trim()) return;

    setRevoking(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/consents/${consentId}/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.accessToken}`,
          [TENANT_HEADER_NAME]: session.tenantId,
        },
        body: JSON.stringify({ reason: revokeReason }),
      });

      if (!res.ok) {
        throw new Error('Failed to revoke consent');
      }

      setShowRevokeModal(false);
      onRevoke?.(consentId);

      // Refresh consent details
      setConsent((prev) =>
        prev
          ? {
              ...prev,
              status: 'revoked',
              revokedAt: new Date().toISOString(),
              revocationReason: revokeReason,
            }
          : null
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRevoking(false);
    }
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

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
          fontSize: '0.875rem',
          fontWeight: 500,
        }}
      >
        {style.label}
      </span>
    );
  };

  const getActionLabel = (action: string): string => {
    const labels: Record<string, string> = {
      created: 'Consent Created',
      viewed: 'Consent Viewed',
      signed: 'Consent Signed',
      revoked: 'Consent Revoked',
      pdf_generated: 'PDF Generated',
      pdf_downloaded: 'PDF Downloaded',
      witnessed: 'Witness Added',
    };
    return labels[action] || action;
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
        Loading consent details...
      </div>
    );
  }

  if (error || !consent) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: '#dc2626', marginBottom: '1rem' }}>
          {error || 'Consent not found'}
        </p>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '1.5rem',
          paddingBottom: '1rem',
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
            {consent.templateName}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {getStatusBadge(consent.status)}
            <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>
              Version {consent.formVersion}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {consent.status === 'signed' && (
            <>
              <button
                onClick={() =>
                  window.open(`${API_BASE_URL}/api/consents/${consent.id}/pdf`, '_blank')
                }
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
                View PDF
              </button>
              {onRevoke && (
                <button
                  onClick={() => setShowRevokeModal(true)}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#dc2626',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                  }}
                >
                  Revoke
                </button>
              )}
            </>
          )}
          {onClose && (
            <button
              onClick={onClose}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#f3f4f6',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Validation Status */}
      {validation && consent.status === 'signed' && (
        <div
          style={{
            padding: '1rem',
            marginBottom: '1.5rem',
            borderRadius: '8px',
            backgroundColor: validation.valid ? '#d1fae5' : '#fee2e2',
            border: `1px solid ${validation.valid ? '#86efac' : '#fecaca'}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.25rem' }}>{validation.valid ? '!' : '!'}</span>
            <span style={{ fontWeight: 500 }}>
              {validation.valid
                ? 'Signature Verified - Integrity check passed'
                : 'Signature Verification Failed'}
            </span>
          </div>
        </div>
      )}

      {/* Revocation Notice */}
      {consent.status === 'revoked' && (
        <div
          style={{
            padding: '1rem',
            marginBottom: '1.5rem',
            borderRadius: '8px',
            backgroundColor: '#fee2e2',
            border: '1px solid #fecaca',
          }}
        >
          <h3 style={{ fontWeight: 600, marginBottom: '0.5rem', color: '#991b1b' }}>
            This consent has been revoked
          </h3>
          <p style={{ fontSize: '0.875rem', color: '#7f1d1d' }}>
            <strong>Revoked:</strong> {formatDate(consent.revokedAt)}
          </p>
          {consent.revocationReason && (
            <p style={{ fontSize: '0.875rem', color: '#7f1d1d' }}>
              <strong>Reason:</strong> {consent.revocationReason}
            </p>
          )}
        </div>
      )}

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '1.5rem',
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        {(['details', 'content', 'audit'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: activeTab === tab ? '#ffffff' : 'transparent',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid #2563eb' : '2px solid transparent',
              color: activeTab === tab ? '#2563eb' : '#6b7280',
              fontWeight: activeTab === tab ? 500 : 400,
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            {tab === 'details' && 'Details'}
            {tab === 'content' && 'Form Content'}
            {tab === 'audit' && 'Audit Log'}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'details' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          {/* Signature Info */}
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>
              Signature Information
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: '#6b7280' }}>Signed At</label>
                <p style={{ margin: 0 }}>{formatDate(consent.signedAt)}</p>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: '#6b7280' }}>Signer Name</label>
                <p style={{ margin: 0 }}>{consent.signerName || 'N/A'}</p>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: '#6b7280' }}>Relationship</label>
                <p style={{ margin: 0 }}>{consent.signerRelationship || 'Self'}</p>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: '#6b7280' }}>Signature Type</label>
                <p style={{ margin: 0 }}>{consent.signatureType}</p>
              </div>
              {consent.signatureData && (
                <div>
                  <label style={{ fontSize: '0.75rem', color: '#6b7280' }}>Signature</label>
                  <div
                    style={{
                      marginTop: '0.5rem',
                      padding: '0.5rem',
                      backgroundColor: '#f9fafb',
                      borderRadius: '4px',
                      border: '1px solid #e5e7eb',
                    }}
                  >
                    <img
                      src={consent.signatureData}
                      alt="Signature"
                      style={{ maxWidth: '100%', maxHeight: '100px' }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Witness Info */}
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>
              Witness Information
            </h3>
            {consent.witnessName ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: '#6b7280' }}>Witness Name</label>
                  <p style={{ margin: 0 }}>{consent.witnessName}</p>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: '#6b7280' }}>Witnessed At</label>
                  <p style={{ margin: 0 }}>{formatDate(consent.witnessSignedAt)}</p>
                </div>
                {consent.witnessSignatureData && (
                  <div>
                    <label style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      Witness Signature
                    </label>
                    <div
                      style={{
                        marginTop: '0.5rem',
                        padding: '0.5rem',
                        backgroundColor: '#f9fafb',
                        borderRadius: '4px',
                        border: '1px solid #e5e7eb',
                      }}
                    >
                      <img
                        src={consent.witnessSignatureData}
                        alt="Witness Signature"
                        style={{ maxWidth: '100%', maxHeight: '80px' }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p style={{ color: '#6b7280' }}>No witness required</p>
            )}
          </div>

          {/* Field Values */}
          {Object.keys(consent.fieldValues).length > 0 && (
            <div style={{ gridColumn: '1 / -1' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>
                Form Field Values
              </h3>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '1rem',
                  padding: '1rem',
                  backgroundColor: '#f9fafb',
                  borderRadius: '8px',
                }}
              >
                {Object.entries(consent.fieldValues).map(([key, value]) => (
                  <div key={key}>
                    <label style={{ fontSize: '0.75rem', color: '#6b7280' }}>{key}</label>
                    <p style={{ margin: 0 }}>{String(value)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Technical Details */}
          <div style={{ gridColumn: '1 / -1' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>
              Technical Details
            </h3>
            <div
              style={{
                padding: '1rem',
                backgroundColor: '#f9fafb',
                borderRadius: '8px',
                fontSize: '0.75rem',
                fontFamily: 'monospace',
              }}
            >
              <p>
                <strong>Consent ID:</strong> {consent.id}
              </p>
              <p>
                <strong>Template ID:</strong> {consent.templateId}
              </p>
              {consent.encounterId && (
                <p>
                  <strong>Encounter ID:</strong> {consent.encounterId}
                </p>
              )}
              <p>
                <strong>Signature Hash:</strong> {consent.signatureHash || 'N/A'}
              </p>
              <p>
                <strong>Created:</strong> {formatDate(consent.createdAt)}
              </p>
              <p>
                <strong>Updated:</strong> {formatDate(consent.updatedAt)}
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'content' && (
        <div
          style={{
            padding: '1.5rem',
            backgroundColor: '#f9fafb',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
          }}
          dangerouslySetInnerHTML={{ __html: consent.formContentSnapshot || '<p>No content available</p>' }}
        />
      )}

      {activeTab === 'audit' && (
        <div>
          {auditHistory.length === 0 ? (
            <p style={{ color: '#6b7280', textAlign: 'center', padding: '2rem' }}>
              No audit history available
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {auditHistory.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    padding: '1rem',
                    backgroundColor: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 500 }}>{getActionLabel(entry.action)}</div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      {entry.performedByType}
                      {entry.ipAddress && ` - IP: ${entry.ipAddress}`}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '0.875rem', color: '#6b7280' }}>
                    {formatDate(entry.timestamp)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Revoke Modal */}
      {showRevokeModal && (
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
          onClick={() => setShowRevokeModal(false)}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              padding: '1.5rem',
              width: '100%',
              maxWidth: '450px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem', color: '#dc2626' }}
            >
              Revoke Consent
            </h3>
            <p style={{ color: '#6b7280', marginBottom: '1rem', fontSize: '0.875rem' }}>
              This action cannot be undone. Please provide a reason for revoking this consent.
            </p>
            <textarea
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              placeholder="Enter reason for revocation..."
              rows={4}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.875rem',
                marginBottom: '1rem',
              }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowRevokeModal(false)}
                disabled={revoking}
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
              <button
                onClick={handleRevoke}
                disabled={revoking || !revokeReason.trim()}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  cursor: revoking || !revokeReason.trim() ? 'not-allowed' : 'pointer',
                  opacity: revoking || !revokeReason.trim() ? 0.5 : 1,
                }}
              >
                {revoking ? 'Revoking...' : 'Revoke Consent'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ConsentViewer;
