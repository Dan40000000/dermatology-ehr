# WebSocket Integration Checklist

Use this checklist to integrate WebSocket broadcasting into your existing API routes.

## Backend Integration

### For Each Resource Type (Appointments, Tasks, Messages, etc.)

- [ ] **Import WebSocket functions**
  ```typescript
  import { getIO, broadcastAppointmentCreated } from '../websocket';
  ```

- [ ] **Add broadcasting to CREATE routes**
  ```typescript
  const io = getIO();
  broadcastAppointmentCreated(io, req.tenantId, resourceData);
  ```

- [ ] **Add broadcasting to UPDATE routes**
  ```typescript
  const io = getIO();
  broadcastAppointmentUpdated(io, req.tenantId, resourceData);
  ```

- [ ] **Add broadcasting to DELETE routes**
  ```typescript
  const io = getIO();
  broadcastAppointmentCancelled(io, req.tenantId, resourceId);
  ```

- [ ] **Wrap in try-catch** (don't fail request if WebSocket fails)
  ```typescript
  try {
    const io = getIO();
    broadcastEvent(io, req.tenantId, data);
  } catch (wsError) {
    logger.error('WebSocket broadcast failed:', wsError);
  }
  ```

### Specific Routes to Update

#### Appointments
- [ ] `POST /api/appointments` - broadcastAppointmentCreated
- [ ] `PATCH /api/appointments/:id` - broadcastAppointmentUpdated
- [ ] `DELETE /api/appointments/:id` - broadcastAppointmentCancelled
- [ ] `PATCH /api/appointments/:id/status` - broadcastPatientCheckIn (if status = checked_in)

#### Messages
- [ ] `POST /api/messaging/:threadId/messages` - broadcastNewMessage
- [ ] `PATCH /api/messages/:id/read` - broadcastMessageRead

#### Tasks
- [ ] `POST /api/tasks` - notifyTaskAssignment (if assignedTo specified)
- [ ] `PATCH /api/tasks/:id` - notifyTaskAssignment (if assignedTo changed)

#### Lab Results
- [ ] `POST /api/lab-results` - notifyLabResultReady
- [ ] `PATCH /api/lab-results/:id` - notifyLabResultReady (if status changed)

#### Orders
- [ ] `POST /api/orders` - sendUserNotification (to provider)
- [ ] `PATCH /api/orders/:id/status` - sendUserNotification (if urgent)

#### Patient Records
- [ ] `PATCH /api/patients/:id/vitals` - broadcastToPatientViewers
- [ ] `POST /api/patients/:id/allergies` - broadcastToPatientViewers
- [ ] `POST /api/patients/:id/medications` - broadcastToPatientViewers

## Frontend Integration

### For Each Feature Page

- [ ] **Import hooks**
  ```typescript
  import { useAppointmentEvents } from '../hooks/useWebSocket';
  import { ConnectionStatusIndicator } from '../components/ConnectionStatusIndicator';
  ```

- [ ] **Add event handlers**
  ```typescript
  useAppointmentEvents({
    onCreated: () => queryClient.invalidateQueries(['appointments']),
    onUpdated: () => queryClient.invalidateQueries(['appointments']),
  });
  ```

- [ ] **Add connection status indicator**
  ```typescript
  <ConnectionStatusIndicator />
  ```

### Specific Pages to Update

#### Schedule Page
- [ ] Add `useAppointmentEvents()` hook
- [ ] Invalidate queries on events
- [ ] Show ConnectionStatusIndicator
- [ ] Test multi-user appointment creation

#### Tasks Page
- [ ] Add `useNotificationEvents()` hook
- [ ] Show badge with unread count
- [ ] Play sound on urgent tasks (optional)
- [ ] Test task assignment notifications

#### Messaging Page
- [ ] Add `useMessageEvents()` hook
- [ ] Add `useTypingIndicator()` hook
- [ ] Add `useThreadRoom()` hook
- [ ] Show typing indicators
- [ ] Update unread counts
- [ ] Test multi-user messaging

#### Patient Chart
- [ ] Add `usePatientViewing()` hook
- [ ] Add `usePresenceEvents()` hook
- [ ] Show "being viewed by" indicator
- [ ] Warn before editing if others viewing
- [ ] Test conflict prevention

#### Notifications Panel
- [ ] Add `useNotificationEvents()` hook
- [ ] Show real-time notification list
- [ ] Badge on nav bar
- [ ] Sound on urgent notifications (optional)
- [ ] Test all notification types

## Testing Checklist

### Connection Testing
- [ ] WebSocket connects on login
- [ ] WebSocket disconnects on logout
- [ ] Auto-reconnection works (stop/start backend)
- [ ] Connection status indicator shows correct state
- [ ] Multiple browser windows can connect

### Event Testing

#### Appointments
- [ ] Create appointment in window 1, see in window 2
- [ ] Update appointment status, see update
- [ ] Cancel appointment, see notification
- [ ] Patient check-in shows toast notification

#### Messaging
- [ ] Send message, receiver sees immediately
- [ ] Typing indicator appears/disappears
- [ ] Read receipts work
- [ ] Unread count updates

#### Notifications
- [ ] Task assignment shows notification
- [ ] Lab results show notification
- [ ] Urgent notifications don't auto-dismiss
- [ ] Priority icons correct

#### Presence
- [ ] Online users list updates
- [ ] User goes offline, list updates
- [ ] Patient viewing indicator shows
- [ ] Multiple users viewing same patient

### Error Testing
- [ ] Backend stops - auto-reconnect works
- [ ] Invalid token - connection rejected
- [ ] Wrong tenant - connection rejected
- [ ] Network offline - graceful degradation
- [ ] API works without WebSocket connection

### Performance Testing
- [ ] 10 concurrent users - smooth
- [ ] 50 concurrent users - acceptable
- [ ] 100 events per second - no lag
- [ ] Memory doesn't leak over time
- [ ] CPU usage reasonable

## Verification Steps

1. **Backend Verification**
   ```bash
   # Check WebSocket server starts
   cd backend && npm run dev
   # Look for: "WebSocket server initialized"
   ```

2. **Frontend Verification**
   ```bash
   # Check no TypeScript errors
   cd frontend && npm run build
   ```

3. **Connection Verification**
   - Open browser console
   - Look for: "WebSocket connected: [socket-id]"
   - Check connection status shows "Connected"

4. **Event Verification**
   - Enable debug: `localStorage.debug = 'socket.io-client:*'`
   - Create an appointment
   - Look for: "Received appointment:created event"

5. **Multi-User Verification**
   - Open 2 browser windows
   - Log in as same user
   - Create appointment in window 1
   - See it appear in window 2

## Common Issues & Solutions

### Issue: "WebSocket server not initialized"
**Solution:** Make sure `initializeWebSocket()` is called in `backend/src/index.ts`

### Issue: "Authentication token required"
**Solution:** Check `WebSocketProvider` is inside `AuthProvider` in `main.tsx`

### Issue: "Events not received"
**Solution:** Verify tenant ID matches between frontend and backend

### Issue: "Memory leak"
**Solution:** Check all `useEffect` hooks properly clean up event listeners

### Issue: "Too many notifications"
**Solution:** Add throttling on backend, debounce on frontend

## Best Practices Checklist

- [ ] Always wrap WebSocket calls in try-catch
- [ ] Don't fail API requests if WebSocket fails
- [ ] Log WebSocket errors for debugging
- [ ] Clean up event listeners in useEffect
- [ ] Use React Query for automatic refetching
- [ ] Show loading states during reconnection
- [ ] Throttle high-frequency events
- [ ] Test with multiple users
- [ ] Monitor connection count
- [ ] Set up alerts for WebSocket failures

## Production Readiness Checklist

- [ ] Environment variables set correctly
- [ ] WSS (secure WebSocket) enabled
- [ ] CORS configured for production URL
- [ ] Rate limiting configured
- [ ] Error logging to monitoring service
- [ ] Connection metrics tracked
- [ ] Reconnection tested
- [ ] Load testing completed
- [ ] Documentation updated
- [ ] Team trained on usage

## Next Steps

1. Start with appointments (highest value)
2. Add messaging real-time
3. Add notifications
4. Add presence last (optional)
5. Monitor and optimize
6. Consider Redis for scaling

## Support

If you get stuck:
1. Check [WEBSOCKET_DOCUMENTATION.md](WEBSOCKET_DOCUMENTATION.md)
2. Review [WEBSOCKET_QUICKSTART.md](WEBSOCKET_QUICKSTART.md)
3. Look at examples in `backend/src/examples/`
4. Check component examples in `frontend/src/components/RealTime*.tsx`
5. Enable debug logs
6. Review error messages
