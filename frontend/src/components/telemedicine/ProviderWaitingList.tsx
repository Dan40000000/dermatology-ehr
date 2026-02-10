import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchVideoWaitingRoom, callNextVideoPatient, type VideoWaitingQueueEntry } from '../../api';
import { Button } from '../ui/Button';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import '../../styles/telehealth.css';

interface ProviderWaitingListProps {
  onPatientSelect: (sessionId: number) => void;
}

const ProviderWaitingList: React.FC<ProviderWaitingListProps> = ({ onPatientSelect }) => {
  const { session } = useAuth();
  const tenantId = session?.tenantId;
  const accessToken = session?.accessToken;

  const [waitingPatients, setWaitingPatients] = useState<VideoWaitingQueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadWaitingPatients();

    // Refresh every 10 seconds
    const interval = setInterval(loadWaitingPatients, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadWaitingPatients = async () => {
    if (!tenantId || !accessToken) {
      setLoading(false);
      return;
    }

    try {
      const patients = await fetchVideoWaitingRoom(tenantId, accessToken);
      setWaitingPatients(patients);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load waiting patients:', err);
      setError('Failed to load waiting room');
      setLoading(false);
    }
  };

  const handleCallNext = async () => {
    if (!tenantId || !accessToken) return;

    try {
      const nextPatient = await callNextVideoPatient(tenantId, accessToken);
      if (nextPatient) {
        onPatientSelect(nextPatient.session_id);
      }
    } catch (err) {
      console.error('Failed to call next patient:', err);
    }
  };

  const handleCallPatient = (queueEntry: VideoWaitingQueueEntry) => {
    onPatientSelect(queueEntry.session_id);
  };

  const getDeviceStatusIcon = (working: boolean | undefined) => {
    if (working === true) {
      return (
        <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      );
    }
    if (working === false) {
      return (
        <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      );
    }
    return (
      <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  };

  const getWaitTime = (joinedAt: string) => {
    const joined = new Date(joinedAt);
    const now = new Date();
    const diffMs = now.getTime() - joined.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just joined';
    if (diffMins === 1) return '1 minute';
    return `${diffMins} minutes`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ready':
        return (
          <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
            Ready
          </span>
        );
      case 'waiting':
        return (
          <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
            Waiting
          </span>
        );
      case 'called':
        return (
          <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
            Called
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">
            {status}
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner size="medium" />
          <span className="ml-3 text-gray-600">Loading waiting room...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="text-center py-8 text-red-600">
          <p>{error}</p>
          <Button onClick={loadWaitingPatients} variant="secondary" size="sm" className="mt-4">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 bg-gray-50 border-b flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Waiting Room</h2>
          <p className="text-sm text-gray-500">
            {waitingPatients.length} patient{waitingPatients.length !== 1 ? 's' : ''} waiting
          </p>
        </div>
        {waitingPatients.length > 0 && (
          <Button onClick={handleCallNext} variant="primary">
            Call Next Patient
          </Button>
        )}
      </div>

      {/* Patient List */}
      {waitingPatients.length === 0 ? (
        <div className="p-8 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Patients Waiting</h3>
          <p className="text-gray-500">Patients will appear here when they join the waiting room</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-200">
          {waitingPatients.map((patient, index) => (
            <div
              key={patient.id}
              className={`p-4 hover:bg-gray-50 transition-colors ${
                patient.status === 'ready' ? 'bg-green-50' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  {/* Queue Position */}
                  <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                    <span className="text-indigo-600 font-bold">{index + 1}</span>
                  </div>

                  {/* Patient Info */}
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="font-medium text-gray-900">
                        {patient.patient_first_name} {patient.patient_last_name}
                      </h3>
                      {getStatusBadge(patient.status)}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      Waiting for {getWaitTime(patient.joined_queue_at)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-6">
                  {/* Device Check Status */}
                  <div className="flex items-center space-x-3">
                    <div className="flex items-center space-x-1" title="Camera">
                      <svg
                        className="w-4 h-4 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                      </svg>
                      {getDeviceStatusIcon(patient.camera_working)}
                    </div>
                    <div className="flex items-center space-x-1" title="Microphone">
                      <svg
                        className="w-4 h-4 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                        />
                      </svg>
                      {getDeviceStatusIcon(patient.microphone_working)}
                    </div>
                    <div className="flex items-center space-x-1" title="Internet">
                      <svg
                        className="w-4 h-4 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"
                        />
                      </svg>
                      {getDeviceStatusIcon(patient.bandwidth_check_passed)}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center space-x-2">
                    <Button
                      onClick={() => handleCallPatient(patient)}
                      variant={patient.status === 'ready' ? 'primary' : 'secondary'}
                      size="sm"
                    >
                      Start Visit
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Auto-refresh indicator */}
      <div className="px-6 py-3 bg-gray-50 border-t text-center text-xs text-gray-500">
        Auto-refreshing every 10 seconds
      </div>
    </div>
  );
};

export default ProviderWaitingList;
