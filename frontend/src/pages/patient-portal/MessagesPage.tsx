import { useState, useEffect } from 'react';
import type { FC } from 'react';
import { formatDistanceToNow } from 'date-fns';

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
      // Fetch patient threads
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
      setThreads(data.threads || []);
    } catch (error) {
      console.error('Error fetching threads:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleThreadClick = (thread: PatientThread) => {
    setSelectedThread(thread);
  };

  const categoryColors: Record<string, string> = {
    general: 'bg-gray-100 text-gray-700',
    prescription: 'bg-blue-100 text-blue-700',
    appointment: 'bg-green-100 text-green-700',
    billing: 'bg-yellow-100 text-yellow-700',
    medical: 'bg-red-100 text-red-700',
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Messages</h1>
              <p className="mt-1 text-sm text-gray-600">
                Secure communication with your healthcare provider
              </p>
            </div>
            <button
              onClick={() => setShowComposer(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700"
            >
              New Message
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-4 flex items-center space-x-2 overflow-x-auto">
          {['all', 'general', 'prescription', 'appointment', 'billing', 'medical'].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-4 py-2 text-sm font-medium rounded-md whitespace-nowrap ${
                filter === cat
                  ? 'bg-purple-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>

        {/* Thread list */}
        <div className="bg-white rounded-lg shadow">
          {loading ? (
            <div className="p-8 text-center">
              <div className="inline-block w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : threads.length === 0 ? (
            <div className="p-8 text-center">
              <svg
                className="w-16 h-16 mx-auto mb-4 text-gray-400"
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
              <p className="text-lg font-medium text-gray-900">No messages</p>
              <p className="text-sm text-gray-500">Start a new conversation with your provider</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {threads.map((thread) => (
                <div
                  key={thread.id}
                  onClick={() => handleThreadClick(thread)}
                  className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <h3 className={`text-sm font-${thread.isReadByPatient ? 'medium' : 'bold'} text-gray-900 truncate`}>
                          {thread.subject}
                        </h3>
                        {!thread.isReadByPatient && thread.unreadCount > 0 && (
                          <span className="px-2 py-0.5 text-xs font-medium text-white bg-purple-600 rounded-full">
                            {thread.unreadCount} new
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-2 mb-2">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded ${categoryColors[thread.category] || categoryColors.general}`}>
                          {thread.category.charAt(0).toUpperCase() + thread.category.slice(1)}
                        </span>
                        <span className="text-xs text-gray-500">
                          {thread.messageCount} message{thread.messageCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 truncate">
                        {thread.lastMessagePreview}
                      </p>
                    </div>
                    <span className="ml-4 text-xs text-gray-500 flex-shrink-0">
                      {formatDistanceToNow(new Date(thread.lastMessageAt), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Important notice */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">For urgent medical needs</h3>
              <p className="mt-1 text-sm text-blue-700">
                Please call our office at (555) 123-4567 or seek emergency care at your nearest emergency room. This messaging system is not monitored 24/7 and should not be used for urgent medical concerns.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Modals would go here */}
      {showComposer && <MessageComposer onClose={() => setShowComposer(false)} onSuccess={fetchThreads} />}
      {selectedThread && <MessageThreadView thread={selectedThread} onClose={() => setSelectedThread(null)} />}
    </div>
  );
}

// Placeholder components
const MessageComposer: FC<{ onClose: () => void; onSuccess: () => void }> = ({ onClose }) => (
  <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
    <div className="bg-white rounded-lg p-6 max-w-2xl w-full">
      <h2 className="text-xl font-bold mb-4">New Message</h2>
      <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded">Close</button>
    </div>
  </div>
);

const MessageThreadView: FC<{ thread: any; onClose: () => void }> = ({ thread, onClose }) => (
  <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
    <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
      <h2 className="text-xl font-bold mb-4">{thread.subject}</h2>
      <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded">Close</button>
    </div>
  </div>
);
