import React, { useState } from 'react';
import { format } from 'date-fns';
import { AppointmentWithDetails } from './TodaySchedulePanel';

interface PatientCheckInProps {
  appointment: AppointmentWithDetails | null;
  onClose: () => void;
  onCheckIn: (appointmentId: string, data: CheckInData) => Promise<void>;
  isLoading?: boolean;
}

export interface CheckInData {
  demographicsConfirmed: boolean;
  paymentCollected?: number;
  notes?: string;
}

export const PatientCheckIn: React.FC<PatientCheckInProps> = ({
  appointment,
  onClose,
  onCheckIn,
  isLoading,
}) => {
  const [demographicsConfirmed, setDemographicsConfirmed] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!appointment) {
    return null;
  }

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onCheckIn(appointment.id, {
        demographicsConfirmed,
        paymentCollected: paymentAmount > 0 ? paymentAmount : undefined,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (error) {
      console.error('Check-in failed:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const canCheckIn = demographicsConfirmed;
  const suggestedPayment = appointment.copayAmount || 0;
  const hasBalance = (appointment.outstandingBalance || 0) > 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Patient Check-In</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Patient Info */}
        <div className="px-6 py-4 bg-blue-50 border-b border-blue-100">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm font-medium text-gray-700">Patient</div>
              <div className="text-lg font-bold text-gray-900">
                {appointment.patientFirstName} {appointment.patientLastName}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-700">Appointment</div>
              <div className="text-lg font-bold text-gray-900">
                {format(new Date(appointment.scheduledStart), 'h:mm a')}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-700">Provider</div>
              <div className="text-base text-gray-900">{appointment.providerName}</div>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-700">Visit Type</div>
              <div className="text-base text-gray-900">
                {appointment.appointmentTypeName}
              </div>
            </div>
          </div>
        </div>

        {/* Check-In Steps */}
        <div className="px-6 py-6 space-y-6">
          {/* Step 1: Demographics */}
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900">
                1. Confirm Demographics
              </h3>
              {demographicsConfirmed && (
                <span className="text-green-600 text-2xl">✓</span>
              )}
            </div>
            <div className="space-y-2 text-sm mb-4">
              {appointment.patientPhone && (
                <div>
                  <span className="text-gray-600">Phone:</span>{' '}
                  <span className="text-gray-900 font-medium">
                    {appointment.patientPhone}
                  </span>
                </div>
              )}
              {appointment.insurancePlanName && (
                <div>
                  <span className="text-gray-600">Insurance:</span>{' '}
                  <span className="text-gray-900 font-medium">
                    {appointment.insurancePlanName}
                  </span>
                </div>
              )}
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={demographicsConfirmed}
                onChange={(e) => setDemographicsConfirmed(e.target.checked)}
                className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">
                Patient confirmed all information is correct
              </span>
            </label>
          </div>

          {/* Step 2: Insurance Status */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              2. Insurance Status
            </h3>
            <div className="flex items-center gap-3">
              {appointment.insuranceVerified ? (
                <>
                  <div className="flex items-center gap-2 text-green-600 bg-green-50 px-4 py-2 rounded-lg">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="font-medium">Verified</span>
                  </div>
                  {appointment.copayAmount !== undefined && (
                    <div className="text-sm">
                      <span className="text-gray-600">Copay:</span>{' '}
                      <span className="text-lg font-bold text-gray-900">
                        ${appointment.copayAmount.toFixed(2)}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2 text-yellow-600 bg-yellow-50 px-4 py-2 rounded-lg">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="font-medium">Pending Verification</span>
                </div>
              )}
            </div>
          </div>

          {/* Step 3: Balance & Payment */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              3. Payment Collection
            </h3>

            {hasBalance && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2 text-red-800 mb-2">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="font-medium">Outstanding Balance</span>
                </div>
                <div className="text-2xl font-bold text-red-900">
                  ${(appointment.outstandingBalance || 0).toFixed(2)}
                </div>
              </div>
            )}

            <div className="space-y-3">
              {suggestedPayment > 0 && (
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm font-medium text-gray-700">
                    Today's Copay
                  </span>
                  <span className="text-lg font-bold text-gray-900">
                    ${suggestedPayment.toFixed(2)}
                  </span>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Collect Payment
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                      $
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                      className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0.00"
                    />
                  </div>
                  {suggestedPayment > 0 && (
                    <button
                      onClick={() => setPaymentAmount(suggestedPayment)}
                      className="px-4 py-2 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 font-medium text-sm whitespace-nowrap"
                    >
                      Use Copay
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Step 4: Notes (Optional) */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              4. Notes (Optional)
            </h3>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Any special instructions or notes..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-100 font-medium"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canCheckIn || isSubmitting}
            className={`px-8 py-3 rounded-md font-bold text-lg transition-colors ${
              canCheckIn && !isSubmitting
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {isSubmitting ? 'Checking In...' : 'Complete Check-In'}
          </button>
        </div>
      </div>
    </div>
  );
};
