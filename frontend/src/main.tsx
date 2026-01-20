import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { RecordingProvider } from './contexts/RecordingContext';
import { WebSocketProvider } from './contexts/WebSocketContext';
import { queryClient } from './lib/queryClient';
import { ErrorBoundary } from './components/ErrorBoundary';
import { router } from './router';
import './i18n';
import './index.css';
import './App.css';
import './styles/print.css';
import './styles/animations.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <WebSocketProvider>
            <ToastProvider>
              <RecordingProvider>
                <RouterProvider router={router} />
              </RecordingProvider>
            </ToastProvider>
          </WebSocketProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
);
