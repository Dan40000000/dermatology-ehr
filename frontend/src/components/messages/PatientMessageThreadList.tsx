import type { FC } from 'react';
import { formatDistanceToNow } from 'date-fns';

interface PatientMessageThread {
  id: string;
  patientName: string;
  patientMrn: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  lastMessageAt: string;
  lastMessageBy: string;
  lastMessagePreview: string;
  isReadByStaff: boolean;
  messageCount: number;
  assignedToName?: string;
}

interface PatientMessageThreadListProps {
  threads: PatientMessageThread[];
  selectedThreadId: string | null;
  onThreadSelect: (thread: PatientMessageThread) => void;
  loading?: boolean;
}

const categoryColors: Record<string, string> = {
  general: 'bg-gray-100 text-gray-700',
  prescription: 'bg-blue-100 text-blue-700',
  appointment: 'bg-green-100 text-green-700',
  billing: 'bg-yellow-100 text-yellow-700',
  medical: 'bg-red-100 text-red-700',
  other: 'bg-gray-100 text-gray-700',
};

const statusColors: Record<string, string> = {
  open: 'bg-purple-100 text-purple-700',
  'in-progress': 'bg-blue-100 text-blue-700',
  'waiting-patient': 'bg-yellow-100 text-yellow-700',
  'waiting-provider': 'bg-orange-100 text-orange-700',
  closed: 'bg-gray-100 text-gray-600',
};

const priorityIcons: Record<string, string> = {
  urgent: '🚨',
  high: '⚠️',
  normal: '',
  low: '',
};

export const PatientMessageThreadList: FC<PatientMessageThreadListProps> = ({
  threads,
  selectedThreadId,
  onThreadSelect,
  loading,
}) => {
  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <div className="text-center">
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
              d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
            />
          </svg>
          <p className="text-lg font-medium">No messages</p>
          <p className="text-sm">Patient messages will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-200">
      {threads.map((thread) => {
        const isSelected = thread.id === selectedThreadId;
        const isUnread = !thread.isReadByStaff;

        return (
          <div
            key={thread.id}
            onClick={() => onThreadSelect(thread)}
            className={`p-4 cursor-pointer transition-colors hover:bg-gray-50 ${
              isSelected ? 'bg-purple-50 border-l-4 border-purple-600' : ''
            } ${isUnread ? 'bg-blue-50' : ''}`}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center space-x-2 flex-1 min-w-0">
                {priorityIcons[thread.priority] && (
                  <span className="text-lg flex-shrink-0">
                    {priorityIcons[thread.priority]}
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <h3
                      className={`text-sm truncate ${
                        isUnread ? 'font-bold text-gray-900' : 'font-medium text-gray-700'
                      }`}
                    >
                      {thread.patientName}
                    </h3>
                    <span className="text-xs text-gray-500 flex-shrink-0">
                      MRN: {thread.patientMrn}
                    </span>
                  </div>
                  <p
                    className={`text-sm truncate ${
                      isUnread ? 'font-semibold text-gray-900' : 'text-gray-600'
                    }`}
                  >
                    {thread.subject}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end space-y-1 ml-2 flex-shrink-0">
                <span className="text-xs text-gray-500">
                  {formatDistanceToNow(new Date(thread.lastMessageAt), { addSuffix: true })}
                </span>
                {isUnread && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-600 text-white">
                    New
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-2 mb-2">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  categoryColors[thread.category] || categoryColors.other
                }`}
              >
                {thread.category.charAt(0).toUpperCase() + thread.category.slice(1)}
              </span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  statusColors[thread.status] || statusColors.open
                }`}
              >
                {thread.status.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
              </span>
              {thread.assignedToName && (
                <span className="text-xs text-gray-500">
                  Assigned to: {thread.assignedToName}
                </span>
              )}
            </div>

            <p className="text-sm text-gray-600 truncate">
              {thread.lastMessageBy === 'patient' ? '👤 ' : '👨‍⚕️ '}
              {thread.lastMessagePreview}
            </p>

            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-gray-500">
                {thread.messageCount} message{thread.messageCount !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
