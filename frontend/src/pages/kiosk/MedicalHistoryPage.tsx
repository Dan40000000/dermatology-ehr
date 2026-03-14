import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KioskLayout } from '../../components/kiosk/KioskLayout';
import { getKioskHeaders } from '../../utils/kioskContext';
import '../../styles/kiosk.css';

interface MedicalHistoryData {
  allergies?: string;
  medications?: string;
  pastMedicalHistory?: string;
  familyHistory?: string;
  surgicalHistory?: string;
  socialHistory?: string;
  currentSymptoms?: string;
}

const cardStyle: React.CSSProperties = {
  background: 'white',
  borderRadius: '1rem',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  padding: '2rem',
};

const formFieldStyle: React.CSSProperties = {
  marginBottom: '1rem',
};

const textareaStyle: React.CSSProperties = {
  width: '100%',
  minHeight: '90px',
  resize: 'vertical',
};

const fields: Array<{ key: keyof MedicalHistoryData; label: string; placeholder: string }> = [
  {
    key: 'allergies',
    label: 'Allergies',
    placeholder: 'List medication, food, latex, or environmental allergies',
  },
  {
    key: 'medications',
    label: 'Current Medications',
    placeholder: 'List current medications and supplements',
  },
  {
    key: 'pastMedicalHistory',
    label: 'Past Medical History',
    placeholder: 'Past or ongoing conditions (eczema, psoriasis, skin cancer, etc.)',
  },
  {
    key: 'familyHistory',
    label: 'Family History',
    placeholder: 'Family history of melanoma, skin cancer, autoimmune disease, etc.',
  },
  {
    key: 'surgicalHistory',
    label: 'Surgical History',
    placeholder: 'Prior surgeries and approximate dates',
  },
  {
    key: 'socialHistory',
    label: 'Social History',
    placeholder: 'Smoking, alcohol, occupation, sun exposure, tanning bed history',
  },
  {
    key: 'currentSymptoms',
    label: "Today's Symptoms or Concerns",
    placeholder: 'Describe symptoms or concerns you want to discuss today',
  },
];

export function KioskMedicalHistoryPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState<MedicalHistoryData>({});
  const [profilePhotoDataUrl, setProfilePhotoDataUrl] = useState('');
  const [profilePhotoSavedUrl, setProfilePhotoSavedUrl] = useState('');
  const [isProfilePhotoDragOver, setIsProfilePhotoDragOver] = useState(false);
  const profileFileInputRef = useRef<HTMLInputElement | null>(null);
  const profileCameraInputRef = useRef<HTMLInputElement | null>(null);

  const sessionId = sessionStorage.getItem('kioskSessionId');

  useEffect(() => {
    if (!sessionId) {
      navigate('/kiosk');
      return;
    }

    fetchSessionData();
  }, [sessionId]);

  const fetchSessionData = async () => {
    try {
      const headers = await getKioskHeaders();
      const response = await fetch(`/api/kiosk/checkin/${sessionId}`, {
        headers,
      });

      if (!response.ok) {
        throw new Error('Failed to fetch session data');
      }

      const data = await response.json();
      const session = data.session || {};

      setFormData({
        allergies: session.allergies || '',
        medications: session.medications || '',
        pastMedicalHistory: session.past_medical_history || session.pastMedicalHistory || '',
        familyHistory: session.family_history || session.familyHistory || '',
        surgicalHistory: session.surgical_history || session.surgicalHistory || '',
        socialHistory: session.social_history || session.socialHistory || '',
        currentSymptoms: session.current_symptoms || session.currentSymptoms || '',
      });
    } catch (err) {
      setError('Unable to load medical history information.');
      console.error('Error fetching medical history:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTimeout = () => {
    sessionStorage.clear();
    navigate('/kiosk');
  };

  const handleBack = () => {
    navigate('/kiosk/insurance');
  };

  const handleChange = (field: keyof MedicalHistoryData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const noKnownAllergies = useMemo(() => {
    const value = (formData.allergies || '').trim().toLowerCase();
    return value === 'no known allergies' || value === 'nkda';
  }, [formData.allergies]);

  const toggleNoKnownAllergies = () => {
    if (noKnownAllergies) {
      handleChange('allergies', '');
      return;
    }
    handleChange('allergies', 'No known allergies');
  };

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Unable to read selected file'));
        }
      };
      reader.onerror = () => reject(new Error('Unable to read selected file'));
      reader.readAsDataURL(file);
    });

  const applyProfilePhotoFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    setProfilePhotoDataUrl(dataUrl);
    setProfilePhotoSavedUrl('');
    setIsProfilePhotoDragOver(false);
  };

  const handleProfilePhotoSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await applyProfilePhotoFile(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to read selected image');
    } finally {
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  const handleProfilePhotoDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsProfilePhotoDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    try {
      await applyProfilePhotoFile(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to read dropped image');
    }
  };

  const clearProfilePhoto = () => {
    setProfilePhotoDataUrl('');
    setProfilePhotoSavedUrl('');
    setIsProfilePhotoDragOver(false);
  };

  const uploadProfilePhotoIfNeeded = async () => {
    if (!profilePhotoDataUrl || profilePhotoSavedUrl) {
      return;
    }

    setUploadingPhoto(true);
    const headers = await getKioskHeaders();
    const response = await fetch(`/api/kiosk/checkin/${sessionId}/profile-photo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({
        photoData: profilePhotoDataUrl,
        photoType: 'clinical',
        description: 'Kiosk intake profile photo',
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to upload profile photo');
    }

    const payload = await response.json();
    setProfilePhotoSavedUrl(payload?.photo?.url || 'saved');
    setUploadingPhoto(false);
  };

  const handleContinue = async () => {
    setSaving(true);
    setError('');

    try {
      await uploadProfilePhotoIfNeeded();

      const headers = await getKioskHeaders();
      const response = await fetch(`/api/kiosk/checkin/${sessionId}/medical-history`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          ...formData,
          noKnownAllergies,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save medical history');
      }

      navigate('/kiosk/consent');
    } catch (err) {
      setError('Unable to save medical history. Please try again.');
      console.error('Error saving medical history:', err);
    } finally {
      setUploadingPhoto(false);
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <KioskLayout currentStep={4} totalSteps={7} stepName="Loading..." onTimeout={handleTimeout}>
        <div style={{ ...cardStyle, textAlign: 'center', padding: '3rem' }}>
          <div className="kiosk-spinner" style={{ margin: '0 auto 1rem' }} />
          <p style={{ fontSize: '1.5rem', color: '#4b5563' }}>Loading medical history...</p>
        </div>
      </KioskLayout>
    );
  }

  return (
    <KioskLayout currentStep={4} totalSteps={7} stepName="Medical History" onTimeout={handleTimeout}>
      <div style={cardStyle}>
        <h2 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', marginBottom: '1rem' }}>
          Medical History
        </h2>
        <p style={{ fontSize: '1.125rem', color: '#4b5563', marginBottom: '1.5rem' }}>
          Please update your medical history so your care team has current information.
        </p>

        <div className="kiosk-info-box">
          <p>You can leave any field blank if it does not apply.</p>
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label className="kiosk-form-label">Profile Photo (optional)</label>
          <input
            ref={profileFileInputRef}
            type="file"
            accept="image/*"
            onChange={handleProfilePhotoSelect}
            style={{ display: 'none' }}
          />
          <input
            ref={profileCameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleProfilePhotoSelect}
            style={{ display: 'none' }}
          />

          {profilePhotoDataUrl ? (
            <div
              style={{
                border: '2px solid #e5e7eb',
                borderRadius: '0.75rem',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.75rem',
              }}
            >
              <img
                src={profilePhotoDataUrl}
                alt="Profile preview"
                style={{ width: '180px', height: '180px', borderRadius: '0.75rem', objectFit: 'cover' }}
              />
              {profilePhotoSavedUrl && (
                <div style={{ color: '#166534', fontWeight: 600, fontSize: '0.95rem' }}>
                  Profile photo saved
                </div>
              )}
              <button type="button" className="kiosk-btn-secondary" onClick={clearProfilePhoto}>
                Remove Photo
              </button>
            </div>
          ) : (
            <div
              style={{
                border: `2px dashed ${isProfilePhotoDragOver ? '#7c3aed' : '#cbd5e1'}`,
                borderRadius: '0.75rem',
                padding: '1.5rem',
                textAlign: 'center',
                background: isProfilePhotoDragOver ? '#f5f3ff' : '#f8fafc',
                cursor: 'pointer',
              }}
              onClick={() => profileFileInputRef.current?.click()}
              onDragEnter={() => setIsProfilePhotoDragOver(true)}
              onDragOver={(e) => {
                e.preventDefault();
                setIsProfilePhotoDragOver(true);
              }}
              onDragLeave={() => setIsProfilePhotoDragOver(false)}
              onDrop={handleProfilePhotoDrop}
            >
              <p style={{ margin: 0, fontWeight: 600, color: '#1f2937' }}>Drag and drop a photo here</p>
              <p style={{ margin: '0.5rem 0 1rem', color: '#6b7280' }}>or choose an option below</p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="kiosk-btn-secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    profileFileInputRef.current?.click();
                  }}
                >
                  Upload Photo
                </button>
                <button
                  type="button"
                  className="kiosk-btn-secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    profileCameraInputRef.current?.click();
                  }}
                >
                  Take Photo
                </button>
              </div>
            </div>
          )}
        </div>

        {fields.map((field) => (
          <div key={field.key} style={formFieldStyle}>
            <label className="kiosk-form-label">{field.label}</label>
            <textarea
              value={formData[field.key] || ''}
              onChange={(e) => handleChange(field.key, e.target.value)}
              className="kiosk-form-input"
              style={textareaStyle}
              placeholder={field.placeholder}
            />
          </div>
        ))}

        <button
          type="button"
          onClick={toggleNoKnownAllergies}
          className="kiosk-btn-secondary"
          style={{ marginTop: '0.5rem' }}
        >
          {noKnownAllergies ? 'Clear "No known allergies"' : 'Mark as "No known allergies"'}
        </button>

        {error && <div className="kiosk-error" style={{ marginTop: '1.5rem' }}>{error}</div>}

        <div className="kiosk-nav-buttons">
          <button onClick={handleBack} className="kiosk-btn-secondary">
            Back
          </button>
          <button onClick={handleContinue} className="kiosk-btn-primary" style={{ flex: 1 }} disabled={saving || uploadingPhoto}>
            {saving || uploadingPhoto ? 'Saving...' : 'Save & Continue'}
          </button>
        </div>
      </div>
    </KioskLayout>
  );
}
