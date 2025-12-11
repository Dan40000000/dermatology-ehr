import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api';

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount?: number;
}

interface Message {
  id: string;
  direction: 'inbound' | 'outbound';
  messageBody: string;
  status: string;
  sentAt: string;
  deliveredAt?: string;
}

interface Conversation {
  patientId: string;
  patientName: string;
  patientPhone: string;
  messages: Message[];
}

export default function TextMessagesPage() {
  const { tenantId, accessToken } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation?.messages]);

  // Load patients with SMS history
  useEffect(() => {
    loadPatients();
    // Poll for new messages every 10 seconds
    const interval = setInterval(loadPatients, 10000);
    return () => clearInterval(interval);
  }, [tenantId, accessToken]);

  // Load conversation when patient selected
  useEffect(() => {
    if (selectedPatientId) {
      loadConversation(selectedPatientId);
      // Poll for new messages every 5 seconds when conversation open
      const interval = setInterval(() => loadConversation(selectedPatientId), 5000);
      return () => clearInterval(interval);
    }
  }, [selectedPatientId]);

  const loadPatients = async () => {
    if (!tenantId || !accessToken) return;
    try {
      const { patients: allPatients } = await api.get(tenantId, accessToken, '/api/patients?limit=1000');

      // Get SMS history for each patient
      const patientsWithMessages: Patient[] = [];
      for (const patient of allPatients) {
        if (patient.phone) {
          try {
            const { messages } = await api.get(
              tenantId,
              accessToken,
              `/api/sms/messages/patient/${patient.id}`
            );

            const lastMsg = messages[0];
            patientsWithMessages.push({
              id: patient.id,
              firstName: patient.firstName,
              lastName: patient.lastName,
              phone: patient.phone,
              lastMessage: lastMsg?.messageBody,
              lastMessageTime: lastMsg?.sentAt,
              unreadCount: messages.filter((m: Message) =>
                m.direction === 'inbound' && !m.deliveredAt
              ).length,
            });
          } catch (err) {
            // Patient has no SMS history yet
            patientsWithMessages.push({
              id: patient.id,
              firstName: patient.firstName,
              lastName: patient.lastName,
              phone: patient.phone,
            });
          }
        }
      }

      // Sort by last message time
      patientsWithMessages.sort((a, b) => {
        if (!a.lastMessageTime) return 1;
        if (!b.lastMessageTime) return -1;
        return new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime();
      });

      setPatients(patientsWithMessages);
    } catch (error) {
      console.error('Failed to load patients:', error);
    }
  };

  const loadConversation = async (patientId: string) => {
    if (!tenantId || !accessToken) return;
    setLoading(true);
    try {
      const { messages } = await api.get(
        tenantId,
        accessToken,
        `/api/sms/messages/patient/${patientId}`
      );

      const patient = patients.find(p => p.id === patientId);
      if (!patient) return;

      setConversation({
        patientId,
        patientName: `${patient.firstName} ${patient.lastName}`,
        patientPhone: patient.phone,
        messages: messages.reverse(), // Oldest first
      });
    } catch (error) {
      console.error('Failed to load conversation:', error);
      setConversation({
        patientId,
        patientName: patients.find(p => p.id === patientId)?.firstName + ' ' +
                     patients.find(p => p.id === patientId)?.lastName || '',
        patientPhone: patients.find(p => p.id === patientId)?.phone || '',
        messages: [],
      });
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!messageText.trim() || !selectedPatientId || !tenantId || !accessToken) return;

    setSending(true);
    try {
      await api.post(tenantId, accessToken, '/api/sms/send', {
        patientId: selectedPatientId,
        messageBody: messageText,
        messageType: 'conversation',
      });

      setMessageText('');
      // Reload conversation to show sent message
      await loadConversation(selectedPatientId);
      await loadPatients(); // Update patient list
    } catch (error: any) {
      console.error('Failed to send message:', error);
      alert(error.response?.data?.error || 'Failed to send message. Check SMS settings.');
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (timestamp?: string) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const filteredPatients = patients.filter(p =>
    `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.phone.includes(searchQuery)
  );

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-900">Text Messages</h1>
        <p className="text-sm text-gray-600 mt-1">Send and receive SMS messages with patients</p>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Patients List (Left Sidebar) */}
        <div className="w-80 bg-white border-r flex flex-col">
          {/* Search */}
          <div className="p-4 border-b">
            <input
              type="text"
              placeholder="Search patients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Patient List */}
          <div className="flex-1 overflow-y-auto">
            {filteredPatients.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                <p>No patients with phone numbers</p>
              </div>
            ) : (
              filteredPatients.map((patient) => (
                <button
                  key={patient.id}
                  onClick={() => setSelectedPatientId(patient.id)}
                  className={`w-full p-4 border-b hover:bg-gray-50 text-left transition ${
                    selectedPatientId === patient.id ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900 truncate">
                          {patient.firstName} {patient.lastName}
                        </p>
                        {patient.unreadCount && patient.unreadCount > 0 && (
                          <span className="bg-blue-600 text-white text-xs rounded-full px-2 py-0.5">
                            {patient.unreadCount}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{patient.phone}</p>
                      {patient.lastMessage && (
                        <p className="text-sm text-gray-600 truncate mt-1">
                          {patient.lastMessage}
                        </p>
                      )}
                    </div>
                    {patient.lastMessageTime && (
                      <span className="text-xs text-gray-400 ml-2 flex-shrink-0">
                        {formatTime(patient.lastMessageTime)}
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Conversation Area (Right Side) */}
        <div className="flex-1 flex flex-col">
          {!selectedPatientId ? (
            <div className="flex-1 flex items-center justify-center bg-gray-50">
              <div className="text-center">
                <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p className="text-gray-600 text-lg">Select a patient to start messaging</p>
                <p className="text-gray-400 text-sm mt-2">Choose from the list on the left</p>
              </div>
            </div>
          ) : (
            <>
              {/* Conversation Header */}
              <div className="bg-white border-b px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      {conversation?.patientName}
                    </h2>
                    <p className="text-sm text-gray-500">{conversation?.patientPhone}</p>
                  </div>
                  <button
                    onClick={() => loadConversation(selectedPatientId)}
                    className="px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition"
                  >
                    Refresh
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50">
                {loading && !conversation ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : conversation?.messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <p className="text-gray-500">No messages yet</p>
                      <p className="text-gray-400 text-sm mt-1">Send a message to start the conversation</p>
                    </div>
                  </div>
                ) : (
                  conversation?.messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-md px-4 py-3 rounded-lg ${
                          message.direction === 'outbound'
                            ? 'bg-blue-600 text-white'
                            : 'bg-white text-gray-900 border'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{message.messageBody}</p>
                        <div className={`flex items-center gap-2 mt-1 text-xs ${
                          message.direction === 'outbound' ? 'text-blue-100' : 'text-gray-500'
                        }`}>
                          <span>{formatTime(message.sentAt)}</span>
                          {message.direction === 'outbound' && (
                            <span>
                              {message.status === 'delivered' ? '✓✓' :
                               message.status === 'sent' ? '✓' :
                               message.status === 'failed' ? '✗' : '○'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <div className="bg-white border-t px-6 py-4">
                <div className="flex gap-3 items-end">
                  <textarea
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Type a message... (Press Enter to send, Shift+Enter for new line)"
                    rows={3}
                    className="flex-1 px-4 py-3 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={sending}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!messageText.trim() || sending}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
                  >
                    {sending ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Sending...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                        Send
                      </>
                    )}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Messages are sent via SMS to the patient's phone number. Standard messaging rates may apply.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
