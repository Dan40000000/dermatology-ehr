# WebSocket Real-Time Features Documentation

## Overview

The derm-app now includes comprehensive real-time features using WebSockets (Socket.IO). This enables instant updates across all connected clients for appointments, messages, notifications, and user presence.

## Architecture

### Backend (`backend/src/websocket/`)

- **index.ts**: Main WebSocket server initialization and connection management
- **auth.ts**: JWT-based authentication middleware for WebSocket connections
- **handlers/**: Event handlers for different features
  - `appointmentHandlers.ts`: Appointment creation, updates, cancellations, check-ins
  - `messageHandlers.ts`: Real-time messaging, typing indicators, read receipts
  - `notificationHandlers.ts`: Task assignments, alerts, lab results
  - `presenceHandlers.ts`: User online/offline status, patient viewing locks

### Frontend (`frontend/src/`)

- **contexts/WebSocketContext.tsx**: React context managing WebSocket connection
- **hooks/useWebSocket.ts**: Custom hooks for subscribing to events
- **components/ConnectionStatusIndicator.tsx**: Visual connection status display

## Features Implemented

### 1. Schedule Updates

Real-time updates when appointments are created, updated, or cancelled:

**Backend - Broadcasting Events:**
```typescript
import { getIO, broadcastAppointmentCreated } from '../websocket';

// In your appointment route handler
export async function createAppointment(req, res) {
  const appointment = await db.createAppointment(data);

  // Broadcast to all users in tenant
  const io = getIO();
  broadcastAppointmentCreated(io, req.tenantId, appointment);

  res.json({ appointment });
}
```

**Frontend - Listening for Updates:**
```typescript
import { useAppointmentEvents } from '../hooks/useWebSocket';
import { useQueryClient } from '@tanstack/react-query';

function SchedulePage() {
  const queryClient = useQueryClient();

  useAppointmentEvents({
    onCreated: (data) => {
      // Refetch appointments to show new data
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
    onUpdated: (data) => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
    onCancelled: (data) => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
  });

  // Your component UI
}
```

### 2. Real-Time Messaging

**Typing Indicators:**
```typescript
import { useTypingIndicator } from '../hooks/useWebSocket';

function MessageInput({ threadId }) {
  const { startTyping, stopTyping } = useTypingIndicator(threadId);

  const handleChange = (e) => {
    startTyping();
    // Handle input change
  };

  const handleBlur = () => {
    stopTyping();
  };

  return <input onChange={handleChange} onBlur={handleBlur} />;
}
```

**Message Events:**
```typescript
import { useMessageEvents, useThreadRoom } from '../hooks/useWebSocket';

function MessageThread({ threadId }) {
  useThreadRoom(threadId); // Join room for this thread

  useMessageEvents({
    onNewMessage: (data) => {
      // Add message to UI
      console.log('New message:', data.message);
    },
    onMessageRead: (data) => {
      // Update read status
      console.log('Message read:', data);
    },
    onTyping: (data) => {
      // Show typing indicator
      console.log(`${data.userName} is typing...`);
    },
  });

  // Your component UI
}
```

**Backend - Broadcasting Messages:**
```typescript
import { getIO, broadcastNewMessage } from '../websocket';

export async function sendMessage(req, res) {
  const message = await db.createMessage(data);

  const io = getIO();
  broadcastNewMessage(io, req.tenantId, threadId, {
    id: message.id,
    threadId: message.threadId,
    body: message.body,
    sender: req.user.id,
    senderFirstName: req.user.firstName,
    senderLastName: req.user.lastName,
    createdAt: message.createdAt,
  });

  res.json({ message });
}
```

### 3. Notifications

**Sending Notifications:**
```typescript
import { getIO, sendUserNotification, notifyTaskAssignment } from '../websocket';

// Generic notification
export async function sendNotification(tenantId, userId, notification) {
  const io = getIO();
  sendUserNotification(io, tenantId, userId, notification);
}

// Task assignment
export async function assignTask(req, res) {
  const task = await db.assignTask(taskId, userId);

  const io = getIO();
  notifyTaskAssignment(io, req.tenantId, userId, {
    id: task.id,
    title: task.title,
    priority: task.priority,
    assignedBy: req.user.fullName,
  });

  res.json({ task });
}
```

**Frontend - Receiving Notifications:**
```typescript
import { useNotificationEvents } from '../hooks/useWebSocket';

function App() {
  useNotificationEvents((data) => {
    // Handle notification
    console.log('Notification:', data.notification);

    // Notifications automatically show toast messages based on priority
    // You can add custom handling here
  });

  // Your app UI
}
```

### 4. User Presence

**Tracking Patient Viewing:**
```typescript
import { usePatientViewing } from '../hooks/useWebSocket';

function PatientChart({ patientId }) {
  // Automatically emits viewing status on mount/unmount
  usePatientViewing(patientId);

  // Shows lock indicator to other users viewing same patient
  return <div>Patient chart for {patientId}</div>;
}
```

**Listening for Presence:**
```typescript
import { usePresenceEvents } from '../hooks/useWebSocket';

function OnlineUsersWidget() {
  const [onlineUsers, setOnlineUsers] = useState([]);

  usePresenceEvents({
    onUserOnline: (data) => {
      setOnlineUsers(prev => [...prev, data]);
    },
    onUserOffline: (data) => {
      setOnlineUsers(prev => prev.filter(u => u.userId !== data.userId));
    },
    onPatientViewing: (data) => {
      if (data.isViewing) {
        console.log(`${data.userName} is viewing patient ${data.patientId}`);
      }
    },
  });

  return (
    <div>
      {onlineUsers.map(user => (
        <div key={user.userId}>{user.userName} - {user.status}</div>
      ))}
    </div>
  );
}
```

## Connection Status

The app includes visual indicators for connection status:

```typescript
import { ConnectionStatusIndicator, ConnectionStatusBadge } from './components/ConnectionStatusIndicator';

function App() {
  return (
    <div>
      {/* Full indicator with reconnect button */}
      <ConnectionStatusIndicator />

      {/* Compact badge for nav bar */}
      <ConnectionStatusBadge />
    </div>
  );
}
```

## Room-Based Broadcasting

WebSocket events use rooms for efficient message routing:

- **`tenant:{tenantId}`**: All users in a tenant
- **`user:{userId}`**: Specific user notifications
- **`thread:{threadId}`**: Users in a message thread
- **`patient:{patientId}`**: Users viewing a specific patient

## Event Reference

### Appointment Events

| Event | Payload | Description |
|-------|---------|-------------|
| `appointment:created` | `{ appointment, timestamp }` | New appointment created |
| `appointment:updated` | `{ appointment, timestamp }` | Appointment details changed |
| `appointment:cancelled` | `{ appointmentId, reason, timestamp }` | Appointment cancelled |
| `patient:checkin` | `{ appointmentId, patientId, patientName, timestamp }` | Patient checked in |

### Message Events

| Event | Payload | Description |
|-------|---------|-------------|
| `message:new` | `{ message, timestamp }` | New message in thread |
| `message:read` | `{ messageId, threadId, readBy, readAt }` | Message marked as read |
| `message:typing` | `{ threadId, userId, userName, isTyping }` | User typing status |
| `message:notification` | `{ threadId, messageId, sender, preview }` | Message notification |
| `message:unread-count` | `{ unreadCount, timestamp }` | Unread count updated |

### Notification Events

| Event | Payload | Description |
|-------|---------|-------------|
| `notification:new` | `{ notification, timestamp }` | New notification |

### Presence Events

| Event | Payload | Description |
|-------|---------|-------------|
| `user:online` | `{ userId, userName, status, lastSeen }` | User came online |
| `user:offline` | `{ userId, userName, status, lastSeen }` | User went offline |
| `user:status` | `{ userId, userName, status, lastSeen }` | User status changed |
| `patient:viewing` | `{ userId, userName, patientId, isViewing }` | User viewing patient |

## Error Handling & Reconnection

The WebSocket client automatically handles:

- **Automatic Reconnection**: Up to 10 attempts with 5-second delay
- **Connection State Recovery**: Restores connection state after temporary disconnects
- **Error Notifications**: Toast messages for connection issues
- **Manual Reconnection**: Button in ConnectionStatusIndicator

## Security

- **JWT Authentication**: All connections authenticated via JWT token
- **Tenant Isolation**: Users only receive events from their tenant
- **Token Validation**: Tokens validated on connect and tenant ID verified

## Best Practices

1. **Use React Query Integration**: Invalidate queries on WebSocket events for automatic UI updates
2. **Clean Up Subscriptions**: Hooks automatically clean up on unmount
3. **Handle Offline State**: UI should work without WebSocket connection
4. **Throttle Events**: Backend should throttle high-frequency events
5. **Room Management**: Join/leave rooms appropriately to reduce message traffic

## Testing

### Backend Testing

```typescript
import { initializeWebSocket, getIO } from './websocket';
import { Server } from 'http';

describe('WebSocket', () => {
  let server: Server;
  let io;

  beforeEach(() => {
    server = createServer();
    io = initializeWebSocket(server);
  });

  afterEach(() => {
    io.close();
  });

  it('should authenticate connections', (done) => {
    const client = ioClient('http://localhost:4000', {
      auth: { token: validToken, tenantId: 'tenant-1' }
    });

    client.on('connect', () => {
      expect(client.connected).toBe(true);
      done();
    });
  });
});
```

### Frontend Testing

```typescript
import { render, screen } from '@testing-library/react';
import { WebSocketProvider } from './contexts/WebSocketContext';

describe('WebSocket Integration', () => {
  it('should connect when authenticated', () => {
    render(
      <WebSocketProvider>
        <ConnectionStatusIndicator />
      </WebSocketProvider>
    );

    expect(screen.getByText(/connected/i)).toBeInTheDocument();
  });
});
```

## Troubleshooting

### Connection Issues

1. **Check CORS settings**: Ensure `FRONTEND_URL` env var is correct
2. **Verify JWT token**: Check token is valid and not expired
3. **Check tenant ID**: Ensure tenant ID in token matches handshake
4. **Network issues**: Check firewall/proxy settings for WebSocket traffic

### Performance Issues

1. **Too many events**: Implement throttling on backend
2. **Large payloads**: Send minimal data, fetch details separately
3. **Memory leaks**: Ensure event handlers are cleaned up properly

### Debug Mode

Enable debug logging:

```typescript
// Frontend
localStorage.debug = 'socket.io-client:*';

// Backend
import { logger } from './lib/logger';
logger.level = 'debug';
```

## Next Steps

1. Add Redis adapter for multi-server WebSocket support
2. Implement presence heartbeat with timeout
3. Add WebSocket metrics and monitoring
4. Create admin dashboard for connection monitoring
5. Implement message queuing for offline users

## Support

For questions or issues:
- Check logs: Backend uses Winston logger
- Enable debug mode (see above)
- Review error messages in ConnectionStatusIndicator
