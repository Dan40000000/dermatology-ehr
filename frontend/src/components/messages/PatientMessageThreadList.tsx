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
  urgent: '',
  high: '',
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '1rem' }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{ height: '6rem', background: '#f3f4f6', borderRadius: '0.5rem', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }} />
        ))}
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '16rem', color: '#6b7280' }}>
        <div style={{ textAlign: 'center' }}>
          <svg
            style={{ width: '4rem', height: '4rem', margin: '0 auto 1rem', color: '#9ca3af' }}
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
          <p style={{ fontSize: '1.125rem', fontWeight: '500' }}>No messages</p>
          <p style={{ fontSize: '0.875rem' }}>Patient messages will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ borderTop: '1px solid #e5e7eb' }}>
      {threads.map((thread) => {
        const isSelected = thread.id === selectedThreadId;
        const isUnread = !thread.isReadByStaff;

        return (
          <div
            key={thread.id}
            onClick={() => onThreadSelect(thread)}
            style={{
              padding: '1rem',
              cursor: 'pointer',
              transition: 'background-color 0.15s',
              background: isSelected ? '#faf5ff' : isUnread ? '#eff6ff' : 'white',
              borderLeft: isSelected ? '4px solid #7c3aed' : 'none',
              borderBottom: '1px solid #e5e7eb',
              paddingLeft: isSelected ? 'calc(1rem - 4px)' : '1rem'
            }}
            onMouseEnter={(e) => !isSelected && (e.currentTarget.style.background = '#f9fafb')}
            onMouseLeave={(e) => !isSelected && (e.currentTarget.style.background = isUnread ? '#eff6ff' : 'white')}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                {priorityIcons[thread.priority] && (
                  <span style={{ fontSize: '1.125rem', flexShrink: 0 }}>
                    {priorityIcons[thread.priority]}
                  </span>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <h3
                      style={{
                        fontSize: '0.875rem',
                        fontWeight: isUnread ? 'bold' : '500',
                        color: isUnread ? '#111827' : '#374151',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {thread.patientName}
                    </h3>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280', flexShrink: 0 }}>
                      MRN: {thread.patientMrn}
                    </span>
                  </div>
                  <p
                    style={{
                      fontSize: '0.875rem',
                      fontWeight: isUnread ? '600' : 'normal',
                      color: isUnread ? '#111827' : '#4b5563',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {thread.subject}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem', marginLeft: '0.5rem', flexShrink: 0 }}>
                <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                  {formatDistanceToNow(new Date(thread.lastMessageAt), { addSuffix: true })}
                </span>
                {isUnread && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0.125rem 0.5rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: '500', background: '#2563eb', color: 'white' }}>
                    New
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '0.125rem 0.5rem',
                  borderRadius: '0.25rem',
                  fontSize: '0.75rem',
                  fontWeight: '500',
                  background: categoryColors[thread.category]?.includes('gray') ? '#f3f4f6' :
                             categoryColors[thread.category]?.includes('blue') ? '#dbeafe' :
                             categoryColors[thread.category]?.includes('green') ? '#d1fae5' :
                             categoryColors[thread.category]?.includes('yellow') ? '#fef3c7' :
                             categoryColors[thread.category]?.includes('red') ? '#fee2e2' : '#f3f4f6',
                  color: categoryColors[thread.category]?.includes('gray') ? '#374151' :
                         categoryColors[thread.category]?.includes('blue') ? '#1e40af' :
                         categoryColors[thread.category]?.includes('green') ? '#065f46' :
                         categoryColors[thread.category]?.includes('yellow') ? '#92400e' :
                         categoryColors[thread.category]?.includes('red') ? '#991b1b' : '#374151'
                }}
              >
                {thread.category.charAt(0).toUpperCase() + thread.category.slice(1)}
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '0.125rem 0.5rem',
                  borderRadius: '0.25rem',
                  fontSize: '0.75rem',
                  fontWeight: '500',
                  background: statusColors[thread.status]?.includes('purple') ? '#f3e8ff' :
                             statusColors[thread.status]?.includes('blue') ? '#dbeafe' :
                             statusColors[thread.status]?.includes('yellow') ? '#fef3c7' :
                             statusColors[thread.status]?.includes('orange') ? '#fed7aa' :
                             statusColors[thread.status]?.includes('gray') ? '#f3f4f6' : '#f3f4f6',
                  color: statusColors[thread.status]?.includes('purple') ? '#6b21a8' :
                         statusColors[thread.status]?.includes('blue') ? '#1e40af' :
                         statusColors[thread.status]?.includes('yellow') ? '#92400e' :
                         statusColors[thread.status]?.includes('orange') ? '#c2410c' :
                         statusColors[thread.status]?.includes('gray') ? '#4b5563' : '#4b5563'
                }}
              >
                {thread.status.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
              </span>
              {thread.assignedToName && (
                <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                  Assigned to: {thread.assignedToName}
                </span>
              )}
            </div>

            <p style={{ fontSize: '0.875rem', color: '#4b5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {thread.lastMessageBy === 'patient' ? '' : ''}
              {thread.lastMessagePreview}
            </p>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                {thread.messageCount} message{thread.messageCount !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
