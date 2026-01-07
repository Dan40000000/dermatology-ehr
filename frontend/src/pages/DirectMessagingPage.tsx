import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Panel, Modal, Button, Skeleton } from '../components/ui';
import {
  fetchDirectMessages,
  sendDirectMessage,
  fetchDirectContacts,
  createDirectContact,
  markDirectMessageRead,
  fetchDirectStats,
} from '../api-direct';
import type { DirectMessage, DirectContact } from '../api-direct';
import { fetchPatients, fetchDocuments } from '../api';

type TabType = 'inbox' | 'sent';

export function DirectMessagingPage() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

  const [activeTab, setActiveTab] = useState<TabType>('inbox');
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [contacts, setContacts] = useState<DirectContact[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [patients, setPatients] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [unreadOnlyFilter, setUnreadOnlyFilter] = useState(false);
  const [favoriteContactsOnly, setFavoriteContactsOnly] = useState(false);

  // Modals
  const [showComposeModal, setShowComposeModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showContactsModal, setShowContactsModal] = useState(false);
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<DirectMessage | null>(null);
  const [sending, setSending] = useState(false);

  // Compose form
  const [composeForm, setComposeForm] = useState({
    toAddress: '',
    subject: '',
    body: '',
    attachments: [] as Array<{ filename: string; url: string; size?: number; mimeType?: string }>,
  });

  // Add contact form
  const [contactForm, setContactForm] = useState({
    providerName: '',
    specialty: '',
    organization: '',
    directAddress: '',
    phone: '',
    fax: '',
    address: '',
    notes: '',
    isFavorite: false,
  });

  const loadData = useCallback(async () => {
    if (!session) return;

    setLoading(true);
    try {
      const folder = activeTab === 'inbox' ? 'inbox' : 'sent';
      const [messagesRes, contactsRes, statsRes, patientsRes, documentsRes] = await Promise.all([
        fetchDirectMessages(session.tenantId, session.accessToken, folder),
        fetchDirectContacts(session.tenantId, session.accessToken),
        fetchDirectStats(session.tenantId, session.accessToken),
        fetchPatients(session.tenantId, session.accessToken),
        fetchDocuments(session.tenantId, session.accessToken),
      ]);

      setMessages(messagesRes.messages || []);
      setContacts(contactsRes.contacts || []);
      setStats(statsRes);
      setPatients(patientsRes.patients || []);
      setDocuments(documentsRes.documents || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [session, activeTab, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSendMessage = async () => {
    if (!session || !composeForm.toAddress || !composeForm.subject) {
      showError('Please fill in required fields (recipient and subject)');
      return;
    }

    setSending(true);
    try {
      const result = await sendDirectMessage(session.tenantId, session.accessToken, {
        toAddress: composeForm.toAddress,
        subject: composeForm.subject,
        body: composeForm.body || undefined,
        attachments: composeForm.attachments.length > 0 ? composeForm.attachments : undefined,
      });

      if (result.status === 'delivered') {
        showSuccess(`Direct message sent successfully (${result.transmissionId})`);
      } else {
        showError(result.errorMessage || 'Message send failed');
      }

      setShowComposeModal(false);
      setComposeForm({
        toAddress: '',
        subject: '',
        body: '',
        attachments: [],
      });
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleAddContact = async () => {
    if (!session || !contactForm.providerName || !contactForm.directAddress) {
      showError('Please fill in provider name and Direct address');
      return;
    }

    try {
      await createDirectContact(session.tenantId, session.accessToken, {
        providerName: contactForm.providerName,
        specialty: contactForm.specialty || undefined,
        organization: contactForm.organization || undefined,
        directAddress: contactForm.directAddress,
        phone: contactForm.phone || undefined,
        fax: contactForm.fax || undefined,
        address: contactForm.address || undefined,
        notes: contactForm.notes || undefined,
        isFavorite: contactForm.isFavorite,
      });

      showSuccess('Contact added successfully');
      setShowAddContactModal(false);
      setContactForm({
        providerName: '',
        specialty: '',
        organization: '',
        directAddress: '',
        phone: '',
        fax: '',
        address: '',
        notes: '',
        isFavorite: false,
      });
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to add contact');
    }
  };

  const handleViewMessage = async (message: DirectMessage) => {
    setSelectedMessage(message);
    setShowViewModal(true);

    // Mark as read
    if (activeTab === 'inbox' && !message.readAt && session) {
      await markDirectMessageRead(session.tenantId, session.accessToken, message.id, true);
      loadData();
    }
  };

  const handleSelectContact = (contact: DirectContact) => {
    setComposeForm((prev) => ({
      ...prev,
      toAddress: contact.directAddress,
    }));
    setShowContactsModal(false);
    setShowComposeModal(true);
  };

  const getFilteredMessages = () => {
    return messages.filter((msg) => {
      if (unreadOnlyFilter && activeTab === 'inbox' && msg.readAt) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const subject = (msg.subject || '').toLowerCase();
        const fromAddress = (msg.fromAddress || '').toLowerCase();
        const toAddress = (msg.toAddress || '').toLowerCase();
        const body = (msg.body || '').toLowerCase();
        if (
          !subject.includes(term) &&
          !fromAddress.includes(term) &&
          !toAddress.includes(term) &&
          !body.includes(term)
        ) {
          return false;
        }
      }
      return true;
    });
  };

  const getFilteredContacts = () => {
    return contacts.filter((contact) => {
      if (favoriteContactsOnly && !contact.isFavorite) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const name = (contact.providerName || '').toLowerCase();
        const org = (contact.organization || '').toLowerCase();
        const address = (contact.directAddress || '').toLowerCase();
        if (!name.includes(term) && !org.includes(term) && !address.includes(term)) {
          return false;
        }
      }
      return true;
    });
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const filteredMessages = getFilteredMessages();
  const filteredContacts = getFilteredContacts();

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '1.875rem', color: '#1f2937' }}>
            Direct Secure Messaging
          </h1>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280' }}>
            HIPAA-compliant provider-to-provider communication
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button onClick={() => setShowContactsModal(true)} variant="secondary">
            Provider Directory
          </Button>
          <Button onClick={() => setShowComposeModal(true)} variant="primary">
            + Compose Message
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '1rem',
            marginBottom: '1.5rem',
          }}
        >
          <div
            style={{
              background: '#dbeafe',
              padding: '1.25rem',
              borderRadius: '8px',
              border: '1px solid #93c5fd',
            }}
          >
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#1e40af', marginBottom: '0.25rem' }}>
              {stats.inboxTotal}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#1e40af' }}>Total Received</div>
          </div>
          <div
            style={{
              background: '#fef3c7',
              padding: '1.25rem',
              borderRadius: '8px',
              border: '1px solid #fcd34d',
            }}
          >
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#b45309', marginBottom: '0.25rem' }}>
              {stats.unreadTotal}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#b45309' }}>Unread Messages</div>
          </div>
          <div
            style={{
              background: '#dcfce7',
              padding: '1.25rem',
              borderRadius: '8px',
              border: '1px solid #86efac',
            }}
          >
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#15803d', marginBottom: '0.25rem' }}>
              {stats.sentTotal}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#15803d' }}>Sent Messages</div>
          </div>
          <div
            style={{
              background: '#d1fae5',
              padding: '1.25rem',
              borderRadius: '8px',
              border: '1px solid #6ee7b7',
            }}
          >
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#047857', marginBottom: '0.25rem' }}>
              {stats.deliveredTotal}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#047857' }}>Delivered</div>
          </div>
          <div
            style={{
              background: '#fee2e2',
              padding: '1.25rem',
              borderRadius: '8px',
              border: '1px solid #fca5a5',
            }}
          >
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#dc2626', marginBottom: '0.25rem' }}>
              {stats.failedTotal}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#dc2626' }}>Failed</div>
          </div>
        </div>
      )}

      {/* Tabs and Filters */}
      <Panel>
        <div style={{ padding: '1rem', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
            <button
              type="button"
              onClick={() => {
                setActiveTab('inbox');
                setUnreadOnlyFilter(false);
              }}
              style={{
                padding: '0.5rem 1.5rem',
                background: activeTab === 'inbox' ? '#7c3aed' : '#f3f4f6',
                color: activeTab === 'inbox' ? '#ffffff' : '#374151',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Inbox {stats && `(${stats.inboxTotal})`}
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('sent');
                setUnreadOnlyFilter(false);
              }}
              style={{
                padding: '0.5rem 1.5rem',
                background: activeTab === 'sent' ? '#7c3aed' : '#f3f4f6',
                color: activeTab === 'sent' ? '#ffffff' : '#374151',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Sent {stats && `(${stats.sentTotal})`}
            </button>
          </div>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search messages..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                flex: 1,
                minWidth: '250px',
                padding: '0.5rem 1rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.875rem',
              }}
            />
            {activeTab === 'inbox' && (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.875rem',
                  color: '#374151',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={unreadOnlyFilter}
                  onChange={(e) => setUnreadOnlyFilter(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                Unread only
              </label>
            )}
          </div>
        </div>

        {/* Messages List */}
        <div style={{ padding: '1rem' }}>
          {loading ? (
            <>
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} variant="card" height={80} style={{ marginBottom: '0.75rem' }} />
              ))}
            </>
          ) : filteredMessages.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}></div>
              <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                No messages in {activeTab}
              </p>
            </div>
          ) : (
            filteredMessages.map((msg) => (
              <div
                key={msg.id}
                onClick={() => handleViewMessage(msg)}
                style={{
                  padding: '1rem',
                  background: msg.readAt ? '#ffffff' : '#f9fafb',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  marginBottom: '0.75rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                      {!msg.readAt && activeTab === 'inbox' && (
                        <div
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: '#7c3aed',
                          }}
                        />
                      )}
                      <h3
                        style={{
                          margin: 0,
                          fontSize: '0.9375rem',
                          fontWeight: msg.readAt ? 600 : 700,
                          color: '#1f2937',
                        }}
                      >
                        {msg.subject}
                      </h3>
                      {msg.status === 'failed' && (
                        <span
                          style={{
                            padding: '0.125rem 0.5rem',
                            background: '#fee2e2',
                            color: '#dc2626',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            borderRadius: '9999px',
                          }}
                        >
                          Failed
                        </span>
                      )}
                      {msg.status === 'delivered' && activeTab === 'sent' && (
                        <span
                          style={{
                            padding: '0.125rem 0.5rem',
                            background: '#dcfce7',
                            color: '#15803d',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            borderRadius: '9999px',
                          }}
                        >
                          Delivered
                        </span>
                      )}
                    </div>
                    <p style={{ margin: '0.25rem 0', fontSize: '0.8125rem', color: '#6b7280' }}>
                      {activeTab === 'inbox' ? `From: ${msg.fromAddress}` : `To: ${msg.toAddress}`}
                    </p>
                    {msg.body && (
                      <p
                        style={{
                          margin: '0.5rem 0 0 0',
                          fontSize: '0.875rem',
                          color: '#374151',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {msg.body.substring(0, 150)}
                        {msg.body.length > 150 && '...'}
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.75rem', color: '#9ca3af', whiteSpace: 'nowrap' }}>
                      {formatDate(msg.sentAt)}
                    </span>
                    {msg.attachments && msg.attachments.length > 0 && (
                      <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        {msg.attachments.length}
                      </span>
                    )}
                    {msg.transmissionId && (
                      <span style={{ fontSize: '0.625rem', color: '#9ca3af', fontFamily: 'monospace' }}>
                        {msg.transmissionId}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </Panel>

      {/* Compose Message Modal */}
      <Modal
        isOpen={showComposeModal}
        title="Compose Direct Message"
        onClose={() => {
          setShowComposeModal(false);
          setComposeForm({
            toAddress: '',
            subject: '',
            body: '',
            attachments: [],
          });
        }}
        size="lg"
      >
        <div style={{ padding: '1.5rem' }}>
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
              To (Direct Address) *
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="email"
                value={composeForm.toAddress}
                onChange={(e) => setComposeForm((prev) => ({ ...prev, toAddress: e.target.value }))}
                placeholder="provider@practice.direct"
                style={{
                  flex: 1,
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                }}
              />
              <Button onClick={() => setShowContactsModal(true)} variant="secondary">
                Browse Directory
              </Button>
            </div>
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
              value={composeForm.subject}
              onChange={(e) => setComposeForm((prev) => ({ ...prev, subject: e.target.value }))}
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
              Message Body
            </label>
            <textarea
              value={composeForm.body}
              onChange={(e) => setComposeForm((prev) => ({ ...prev, body: e.target.value }))}
              placeholder="Type your secure message..."
              rows={8}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '0.875rem',
                resize: 'vertical',
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
              Attachments (Optional)
            </label>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem' }}>
              Attach patient records, lab results, images, or other clinical documents
            </p>
            {composeForm.attachments.length > 0 && (
              <div style={{ marginBottom: '0.5rem' }}>
                {composeForm.attachments.map((att, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.5rem',
                      background: '#f9fafb',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px',
                      marginBottom: '0.5rem',
                    }}
                  >
                    <span style={{ fontSize: '0.875rem', color: '#374151' }}>{att.filename}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setComposeForm((prev) => ({
                          ...prev,
                          attachments: prev.attachments.filter((_, i) => i !== idx),
                        }));
                      }}
                      style={{
                        padding: '0.25rem 0.5rem',
                        background: '#fee2e2',
                        color: '#dc2626',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: '0.75rem', color: '#9ca3af', fontStyle: 'italic' }}>
              Note: In production, this would allow selecting documents from the patient chart
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem',
            padding: '1rem 1.5rem',
            borderTop: '1px solid #e5e7eb',
            background: '#f9fafb',
          }}
        >
          <Button
            onClick={() => {
              setShowComposeModal(false);
              setComposeForm({
                toAddress: '',
                subject: '',
                body: '',
                attachments: [],
              });
            }}
            variant="secondary"
          >
            Cancel
          </Button>
          <Button onClick={handleSendMessage} variant="primary" disabled={sending || !composeForm.toAddress || !composeForm.subject}>
            {sending ? 'Sending...' : 'Send Secure Message'}
          </Button>
        </div>
      </Modal>

      {/* View Message Modal */}
      <Modal
        isOpen={showViewModal}
        title={selectedMessage?.subject || 'Message'}
        onClose={() => {
          setShowViewModal(false);
          setSelectedMessage(null);
        }}
        size="lg"
      >
        {selectedMessage && (
          <div style={{ padding: '1.5rem' }}>
            <div
              style={{
                marginBottom: '1.5rem',
                padding: '1rem',
                background: '#f9fafb',
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
              }}
            >
              <div style={{ marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600 }}>FROM:</span>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#1f2937' }}>
                  {selectedMessage.fromAddress}
                  {selectedMessage.sentByName && (
                    <span style={{ color: '#6b7280' }}> ({selectedMessage.sentByName})</span>
                  )}
                </p>
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600 }}>TO:</span>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#1f2937' }}>
                  {selectedMessage.toAddress}
                </p>
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600 }}>SENT:</span>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#1f2937' }}>
                  {formatDate(selectedMessage.sentAt)}
                </p>
              </div>
              {selectedMessage.deliveredAt && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600 }}>DELIVERED:</span>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#15803d' }}>
                    {formatDate(selectedMessage.deliveredAt)}
                  </p>
                </div>
              )}
              {selectedMessage.transmissionId && (
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600 }}>TRANSMISSION ID:</span>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: '#374151', fontFamily: 'monospace' }}>
                    {selectedMessage.transmissionId}
                  </p>
                </div>
              )}
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', color: '#1f2937' }}>Message</h3>
              <div
                style={{
                  padding: '1rem',
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  whiteSpace: 'pre-wrap',
                  fontSize: '0.875rem',
                  color: '#374151',
                  lineHeight: '1.6',
                }}
              >
                {selectedMessage.body || <em style={{ color: '#9ca3af' }}>No message body</em>}
              </div>
            </div>

            {selectedMessage.attachments && selectedMessage.attachments.length > 0 && (
              <div>
                <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', color: '#1f2937' }}>Attachments</h3>
                {selectedMessage.attachments.map((att, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '0.75rem',
                      background: '#f9fafb',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      marginBottom: '0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.875rem', color: '#1f2937', fontWeight: 600 }}>
                        {att.filename}
                      </div>
                      {att.size && (
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                          {(att.size / 1024).toFixed(1)} KB
                        </div>
                      )}
                    </div>
                    <Button variant="secondary" size="sm">
                      Download
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {selectedMessage.errorMessage && (
              <div
                style={{
                  marginTop: '1rem',
                  padding: '1rem',
                  background: '#fee2e2',
                  border: '1px solid #fca5a5',
                  borderRadius: '8px',
                }}
              >
                <div style={{ fontSize: '0.875rem', color: '#dc2626', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Delivery Failed
                </div>
                <div style={{ fontSize: '0.8125rem', color: '#b91c1c' }}>
                  {selectedMessage.errorMessage}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Provider Directory Modal */}
      <Modal
        isOpen={showContactsModal}
        title="Provider Directory"
        onClose={() => {
          setShowContactsModal(false);
          setSearchTerm('');
          setFavoriteContactsOnly(false);
        }}
        size="lg"
      >
        <div style={{ padding: '1.5rem' }}>
          <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search providers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                flex: 1,
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '0.875rem',
              }}
            />
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.875rem',
                color: '#374151',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              <input
                type="checkbox"
                checked={favoriteContactsOnly}
                onChange={(e) => setFavoriteContactsOnly(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              Favorites
            </label>
            <Button onClick={() => setShowAddContactModal(true)} variant="primary">
              + Add Contact
            </Button>
          </div>

          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {filteredContacts.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                No contacts found
              </div>
            ) : (
              filteredContacts.map((contact) => (
                <div
                  key={contact.id}
                  onClick={() => handleSelectContact(contact)}
                  style={{
                    padding: '1rem',
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    marginBottom: '0.75rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <h4 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 600, color: '#1f2937' }}>
                          {contact.providerName}
                        </h4>
                        {contact.isFavorite && <span></span>}
                      </div>
                      {contact.specialty && (
                        <p style={{ margin: '0.125rem 0', fontSize: '0.8125rem', color: '#6b7280' }}>
                          {contact.specialty}
                        </p>
                      )}
                      {contact.organization && (
                        <p style={{ margin: '0.125rem 0', fontSize: '0.8125rem', color: '#6b7280' }}>
                          {contact.organization}
                        </p>
                      )}
                      <p
                        style={{
                          margin: '0.5rem 0 0 0',
                          fontSize: '0.8125rem',
                          color: '#7c3aed',
                          fontFamily: 'monospace',
                        }}
                      >
                        {contact.directAddress}
                      </p>
                      {(contact.phone || contact.fax) && (
                        <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#9ca3af' }}>
                          {contact.phone && <span style={{ marginRight: '1rem' }}>{contact.phone}</span>}
                          {contact.fax && <span>{contact.fax}</span>}
                        </div>
                      )}
                    </div>
                    <Button variant="primary" size="sm">
                      Select
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>

      {/* Add Contact Modal */}
      <Modal
        isOpen={showAddContactModal}
        title="Add Provider Contact"
        onClose={() => {
          setShowAddContactModal(false);
          setContactForm({
            providerName: '',
            specialty: '',
            organization: '',
            directAddress: '',
            phone: '',
            fax: '',
            address: '',
            notes: '',
            isFavorite: false,
          });
        }}
        size="md"
      >
        <div style={{ padding: '1.5rem' }}>
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
              Provider Name *
            </label>
            <input
              type="text"
              value={contactForm.providerName}
              onChange={(e) => setContactForm((prev) => ({ ...prev, providerName: e.target.value }))}
              placeholder="Dr. Jane Smith"
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
              Specialty
            </label>
            <input
              type="text"
              value={contactForm.specialty}
              onChange={(e) => setContactForm((prev) => ({ ...prev, specialty: e.target.value }))}
              placeholder="e.g., Dermatopathology, Rheumatology"
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
              Organization
            </label>
            <input
              type="text"
              value={contactForm.organization}
              onChange={(e) => setContactForm((prev) => ({ ...prev, organization: e.target.value }))}
              placeholder="Medical Group or Hospital"
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
              Direct Address *
            </label>
            <input
              type="email"
              value={contactForm.directAddress}
              onChange={(e) => setContactForm((prev) => ({ ...prev, directAddress: e.target.value }))}
              placeholder="provider@practice.direct"
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '0.875rem',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label
                style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: '#374151',
                }}
              >
                Phone
              </label>
              <input
                type="tel"
                value={contactForm.phone}
                onChange={(e) => setContactForm((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="555-0123"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                }}
              />
            </div>
            <div>
              <label
                style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: '#374151',
                }}
              >
                Fax
              </label>
              <input
                type="tel"
                value={contactForm.fax}
                onChange={(e) => setContactForm((prev) => ({ ...prev, fax: e.target.value }))}
                placeholder="555-0124"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                }}
              />
            </div>
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
              Notes
            </label>
            <textarea
              value={contactForm.notes}
              onChange={(e) => setContactForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Referral notes, preferred for certain conditions, etc."
              rows={3}
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

          <div>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.875rem',
                color: '#374151',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={contactForm.isFavorite}
                onChange={(e) => setContactForm((prev) => ({ ...prev, isFavorite: e.target.checked }))}
                style={{ cursor: 'pointer' }}
              />
              Mark as favorite
            </label>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem',
            padding: '1rem 1.5rem',
            borderTop: '1px solid #e5e7eb',
            background: '#f9fafb',
          }}
        >
          <Button
            onClick={() => {
              setShowAddContactModal(false);
              setContactForm({
                providerName: '',
                specialty: '',
                organization: '',
                directAddress: '',
                phone: '',
                fax: '',
                address: '',
                notes: '',
                isFavorite: false,
              });
            }}
            variant="secondary"
          >
            Cancel
          </Button>
          <Button onClick={handleAddContact} variant="primary" disabled={!contactForm.providerName || !contactForm.directAddress}>
            Add Contact
          </Button>
        </div>
      </Modal>
    </div>
  );
}
