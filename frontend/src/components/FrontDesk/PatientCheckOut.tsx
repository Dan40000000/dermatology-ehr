import React, { useState } from 'react';
import { format } from 'date-fns';
import { AppointmentWithDetails } from './TodaySchedulePanel';

interface PatientCheckOutProps {
  appointment: AppointmentWithDetails | null;
  onClose: () => void;
  onCheckOut: (appointmentId: string, data: CheckOutData) => Promise<void>;
  isLoading?: boolean;
}

export interface CheckOutData {
  paymentCollected?: number;
  followUpScheduled?: boolean;
  followUpDate?: string;
  printVisitSummary?: boolean;
  notes?: string;
}

export const PatientCheckOut: React.FC<PatientCheckOutProps> = ({
  appointment,
  onClose,
  onCheckOut,
  isLoading,
}) => {
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [followUpScheduled, setFollowUpScheduled] = useState(false);
  const [followUpDate, setFollowUpDate] = useState('');
  const [printVisitSummary, setPrintVisitSummary] = useState(true);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!appointment) {
    return null;
  }

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onCheckOut(appointment.id, {
        paymentCollected: paymentAmount > 0 ? paymentAmount : undefined,
        followUpScheduled,
        followUpDate: followUpScheduled && followUpDate ? followUpDate : undefined,
        printVisitSummary,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (error) {
      console.error('Check-out failed:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Placeholder values - would come from encounter/charges
  const todaysCharges = 0; // Would be calculated from actual charges
  const patientResponsibility = appointment.copayAmount || 0;
  const hasBalance = (appointment.outstandingBalance || 0) > 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Patient Check-Out</h2>
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
        <div className="px-6 py-4 bg-green-50 border-b border-green-100">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm font-medium text-gray-700">Patient</div>
              <div className="text-lg font-bold text-gray-900">
                {appointment.patientFirstName} {appointment.patientLastName}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-700">Visit Time</div>
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

        {/* Check-Out Steps */}
        <div className="px-6 py-6 space-y-6">
          {/* Step 1: Today's Charges Summary */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              1. Today's Charges
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Total Charges</span>
                <span className="font-medium text-gray-900">
                  ${todaysCharges.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Insurance Coverage (Est.)</span>
                <span className="font-medium text-gray-900">
                  ${(todaysCharges - patientResponsibility).toFixed(2)}
                </span>
              </div>
              <div className="pt-2 border-t border-gray-200 flex justify-between">
                <span className="font-semibold text-gray-900">
                  Patient Responsibility (Est.)
                </span>
                <span className="text-xl font-bold text-gray-900">
                  ${patientResponsibility.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Step 2: Outstanding Balance */}
          {hasBalance && (
            <div className="border border-red-200 rounded-lg p-4 bg-red-50">
              <h3 className="text-lg font-semibold text-red-900 mb-3">
                2. Outstanding Balance
              </h3>
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-sm font-medium text-red-800">
                  Previous unpaid balance
                </span>
              </div>
              <div className="text-2xl font-bold text-red-900">
                ${(appointment.outstandingBalance || 0).toFixed(2)}
              </div>
            </div>
          )}

          {/* Step 3: Collect Payment */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {hasBalance ? '3. ' : '2. '}Collect Payment
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Payment Amount
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
                      className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 text-lg"
                      placeholder="0.00"
                    />
                  </div>
                  {patientResponsibility > 0 && (
                    <button
                      onClick={() => setPaymentAmount(patientResponsibility)}
                      className="px-4 py-2 bg-green-100 text-green-700 rounded-md hover:bg-green-200 font-medium text-sm whitespace-nowrap"
                    >
                      Use Today's Total
                    </button>
                  )}
                </div>
              </div>

              {paymentAmount > 0 && (
                <div className="p-3 bg-green-50 rounded-lg">
                  <div className="text-sm text-green-800">
                    <strong>Payment collected:</strong> ${paymentAmount.toFixed(2)}
                  </div>
                  {hasBalance && (
                    <div className="text-sm text-green-700 mt-1">
                      Remaining balance: $
                      {Math.max(
                        0,
                        (appointment.outstandingBalance || 0) +
                          patientResponsibility -
                          paymentAmount
                      ).toFixed(2)}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Step 4: Follow-Up Appointment */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {hasBalance ? '4. ' : '3. '}Follow-Up Care
            </h3>
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={followUpScheduled}
                  onChange={(e) => setFollowUpScheduled(e.target.checked)}
                  className="w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  Schedule follow-up appointment
                </span>
              </label>

              {followUpScheduled && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Follow-Up Date
                  </label>
                  <input
                    type="date"
                    value={followUpDate}
                    onChange={(e) => setFollowUpDate(e.target.value)}
                    min={format(new Date(), 'yyyy-MM-dd')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Step 5: Print Visit Summary */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              {hasBalance ? '5. ' : '4. '}Patient Documents
            </h3>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={printVisitSummary}
                onChange={(e) => setPrintVisitSummary(e.target.checked)}
                className="w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-500"
              />
              <span className="text-sm font-medium text-gray-700">
                Print visit summary and after-visit instructions
              </span>
            </label>
          </div>

          {/* Notes */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Check-Out Notes (Optional)
            </h3>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Any additional notes about check-out..."
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
            disabled={isSubmitting}
            className={`px-8 py-3 rounded-md font-bold text-lg transition-colors ${
              !isSubmitting
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {isSubmitting ? 'Processing...' : 'Complete Check-Out'}
          </button>
        </div>
      </div>
    </div>
  );
};
