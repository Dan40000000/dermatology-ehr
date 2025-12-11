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
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-200 bg-gray-50">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-4 flex-1">
              <button
                onClick={onClose}
                className="p-1 hover:bg-gray-200 rounded"
                title="Back to inbox"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">{thread.subject}</h2>
                <p className="text-sm text-gray-600">
                  {thread.patientName} • MRN: {thread.patientMrn}
                </p>
              </div>
            </div>
            <button
              onClick={handleCloseThread}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Close Thread
            </button>
          </div>

          {/* Thread controls */}
          <div className="flex items-center space-x-4">
            <div>
              <label className="text-xs font-medium text-gray-700 mr-2">Status:</label>
              <select
                value={thread.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="text-sm border-gray-300 rounded-md"
              >
                <option value="open">Open</option>
                <option value="in-progress">In Progress</option>
                <option value="waiting-patient">Waiting for Patient</option>
                <option value="waiting-provider">Waiting for Provider</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-700 mr-2">Assign to:</label>
              <select
                value={thread.assignedToName || ''}
                onChange={(e) => handleAssignChange(e.target.value)}
                className="text-sm border-gray-300 rounded-md"
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
              <label className="text-xs font-medium text-gray-700 mr-2">Priority:</label>
              <select
                value={thread.priority}
                onChange={(e) => handlePriorityChange(e.target.value)}
                className="text-sm border-gray-300 rounded-md"
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
        <div className="px-6 py-3 bg-white border-t border-gray-200">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="font-medium text-gray-700">DOB:</span>{' '}
              <span className="text-gray-600">{thread.patientDob || 'N/A'}</span>
            </div>
            <div>
              <span className="font-medium text-gray-700">Email:</span>{' '}
              <span className="text-gray-600">{thread.patientEmail || 'N/A'}</span>
            </div>
            <div>
              <span className="font-medium text-gray-700">Phone:</span>{' '}
              <span className="text-gray-600">{thread.patientPhone || 'N/A'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50">
        {messages.map((message) => {
          const isStaff = message.senderType === 'staff';
          const isInternalNote = message.isInternalNote;

          return (
            <div
              key={message.id}
              className={`flex ${isStaff ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-2xl ${isStaff ? 'ml-12' : 'mr-12'}`}>
                <div
                  className={`rounded-lg p-4 ${
                    isInternalNote
                      ? 'bg-yellow-50 border-2 border-yellow-300'
                      : isStaff
                      ? 'bg-purple-600 text-white'
                      : 'bg-white border border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`text-sm font-medium ${
                        isInternalNote
                          ? 'text-yellow-900'
                          : isStaff
                          ? 'text-purple-100'
                          : 'text-gray-900'
                      }`}
                    >
                      {message.senderName}
                      {isInternalNote && ' (Internal Note - Patient Cannot See)'}
                    </span>
                    <span
                      className={`text-xs ${
                        isInternalNote
                          ? 'text-yellow-700'
                          : isStaff
                          ? 'text-purple-200'
                          : 'text-gray-500'
                      }`}
                    >
                      {format(new Date(message.sentAt), 'MMM d, yyyy h:mm a')}
                    </span>
                  </div>
                  <p
                    className={`text-sm whitespace-pre-wrap ${
                      isInternalNote
                        ? 'text-yellow-900'
                        : isStaff
                        ? 'text-white'
                        : 'text-gray-700'
                    }`}
                  >
                    {message.messageText}
                  </p>
                  {message.attachments && message.attachments.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {message.attachments.map((att: any) => (
                        <div
                          key={att.id}
                          className={`text-sm ${isStaff ? 'text-purple-100' : 'text-gray-600'}`}
                        >
                          📎 {att.filename} ({Math.round(att.fileSize / 1024)} KB)
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
      <div className="flex-shrink-0 border-t border-gray-200 bg-white p-4">
        <div className="flex items-start space-x-2">
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-2">
              <button
                onClick={() => setShowCannedResponses(true)}
                className="px-3 py-1 text-sm font-medium text-purple-700 bg-purple-100 rounded-md hover:bg-purple-200"
                title="Insert canned response"
              >
                📋 Quick Response
              </button>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isInternalNote}
                  onChange={(e) => setIsInternalNote(e.target.checked)}
                  className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  Internal Note (Patient cannot see)
                </span>
              </label>
            </div>
            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder={isInternalNote ? 'Type internal note...' : 'Type your message...'}
              className="w-full px-3 py-2 border border-gray-300 rounded-md resize-none focus:ring-purple-500 focus:border-purple-500"
              rows={4}
              disabled={sending}
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-gray-500">
                {messageText.length} / 5000 characters
              </span>
              <button
                onClick={handleSendMessage}
                disabled={!messageText.trim() || sending}
                className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
