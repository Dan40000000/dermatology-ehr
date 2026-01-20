/**
 * BatchEligibility Component
 *
 * Allows batch verification of insurance eligibility for multiple patients
 * Useful for verifying tomorrow's patients or patients with upcoming appointments
 */

import React, { useState, useEffect } from 'react';
import { CheckSquare, AlertTriangle, Download, RefreshCw, Clock, Users, CheckCircle, XCircle } from 'lucide-react';
import { api } from '../../api';

interface BatchEligibilityProps {
  preselectedPatientIds?: string[];
  onComplete?: (results: any) => void;
}

interface Patient {
  id: string;
  fullName: string;
  insuranceProvider?: string;
  nextAppointment?: string;
}

interface BatchResult {
  batchRunId: string;
  totalPatients: number;
  verifiedCount: number;
  activeCount: number;
  inactiveCount: number;
  errorCount: number;
  issueCount: number;
  results: Array<{
    id: string;
    patientId: string;
    verificationStatus: string;
    hasIssues: boolean;
    issueNotes?: string;
    payerName: string;
  }>;
}

export const BatchEligibility: React.FC<BatchEligibilityProps> = ({
  preselectedPatientIds,
  onComplete,
}) => {
  const [availablePatients, setAvailablePatients] = useState<Patient[]>([]);
  const [selectedPatientIds, setSelectedPatientIds] = useState<Set<string>>(
    new Set(preselectedPatientIds || [])
  );
  const [loading, setLoading] = useState(false);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'select' | 'results'>('select');

  useEffect(() => {
    if (!preselectedPatientIds || preselectedPatientIds.length === 0) {
      loadPatientsNeedingVerification();
    }
  }, []);

  const loadPatientsNeedingVerification = async () => {
    setLoadingPatients(true);
    try {
      const response = await api.get('/api/eligibility/pending?daysThreshold=30');
      if (response.data.success) {
        setAvailablePatients(
          response.data.patients.map((p: any) => ({
            id: p.patient_id,
            fullName: p.patient_name,
            nextAppointment: p.upcoming_appointment_date,
          }))
        );
      }
    } catch (err) {
      console.error('Error loading patients:', err);
    } finally {
      setLoadingPatients(false);
    }
  };

  const verifyTomorrowsPatients = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.post('/api/eligibility/batch/tomorrow');
      if (response.data.success) {
        setBatchResult(response.data.batch);
        setView('results');
        onComplete?.(response.data.batch);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to verify tomorrow\'s patients');
    } finally {
      setLoading(false);
    }
  };

  const verifySelectedPatients = async () => {
    if (selectedPatientIds.size === 0) {
      alert('Please select at least one patient');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await api.post('/api/eligibility/batch', {
        patientIds: Array.from(selectedPatientIds),
        batchName: `Manual Batch - ${new Date().toLocaleDateString()}`,
      });

      if (response.data.success) {
        setBatchResult(response.data.batch);
        setView('results');
        onComplete?.(response.data.batch);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to verify patients');
    } finally {
      setLoading(false);
    }
  };

  const togglePatientSelection = (patientId: string) => {
    const newSet = new Set(selectedPatientIds);
    if (newSet.has(patientId)) {
      newSet.delete(patientId);
    } else {
      newSet.add(patientId);
    }
    setSelectedPatientIds(newSet);
  };

  const selectAll = () => {
    setSelectedPatientIds(new Set(availablePatients.map(p => p.id)));
  };

  const deselectAll = () => {
    setSelectedPatientIds(new Set());
  };

  const exportIssues = () => {
    if (!batchResult) return;

    const issuesOnly = batchResult.results.filter(r => r.hasIssues);
    const csvContent = [
      ['Patient ID', 'Payer', 'Status', 'Issues'],
      ...issuesOnly.map(r => [
        r.patientId,
        r.payerName,
        r.verificationStatus,
        r.issueNotes || 'N/A',
      ]),
    ]
      .map(row => row.join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `insurance-issues-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  if (view === 'results' && batchResult) {
    return (
      <div className="bg-white rounded-lg shadow border border-gray-200">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <h2 className="text-xl font-semibold text-gray-900">Batch Verification Complete</h2>
            </div>
            <button
              onClick={() => {
                setView('select');
                setBatchResult(null);
              }}
              className="text-blue-600 hover:text-blue-700 text-sm font-medium"
            >
              New Batch
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="p-6 bg-gray-50 border-b border-gray-200">
          <div className="grid grid-cols-5 gap-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-gray-900">{batchResult.totalPatients}</p>
              <p className="text-sm text-gray-600">Total</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-green-600">{batchResult.activeCount}</p>
              <p className="text-sm text-gray-600">Active</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-red-600">{batchResult.inactiveCount}</p>
              <p className="text-sm text-gray-600">Inactive</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-yellow-600">{batchResult.issueCount}</p>
              <p className="text-sm text-gray-600">Issues</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-gray-600">{batchResult.errorCount}</p>
              <p className="text-sm text-gray-600">Errors</p>
            </div>
          </div>
        </div>

        {/* Results Table */}
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Verification Results</h3>
            {batchResult.issueCount > 0 && (
              <button
                onClick={exportIssues}
                className="flex items-center space-x-2 text-blue-600 hover:text-blue-700"
              >
                <Download className="w-4 h-4" />
                <span className="text-sm font-medium">Export Issues</span>
              </button>
            )}
          </div>

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Patient</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Payer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Issues</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {batchResult.results.map((result) => (
                  <tr key={result.id} className={result.hasIssues ? 'bg-red-50' : ''}>
                    <td className="px-4 py-3 text-sm text-gray-900">{result.patientId}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{result.payerName}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        result.verificationStatus === 'active'
                          ? 'bg-green-100 text-green-800'
                          : result.verificationStatus === 'inactive' || result.verificationStatus === 'terminated'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {result.verificationStatus.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {result.hasIssues ? (
                        <div className="flex items-start space-x-2">
                          <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                          <span className="text-red-800 text-xs">{result.issueNotes || 'Issue detected'}</span>
                        </div>
                      ) : (
                        <span className="text-gray-500">None</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Users className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900">Batch Eligibility Verification</h2>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-50 border-b border-red-200">
          <div className="flex items-start space-x-2">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
            <div>
              <p className="text-red-800 font-medium">Verification Error</p>
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="p-6 bg-gray-50 border-b border-gray-200">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Quick Actions</h3>
        <div className="flex space-x-3">
          <button
            onClick={verifyTomorrowsPatients}
            disabled={loading}
            className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
          >
            <Clock className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Verify Tomorrow's Patients</span>
          </button>
          <button
            onClick={loadPatientsNeedingVerification}
            disabled={loadingPatients}
            className="flex items-center space-x-2 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 disabled:bg-gray-100"
          >
            <RefreshCw className={`w-4 h-4 ${loadingPatients ? 'animate-spin' : ''}`} />
            <span>Load Patients Needing Verification</span>
          </button>
        </div>
      </div>

      {/* Patient Selection */}
      {availablePatients.length > 0 && (
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">
              Select Patients ({selectedPatientIds.size} selected)
            </h3>
            <div className="flex space-x-2">
              <button
                onClick={selectAll}
                className="text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                Select All
              </button>
              <button
                onClick={deselectAll}
                className="text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                Deselect All
              </button>
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg max-h-96 overflow-y-auto">
            {loadingPatients ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-gray-600 mt-4">Loading patients...</p>
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="w-12 px-4 py-3"></th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Patient</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Insurance</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Next Appointment</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {availablePatients.map((patient) => (
                    <tr
                      key={patient.id}
                      onClick={() => togglePatientSelection(patient.id)}
                      className="cursor-pointer hover:bg-gray-50"
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedPatientIds.has(patient.id)}
                          onChange={() => togglePatientSelection(patient.id)}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">{patient.fullName}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{patient.insuranceProvider || 'N/A'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {patient.nextAppointment
                          ? new Date(patient.nextAppointment).toLocaleDateString()
                          : 'None'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="mt-4 flex justify-end">
            <button
              onClick={verifySelectedPatients}
              disabled={loading || selectedPatientIds.size === 0}
              className="flex items-center space-x-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>
                {loading ? 'Verifying...' : `Verify ${selectedPatientIds.size} Patient${selectedPatientIds.size !== 1 ? 's' : ''}`}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
