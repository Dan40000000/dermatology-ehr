import { useEffect, useState } from 'react';
import { useMessageEvents, useTypingIndicator, useThreadRoom } from '../hooks/useWebSocket';

interface RealTimeMessageThreadProps {
  threadId: string;
  onNewMessage?: (message: any) => void;
}

/**
 * Example component demonstrating real-time messaging features
 * Shows typing indicators and handles real-time message updates
 */
export function RealTimeMessageThread({ threadId, onNewMessage }: RealTimeMessageThreadProps) {
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const { startTyping, stopTyping } = useTypingIndicator(threadId);

  // Join the thread room for real-time updates
  useThreadRoom(threadId);

  // Subscribe to message events
  useMessageEvents({
    onNewMessage: (data) => {
      console.log('New message received:', data);
      onNewMessage?.(data.message);
    },
    onMessageRead: (data) => {
      console.log('Message read:', data);
      // Update read status in UI
    },
    onTyping: (data) => {
      if (data.threadId !== threadId) return;

      if (data.isTyping) {
        setTypingUsers((prev) => {
          if (prev.includes(data.userName)) return prev;
          return [...prev, data.userName];
        });
      } else {
        setTypingUsers((prev) => prev.filter((u) => u !== data.userName));
      }

      // Clear typing indicator after 3 seconds
      setTimeout(() => {
        setTypingUsers((prev) => prev.filter((u) => u !== data.userName));
      }, 3000);
    },
    onUnreadCountUpdate: (data) => {
      console.log('Unread count updated:', data.unreadCount);
      // Update badge count in UI
    },
  });

  // Handle typing in message input
  const handleInputChange = () => {
    startTyping();
  };

  const handleInputBlur = () => {
    stopTyping();
  };

  return (
    <div className="message-thread">
      {/* Typing indicator */}
      {typingUsers.length > 0 && (
        <div className="typing-indicator">
          <span className="text-sm text-gray-600">
            {typingUsers.length === 1
              ? `${typingUsers[0]} is typing...`
              : `${typingUsers.length} people are typing...`}
          </span>
        </div>
      )}

      {/* Message input (example) */}
      <input
        type="text"
        placeholder="Type a message..."
        onChange={handleInputChange}
        onBlur={handleInputBlur}
        className="w-full p-2 border rounded"
      />
    </div>
  );
}

/**
 * Example usage:
 *
 * import { RealTimeMessageThread } from './components/RealTimeMessageThread';
 *
 * function MessagePage() {
 *   const [messages, setMessages] = useState([]);
 *
 *   const handleNewMessage = (message) => {
 *     setMessages(prev => [...prev, message]);
 *   };
 *
 *   return (
 *     <div>
 *       <RealTimeMessageThread
 *         threadId={currentThreadId}
 *         onNewMessage={handleNewMessage}
 *       />
 *       {/* Message list UI *\/}
 *     </div>
 *   );
 * }
 */
