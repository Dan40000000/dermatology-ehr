import { useState, useEffect } from 'react';
import type { FC } from 'react';
import { formatDistanceToNow } from 'date-fns';
import '../../styles/patient-portal.css';

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
  const [threads, setThreads] = useState<PatientThread[]>([]);
  const [selectedThread, setSelectedThread] = useState<PatientThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [showComposer, setShowComposer] = useState(false);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    fetchThreads();
  }, [filter]);

  const fetchThreads = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `http://localhost:4000/api/patient-portal/messages/threads?${filter !== 'all' ? `category=${filter}` : ''}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('patientToken')}`,
            'X-Tenant-ID': localStorage.getItem('tenantId') || '',
          },
        }
      );
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

const MessageComposer: FC<{ onClose: () => void; onSuccess: () => void }> = ({ onClose }) => (
  <div className="portal-modal-overlay">
    <div className="portal-modal">
      <h2 className="portal-modal-title">New Message</h2>
      <button onClick={onClose} className="portal-btn portal-btn-secondary">Close</button>
    </div>
  </div>
);

const MessageThreadView: FC<{ thread: any; onClose: () => void }> = ({ thread, onClose }) => (
  <div className="portal-modal-overlay">
    <div className="portal-modal portal-modal-lg">
      <h2 className="portal-modal-title">{thread.subject}</h2>
      <button onClick={onClose} className="portal-btn portal-btn-secondary">Close</button>
    </div>
  </div>
);
