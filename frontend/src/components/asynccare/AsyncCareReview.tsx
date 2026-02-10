/**
 * AsyncCareReview Component
 * Provider view for reviewing a single async care request
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import {
  fetchAsyncCareRequest,
  assignAsyncCareRequest,
  updateAsyncCareStatus,
  type AsyncCareRequest,
  type PatientUploadedPhoto,
  type AsyncCareResponse,
} from '../../api/asyncCare';
import { API_BASE_URL } from '../../utils/apiBase';

interface AsyncCareReviewProps {
  requestId: string;
  onRespond: () => void;
  onClose: () => void;
  onEscalate: () => void;
}

export function AsyncCareReview({
  requestId,
  onRespond,
  onClose,
  onEscalate,
}: AsyncCareReviewProps) {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState<AsyncCareRequest | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<PatientUploadedPhoto | null>(null);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    loadRequest();
  }, [requestId]);

  const loadRequest = async () => {
    if (!session) return;

    setLoading(true);
    try {
      const res = await fetchAsyncCareRequest(
        { tenantId: session.tenantId, accessToken: session.accessToken },
        requestId
      );
      setRequest(res.request);
    } catch (error) {
      console.error('Failed to load request:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignToSelf = async () => {
    if (!session || !request) return;

    setAssigning(true);
    try {
      // Get current provider ID from session/user
      // For now, we'll need to pass the provider ID from the parent
      const res = await assignAsyncCareRequest(
        { tenantId: session.tenantId, accessToken: session.accessToken },
        requestId,
        session.user.id // This should be the provider ID
      );
      setRequest(res.request);
    } catch (error) {
      console.error('Failed to assign request:', error);
    } finally {
      setAssigning(false);
    }
  };

  const handleUpdateStatus = async (status: 'reviewed' | 'closed') => {
    if (!session || !request) return;

    try {
      const res = await updateAsyncCareStatus(
        { tenantId: session.tenantId, accessToken: session.accessToken },
        requestId,
        status
      );
      setRequest(res.request);
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  const getPhotoUrl = (photo: PatientUploadedPhoto) => {
    if (photo.imageUrl.startsWith('http')) {
      return photo.imageUrl;
    }
    return `${API_BASE_URL}${photo.imageUrl}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getBodyLocationLabel = (location: string) => {
    const labels: Record<string, string> = {
      face: 'Face',
      scalp: 'Scalp',
      neck: 'Neck',
      chest: 'Chest',
      abdomen: 'Abdomen',
      back_upper: 'Upper Back',
      back_lower: 'Lower Back',
      arm_left: 'Left Arm',
      arm_right: 'Right Arm',
      hand_left: 'Left Hand',
      hand_right: 'Right Hand',
      leg_left: 'Left Leg',
      leg_right: 'Right Leg',
      foot_left: 'Left Foot',
      foot_right: 'Right Foot',
      groin: 'Groin',
    };
    return labels[location] || location;
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div className="spinner" />
        <p>Loading request...</p>
      </div>
    );
  }

  if (!request) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#dc2626' }}>
        Request not found
      </div>
    );
  }

  return (
    <div className="async-care-review">
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
          <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.5rem' }}>
            {request.patientLastName}, {request.patientFirstName}
          </h2>
          <p style={{ margin: 0, color: '#6b7280' }}>
            Submitted {formatDate(request.submittedAt)}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {!request.assignedProviderId && (
            <Button
              onClick={handleAssignToSelf}
              loading={assigning}
              variant="primary"
            >
              Assign to Me
            </Button>
          )}
          <Button onClick={onRespond} variant="success">
            Respond
          </Button>
          <Button onClick={onEscalate} variant="warning">
            Schedule Visit
          </Button>
        </div>
      </div>

      {/* Request Details */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr',
          gap: '1.5rem',
        }}
      >
        {/* Main Content */}
        <div>
          {/* Chief Complaint */}
          <div
            style={{
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1rem',
            }}
          >
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', color: '#374151' }}>
              Chief Complaint
            </h3>
            <p style={{ margin: 0, fontSize: '1.125rem' }}>
              {request.chiefComplaint || 'Not specified'}
            </p>
          </div>

          {/* Symptom Details */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '1rem',
              marginBottom: '1rem',
            }}
          >
            {request.symptomDuration && (
              <div
                style={{
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '1rem',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                  Duration
                </div>
                <div style={{ fontWeight: 500 }}>{request.symptomDuration}</div>
              </div>
            )}

            {request.symptomChanges && (
              <div
                style={{
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '1rem',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                  Changes
                </div>
                <div style={{ fontWeight: 500 }}>
                  {request.symptomChanges.replace('_', ' ')}
                </div>
              </div>
            )}

            {request.painLevel !== undefined && request.painLevel !== null && (
              <div
                style={{
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '1rem',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                  Pain Level
                </div>
                <div style={{ fontWeight: 500 }}>{request.painLevel}/10</div>
              </div>
            )}

            {request.itchingLevel !== undefined && request.itchingLevel !== null && (
              <div
                style={{
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '1rem',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                  Itching Level
                </div>
                <div style={{ fontWeight: 500 }}>{request.itchingLevel}/10</div>
              </div>
            )}
          </div>

          {/* Questionnaire Responses */}
          {request.questionnaireResponses &&
            Object.keys(request.questionnaireResponses).length > 0 && (
              <div
                style={{
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '1rem',
                  marginBottom: '1rem',
                }}
              >
                <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', color: '#374151' }}>
                  Questionnaire Responses
                </h3>
                {Object.entries(request.questionnaireResponses).map(([key, value]) => (
                  <div key={key} style={{ marginBottom: '0.75rem' }}>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                      {key}
                    </div>
                    <div style={{ fontWeight: 500 }}>
                      {Array.isArray(value) ? value.join(', ') : String(value)}
                    </div>
                  </div>
                ))}
              </div>
            )}

          {/* Photos */}
          <div
            style={{
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1rem',
            }}
          >
            <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', color: '#374151' }}>
              Photos ({request.photos?.length || 0})
            </h3>

            {request.photos && request.photos.length > 0 ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                  gap: '1rem',
                }}
              >
                {request.photos.map((photo) => (
                  <div
                    key={photo.id}
                    onClick={() => setSelectedPhoto(photo)}
                    style={{
                      cursor: 'pointer',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      border: '1px solid #e5e7eb',
                    }}
                  >
                    <img
                      src={getPhotoUrl(photo)}
                      alt={`Photo of ${getBodyLocationLabel(photo.bodyLocation)}`}
                      style={{
                        width: '100%',
                        height: '150px',
                        objectFit: 'cover',
                      }}
                    />
                    <div
                      style={{
                        padding: '0.5rem',
                        background: '#f9fafb',
                        fontSize: '0.75rem',
                      }}
                    >
                      <div style={{ fontWeight: 500 }}>
                        {getBodyLocationLabel(photo.bodyLocation)}
                      </div>
                      {photo.bodyLocationDetail && (
                        <div style={{ color: '#6b7280' }}>{photo.bodyLocationDetail}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: '#6b7280', margin: 0 }}>No photos uploaded</p>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div>
          {/* Status & Urgency */}
          <div
            style={{
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1rem',
            }}
          >
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                Status
              </div>
              <span
                style={{
                  padding: '0.25rem 0.5rem',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  background:
                    request.status === 'pending'
                      ? '#fef3c7'
                      : request.status === 'in_review'
                      ? '#dbeafe'
                      : '#d1fae5',
                  color:
                    request.status === 'pending'
                      ? '#92400e'
                      : request.status === 'in_review'
                      ? '#1e40af'
                      : '#065f46',
                }}
              >
                {request.status.replace('_', ' ').toUpperCase()}
              </span>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                Urgency
              </div>
              <span
                style={{
                  padding: '0.25rem 0.5rem',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  background:
                    request.urgency === 'urgent'
                      ? '#fef2f2'
                      : request.urgency === 'soon'
                      ? '#fffbeb'
                      : '#f0fdf4',
                  color:
                    request.urgency === 'urgent'
                      ? '#dc2626'
                      : request.urgency === 'soon'
                      ? '#d97706'
                      : '#16a34a',
                }}
              >
                {request.urgency}
              </span>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                Request Type
              </div>
              <div style={{ fontWeight: 500 }}>
                {request.requestType.replace('_', ' ')}
              </div>
            </div>

            {request.concernCategory && (
              <div style={{ marginTop: '1rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                  Category
                </div>
                <div style={{ fontWeight: 500 }}>{request.concernCategory}</div>
              </div>
            )}
          </div>

          {/* Assignment */}
          <div
            style={{
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1rem',
            }}
          >
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
              Assigned Provider
            </div>
            <div style={{ fontWeight: 500 }}>
              {request.assignedProviderName || (
                <span style={{ color: '#f59e0b' }}>Unassigned</span>
              )}
            </div>
          </div>

          {/* Previous Responses */}
          {request.responses && request.responses.length > 0 && (
            <div
              style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1rem',
              }}
            >
              <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.875rem' }}>
                Previous Responses ({request.responses.length})
              </h4>
              {request.responses.map((response) => (
                <div
                  key={response.id}
                  style={{
                    padding: '0.75rem',
                    background: '#f9fafb',
                    borderRadius: '6px',
                    marginBottom: '0.5rem',
                    fontSize: '0.875rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '0.5rem',
                    }}
                  >
                    <span style={{ fontWeight: 500 }}>{response.providerName}</span>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      {formatDate(response.respondedAt)}
                    </span>
                  </div>
                  <p style={{ margin: 0, color: '#4b5563' }}>{response.responseText}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Photo Lightbox */}
      <Modal
        isOpen={!!selectedPhoto}
        onClose={() => setSelectedPhoto(null)}
        size="lg"
        title={selectedPhoto ? getBodyLocationLabel(selectedPhoto.bodyLocation) : ''}
      >
        {selectedPhoto && (
          <div>
            <img
              src={getPhotoUrl(selectedPhoto)}
              alt={`Photo of ${getBodyLocationLabel(selectedPhoto.bodyLocation)}`}
              style={{
                width: '100%',
                maxHeight: '70vh',
                objectFit: 'contain',
                borderRadius: '8px',
              }}
            />
            {selectedPhoto.description && (
              <p style={{ marginTop: '1rem', color: '#4b5563' }}>
                {selectedPhoto.description}
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
