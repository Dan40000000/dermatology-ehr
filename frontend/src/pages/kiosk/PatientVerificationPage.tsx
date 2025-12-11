import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KioskLayout } from '../../components/kiosk/KioskLayout';

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  dob: string;
  phone?: string;
  email?: string;
}

export function KioskPatientVerificationPage() {
  const navigate = useNavigate();
  const [method, setMethod] = useState<'dob' | 'phone' | 'mrn'>('dob');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('');
  const [phone, setPhone] = useState('');
  const [mrn, setMrn] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [showPatientList, setShowPatientList] = useState(false);

  const handleTimeout = () => {
    navigate('/kiosk');
  };

  const handleBack = () => {
    navigate('/kiosk');
  };

  const verifyPatient = async () => {
    setError('');
    setLoading(true);

    try {
      const body: any = { method, lastName };

      if (method === 'dob') {
        if (!dob) {
          setError('Please enter your date of birth');
          setLoading(false);
          return;
        }
        body.dob = dob;
      } else if (method === 'phone') {
        if (!phone) {
          setError('Please enter your phone number');
          setLoading(false);
          return;
        }
        body.phone = phone;
      } else if (method === 'mrn') {
        if (!mrn) {
          setError('Please enter your medical record number');
          setLoading(false);
          return;
        }
        body.mrn = mrn;
      }

      const response = await fetch('/api/kiosk/verify-patient', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Kiosk-Code': localStorage.getItem('kioskCode') || 'KIOSK-001',
          'X-Tenant-Id': localStorage.getItem('tenantId') || 'modmed-demo',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Patient not found');
      }

      const data = await response.json();

      if (data.patients && data.patients.length > 0) {
        setPatients(data.patients);
        if (data.patients.length === 1) {
          // Only one match, proceed directly
          selectPatient(data.patients[0]);
        } else {
          // Multiple matches, show selection
          setShowPatientList(true);
        }
      } else {
        setError('No patient found with the provided information. Please try again or see the front desk.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const selectPatient = (patient: Patient) => {
    // Store patient info and navigate to appointment selection
    sessionStorage.setItem('kioskPatientId', patient.id);
    sessionStorage.setItem('kioskPatientName', `${patient.firstName} ${patient.lastName}`);
    navigate('/kiosk/appointment');
  };

  const NumberPad = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
    const buttons = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Clear', '0', 'Delete'];

    const handleClick = (btn: string) => {
      if (btn === 'Clear') {
        onChange('');
      } else if (btn === 'Delete') {
        onChange(value.slice(0, -1));
      } else {
        onChange(value + btn);
      }
    };

    return (
      <div className="grid grid-cols-3 gap-3 mt-6">
        {buttons.map((btn) => (
          <button
            key={btn}
            onClick={() => handleClick(btn)}
            className={`py-6 text-2xl font-semibold rounded-lg ${
              btn === 'Clear' || btn === 'Delete'
                ? 'bg-red-100 text-red-700 hover:bg-red-200'
                : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
            }`}
          >
            {btn}
          </button>
        ))}
      </div>
    );
  };

  if (showPatientList) {
    return (
      <KioskLayout currentStep={0} totalSteps={6} stepName="Select Your Profile" onTimeout={handleTimeout}>
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">Select Your Profile</h2>
          <p className="text-xl text-gray-600 mb-8">
            We found multiple patients with that information. Please select your profile:
          </p>

          <div className="space-y-4">
            {patients.map((patient) => (
              <button
                key={patient.id}
                onClick={() => selectPatient(patient)}
                className="w-full p-6 bg-gray-50 hover:bg-purple-50 border-2 border-gray-200 hover:border-purple-400 rounded-xl text-left transition-all"
              >
                <div className="text-2xl font-semibold text-gray-900">
                  {patient.firstName} {patient.lastName}
                </div>
                <div className="text-lg text-gray-600 mt-2">
                  DOB: {new Date(patient.dob).toLocaleDateString()}
                </div>
                {patient.phone && <div className="text-lg text-gray-600">Phone: {patient.phone}</div>}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowPatientList(false)}
            className="mt-8 w-full py-4 text-xl font-medium text-gray-700 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Go Back
          </button>
        </div>
      </KioskLayout>
    );
  }

  return (
    <KioskLayout currentStep={0} totalSteps={6} stepName="Find Your Appointment" onTimeout={handleTimeout}>
      <div className="bg-white rounded-2xl shadow-xl p-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-6">Find Your Appointment</h2>
        <p className="text-xl text-gray-600 mb-8">
          Please provide your information to check in for your appointment.
        </p>

        {/* Method selection */}
        <div className="mb-8">
          <label className="block text-lg font-medium text-gray-700 mb-4">How would you like to verify?</label>
          <div className="grid grid-cols-3 gap-4">
            <button
              onClick={() => setMethod('dob')}
              className={`py-4 text-lg font-medium rounded-lg ${
                method === 'dob'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Date of Birth
            </button>
            <button
              onClick={() => setMethod('phone')}
              className={`py-4 text-lg font-medium rounded-lg ${
                method === 'phone'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Phone Number
            </button>
            <button
              onClick={() => setMethod('mrn')}
              className={`py-4 text-lg font-medium rounded-lg ${
                method === 'mrn'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              MRN
            </button>
          </div>
        </div>

        {/* Last Name (required for DOB and Phone methods) */}
        {(method === 'dob' || method === 'phone') && (
          <div className="mb-6">
            <label className="block text-lg font-medium text-gray-700 mb-3">Last Name</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full px-6 py-4 text-2xl border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
              placeholder="Enter your last name"
            />
          </div>
        )}

        {/* Date of Birth */}
        {method === 'dob' && (
          <div className="mb-6">
            <label className="block text-lg font-medium text-gray-700 mb-3">
              Date of Birth (MM/DD/YYYY)
            </label>
            <input
              type="text"
              value={dob}
              readOnly
              className="w-full px-6 py-4 text-2xl border-2 border-gray-300 rounded-lg bg-gray-50"
              placeholder="MM/DD/YYYY"
            />
            <NumberPad value={dob} onChange={setDob} />
          </div>
        )}

        {/* Phone Number */}
        {method === 'phone' && (
          <div className="mb-6">
            <label className="block text-lg font-medium text-gray-700 mb-3">Phone Number</label>
            <input
              type="text"
              value={phone}
              readOnly
              className="w-full px-6 py-4 text-2xl border-2 border-gray-300 rounded-lg bg-gray-50"
              placeholder="Enter your phone number"
            />
            <NumberPad value={phone} onChange={setPhone} />
          </div>
        )}

        {/* MRN */}
        {method === 'mrn' && (
          <div className="mb-6">
            <label className="block text-lg font-medium text-gray-700 mb-3">
              Medical Record Number
            </label>
            <input
              type="text"
              value={mrn}
              onChange={(e) => setMrn(e.target.value)}
              className="w-full px-6 py-4 text-2xl border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
              placeholder="Enter your MRN"
            />
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border-2 border-red-200 rounded-lg">
            <p className="text-lg text-red-800">{error}</p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-4 mt-8">
          <button
            onClick={handleBack}
            className="flex-1 py-5 text-xl font-medium text-gray-700 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Back
          </button>
          <button
            onClick={verifyPatient}
            disabled={loading || !lastName && method !== 'mrn'}
            className="flex-1 py-5 text-xl font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Searching...' : 'Continue'}
          </button>
        </div>
      </div>
    </KioskLayout>
  );
}
