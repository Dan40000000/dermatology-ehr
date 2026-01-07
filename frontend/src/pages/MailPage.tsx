import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Skeleton, Modal } from '../components/ui';
import {
  fetchMessageThreads,
  fetchMessageThread,
  createMessageThread,
  sendThreadMessage,
  markThreadAsRead,
  archiveThread,
  fetchPatients,
  fetchProviders,
} from '../api';
import type {
  MessageThreadPreview,
  MessageThread,
  MessageThreadMessage,
  Patient,
  Provider,
  CreateThreadData,
} from '../types';

type MailFolder = 'inbox' | 'sent' | 'archived' | 'drafts';
type MailSection = 'intramail' | 'direct-mail';

export function MailPage() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [threads, setThreads] = useState<MessageThreadPreview[]>([]);
  const [selectedThread, setSelectedThread] = useState<MessageThread | null>(null);
  const [messages, setMessages] = useState<MessageThreadMessage[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [folder, setFolder] = useState<MailFolder>('inbox');
  const [mailSection, setMailSection] = useState<MailSection>('intramail');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(true);
  const [priorityFilter, setPriorityFilter] = useState<string>('any');
  const [dateFilter, setDateFilter] = useState<string>('');
  const [flaggedFilter, setFlaggedFilter] = useState<string>('any');
  const [readFilter, setReadFilter] = useState<string>('any');

  const [showComposeModal, setShowComposeModal] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [composePriority, setComposePriority] = useState<string>('normal');
  const [composeCc, setComposeCc] = useState<string>('');
  const [allowSearchPatients, setAllowSearchPatients] = useState(false);

  const [newThread, setNewThread] = useState<CreateThreadData>({
    subject: '',
    patientId: '',
    participantIds: [],
    message: '',
  });

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Only handle shortcuts when not typing in an input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'c' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShowComposeModal(true);
      } else if (e.key === 'r' && selectedThread && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        document.getElementById('reply-box')?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [selectedThread]);

  const loadThreads = useCallback(async () => {
    if (!session) return;

    setLoading(true);
    try {
      const [threadsRes, patientsRes, providersRes] = await Promise.all([
        fetchMessageThreads(session.tenantId, session.accessToken, folder),
        fetchPatients(session.tenantId, session.accessToken),
        fetchProviders(session.tenantId, session.accessToken),
      ]);

      setThreads(threadsRes.threads || []);
      setPatients(patientsRes.patients || []);
      setProviders(providersRes.providers || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load threads');
    } finally {
      setLoading(false);
    }
  }, [session, folder, showError]);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  const handleThreadClick = async (thread: MessageThreadPreview) => {
    if (!session) return;

    try {
      const response = await fetchMessageThread(
        session.tenantId,
        session.accessToken,
        thread.id
      );

      setSelectedThread(response.thread);
      setMessages(response.messages || []);

      // Mark as read
      if (thread.unreadCount > 0) {
        await markThreadAsRead(session.tenantId, session.accessToken, thread.id);
        loadThreads(); // Refresh to update unread counts
      }
    } catch (err: any) {
      showError(err.message || 'Failed to load thread');
    }
  };

  const handleCreateThread = async () => {
    if (!session || !newThread.subject || !newThread.message || newThread.participantIds.length === 0) {
      showError('Please fill in all required fields');
      return;
    }

    setSending(true);
    try {
      await createMessageThread(session.tenantId, session.accessToken, newThread);
      showSuccess('Message sent');
      setShowComposeModal(false);
      setNewThread({
        subject: '',
        patientId: '',
        participantIds: [],
        message: '',
      });
      loadThreads();
      setSelectedThread(null);
    } catch (err: any) {
      showError(err.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleReply = async () => {
    if (!session || !selectedThread || !replyText.trim()) {
      showError('Please enter a message');
      return;
    }

    try {
      await sendThreadMessage(
        session.tenantId,
        session.accessToken,
        selectedThread.id,
        replyText
      );

      setReplyText('');
      showSuccess('Reply sent');

      // Reload thread
      const response = await fetchMessageThread(
        session.tenantId,
        session.accessToken,
        selectedThread.id
      );
      setMessages(response.messages || []);
      loadThreads();
    } catch (err: any) {
      showError(err.message || 'Failed to send reply');
    }
  };

  const handleArchive = async () => {
    if (!session || !selectedThread) return;

    try {
      await archiveThread(session.tenantId, session.accessToken, selectedThread.id, true);
      showSuccess('Thread archived');
      setSelectedThread(null);
      setMessages([]);
      loadThreads();
    } catch (err: any) {
      showError(err.message || 'Failed to archive thread');
    }
  };

  const handleUnarchive = async () => {
    if (!session || !selectedThread) return;

    try {
      await archiveThread(session.tenantId, session.accessToken, selectedThread.id, false);
      showSuccess('Thread unarchived');
      setSelectedThread(null);
      setMessages([]);
      loadThreads();
    } catch (err: any) {
      showError(err.message || 'Failed to unarchive thread');
    }
  };

  const getPatientName = (patientId?: string) => {
    if (!patientId) return null;
    const patient = patients.find((p) => p.id === patientId);
    return patient ? `${patient.lastName}, ${patient.firstName}` : 'Unknown Patient';
  };

  const getParticipantInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  const filteredThreads = threads.filter((thread) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      thread.subject.toLowerCase().includes(query) ||
      thread.lastMessage?.body.toLowerCase().includes(query) ||
      thread.participants.some((p) =>
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(query)
      )
    );
  });

  const inboxCount = threads.filter((t) => !t.isArchived && t.createdBy !== session?.user.id).length;
  const sentCount = threads.filter((t) => t.createdBy === session?.user.id).length;
  const archivedCount = threads.filter((t) => t.isArchived).length;
  const unreadCount = threads.filter((t) => t.unreadCount > 0 && !t.isArchived).length;

  return (
    <div className="mail-page" style={{
      display: 'flex',
      minHeight: 'calc(100vh - 200px)',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '1.5rem',
      gap: '1rem',
      borderRadius: '12px',
      boxShadow: '0 20px 60px rgba(102, 126, 234, 0.3)',
    }}>
      {/* Left Sidebar */}
      <div
        style={{
          width: '220px',
          borderRight: 'none',
          background: 'rgba(255, 255, 255, 0.95)',
          flexShrink: 0,
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          backdropFilter: 'blur(10px)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '1rem',
            fontWeight: 700,
            color: '#ffffff',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '1.125rem',
            letterSpacing: '0.5px',
          }}
        >
          IntraMail
        </div>

        <div style={{ padding: '0.5rem 0' }}>
          <button
            type="button"
            onClick={() => setShowComposeModal(true)}
            style={{
              display: 'block',
              width: 'calc(100% - 1rem)',
              margin: '0 0.5rem 0.5rem 0.5rem',
              padding: '0.75rem 1rem',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.875rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)',
              transition: 'all 0.3s ease',
              transform: 'translateY(0)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.6)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
            }}
          >
            + New Message
          </button>

          <button
            type="button"
            onClick={() => {
              setFolder('inbox');
              setSelectedThread(null);
            }}
            style={{
              display: 'block',
              width: '100%',
              padding: '0.75rem 1rem 0.75rem 2rem',
              background: folder === 'inbox' ? 'linear-gradient(90deg, rgba(102, 126, 234, 0.15) 0%, rgba(118, 75, 162, 0.1) 100%)' : 'transparent',
              border: 'none',
              borderLeft: folder === 'inbox' ? '4px solid #667eea' : '4px solid transparent',
              textAlign: 'left',
              fontSize: '0.875rem',
              color: folder === 'inbox' ? '#667eea' : '#374151',
              fontWeight: folder === 'inbox' ? 700 : 500,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              if (folder !== 'inbox') {
                e.currentTarget.style.background = 'rgba(102, 126, 234, 0.05)';
              }
            }}
            onMouseLeave={(e) => {
              if (folder !== 'inbox') {
                e.currentTarget.style.background = 'transparent';
              }
            }}
          >
            Inbox {inboxCount > 0 && `(${inboxCount})`}
          </button>

          <button
            type="button"
            onClick={() => {
              setFolder('sent');
              setSelectedThread(null);
            }}
            style={{
              display: 'block',
              width: '100%',
              padding: '0.75rem 1rem 0.75rem 2rem',
              background: folder === 'sent' ? 'linear-gradient(90deg, rgba(102, 126, 234, 0.15) 0%, rgba(118, 75, 162, 0.1) 100%)' : 'transparent',
              border: 'none',
              borderLeft: folder === 'sent' ? '4px solid #667eea' : '4px solid transparent',
              textAlign: 'left',
              fontSize: '0.875rem',
              color: folder === 'sent' ? '#667eea' : '#374151',
              fontWeight: folder === 'sent' ? 700 : 500,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              if (folder !== 'sent') {
                e.currentTarget.style.background = 'rgba(102, 126, 234, 0.05)';
              }
            }}
            onMouseLeave={(e) => {
              if (folder !== 'sent') {
                e.currentTarget.style.background = 'transparent';
              }
            }}
          >
            Sent {sentCount > 0 && `(${sentCount})`}
          </button>

          <button
            type="button"
            onClick={() => {
              setFolder('archived');
              setSelectedThread(null);
            }}
            style={{
              display: 'block',
              width: '100%',
              padding: '0.75rem 1rem 0.75rem 2rem',
              background: folder === 'archived' ? 'linear-gradient(90deg, rgba(102, 126, 234, 0.15) 0%, rgba(118, 75, 162, 0.1) 100%)' : 'transparent',
              border: 'none',
              borderLeft: folder === 'archived' ? '4px solid #667eea' : '4px solid transparent',
              textAlign: 'left',
              fontSize: '0.875rem',
              color: folder === 'archived' ? '#667eea' : '#374151',
              fontWeight: folder === 'archived' ? 700 : 500,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              if (folder !== 'archived') {
                e.currentTarget.style.background = 'rgba(102, 126, 234, 0.05)';
              }
            }}
            onMouseLeave={(e) => {
              if (folder !== 'archived') {
                e.currentTarget.style.background = 'transparent';
              }
            }}
          >
            Archived {archivedCount > 0 && `(${archivedCount})`}
          </button>
        </div>

        <div
          style={{
            position: 'fixed',
            bottom: '1rem',
            width: '180px',
            padding: '0.5rem 0.5rem',
            fontSize: '0.75rem',
            color: '#6b7280',
            borderTop: '1px solid #e5e7eb',
            background: '#ffffff',
          }}
        >
          <div style={{ marginBottom: '0.25rem' }}>
            <strong>Shortcuts:</strong>
          </div>
          <div>C - Compose</div>
          <div>R - Reply</div>
        </div>
      </div>

      {/* Middle - Thread List */}
      <div
        style={{
          width: '400px',
          borderRight: 'none',
          background: 'rgba(255, 255, 255, 0.95)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          backdropFilter: 'blur(10px)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '1rem',
            borderBottom: '1px solid #e5e7eb',
            background: '#f9fafb',
          }}
        >
          <h2 style={{ margin: '0 0 0.75rem 0', fontSize: '1.25rem', color: '#1f2937' }}>
            {folder.charAt(0).toUpperCase() + folder.slice(1)}
          </h2>
          <input
            type="text"
            placeholder="Search messages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              fontSize: '0.875rem',
            }}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: '1rem' }}>
              <Skeleton variant="card" height={80} />
              <div style={{ marginTop: '0.5rem' }}>
                <Skeleton variant="card" height={80} />
              </div>
            </div>
          ) : filteredThreads.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}></div>
              <p style={{ color: '#6b7280' }}>No messages in {folder}</p>
            </div>
          ) : (
            filteredThreads.map((thread) => (
              <div
                key={thread.id}
                onClick={() => handleThreadClick(thread)}
                style={{
                  padding: '1rem',
                  borderBottom: '1px solid #e5e7eb',
                  background:
                    selectedThread?.id === thread.id
                      ? '#ede9fe'
                      : thread.unreadCount > 0
                      ? '#f9fafb'
                      : '#ffffff',
                  cursor: 'pointer',
                  position: 'relative',
                }}
              >
                {thread.unreadCount > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      left: '0.5rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: '#7c3aed',
                    }}
                  />
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <div
                    style={{
                      display: 'flex',
                      gap: '0.25rem',
                    }}
                  >
                    {thread.participants.slice(0, 3).map((participant, idx) => (
                      <div
                        key={participant.id}
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: '#7c3aed',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.625rem',
                          fontWeight: 600,
                          marginLeft: idx > 0 ? '-8px' : '0',
                          border: '2px solid #ffffff',
                        }}
                        title={`${participant.firstName} ${participant.lastName}`}
                      >
                        {getParticipantInitials(participant.firstName, participant.lastName)}
                      </div>
                    ))}
                  </div>
                  {thread.patientId && (
                    <span
                      style={{
                        fontSize: '0.75rem',
                        background: '#dbeafe',
                        color: '#1e40af',
                        padding: '0.125rem 0.5rem',
                        borderRadius: '9999px',
                      }}
                    >
                      {getPatientName(thread.patientId)}
                    </span>
                  )}
                </div>

                <h3
                  style={{
                    margin: '0 0 0.25rem 0',
                    fontSize: '0.875rem',
                    fontWeight: thread.unreadCount > 0 ? 700 : 600,
                    color: '#1f2937',
                  }}
                >
                  {thread.subject}
                </h3>

                {thread.lastMessage && (
                  <p
                    style={{
                      margin: 0,
                      fontSize: '0.75rem',
                      color: '#6b7280',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {thread.lastMessage.body}
                  </p>
                )}

                <div
                  style={{
                    marginTop: '0.5rem',
                    fontSize: '0.625rem',
                    color: '#9ca3af',
                  }}
                >
                  {new Date(thread.updatedAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right - Message Detail */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(255, 255, 255, 0.95)',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
        backdropFilter: 'blur(10px)',
        overflow: 'hidden',
      }}>
        {selectedThread ? (
          <>
            {/* Thread Header */}
            <div
              style={{
                padding: '1rem',
                borderBottom: '1px solid #e5e7eb',
                background: '#f9fafb',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', color: '#1f2937' }}>
                    {selectedThread.subject}
                  </h2>
                  {selectedThread.patientId && (
                    <div
                      style={{
                        display: 'inline-block',
                        fontSize: '0.875rem',
                        background: '#dbeafe',
                        color: '#1e40af',
                        padding: '0.25rem 0.75rem',
                        borderRadius: '9999px',
                        marginBottom: '0.5rem',
                      }}
                    >
                      Patient: {getPatientName(selectedThread.patientId)}
                    </div>
                  )}
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                    Participants:{' '}
                    {selectedThread.participants.map((p) => `${p.firstName} ${p.lastName}`).join(', ')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {selectedThread.isArchived ? (
                    <button
                      type="button"
                      onClick={handleUnarchive}
                      style={{
                        padding: '0.5rem 1rem',
                        background: '#7c3aed',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '0.875rem',
                        cursor: 'pointer',
                      }}
                    >
                      Unarchive
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleArchive}
                      style={{
                        padding: '0.5rem 1rem',
                        background: '#f3f4f6',
                        color: '#374151',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '0.875rem',
                        cursor: 'pointer',
                      }}
                    >
                      Archive
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
              {messages.map((msg, idx) => {
                const senderName = msg.senderFirstName && msg.senderLastName
                  ? `${msg.senderFirstName} ${msg.senderLastName}`
                  : 'System';
                const isCurrentUser = msg.sender === session?.user.id;

                return (
                  <div
                    key={msg.id}
                    style={{
                      marginBottom: idx < messages.length - 1 ? '1rem' : 0,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.75rem',
                      }}
                    >
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: isCurrentUser ? '#7c3aed' : '#3b82f6',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          flexShrink: 0,
                        }}
                      >
                        {msg.senderFirstName && msg.senderLastName
                          ? getParticipantInitials(msg.senderFirstName, msg.senderLastName)
                          : 'SY'}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'baseline',
                            gap: '0.5rem',
                            marginBottom: '0.25rem',
                          }}
                        >
                          <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#1f2937' }}>
                            {senderName}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                            {new Date(msg.createdAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <div
                          style={{
                            background: '#f9fafb',
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            padding: '0.75rem',
                            fontSize: '0.875rem',
                            color: '#374151',
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {msg.body}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Reply Box */}
            {!selectedThread.isArchived && (
              <div
                style={{
                  padding: '1rem',
                  borderTop: '1px solid #e5e7eb',
                  background: '#ffffff',
                }}
              >
                <textarea
                  id="reply-box"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Type your reply... (Press 'r' to focus)"
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '0.875rem',
                    resize: 'vertical',
                    marginBottom: '0.5rem',
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={handleReply}
                    disabled={!replyText.trim()}
                    style={{
                      padding: '0.5rem 1.5rem',
                      background: replyText.trim() ? '#7c3aed' : '#d1d5db',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      cursor: replyText.trim() ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Send Reply
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#9ca3af',
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '4rem', marginBottom: '1rem' }}></div>
              <p style={{ fontSize: '1.125rem' }}>Select a message to view</p>
              <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                Or press <kbd style={{ background: '#f3f4f6', padding: '0.125rem 0.5rem', borderRadius: '4px' }}>C</kbd> to compose a new message
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Compose Modal */}
      <Modal
        isOpen={showComposeModal}
        title="New Message"
        onClose={() => {
          setShowComposeModal(false);
          setNewThread({
            subject: '',
            patientId: '',
            participantIds: [],
            message: '',
          });
        }}
        size="lg"
      >
        <div style={{ padding: '1rem' }}>
          <div style={{ marginBottom: '1rem' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#374151',
              }}
            >
              To (Staff Members) *
            </label>
            <select
              multiple
              value={newThread.participantIds}
              onChange={(e) => {
                const selected = Array.from(e.target.selectedOptions, (option) => option.value);
                setNewThread((prev) => ({ ...prev, participantIds: selected }));
              }}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '0.875rem',
                minHeight: '100px',
              }}
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName || p.name}
                </option>
              ))}
            </select>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
              Hold Ctrl/Cmd to select multiple recipients
            </p>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#374151',
              }}
            >
              Link to Patient (Optional)
            </label>
            <select
              value={newThread.patientId || ''}
              onChange={(e) => setNewThread((prev) => ({ ...prev, patientId: e.target.value }))}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '0.875rem',
              }}
            >
              <option value="">No Patient Link</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.lastName}, {p.firstName}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#374151',
              }}
            >
              Subject *
            </label>
            <input
              type="text"
              value={newThread.subject}
              onChange={(e) => setNewThread((prev) => ({ ...prev, subject: e.target.value }))}
              placeholder="Message subject..."
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '0.875rem',
              }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#374151',
              }}
            >
              Message *
            </label>
            <textarea
              value={newThread.message}
              onChange={(e) => setNewThread((prev) => ({ ...prev, message: e.target.value }))}
              placeholder="Type your message..."
              rows={8}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '0.875rem',
                resize: 'vertical',
              }}
            />
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.5rem',
            padding: '1rem',
            borderTop: '1px solid #e5e7eb',
            background: '#f9fafb',
          }}
        >
          <button
            type="button"
            onClick={() => {
              setShowComposeModal(false);
              setNewThread({
                subject: '',
                patientId: '',
                participantIds: [],
                message: '',
              });
            }}
            style={{
              padding: '0.5rem 1rem',
              background: '#f3f4f6',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreateThread}
            disabled={sending || !newThread.subject || !newThread.message || newThread.participantIds.length === 0}
            style={{
              padding: '0.5rem 1.5rem',
              background:
                !sending && newThread.subject && newThread.message && newThread.participantIds.length > 0
                  ? '#7c3aed'
                  : '#d1d5db',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor:
                !sending && newThread.subject && newThread.message && newThread.participantIds.length > 0
                  ? 'pointer'
                  : 'not-allowed',
            }}
          >
            {sending ? 'Sending...' : 'Send Message'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
