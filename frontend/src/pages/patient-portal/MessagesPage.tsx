import React, { useState, useEffect, useRef } from 'react';
import type { FC } from 'react';
import { formatDistanceToNow } from 'date-fns';
import '../../styles/patient-portal.css';
import { usePatientPortalAuth } from '../../contexts/PatientPortalAuthContext';
import { API_BASE_URL } from '../../utils/apiBase';

const API_URL = API_BASE_URL;

interface PatientThread {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  lastMessageAt: string;
  lastMessageBy: string;
  lastMessagePreview: string;
  isReadByPatient: boolean;
  messageCount: number;
  unreadCount: number;
}

export function PatientPortalMessagesPage() {
  const { sessionToken, tenantId } = usePatientPortalAuth();
  const [threads, setThreads] = useState<PatientThread[]>([]);
  const [selectedThread, setSelectedThread] = useState<PatientThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [showComposer, setShowComposer] = useState(false);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    fetchThreads();
  }, [filter, sessionToken, tenantId]);

  const fetchThreads = async () => {
    setLoading(true);
    try {
      if (!sessionToken || !tenantId) {
        setThreads([]);
        return;
      }

      const response = await fetch(
        `${API_URL}/api/patient-portal/messages/threads${filter !== 'all' ? `?category=${filter}` : ''}`,
        {
          headers: {
            Authorization: `Bearer ${sessionToken}`,
            'X-Tenant-ID': tenantId,
          },
        }
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to load messages');
      }
      const data = await response.json();
      setThreads(Array.isArray(data.threads) ? data.threads : []);
    } catch (error) {
      console.error('Error fetching threads:', error);
      setThreads([]);
    } finally {
      setLoading(false);
    }
  };

  const handleThreadClick = (thread: PatientThread) => {
    setSelectedThread(thread);
  };

  const getCategoryClass = (category: string) => {
    const classes: Record<string, string> = {
      general: 'portal-category-general',
      prescription: 'portal-category-prescription',
      appointment: 'portal-category-appointment',
      billing: 'portal-category-billing',
      medical: 'portal-category-medical',
    };
    return classes[category] || classes.general;
  };

  const headerRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  };

  return (
    <div className="portal-page">
      <div className="portal-container">
        {/* Header */}
        <div className="portal-page-header">
          <div style={headerRowStyle}>
            <div>
              <h1 className="portal-page-title">Messages</h1>
              <p className="portal-page-subtitle">
                Secure communication with your healthcare provider
              </p>
            </div>
            <button onClick={() => setShowComposer(true)} className="portal-btn portal-btn-primary">
              New Message
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="portal-filters">
          {['all', 'general', 'prescription', 'appointment', 'billing', 'medical'].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`portal-filter-btn ${filter === cat ? 'active' : ''}`}
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>

        {/* Thread list */}
        <div className="portal-thread-list">
          {loading ? (
            <div className="portal-loading">
              <div className="portal-spinner" />
            </div>
          ) : threads.length === 0 ? (
            <div className="portal-empty">
              <svg
                className="portal-empty-icon"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
              <p className="portal-empty-title">No messages</p>
              <p className="portal-empty-text">Start a new conversation with your provider</p>
            </div>
          ) : (
            <div>
              {threads.map((thread) => (
                <div
                  key={thread.id}
                  onClick={() => handleThreadClick(thread)}
                  className="portal-thread-item"
                >
                  <div className="portal-thread-header">
                    <div className="portal-thread-content">
                      <div className="portal-thread-title-row">
                        <h3 className={`portal-thread-title ${thread.isReadByPatient ? 'read' : 'unread'}`}>
                          {thread.subject}
                        </h3>
                        {!thread.isReadByPatient && thread.unreadCount > 0 && (
                          <span className="portal-unread-badge">
                            {thread.unreadCount} new
                          </span>
                        )}
                      </div>
                      <div className="portal-thread-meta">
                        <span className={`portal-category-badge ${getCategoryClass(thread.category)}`}>
                          {thread.category.charAt(0).toUpperCase() + thread.category.slice(1)}
                        </span>
                        <span className="portal-message-count">
                          {thread.messageCount} message{thread.messageCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <p className="portal-thread-preview">
                        {thread.lastMessagePreview}
                      </p>
                    </div>
                    <span className="portal-thread-time">
                      {formatDistanceToNow(new Date(thread.lastMessageAt), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Important notice */}
        <div className="portal-notice">
          <div className="portal-notice-icon">
            <svg fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="portal-notice-content">
            <h3 className="portal-notice-title">For urgent medical needs</h3>
            <p className="portal-notice-text">
              Please call our office at (555) 123-4567 or seek emergency care at your nearest emergency room. This messaging system is not monitored 24/7 and should not be used for urgent medical concerns.
            </p>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showComposer && <MessageComposer onClose={() => setShowComposer(false)} onSuccess={fetchThreads} />}
      {selectedThread && <MessageThreadView thread={selectedThread} onClose={() => setSelectedThread(null)} />}
    </div>
  );
}

interface MessageComposerProps {
  onClose: () => void;
  onSuccess: () => void;
}

const MessageComposer: FC<MessageComposerProps> = ({ onClose, onSuccess }) => {
  const { sessionToken, tenantId } = usePatientPortalAuth();
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<string>('general');
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const categories = [
    { value: 'general', label: 'General Inquiry' },
    { value: 'prescription', label: 'Prescription Refill' },
    { value: 'appointment', label: 'Appointment Request' },
    { value: 'billing', label: 'Billing Question' },
    { value: 'medical', label: 'Medical Question' },
  ];

  const validateForm = (): string | null => {
    if (!subject.trim()) {
      return 'Please enter a subject';
    }
    if (subject.length > 500) {
      return 'Subject must be 500 characters or less';
    }
    if (!messageText.trim()) {
      return 'Please enter a message';
    }
    if (messageText.length > 5000) {
      return 'Message must be 5000 characters or less';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!sessionToken || !tenantId) {
      setError('You must be logged in to send messages');
      return;
    }

    setSending(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/patient-portal/messages/threads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
          'X-Tenant-ID': tenantId,
        },
        body: JSON.stringify({
          subject: subject.trim(),
          category,
          messageText: messageText.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to send message');
      }

      setSuccess(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="portal-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="portal-modal">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <h2 className="portal-modal-title" style={{ margin: 0 }}>New Message</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0.25rem',
              color: '#6b7280',
            }}
            aria-label="Close"
          >
            <svg style={{ width: '1.5rem', height: '1.5rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {success ? (
          <div style={{
            padding: '2rem',
            textAlign: 'center',
            background: '#d1fae5',
            borderRadius: '0.5rem',
          }}>
            <svg
              style={{ width: '3rem', height: '3rem', color: '#059669', margin: '0 auto 1rem' }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <p style={{ fontSize: '1.125rem', fontWeight: 600, color: '#065f46', margin: 0 }}>
              Message sent successfully!
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{
                padding: '0.75rem 1rem',
                marginBottom: '1rem',
                background: '#fee2e2',
                border: '1px solid #fecaca',
                borderRadius: '0.375rem',
                color: '#b91c1c',
                fontSize: '0.875rem',
              }}>
                {error}
              </div>
            )}

            <div className="portal-form-group">
              <label className="portal-form-label" htmlFor="category">
                Category <span style={{ color: '#b91c1c' }}>*</span>
              </label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="portal-form-input portal-form-select"
                disabled={sending}
              >
                {categories.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="portal-form-group">
              <label className="portal-form-label" htmlFor="subject">
                Subject <span style={{ color: '#b91c1c' }}>*</span>
              </label>
              <input
                id="subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="portal-form-input"
                placeholder="Enter message subject"
                maxLength={500}
                disabled={sending}
              />
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem', textAlign: 'right' }}>
                {subject.length} / 500
              </div>
            </div>

            <div className="portal-form-group">
              <label className="portal-form-label" htmlFor="messageText">
                Message <span style={{ color: '#b91c1c' }}>*</span>
              </label>
              <textarea
                id="messageText"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                className="portal-form-input portal-form-textarea"
                placeholder="Type your message here..."
                maxLength={5000}
                disabled={sending}
                style={{ minHeight: '10rem' }}
              />
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem', textAlign: 'right' }}>
                {messageText.length} / 5000
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button
                type="button"
                onClick={onClose}
                className="portal-btn portal-btn-secondary"
                disabled={sending}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="portal-btn portal-btn-primary"
                disabled={sending || !subject.trim() || !messageText.trim()}
                style={{
                  opacity: sending || !subject.trim() || !messageText.trim() ? 0.6 : 1,
                  cursor: sending || !subject.trim() || !messageText.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {sending ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="portal-spinner" style={{ width: '1rem', height: '1rem', borderWidth: '2px' }} />
                    Sending...
                  </span>
                ) : (
                  'Send Message'
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

interface ThreadMessage {
  id: string;
  senderType: string;
  senderName: string;
  messageText: string;
  sentAt: string;
  hasAttachments?: boolean;
  readByPatient?: boolean;
  attachments?: Array<{
    id: string;
    filename: string;
    fileSize: number;
    mimeType: string;
  }>;
}

interface ThreadDetails {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  lastMessageAt: string;
  lastMessageBy: string;
  isReadByPatient: boolean;
  createdAt: string;
  updatedAt: string;
}

interface MessageThreadViewProps {
  thread: PatientThread;
  onClose: () => void;
}

const MessageThreadView: FC<MessageThreadViewProps> = ({ thread, onClose }) => {
  const { sessionToken, tenantId } = usePatientPortalAuth();
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [threadDetails, setThreadDetails] = useState<ThreadDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchThread = async () => {
    if (!sessionToken || !tenantId) return;

    try {
      const response = await fetch(`${API_URL}/api/patient-portal/messages/threads/${thread.id}`, {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          'X-Tenant-ID': tenantId,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load messages');
      }

      const data = await response.json();
      setThreadDetails(data.thread ?? null);
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      setError(null);

      // Mark thread as read
      await fetch(`${API_URL}/api/patient-portal/messages/threads/${thread.id}/mark-read`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          'X-Tenant-ID': tenantId,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchThread();
  }, [thread.id, sessionToken, tenantId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!replyText.trim() || !sessionToken || !tenantId) return;

    if (threadDetails?.status === 'closed') {
      setSendError('This thread is closed and cannot receive new messages');
      return;
    }

    setSending(true);
    setSendError(null);

    try {
      const response = await fetch(`${API_URL}/api/patient-portal/messages/threads/${thread.id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
          'X-Tenant-ID': tenantId,
        },
        body: JSON.stringify({ messageText: replyText.trim() }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to send reply');
      }

      setReplyText('');
      await fetchThread(); // Refresh messages
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send reply');
    } finally {
      setSending(false);
    }
  };

  const getCategoryClass = (category: string) => {
    const classes: Record<string, string> = {
      general: 'portal-category-general',
      prescription: 'portal-category-prescription',
      appointment: 'portal-category-appointment',
      billing: 'portal-category-billing',
      medical: 'portal-category-medical',
    };
    return classes[category] || classes.general;
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      'open': 'Open',
      'in-progress': 'In Progress',
      'waiting-patient': 'Awaiting Your Reply',
      'waiting-provider': 'Awaiting Provider Response',
      'closed': 'Closed',
    };
    return labels[status] || status;
  };

  return (
    <div className="portal-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="portal-modal portal-modal-lg" style={{ display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        {/* Header */}
        <div style={{ flexShrink: 0, borderBottom: '1px solid #e5e7eb', paddingBottom: '1rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 className="portal-modal-title" style={{ margin: '0 0 0.5rem 0' }}>{thread.subject}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <span className={`portal-category-badge ${getCategoryClass(thread.category)}`}>
                  {thread.category.charAt(0).toUpperCase() + thread.category.slice(1)}
                </span>
                <span style={{
                  padding: '0.125rem 0.5rem',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  borderRadius: '0.25rem',
                  background: threadDetails?.status === 'closed' ? '#f3f4f6' : '#ede9fe',
                  color: threadDetails?.status === 'closed' ? '#6b7280' : '#6b21a8',
                }}>
                  {getStatusLabel(threadDetails?.status || thread.status)}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                  {thread.messageCount} message{thread.messageCount !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '0.25rem',
                color: '#6b7280',
                marginLeft: '1rem',
              }}
              aria-label="Close"
            >
              <svg style={{ width: '1.5rem', height: '1.5rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages Area */}
        <div style={{ flex: 1, overflowY: 'auto', marginBottom: '1rem', minHeight: 0 }}>
          {loading ? (
            <div className="portal-loading">
              <div className="portal-spinner" />
            </div>
          ) : error ? (
            <div style={{
              padding: '2rem',
              textAlign: 'center',
              color: '#b91c1c',
            }}>
              <p>{error}</p>
              <button
                onClick={fetchThread}
                className="portal-btn portal-btn-secondary"
                style={{ marginTop: '1rem' }}
              >
                Try Again
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {messages.map((message) => {
                const isPatient = message.senderType === 'patient';
                return (
                  <div
                    key={message.id}
                    style={{
                      display: 'flex',
                      justifyContent: isPatient ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        maxWidth: '80%',
                        padding: '0.875rem 1rem',
                        borderRadius: '0.75rem',
                        background: isPatient ? '#7c3aed' : '#f3f4f6',
                        color: isPatient ? 'white' : '#111827',
                        borderBottomRightRadius: isPatient ? '0.25rem' : '0.75rem',
                        borderBottomLeftRadius: isPatient ? '0.75rem' : '0.25rem',
                      }}
                    >
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '0.375rem',
                        gap: '1rem',
                      }}>
                        <span style={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: isPatient ? '#e9d5ff' : '#374151',
                        }}>
                          {message.senderName}
                        </span>
                        <span style={{
                          fontSize: '0.7rem',
                          color: isPatient ? '#ddd6fe' : '#6b7280',
                        }}>
                          {formatDistanceToNow(new Date(message.sentAt), { addSuffix: true })}
                        </span>
                      </div>
                      <p style={{
                        margin: 0,
                        fontSize: '0.875rem',
                        lineHeight: 1.5,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}>
                        {message.messageText}
                      </p>
                      {message.attachments && message.attachments.length > 0 && (
                        <div style={{ marginTop: '0.75rem', borderTop: `1px solid ${isPatient ? 'rgba(255,255,255,0.2)' : '#e5e7eb'}`, paddingTop: '0.5rem' }}>
                          {message.attachments.map((att) => (
                            <div
                              key={att.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                fontSize: '0.75rem',
                                color: isPatient ? '#e9d5ff' : '#6b7280',
                              }}
                            >
                              <svg style={{ width: '1rem', height: '1rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                              </svg>
                              {att.filename} ({Math.round(att.fileSize / 1024)} KB)
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Reply Box */}
        {threadDetails?.status !== 'closed' && (
          <div style={{ flexShrink: 0, borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }}>
            {sendError && (
              <div style={{
                padding: '0.5rem 0.75rem',
                marginBottom: '0.75rem',
                background: '#fee2e2',
                border: '1px solid #fecaca',
                borderRadius: '0.375rem',
                color: '#b91c1c',
                fontSize: '0.875rem',
              }}>
                {sendError}
              </div>
            )}
            <form onSubmit={handleSendReply}>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Type your reply..."
                    className="portal-form-input"
                    style={{ minHeight: '5rem', resize: 'vertical' }}
                    maxLength={5000}
                    disabled={sending}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem' }}>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      {replyText.length} / 5000
                    </span>
                  </div>
                </div>
                <button
                  type="submit"
                  className="portal-btn portal-btn-primary"
                  disabled={sending || !replyText.trim()}
                  style={{
                    opacity: sending || !replyText.trim() ? 0.6 : 1,
                    cursor: sending || !replyText.trim() ? 'not-allowed' : 'pointer',
                    height: 'fit-content',
                  }}
                >
                  {sending ? (
                    <span className="portal-spinner" style={{ width: '1rem', height: '1rem', borderWidth: '2px' }} />
                  ) : (
                    <svg style={{ width: '1.25rem', height: '1.25rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {threadDetails?.status === 'closed' && (
          <div style={{
            flexShrink: 0,
            padding: '1rem',
            background: '#f3f4f6',
            borderRadius: '0.5rem',
            textAlign: 'center',
            color: '#6b7280',
            fontSize: '0.875rem',
          }}>
            This conversation has been closed. If you need further assistance, please start a new message.
          </div>
        )}
      </div>
    </div>
  );
};
