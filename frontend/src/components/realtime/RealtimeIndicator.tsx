/**
 * RealtimeIndicator Component
 * Shows connection status and last update time
 */

import { useWebSocketContext } from '../../contexts/WebSocketContext';
import { formatDistanceToNow } from 'date-fns';

interface RealtimeIndicatorProps {
  lastUpdate?: Date | null;
  showLastUpdate?: boolean;
}

export function RealtimeIndicator({ lastUpdate, showLastUpdate = true }: RealtimeIndicatorProps) {
  const { status, isConnected } = useWebSocketContext();

  const getStatusColor = () => {
    switch (status) {
      case 'connected':
        return 'bg-green-500';
      case 'connecting':
        return 'bg-yellow-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-400';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'connected':
        return 'Live';
      case 'connecting':
        return 'Connecting...';
      case 'error':
        return 'Connection Error';
      default:
        return 'Disconnected';
    }
  };

  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${getStatusColor()} ${isConnected ? 'animate-pulse' : ''}`} />
        <span className="text-gray-600">{getStatusText()}</span>
      </div>

      {showLastUpdate && lastUpdate && (
        <span className="text-gray-500 text-xs">
          Updated {formatDistanceToNow(lastUpdate, { addSuffix: true })}
        </span>
      )}
    </div>
  );
}
