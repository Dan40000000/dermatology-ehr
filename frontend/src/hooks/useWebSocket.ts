import { useEffect, useCallback, useRef } from 'react';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import toast from 'react-hot-toast';

/**
 * Hook for subscribing to WebSocket events
 * Automatically handles cleanup on unmount
 */
export function useWebSocketEvent<T = any>(
  event: string,
  handler: (data: T) => void,
  dependencies: any[] = []
) {
  const { on, off, isConnected } = useWebSocketContext();
  const handlerRef = useRef(handler);

  // Keep handler ref up to date
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!isConnected) return;

    const wrappedHandler = (data: T) => {
      handlerRef.current(data);
    };

    on(event, wrappedHandler);

    return () => {
      off(event, wrappedHandler);
    };
  }, [event, isConnected, on, off, ...dependencies]);
}

/**
 * Hook for handling appointment events
 */
export function useAppointmentEvents(callbacks: {
  onCreated?: (data: any) => void;
  onUpdated?: (data: any) => void;
  onCancelled?: (data: any) => void;
  onPatientCheckIn?: (data: any) => void;
}) {
  useWebSocketEvent('appointment:created', (data) => {
    toast.success(`New appointment: ${data.appointment.patientName || 'Unknown'}`, {
      duration: 3000,
      icon: '📅',
    });
    callbacks.onCreated?.(data);
  });

  useWebSocketEvent('appointment:updated', (data) => {
    toast(`Appointment updated: ${data.appointment.patientName || 'Unknown'}`, {
      duration: 2000,
      icon: '📝',
    });
    callbacks.onUpdated?.(data);
  });

  useWebSocketEvent('appointment:cancelled', (data) => {
    toast.error(`Appointment cancelled`, {
      duration: 3000,
      icon: '❌',
    });
    callbacks.onCancelled?.(data);
  });

  useWebSocketEvent('patient:checkin', (data) => {
    toast.success(`Patient checked in: ${data.patientName || 'Unknown'}`, {
      duration: 3000,
      icon: '✅',
    });
    callbacks.onPatientCheckIn?.(data);
  });
}

/**
 * Hook for handling message events
 */
export function useMessageEvents(callbacks: {
  onNewMessage?: (data: any) => void;
  onMessageRead?: (data: any) => void;
  onTyping?: (data: any) => void;
  onUnreadCountUpdate?: (data: any) => void;
}) {
  useWebSocketEvent('message:new', (data) => {
    callbacks.onNewMessage?.(data);
  });

  useWebSocketEvent('message:read', (data) => {
    callbacks.onMessageRead?.(data);
  });

  useWebSocketEvent('message:typing', (data) => {
    callbacks.onTyping?.(data);
  });

  useWebSocketEvent('message:unread-count', (data) => {
    callbacks.onUnreadCountUpdate?.(data);
  });

  useWebSocketEvent('message:notification', (data) => {
    toast(`New message: ${data.preview}`, {
      duration: 3000,
      icon: '💬',
    });
  });
}

/**
 * Hook for handling notification events
 */
export function useNotificationEvents(callback?: (data: any) => void) {
  useWebSocketEvent('notification:new', (data) => {
    const { notification } = data;

    // Show toast based on priority
    const toastOptions = {
      duration: notification.priority === 'urgent' ? 0 : 5000, // Urgent notifications don't auto-dismiss
      icon: getPriorityIcon(notification.priority),
    };

    if (notification.priority === 'urgent') {
      toast.error(notification.message, toastOptions);
    } else if (notification.priority === 'high') {
      toast(notification.message, {
        ...toastOptions,
        style: {
          background: '#f59e0b',
          color: 'white',
        },
      });
    } else {
      toast.success(notification.message, toastOptions);
    }

    callback?.(data);
  });
}

/**
 * Hook for handling presence events
 */
export function usePresenceEvents(callbacks: {
  onUserOnline?: (data: any) => void;
  onUserOffline?: (data: any) => void;
  onUserStatus?: (data: any) => void;
  onPatientViewing?: (data: any) => void;
}) {
  useWebSocketEvent('user:online', (data) => {
    callbacks.onUserOnline?.(data);
  });

  useWebSocketEvent('user:offline', (data) => {
    callbacks.onUserOffline?.(data);
  });

  useWebSocketEvent('user:status', (data) => {
    callbacks.onUserStatus?.(data);
  });

  useWebSocketEvent('patient:viewing', (data) => {
    callbacks.onPatientViewing?.(data);
  });
}

/**
 * Hook for emitting typing indicators in message threads
 */
export function useTypingIndicator(threadId: string) {
  const { emit } = useWebSocketContext();
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const startTyping = useCallback(() => {
    emit('message:typing', { threadId, isTyping: true });

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Stop typing after 3 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      emit('message:typing', { threadId, isTyping: false });
    }, 3000);
  }, [threadId, emit]);

  const stopTyping = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    emit('message:typing', { threadId, isTyping: false });
  }, [threadId, emit]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  return { startTyping, stopTyping };
}

/**
 * Hook for managing patient viewing status
 */
export function usePatientViewing(patientId: string | null) {
  const { emit } = useWebSocketContext();

  useEffect(() => {
    if (patientId) {
      // Emit viewing status when component mounts
      emit('patient:viewing', { patientId, isViewing: true });

      // Stop viewing when component unmounts
      return () => {
        emit('patient:viewing', { patientId, isViewing: false });
      };
    }
  }, [patientId, emit]);
}

/**
 * Hook for joining/leaving message thread rooms
 */
export function useThreadRoom(threadId: string | null) {
  const { emit } = useWebSocketContext();

  useEffect(() => {
    if (threadId) {
      emit('message:join-thread', threadId);

      return () => {
        emit('message:leave-thread', threadId);
      };
    }
  }, [threadId, emit]);
}

// Helper function to get icon based on priority
function getPriorityIcon(priority: string): string {
  switch (priority) {
    case 'urgent':
      return '🚨';
    case 'high':
      return '⚠️';
    case 'normal':
      return '📢';
    case 'low':
      return 'ℹ️';
    default:
      return '📢';
  }
}
