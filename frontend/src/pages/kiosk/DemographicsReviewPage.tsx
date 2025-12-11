import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { KioskLayout } from '../../components/kiosk/KioskLayout';

interface PatientData {
  firstName: string;
  lastName: string;
  dob: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
}

export function KioskDemographicsReviewPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [patientData, setPatientData] = useState<PatientData | null>(null);
  const [editedData, setEditedData] = useState<Partial<PatientData>>({});

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
      setPatientData({
        firstName: data.session.patientFirstName,
        lastName: data.session.patientLastName,
        dob: data.session.dob,
        phone: data.session.phone,
        email: data.session.email,
        address: data.session.address,
        city: data.session.city,
        state: data.session.state,
        zip: data.session.zip,
        emergencyContactName: data.session.emergencyContactName,
        emergencyContactPhone: data.session.emergencyContactPhone,
      });
    } catch (err) {
      setError('Unable to load your information. Please see the front desk.');
      console.error('Error fetching session:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTimeout = () => {
    sessionStorage.clear();
    navigate('/kiosk');
  };

  const handleBack = () => {
    navigate('/kiosk/appointment');
  };

  const handleEdit = () => {
    setIsEditing(true);
    setEditedData({ ...patientData });
  };

  const handleChange = (field: keyof PatientData, value: string) => {
    setEditedData({ ...editedData, [field]: value });
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');

    try {
      const response = await fetch(`/api/kiosk/checkin/${sessionId}/demographics`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Kiosk-Code': localStorage.getItem('kioskCode') || 'KIOSK-001',
          'X-Tenant-Id': localStorage.getItem('tenantId') || 'modmed-demo',
        },
        body: JSON.stringify(editedData),
      });

      if (!response.ok) {
        throw new Error('Failed to update demographics');
      }

      navigate('/kiosk/insurance');
    } catch (err) {
      setError('Unable to save changes. Please try again.');
      console.error('Error saving demographics:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleContinue = async () => {
    // No changes, just mark as reviewed and continue
    try {
      await fetch(`/api/kiosk/checkin/${sessionId}/demographics`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Kiosk-Code': localStorage.getItem('kioskCode') || 'KIOSK-001',
          'X-Tenant-Id': localStorage.getItem('tenantId') || 'modmed-demo',
        },
        body: JSON.stringify({}), // No changes
      });
    } catch (err) {
      console.error('Error marking demographics as reviewed:', err);
    }

    navigate('/kiosk/insurance');
  };

  if (loading) {
    return (
      <KioskLayout currentStep={2} totalSteps={6} stepName="Loading..." onTimeout={handleTimeout}>
        <div className="bg-white rounded-2xl shadow-xl p-12 text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-purple-600 mx-auto mb-4"></div>
          <p className="text-2xl text-gray-600">Loading your information...</p>
        </div>
      </KioskLayout>
    );
  }

  if (!patientData) {
    return null;
  }

  return (
    <KioskLayout currentStep={2} totalSteps={6} stepName="Review Information" onTimeout={handleTimeout}>
      <div className="bg-white rounded-2xl shadow-xl p-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">Review Your Information</h2>
        <p className="text-xl text-gray-600 mb-8">
          Please verify that your contact information is correct.
        </p>

        {!isEditing ? (
          <div className="space-y-6 mb-8">
            <div className="grid grid-cols-2 gap-6">
              <InfoField label="First Name" value={patientData.firstName} />
              <InfoField label="Last Name" value={patientData.lastName} />
              <InfoField label="Date of Birth" value={new Date(patientData.dob).toLocaleDateString()} />
              <InfoField label="Phone" value={patientData.phone || 'Not provided'} />
              <InfoField label="Email" value={patientData.email || 'Not provided'} />
            </div>

            <div className="pt-4 border-t border-gray-200">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Address</h3>
              <div className="grid grid-cols-2 gap-6">
                <InfoField label="Street Address" value={patientData.address || 'Not provided'} className="col-span-2" />
                <InfoField label="City" value={patientData.city || 'Not provided'} />
                <InfoField label="State" value={patientData.state || 'Not provided'} />
                <InfoField label="ZIP Code" value={patientData.zip || 'Not provided'} />
              </div>
            </div>

            <div className="pt-4 border-t border-gray-200">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Emergency Contact</h3>
              <div className="grid grid-cols-2 gap-6">
                <InfoField label="Name" value={patientData.emergencyContactName || 'Not provided'} />
                <InfoField label="Phone" value={patientData.emergencyContactPhone || 'Not provided'} />
              </div>
            </div>

            <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-6 mt-8">
              <p className="text-xl font-medium text-purple-900 text-center">
                Is this information correct?
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6 mb-8">
            <div className="grid grid-cols-2 gap-6">
              <EditField
                label="Phone"
                value={editedData.phone || ''}
                onChange={(v) => handleChange('phone', v)}
                placeholder="(555) 123-4567"
              />
              <EditField
                label="Email"
                value={editedData.email || ''}
                onChange={(v) => handleChange('email', v)}
                placeholder="your.email@example.com"
              />
            </div>

            <div className="pt-4 border-t border-gray-200">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Address</h3>
              <div className="grid grid-cols-2 gap-6">
                <EditField
                  label="Street Address"
                  value={editedData.address || ''}
                  onChange={(v) => handleChange('address', v)}
                  className="col-span-2"
                />
                <EditField label="City" value={editedData.city || ''} onChange={(v) => handleChange('city', v)} />
                <EditField label="State" value={editedData.state || ''} onChange={(v) => handleChange('state', v)} />
                <EditField label="ZIP Code" value={editedData.zip || ''} onChange={(v) => handleChange('zip', v)} />
              </div>
            </div>

            <div className="pt-4 border-t border-gray-200">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Emergency Contact</h3>
              <div className="grid grid-cols-2 gap-6">
                <EditField
                  label="Name"
                  value={editedData.emergencyContactName || ''}
                  onChange={(v) => handleChange('emergencyContactName', v)}
                />
                <EditField
                  label="Phone"
                  value={editedData.emergencyContactPhone || ''}
                  onChange={(v) => handleChange('emergencyContactPhone', v)}
                />
              </div>
            </div>
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
          {!isEditing ? (
            <>
              <button
                onClick={handleEdit}
                className="flex-1 py-5 text-xl font-medium text-purple-600 bg-purple-50 border-2 border-purple-300 rounded-lg hover:bg-purple-100"
              >
                Update Information
              </button>
              <button
                onClick={handleContinue}
                className="flex-1 py-5 text-xl font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700"
              >
                Looks Good
              </button>
            </>
          ) : (
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
          )}
        </div>
      </div>
    </KioskLayout>
  );
}

function InfoField({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <div className="text-sm font-medium text-gray-600 mb-1">{label}</div>
      <div className="text-xl text-gray-900">{value}</div>
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
  placeholder = '',
  className = '',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-3 text-lg border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
      />
    </div>
  );
}
