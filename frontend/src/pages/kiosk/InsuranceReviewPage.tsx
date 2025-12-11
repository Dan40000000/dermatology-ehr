import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { KioskLayout } from '../../components/kiosk/KioskLayout';

interface InsuranceData {
  insurance?: string;
  insuranceMemberId?: string;
  insuranceGroupNumber?: string;
  insurancePlanName?: string;
}

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

      // Upload photo
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
        <div className="bg-white rounded-2xl shadow-xl p-12 text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-purple-600 mx-auto mb-4"></div>
          <p className="text-2xl text-gray-600">Loading insurance information...</p>
        </div>
      </KioskLayout>
    );
  }

  if (capturingSide) {
    return (
      <KioskLayout currentStep={3} totalSteps={6} stepName="Capture Insurance Card" onTimeout={handleTimeout}>
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">
            Capture {capturingSide === 'front' ? 'Front' : 'Back'} of Card
          </h2>

          <div className="relative mb-6">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full rounded-lg border-4 border-gray-300"
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="border-4 border-purple-500 rounded-lg" style={{ width: '80%', height: '60%' }}>
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-purple-500"></div>
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-purple-500"></div>
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-purple-500"></div>
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-purple-500"></div>
              </div>
            </div>
          </div>

          <p className="text-xl text-gray-600 mb-6 text-center">
            Position your insurance card within the frame
          </p>

          <div className="flex gap-4">
            <button
              onClick={stopCamera}
              className="flex-1 py-5 text-xl font-medium text-gray-700 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={capturePhoto}
              disabled={uploadingPhoto}
              className="flex-1 py-5 text-xl font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50"
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
      <div className="bg-white rounded-2xl shadow-xl p-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">Review Insurance Information</h2>
        <p className="text-xl text-gray-600 mb-8">
          Please verify your insurance information is up to date.
        </p>

        {!isEditing && !useCamera ? (
          <>
            <div className="space-y-4 mb-8">
              <InfoField label="Insurance Provider" value={insuranceData.insurance || 'Not provided'} />
              <InfoField label="Member ID" value={insuranceData.insuranceMemberId || 'Not provided'} />
              <InfoField label="Group Number" value={insuranceData.insuranceGroupNumber || 'Not provided'} />
              <InfoField label="Plan Name" value={insuranceData.insurancePlanName || 'Not provided'} />
            </div>

            {(frontPhoto || backPhoto) && (
              <div className="mb-8">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Insurance Card Photos</h3>
                <div className="grid grid-cols-2 gap-4">
                  {frontPhoto && (
                    <div>
                      <p className="text-sm text-gray-600 mb-2">Front</p>
                      <img src={frontPhoto} alt="Front of insurance card" className="rounded-lg border-2 border-gray-300" />
                    </div>
                  )}
                  {backPhoto && (
                    <div>
                      <p className="text-sm text-gray-600 mb-2">Back</p>
                      <img src={backPhoto} alt="Back of insurance card" className="rounded-lg border-2 border-gray-300" />
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-6 mb-8">
              <p className="text-xl font-medium text-purple-900 text-center">
                Is your insurance information correct?
              </p>
            </div>
          </>
        ) : isEditing ? (
          <div className="space-y-6 mb-8">
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
          <div className="space-y-6 mb-8">
            <p className="text-xl text-gray-700 text-center mb-6">
              You can take photos of both sides of your insurance card
            </p>

            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => startCamera('front')}
                className="py-12 bg-purple-50 border-2 border-purple-300 rounded-lg hover:bg-purple-100 text-center"
              >
                <div className="text-6xl mb-2">📷</div>
                <div className="text-xl font-semibold text-purple-900">
                  {frontPhoto ? 'Retake Front' : 'Capture Front'}
                </div>
              </button>
              <button
                onClick={() => startCamera('back')}
                className="py-12 bg-purple-50 border-2 border-purple-300 rounded-lg hover:bg-purple-100 text-center"
              >
                <div className="text-6xl mb-2">📷</div>
                <div className="text-xl font-semibold text-purple-900">
                  {backPhoto ? 'Retake Back' : 'Capture Back'}
                </div>
              </button>
            </div>

            {(frontPhoto || backPhoto) && (
              <button
                onClick={() => setUseCamera(false)}
                className="w-full py-4 text-lg font-medium text-purple-600 bg-white border-2 border-purple-300 rounded-lg hover:bg-purple-50"
              >
                Done with Photos
              </button>
            )}
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 border-2 border-red-200 rounded-lg">
            <p className="text-lg text-red-800">{error}</p>
          </div>
        )}

        <div className="flex gap-4">
          <button
            onClick={handleBack}
            className="flex-1 py-5 text-xl font-medium text-gray-700 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Back
          </button>
          {!isEditing && !useCamera ? (
            <>
              <button
                onClick={() => setUseCamera(true)}
                className="flex-1 py-5 text-xl font-medium text-purple-600 bg-purple-50 border-2 border-purple-300 rounded-lg hover:bg-purple-100"
              >
                Take Photo
              </button>
              <button
                onClick={handleEdit}
                className="flex-1 py-5 text-xl font-medium text-purple-600 bg-purple-50 border-2 border-purple-300 rounded-lg hover:bg-purple-100"
              >
                Update Info
              </button>
              <button
                onClick={handleContinue}
                className="flex-1 py-5 text-xl font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700"
              >
                Continue
              </button>
            </>
          ) : isEditing ? (
            <>
              <button
                onClick={() => setIsEditing(false)}
                className="flex-1 py-5 text-xl font-medium text-gray-700 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-5 text-xl font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save & Continue'}
              </button>
            </>
          ) : (
            <button
              onClick={() => setUseCamera(false)}
              className="flex-1 py-5 text-xl font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700"
            >
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
      <div className="text-sm font-medium text-gray-600 mb-1">{label}</div>
      <div className="text-xl text-gray-900">{value}</div>
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
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-3 text-lg border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
      />
    </div>
  );
}
