import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api';

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  insurance: string;
  allergies: string | null;
  medications: string | null;
  medicalHistory: string | null;
}

interface Appointment {
  id: string;
  scheduledStart: string;
  appointmentType: string;
  provider: string;
  status: string;
}

interface Encounter {
  id: string;
  date: string;
  chiefComplaint: string;
  assessment: string;
  provider: string;
}

export function FaceSheetPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [recentEncounters, setRecentEncounters] = useState<Encounter[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFaceSheetData();
  }, [patientId]);

  const loadFaceSheetData = async () => {
    if (!session || !patientId) return;

    try {
      setLoading(true);

      // Load patient data
      const patientRes = await api.get(`/api/patients/${patientId}`, {
        headers: { 'X-Tenant-ID': session.tenantId, Authorization: `Bearer ${session.accessToken}` },
      });
      setPatient(patientRes.data);

      // Load today's appointment if exists
      try {
        const appointmentsRes = await api.get(`/api/appointments`, {
          headers: { 'X-Tenant-ID': session.tenantId, Authorization: `Bearer ${session.accessToken}` },
          params: { patientId, status: 'scheduled,checked_in,in_room,with_provider' },
        });
        if (appointmentsRes.data.length > 0) {
          setAppointment(appointmentsRes.data[0]);
        }
      } catch (err) {
        // No appointment found, that's okay
      }

      // Load recent encounters
      try {
        const encountersRes = await api.get(`/api/encounters`, {
          headers: { 'X-Tenant-ID': session.tenantId, Authorization: `Bearer ${session.accessToken}` },
          params: { patientId, limit: 5 },
        });
        setRecentEncounters(encountersRes.data || []);
      } catch (err) {
        // No encounters found
      }
    } catch (error) {
      console.error('Failed to load face sheet data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const calculateAge = (dob: string) => {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading face sheet...</p>
        </div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-600 text-lg">Patient not found</p>
          <button
            onClick={() => navigate('/patients')}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Back to Patients
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Print Button - Hidden when printing */}
      <div className="no-print fixed top-4 right-4 z-50 flex gap-2">
        <button
          onClick={() => navigate(`/patients/${patientId}`)}
          className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
        >
          Back to Chart
        </button>
        <button
          onClick={handlePrint}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Print Face Sheet
        </button>
      </div>

      {/* Face Sheet Content */}
      <div className="face-sheet-container max-w-4xl mx-auto p-8 bg-white">
        {/* Header */}
        <div className="border-b-4 border-blue-600 pb-4 mb-6">
          <h1 className="text-3xl font-bold text-gray-900">PATIENT FACE SHEET</h1>
          <p className="text-gray-600 mt-1">Dermatology EHR System</p>
          <p className="text-sm text-gray-500 mt-1">Printed: {new Date().toLocaleString()}</p>
        </div>

        {/* Patient Demographics */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-3 border-b-2 border-gray-300 pb-2">
            PATIENT DEMOGRAPHICS
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600 font-semibold">Name:</p>
              <p className="text-lg font-bold">{patient.firstName} {patient.lastName}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 font-semibold">Date of Birth:</p>
              <p className="text-lg">{new Date(patient.dateOfBirth).toLocaleDateString()} (Age: {calculateAge(patient.dateOfBirth)})</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 font-semibold">Phone:</p>
              <p className="text-lg">{patient.phone}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 font-semibold">Email:</p>
              <p className="text-lg">{patient.email}</p>
            </div>
            <div className="col-span-2">
              <p className="text-sm text-gray-600 font-semibold">Address:</p>
              <p className="text-lg">{patient.address}</p>
              <p className="text-lg">{patient.city}, {patient.state} {patient.zip}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 font-semibold">Insurance:</p>
              <p className="text-lg">{patient.insurance || 'Self-pay'}</p>
            </div>
          </div>
        </div>

        {/* Appointment Info */}
        {appointment && (
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-3 border-b-2 border-gray-300 pb-2">
              TODAY'S APPOINTMENT
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600 font-semibold">Time:</p>
                <p className="text-lg">{new Date(appointment.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 font-semibold">Type:</p>
                <p className="text-lg">{appointment.appointmentType}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 font-semibold">Provider:</p>
                <p className="text-lg">{appointment.provider}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 font-semibold">Status:</p>
                <p className="text-lg capitalize">{appointment.status.replace('_', ' ')}</p>
              </div>
            </div>
          </div>
        )}

        {/* Allergies */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-red-600 mb-3 border-b-2 border-red-300 pb-2">
            ⚠️ ALLERGIES
          </h2>
          <div className="bg-red-50 p-4 rounded border-2 border-red-200">
            {patient.allergies ? (
              <p className="text-lg font-bold text-red-900">{patient.allergies}</p>
            ) : (
              <p className="text-lg text-gray-600">No known allergies</p>
            )}
          </div>
        </div>

        {/* Current Medications */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-3 border-b-2 border-gray-300 pb-2">
            CURRENT MEDICATIONS
          </h2>
          <div className="bg-blue-50 p-4 rounded border border-blue-200">
            {patient.medications ? (
              <p className="text-lg">{patient.medications}</p>
            ) : (
              <p className="text-lg text-gray-600">No current medications</p>
            )}
          </div>
        </div>

        {/* Medical History */}
        {patient.medicalHistory && (
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-3 border-b-2 border-gray-300 pb-2">
              MEDICAL HISTORY
            </h2>
            <div className="bg-gray-50 p-4 rounded border border-gray-200">
              <p className="text-lg whitespace-pre-wrap">{patient.medicalHistory}</p>
            </div>
          </div>
        )}

        {/* Recent Encounters */}
        {recentEncounters.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-3 border-b-2 border-gray-300 pb-2">
              RECENT VISITS (Last 5)
            </h2>
            <div className="space-y-3">
              {recentEncounters.map((encounter) => (
                <div key={encounter.id} className="border border-gray-200 p-3 rounded bg-gray-50">
                  <div className="flex justify-between items-start mb-2">
                    <p className="font-semibold text-gray-900">
                      {new Date(encounter.date).toLocaleDateString()}
                    </p>
                    <p className="text-sm text-gray-600">{encounter.provider}</p>
                  </div>
                  <p className="text-sm text-gray-700 mb-1">
                    <span className="font-semibold">Chief Complaint:</span> {encounter.chiefComplaint}
                  </p>
                  {encounter.assessment && (
                    <p className="text-sm text-gray-700">
                      <span className="font-semibold">Assessment:</span> {encounter.assessment}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Clinical Notes Section (Blank for provider to write) */}
        <div className="mb-6 page-break-before">
          <h2 className="text-xl font-bold text-gray-900 mb-3 border-b-2 border-gray-300 pb-2">
            CLINICAL NOTES
          </h2>
          <div className="border border-gray-300 rounded p-4 min-h-64 bg-white">
            <div className="space-y-8">
              <div>
                <p className="font-semibold mb-2">Chief Complaint:</p>
                <div className="border-b border-gray-300 pb-2 min-h-12"></div>
              </div>
              <div>
                <p className="font-semibold mb-2">Assessment:</p>
                <div className="border-b border-gray-300 pb-2 min-h-16"></div>
              </div>
              <div>
                <p className="font-semibold mb-2">Plan:</p>
                <div className="border-b border-gray-300 pb-2 min-h-16"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t-2 border-gray-300 pt-4 mt-8 text-center text-sm text-gray-600">
          <p>This face sheet is for clinical use only and contains confidential patient information.</p>
          <p className="mt-1">HIPAA Protected Health Information - Handle Appropriately</p>
        </div>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          .no-print {
            display: none !important;
          }

          .face-sheet-container {
            max-width: 100% !important;
            padding: 0.5in !important;
            margin: 0 !important;
          }

          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }

          .page-break-before {
            page-break-before: always;
          }

          @page {
            margin: 0.5in;
          }
        }
      `}</style>
    </>
  );
}

export default FaceSheetPage;
