import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Modal } from '../ui';
import { PAStatusBadge } from './PAStatusBadge';
import { PAHistoryAccordion } from './PAHistoryAccordion';
import { DocumentUpload } from './DocumentUpload';
import { fetchPARequest, submitPARequest, checkPARequestStatus, updatePARequest } from '../../api';
import { usePAStatusPolling } from '../../hooks/usePAStatusPolling';

interface PARequest {
  id: string;
  patient_id: string;
  first_name: string;
  last_name: string;
  medication_name: string;
  medication_strength?: string;
  medication_quantity?: number;
  sig?: string;
  payer: string;
  member_id: string;
  prescriber_full_name?: string;
  status: 'pending' | 'submitted' | 'approved' | 'denied' | 'needs_info' | 'error';
  status_reason?: string;
  history?: any[];
  external_reference_id?: string;
  attachments?: Array<{
    fileName: string;
    fileUrl: string;
    fileType: string;
    uploadedAt: string;
  }>;
  created_at: string;
  updated_at: string;
}

interface PADetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  paRequestId: string;
  onUpdate: () => void;
}

export function PADetailModal({ isOpen, onClose, paRequestId, onUpdate }: PADetailModalProps) {
  const { session } = useAuth();
  const { showSuccess, showError, showInfo } = useToast();
  const [loading, setLoading] = useState(false);
  const [paRequest, setPARequest] = useState<PARequest | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ fileName: string; fileUrl: string }>>([]);

  useEffect(() => {
    if (isOpen && paRequestId) {
      loadPARequest();
    }
  }, [isOpen, paRequestId]);

  // Enable status polling for submitted PA requests
  const shouldPoll = paRequest?.status === 'submitted';
  usePAStatusPolling({
    paRequestId: paRequestId,
    enabled: isOpen && shouldPoll,
    interval: 30000, // Check every 30 seconds
    onStatusChange: (result) => {
      showInfo(`PA status updated: ${result.status}`);
      loadPARequest();
      onUpdate();
    },
  });

  const loadPARequest = async () => {
    if (!session) return;

    setLoading(true);
    try {
      const data = await fetchPARequest(session.tenantId, session.accessToken, paRequestId);
      setPARequest(data);
      setUploadedFiles(data.attachments || []);
    } catch (error: any) {
      showError(error.message || 'Failed to load PA request');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!session || !paRequest) return;

    if (!window.confirm('Submit this prior authorization to the payer? This cannot be undone.')) {
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitPARequest(session.tenantId, session.accessToken, paRequestId);
      showSuccess(result.message || 'PA request submitted successfully');

      // Reload the PA request to get updated status
      setTimeout(() => {
        loadPARequest();
        onUpdate();
      }, 1000);
    } catch (error: any) {
      showError(error.message || 'Failed to submit PA request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckStatus = async () => {
    if (!session) return;

    setCheckingStatus(true);
    try {
      const result = await checkPARequestStatus(session.tenantId, session.accessToken, paRequestId);
      showInfo(`Status: ${result.status} - ${result.statusReason || 'No additional info'}`);

      // Reload to get updated data
      loadPARequest();
      onUpdate();
    } catch (error: any) {
      showError(error.message || 'Failed to check PA status');
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleDocumentUpload = useCallback(
    async (file: File, url: string) => {
      if (!session || !paRequest) return;

      const newAttachment = {
        fileName: file.name,
        fileUrl: url,
        fileType: file.type,
        uploadedAt: new Date().toISOString(),
      };

      const updatedAttachments = [...uploadedFiles, newAttachment];
      setUploadedFiles(updatedAttachments);

      try {
        await updatePARequest(session.tenantId, session.accessToken, paRequestId, {
          attachments: updatedAttachments,
        });

        onUpdate();
      } catch (error: any) {
        showError(error.message || 'Failed to update PA request with attachment');
      }
    },
    [session, paRequest, paRequestId, uploadedFiles, onUpdate, showError]
  );

  if (!paRequest) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="PA Request Details" size="lg">
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          {loading ? 'Loading...' : 'No PA request data available'}
        </div>
      </Modal>
    );
  }

  const canSubmit = paRequest.status === 'pending' || paRequest.status === 'needs_info';
  const isSubmitted = ['submitted', 'approved', 'denied'].includes(paRequest.status);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Prior Authorization Details" size="lg">
      <div style={{ padding: '1rem' }}>
        {/* Header Section */}
        <div
          style={{
            background: '#f9fafb',
            padding: '1rem',
            borderRadius: '8px',
            marginBottom: '1rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>PA Request</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>
              {paRequest.first_name} {paRequest.last_name}
            </div>
          </div>
          <PAStatusBadge status={paRequest.status} size="lg" />
        </div>

        {/* Patient & Insurance Info */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '1rem',
            marginBottom: '1rem',
          }}
        >
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Payer</div>
            <div style={{ fontWeight: 500 }}>{paRequest.payer}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Member ID</div>
            <div style={{ fontWeight: 500 }}>{paRequest.member_id}</div>
          </div>
        </div>

        {/* Medication Info */}
        <div
          style={{
            background: '#eff6ff',
            padding: '1rem',
            borderRadius: '8px',
            marginBottom: '1rem',
          }}
        >
          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1e40af', marginBottom: '0.5rem' }}>
            Medication
          </div>
          <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '0.25rem' }}>
            {paRequest.medication_name}
          </div>
          {paRequest.medication_strength && (
            <div style={{ fontSize: '0.875rem', color: '#374151' }}>{paRequest.medication_strength}</div>
          )}
          {paRequest.medication_quantity && (
            <div style={{ fontSize: '0.875rem', color: '#374151' }}>Quantity: {paRequest.medication_quantity}</div>
          )}
          {paRequest.sig && (
            <div style={{ fontSize: '0.875rem', color: '#374151', marginTop: '0.5rem' }}>
              <span style={{ fontWeight: 500 }}>Sig:</span> {paRequest.sig}
            </div>
          )}
        </div>

        {/* Status Reason */}
        {paRequest.status_reason && (
          <div
            style={{
              background: '#fef3c7',
              border: '1px solid #fbbf24',
              padding: '0.75rem',
              borderRadius: '8px',
              marginBottom: '1rem',
            }}
          >
            <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>Status Notes</div>
            <div style={{ fontSize: '0.875rem' }}>{paRequest.status_reason}</div>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          {canSubmit && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                flex: 1,
                padding: '0.75rem',
                background: '#10b981',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.6 : 1,
              }}
            >
              {submitting ? 'Submitting...' : 'Submit to Payer'}
            </button>
          )}

          {isSubmitted && (
            <button
              type="button"
              onClick={handleCheckStatus}
              disabled={checkingStatus}
              style={{
                flex: 1,
                padding: '0.75rem',
                background: '#3b82f6',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                cursor: checkingStatus ? 'not-allowed' : 'pointer',
                opacity: checkingStatus ? 0.6 : 1,
              }}
            >
              {checkingStatus ? 'Checking...' : 'Check Status'}
            </button>
          )}
        </div>

        {/* Document Upload */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Supporting Documents
          </div>
          <DocumentUpload onUpload={handleDocumentUpload} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" maxSizeMB={10} />

          {uploadedFiles.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                Uploaded Files ({uploadedFiles.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {uploadedFiles.map((file, index) => (
                  <div
                    key={index}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.5rem',
                      background: '#f9fafb',
                      borderRadius: '4px',
                      fontSize: '0.875rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span></span>
                      <span>{file.fileName}</span>
                    </div>
                    <a
                      href={file.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#3b82f6', textDecoration: 'none', fontSize: '0.75rem' }}
                    >
                      View
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* History Timeline */}
        {paRequest.history && paRequest.history.length > 0 && (
          <PAHistoryAccordion history={paRequest.history} />
        )}

        {/* External Reference */}
        {paRequest.external_reference_id && (
          <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#6b7280' }}>
            External Reference: <code>{paRequest.external_reference_id}</code>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem',
              background: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
