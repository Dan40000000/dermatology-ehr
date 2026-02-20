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
  getSMSConsent,
  recordSMSConsent,
  revokeSMSConsent,
  fetchSMSAuditLog,
  exportSMSAuditLog,
  fetchSMSAuditSummary,
  fetchSMSSettings,
  updateSMSSettings,
  fetchSMSAutoResponses,
  updateSMSAutoResponse,
  updatePatientSMSPreferences,
  processSMSWorkflowReminders,
  processSMSWorkflowFollowups,
} from '../api';
import type {
  SMSTemplate,
  ScheduledMessage,
  Patient,
  SMSConversation,
  SMSMessage,
  SMSConsent,
  SMSAuditLog,
  SMSSettings,
  SMSAutoResponse,
} from '../api';
import '../styles/text-messages.css';

interface PatientWithSMS extends Patient {
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount?: number;
  smsOptIn?: boolean;
  smsOptInDate?: string;
  hasConsent?: boolean;
  consentExpiresDays?: number | null;
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

type TabType = 'conversations' | 'templates' | 'bulk' | 'scheduled' | 'rules' | 'audit' | 'settings';

type SMSAuditSummary = {
  messagesSent: number;
  messagesReceived: number;
  consentsObtained: number;
  consentsRevoked: number;
  optOuts: number;
  uniquePatients: number;
};

type SMSAutoResponseDraft = {
  responseText: string;
  isActive: boolean;
  isSystemKeyword: boolean;
};

const getTemplateMessageBody = (template: Partial<SMSTemplate> & { body?: string }) =>
  template.messageBody || template.body || '';

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

  // Consent
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [patientConsent, setPatientConsent] = useState<{ [patientId: string]: { hasConsent: boolean; daysUntilExpiration?: number | null } }>({});

  // Audit Log
  const [auditLogs, setAuditLogs] = useState<SMSAuditLog[]>([]);
  const [auditSummary, setAuditSummary] = useState<SMSAuditSummary | null>(null);
  const [auditFilters, setAuditFilters] = useState<{ eventType?: string; startDate?: string; endDate?: string }>({});

  // Rules and settings
  const [autoResponses, setAutoResponses] = useState<SMSAutoResponse[]>([]);
  const [autoResponseDrafts, setAutoResponseDrafts] = useState<Record<string, SMSAutoResponseDraft>>({});
  const [savingAutoResponseId, setSavingAutoResponseId] = useState<string | null>(null);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [runningReminderRules, setRunningReminderRules] = useState(false);
  const [runningFollowupRules, setRunningFollowupRules] = useState(false);

  const [smsSettings, setSmsSettings] = useState<SMSSettings | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<Partial<SMSSettings>>({});
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

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
      showError(err.message || 'Failed to load templates');
      setTemplates([]);
    }
  }, [session, showError]);

  const loadScheduledMessages = useCallback(async () => {
    if (!session) return;
    try {
      const response = await fetchScheduledMessages(session.tenantId, session.accessToken);
      const scheduledData = Array.isArray(response) ? response : (response.scheduled || []);
      setScheduledMessages(scheduledData);
    } catch (err: any) {
      console.error('Failed to load scheduled messages:', err);
      showError(err.message || 'Failed to load scheduled messages');
      setScheduledMessages([]);
    }
  }, [session, showError]);

  const checkPatientConsent = useCallback(async (patientId: string) => {
    if (!session) return;
    try {
      const consentData = await getSMSConsent(session.tenantId, session.accessToken, patientId);
      setPatientConsent(prev => ({
        ...prev,
        [patientId]: {
          hasConsent: consentData.hasConsent,
          daysUntilExpiration: consentData.daysUntilExpiration,
        },
      }));
      return consentData.hasConsent;
    } catch (err: any) {
      console.error('Failed to check consent:', err);
      return false;
    }
  }, [session]);

  const loadAuditLogs = useCallback(async () => {
    if (!session) return;
    try {
      const response = await fetchSMSAuditLog(session.tenantId, session.accessToken, {
        ...auditFilters,
        limit: 100,
      });
      setAuditLogs(response.auditLogs);

      const summary = await fetchSMSAuditSummary(session.tenantId, session.accessToken, {
        startDate: auditFilters.startDate,
        endDate: auditFilters.endDate,
      });
      setAuditSummary(summary);
    } catch (err: any) {
      console.error('Failed to load audit logs:', err);
      showError(err.message || 'Failed to load audit logs');
    }
  }, [session, auditFilters, showError]);

  const loadSMSSettings = useCallback(async () => {
    if (!session) return;
    setSettingsLoading(true);
    try {
      const settings = await fetchSMSSettings(session.tenantId, session.accessToken);
      setSmsSettings(settings);
      setSettingsDraft({
        twilioPhoneNumber: settings.twilioPhoneNumber || '',
        appointmentRemindersEnabled: settings.appointmentRemindersEnabled,
        reminderHoursBefore: settings.reminderHoursBefore,
        allowPatientReplies: settings.allowPatientReplies,
        reminderTemplate: settings.reminderTemplate || '',
        confirmationTemplate: settings.confirmationTemplate || '',
        cancellationTemplate: settings.cancellationTemplate || '',
        rescheduleTemplate: settings.rescheduleTemplate || '',
        isActive: settings.isActive,
        isTestMode: settings.isTestMode,
      });
    } catch (err: any) {
      showError(err.message || 'Failed to load SMS settings');
    } finally {
      setSettingsLoading(false);
    }
  }, [session, showError]);

  const loadAutoResponseRules = useCallback(async () => {
    if (!session) return;
    setRulesLoading(true);
    try {
      const response = await fetchSMSAutoResponses(session.tenantId, session.accessToken);
      const rules = response.autoResponses || [];
      setAutoResponses(rules);
      setAutoResponseDrafts(
        rules.reduce<Record<string, SMSAutoResponseDraft>>((acc, rule) => {
          acc[rule.id] = {
            responseText: rule.responseText,
            isActive: rule.isActive,
            isSystemKeyword: rule.isSystemKeyword,
          };
          return acc;
        }, {})
      );
    } catch (err: any) {
      showError(err.message || 'Failed to load SMS rules');
    } finally {
      setRulesLoading(false);
    }
  }, [session, showError]);

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
    } else if (activeTab === 'rules') {
      loadAutoResponseRules();
    } else if (activeTab === 'audit') {
      loadAuditLogs();
    } else if (activeTab === 'settings') {
      loadSMSSettings();
    }
  }, [activeTab, loadScheduledMessages, loadAutoResponseRules, loadAuditLogs, loadSMSSettings]);

  const loadConversation = async (patientId: string) => {
    if (!session) return;
    setSelectedPatientId(patientId);

    try {
      // Check consent status first
      await checkPatientConsent(patientId);

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

    // Check if patient has consent
    const consent = patientConsent[selectedPatientId];
    if (!consent?.hasConsent) {
      setShowConsentModal(true);
      return;
    }

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
        messageBody: bulkMessageText,
        templateId: bulkTemplateId || undefined,
      });
      showSuccess(`Messages sent to ${selectedPatients.size} patients`);
      setSelectedPatients(new Set());
      setBulkMessageText('');
      setBulkTemplateId('');
    } catch (err: any) {
      showError(err.message || 'Failed to send bulk messages');
    }
  };

  const handleSaveTemplate = async (data: { name: string; body: string; category?: string }) => {
    if (!session) return;

    try {
      if (editingTemplate) {
        await updateSMSTemplate(session.tenantId, session.accessToken, editingTemplate.id, {
          name: data.name,
          messageBody: data.body,
          category: data.category,
        });
        showSuccess('Template updated');
      } else {
        await createSMSTemplate(session.tenantId, session.accessToken, {
          name: data.name,
          messageBody: data.body,
          category: data.category,
        });
        showSuccess('Template created');
      }
      loadTemplates();
    } catch (err: any) {
      showError(err.message || 'Failed to save template');
      return;
    }

    setShowTemplateModal(false);
    setEditingTemplate(null);
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!session) return;

    try {
      await deleteSMSTemplate(session.tenantId, session.accessToken, templateId);
      setTemplates(prev => prev.filter(t => t.id !== templateId));
      showSuccess('Template deleted');
    } catch (err: any) {
      showError(err.message || 'Failed to delete template');
    }
  };

  const handleCancelScheduled = async (scheduledId: string) => {
    if (!session) return;

    try {
      await cancelScheduledMessage(session.tenantId, session.accessToken, scheduledId);
      setScheduledMessages(prev => prev.map(s =>
        s.id === scheduledId ? { ...s, status: 'cancelled' } : s
      ));
      showSuccess('Scheduled message cancelled');
    } catch (err: any) {
      showError(err.message || 'Failed to cancel scheduled message');
    }
  };

  const handleOptInToggle = async (patientId: string, optIn: boolean) => {
    if (!session) return;

    try {
      if (optIn) {
        await recordSMSConsent(session.tenantId, session.accessToken, patientId, {
          consentMethod: 'verbal',
          obtainedByName: session.user?.fullName || 'Staff Member',
          notes: 'Consent recorded from Text Messages settings.',
        });
      } else {
        try {
          await revokeSMSConsent(
            session.tenantId,
            session.accessToken,
            patientId,
            'Revoked from Text Messages settings'
          );
        } catch (err: any) {
          // Preference update still applies when no prior consent record exists.
          if (!String(err?.message || '').toLowerCase().includes('no consent record found')) {
            throw err;
          }
        }
      }

      await updatePatientSMSPreferences(session.tenantId, session.accessToken, patientId, {
        optedIn: optIn,
      });

      setPatients(prev => prev.map(p =>
        p.id === patientId ? { ...p, smsOptIn: optIn, smsOptInDate: optIn ? new Date().toISOString() : undefined } : p
      ));
      setPatientConsent(prev => ({
        ...prev,
        [patientId]: {
          hasConsent: optIn,
          daysUntilExpiration: optIn ? null : prev[patientId]?.daysUntilExpiration,
        },
      }));
      showSuccess(optIn ? 'Patient opted in to SMS' : 'Patient opted out of SMS');
    } catch (err: any) {
      showError(err.message || 'Failed to update SMS preference');
    }
  };

  const handleConsentSave = async (data: { consentMethod: 'verbal' | 'written' | 'electronic'; obtainedByName: string; expirationDate?: string; notes?: string }) => {
    if (!session || !selectedPatientId) return;

    try {
      await recordSMSConsent(session.tenantId, session.accessToken, selectedPatientId, data);
      await checkPatientConsent(selectedPatientId);
      showSuccess('SMS consent recorded');
      setShowConsentModal(false);
    } catch (err: any) {
      showError(err.message || 'Failed to record consent');
    }
  };

  const handleExportAuditLog = async () => {
    if (!session) return;

    try {
      const blob = await exportSMSAuditLog(session.tenantId, session.accessToken, auditFilters);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sms-audit-log-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      showSuccess('Audit log exported');
    } catch (err: any) {
      showError(err.message || 'Failed to export audit log');
    }
  };

  const handleSaveSettings = async () => {
    if (!session || !smsSettings) return;
    setSavingSettings(true);
    try {
      const payload: Partial<SMSSettings> = {
        appointmentRemindersEnabled: settingsDraft.appointmentRemindersEnabled,
        reminderHoursBefore: settingsDraft.reminderHoursBefore,
        allowPatientReplies: settingsDraft.allowPatientReplies,
        reminderTemplate: settingsDraft.reminderTemplate,
        confirmationTemplate: settingsDraft.confirmationTemplate,
        cancellationTemplate: settingsDraft.cancellationTemplate,
        rescheduleTemplate: settingsDraft.rescheduleTemplate,
        isActive: settingsDraft.isActive,
        isTestMode: settingsDraft.isTestMode,
      };

      await updateSMSSettings(session.tenantId, session.accessToken, payload);
      showSuccess('SMS settings saved');
      await loadSMSSettings();
    } catch (err: any) {
      showError(err.message || 'Failed to save SMS settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveAutoResponseRule = async (ruleId: string) => {
    if (!session) return;
    const draft = autoResponseDrafts[ruleId];
    if (!draft) return;

    setSavingAutoResponseId(ruleId);
    try {
      const payload = draft.isSystemKeyword
        ? { isActive: draft.isActive }
        : { responseText: draft.responseText, isActive: draft.isActive };

      await updateSMSAutoResponse(session.tenantId, session.accessToken, ruleId, payload);
      showSuccess('Rule updated');
      await loadAutoResponseRules();
    } catch (err: any) {
      showError(err.message || 'Failed to update rule');
    } finally {
      setSavingAutoResponseId(null);
    }
  };

  const handleRunReminderRules = async () => {
    if (!session) return;
    setRunningReminderRules(true);
    try {
      const result = await processSMSWorkflowReminders(session.tenantId, session.accessToken);
      showSuccess(
        `Reminder rules processed${typeof result?.sent === 'number' ? ` (${result.sent} sent)` : ''}`
      );
    } catch (err: any) {
      showError(err.message || 'Failed to run reminder rules');
    } finally {
      setRunningReminderRules(false);
    }
  };

  const handleRunFollowupRules = async () => {
    if (!session) return;
    setRunningFollowupRules(true);
    try {
      const result = await processSMSWorkflowFollowups(session.tenantId, session.accessToken);
      showSuccess(
        `Follow-up rules processed${typeof result?.sent === 'number' ? ` (${result.sent} sent)` : ''}`
      );
    } catch (err: any) {
      showError(err.message || 'Failed to run follow-up rules');
    } finally {
      setRunningFollowupRules(false);
    }
  };

  const insertTemplate = (template: SMSTemplate) => {
    const patient = patients.find(p => p.id === selectedPatientId);
    let body = getTemplateMessageBody(template);
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
            { id: 'rules', label: 'Rules' },
            { id: 'audit', label: 'Audit Log' },
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
                      <div className="sms-chat-header-name">
                        {selectedPatient.firstName} {selectedPatient.lastName}
                        {patientConsent[selectedPatientId]?.hasConsent && (
                          <span className="sms-consent-badge" title="SMS consent documented">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <circle cx="8" cy="8" r="7" fill="#22c55e"/>
                              <path d="M5 8L7 10L11 6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </span>
                        )}
                        {patientConsent[selectedPatientId]?.daysUntilExpiration !== undefined &&
                         patientConsent[selectedPatientId]?.daysUntilExpiration !== null &&
                         patientConsent[selectedPatientId]!.daysUntilExpiration <= 30 && (
                          <span className="sms-consent-warning" title={`Consent expires in ${patientConsent[selectedPatientId]?.daysUntilExpiration} days`}>
                            Consent expires in {patientConsent[selectedPatientId]?.daysUntilExpiration} days
                          </span>
                        )}
                      </div>
                      <div className="sms-chat-header-phone">{formatPhoneNumber(selectedPatient.phone || '')}</div>
                    </div>
                    <div className="sms-chat-header-actions">
                      {!patientConsent[selectedPatientId]?.hasConsent && (
                        <button
                          className="btn-primary btn-sm"
                          onClick={() => setShowConsentModal(true)}
                          style={{ marginRight: '8px' }}
                        >
                          Record Consent
                        </button>
                      )}
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
                    {/* PHI Warning Banner */}
                    <div className="sms-phi-warning">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M8 1L1 14H15L8 1Z" fill="#f59e0b" stroke="#f59e0b" strokeWidth="1"/>
                        <path d="M8 6V9" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                        <circle cx="8" cy="11" r="0.5" fill="white"/>
                      </svg>
                      <span>Do not include PHI (diagnoses, lab results, sensitive info) in SMS messages</span>
                    </div>

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
                          {charCount > 160 && <span className="sms-segment-warning"> (Multiple SMS segments)</span>}
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
                              <div className="sms-template-dropdown-preview">{getTemplateMessageBody(tpl).substring(0, 50)}...</div>
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
              <>
                {['appointment', 'appointment_reminders', 'recall', 'follow_up_care', 'billing_payment', 'general_communication', 'general'].map(category => {
                  const categoryTemplates = templates.filter(t => (t.category || 'general_communication') === category);
                  if (categoryTemplates.length === 0) return null;

                  const categoryLabels: { [key: string]: string } = {
                    appointment: 'Appointment',
                    appointment_reminders: 'Appointment Reminders',
                    recall: 'Recall',
                    follow_up_care: 'Follow-up Care',
                    billing_payment: 'Billing/Payment',
                    general_communication: 'General Communication',
                    general: 'General',
                  };

                  return (
                    <Panel key={category} title={`${categoryLabels[category]} (${categoryTemplates.length})`}>
                      <table className="sms-table">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Message Preview</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {categoryTemplates.map(template => (
                            <tr key={template.id}>
                              <td className="strong">{template.name}</td>
                              <td className="sms-preview-cell">{getTemplateMessageBody(template)}</td>
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
                  );
                })}
              </>
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
                      if (tpl) setBulkMessageText(getTemplateMessageBody(tpl));
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
                    {scheduledMessages.map(msg => {
                      const recipientLabel =
                        msg.patientName ||
                        (msg as ScheduledMessage & { recipientName?: string }).recipientName ||
                        (msg as ScheduledMessage & { recipientPhone?: string }).recipientPhone ||
                        'Unknown';
                      const scheduledTimestamp =
                        msg.scheduledSendTime ||
                        (msg as ScheduledMessage & { scheduledFor?: string }).scheduledFor;
                      return (
                      <tr key={msg.id}>
                        <td className="strong">{recipientLabel}</td>
                        <td className="sms-preview-cell">{msg.messageBody}</td>
                        <td>{scheduledTimestamp ? new Date(scheduledTimestamp).toLocaleString() : '-'}</td>
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
                      );
                    })}
                  </tbody>
                </table>
              </Panel>
            )}
          </div>
        )}

        {/* Rules Tab */}
        {activeTab === 'rules' && (
          <div className="sms-rules-tab">
            <div className="sms-templates-header">
              <h2>Messaging Rules</h2>
              <button className="btn-secondary" onClick={loadAutoResponseRules}>Refresh Rules</button>
            </div>

            <Panel title="Automation Controls">
              <p className="muted" style={{ marginBottom: '16px' }}>
                Run workflow rule processors on demand. These controls are useful during rollout and troubleshooting.
              </p>
              <div className="sms-rules-actions">
                <button
                  className="btn-primary"
                  onClick={handleRunReminderRules}
                  disabled={runningReminderRules}
                >
                  {runningReminderRules ? 'Running Reminder Rules...' : 'Process Reminder Rules'}
                </button>
                <button
                  className="btn-secondary"
                  onClick={handleRunFollowupRules}
                  disabled={runningFollowupRules}
                >
                  {runningFollowupRules ? 'Running Follow-up Rules...' : 'Process Follow-up Rules'}
                </button>
              </div>
            </Panel>

            {rulesLoading ? (
              <Panel title="Keyword Auto-Responses">
                <p className="muted">Loading rules...</p>
              </Panel>
            ) : autoResponses.length === 0 ? (
              <div className="sms-empty-state">
                <h3>No rules configured</h3>
                <p>Keyword auto-response rules will appear here once configured.</p>
              </div>
            ) : (
              <Panel title={`Keyword Auto-Responses (${autoResponses.length})`}>
                <table className="sms-table">
                  <thead>
                    <tr>
                      <th>Keyword</th>
                      <th>Action</th>
                      <th>Response</th>
                      <th>Enabled</th>
                      <th>Save</th>
                    </tr>
                  </thead>
                  <tbody>
                    {autoResponses.map(rule => {
                      const draft = autoResponseDrafts[rule.id] || {
                        responseText: rule.responseText,
                        isActive: rule.isActive,
                        isSystemKeyword: rule.isSystemKeyword,
                      };
                      return (
                        <tr key={rule.id}>
                          <td className="strong">
                            {rule.keyword}
                            {rule.isSystemKeyword && (
                              <span className="sms-system-rule-badge">System</span>
                            )}
                          </td>
                          <td>{rule.action}</td>
                          <td>
                            <textarea
                              className="sms-textarea sms-rule-textarea"
                              value={draft.responseText}
                              disabled={draft.isSystemKeyword}
                              onChange={e => setAutoResponseDrafts(prev => ({
                                ...prev,
                                [rule.id]: {
                                  ...draft,
                                  responseText: e.target.value,
                                },
                              }))}
                            />
                          </td>
                          <td>
                            <label className="sms-inline-checkbox">
                              <input
                                type="checkbox"
                                checked={draft.isActive}
                                onChange={e => setAutoResponseDrafts(prev => ({
                                  ...prev,
                                  [rule.id]: {
                                    ...draft,
                                    isActive: e.target.checked,
                                  },
                                }))}
                              />
                              Active
                            </label>
                          </td>
                          <td>
                            <button
                              className="btn-sm btn-primary"
                              onClick={() => handleSaveAutoResponseRule(rule.id)}
                              disabled={savingAutoResponseId === rule.id}
                            >
                              {savingAutoResponseId === rule.id ? 'Saving...' : 'Save'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Panel>
            )}
          </div>
        )}

        {/* Audit Log Tab */}
        {activeTab === 'audit' && (
          <div className="sms-audit-tab">
            <div className="sms-templates-header">
              <h2>SMS Audit Log</h2>
              <button
                className="btn-primary"
                onClick={handleExportAuditLog}
              >
                Export Audit Log (CSV)
              </button>
            </div>

            {auditSummary && (
              <Panel title="Summary Statistics">
                <div className="sms-audit-summary">
                  <div className="sms-audit-stat">
                    <span className="sms-audit-stat-value">{auditSummary.messagesSent}</span>
                    <span className="sms-audit-stat-label">Messages Sent</span>
                  </div>
                  <div className="sms-audit-stat">
                    <span className="sms-audit-stat-value">{auditSummary.messagesReceived}</span>
                    <span className="sms-audit-stat-label">Messages Received</span>
                  </div>
                  <div className="sms-audit-stat">
                    <span className="sms-audit-stat-value">{auditSummary.consentsObtained}</span>
                    <span className="sms-audit-stat-label">Consents Obtained</span>
                  </div>
                  <div className="sms-audit-stat">
                    <span className="sms-audit-stat-value">{auditSummary.consentsRevoked}</span>
                    <span className="sms-audit-stat-label">Consents Revoked</span>
                  </div>
                  <div className="sms-audit-stat">
                    <span className="sms-audit-stat-value">{auditSummary.optOuts}</span>
                    <span className="sms-audit-stat-label">Opt-Outs</span>
                  </div>
                  <div className="sms-audit-stat">
                    <span className="sms-audit-stat-value">{auditSummary.uniquePatients}</span>
                    <span className="sms-audit-stat-label">Unique Patients</span>
                  </div>
                </div>
              </Panel>
            )}

            <Panel title="Filters">
              <div className="sms-audit-filters">
                <div className="sms-form-group">
                  <label>Event Type</label>
                  <select
                    value={auditFilters.eventType || ''}
                    onChange={e => setAuditFilters({ ...auditFilters, eventType: e.target.value || undefined })}
                    className="sms-select"
                  >
                    <option value="">All Events</option>
                    <option value="message_sent">Message Sent</option>
                    <option value="message_received">Message Received</option>
                    <option value="consent_obtained">Consent Obtained</option>
                    <option value="consent_revoked">Consent Revoked</option>
                    <option value="opt_out">Opt-Out</option>
                  </select>
                </div>
                <div className="sms-form-group">
                  <label>Start Date</label>
                  <input
                    type="date"
                    value={auditFilters.startDate || ''}
                    onChange={e => setAuditFilters({ ...auditFilters, startDate: e.target.value || undefined })}
                    className="sms-input"
                  />
                </div>
                <div className="sms-form-group">
                  <label>End Date</label>
                  <input
                    type="date"
                    value={auditFilters.endDate || ''}
                    onChange={e => setAuditFilters({ ...auditFilters, endDate: e.target.value || undefined })}
                    className="sms-input"
                  />
                </div>
                <button
                  className="btn-secondary"
                  onClick={loadAuditLogs}
                  style={{ marginTop: '24px' }}
                >
                  Apply Filters
                </button>
              </div>
            </Panel>

            {auditLogs.length === 0 ? (
              <div className="sms-empty-state">
                <h3>No audit log entries</h3>
                <p>SMS activity will appear here</p>
              </div>
            ) : (
              <Panel title={`Audit Log Entries (${auditLogs.length})`}>
                <table className="sms-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Event Type</th>
                      <th>Patient</th>
                      <th>Staff Member</th>
                      <th>Message Preview</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map(log => (
                      <tr key={log.id}>
                        <td>{new Date(log.createdAt).toLocaleString()}</td>
                        <td>
                          <span className={`sms-event-badge ${log.eventType}`}>
                            {log.eventType.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td>{log.patientName}</td>
                        <td>{log.userName || '-'}</td>
                        <td className="sms-preview-cell">{log.messagePreview || '-'}</td>
                        <td>{log.status || '-'}</td>
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
              {settingsLoading ? (
                <p className="muted">Loading settings...</p>
              ) : (
                <div className="sms-settings-form">
                  <div className="sms-form-group">
                    <label htmlFor="sms-settings-phone-number">Practice SMS Number</label>
                    <input
                      id="sms-settings-phone-number"
                      type="text"
                      className="sms-input"
                      value={settingsDraft.twilioPhoneNumber || ''}
                      readOnly
                    />
                    <span className="muted tiny">Configured in SMS settings. Contact support to change number assignment.</span>
                  </div>

                  <div className="sms-form-row">
                    <div className="sms-form-group">
                      <label htmlFor="sms-settings-reminder-hours">Reminder Lead Time (Hours)</label>
                      <input
                        id="sms-settings-reminder-hours"
                        type="number"
                        min={1}
                        max={168}
                        className="sms-input"
                        value={settingsDraft.reminderHoursBefore || 24}
                        onChange={e => setSettingsDraft(prev => ({
                          ...prev,
                          reminderHoursBefore: Number(e.target.value) || 24,
                        }))}
                      />
                    </div>
                    <div className="sms-form-group">
                      <label htmlFor="sms-settings-channel-mode">Channel Mode</label>
                      <select
                        id="sms-settings-channel-mode"
                        className="sms-select"
                        value={settingsDraft.isTestMode ? 'test' : 'production'}
                        onChange={e => setSettingsDraft(prev => ({
                          ...prev,
                          isTestMode: e.target.value === 'test',
                        }))}
                      >
                        <option value="test">Test Mode</option>
                        <option value="production">Production Mode</option>
                      </select>
                    </div>
                  </div>

                  <div className="sms-form-group">
                    <label className="sms-inline-checkbox">
                      <input
                        type="checkbox"
                        checked={Boolean(settingsDraft.isActive)}
                        onChange={e => setSettingsDraft(prev => ({ ...prev, isActive: e.target.checked }))}
                      />
                      SMS channel active
                    </label>
                    <label className="sms-inline-checkbox">
                      <input
                        type="checkbox"
                        checked={Boolean(settingsDraft.appointmentRemindersEnabled)}
                        onChange={e => setSettingsDraft(prev => ({
                          ...prev,
                          appointmentRemindersEnabled: e.target.checked,
                        }))}
                      />
                      Appointment reminder rules enabled
                    </label>
                    <label className="sms-inline-checkbox">
                      <input
                        type="checkbox"
                        checked={Boolean(settingsDraft.allowPatientReplies)}
                        onChange={e => setSettingsDraft(prev => ({
                          ...prev,
                          allowPatientReplies: e.target.checked,
                        }))}
                      />
                      Allow inbound patient replies
                    </label>
                  </div>

                  <div className="sms-form-group">
                    <label htmlFor="sms-settings-reminder-template">Reminder Template</label>
                    <textarea
                      id="sms-settings-reminder-template"
                      className="sms-textarea"
                      rows={2}
                      value={settingsDraft.reminderTemplate || ''}
                      onChange={e => setSettingsDraft(prev => ({ ...prev, reminderTemplate: e.target.value }))}
                    />
                  </div>

                  <div className="sms-form-group">
                    <label htmlFor="sms-settings-confirmation-template">Confirmation Template</label>
                    <textarea
                      id="sms-settings-confirmation-template"
                      className="sms-textarea"
                      rows={2}
                      value={settingsDraft.confirmationTemplate || ''}
                      onChange={e => setSettingsDraft(prev => ({ ...prev, confirmationTemplate: e.target.value }))}
                    />
                  </div>

                  <div className="sms-form-group">
                    <label htmlFor="sms-settings-cancellation-template">Cancellation Template</label>
                    <textarea
                      id="sms-settings-cancellation-template"
                      className="sms-textarea"
                      rows={2}
                      value={settingsDraft.cancellationTemplate || ''}
                      onChange={e => setSettingsDraft(prev => ({ ...prev, cancellationTemplate: e.target.value }))}
                    />
                  </div>

                  <div className="sms-form-group">
                    <label htmlFor="sms-settings-reschedule-template">Reschedule Template</label>
                    <textarea
                      id="sms-settings-reschedule-template"
                      className="sms-textarea"
                      rows={2}
                      value={settingsDraft.rescheduleTemplate || ''}
                      onChange={e => setSettingsDraft(prev => ({ ...prev, rescheduleTemplate: e.target.value }))}
                    />
                  </div>

                  <div className="sms-settings-actions">
                    <button className="btn-primary" onClick={handleSaveSettings} disabled={savingSettings}>
                      {savingSettings ? 'Saving Settings...' : 'Save Messaging Settings'}
                    </button>
                  </div>
                </div>
              )}
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
              await loadScheduledMessages();
              showSuccess('Message scheduled');
            } catch (err: any) {
              showError(err.message || 'Failed to schedule message');
              return;
            }
            setShowScheduleModal(false);
          }}
          onCancel={() => setShowScheduleModal(false)}
        />
      </Modal>

      {/* Consent Modal */}
      <Modal
        isOpen={showConsentModal}
        title="Record SMS Consent"
        onClose={() => setShowConsentModal(false)}
      >
        <ConsentForm
          patientName={selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName}` : ''}
          onSave={handleConsentSave}
          onCancel={() => setShowConsentModal(false)}
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
  const [body, setBody] = useState(getTemplateMessageBody(template || {}));
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
        <label>Category *</label>
        <select value={category} onChange={e => setCategory(e.target.value)} className="sms-select" required>
          <option value="">Select category...</option>
          <option value="appointment_reminders">Appointment Reminders</option>
          <option value="follow_up_care">Follow-up Care</option>
          <option value="billing_payment">Billing/Payment</option>
          <option value="general_communication">General Communication</option>
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
  onSave: (data: { patientId: string; messageBody: string; scheduledSendTime: string }) => void;
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

    const scheduledSendTime = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
    onSave({ patientId, messageBody, scheduledSendTime });
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
              let body = getTemplateMessageBody(tpl);
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

// Consent Form Component
function ConsentForm({
  patientName,
  onSave,
  onCancel,
}: {
  patientName: string;
  onSave: (data: { consentMethod: 'verbal' | 'written' | 'electronic'; obtainedByName: string; expirationDate?: string; notes?: string }) => void;
  onCancel: () => void;
}) {
  const [consentMethod, setConsentMethod] = useState<'verbal' | 'written' | 'electronic'>('verbal');
  const [obtainedByName, setObtainedByName] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!obtainedByName.trim()) return;
    onSave({
      consentMethod,
      obtainedByName,
      expirationDate: expirationDate || undefined,
      notes: notes || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="sms-consent-info">
        <p>Recording SMS consent for: <strong>{patientName}</strong></p>
        <p className="muted">This consent authorizes sending SMS messages to the patient's phone number.</p>
      </div>

      <div className="sms-form-group">
        <label>Consent Method *</label>
        <select
          value={consentMethod}
          onChange={e => setConsentMethod(e.target.value as 'verbal' | 'written' | 'electronic')}
          className="sms-select"
          required
        >
          <option value="verbal">Verbal Consent</option>
          <option value="written">Written Consent</option>
          <option value="electronic">Electronic Consent</option>
        </select>
      </div>

      <div className="sms-form-group">
        <label>Staff Member Obtaining Consent *</label>
        <input
          type="text"
          value={obtainedByName}
          onChange={e => setObtainedByName(e.target.value)}
          placeholder="Enter your name"
          className="sms-input"
          required
        />
      </div>

      <div className="sms-form-group">
        <label>Expiration Date (optional)</label>
        <input
          type="date"
          value={expirationDate}
          onChange={e => setExpirationDate(e.target.value)}
          min={new Date().toISOString().split('T')[0]}
          className="sms-input"
        />
        <span className="muted tiny">Leave blank for no expiration</span>
      </div>

      <div className="sms-form-group">
        <label>Notes (optional)</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Any additional notes about consent..."
          className="sms-textarea"
          rows={3}
        />
      </div>

      <div className="sms-modal-actions">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={!obtainedByName.trim()}>
          Record Consent
        </button>
      </div>
    </form>
  );
}
