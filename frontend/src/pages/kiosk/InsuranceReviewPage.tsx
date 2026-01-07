import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { KioskLayout } from '../../components/kiosk/KioskLayout';
import '../../styles/kiosk.css';

interface InsuranceData {
  insurance?: string;
  insuranceMemberId?: string;
  insuranceGroupNumber?: string;
  insurancePlanName?: string;
}

const cardStyle: React.CSSProperties = {
  background: 'white',
  borderRadius: '1rem',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  padding: '2rem',
};

export function KioskInsuranceReviewPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [useCamera, setUseCamera] = useState(false);
  const [insuranceData, setInsuranceData] = useState<InsuranceData>({});
  const [editedData, setEditedData] = useState<InsuranceData>({});
  const [frontPhoto, setFrontPhoto] = useState<string | null>(null);
  const [backPhoto, setBackPhoto] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const sessionId = sessionStorage.getItem('kioskSessionId');
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturingSide, setCapturingSide] = useState<'front' | 'back' | null>(null);

  useEffect(() => {
    if (!sessionId) {
      navigate('/kiosk');
      return;
    }

    fetchSessionData();

    return () => {
      stopCamera();
    };
  }, [sessionId]);

  const fetchSessionData = async () => {
    try {
      const response = await fetch(`/api/kiosk/checkin/${sessionId}`, {
        headers: {
          'X-Kiosk-Code': localStorage.getItem('kioskCode') || 'KIOSK-001',
          'X-Tenant-Id': localStorage.getItem('tenantId') || 'modmed-demo',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch session data');
      }

      const data = await response.json();
      setInsuranceData({
        insurance: data.session.insurance,
        insuranceMemberId: data.session.insurance_member_id,
        insuranceGroupNumber: data.session.insurance_group_number,
        insurancePlanName: data.session.insurance_plan_name,
      });

      if (data.session.insurance_front_photo_url) {
        setFrontPhoto(data.session.insurance_front_photo_url);
      }
      if (data.session.insurance_back_photo_url) {
        setBackPhoto(data.session.insurance_back_photo_url);
      }
    } catch (err) {
      setError('Unable to load insurance information.');
      console.error('Error fetching session:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTimeout = () => {
    stopCamera();
    sessionStorage.clear();
    navigate('/kiosk');
  };

  const handleBack = () => {
    stopCamera();
    navigate('/kiosk/demographics');
  };

  const handleEdit = () => {
    setIsEditing(true);
    setEditedData({ ...insuranceData });
  };

  const handleChange = (field: keyof InsuranceData, value: string) => {
    setEditedData({ ...editedData, [field]: value });
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');

    try {
      const response = await fetch(`/api/kiosk/checkin/${sessionId}/insurance`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Kiosk-Code': localStorage.getItem('kioskCode') || 'KIOSK-001',
          'X-Tenant-Id': localStorage.getItem('tenantId') || 'modmed-demo',
        },
        body: JSON.stringify(editedData),
      });

      if (!response.ok) {
        throw new Error('Failed to update insurance');
      }

      navigate('/kiosk/consent');
    } catch (err) {
      setError('Unable to save changes. Please try again.');
      console.error('Error saving insurance:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleContinue = async () => {
    navigate('/kiosk/consent');
  };

  const startCamera = async (side: 'front' | 'back') => {
    setCapturingSide(side);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: 1920, height: 1080 },
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      setError('Unable to access camera. Please enter information manually.');
      console.error('Camera error:', err);
      setUseCamera(false);
      setCapturingSide(null);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setCapturingSide(null);
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !capturingSide) return;

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      const photoData = canvas.toDataURL('image/jpeg', 0.9);

      if (capturingSide === 'front') {
        setFrontPhoto(photoData);
      } else {
        setBackPhoto(photoData);
      }

      await uploadPhoto(capturingSide, photoData);
    }

    stopCamera();
  };

  const uploadPhoto = async (side: 'front' | 'back', photoData: string) => {
    setUploadingPhoto(true);
    try {
      const response = await fetch(`/api/kiosk/checkin/${sessionId}/insurance-photo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Kiosk-Code': localStorage.getItem('kioskCode') || 'KIOSK-001',
          'X-Tenant-Id': localStorage.getItem('tenantId') || 'modmed-demo',
        },
        body: JSON.stringify({ side, photoData }),
      });

      if (!response.ok) {
        throw new Error('Failed to upload photo');
      }
    } catch (err) {
      setError('Failed to upload photo. Please try again.');
      console.error('Upload error:', err);
    } finally {
      setUploadingPhoto(false);
    }
  };

  if (loading) {
    return (
      <KioskLayout currentStep={3} totalSteps={6} stepName="Loading..." onTimeout={handleTimeout}>
        <div style={{ ...cardStyle, textAlign: 'center', padding: '3rem' }}>
          <div className="kiosk-spinner" style={{ margin: '0 auto 1rem' }} />
          <p style={{ fontSize: '1.5rem', color: '#4b5563' }}>Loading insurance information...</p>
        </div>
      </KioskLayout>
    );
  }

  if (capturingSide) {
    return (
      <KioskLayout currentStep={3} totalSteps={6} stepName="Capture Insurance Card" onTimeout={handleTimeout}>
        <div style={cardStyle}>
          <h2 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', marginBottom: '1.5rem' }}>
            Capture {capturingSide === 'front' ? 'Front' : 'Back'} of Card
          </h2>

          <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              style={{ width: '100%', borderRadius: '0.5rem', border: '4px solid #d1d5db' }}
            />
          </div>

          <p style={{ fontSize: '1.25rem', color: '#4b5563', marginBottom: '1.5rem', textAlign: 'center' }}>
            Position your insurance card within the frame
          </p>

          <div className="kiosk-nav-buttons">
            <button onClick={stopCamera} className="kiosk-btn-secondary" style={{ flex: 1 }}>
              Cancel
            </button>
            <button
              onClick={capturePhoto}
              disabled={uploadingPhoto}
              className="kiosk-btn-primary"
              style={{ flex: 1 }}
            >
              {uploadingPhoto ? 'Uploading...' : 'Capture Photo'}
            </button>
          </div>
        </div>
      </KioskLayout>
    );
  }

  return (
    <KioskLayout currentStep={3} totalSteps={6} stepName="Review Insurance" onTimeout={handleTimeout}>
      <div style={cardStyle}>
        <h2 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', marginBottom: '1rem' }}>
          Review Insurance Information
        </h2>
        <p style={{ fontSize: '1.25rem', color: '#4b5563', marginBottom: '2rem' }}>
          Please verify your insurance information is up to date.
        </p>

        {!isEditing && !useCamera ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
              <InfoField label="Insurance Provider" value={insuranceData.insurance || 'Not provided'} />
              <InfoField label="Member ID" value={insuranceData.insuranceMemberId || 'Not provided'} />
              <InfoField label="Group Number" value={insuranceData.insuranceGroupNumber || 'Not provided'} />
              <InfoField label="Plan Name" value={insuranceData.insurancePlanName || 'Not provided'} />
            </div>

            {(frontPhoto || backPhoto) && (
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#111827', marginBottom: '1rem' }}>
                  Insurance Card Photos
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                  {frontPhoto && (
                    <div>
                      <p style={{ fontSize: '0.875rem', color: '#4b5563', marginBottom: '0.5rem' }}>Front</p>
                      <img src={frontPhoto} alt="Front of insurance card" style={{ borderRadius: '0.5rem', border: '2px solid #d1d5db', width: '100%' }} />
                    </div>
                  )}
                  {backPhoto && (
                    <div>
                      <p style={{ fontSize: '0.875rem', color: '#4b5563', marginBottom: '0.5rem' }}>Back</p>
                      <img src={backPhoto} alt="Back of insurance card" style={{ borderRadius: '0.5rem', border: '2px solid #d1d5db', width: '100%' }} />
                    </div>
                  )}
                </div>
              </div>
            )}

            <div style={{
              background: '#f3e8ff',
              border: '2px solid #c4b5fd',
              borderRadius: '0.5rem',
              padding: '1.5rem',
              marginBottom: '2rem',
              textAlign: 'center',
            }}>
              <p style={{ fontSize: '1.25rem', fontWeight: 500, color: '#6b21a8' }}>
                Is your insurance information correct?
              </p>
            </div>
          </>
        ) : isEditing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '2rem' }}>
            <EditField
              label="Insurance Provider"
              value={editedData.insurance || ''}
              onChange={(v) => handleChange('insurance', v)}
            />
            <EditField
              label="Member ID"
              value={editedData.insuranceMemberId || ''}
              onChange={(v) => handleChange('insuranceMemberId', v)}
            />
            <EditField
              label="Group Number"
              value={editedData.insuranceGroupNumber || ''}
              onChange={(v) => handleChange('insuranceGroupNumber', v)}
            />
            <EditField
              label="Plan Name"
              value={editedData.insurancePlanName || ''}
              onChange={(v) => handleChange('insurancePlanName', v)}
            />
          </div>
        ) : (
          <div style={{ marginBottom: '2rem' }}>
            <p style={{ fontSize: '1.25rem', color: '#374151', textAlign: 'center', marginBottom: '1.5rem' }}>
              You can take photos of both sides of your insurance card
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
              <button
                onClick={() => startCamera('front')}
                style={{
                  padding: '3rem',
                  background: '#f3e8ff',
                  border: '2px solid #c4b5fd',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#6b21a8' }}>
                  {frontPhoto ? 'Retake Front' : 'Capture Front'}
                </div>
              </button>
              <button
                onClick={() => startCamera('back')}
                style={{
                  padding: '3rem',
                  background: '#f3e8ff',
                  border: '2px solid #c4b5fd',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#6b21a8' }}>
                  {backPhoto ? 'Retake Back' : 'Capture Back'}
                </div>
              </button>
            </div>

            {(frontPhoto || backPhoto) && (
              <button
                onClick={() => setUseCamera(false)}
                className="kiosk-btn-secondary"
                style={{ width: '100%', marginTop: '1rem' }}
              >
                Done with Photos
              </button>
            )}
          </div>
        )}

        {error && <div className="kiosk-error">{error}</div>}

        <div className="kiosk-nav-buttons">
          <button onClick={handleBack} className="kiosk-btn-secondary">
            Back
          </button>
          {!isEditing && !useCamera ? (
            <>
              <button
                onClick={() => setUseCamera(true)}
                style={{
                  flex: 1,
                  padding: '1.25rem',
                  fontSize: '1.25rem',
                  fontWeight: 500,
                  color: '#7c3aed',
                  background: '#f3e8ff',
                  border: '2px solid #c4b5fd',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                }}
              >
                Take Photo
              </button>
              <button
                onClick={handleEdit}
                style={{
                  flex: 1,
                  padding: '1.25rem',
                  fontSize: '1.25rem',
                  fontWeight: 500,
                  color: '#7c3aed',
                  background: '#f3e8ff',
                  border: '2px solid #c4b5fd',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                }}
              >
                Update Info
              </button>
              <button onClick={handleContinue} className="kiosk-btn-primary" style={{ flex: 1 }}>
                Continue
              </button>
            </>
          ) : isEditing ? (
            <>
              <button onClick={() => setIsEditing(false)} className="kiosk-btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="kiosk-btn-primary"
                style={{ flex: 1 }}
              >
                {saving ? 'Saving...' : 'Save & Continue'}
              </button>
            </>
          ) : (
            <button onClick={() => setUseCamera(false)} className="kiosk-btn-primary" style={{ flex: 1 }}>
              Continue
            </button>
          )}
        </div>
      </div>
    </KioskLayout>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '0.875rem', fontWeight: 500, color: '#4b5563', marginBottom: '0.25rem' }}>{label}</div>
      <div style={{ fontSize: '1.25rem', color: '#111827' }}>{value}</div>
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="kiosk-form-group">
      <label className="kiosk-form-label">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="kiosk-form-input"
      />
    </div>
  );
}
