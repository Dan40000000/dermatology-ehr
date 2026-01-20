# WebSocket Quick Start Guide

This guide will help you get started with real-time features in under 5 minutes.

## Installation Complete

All dependencies are already installed:
- Backend: `socket.io`
- Frontend: `socket.io-client`

## Server is Running

The WebSocket server starts automatically with your backend Express server. No additional configuration needed!

## Quick Integration Examples

### 1. Add Real-Time Updates to Schedule Page

```typescript
// In your schedule page component
import { useAppointmentEvents } from '../hooks/useWebSocket';
import { ConnectionStatusIndicator } from '../components/ConnectionStatusIndicator';
import { useQueryClient } from '@tanstack/react-query';

function SchedulePage() {
  const queryClient = useQueryClient();

  // Auto-refresh when appointments change
  useAppointmentEvents({
    onCreated: () => queryClient.invalidateQueries({ queryKey: ['appointments'] }),
    onUpdated: () => queryClient.invalidateQueries({ queryKey: ['appointments'] }),
    onCancelled: () => queryClient.invalidateQueries({ queryKey: ['appointments'] }),
  });

  return (
    <div>
      <ConnectionStatusIndicator />
      {/* Your existing schedule UI */}
    </div>
  );
}
```

### 2. Add Real-Time Notifications

```typescript
// In your root App component
import { useNotificationEvents } from '../hooks/useWebSocket';

function App() {
  useNotificationEvents((data) => {
    // Automatically shows toast notifications
    console.log('Notification received:', data.notification);
  });

  return <YourApp />;
}
```

### 3. Broadcast From Backend API

```typescript
// In any backend route handler
import { getIO, broadcastAppointmentCreated } from '../websocket';

export async function createAppointment(req, res) {
  const appointment = await db.createAppointment(req.body);

  // Broadcast to all users in tenant
  const io = getIO();
  broadcastAppointmentCreated(io, req.tenantId, appointment);

  res.json({ appointment });
}
```

## Configuration

### Backend

The WebSocket server is configured in `/Users/danperry/Desktop/Dermatology program/derm-app/backend/src/index.ts`:

```typescript
import { initializeWebSocket } from './websocket';

const httpServer = http.createServer(app);
initializeWebSocket(httpServer);
httpServer.listen(env.port);
```

### Frontend

The WebSocket provider is configured in `/Users/danperry/Desktop/Dermatology program/derm-app/frontend/src/main.tsx`:

```typescript
import { WebSocketProvider } from './contexts/WebSocketContext';

<AuthProvider>
  <WebSocketProvider>
    <App />
  </WebSocketProvider>
</AuthProvider>
```

## Environment Variables

Add to your `.env` files if needed:

**Backend (.env):**
```
FRONTEND_URL=http://localhost:5173
```

**Frontend (.env):**
```
VITE_API_URL=http://localhost:4000
```

## Available Features

### Schedule Updates
- Appointment created/updated/cancelled
- Patient check-in notifications
- Auto-refresh schedule grid

### Messaging
- Real-time message delivery
- Typing indicators
- Read receipts
- Unread count badges

### Notifications
- Task assignments
- Lab result alerts
- Prior auth status changes
- Urgent notifications

### Presence
- Online/offline status
- User activity tracking
- Patient viewing locks

## Testing

### Test WebSocket Connection

```typescript
// Open browser console
import { useWebSocketContext } from './contexts/WebSocketContext';

const { isConnected, socket } = useWebSocketContext();
console.log('Connected:', isConnected);
console.log('Socket ID:', socket?.id);
```

### Test Receiving Events

```typescript
// In component
useWebSocketEvent('appointment:created', (data) => {
  console.log('Received appointment:', data);
});
```

### Test Sending Events (Backend)

```bash
# Using curl or Postman, create an appointment
curl -X POST http://localhost:4000/api/appointments \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Tenant-ID: tenant-demo" \
  -H "Content-Type: application/json" \
  -d '{
    "patientId": "...",
    "providerId": "...",
    "scheduledStart": "2024-01-20T10:00:00Z",
    "scheduledEnd": "2024-01-20T10:30:00Z"
  }'

# All connected clients should receive appointment:created event
```

## Common Patterns

### Pattern 1: Invalidate Query on Event

```typescript
const queryClient = useQueryClient();

useWebSocketEvent('resource:updated', () => {
  queryClient.invalidateQueries({ queryKey: ['resources'] });
});
```

### Pattern 2: Update State Directly

```typescript
const [items, setItems] = useState([]);

useWebSocketEvent('item:created', (data) => {
  setItems(prev => [...prev, data.item]);
});
```

### Pattern 3: Show Toast Notification

```typescript
import toast from 'react-hot-toast';

useWebSocketEvent('important:event', (data) => {
  toast.success(data.message);
});
```

## Troubleshooting

### Connection Won't Establish

1. Check backend is running on correct port
2. Verify JWT token is valid
3. Ensure tenant ID matches
4. Check browser console for errors

### Events Not Received

1. Verify you're in the correct room (tenant ID matches)
2. Check event name spelling
3. Ensure handler is registered before event fires
4. Look for errors in backend logs

### Poor Performance

1. Reduce event frequency (throttle on backend)
2. Use React.memo() for components with event handlers
3. Batch multiple updates together

## Next Steps

1. See `WEBSOCKET_DOCUMENTATION.md` for detailed API reference
2. Check `backend/src/examples/websocket-integration-examples.ts` for integration patterns
3. Review `frontend/src/components/RealTime*.tsx` for example components
4. Test with multiple browser windows to see real-time sync

## Need Help?

- Review logs: Backend uses Winston, frontend uses console
- Enable debug mode: `localStorage.debug = 'socket.io-client:*'`
- Check connection status: Use `<ConnectionStatusIndicator />`
- Verify authentication: Ensure JWT token is valid and not expired
