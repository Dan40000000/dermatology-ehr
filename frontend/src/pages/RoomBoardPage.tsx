import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RoomCard, type RoomData, type PatientInRoom } from '../components/flow/RoomCard';
import { WaitTimeDisplay, type WaitTimeStats } from '../components/flow/WaitTimeDisplay';
import { PatientStatusBadge, type FlowStatus } from '../components/flow/PatientStatusBadge';
import { useWebSocketEvent } from '../hooks/useWebSocket';
import api from '../api';

const AUTO_REFRESH_INTERVAL = 15000; // 15 seconds

interface RoomBoardEntry {
  room: RoomData;
  currentPatient?: PatientInRoom;
  assignedProvider?: { id: string; name: string };
}

interface Location {
  id: string;
  name: string;
}

interface ProviderQueueEntry {
  flowId: string;
  patientId: string;
  patientName: string;
  appointmentId: string;
  appointmentType: string;
  scheduledTime: string;
  status: FlowStatus;
  roomNumber?: string;
  roomName?: string;
  waitTimeMinutes: number;
  priority: string;
}

export const RoomBoardPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>(
    searchParams.get('locationId') || ''
  );
  const [roomBoard, setRoomBoard] = useState<RoomBoardEntry[]>([]);
  const [waitTimeStats, setWaitTimeStats] = useState<WaitTimeStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Fetch locations on mount
  useEffect(() => {
    const fetchLocations = async () => {
      try {
        const response = await api.get('/api/locations');
        const locationList = response.data.locations || response.data || [];
        setLocations(locationList);

        // Auto-select first location if none selected
        if (!selectedLocationId && locationList.length > 0) {
          const firstLocation = locationList[0];
          if (firstLocation) {
            setSelectedLocationId(firstLocation.id);
            setSearchParams({ locationId: firstLocation.id });
          }
        }
      } catch (error) {
        console.error('Error fetching locations:', error);
      }
    };

    fetchLocations();
  }, [selectedLocationId, setSearchParams]);

  // Fetch room board data
  const fetchRoomBoard = useCallback(async () => {
    if (!selectedLocationId) return;

    try {
      const [boardResponse, waitTimesResponse] = await Promise.all([
        api.get(`/api/patient-flow/board?locationId=${selectedLocationId}`),
        api.get(`/api/patient-flow/wait-times?locationId=${selectedLocationId}`),
      ]);

      setRoomBoard(boardResponse.data.rooms || []);

      const stats = waitTimesResponse.data.waitTimes?.[0] || null;
      setWaitTimeStats(stats);

      setLastRefresh(new Date());
    } catch (error) {
      console.error('Error fetching room board:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedLocationId]);

  // Initial load and auto-refresh
  useEffect(() => {
    if (selectedLocationId) {
      setIsLoading(true);
      fetchRoomBoard();
    }
  }, [selectedLocationId, fetchRoomBoard]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchRoomBoard();
    }, AUTO_REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [fetchRoomBoard]);

  // WebSocket real-time updates
  useWebSocketEvent('patient-flow:updated', () => {
    fetchRoomBoard();
  });

  useWebSocketEvent('room-board:updated', () => {
    fetchRoomBoard();
  });

  // Handle status change
  const handleStatusChange = async (
    appointmentId: string,
    newStatus: FlowStatus,
    roomId?: string
  ) => {
    try {
      await api.put(`/api/patient-flow/${appointmentId}/status`, {
        status: newStatus,
        roomId,
      });
      // Refresh will happen via WebSocket or next auto-refresh
      await fetchRoomBoard();
    } catch (error) {
      console.error('Error updating status:', error);
      throw error;
    }
  };

  // Handle patient click
  const handlePatientClick = (patientId: string) => {
    navigate(`/patients/${patientId}`);
  };

  // Handle location change
  const handleLocationChange = (locationId: string) => {
    setSelectedLocationId(locationId);
    setSearchParams({ locationId });
  };

  // Toggle fullscreen
  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullScreen(true);
    } else {
      document.exitFullscreen();
      setIsFullScreen(false);
    }
  };

  // Get available empty rooms for room selection
  const availableRooms = roomBoard
    .filter((entry) => !entry.currentPatient)
    .map((entry) => ({
      id: entry.room.id,
      roomNumber: entry.room.roomNumber,
      roomName: entry.room.roomName,
    }));

  // Separate occupied and empty rooms
  const occupiedRooms = roomBoard.filter((entry) => entry.currentPatient);
  const emptyRooms = roomBoard.filter((entry) => !entry.currentPatient);

  return (
    <div className={`min-h-screen bg-gray-100 ${isFullScreen ? 'p-4' : ''}`}>
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-full mx-auto px-4 sm:px-6 py-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold text-gray-900">Room Status Board</h1>

              {/* Location Selector */}
              <select
                value={selectedLocationId}
                onChange={(e) => handleLocationChange(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Location</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3">
              {/* Last refresh */}
              <span className="text-sm text-gray-500">
                Updated: {lastRefresh.toLocaleTimeString()}
              </span>

              {/* View Toggle */}
              <div className="flex items-center bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded ${viewMode === 'grid' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'}`}
                  title="Grid View"
                >
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded ${viewMode === 'list' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'}`}
                  title="List View"
                >
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                </button>
              </div>

              {/* Refresh Button */}
              <button
                onClick={() => fetchRoomBoard()}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>

              {/* Fullscreen Toggle */}
              <button
                onClick={toggleFullScreen}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
                title={isFullScreen ? 'Exit Fullscreen' : 'Fullscreen'}
              >
                {isFullScreen ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-full mx-auto px-4 sm:px-6 py-6">
        {!selectedLocationId ? (
          <div className="text-center py-12">
            <svg
              className="mx-auto h-16 w-16 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <h3 className="mt-4 text-lg font-medium text-gray-900">
              Select a Location
            </h3>
            <p className="mt-1 text-gray-500">
              Choose a location from the dropdown above to view the room board.
            </p>
          </div>
        ) : isLoading ? (
          <div className="space-y-6">
            {/* Loading skeleton */}
            <div className="animate-pulse">
              <div className="h-32 bg-gray-200 rounded-lg mb-6"></div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="h-48 bg-gray-200 rounded-xl"></div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Wait Time Stats */}
            <WaitTimeDisplay stats={waitTimeStats} />

            {/* Quick Stats Bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg shadow p-4">
                <div className="text-sm text-gray-500">Total Rooms</div>
                <div className="text-2xl font-bold text-gray-900">{roomBoard.length}</div>
              </div>
              <div className="bg-white rounded-lg shadow p-4">
                <div className="text-sm text-gray-500">Occupied</div>
                <div className="text-2xl font-bold text-blue-600">{occupiedRooms.length}</div>
              </div>
              <div className="bg-white rounded-lg shadow p-4">
                <div className="text-sm text-gray-500">Available</div>
                <div className="text-2xl font-bold text-green-600">{emptyRooms.length}</div>
              </div>
              <div className="bg-white rounded-lg shadow p-4">
                <div className="text-sm text-gray-500">Waiting for Provider</div>
                <div className="text-2xl font-bold text-orange-600">
                  {occupiedRooms.filter((r) => r.currentPatient?.status === 'ready_for_provider').length}
                </div>
              </div>
            </div>

            {/* Room Grid/List */}
            {viewMode === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                {roomBoard.map((entry) => (
                  <RoomCard
                    key={entry.room.id}
                    room={entry.room}
                    patient={entry.currentPatient}
                    assignedProvider={entry.assignedProvider}
                    onStatusChange={handleStatusChange}
                    onPatientClick={handlePatientClick}
                    availableRooms={availableRooms}
                  />
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Room
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Patient
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Wait Time
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Provider
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {roomBoard.map((entry) => (
                      <tr
                        key={entry.room.id}
                        className={entry.currentPatient ? 'bg-white' : 'bg-gray-50'}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            Room {entry.room.roomNumber}
                          </div>
                          <div className="text-xs text-gray-500 capitalize">
                            {entry.room.roomType}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {entry.currentPatient ? (
                            <button
                              onClick={() => handlePatientClick(entry.currentPatient!.patientId)}
                              className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              {entry.currentPatient.patientName}
                            </button>
                          ) : (
                            <span className="text-sm text-gray-400 italic">Empty</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {entry.currentPatient && (
                            <PatientStatusBadge
                              status={entry.currentPatient.status}
                              size="sm"
                            />
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {entry.currentPatient
                            ? `${entry.currentPatient.waitTimeMinutes}m`
                            : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {entry.currentPatient?.providerName ||
                            entry.assignedProvider?.name ||
                            '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                          {entry.currentPatient && (
                            <button
                              onClick={() =>
                                handlePatientClick(entry.currentPatient!.patientId)
                              }
                              className="text-blue-600 hover:text-blue-800"
                            >
                              View
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Empty state */}
            {roomBoard.length === 0 && (
              <div className="text-center py-12 bg-white rounded-lg shadow">
                <svg
                  className="mx-auto h-16 w-16 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
                <h3 className="mt-4 text-lg font-medium text-gray-900">
                  No Rooms Configured
                </h3>
                <p className="mt-1 text-gray-500">
                  Configure exam rooms for this location in Admin Settings.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status Legend (for fullscreen mode) */}
      {isFullScreen && (
        <div className="fixed bottom-4 left-4 bg-white rounded-lg shadow-lg p-3">
          <div className="text-xs font-medium text-gray-700 mb-2">Status Legend:</div>
          <div className="flex flex-wrap gap-2">
            {(['checked_in', 'rooming', 'vitals_complete', 'ready_for_provider', 'with_provider', 'checkout'] as FlowStatus[]).map(
              (status) => (
                <PatientStatusBadge key={status} status={status} size="sm" />
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default RoomBoardPage;
