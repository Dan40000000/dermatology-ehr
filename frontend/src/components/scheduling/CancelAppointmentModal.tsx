import { useState } from 'react';

interface CancelAppointmentModalProps {
  appointmentId: string;
  appointmentDate: string;
  appointmentTime: string;
  providerName: string;
  cutoffHours: number;
  onCancel: (reason?: string) => Promise<void>;
  onClose: () => void;
}

const CANCEL_REASONS = [
  'Schedule conflict',
  'No longer needed',
  'Medical issue resolved',
  'Switching providers',
  'Financial reasons',
  'Other',
];

export function CancelAppointmentModal({
  appointmentId,
  appointmentDate,
  appointmentTime,
  providerName,
  cutoffHours,
  onCancel,
  onClose,
}: CancelAppointmentModalProps) {
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const finalReason = reason === 'Other' ? customReason : reason;
      await onCancel(finalReason);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to cancel appointment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Cancel Appointment</h2>
          <button onClick={onClose} className="close-button" aria-label="Close">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* Warning */}
            <div className="warning-box">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <div>
                <strong>Cancellation Policy</strong>
                <p>
                  Appointments must be cancelled at least {cutoffHours} hours in advance. Late
                  cancellations may be subject to a fee.
                </p>
              </div>
            </div>

            {/* Appointment details */}
            <div className="appointment-details">
              <h3>Appointment Details</h3>
              <div className="detail-row">
                <span className="label">Date:</span>
                <span className="value">{appointmentDate}</span>
              </div>
              <div className="detail-row">
                <span className="label">Time:</span>
                <span className="value">{appointmentTime}</span>
              </div>
              <div className="detail-row">
                <span className="label">Provider:</span>
                <span className="value">{providerName}</span>
              </div>
            </div>

            {/* Reason selection */}
            <div className="form-group">
              <label htmlFor="reason">Reason for Cancellation (Optional)</label>
              <select
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="form-select"
              >
                <option value="">Select a reason...</option>
                {CANCEL_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {/* Custom reason */}
            {reason === 'Other' && (
              <div className="form-group">
                <label htmlFor="customReason">Please specify</label>
                <textarea
                  id="customReason"
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  className="form-textarea"
                  rows={3}
                  placeholder="Enter your reason..."
                  required
                />
              </div>
            )}

            {error && (
              <div className="error-message">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn btn-secondary" disabled={loading}>
              Keep Appointment
            </button>
            <button type="submit" className="btn btn-danger" disabled={loading}>
              {loading ? 'Cancelling...' : 'Cancel Appointment'}
            </button>
          </div>
        </form>

        <style>{`
          .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            padding: 1rem;
          }

          .modal-content {
            background: white;
            border-radius: 8px;
            max-width: 500px;
            width: 100%;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          }

          .modal-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 1.5rem;
            border-bottom: 1px solid #e5e7eb;
          }

          .modal-header h2 {
            font-size: 1.25rem;
            font-weight: 700;
            color: #111827;
            margin: 0;
          }

          .close-button {
            background: none;
            border: none;
            font-size: 1.5rem;
            color: #6b7280;
            cursor: pointer;
            padding: 0;
            width: 2rem;
            height: 2rem;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
          }

          .close-button:hover {
            background: #f3f4f6;
          }

          .modal-body {
            padding: 1.5rem;
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
          }

          .warning-box {
            display: flex;
            gap: 0.75rem;
            padding: 1rem;
            background: #fef3c7;
            border: 1px solid #fde68a;
            border-radius: 6px;
            color: #92400e;
          }

          .warning-box svg {
            flex-shrink: 0;
            color: #f59e0b;
          }

          .warning-box strong {
            display: block;
            margin-bottom: 0.25rem;
          }

          .warning-box p {
            font-size: 0.875rem;
            margin: 0;
            line-height: 1.5;
          }

          .appointment-details {
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            padding: 1rem;
          }

          .appointment-details h3 {
            font-size: 0.875rem;
            font-weight: 600;
            color: #111827;
            margin: 0 0 0.75rem 0;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }

          .detail-row {
            display: flex;
            justify-content: space-between;
            padding: 0.5rem 0;
            border-bottom: 1px solid #e5e7eb;
          }

          .detail-row:last-child {
            border-bottom: none;
          }

          .detail-row .label {
            font-weight: 500;
            color: #6b7280;
            font-size: 0.875rem;
          }

          .detail-row .value {
            font-weight: 600;
            color: #111827;
            font-size: 0.875rem;
          }

          .form-group {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
          }

          .form-group label {
            font-size: 0.875rem;
            font-weight: 600;
            color: #374151;
          }

          .form-select,
          .form-textarea {
            padding: 0.75rem;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            font-size: 0.9375rem;
            font-family: inherit;
          }

          .form-select:focus,
          .form-textarea:focus {
            outline: none;
            border-color: #6B46C1;
            box-shadow: 0 0 0 3px rgba(107, 70, 193, 0.1);
          }

          .form-textarea {
            resize: vertical;
          }

          .error-message {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.75rem 1rem;
            background: #fee2e2;
            border: 1px solid #fecaca;
            border-radius: 6px;
            color: #991b1b;
            font-size: 0.875rem;
          }

          .modal-footer {
            display: flex;
            gap: 1rem;
            padding: 1.5rem;
            border-top: 1px solid #e5e7eb;
          }

          .btn {
            flex: 1;
            padding: 0.75rem 1.5rem;
            border-radius: 6px;
            font-size: 1rem;
            font-weight: 600;
            border: none;
            cursor: pointer;
            transition: all 0.2s;
          }

          .btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .btn-secondary {
            background: white;
            border: 2px solid #d1d5db;
            color: #374151;
          }

          .btn-secondary:hover:not(:disabled) {
            background: #f9fafb;
          }

          .btn-danger {
            background: #dc2626;
            color: white;
          }

          .btn-danger:hover:not(:disabled) {
            background: #b91c1c;
          }

          @media (max-width: 640px) {
            .modal-content {
              max-height: 100vh;
              border-radius: 0;
            }

            .modal-footer {
              flex-direction: column-reverse;
            }
          }
        `}</style>
      </div>
    </div>
  );
}
