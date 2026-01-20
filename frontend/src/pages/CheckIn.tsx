/**
 * Patient Check-In Page
 *
 * Streamlined check-in flow that:
 * 1. Displays patient insurance eligibility status
 * 2. Shows estimated copay and patient responsibility
 * 3. Allows copay collection
 * 4. Refreshes stale eligibility
 * 5. Allows insurance updates
 * 6. Completes check-in and updates appointment status
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CoverageSummaryCard, InsuranceStatusBadge } from '../components/insurance';
import { toast } from 'react-hot-toast';

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  dob: string;
  phone: string;
  email: string;
}

interface Appointment {
  id: string;
  scheduledTime: string;
  appointmentType: string;
  status: string;
}

interface EligibilityData {
  status?: string;
  verifiedAt?: string;
  copayAmount?: number;
  deductibleRemaining?: number;
  coinsurancePercent?: number;
  payerName?: string;
  planName?: string;
  memberId?: string;
  groupNumber?: string;
  hasIssues?: boolean;
  issueNotes?: string;
  deductibleTotal?: number;
  deductibleMet?: number;
  oopMax?: number;
  oopMet?: number;
  oopRemaining?: number;
  priorAuthRequired?: boolean;
  referralRequired?: boolean;
}

export default function CheckIn() {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [eligibility, setEligibility] = useState<EligibilityData | null>(null);
  const [insuranceNeedsUpdate, setInsuranceNeedsUpdate] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);

  // Copay collection state
  const [collectCopay, setCollectCopay] = useState(false);
  const [copayAmount, setCopayAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'credit' | 'debit' | 'check'>('cash');

  // Insurance update state
  const [updateInsurance, setUpdateInsurance] = useState(false);
  const [insuranceUpdates, setInsuranceUpdates] = useState({
    insuranceProvider: '',
    insuranceMemberId: '',
    insuranceGroupNumber: '',
    insurancePayerId: '',
  });

  useEffect(() => {
    loadCheckInData();
  }, [appointmentId]);

  const loadCheckInData = async () => {
    setLoading(true);
    try {
      // Get appointment details
      const apptResponse = await fetch(`/api/appointments/${appointmentId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'x-tenant-id': localStorage.getItem('tenantId') || '',
        },
      });

      if (!apptResponse.ok) {
        throw new Error('Failed to load appointment');
      }

      const apptData = await apptResponse.json();
      setAppointment(apptData.appointment);

      // Get patient eligibility for check-in
      const eligibilityResponse = await fetch(
        `/api/check-in/eligibility/${apptData.appointment.patientId}?appointmentId=${appointmentId}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'x-tenant-id': localStorage.getItem('tenantId') || '',
            'Content-Type': 'application/json',
          },
        }
      );

      if (!eligibilityResponse.ok) {
        throw new Error('Failed to load eligibility');
      }

      const eligibilityData = await eligibilityResponse.json();
      setEligibility(eligibilityData.data.eligibilityStatus);
      setInsuranceNeedsUpdate(eligibilityData.data.insuranceNeedsUpdate);

      // Pre-fill copay amount from eligibility
      if (eligibilityData.data.eligibilityStatus?.copayAmount) {
        setCopayAmount((eligibilityData.data.eligibilityStatus.copayAmount / 100).toFixed(2));
      }

      // Get patient details
      const patientResponse = await fetch(`/api/patients/${apptData.appointment.patientId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'x-tenant-id': localStorage.getItem('tenantId') || '',
        },
      });

      if (patientResponse.ok) {
        const patientData = await patientResponse.json();
        setPatient(patientData.patient);
      }
    } catch (error) {
      console.error('Error loading check-in data:', error);
      toast.error('Failed to load check-in data');
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshEligibility = async () => {
    if (!appointment) return;

    setIsRefreshing(true);
    try {
      const response = await fetch(
        `/api/check-in/refresh-eligibility/${appointment.patientId}?appointmentId=${appointmentId}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'x-tenant-id': localStorage.getItem('tenantId') || '',
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to refresh eligibility');
      }

      const data = await response.json();
      toast.success('Eligibility refreshed successfully');

      // Reload check-in data to get updated eligibility
      await loadCheckInData();
    } catch (error) {
      console.error('Error refreshing eligibility:', error);
      toast.error('Failed to refresh eligibility');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCompleteCheckIn = async () => {
    if (!appointment || !patient) return;

    setIsCheckingIn(true);
    try {
      const payload: any = {
        patientId: patient.id,
        appointmentId: appointment.id,
      };

      // Include copay collection if selected
      if (collectCopay && copayAmount) {
        payload.copayCollected = true;
        payload.copayAmountCents = Math.round(parseFloat(copayAmount) * 100);
        payload.paymentMethod = paymentMethod;
      }

      // Include insurance updates if selected
      if (updateInsurance) {
        const updates: any = {};
        if (insuranceUpdates.insuranceProvider) updates.insuranceProvider = insuranceUpdates.insuranceProvider;
        if (insuranceUpdates.insuranceMemberId) updates.insuranceMemberId = insuranceUpdates.insuranceMemberId;
        if (insuranceUpdates.insuranceGroupNumber) updates.insuranceGroupNumber = insuranceUpdates.insuranceGroupNumber;
        if (insuranceUpdates.insurancePayerId) updates.insurancePayerId = insuranceUpdates.insurancePayerId;

        if (Object.keys(updates).length > 0) {
          payload.insuranceUpdates = updates;
        }
      }

      const response = await fetch('/api/check-in/complete', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'x-tenant-id': localStorage.getItem('tenantId') || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Failed to complete check-in');
      }

      const data = await response.json();

      toast.success('Patient checked in successfully');

      // Show warnings if any
      if (data.result.warnings && data.result.warnings.length > 0) {
        data.result.warnings.forEach((warning: string) => {
          toast.error(warning, { duration: 5000 });
        });
      }

      // Navigate back to schedule or patient chart
      navigate('/schedule');
    } catch (error) {
      console.error('Error completing check-in:', error);
      toast.error('Failed to complete check-in');
    } finally {
      setIsCheckingIn(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading check-in...</p>
        </div>
      </div>
    );
  }

  if (!patient || !appointment) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-red-600 text-lg">Failed to load check-in data</p>
          <button
            onClick={() => navigate('/schedule')}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Back to Schedule
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Patient Check-In</h1>
          <p className="text-gray-600 mt-2">
            {patient.firstName} {patient.lastName} • {new Date(appointment.scheduledTime).toLocaleString()}
          </p>
        </div>

        {/* Alert if eligibility needs refresh */}
        {insuranceNeedsUpdate && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">
                  Insurance eligibility needs verification
                </h3>
                <p className="mt-2 text-sm text-yellow-700">
                  The insurance eligibility is stale or missing. Click the refresh button below to verify coverage.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Insurance Coverage Summary */}
        <div className="mb-6">
          <CoverageSummaryCard
            eligibility={{
              ...eligibility,
              copayAmount: eligibility?.copayAmount,
              deductibleRemaining: eligibility?.deductibleRemaining,
            }}
            onRefresh={handleRefreshEligibility}
            isRefreshing={isRefreshing}
          />
        </div>

        {/* Copay Collection */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Copay Collection</h2>
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={collectCopay}
                onChange={(e) => setCollectCopay(e.target.checked)}
                className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="text-sm text-gray-700">Collect copay</span>
            </label>
          </div>

          {collectCopay && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Copay Amount
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500">$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={copayAmount}
                    onChange={(e) => setCopayAmount(e.target.value)}
                    className="pl-7 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="cash">Cash</option>
                  <option value="credit">Credit Card</option>
                  <option value="debit">Debit Card</option>
                  <option value="check">Check</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Insurance Updates */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Update Insurance Information</h2>
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={updateInsurance}
                onChange={(e) => setUpdateInsurance(e.target.checked)}
                className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="text-sm text-gray-700">Update insurance</span>
            </label>
          </div>

          {updateInsurance && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Insurance Provider
                </label>
                <input
                  type="text"
                  value={insuranceUpdates.insuranceProvider}
                  onChange={(e) => setInsuranceUpdates({ ...insuranceUpdates, insuranceProvider: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., Blue Cross Blue Shield"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Member ID
                </label>
                <input
                  type="text"
                  value={insuranceUpdates.insuranceMemberId}
                  onChange={(e) => setInsuranceUpdates({ ...insuranceUpdates, insuranceMemberId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Member ID"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Group Number
                </label>
                <input
                  type="text"
                  value={insuranceUpdates.insuranceGroupNumber}
                  onChange={(e) => setInsuranceUpdates({ ...insuranceUpdates, insuranceGroupNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Group Number"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Payer ID
                </label>
                <input
                  type="text"
                  value={insuranceUpdates.insurancePayerId}
                  onChange={(e) => setInsuranceUpdates({ ...insuranceUpdates, insurancePayerId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Payer ID"
                />
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/schedule')}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>

          <button
            onClick={handleCompleteCheckIn}
            disabled={isCheckingIn}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCheckingIn ? 'Checking In...' : 'Complete Check-In'}
          </button>
        </div>
      </div>
    </div>
  );
}
