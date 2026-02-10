/**
 * SMSComposer Component
 * Text input for composing and sending SMS messages
 */

import { useState, useRef, useEffect } from 'react';
import type { FC, KeyboardEvent } from 'react';
import { SMSTemplateSelector } from './SMSTemplateSelector';

interface SMSComposerProps {
  tenantId: string;
  accessToken: string;
  onSend: (message: string, templateId?: string) => Promise<void>;
  sending?: boolean;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
}

export const SMSComposer: FC<SMSComposerProps> = ({
  tenantId,
  accessToken,
  onSend,
  sending = false,
  disabled = false,
  placeholder = 'Type a message...',
  maxLength = 1600,
}) => {
  const [message, setMessage] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [message]);

  const handleSend = async () => {
    if (!message.trim() || sending || disabled) return;

    try {
      await onSend(message.trim(), selectedTemplateId);
      setMessage('');
      setSelectedTemplateId(undefined);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSelectTemplate = (templateBody: string, templateId: string) => {
    setMessage(templateBody);
    setSelectedTemplateId(templateId);
    setShowTemplates(false);
    textareaRef.current?.focus();
  };

  const segmentCount = Math.ceil(message.length / 160);
  const remainingChars = maxLength - message.length;

  return (
    <div style={{
      borderTop: '1px solid #e5e7eb',
      background: 'white',
      padding: '0.75rem 1rem',
    }}>
      {/* Template selector modal */}
      {showTemplates && (
        <SMSTemplateSelector
          tenantId={tenantId}
          accessToken={accessToken}
          onSelect={handleSelectTemplate}
          onClose={() => setShowTemplates(false)}
        />
      )}

      {/* Character count and segment info */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '0.5rem',
        fontSize: '0.75rem',
        color: '#6b7280',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={() => setShowTemplates(true)}
            disabled={disabled}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              padding: '0.25rem 0.5rem',
              background: '#f3f4f6',
              border: 'none',
              borderRadius: '0.25rem',
              cursor: disabled ? 'not-allowed' : 'pointer',
              color: '#374151',
              fontSize: '0.75rem',
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <svg style={{ width: '0.875rem', height: '0.875rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
            </svg>
            Templates
          </button>
        </div>
        <div>
          <span style={{ color: remainingChars < 50 ? '#dc2626' : '#6b7280' }}>
            {message.length}/{maxLength}
          </span>
          {message.length > 0 && (
            <span style={{ marginLeft: '0.5rem', color: '#9ca3af' }}>
              ({segmentCount} segment{segmentCount !== 1 ? 's' : ''})
            </span>
          )}
        </div>
      </div>

      {/* Input area */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: '0.5rem',
      }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, maxLength))}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || sending}
            rows={1}
            style={{
              width: '100%',
              padding: '0.625rem 0.875rem',
              border: '1px solid #e5e7eb',
              borderRadius: '1rem',
              resize: 'none',
              outline: 'none',
              fontSize: '0.875rem',
              lineHeight: '1.5',
              maxHeight: '150px',
              background: disabled ? '#f9fafb' : 'white',
            }}
          />
        </div>
        <button
          onClick={handleSend}
          disabled={!message.trim() || sending || disabled}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '2.5rem',
            height: '2.5rem',
            background: !message.trim() || sending || disabled ? '#e5e7eb' : '#7c3aed',
            color: !message.trim() || sending || disabled ? '#9ca3af' : 'white',
            border: 'none',
            borderRadius: '50%',
            cursor: !message.trim() || sending || disabled ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.15s',
            flexShrink: 0,
          }}
          title="Send message"
        >
          {sending ? (
            <div style={{
              width: '1rem',
              height: '1rem',
              border: '2px solid currentColor',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }} />
          ) : (
            <svg style={{ width: '1.25rem', height: '1.25rem' }} fill="currentColor" viewBox="0 0 20 20">
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
          )}
        </button>
      </div>

      {/* Quick actions */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.25rem',
        marginTop: '0.5rem',
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: '0.75rem', color: '#9ca3af', marginRight: '0.25rem' }}>
          Quick:
        </span>
        {[
          { label: 'Reply C to confirm', value: 'Reply C to confirm your appointment.' },
          { label: 'Call us', value: 'Please call us at your earliest convenience to discuss.' },
          { label: 'Thank you', value: 'Thank you for your message. We will get back to you shortly.' },
        ].map((quick) => (
          <button
            key={quick.label}
            onClick={() => setMessage(quick.value)}
            disabled={disabled}
            style={{
              padding: '0.125rem 0.5rem',
              background: '#f3f4f6',
              border: 'none',
              borderRadius: '0.75rem',
              cursor: disabled ? 'not-allowed' : 'pointer',
              color: '#374151',
              fontSize: '0.6875rem',
              opacity: disabled ? 0.5 : 1,
            }}
          >
            {quick.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default SMSComposer;
