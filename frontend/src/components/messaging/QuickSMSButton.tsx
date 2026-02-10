/**
 * QuickSMSButton Component
 * One-click button for sending common SMS messages
 */

import { useState } from 'react';
import type { FC } from 'react';

interface QuickSMSButtonProps {
  tenantId: string;
  accessToken: string;
  patientId: string;
  patientName: string;
  appointmentId?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

interface QuickAction {
  id: string;
  label: string;
  icon: JSX.Element;
  category: 'reminder' | 'notification' | 'billing' | 'general';
  endpoint: string;
  requiresAppointment?: boolean;
  confirmMessage?: string;
}

const quickActions: QuickAction[] = [
  {
    id: 'reminder-24h',
    label: '24hr Reminder',
    icon: (
      <svg style={{ width: '1rem', height: '1rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    category: 'reminder',
    endpoint: '/api/sms/workflow/appointment-reminder/{appointmentId}',
    requiresAppointment: true,
  },
  {
    id: 'reminder-2h',
    label: '2hr Reminder',
    icon: (
      <svg style={{ width: '1rem', height: '1rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    category: 'reminder',
    endpoint: '/api/sms/workflow/appointment-reminder/{appointmentId}',
    requiresAppointment: true,
  },
  {
    id: 'running-late',
    label: 'Running Late',
    icon: (
      <svg style={{ width: '1rem', height: '1rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    category: 'notification',
    endpoint: '/api/sms/send',
    confirmMessage: 'Send "running late" notification?',
  },
  {
    id: 'confirmation',
    label: 'Confirm Appt',
    icon: (
      <svg style={{ width: '1rem', height: '1rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    category: 'reminder',
    endpoint: '/api/sms/workflow/appointment-confirmation/{appointmentId}',
    requiresAppointment: true,
  },
  {
    id: 'results-ready',
    label: 'Results Ready',
    icon: (
      <svg style={{ width: '1rem', height: '1rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    category: 'notification',
    endpoint: '/api/sms/send',
  },
  {
    id: 'balance-due',
    label: 'Balance Due',
    icon: (
      <svg style={{ width: '1rem', height: '1rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    category: 'billing',
    endpoint: '/api/sms/send',
    confirmMessage: 'Send balance due reminder?',
  },
];

export const QuickSMSButton: FC<QuickSMSButtonProps> = ({
  tenantId,
  accessToken,
  patientId,
  patientName,
  appointmentId,
  variant = 'secondary',
  size = 'md',
  onSuccess,
  onError,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [lateMinutes, setLateMinutes] = useState('15');
  const [showLateInput, setShowLateInput] = useState(false);

  const handleAction = async (action: QuickAction) => {
    if (action.requiresAppointment && !appointmentId) {
      onError?.('This action requires an appointment to be selected');
      return;
    }

    if (action.id === 'running-late') {
      setShowLateInput(true);
      return;
    }

    if (action.confirmMessage && !window.confirm(action.confirmMessage)) {
      return;
    }

    await executeAction(action);
  };

  const executeAction = async (action: QuickAction, extraData?: Record<string, unknown>) => {
    setSending(action.id);
    setIsOpen(false);
    setShowLateInput(false);

    try {
      let endpoint = action.endpoint;
      let method = 'POST';
      let body: Record<string, unknown> = { patientId };

      if (action.id === 'reminder-24h') {
        endpoint = `/api/sms/workflow/appointment-reminder/${appointmentId}`;
        body = { reminderType: '24h' };
      } else if (action.id === 'reminder-2h') {
        endpoint = `/api/sms/workflow/appointment-reminder/${appointmentId}`;
        body = { reminderType: '2h' };
      } else if (action.id === 'confirmation') {
        endpoint = `/api/sms/workflow/appointment-confirmation/${appointmentId}`;
        body = {};
      } else if (action.id === 'running-late') {
        endpoint = '/api/sms/send';
        body = {
          patientId,
          messageBody: `Hi ${patientName.split(' ')[0]}, we apologize - your provider is running approximately ${extraData?.minutes || lateMinutes} minutes behind schedule. Thank you for your patience.`,
          messageType: 'notification',
        };
      } else if (action.id === 'results-ready') {
        endpoint = '/api/sms/send';
        body = {
          patientId,
          messageBody: `Hi ${patientName.split(' ')[0]}, your results are now available. Please log into the patient portal to view or call us to discuss with your provider.`,
          messageType: 'notification',
        };
      } else if (action.id === 'balance-due') {
        endpoint = '/api/sms/send';
        body = {
          patientId,
          messageBody: `Hi ${patientName.split(' ')[0]}, this is a friendly reminder that you have an outstanding balance. Please call us or visit the patient portal to make a payment.`,
          messageType: 'notification',
        };
      }

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-tenant-id': tenantId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send message');
      }

      onSuccess?.();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(null);
    }
  };

  const buttonStyles = {
    primary: {
      background: '#7c3aed',
      color: 'white',
      border: 'none',
    },
    secondary: {
      background: 'white',
      color: '#374151',
      border: '1px solid #e5e7eb',
    },
    ghost: {
      background: 'transparent',
      color: '#6b7280',
      border: 'none',
    },
  };

  const sizeStyles = {
    sm: { padding: '0.25rem 0.5rem', fontSize: '0.75rem' },
    md: { padding: '0.375rem 0.75rem', fontSize: '0.875rem' },
    lg: { padding: '0.5rem 1rem', fontSize: '1rem' },
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={sending !== null}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
          borderRadius: '0.375rem',
          cursor: 'pointer',
          ...buttonStyles[variant],
          ...sizeStyles[size],
          opacity: sending !== null ? 0.7 : 1,
        }}
      >
        {sending ? (
          <div style={{
            width: '1rem',
            height: '1rem',
            border: '2px solid currentColor',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />
        ) : (
          <svg style={{ width: '1rem', height: '1rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        )}
        <span>Quick SMS</span>
        <svg style={{ width: '0.75rem', height: '0.75rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 40,
            }}
            onClick={() => setIsOpen(false)}
          />
          <div style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '0.25rem',
            background: 'white',
            borderRadius: '0.5rem',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
            border: '1px solid #e5e7eb',
            zIndex: 50,
            minWidth: '12rem',
            padding: '0.25rem 0',
          }}>
            <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #e5e7eb' }}>
              <p style={{ fontSize: '0.75rem', fontWeight: '500', color: '#6b7280' }}>
                Send to: {patientName}
              </p>
            </div>

            {/* Running late input */}
            {showLateInput ? (
              <div style={{ padding: '0.75rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', color: '#374151' }}>
                  How many minutes late?
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="number"
                    value={lateMinutes}
                    onChange={(e) => setLateMinutes(e.target.value)}
                    min="5"
                    max="120"
                    step="5"
                    style={{
                      flex: 1,
                      padding: '0.375rem 0.5rem',
                      border: '1px solid #e5e7eb',
                      borderRadius: '0.25rem',
                      fontSize: '0.875rem',
                    }}
                  />
                  <button
                    onClick={() => executeAction(quickActions.find(a => a.id === 'running-late')!, { minutes: lateMinutes })}
                    style={{
                      padding: '0.375rem 0.75rem',
                      background: '#7c3aed',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.25rem',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                    }}
                  >
                    Send
                  </button>
                </div>
                <button
                  onClick={() => setShowLateInput(false)}
                  style={{
                    marginTop: '0.5rem',
                    padding: '0.25rem',
                    background: 'none',
                    border: 'none',
                    color: '#6b7280',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                {/* Reminders section */}
                <div style={{ padding: '0.25rem 0' }}>
                  <p style={{ padding: '0.25rem 0.75rem', fontSize: '0.625rem', fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase' }}>
                    Reminders
                  </p>
                  {quickActions.filter(a => a.category === 'reminder').map((action) => (
                    <button
                      key={action.id}
                      onClick={() => handleAction(action)}
                      disabled={action.requiresAppointment && !appointmentId}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        background: 'transparent',
                        border: 'none',
                        cursor: action.requiresAppointment && !appointmentId ? 'not-allowed' : 'pointer',
                        textAlign: 'left',
                        fontSize: '0.875rem',
                        color: action.requiresAppointment && !appointmentId ? '#9ca3af' : '#374151',
                      }}
                    >
                      {action.icon}
                      {action.label}
                    </button>
                  ))}
                </div>

                {/* Notifications section */}
                <div style={{ padding: '0.25rem 0', borderTop: '1px solid #f3f4f6' }}>
                  <p style={{ padding: '0.25rem 0.75rem', fontSize: '0.625rem', fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase' }}>
                    Notifications
                  </p>
                  {quickActions.filter(a => a.category === 'notification').map((action) => (
                    <button
                      key={action.id}
                      onClick={() => handleAction(action)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: '0.875rem',
                        color: '#374151',
                      }}
                    >
                      {action.icon}
                      {action.label}
                    </button>
                  ))}
                </div>

                {/* Billing section */}
                <div style={{ padding: '0.25rem 0', borderTop: '1px solid #f3f4f6' }}>
                  <p style={{ padding: '0.25rem 0.75rem', fontSize: '0.625rem', fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase' }}>
                    Billing
                  </p>
                  {quickActions.filter(a => a.category === 'billing').map((action) => (
                    <button
                      key={action.id}
                      onClick={() => handleAction(action)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: '0.875rem',
                        color: '#374151',
                      }}
                    >
                      {action.icon}
                      {action.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default QuickSMSButton;
