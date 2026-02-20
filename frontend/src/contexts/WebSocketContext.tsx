import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { API_BASE_URL } from '../utils/apiBase';
import toast from 'react-hot-toast';
import { refreshSessionNow } from '../utils/authFetch';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface WebSocketContextValue {
  socket: Socket | null;
  status: ConnectionStatus;
  isConnected: boolean;
  reconnect: () => void;
  // Event subscription helpers
  on: (event: string, handler: (...args: any[]) => void) => void;
  off: (event: string, handler: (...args: any[]) => void) => void;
  emit: (event: string, ...args: any[]) => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

const SOCKET_URL =
  import.meta.env.VITE_WS_URL ||
  API_BASE_URL ||
  (import.meta.env.DEV
    ? 'http://localhost:4000'
    : (typeof window !== 'undefined' ? window.location.origin : ''));
const RECONNECTION_DELAY = 5000;
const MAX_RECONNECTION_ATTEMPTS = 10;
const STORAGE_KEY = 'derm_session';

type SocketAuth = { tenantId: string; accessToken: string };

const readStoredAuth = (): SocketAuth | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (!parsed?.tenantId || !parsed?.accessToken) return null;
    return { tenantId: parsed.tenantId, accessToken: parsed.accessToken };
  } catch {
    return null;
  }
};

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const { session, isAuthenticated } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [reconnectionAttempts, setReconnectionAttempts] = useState(0);

  // Initialize socket connection
  const initializeSocket = useCallback((overrideAuth?: SocketAuth) => {
    const activeAuth = overrideAuth ?? (session ? { tenantId: session.tenantId, accessToken: session.accessToken } : readStoredAuth());
    if (!activeAuth) return;

    setStatus('connecting');

    const newSocket = io(SOCKET_URL, {
      auth: {
        token: activeAuth.accessToken,
        tenantId: activeAuth.tenantId,
      },
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionDelay: RECONNECTION_DELAY,
      reconnectionAttempts: MAX_RECONNECTION_ATTEMPTS,
    });

    newSocket.on('connect', () => {
      console.log('WebSocket connected:', newSocket.id);
      setStatus('connected');
      setReconnectionAttempts(0);
      toast.success('Connected to real-time updates', {
        duration: 2000,
        icon: '🔌',
      });
    });

    newSocket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      setStatus('disconnected');

      if (reason === 'io server disconnect') {
        // Server disconnected the socket, reconnect manually
        toast.error('Connection lost. Reconnecting...', {
          duration: 3000,
        });
      }
    });

    newSocket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      setStatus('error');
      setReconnectionAttempts((prev) => prev + 1);

      const message = (error as any)?.message || '';
      if (message.includes('Invalid authentication token') || message.includes('Authentication token required')) {
        refreshSessionNow().then((updated) => {
          if (updated) {
            const nextAuth = { tenantId: updated.tenantId, accessToken: updated.accessToken };
            setTimeout(() => {
              reconnect(nextAuth);
            }, 500);
          }
        }).catch(() => {
          // ignore refresh failures; user will re-login
        });
      }

      if (reconnectionAttempts < MAX_RECONNECTION_ATTEMPTS) {
        toast.error(`Connection error. Retrying... (${reconnectionAttempts + 1}/${MAX_RECONNECTION_ATTEMPTS})`, {
          duration: 2000,
        });
      } else {
        toast.error('Failed to connect to real-time updates. Please refresh the page.', {
          duration: 5000,
        });
      }
    });

    newSocket.on('error', (error) => {
      console.error('WebSocket error:', error);
      toast.error('Real-time connection error', {
        duration: 2000,
      });
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [session, reconnectionAttempts]);

  // Initialize socket when authenticated
  useEffect(() => {
    if (isAuthenticated && session) {
      const cleanup = initializeSocket({ tenantId: session.tenantId, accessToken: session.accessToken });
      return cleanup;
    } else if (readStoredAuth()) {
      const cleanup = initializeSocket();
      return cleanup;
    } else {
      // Close socket if not authenticated
      if (socket) {
        socket.close();
        setSocket(null);
        setStatus('disconnected');
      }
    }
  }, [isAuthenticated, session]);

  // Manual reconnection function
  const reconnect = useCallback((overrideAuth?: SocketAuth) => {
    if (socket) {
      socket.close();
    }
    setReconnectionAttempts(0);
    initializeSocket(overrideAuth);
  }, [socket, initializeSocket]);

  // Event subscription helpers
  const on = useCallback(
    (event: string, handler: (...args: any[]) => void) => {
      if (socket) {
        socket.on(event, handler);
      }
    },
    [socket]
  );

  const off = useCallback(
    (event: string, handler: (...args: any[]) => void) => {
      if (socket) {
        socket.off(event, handler);
      }
    },
    [socket]
  );

  const emit = useCallback(
    (event: string, ...args: any[]) => {
      if (socket && socket.connected) {
        socket.emit(event, ...args);
      }
    },
    [socket]
  );

  return (
    <WebSocketContext.Provider
      value={{
        socket,
        status,
        isConnected: status === 'connected',
        reconnect,
        on,
        off,
        emit,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketContext() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
}
