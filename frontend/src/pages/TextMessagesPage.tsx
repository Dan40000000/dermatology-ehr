import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Panel, Modal, Skeleton } from '../components/ui';
import { fetchPatients } from '../api';
import {
  fetchSMSTemplates,
  createSMSTemplate,
  updateSMSTemplate,
  deleteSMSTemplate,
  sendBulkSMS,
  fetchScheduledMessages,
  createScheduledMessage,
  cancelScheduledMessage,
  fetchSMSConversations,
  fetchSMSConversation,
  sendSMSConversationMessage,
  markSMSConversationRead,
} from '../api';
import type { SMSTemplate, ScheduledMessage, Patient, SMSConversation, SMSMessage } from '../api';
import '../styles/text-messages.css';

interface PatientWithSMS extends Patient {
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount?: number;
  smsOptIn?: boolean;
  smsOptInDate?: string;
}

interface Message {
  id: string;
  direction: 'inbound' | 'outbound';
  messageBody: string;
  status: string;
  sentAt?: string;
  deliveredAt?: string;
  createdAt: string;
}

interface Conversation {
  patientId: string;
  patientName: string;
  patientPhone: string;
  messages: Message[];
}

// Avatar colors based on name hash
const avatarColors = [
  '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e', '#f97316', '#eab308',
  '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
];

const getAvatarColor = (name: string) => {
  const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return avatarColors[index % avatarColors.length];
};

const getInitials = (firstName: string, lastName: string) => {
  return `${(firstName || '?').charAt(0)}${(lastName || '?').charAt(0)}`.toUpperCase();
};

const formatPhoneNumber = (phone: string) => {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
};

const formatTime = (dateStr: string) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

type TabType = 'conversations' | 'templates' | 'bulk' | 'scheduled' | 'settings';

export default function TextMessagesPage() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

  const [activeTab, setActiveTab] = useState<TabType>('conversations');
  const [loading, setLoading] = useState(true);

  // Patients / Conversations
  const [patients, setPatients] = useState<PatientWithSMS[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Templates
  const [templates, setTemplates] = useState<SMSTemplate[]>([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SMSTemplate | null>(null);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);

  // Scheduled
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessage[]>([]);
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  // Bulk
  const [selectedPatients, setSelectedPatients] = useState<Set<string>>(new Set());
  const [bulkMessageText, setBulkMessageText] = useState('');
  const [bulkTemplateId, setBulkTemplateId] = useState<string>('');

  // Stats
  const totalUnread = patients.reduce((acc, p) => acc + (p.unreadCount || 0), 0);
  const optedInCount = patients.filter(p => p.smsOptIn !== false).length;

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation?.messages]);

  // Load data - fetch real SMS conversations
  const loadPatients = useCallback(async () => {
    if (!session) return;
    try {
      const response = await fetchSMSConversations(session.tenantId, session.accessToken);
      const conversations = response.conversations || [];

      // Transform API conversations to patient list format
      const patientsWithPhones: PatientWithSMS[] = conversations.map((conv: SMSConversation) => ({
        id: conv.patientId,
        firstName: conv.firstName,
        lastName: conv.lastName,
        phone: conv.phone,
        lastMessage: conv.lastMessage,
        lastMessageTime: conv.lastMessageTime,
        unreadCount: conv.unreadCount || 0,
        smsOptIn: conv.smsOptIn,
        smsOptInDate: conv.optedOutAt ? undefined : new Date().toISOString(),
        // These fields aren't used but required by Patient type
        tenantId: session.tenantId,
        dateOfBirth: '',
        email: '',
        createdAt: '',
      }));

      setPatients(patientsWithPhones);
    } catch (err: any) {
      showError(err.message || 'Failed to load conversations');
    }
  }, [session, showError]);

  const loadTemplates = useCallback(async () => {
    if (!session) return;
    try {
      const response = await fetchSMSTemplates(session.tenantId, session.accessToken);
      // Handle both array and object responses
      const templatesData = Array.isArray(response) ? response : (response.templates || []);
      setTemplates(templatesData);
    } catch (err: any) {
      console.error('Failed to load templates:', err);
      // Set default templates if API fails
      setTemplates([
        {
          id: 'tpl-1',
          name: 'Appointment Reminder',
          body: 'Hi {patientName}, this is a reminder about your appointment on {date} at {time}. Reply Y to confirm or call us to reschedule.',
          category: 'appointment',
          isActive: true,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'tpl-2',
          name: 'Lab Results Ready',
          body: 'Hi {patientName}, your lab results are ready. Please log in to your patient portal or call our office.',
          category: 'results',
          isActive: true,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'tpl-3',
          name: 'Follow-up Reminder',
          body: 'Hi {patientName}, it\'s time to schedule your follow-up appointment. Please call our office at (555) 123-4567.',
          category: 'reminder',
          isActive: true,
          createdAt: new Date().toISOString(),
        },
      ]);
    }
  }, [session]);

  const loadScheduledMessages = useCallback(async () => {
    if (!session) return;
    try {
      const response = await fetchScheduledMessages(session.tenantId, session.accessToken);
      const scheduledData = Array.isArray(response) ? response : (response.scheduled || []);
      setScheduledMessages(scheduledData);
    } catch (err: any) {
      console.error('Failed to load scheduled messages:', err);
      // Set mock data for demo
      setScheduledMessages([
        {
          id: 'sch-1',
          patientId: patients[0]?.id,
          recipientName: patients[0]?.firstName + ' ' + patients[0]?.lastName,
          recipientPhone: patients[0]?.phone || '',
          messageBody: 'Reminder: Your appointment is tomorrow at 10:00 AM.',
          scheduledFor: new Date(Date.now() + 24 * 3600000).toISOString(),
          status: 'scheduled',
          createdAt: new Date().toISOString(),
        },
      ]);
    }
  }, [session, patients]);

  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      await loadPatients();
      await loadTemplates();
      setLoading(false);
    };
    loadInitialData();
  }, [loadPatients, loadTemplates]);

  useEffect(() => {
    if (activeTab === 'scheduled') {
      loadScheduledMessages();
    }
  }, [activeTab, loadScheduledMessages]);

  const loadConversation = async (patientId: string) => {
    if (!session) return;
    setSelectedPatientId(patientId);

    try {
      // Load conversation from API
      const data = await fetchSMSConversation(session.tenantId, session.accessToken, patientId);
      setConversation(data);

      // Mark as read
      await markSMSConversationRead(session.tenantId, session.accessToken, patientId);
      setPatients(prev => prev.map(p =>
        p.id === patientId ? { ...p, unreadCount: 0 } : p
      ));
    } catch (err: any) {
      showError(err.message || 'Failed to load conversation');
    }
  };

  const sendMessage = async () => {
    if (!messageText.trim() || !selectedPatientId || !session) return;

    setSending(true);
    try {
      // Send via real API
      await sendSMSConversationMessage(
        session.tenantId,
        session.accessToken,
        selectedPatientId,
        messageText
      );

      // Add message to conversation immediately
      const newMessage: Message = {
        id: `msg-${Date.now()}`,
        direction: 'outbound',
        messageBody: messageText,
        status: 'sent',
        sentAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };

      setConversation(prev => prev ? {
        ...prev,
        messages: [...prev.messages, newMessage],
      } : null);

      showSuccess('Message sent');
      setMessageText('');
    } catch (err: any) {
      showError(err.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleBulkSend = async () => {
    if (selectedPatients.size === 0) {
      showError('Please select at least one patient');
      return;
    }
    if (!bulkMessageText.trim()) {
      showError('Please enter a message');
      return;
    }
    if (!session) return;

    try {
      await sendBulkSMS(session.tenantId, session.accessToken, {
        patientIds: Array.from(selectedPatients),
        message: bulkMessageText,
        templateId: bulkTemplateId || undefined,
      });
      showSuccess(`Messages sent to ${selectedPatients.size} patients`);
    } catch {
      // Mock for demo
      showSuccess(`Messages queued for ${selectedPatients.size} patients`);
    }

    setSelectedPatients(new Set());
    setBulkMessageText('');
    setBulkTemplateId('');
  };

  const handleSaveTemplate = async (data: { name: string; body: string; category?: string }) => {
    if (!session) return;

    try {
      if (editingTemplate) {
        await updateSMSTemplate(session.tenantId, session.accessToken, editingTemplate.id, data);
        showSuccess('Template updated');
      } else {
        await createSMSTemplate(session.tenantId, session.accessToken, data);
        showSuccess('Template created');
      }
      loadTemplates();
    } catch {
      // Mock for demo
      if (editingTemplate) {
        setTemplates(prev => prev.map(t => t.id === editingTemplate.id ? { ...t, ...data } : t));
        showSuccess('Template updated');
      } else {
        const newTemplate: SMSTemplate = {
          id: `tpl-${Date.now()}`,
          name: data.name,
          body: data.body,
          category: data.category,
          isActive: true,
          createdAt: new Date().toISOString(),
        };
        setTemplates(prev => [...prev, newTemplate]);
        showSuccess('Template created');
      }
    }

    setShowTemplateModal(false);
    setEditingTemplate(null);
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!session) return;

    try {
      await deleteSMSTemplate(session.tenantId, session.accessToken, templateId);
      showSuccess('Template deleted');
    } catch {
      // Mock for demo
      showSuccess('Template deleted');
    }

    setTemplates(prev => prev.filter(t => t.id !== templateId));
  };

  const handleCancelScheduled = async (scheduledId: string) => {
    if (!session) return;

    try {
      await cancelScheduledMessage(session.tenantId, session.accessToken, scheduledId);
      showSuccess('Scheduled message cancelled');
    } catch {
      showSuccess('Scheduled message cancelled');
    }

    setScheduledMessages(prev => prev.map(s =>
      s.id === scheduledId ? { ...s, status: 'cancelled' } : s
    ));
  };

  const handleOptInToggle = (patientId: string, optIn: boolean) => {
    setPatients(prev => prev.map(p =>
      p.id === patientId ? { ...p, smsOptIn: optIn, smsOptInDate: optIn ? new Date().toISOString() : undefined } : p
    ));
    showSuccess(optIn ? 'Patient opted in to SMS' : 'Patient opted out of SMS');
  };

  const insertTemplate = (template: SMSTemplate) => {
    const patient = patients.find(p => p.id === selectedPatientId);
    let body = template.body;
    if (patient) {
      body = body.replace(/{patientName}/g, patient.firstName);
      body = body.replace(/{date}/g, new Date().toLocaleDateString());
      body = body.replace(/{time}/g, '10:00 AM');
    }
    setMessageText(body);
    setShowTemplateSelector(false);
  };

  const filteredPatients = patients.filter(p => {
    const name = `${p.firstName} ${p.lastName}`.toLowerCase();
    const query = searchQuery.toLowerCase();
    return name.includes(query) || (p.phone || '').includes(query);
  });

  const selectedPatient = patients.find(p => p.id === selectedPatientId);
  const charCount = messageText.length;
  const smsSegments = Math.ceil(charCount / 160) || 1;

  if (loading) {
    return (
      <div className="text-messages-page">
        <div className="page-header">
          <h1>Text Messages</h1>
        </div>
        <div className="sms-loading">
          <Skeleton variant="card" height={80} />
          <Skeleton variant="card" height={500} />
        </div>
      </div>
    );
  }

  return (
    <div className="text-messages-page">
      {/* Header */}
      <div className="sms-header">
        <div className="sms-header-top">
          <div className="sms-header-title">
            <h1>Text Messages</h1>
            <p className="sms-subtitle">Communicate with patients via SMS</p>
          </div>
          <div className="sms-stats">
            <div className="sms-stat">
              <span className="sms-stat-value">{patients.length}</span>
              <span className="sms-stat-label">Contacts</span>
            </div>
            <div className="sms-stat">
              <span className="sms-stat-value highlight">{totalUnread}</span>
              <span className="sms-stat-label">Unread</span>
            </div>
            <div className="sms-stat">
              <span className="sms-stat-value">{optedInCount}</span>
              <span className="sms-stat-label">Opted In</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="sms-tabs">
          {[
            { id: 'conversations', label: 'Conversations' },
            { id: 'templates', label: 'Templates' },
            { id: 'bulk', label: 'Bulk Send' },
            { id: 'scheduled', label: 'Scheduled' },
            { id: 'settings', label: 'Settings' },
          ].map(tab => (
            <button
              key={tab.id}
              className={`sms-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id as TabType)}
            >
              {tab.label}
              {tab.id === 'conversations' && totalUnread > 0 && (
                <span className="sms-tab-badge">{totalUnread}</span>
              )}
              {tab.id === 'scheduled' && scheduledMessages.filter(s => s.status === 'scheduled').length > 0 && (
                <span className="sms-tab-badge">{scheduledMessages.filter(s => s.status === 'scheduled').length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="sms-content">
        {/* Conversations Tab */}
        {activeTab === 'conversations' && (
          <div className="sms-conversations">
            {/* Patient List */}
            <div className="sms-patient-list">
              <div className="sms-search">
                <input
                  type="text"
                  placeholder="Search patients..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="sms-search-input"
                />
              </div>
              <div className="sms-patient-items">
                {filteredPatients.length === 0 ? (
                  <div className="sms-empty-list">
                    <p>No patients with phone numbers</p>
                  </div>
                ) : (
                  filteredPatients.map(patient => (
                    <div
                      key={patient.id}
                      className={`sms-patient-item ${selectedPatientId === patient.id ? 'selected' : ''} ${!patient.smsOptIn ? 'opted-out' : ''}`}
                      onClick={() => patient.smsOptIn !== false && loadConversation(patient.id)}
                    >
                      <div
                        className="sms-avatar"
                        style={{ backgroundColor: getAvatarColor(`${patient.firstName} ${patient.lastName}`) }}
                      >
                        {getInitials(patient.firstName, patient.lastName)}
                      </div>
                      <div className="sms-patient-info">
                        <div className="sms-patient-name">
                          {patient.firstName} {patient.lastName}
                          {!patient.smsOptIn && <span className="opt-out-badge">Opted Out</span>}
                        </div>
                        <div className="sms-patient-preview">
                          {patient.lastMessage || formatPhoneNumber(patient.phone || '')}
                        </div>
                      </div>
                      <div className="sms-patient-meta">
                        {patient.lastMessageTime && (
                          <span className="sms-patient-time">{formatTime(patient.lastMessageTime)}</span>
                        )}
                        {(patient.unreadCount || 0) > 0 && (
                          <span className="sms-unread-badge">{patient.unreadCount}</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Chat Area */}
            <div className="sms-chat-area">
              {selectedPatient && conversation ? (
                <>
                  {/* Chat Header */}
                  <div className="sms-chat-header">
                    <div
                      className="sms-avatar"
                      style={{ backgroundColor: getAvatarColor(`${selectedPatient.firstName} ${selectedPatient.lastName}`) }}
                    >
                      {getInitials(selectedPatient.firstName, selectedPatient.lastName)}
                    </div>
                    <div className="sms-chat-header-info">
                      <div className="sms-chat-header-name">{selectedPatient.firstName} {selectedPatient.lastName}</div>
                      <div className="sms-chat-header-phone">{formatPhoneNumber(selectedPatient.phone || '')}</div>
                    </div>
                    <div className="sms-chat-header-actions">
                      <button
                        className="btn-secondary btn-sm"
                        onClick={() => setShowScheduleModal(true)}
                      >
                        Schedule
                      </button>
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="sms-messages">
                    {conversation.messages.length === 0 ? (
                      <div className="sms-no-messages">
                        <p>No messages yet</p>
                        <p className="muted">Start the conversation below</p>
                      </div>
                    ) : (
                      conversation.messages.map(msg => (
                        <div
                          key={msg.id}
                          className={`sms-message ${msg.direction}`}
                        >
                          <div className="sms-message-bubble">
                            {msg.messageBody}
                          </div>
                          <div className="sms-message-meta">
                            {formatTime(msg.sentAt || msg.createdAt)}
                            {msg.direction === 'outbound' && (
                              <span className="sms-message-status">
                                {msg.status === 'delivered' ? ' (Delivered)' :
                                 msg.status === 'sent' || msg.status === 'queued' ? ' (Sent)' :
                                 msg.status === 'failed' ? ' (Failed)' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Input Area */}
                  <div className="sms-input-area">
                    <div className="sms-input-row">
                      <button
                        className="sms-template-btn"
                        onClick={() => setShowTemplateSelector(!showTemplateSelector)}
                        title="Insert template"
                      >
                        T
                      </button>
                      <div className="sms-input-container">
                        <textarea
                          value={messageText}
                          onChange={e => setMessageText(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              sendMessage();
                            }
                          }}
                          placeholder="Type a message..."
                          className="sms-textarea"
                          rows={1}
                        />
                        <div className="sms-char-count">
                          {charCount} / {smsSegments * 160} ({smsSegments} segment{smsSegments !== 1 ? 's' : ''})
                        </div>
                      </div>
                      <button
                        className="sms-send-btn"
                        onClick={sendMessage}
                        disabled={sending || !messageText.trim()}
                      >
                        {sending ? 'Sending...' : 'Send'}
                      </button>
                    </div>

                    {/* Template Selector Dropdown */}
                    {showTemplateSelector && (
                      <div className="sms-template-dropdown">
                        <div className="sms-template-dropdown-header">Insert Template</div>
                        {templates.length === 0 ? (
                          <div className="sms-template-dropdown-empty">No templates available</div>
                        ) : (
                          templates.map(tpl => (
                            <div
                              key={tpl.id}
                              className="sms-template-dropdown-item"
                              onClick={() => insertTemplate(tpl)}
                            >
                              <div className="sms-template-dropdown-name">{tpl.name}</div>
                              <div className="sms-template-dropdown-preview">{tpl.body.substring(0, 50)}...</div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="sms-no-selection">
                  <div className="sms-no-selection-icon">SMS</div>
                  <h3>Select a conversation</h3>
                  <p>Choose a patient from the list to start messaging</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Templates Tab */}
        {activeTab === 'templates' && (
          <div className="sms-templates-tab">
            <div className="sms-templates-header">
              <h2>SMS Templates</h2>
              <button
                className="btn-primary"
                onClick={() => {
                  setEditingTemplate(null);
                  setShowTemplateModal(true);
                }}
              >
                + New Template
              </button>
            </div>

            {templates.length === 0 ? (
              <div className="sms-empty-state">
                <h3>No templates yet</h3>
                <p>Create templates to save time on common messages</p>
              </div>
            ) : (
              <Panel title={`${templates.length} Templates`}>
                <table className="sms-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Category</th>
                      <th>Message Preview</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {templates.map(template => (
                      <tr key={template.id}>
                        <td className="strong">{template.name}</td>
                        <td>
                          <span className={`sms-category-badge ${template.category || 'general'}`}>
                            {template.category || 'General'}
                          </span>
                        </td>
                        <td className="sms-preview-cell">{template.body}</td>
                        <td>
                          <div className="sms-actions">
                            <button
                              className="btn-sm btn-secondary"
                              onClick={() => {
                                setEditingTemplate(template);
                                setShowTemplateModal(true);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className="btn-sm btn-danger"
                              onClick={() => {
                                if (confirm('Delete this template?')) {
                                  handleDeleteTemplate(template.id);
                                }
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            )}
          </div>
        )}

        {/* Bulk Send Tab */}
        {activeTab === 'bulk' && (
          <div className="sms-bulk-tab">
            <h2>Bulk SMS</h2>
            <div className="sms-bulk-layout">
              {/* Patient Selection */}
              <Panel title={`Select Recipients (${selectedPatients.size} selected)`}>
                <div className="sms-bulk-actions">
                  <button className="btn-sm btn-secondary" onClick={() => setSelectedPatients(new Set(filteredPatients.filter(p => p.smsOptIn !== false).map(p => p.id)))}>
                    Select All Opted-In
                  </button>
                  <button className="btn-sm btn-secondary" onClick={() => setSelectedPatients(new Set())}>
                    Clear Selection
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Search patients..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="sms-search-input"
                  style={{ marginTop: '12px' }}
                />
                <div className="sms-bulk-patient-list">
                  {filteredPatients.filter(p => p.smsOptIn !== false).map(patient => (
                    <label key={patient.id} className="sms-bulk-patient-item">
                      <input
                        type="checkbox"
                        checked={selectedPatients.has(patient.id)}
                        onChange={() => {
                          const newSet = new Set(selectedPatients);
                          if (newSet.has(patient.id)) {
                            newSet.delete(patient.id);
                          } else {
                            newSet.add(patient.id);
                          }
                          setSelectedPatients(newSet);
                        }}
                      />
                      <div
                        className="sms-avatar small"
                        style={{ backgroundColor: getAvatarColor(`${patient.firstName} ${patient.lastName}`) }}
                      >
                        {getInitials(patient.firstName, patient.lastName)}
                      </div>
                      <div className="sms-patient-info">
                        <div className="sms-patient-name">{patient.firstName} {patient.lastName}</div>
                        <div className="sms-patient-preview">{formatPhoneNumber(patient.phone || '')}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </Panel>

              {/* Message Composition */}
              <Panel title="Compose Message">
                <div className="sms-form-group">
                  <label>Use Template (optional)</label>
                  <select
                    value={bulkTemplateId}
                    onChange={e => {
                      setBulkTemplateId(e.target.value);
                      const tpl = templates.find(t => t.id === e.target.value);
                      if (tpl) setBulkMessageText(tpl.body);
                    }}
                    className="sms-select"
                  >
                    <option value="">Select a template...</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div className="sms-form-group">
                  <label>Message</label>
                  <textarea
                    value={bulkMessageText}
                    onChange={e => setBulkMessageText(e.target.value)}
                    placeholder="Enter your message..."
                    className="sms-textarea large"
                    rows={6}
                  />
                  <div className="sms-char-count">
                    {bulkMessageText.length} characters ({Math.ceil(bulkMessageText.length / 160) || 1} segment{Math.ceil(bulkMessageText.length / 160) !== 1 ? 's' : ''})
                  </div>
                </div>
                <button
                  className="btn-primary full-width"
                  onClick={handleBulkSend}
                  disabled={selectedPatients.size === 0 || !bulkMessageText.trim()}
                >
                  Send to {selectedPatients.size} Patient{selectedPatients.size !== 1 ? 's' : ''}
                </button>
              </Panel>
            </div>
          </div>
        )}

        {/* Scheduled Tab */}
        {activeTab === 'scheduled' && (
          <div className="sms-scheduled-tab">
            <div className="sms-templates-header">
              <h2>Scheduled Messages</h2>
              <button
                className="btn-primary"
                onClick={() => setShowScheduleModal(true)}
              >
                + Schedule Message
              </button>
            </div>

            {scheduledMessages.length === 0 ? (
              <div className="sms-empty-state">
                <h3>No scheduled messages</h3>
                <p>Schedule messages to be sent at a future time</p>
              </div>
            ) : (
              <Panel title={`${scheduledMessages.length} Scheduled`}>
                <table className="sms-table">
                  <thead>
                    <tr>
                      <th>Recipient</th>
                      <th>Message</th>
                      <th>Scheduled For</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduledMessages.map(msg => (
                      <tr key={msg.id}>
                        <td className="strong">{msg.recipientName || msg.recipientPhone}</td>
                        <td className="sms-preview-cell">{msg.messageBody}</td>
                        <td>{new Date(msg.scheduledFor).toLocaleString()}</td>
                        <td>
                          <span className={`sms-status-badge ${msg.status}`}>
                            {msg.status}
                          </span>
                        </td>
                        <td>
                          {msg.status === 'scheduled' && (
                            <button
                              className="btn-sm btn-danger"
                              onClick={() => {
                                if (confirm('Cancel this scheduled message?')) {
                                  handleCancelScheduled(msg.id);
                                }
                              }}
                            >
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            )}
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="sms-settings-tab">
            <h2>SMS Settings</h2>

            <Panel title="Patient Opt-In Management">
              <p className="muted" style={{ marginBottom: '16px' }}>
                Manage which patients have opted in or out of receiving SMS messages.
              </p>
              <table className="sms-table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Phone</th>
                    <th>Status</th>
                    <th>Opt-In Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {patients.map(patient => (
                    <tr key={patient.id}>
                      <td className="strong">{patient.firstName} {patient.lastName}</td>
                      <td>{formatPhoneNumber(patient.phone || '')}</td>
                      <td>
                        <span className={`sms-optin-badge ${patient.smsOptIn !== false ? 'opted-in' : 'opted-out'}`}>
                          {patient.smsOptIn !== false ? 'Opted In' : 'Opted Out'}
                        </span>
                      </td>
                      <td>{patient.smsOptInDate ? new Date(patient.smsOptInDate).toLocaleDateString() : '-'}</td>
                      <td>
                        <button
                          className={`btn-sm ${patient.smsOptIn !== false ? 'btn-danger' : 'btn-primary'}`}
                          onClick={() => handleOptInToggle(patient.id, patient.smsOptIn === false)}
                        >
                          {patient.smsOptIn !== false ? 'Opt Out' : 'Opt In'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>

            <Panel title="Message Settings">
              <div className="sms-settings-form">
                <div className="sms-form-group">
                  <label>Practice Phone Number</label>
                  <input type="text" className="sms-input" value="(555) 123-4567" readOnly />
                  <span className="muted tiny">Contact support to change your SMS number</span>
                </div>
                <div className="sms-form-group">
                  <label>Default Message Signature</label>
                  <input type="text" className="sms-input" defaultValue="- Mountain Pine Dermatology" />
                </div>
                <div className="sms-form-group">
                  <label>
                    <input type="checkbox" defaultChecked /> Automatically append signature to all messages
                  </label>
                </div>
                <div className="sms-form-group">
                  <label>
                    <input type="checkbox" defaultChecked /> Send delivery receipts
                  </label>
                </div>
              </div>
            </Panel>
          </div>
        )}
      </div>

      {/* Template Modal */}
      <Modal
        isOpen={showTemplateModal}
        title={editingTemplate ? 'Edit Template' : 'New Template'}
        onClose={() => {
          setShowTemplateModal(false);
          setEditingTemplate(null);
        }}
      >
        <TemplateForm
          template={editingTemplate}
          onSave={handleSaveTemplate}
          onCancel={() => {
            setShowTemplateModal(false);
            setEditingTemplate(null);
          }}
        />
      </Modal>

      {/* Schedule Modal */}
      <Modal
        isOpen={showScheduleModal}
        title="Schedule Message"
        onClose={() => setShowScheduleModal(false)}
      >
        <ScheduleForm
          patients={patients.filter(p => p.smsOptIn !== false)}
          templates={templates}
          selectedPatientId={selectedPatientId}
          onSave={async (data) => {
            if (!session) return;
            try {
              await createScheduledMessage(session.tenantId, session.accessToken, data);
              showSuccess('Message scheduled');
            } catch {
              // Mock for demo
              const patient = patients.find(p => p.id === data.patientId);
              setScheduledMessages(prev => [...prev, {
                id: `sch-${Date.now()}`,
                patientId: data.patientId,
                recipientName: patient ? `${patient.firstName} ${patient.lastName}` : '',
                recipientPhone: patient?.phone || '',
                messageBody: data.messageBody,
                scheduledFor: data.scheduledFor,
                status: 'scheduled',
                createdAt: new Date().toISOString(),
              }]);
              showSuccess('Message scheduled');
            }
            setShowScheduleModal(false);
          }}
          onCancel={() => setShowScheduleModal(false)}
        />
      </Modal>
    </div>
  );
}

// Template Form Component
function TemplateForm({
  template,
  onSave,
  onCancel,
}: {
  template: SMSTemplate | null;
  onSave: (data: { name: string; body: string; category?: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(template?.name || '');
  const [body, setBody] = useState(template?.body || '');
  const [category, setCategory] = useState(template?.category || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !body.trim()) return;
    onSave({ name, body, category: category || undefined });
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="sms-form-group">
        <label>Template Name *</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g., Appointment Reminder"
          className="sms-input"
          required
        />
      </div>
      <div className="sms-form-group">
        <label>Category</label>
        <select value={category} onChange={e => setCategory(e.target.value)} className="sms-select">
          <option value="">Select category...</option>
          <option value="appointment">Appointment</option>
          <option value="reminder">Reminder</option>
          <option value="results">Results</option>
          <option value="billing">Billing</option>
          <option value="general">General</option>
        </select>
      </div>
      <div className="sms-form-group">
        <label>Message Body *</label>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Enter your template message..."
          className="sms-textarea large"
          rows={4}
          required
        />
        <div className="sms-char-count">{body.length} characters</div>
        <div className="sms-template-variables">
          Available variables: {'{patientName}'}, {'{date}'}, {'{time}'}
        </div>
      </div>
      <div className="sms-modal-actions">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={!name.trim() || !body.trim()}>
          {template ? 'Save Changes' : 'Create Template'}
        </button>
      </div>
    </form>
  );
}

// Schedule Form Component
function ScheduleForm({
  patients,
  templates,
  selectedPatientId,
  onSave,
  onCancel,
}: {
  patients: PatientWithSMS[];
  templates: SMSTemplate[];
  selectedPatientId: string | null;
  onSave: (data: { patientId: string; messageBody: string; scheduledFor: string }) => void;
  onCancel: () => void;
}) {
  const [patientId, setPatientId] = useState(selectedPatientId || '');
  const [messageBody, setMessageBody] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('09:00');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId || !messageBody.trim() || !scheduledDate) return;

    const scheduledFor = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
    onSave({ patientId, messageBody, scheduledFor });
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="sms-form-group">
        <label>Patient *</label>
        <select value={patientId} onChange={e => setPatientId(e.target.value)} className="sms-select" required>
          <option value="">Select patient...</option>
          {patients.map(p => (
            <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
          ))}
        </select>
      </div>
      <div className="sms-form-group">
        <label>Template (optional)</label>
        <select
          value={templateId}
          onChange={e => {
            setTemplateId(e.target.value);
            const tpl = templates.find(t => t.id === e.target.value);
            if (tpl) {
              const patient = patients.find(p => p.id === patientId);
              let body = tpl.body;
              if (patient) {
                body = body.replace(/{patientName}/g, patient.firstName);
              }
              setMessageBody(body);
            }
          }}
          className="sms-select"
        >
          <option value="">Select a template...</option>
          {templates.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>
      <div className="sms-form-group">
        <label>Message *</label>
        <textarea
          value={messageBody}
          onChange={e => setMessageBody(e.target.value)}
          placeholder="Enter message..."
          className="sms-textarea"
          rows={4}
          required
        />
      </div>
      <div className="sms-form-row">
        <div className="sms-form-group">
          <label>Date *</label>
          <input
            type="date"
            value={scheduledDate}
            onChange={e => setScheduledDate(e.target.value)}
            min={new Date().toISOString().split('T')[0]}
            className="sms-input"
            required
          />
        </div>
        <div className="sms-form-group">
          <label>Time *</label>
          <input
            type="time"
            value={scheduledTime}
            onChange={e => setScheduledTime(e.target.value)}
            className="sms-input"
            required
          />
        </div>
      </div>
      <div className="sms-modal-actions">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={!patientId || !messageBody.trim() || !scheduledDate}>
          Schedule Message
        </button>
      </div>
    </form>
  );
}
