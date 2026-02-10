/**
 * SMSInbox Component
 * Displays a list of SMS conversations with patients
 */

import { useState, useEffect, useCallback } from 'react';
import type { FC } from 'react';
import { formatDistanceToNow } from 'date-fns';

interface SMSConversation {
  id: string;
  patientId: string;
  patientName: string;
  patientMrn?: string;
  phoneNumber: string;
  status: 'active' | 'archived' | 'blocked';
  lastMessageAt: string | null;
  lastMessageDirection: 'inbound' | 'outbound' | null;
  lastMessagePreview: string | null;
  unreadCount: number;
}

interface SMSInboxProps {
  tenantId: string;
  accessToken: string;
  selectedConversationId: string | null;
  onSelectConversation: (conversation: SMSConversation) => void;
  onNewMessage?: () => void;
  refreshTrigger?: number;
}

export const SMSInbox: FC<SMSInboxProps> = ({
  tenantId,
  accessToken,
  selectedConversationId,
  onSelectConversation,
  onNewMessage,
  refreshTrigger,
}) => {
  const [conversations, setConversations] = useState<SMSConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread' | 'archived'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchConversations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/sms/conversations', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-tenant-id': tenantId,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load conversations');
      }

      const data = await response.json();
      setConversations(data.conversations || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversations');
    } finally {
      setLoading(false);
    }
  }, [tenantId, accessToken]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations, refreshTrigger]);

  // Poll for new messages
  useEffect(() => {
    const interval = setInterval(fetchConversations, 30000); // Poll every 30 seconds
    return () => clearInterval(interval);
  }, [fetchConversations]);

  const filteredConversations = conversations.filter((conv) => {
    // Apply status filter
    if (filter === 'unread' && conv.unreadCount === 0) return false;
    if (filter === 'archived' && conv.status !== 'archived') return false;
    if (filter === 'all' && conv.status === 'archived') return false;

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        conv.patientName.toLowerCase().includes(query) ||
        conv.phoneNumber.includes(query) ||
        conv.patientMrn?.toLowerCase().includes(query)
      );
    }

    return true;
  });

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  if (loading && conversations.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'white' }}>
        <div style={{ padding: '1rem', borderBottom: '1px solid #e5e7eb' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111827' }}>
            SMS Messages
          </h2>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: '#6b7280' }}>
            <div style={{
              width: '2rem',
              height: '2rem',
              margin: '0 auto 0.5rem',
              border: '2px solid #e5e7eb',
              borderTopColor: '#7c3aed',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
            <p>Loading conversations...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'white' }}>
        <div style={{ padding: '1rem', borderBottom: '1px solid #e5e7eb' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111827' }}>
            SMS Messages
          </h2>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ textAlign: 'center', color: '#dc2626' }}>
            <svg style={{ width: '3rem', height: '3rem', margin: '0 auto 0.5rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p style={{ marginBottom: '0.5rem' }}>{error}</p>
            <button
              onClick={fetchConversations}
              style={{
                padding: '0.5rem 1rem',
                background: '#7c3aed',
                color: 'white',
                borderRadius: '0.375rem',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'white' }}>
      {/* Header */}
      <div style={{ padding: '1rem', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111827', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            SMS Messages
            {totalUnread > 0 && (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: '1.25rem',
                height: '1.25rem',
                padding: '0 0.375rem',
                background: '#dc2626',
                color: 'white',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: '600',
              }}>
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
          </h2>
          {onNewMessage && (
            <button
              onClick={onNewMessage}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.375rem 0.75rem',
                background: '#7c3aed',
                color: 'white',
                borderRadius: '0.375rem',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500',
              }}
            >
              <svg style={{ width: '1rem', height: '1rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New
            </button>
          )}
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
          <svg
            style={{
              position: 'absolute',
              left: '0.75rem',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '1rem',
              height: '1rem',
              color: '#9ca3af',
            }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search patients..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem 0.5rem 2.25rem',
              border: '1px solid #e5e7eb',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              outline: 'none',
            }}
          />
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          {(['all', 'unread', 'archived'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              style={{
                padding: '0.375rem 0.75rem',
                background: filter === tab ? '#7c3aed' : '#f3f4f6',
                color: filter === tab ? 'white' : '#374151',
                borderRadius: '0.375rem',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: '500',
                textTransform: 'capitalize',
              }}
            >
              {tab}
              {tab === 'unread' && totalUnread > 0 && (
                <span style={{ marginLeft: '0.25rem' }}>({totalUnread})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Conversation list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filteredConversations.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '12rem', color: '#6b7280' }}>
            <div style={{ textAlign: 'center' }}>
              <svg style={{ width: '3rem', height: '3rem', margin: '0 auto 0.5rem', color: '#9ca3af' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              <p style={{ fontSize: '0.875rem' }}>
                {searchQuery ? 'No conversations match your search' : 'No conversations yet'}
              </p>
            </div>
          </div>
        ) : (
          filteredConversations.map((conversation) => {
            const isSelected = conversation.patientId === selectedConversationId;
            const hasUnread = conversation.unreadCount > 0;

            return (
              <div
                key={conversation.id}
                onClick={() => onSelectConversation(conversation)}
                style={{
                  padding: '0.75rem 1rem',
                  cursor: 'pointer',
                  background: isSelected ? '#f5f3ff' : hasUnread ? '#eff6ff' : 'white',
                  borderBottom: '1px solid #e5e7eb',
                  borderLeft: isSelected ? '3px solid #7c3aed' : '3px solid transparent',
                  transition: 'background-color 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <h3 style={{
                        fontSize: '0.875rem',
                        fontWeight: hasUnread ? '600' : '500',
                        color: '#111827',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {conversation.patientName}
                      </h3>
                      {hasUnread && (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minWidth: '1.125rem',
                          height: '1.125rem',
                          padding: '0 0.25rem',
                          background: '#2563eb',
                          color: 'white',
                          borderRadius: '9999px',
                          fontSize: '0.625rem',
                          fontWeight: '600',
                        }}>
                          {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
                        </span>
                      )}
                    </div>
                    <p style={{
                      fontSize: '0.75rem',
                      color: '#6b7280',
                      marginTop: '0.125rem',
                    }}>
                      {conversation.phoneNumber}
                      {conversation.patientMrn && ` | MRN: ${conversation.patientMrn}`}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      {conversation.lastMessageAt
                        ? formatDistanceToNow(new Date(conversation.lastMessageAt), { addSuffix: true })
                        : ''}
                    </span>
                    {conversation.lastMessageDirection === 'inbound' && (
                      <div style={{ marginTop: '0.25rem' }}>
                        <svg style={{ width: '0.875rem', height: '0.875rem', color: '#2563eb' }} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M7.707 3.293a1 1 0 010 1.414L5.414 7H11a7 7 0 017 7v2a1 1 0 11-2 0v-2a5 5 0 00-5-5H5.414l2.293 2.293a1 1 0 11-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </div>
                </div>
                {conversation.lastMessagePreview && (
                  <p style={{
                    fontSize: '0.8125rem',
                    color: hasUnread ? '#111827' : '#6b7280',
                    marginTop: '0.375rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontWeight: hasUnread ? '500' : 'normal',
                  }}>
                    {conversation.lastMessageDirection === 'outbound' && (
                      <span style={{ color: '#9ca3af' }}>You: </span>
                    )}
                    {conversation.lastMessagePreview}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default SMSInbox;
