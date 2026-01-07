import { useState } from 'react';

interface HistoryEntry {
  timestamp: string;
  event: string;
  status: string;
  userId?: string;
  notes?: string;
  externalReferenceId?: string;
}

interface PAHistoryAccordionProps {
  history: HistoryEntry[];
}

export function PAHistoryAccordion({ history }: PAHistoryAccordionProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!history || history.length === 0) {
    return null;
  }

  const sortedHistory = [...history].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        overflow: 'hidden',
        marginTop: '1rem',
      }}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          padding: '0.75rem 1rem',
          background: '#f9fafb',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          fontSize: '0.875rem',
          fontWeight: 600,
          color: '#374151',
        }}
      >
        <span>
          PA History & Timeline ({history.length} {history.length === 1 ? 'event' : 'events'})
        </span>
        <span
          style={{
            transition: 'transform 0.2s',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          ▼
        </span>
      </button>

      {isOpen && (
        <div style={{ padding: '1rem', background: '#ffffff' }}>
          <div style={{ position: 'relative' }}>
            {sortedHistory.map((entry, index) => {
              const isLast = index === sortedHistory.length - 1;

              return (
                <div
                  key={index}
                  style={{
                    position: 'relative',
                    paddingLeft: '2rem',
                    paddingBottom: isLast ? '0' : '1.5rem',
                  }}
                >
                  {/* Timeline dot */}
                  <div
                    style={{
                      position: 'absolute',
                      left: '0.375rem',
                      top: '0.25rem',
                      width: '0.75rem',
                      height: '0.75rem',
                      borderRadius: '50%',
                      background: getStatusColor(entry.event),
                      border: '2px solid #ffffff',
                      boxShadow: '0 0 0 2px #e5e7eb',
                      zIndex: 1,
                    }}
                  />

                  {/* Timeline line */}
                  {!isLast && (
                    <div
                      style={{
                        position: 'absolute',
                        left: '0.6875rem',
                        top: '1.25rem',
                        bottom: '0',
                        width: '2px',
                        background: '#e5e7eb',
                      }}
                    />
                  )}

                  {/* Content */}
                  <div style={{ paddingTop: '0.125rem' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: '0.5rem',
                        marginBottom: '0.25rem',
                      }}
                    >
                      <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827' }}>
                        {formatEventName(entry.event)}
                      </span>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          color: '#6b7280',
                        }}
                      >
                        {new Date(entry.timestamp).toLocaleString()}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      Status: <span style={{ fontWeight: 500 }}>{entry.status}</span>
                    </div>

                    {entry.notes && (
                      <div
                        style={{
                          marginTop: '0.25rem',
                          fontSize: '0.75rem',
                          color: '#374151',
                          fontStyle: 'italic',
                        }}
                      >
                        {entry.notes}
                      </div>
                    )}

                    {entry.externalReferenceId && (
                      <div
                        style={{
                          marginTop: '0.25rem',
                          fontSize: '0.75rem',
                          color: '#6b7280',
                        }}
                      >
                        Ref ID: <code style={{ fontSize: '0.6875rem' }}>{entry.externalReferenceId}</code>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function getStatusColor(event: string): string {
  const eventLower = event.toLowerCase();
  if (eventLower.includes('created')) return '#3b82f6';
  if (eventLower.includes('submitted')) return '#8b5cf6';
  if (eventLower.includes('approved')) return '#10b981';
  if (eventLower.includes('denied')) return '#ef4444';
  if (eventLower.includes('error')) return '#f59e0b';
  return '#6b7280';
}

function formatEventName(event: string): string {
  return event
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
