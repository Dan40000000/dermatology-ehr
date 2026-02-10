/**
 * SMSThread Component
 * Displays the conversation thread with a specific patient
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { FC } from 'react';
import { format, isToday, isYesterday, isThisYear } from 'date-fns';
import { SMSComposer } from './SMSComposer';

interface SMSMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  messageBody: string;
  status: string;
  sentAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  sentByUserName?: string;
}

interface PatientInfo {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  mrn?: string;
  dateOfBirth?: string;
}

interface SMSThreadProps {
  tenantId: string;
  accessToken: string;
  patientId: string;
  onBack?: () => void;
  onMessageSent?: () => void;
}

export const SMSThread: FC<SMSThreadProps> = ({
  tenantId,
  accessToken,
  patientId,
  onBack,
  onMessageSent,
}) => {
  const [messages, setMessages] = useState<SMSMessage[]>([]);
  const [patient, setPatient] = useState<PatientInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchConversation = useCallback(async () => {
    try {
      setError(null);

      const response = await fetch(`/api/sms/conversations/${patientId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-tenant-id': tenantId,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load conversation');
      }

      const data = await response.json();
      setMessages(data.messages || []);
      setPatient({
        id: patientId,
        firstName: data.patientName?.split(' ')[0] || '',
        lastName: data.patientName?.split(' ').slice(1).join(' ') || '',
        phone: data.patientPhone || '',
      });

      // Mark as read
      await fetch(`/api/sms/conversations/${patientId}/mark-read`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-tenant-id': tenantId,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversation');
    } finally {
      setLoading(false);
    }
  }, [patientId, tenantId, accessToken]);

  useEffect(() => {
    fetchConversation();
  }, [fetchConversation]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Poll for new messages
  useEffect(() => {
    const interval = setInterval(fetchConversation, 10000); // Poll every 10 seconds
    return () => clearInterval(interval);
  }, [fetchConversation]);

  const handleSendMessage = async (message: string, templateId?: string) => {
    if (!message.trim() || sending) return;

    setSending(true);
    try {
      const response = await fetch(`/api/sms/conversations/${patientId}/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-tenant-id': tenantId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message, templateId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send message');
      }

      // Refresh messages
      await fetchConversation();
      onMessageSent?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const formatMessageTime = (dateString: string) => {
    const date = new Date(dateString);

    if (isToday(date)) {
      return format(date, 'h:mm a');
    } else if (isYesterday(date)) {
      return `Yesterday ${format(date, 'h:mm a')}`;
    } else if (isThisYear(date)) {
      return format(date, 'MMM d, h:mm a');
    } else {
      return format(date, 'MMM d, yyyy h:mm a');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'delivered':
        return (
          <svg style={{ width: '0.875rem', height: '0.875rem', color: '#10b981' }} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        );
      case 'sent':
        return (
          <svg style={{ width: '0.875rem', height: '0.875rem', color: '#6b7280' }} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        );
      case 'failed':
      case 'undelivered':
        return (
          <svg style={{ width: '0.875rem', height: '0.875rem', color: '#dc2626' }} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        );
      default:
        return (
          <svg style={{ width: '0.875rem', height: '0.875rem', color: '#9ca3af' }} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
          </svg>
        );
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'white' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: '#6b7280' }}>
            <div style={{
              width: '2rem',
              height: '2rem',
              margin: '0 auto 0.5rem',
              border: '2px solid #e5e7eb',
              borderTopColor: '#7c3aed',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
            <p>Loading conversation...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'white' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.75rem 1rem',
        borderBottom: '1px solid #e5e7eb',
        background: '#f9fafb',
      }}>
        {onBack && (
          <button
            onClick={onBack}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '2rem',
              height: '2rem',
              background: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '0.375rem',
              cursor: 'pointer',
            }}
          >
            <svg style={{ width: '1rem', height: '1rem', color: '#374151' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        <div style={{
          width: '2.5rem',
          height: '2.5rem',
          borderRadius: '50%',
          background: '#7c3aed',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: '600',
          fontSize: '0.875rem',
        }}>
          {patient?.firstName?.[0]}{patient?.lastName?.[0]}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: '1rem', fontWeight: '600', color: '#111827' }}>
            {patient?.firstName} {patient?.lastName}
          </h2>
          <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>
            {patient?.phone}
            {patient?.mrn && ` | MRN: ${patient.mrn}`}
          </p>
        </div>
        <button
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '2rem',
            height: '2rem',
            background: 'transparent',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            color: '#6b7280',
          }}
          title="View patient profile"
        >
          <svg style={{ width: '1.25rem', height: '1.25rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        background: '#f9fafb',
      }}>
        {error && (
          <div style={{
            padding: '0.75rem',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '0.5rem',
            color: '#dc2626',
            fontSize: '0.875rem',
            textAlign: 'center',
          }}>
            {error}
            <button
              onClick={() => setError(null)}
              style={{
                marginLeft: '0.5rem',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#dc2626',
                textDecoration: 'underline',
              }}
            >
              Dismiss
            </button>
          </div>
        )}

        {messages.length === 0 ? (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#6b7280',
            textAlign: 'center',
          }}>
            <div>
              <svg style={{ width: '4rem', height: '4rem', margin: '0 auto 0.5rem', color: '#d1d5db' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p style={{ fontSize: '0.875rem' }}>No messages yet</p>
              <p style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>Send a message to start the conversation</p>
            </div>
          </div>
        ) : (
          messages.map((message, index) => {
            const isOutbound = message.direction === 'outbound';
            const showDateSeparator = index === 0 || (
              new Date(messages[index - 1]?.createdAt || '').toDateString() !==
              new Date(message.createdAt).toDateString()
            );

            return (
              <div key={message.id}>
                {showDateSeparator && (
                  <div style={{
                    textAlign: 'center',
                    margin: '0.5rem 0',
                    position: 'relative',
                  }}>
                    <span style={{
                      background: '#f9fafb',
                      padding: '0 0.75rem',
                      fontSize: '0.75rem',
                      color: '#6b7280',
                      position: 'relative',
                      zIndex: 1,
                    }}>
                      {isToday(new Date(message.createdAt))
                        ? 'Today'
                        : isYesterday(new Date(message.createdAt))
                        ? 'Yesterday'
                        : format(new Date(message.createdAt), 'EEEE, MMMM d, yyyy')}
                    </span>
                  </div>
                )}

                <div style={{
                  display: 'flex',
                  justifyContent: isOutbound ? 'flex-end' : 'flex-start',
                }}>
                  <div style={{
                    maxWidth: '75%',
                    padding: '0.625rem 0.875rem',
                    borderRadius: '1rem',
                    background: isOutbound ? '#7c3aed' : 'white',
                    color: isOutbound ? 'white' : '#111827',
                    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                    borderBottomRightRadius: isOutbound ? '0.25rem' : '1rem',
                    borderBottomLeftRadius: isOutbound ? '1rem' : '0.25rem',
                  }}>
                    <p style={{
                      fontSize: '0.875rem',
                      lineHeight: '1.5',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}>
                      {message.messageBody}
                    </p>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      gap: '0.375rem',
                      marginTop: '0.25rem',
                    }}>
                      <span style={{
                        fontSize: '0.625rem',
                        color: isOutbound ? 'rgba(255,255,255,0.7)' : '#9ca3af',
                      }}>
                        {formatMessageTime(message.sentAt || message.createdAt)}
                      </span>
                      {isOutbound && getStatusIcon(message.status)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <SMSComposer
        tenantId={tenantId}
        accessToken={accessToken}
        onSend={handleSendMessage}
        sending={sending}
        disabled={!patient}
      />
    </div>
  );
};

export default SMSThread;
