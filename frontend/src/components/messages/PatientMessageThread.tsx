import { useState, useEffect, useRef } from 'react';
import type { FC } from 'react';
import { format } from 'date-fns';
import { CannedResponseSelector } from './CannedResponseSelector';
import { MessageAttachmentUpload } from './MessageAttachmentUpload';

interface Message {
  id: string;
  senderType: string;
  senderName: string;
  messageText: string;
  sentAt: string;
  isInternalNote?: boolean;
  attachments?: any[];
}

interface Thread {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  patientName: string;
  patientMrn: string;
  patientDob: string;
  patientEmail: string;
  patientPhone: string;
  assignedToName?: string;
  createdAt: string;
}

interface PatientMessageThreadProps {
  thread: Thread;
  messages: Message[];
  onSendMessage: (messageText: string, isInternalNote: boolean) => Promise<void>;
  onUpdateThread: (updates: { assignedTo?: string; status?: string; priority?: string }) => Promise<void>;
  onClose: () => void;
  currentUserId: string;
  staffUsers: Array<{ id: string; name: string }>;
}

export const PatientMessageThread: FC<PatientMessageThreadProps> = ({
  thread,
  messages,
  onSendMessage,
  onUpdateThread,
  onClose,
  currentUserId,
  staffUsers,
}) => {
  const [messageText, setMessageText] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [sending, setSending] = useState(false);
  const [showCannedResponses, setShowCannedResponses] = useState(false);
  const [showAttachmentUpload, setShowAttachmentUpload] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!messageText.trim()) return;

    setSending(true);
    try {
      await onSendMessage(messageText, isInternalNote);
      setMessageText('');
      setIsInternalNote(false);
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setSending(false);
    }
  };

  const handleInsertCannedResponse = (responseText: string) => {
    setMessageText(responseText);
    setShowCannedResponses(false);
  };

  const handleStatusChange = async (newStatus: string) => {
    await onUpdateThread({ status: newStatus });
  };

  const handleAssignChange = async (newAssignedTo: string) => {
    await onUpdateThread({ assignedTo: newAssignedTo });
  };

  const handlePriorityChange = async (newPriority: string) => {
    await onUpdateThread({ priority: newPriority });
  };

  const handleCloseThread = async () => {
    await onUpdateThread({ status: 'closed' });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'white' }}>
      {/* Header */}
      <div style={{ flexShrink: 0, borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
        <div style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
              <button
                onClick={onClose}
                style={{ padding: '0.25rem', borderRadius: '0.25rem', cursor: 'pointer' }}
                className="hover-bg-gray"
                title="Back to inbox"
              >
                <svg style={{ width: '1.25rem', height: '1.25rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#111827' }}>{thread.subject}</h2>
                <p style={{ fontSize: '0.875rem', color: '#4b5563' }}>
                  {thread.patientName} • MRN: {thread.patientMrn}
                </p>
              </div>
            </div>
            <button
              onClick={handleCloseThread}
              style={{ padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151', background: 'white', border: '1px solid #d1d5db', borderRadius: '0.375rem', cursor: 'pointer' }}
              className="hover-bg-gray"
            >
              Close Thread
            </button>
          </div>

          {/* Thread controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#374151', marginRight: '0.5rem' }}>Status:</label>
              <select
                value={thread.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                style={{ fontSize: '0.875rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
              >
                <option value="open">Open</option>
                <option value="in-progress">In Progress</option>
                <option value="waiting-patient">Waiting for Patient</option>
                <option value="waiting-provider">Waiting for Provider</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#374151', marginRight: '0.5rem' }}>Assign to:</label>
              <select
                value={thread.assignedToName || ''}
                onChange={(e) => handleAssignChange(e.target.value)}
                style={{ fontSize: '0.875rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
              >
                <option value="">Unassigned</option>
                {staffUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#374151', marginRight: '0.5rem' }}>Priority:</label>
              <select
                value={thread.priority}
                onChange={(e) => handlePriorityChange(e.target.value)}
                style={{ fontSize: '0.875rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
        </div>

        {/* Patient info panel */}
        <div style={{ padding: '0.75rem 1.5rem', background: 'white', borderTop: '1px solid #e5e7eb' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', fontSize: '0.875rem' }}>
            <div>
              <span style={{ fontWeight: 500, color: '#374151' }}>DOB:</span>{' '}
              <span style={{ color: '#4b5563' }}>{thread.patientDob || 'N/A'}</span>
            </div>
            <div>
              <span style={{ fontWeight: 500, color: '#374151' }}>Email:</span>{' '}
              <span style={{ color: '#4b5563' }}>{thread.patientEmail || 'N/A'}</span>
            </div>
            <div>
              <span style={{ fontWeight: 500, color: '#374151' }}>Phone:</span>{' '}
              <span style={{ color: '#4b5563' }}>{thread.patientPhone || 'N/A'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', background: '#f9fafb' }}>
        {messages.map((message) => {
          const isStaff = message.senderType === 'staff';
          const isInternalNote = message.isInternalNote;

          return (
            <div
              key={message.id}
              style={{ display: 'flex', justifyContent: isStaff ? 'flex-end' : 'flex-start' }}
            >
              <div style={{ maxWidth: '48rem', marginLeft: isStaff ? '3rem' : '0', marginRight: isStaff ? '0' : '3rem' }}>
                <div
                  style={{
                    borderRadius: '0.5rem',
                    padding: '1rem',
                    background: isInternalNote ? '#fef9c3' : isStaff ? '#7c3aed' : 'white',
                    border: isInternalNote ? '2px solid #fde047' : `1px solid ${isStaff ? '#7c3aed' : '#e5e7eb'}`,
                    color: isStaff && !isInternalNote ? 'white' : 'inherit'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span
                      style={{
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        color: isInternalNote ? '#713f12' : isStaff ? '#e9d5ff' : '#111827'
                      }}
                    >
                      {message.senderName}
                      {isInternalNote && ' (Internal Note - Patient Cannot See)'}
                    </span>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        color: isInternalNote ? '#a16207' : isStaff ? '#ddd6fe' : '#6b7280'
                      }}
                    >
                      {format(new Date(message.sentAt), 'MMM d, yyyy h:mm a')}
                    </span>
                  </div>
                  <p
                    style={{
                      fontSize: '0.875rem',
                      whiteSpace: 'pre-wrap',
                      color: isInternalNote ? '#713f12' : isStaff ? 'white' : '#374151'
                    }}
                  >
                    {message.messageText}
                  </p>
                  {message.attachments && message.attachments.length > 0 && (
                    <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {message.attachments.map((att: any) => (
                        <div
                          key={att.id}
                          style={{ fontSize: '0.875rem', color: isStaff ? '#e9d5ff' : '#4b5563' }}
                        >
                          {att.filename} ({Math.round(att.fileSize / 1024)} KB)
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Message composer */}
      <div style={{ flexShrink: 0, borderTop: '1px solid #e5e7eb', background: 'white', padding: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <button
                onClick={() => setShowCannedResponses(true)}
                style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem', fontWeight: 500, color: '#6b21a8', background: '#f3e8ff', borderRadius: '0.375rem', cursor: 'pointer', border: 'none' }}
                className="hover-bg-purple"
                title="Insert canned response"
              >
                Quick Response
              </button>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isInternalNote}
                  onChange={(e) => setIsInternalNote(e.target.checked)}
                  style={{ borderRadius: '0.25rem', border: '1px solid #d1d5db', color: '#7c3aed' }}
                />
                <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
                  Internal Note (Patient cannot see)
                </span>
              </label>
            </div>
            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder={isInternalNote ? 'Type internal note...' : 'Type your message...'}
              style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', resize: 'none' }}
              rows={4}
              disabled={sending}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                {messageText.length} / 5000 characters
              </span>
              <button
                onClick={handleSendMessage}
                disabled={!messageText.trim() || sending}
                style={{
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: 'white',
                  background: !messageText.trim() || sending ? '#9ca3af' : '#7c3aed',
                  borderRadius: '0.375rem',
                  cursor: !messageText.trim() || sending ? 'not-allowed' : 'pointer',
                  opacity: !messageText.trim() || sending ? 0.5 : 1,
                  border: 'none'
                }}
                className="hover-bg-purple-dark"
              >
                {sending ? 'Sending...' : isInternalNote ? 'Add Note' : 'Send Message'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showCannedResponses && (
        <CannedResponseSelector
          category={thread.category}
          onSelect={handleInsertCannedResponse}
          onClose={() => setShowCannedResponses(false)}
        />
      )}

      {showAttachmentUpload && (
        <MessageAttachmentUpload
          onClose={() => setShowAttachmentUpload(false)}
          onUploadComplete={() => {
            setShowAttachmentUpload(false);
          }}
        />
      )}
    </div>
  );
};
