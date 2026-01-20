import { Wifi, WifiOff, RefreshCw, AlertCircle } from 'lucide-react';
import { useWebSocketContext } from '../contexts/WebSocketContext';

/**
 * Visual indicator showing real-time connection status
 * Displays in the top-right corner of the application
 */
export function ConnectionStatusIndicator() {
  const { status, isConnected, reconnect } = useWebSocketContext();

  // Don't show indicator when connected
  if (status === 'connected') {
    return (
      <div className="fixed top-20 right-4 z-50 flex items-center gap-2 px-3 py-2 bg-green-50 text-green-700 rounded-lg shadow-sm border border-green-200 text-sm">
        <Wifi className="h-4 w-4" />
        <span>Connected</span>
      </div>
    );
  }

  return (
    <div className="fixed top-20 right-4 z-50">
      {status === 'connecting' && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg shadow-sm border border-blue-200 text-sm">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Connecting...</span>
        </div>
      )}

      {status === 'disconnected' && (
        <div className="flex items-center gap-3 px-3 py-2 bg-yellow-50 text-yellow-700 rounded-lg shadow-sm border border-yellow-200 text-sm">
          <WifiOff className="h-4 w-4" />
          <span>Disconnected</span>
          <button
            onClick={reconnect}
            className="ml-2 px-2 py-1 bg-yellow-100 hover:bg-yellow-200 rounded text-xs font-medium transition-colors"
          >
            Reconnect
          </button>
        </div>
      )}

      {status === 'error' && (
        <div className="flex items-center gap-3 px-3 py-2 bg-red-50 text-red-700 rounded-lg shadow-sm border border-red-200 text-sm">
          <AlertCircle className="h-4 w-4" />
          <span>Connection Error</span>
          <button
            onClick={reconnect}
            className="ml-2 px-2 py-1 bg-red-100 hover:bg-red-200 rounded text-xs font-medium transition-colors"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Compact badge indicator for connection status
 * Can be used in navigation bars or headers
 */
export function ConnectionStatusBadge() {
  const { status, isConnected } = useWebSocketContext();

  const getStatusColor = () => {
    switch (status) {
      case 'connected':
        return 'bg-green-500';
      case 'connecting':
        return 'bg-blue-500 animate-pulse';
      case 'disconnected':
        return 'bg-yellow-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'connected':
        return 'Live';
      case 'connecting':
        return 'Connecting';
      case 'disconnected':
        return 'Offline';
      case 'error':
        return 'Error';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded-full bg-gray-100 text-xs font-medium">
      <span className={`h-2 w-2 rounded-full ${getStatusColor()}`} />
      <span className="text-gray-700">{getStatusText()}</span>
    </div>
  );
}
