import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Panel, Modal, Button, Skeleton } from '../components/ui';
import {
  fetchFaxInbox,
  fetchFaxOutbox,
  fetchFaxStats,
  sendFax,
  updateFax,
  deleteFax,
  fetchFaxPdf,
  simulateIncomingFax,
  fetchPatients,
  fetchDocuments,
} from '../api';

type TabType = 'inbox' | 'outbox';
type FaxStatus = 'all' | 'received' | 'sending' | 'sent' | 'failed';

interface Fax {
  id: string;
  direction: 'inbound' | 'outbound';
  fromNumber: string;
  toNumber: string;
  subject: string;
  pages: number;
  status: string;
  receivedAt?: string;
  sentAt?: string;
  transmissionId?: string;
  pdfUrl?: string;
  patientId?: string;
  patientName?: string;
  encounterId?: string;
  read?: boolean;
  notes?: string;
  assignedTo?: string;
  assignedToEmail?: string;
  errorMessage?: string;
  sentBy?: string;
  sentByEmail?: string;
  createdAt: string;
}

interface FaxStats {
  inboundTotal: number;
  unreadTotal: number;
  outboundTotal: number;
  sendingTotal: number;
  sentTotal: number;
  failedTotal: number;
}

export function FaxPage() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

  const [activeTab, setActiveTab] = useState<TabType>('inbox');
  const [loading, setLoading] = useState(true);
  const [inboxFaxes, setInboxFaxes] = useState<Fax[]>([]);
  const [outboxFaxes, setOutboxFaxes] = useState<Fax[]>([]);
  const [stats, setStats] = useState<FaxStats | null>(null);
  const [patients, setPatients] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);

  // Filters
  const [statusFilter, setStatusFilter] = useState<FaxStatus>('all');
  const [patientFilter, setPatientFilter] = useState<string>('all');
  const [unreadOnlyFilter, setUnreadOnlyFilter] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [showSendModal, setShowSendModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedFax, setSelectedFax] = useState<Fax | null>(null);
  const [sending, setSending] = useState(false);

  // Send fax form
  const [sendForm, setSendForm] = useState({
    recipientNumber: '',
    recipientName: '',
    subject: '',
    coverPageMessage: '',
    patientId: '',
    encounterId: '',
    documentIds: [] as string[],
    pages: 1,
  });

  // Assign form
  const [assignForm, setAssignForm] = useState({
    patientId: '',
    notes: '',
  });

  const loadData = useCallback(async () => {
    if (!session) return;

    setLoading(true);
    try {
      const [inboxRes, outboxRes, statsRes, patientsRes, docsRes] = await Promise.all([
        fetchFaxInbox(session.tenantId, session.accessToken),
        fetchFaxOutbox(session.tenantId, session.accessToken),
        fetchFaxStats(session.tenantId, session.accessToken),
        fetchPatients(session.tenantId, session.accessToken),
        fetchDocuments(session.tenantId, session.accessToken),
      ]);

      setInboxFaxes(inboxRes.faxes || []);
      setOutboxFaxes(outboxRes.faxes || []);
      setStats(statsRes);
      setPatients(patientsRes.patients || []);
      setDocuments(docsRes.documents || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load fax data');
    } finally {
      setLoading(false);
    }
  }, [session, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSendFax = async () => {
    if (!session) return;
    if (!sendForm.recipientNumber || !sendForm.subject) {
      showError('Recipient number and subject are required');
      return;
    }

    setSending(true);
    try {
      await sendFax(session.tenantId, session.accessToken, {
        ...sendForm,
        pages: sendForm.pages || 1,
      });

      showSuccess('Fax is being sent');
      setShowSendModal(false);
      setSendForm({
        recipientNumber: '',
        recipientName: '',
        subject: '',
        coverPageMessage: '',
        patientId: '',
        encounterId: '',
        documentIds: [],
        pages: 1,
      });

      // Reload after 2 seconds to see status update
      setTimeout(loadData, 2000);
    } catch (err: any) {
      showError(err.message || 'Failed to send fax');
    } finally {
      setSending(false);
    }
  };

  const handleMarkAsRead = async (fax: Fax, read: boolean) => {
    if (!session) return;

    try {
      await updateFax(session.tenantId, session.accessToken, fax.id, { read });
      showSuccess(read ? 'Marked as read' : 'Marked as unread');
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to update fax');
    }
  };

  const handleAssignToPatient = async () => {
    if (!session || !selectedFax) return;

    try {
      await updateFax(session.tenantId, session.accessToken, selectedFax.id, {
        patientId: assignForm.patientId,
        notes: assignForm.notes,
      });

      showSuccess('Fax assigned to patient');
      setShowAssignModal(false);
      setSelectedFax(null);
      setAssignForm({ patientId: '', notes: '' });
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to assign fax');
    }
  };

  const handleRetryFax = async (fax: Fax) => {
    if (!session) return;

    try {
      await sendFax(session.tenantId, session.accessToken, {
        recipientNumber: fax.toNumber,
        subject: fax.subject,
        pages: fax.pages,
        patientId: fax.patientId,
        encounterId: fax.encounterId,
      });

      showSuccess('Fax is being resent');

      // Delete the old failed fax
      await deleteFax(session.tenantId, session.accessToken, fax.id);

      // Reload after 2 seconds to see status update
      setTimeout(loadData, 2000);
    } catch (err: any) {
      showError(err.message || 'Failed to retry fax');
    }
  };

  const handleDownloadFax = async (fax: Fax) => {
    if (!session) return;

    try {
      const pdfData = await fetchFaxPdf(session.tenantId, session.accessToken, fax.id);

      if (pdfData.pdfUrl) {
        // Create a link and trigger download
        const link = document.createElement('a');
        link.href = pdfData.pdfUrl;
        link.download = `fax-${fax.subject}-${fax.id}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showSuccess('Fax download started');
      } else {
        showError('PDF not available for download');
      }
    } catch (err: any) {
      showError(err.message || 'Failed to download fax');
    }
  };

  const handleDeleteFax = async (fax: Fax) => {
    if (!session) return;
    if (!confirm(`Delete fax "${fax.subject}"?`)) return;

    try {
      await deleteFax(session.tenantId, session.accessToken, fax.id);
      showSuccess('Fax deleted');
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to delete fax');
    }
  };

  const handlePreviewFax = async (fax: Fax) => {
    setSelectedFax(fax);
    setShowPreviewModal(true);

    // Mark as read when previewed
    if (fax.direction === 'inbound' && !fax.read && session) {
      await updateFax(session.tenantId, session.accessToken, fax.id, { read: true });
      loadData();
    }
  };

  const handleSimulateIncoming = async () => {
    if (!session) return;

    try {
      await simulateIncomingFax(session.tenantId, session.accessToken);
      showSuccess('Simulated incoming fax received');
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to simulate incoming fax');
    }
  };

  const getFilteredFaxes = () => {
    const faxes = activeTab === 'inbox' ? inboxFaxes : outboxFaxes;

    return faxes.filter((fax) => {
      if (statusFilter !== 'all' && fax.status !== statusFilter) return false;
      if (patientFilter !== 'all' && fax.patientId !== patientFilter) return false;
      if (unreadOnlyFilter && activeTab === 'inbox' && fax.read) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const subject = (fax.subject || '').toLowerCase();
        const fromNumber = (fax.fromNumber || '').toLowerCase();
        const toNumber = (fax.toNumber || '').toLowerCase();
        const patientName = (fax.patientName || '').toLowerCase();
        if (
          !subject.includes(term) &&
          !fromNumber.includes(term) &&
          !toNumber.includes(term) &&
          !patientName.includes(term)
        ) {
          return false;
        }
      }
      return true;
    });
  };

  const formatPhoneNumber = (num: string) => {
    const cleaned = num.replace(/\D/g, '');
    if (cleaned.length === 11 && cleaned[0] === '1') {
      return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    }
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    return num;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = diff / (1000 * 60 * 60);

    if (hours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { label: string; color: string }> = {
      received: { label: 'Received', color: 'bg-green-100 text-green-800' },
      sending: { label: 'Sending...', color: 'bg-yellow-100 text-yellow-800' },
      sent: { label: 'Sent', color: 'bg-blue-100 text-blue-800' },
      failed: { label: 'Failed', color: 'bg-red-100 text-red-800' },
    };

    const badge = badges[status] || { label: status, color: 'bg-gray-100 text-gray-800' };

    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.color}`}
      >
        {badge.label}
      </span>
    );
  };

  const filteredFaxes = getFilteredFaxes();

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' }}>Fax Management</h1>
        <p style={{ color: '#6b7280' }}>Send and receive faxes for patient care coordination</p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#3b82f6' }}>{stats.unreadTotal}</div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>Unread Faxes</div>
          </div>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#10b981' }}>{stats.inboundTotal}</div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>Total Received</div>
          </div>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#8b5cf6' }}>{stats.sentTotal}</div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>Successfully Sent</div>
          </div>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#ef4444' }}>{stats.failedTotal}</div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>Failed</div>
          </div>
        </div>
      )}

      <Panel>
        {/* Tabs and Actions */}
        <div style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                onClick={() => setActiveTab('inbox')}
                style={{
                  padding: '0.5rem 1rem',
                  border: 'none',
                  background: activeTab === 'inbox' ? '#3b82f6' : 'transparent',
                  color: activeTab === 'inbox' ? 'white' : '#6b7280',
                  borderRadius: '0.375rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Inbox {stats && `(${stats.inboundTotal})`}
              </button>
              <button
                onClick={() => setActiveTab('outbox')}
                style={{
                  padding: '0.5rem 1rem',
                  border: 'none',
                  background: activeTab === 'outbox' ? '#3b82f6' : 'transparent',
                  color: activeTab === 'outbox' ? 'white' : '#6b7280',
                  borderRadius: '0.375rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Outbox {stats && `(${stats.outboundTotal})`}
              </button>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {activeTab === 'inbox' && (
                <Button variant="outline" onClick={handleSimulateIncoming}>
                  Simulate Incoming
                </Button>
              )}
              <Button onClick={() => setShowSendModal(true)}>
                Send Fax
              </Button>
            </div>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Search faxes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                padding: '0.5rem 1rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                flex: 1,
                minWidth: '200px',
              }}
            />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as FaxStatus)}
              style={{
                padding: '0.5rem 1rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
              }}
            >
              <option value="all">All Status</option>
              {activeTab === 'inbox' ? (
                <option value="received">Received</option>
              ) : (
                <>
                  <option value="sending">Sending</option>
                  <option value="sent">Sent</option>
                  <option value="failed">Failed</option>
                </>
              )}
            </select>

            <select
              value={patientFilter}
              onChange={(e) => setPatientFilter(e.target.value)}
              style={{
                padding: '0.5rem 1rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
              }}
            >
              <option value="all">All Patients</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.lastName}, {p.firstName}
                </option>
              ))}
            </select>

            {activeTab === 'inbox' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0 1rem' }}>
                <input
                  type="checkbox"
                  checked={unreadOnlyFilter}
                  onChange={(e) => setUnreadOnlyFilter(e.target.checked)}
                />
                <span style={{ fontSize: '0.875rem' }}>Unread only</span>
              </label>
            )}
          </div>
        </div>

        {/* Fax List */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} height={80} />
            ))}
          </div>
        ) : filteredFaxes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}></div>
            <div style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              {activeTab === 'inbox' ? 'No faxes received' : 'No faxes sent'}
            </div>
            <div style={{ fontSize: '0.875rem' }}>
              {activeTab === 'inbox'
                ? 'Incoming faxes will appear here'
                : 'Send your first fax to get started'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {filteredFaxes.map((fax) => (
              <div
                key={fax.id}
                style={{
                  padding: '1rem',
                  border: fax.direction === 'inbound' && !fax.read ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                  background: fax.direction === 'inbound' && !fax.read ? '#eff6ff' : 'white',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  position: 'relative',
                }}
                onClick={() => handlePreviewFax(fax)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {fax.direction === 'inbound' && !fax.read && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '-4px',
                      right: '-4px',
                      width: '12px',
                      height: '12px',
                      background: '#3b82f6',
                      borderRadius: '50%',
                      border: '2px solid white',
                    }}
                    title="Unread"
                  />
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                      <div style={{ fontSize: '1.5rem' }}>
                        {fax.direction === 'inbound' ? '' : ''}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {fax.subject}
                          {fax.direction === 'inbound' && !fax.read && (
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#3b82f6' }}>NEW</span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                          {fax.direction === 'inbound'
                            ? `From: ${formatPhoneNumber(fax.fromNumber)}`
                            : `To: ${formatPhoneNumber(fax.toNumber)}`}
                          {fax.patientName && ` • Patient: ${fax.patientName}`}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
                      <span>{fax.pages} page{fax.pages !== 1 ? 's' : ''}</span>
                      <span>
                        {fax.direction === 'inbound' && fax.receivedAt
                          ? formatDate(fax.receivedAt)
                          : fax.sentAt
                          ? formatDate(fax.sentAt)
                          : formatDate(fax.createdAt)}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    {getStatusBadge(fax.status)}

                    {fax.direction === 'inbound' && (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMarkAsRead(fax, !fax.read);
                          }}
                          style={{
                            padding: '0.375rem 0.75rem',
                            fontSize: '0.75rem',
                            border: '1px solid #d1d5db',
                            borderRadius: '0.375rem',
                            background: 'white',
                            cursor: 'pointer',
                          }}
                          title={fax.read ? 'Mark as unread' : 'Mark as read'}
                        >
                          {fax.read ? 'Read' : 'Unread'}
                        </button>

                        {!fax.patientId && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedFax(fax);
                              setShowAssignModal(true);
                            }}
                            style={{
                              padding: '0.375rem 0.75rem',
                              fontSize: '0.75rem',
                              border: '1px solid #d1d5db',
                              borderRadius: '0.375rem',
                              background: 'white',
                              cursor: 'pointer',
                            }}
                            title="Assign to patient"
                          >
                            Assign
                          </button>
                        )}
                      </div>
                    )}

                    {fax.direction === 'outbound' && fax.status === 'failed' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRetryFax(fax);
                        }}
                        style={{
                          padding: '0.375rem 0.75rem',
                          fontSize: '0.75rem',
                          border: '1px solid #3b82f6',
                          borderRadius: '0.375rem',
                          background: '#eff6ff',
                          color: '#3b82f6',
                          cursor: 'pointer',
                          fontWeight: 600,
                        }}
                        title="Retry sending fax"
                      >
                        Retry
                      </button>
                    )}

                    {fax.pdfUrl && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadFax(fax);
                        }}
                        style={{
                          padding: '0.375rem 0.75rem',
                          fontSize: '0.75rem',
                          border: '1px solid #10b981',
                          borderRadius: '0.375rem',
                          background: '#f0fdf4',
                          color: '#10b981',
                          cursor: 'pointer',
                        }}
                        title="Download PDF"
                      >
                        Download
                      </button>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteFax(fax);
                      }}
                      style={{
                        padding: '0.375rem 0.75rem',
                        fontSize: '0.75rem',
                        border: '1px solid #fca5a5',
                        borderRadius: '0.375rem',
                        background: '#fef2f2',
                        color: '#dc2626',
                        cursor: 'pointer',
                      }}
                      title="Delete fax"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {fax.errorMessage && (
                  <div
                    style={{
                      marginTop: '0.75rem',
                      padding: '0.5rem',
                      background: '#fef2f2',
                      color: '#dc2626',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                    }}
                  >
                    Error: {fax.errorMessage}
                  </div>
                )}

                {fax.notes && (
                  <div
                    style={{
                      marginTop: '0.75rem',
                      padding: '0.5rem',
                      background: '#f9fafb',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                    }}
                  >
                    <strong>Notes:</strong> {fax.notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Send Fax Modal */}
      <Modal
        isOpen={showSendModal}
        onClose={() => setShowSendModal(false)}
        title="Send Fax"
        size="lg"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
              Recipient Fax Number *
            </label>
            <input
              type="tel"
              value={sendForm.recipientNumber}
              onChange={(e) => setSendForm({ ...sendForm, recipientNumber: e.target.value })}
              placeholder="+1 (555) 555-5555"
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
              Recipient Name
            </label>
            <input
              type="text"
              value={sendForm.recipientName}
              onChange={(e) => setSendForm({ ...sendForm, recipientName: e.target.value })}
              placeholder="Dr. Smith"
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
              Subject *
            </label>
            <input
              type="text"
              value={sendForm.subject}
              onChange={(e) => setSendForm({ ...sendForm, subject: e.target.value })}
              placeholder="Patient Referral - Smith, John"
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
              Patient (Optional)
            </label>
            <select
              value={sendForm.patientId}
              onChange={(e) => setSendForm({ ...sendForm, patientId: e.target.value })}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
              }}
            >
              <option value="">Select patient</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.lastName}, {p.firstName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
              Documents to Send
            </label>
            <select
              multiple
              value={sendForm.documentIds}
              onChange={(e) => {
                const selected = Array.from(e.target.selectedOptions, (option) => option.value);
                setSendForm({ ...sendForm, documentIds: selected });
              }}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                minHeight: '100px',
              }}
            >
              {documents.length === 0 ? (
                <option disabled>No documents available</option>
              ) : (
                documents.map((doc: any) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.name || doc.title || `Document ${doc.id}`}
                  </option>
                ))
              )}
            </select>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
              Hold Ctrl/Cmd to select multiple documents
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
              Number of Pages
            </label>
            <input
              type="number"
              min="1"
              max="99"
              value={sendForm.pages}
              onChange={(e) => setSendForm({ ...sendForm, pages: parseInt(e.target.value) || 1 })}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
              Cover Page Message
            </label>
            <textarea
              value={sendForm.coverPageMessage}
              onChange={(e) => setSendForm({ ...sendForm, coverPageMessage: e.target.value })}
              placeholder="Please find attached patient referral..."
              rows={3}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                fontFamily: 'inherit',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <Button variant="outline" onClick={() => setShowSendModal(false)} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={handleSendFax} disabled={sending}>
              {sending ? 'Sending...' : 'Send Fax'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Preview Modal */}
      <Modal
        isOpen={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        title={selectedFax?.subject || 'Fax Preview'}
        size="lg"
      >
        {selectedFax && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ padding: '1rem', background: '#f9fafb', borderRadius: '0.5rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.875rem' }}>
                <div>
                  <strong>Direction:</strong> {selectedFax.direction === 'inbound' ? 'Received' : 'Sent'}
                </div>
                <div>
                  <strong>Status:</strong> {getStatusBadge(selectedFax.status)}
                </div>
                <div>
                  <strong>From:</strong> {formatPhoneNumber(selectedFax.fromNumber)}
                </div>
                <div>
                  <strong>To:</strong> {formatPhoneNumber(selectedFax.toNumber)}
                </div>
                <div>
                  <strong>Pages:</strong> {selectedFax.pages}
                </div>
                <div>
                  <strong>Date:</strong>{' '}
                  {selectedFax.receivedAt
                    ? new Date(selectedFax.receivedAt).toLocaleString()
                    : selectedFax.sentAt
                    ? new Date(selectedFax.sentAt).toLocaleString()
                    : new Date(selectedFax.createdAt).toLocaleString()}
                </div>
                {selectedFax.patientName && (
                  <div>
                    <strong>Patient:</strong> {selectedFax.patientName}
                  </div>
                )}
                {selectedFax.transmissionId && (
                  <div>
                    <strong>Transmission ID:</strong> {selectedFax.transmissionId}
                  </div>
                )}
              </div>
            </div>

            {selectedFax.pdfUrl ? (
              <div
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                  overflow: 'hidden',
                  minHeight: '600px',
                }}
              >
                <iframe
                  src={selectedFax.pdfUrl}
                  style={{
                    width: '100%',
                    height: '600px',
                    border: 'none',
                  }}
                  title="Fax PDF Preview"
                />
              </div>
            ) : (
              <div
                style={{
                  padding: '2rem',
                  background: '#f3f4f6',
                  borderRadius: '0.5rem',
                  textAlign: 'center',
                  minHeight: '400px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: '4rem', marginBottom: '1rem' }}></div>
                  <div style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                    PDF Not Available
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                    The fax PDF is not available for preview
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              {selectedFax.pdfUrl && (
                <>
                  <Button variant="outline" onClick={() => window.open(selectedFax.pdfUrl, '_blank')}>
                    Open in New Tab
                  </Button>
                  <Button variant="outline" onClick={() => handleDownloadFax(selectedFax)}>
                    Download PDF
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Assign to Patient Modal */}
      <Modal
        isOpen={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        title="Assign Fax to Patient"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
              Select Patient
            </label>
            <select
              value={assignForm.patientId}
              onChange={(e) => setAssignForm({ ...assignForm, patientId: e.target.value })}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
              }}
            >
              <option value="">Select patient</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.lastName}, {p.firstName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
              Notes (Optional)
            </label>
            <textarea
              value={assignForm.notes}
              onChange={(e) => setAssignForm({ ...assignForm, notes: e.target.value })}
              placeholder="Add any notes about this fax..."
              rows={3}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                fontFamily: 'inherit',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <Button variant="outline" onClick={() => setShowAssignModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleAssignToPatient} disabled={!assignForm.patientId}>
              Assign
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
