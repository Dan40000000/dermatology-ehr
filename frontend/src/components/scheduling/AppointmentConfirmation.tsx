interface TimeSlot {
  startTime: string;
  endTime: string;
}

interface Provider {
  id: string;
  fullName: string;
  specialty?: string;
  profileImageUrl?: string;
  bio?: string;
}

interface AppointmentType {
  id: string;
  name: string;
  durationMinutes: number;
  description?: string;
}

interface AppointmentConfirmationProps {
  provider: Provider;
  appointmentType: AppointmentType;
  selectedSlot: TimeSlot;
  reason?: string;
  notes?: string;
  onConfirm: () => void;
  onBack: () => void;
  loading?: boolean;
}

export function AppointmentConfirmation({
  provider,
  appointmentType,
  selectedSlot,
  reason,
  notes,
  onConfirm,
  onBack,
  loading = false,
}: AppointmentConfirmationProps) {
  const formatDate = (isoString: string): string => {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (isoString: string): string => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const appointmentDate = new Date(selectedSlot.startTime);

  return (
    <div className="appointment-confirmation">
      <div className="confirmation-header">
        <h2>Confirm Your Appointment</h2>
        <p className="subtitle">Please review your appointment details before confirming</p>
      </div>

      <div className="confirmation-content">
        {/* Provider info */}
        <div className="info-section">
          <h3 className="section-title">Provider</h3>
          <div className="provider-info">
            {provider.profileImageUrl && (
              <img
                src={provider.profileImageUrl}
                alt={provider.fullName}
                className="provider-image"
              />
            )}
            <div className="provider-details">
              <div className="provider-name">{provider.fullName}</div>
              {provider.specialty && <div className="provider-specialty">{provider.specialty}</div>}
              {provider.bio && <div className="provider-bio">{provider.bio}</div>}
            </div>
          </div>
        </div>

        {/* Date & Time */}
        <div className="info-section">
          <h3 className="section-title">Date & Time</h3>
          <div className="datetime-info">
            <div className="datetime-item">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z"
                  clipRule="evenodd"
                />
              </svg>
              <span>{formatDate(selectedSlot.startTime)}</span>
            </div>
            <div className="datetime-item">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                  clipRule="evenodd"
                />
              </svg>
              <span>
                {formatTime(selectedSlot.startTime)} - {formatTime(selectedSlot.endTime)}
              </span>
            </div>
          </div>
        </div>

        {/* Appointment Type */}
        <div className="info-section">
          <h3 className="section-title">Appointment Type</h3>
          <div className="appointment-type-info">
            <div className="type-name">{appointmentType.name}</div>
            {appointmentType.description && (
              <div className="type-description">{appointmentType.description}</div>
            )}
            <div className="type-duration">{appointmentType.durationMinutes} minutes</div>
          </div>
        </div>

        {/* Reason for visit */}
        {reason && (
          <div className="info-section">
            <h3 className="section-title">Reason for Visit</h3>
            <div className="reason-text">{reason}</div>
          </div>
        )}

        {/* Additional notes */}
        {notes && (
          <div className="info-section">
            <h3 className="section-title">Additional Notes</h3>
            <div className="notes-text">{notes}</div>
          </div>
        )}

        {/* Important information */}
        <div className="info-box">
          <div className="info-box-header">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
            <span>Important Information</span>
          </div>
          <ul className="info-list">
            <li>Please arrive 15 minutes early for check-in</li>
            <li>Bring your insurance card and ID</li>
            <li>You will receive a confirmation email shortly</li>
            <li>To cancel or reschedule, please do so at least 24 hours in advance</li>
          </ul>
        </div>
      </div>

      {/* Actions */}
      <div className="confirmation-actions">
        <button type="button" onClick={onBack} className="btn btn-secondary" disabled={loading}>
          Go Back
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="btn btn-primary"
          disabled={loading}
        >
          {loading ? 'Booking...' : 'Confirm Appointment'}
        </button>
      </div>

      <style>{`
        .appointment-confirmation {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 2rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          max-width: 600px;
          margin: 0 auto;
        }

        .confirmation-header {
          text-align: center;
          margin-bottom: 2rem;
          padding-bottom: 1.5rem;
          border-bottom: 2px solid #e5e7eb;
        }

        .confirmation-header h2 {
          font-size: 1.5rem;
          font-weight: 700;
          color: #111827;
          margin: 0 0 0.5rem 0;
        }

        .subtitle {
          font-size: 0.875rem;
          color: #6b7280;
          margin: 0;
        }

        .confirmation-content {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .info-section {
          padding-bottom: 1.5rem;
          border-bottom: 1px solid #f3f4f6;
        }

        .info-section:last-of-type {
          border-bottom: none;
          padding-bottom: 0;
        }

        .section-title {
          font-size: 0.875rem;
          font-weight: 600;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin: 0 0 0.75rem 0;
        }

        .provider-info {
          display: flex;
          gap: 1rem;
          align-items: start;
        }

        .provider-image {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid #e5e7eb;
        }

        .provider-details {
          flex: 1;
        }

        .provider-name {
          font-size: 1.125rem;
          font-weight: 600;
          color: #111827;
          margin-bottom: 0.25rem;
        }

        .provider-specialty {
          font-size: 0.875rem;
          color: #6B46C1;
          font-weight: 500;
          margin-bottom: 0.5rem;
        }

        .provider-bio {
          font-size: 0.875rem;
          color: #6b7280;
          line-height: 1.5;
        }

        .datetime-info {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .datetime-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          font-size: 1rem;
          color: #374151;
        }

        .datetime-item svg {
          color: #6B46C1;
          flex-shrink: 0;
        }

        .appointment-type-info {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .type-name {
          font-size: 1rem;
          font-weight: 600;
          color: #111827;
        }

        .type-description {
          font-size: 0.875rem;
          color: #6b7280;
          line-height: 1.5;
        }

        .type-duration {
          font-size: 0.875rem;
          color: #6B46C1;
          font-weight: 500;
        }

        .reason-text,
        .notes-text {
          font-size: 0.9375rem;
          color: #374151;
          line-height: 1.6;
          padding: 0.75rem 1rem;
          background: #f9fafb;
          border-left: 3px solid #6B46C1;
          border-radius: 4px;
        }

        .info-box {
          background: #eff6ff;
          border: 1px solid #dbeafe;
          border-radius: 6px;
          padding: 1rem;
        }

        .info-box-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-weight: 600;
          color: #1e40af;
          margin-bottom: 0.75rem;
        }

        .info-box-header svg {
          color: #3b82f6;
        }

        .info-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .info-list li {
          font-size: 0.875rem;
          color: #1e3a8a;
          padding-left: 1.5rem;
          position: relative;
        }

        .info-list li::before {
          content: '•';
          position: absolute;
          left: 0.5rem;
          color: #3b82f6;
          font-weight: bold;
        }

        .confirmation-actions {
          display: flex;
          gap: 1rem;
          margin-top: 2rem;
          padding-top: 1.5rem;
          border-top: 2px solid #e5e7eb;
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
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 44px;
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
          border-color: #9ca3af;
        }

        .btn-primary {
          background: #6B46C1;
          color: white;
          box-shadow: 0 1px 3px rgba(107, 70, 193, 0.3);
        }

        .btn-primary:hover:not(:disabled) {
          background: #7c3aed;
          box-shadow: 0 4px 6px rgba(107, 70, 193, 0.4);
          transform: translateY(-1px);
        }

        @media (max-width: 640px) {
          .appointment-confirmation {
            padding: 1.5rem;
          }

          .confirmation-header h2 {
            font-size: 1.25rem;
          }

          .provider-info {
            flex-direction: column;
          }

          .confirmation-actions {
            flex-direction: column-reverse;
          }

          .btn {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
