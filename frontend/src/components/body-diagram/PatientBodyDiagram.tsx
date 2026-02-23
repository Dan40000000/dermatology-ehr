import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AnatomicalBodyDiagram } from './AnatomicalBodyDiagram';
import type { BodyMarker, BodyView } from './AnatomicalBodyDiagram';
import { BodyMarkerModal } from './BodyMarkerModal';
import api from '../../api';
import toast from 'react-hot-toast';

interface PatientBodyDiagramProps {
  patientId: string;
  encounterId?: string;
  editable?: boolean;
  onMarkersChange?: (markers: BodyMarker[]) => void;
  className?: string;
}

export function PatientBodyDiagram({
  patientId,
  encounterId,
  editable = true,
  onMarkersChange,
  className = '',
}: PatientBodyDiagramProps) {
  const [markers, setMarkers] = useState<BodyMarker[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedMarker, setSelectedMarker] = useState<BodyMarker | null>(null);
  const [pendingPosition, setPendingPosition] = useState<{
    x: number;
    y: number;
    view: BodyView;
  } | null>(null);
  const [markerHistory, setMarkerHistory] = useState<BodyMarker[][]>([]);
  const latestRequestRef = useRef(0);

  // Fetch markers from API
  const fetchMarkers = useCallback(async () => {
    if (!patientId) return;
    const requestId = ++latestRequestRef.current;

    try {
      setIsLoading(true);
      setError(null);

      const response = await api.get(`/api/body-diagram/patient/${patientId}/markings`);
      if (requestId !== latestRequestRef.current) {
        return;
      }

      const responseData = response.data;
      const data = responseData?.markings || responseData || [];

      // Transform API response to BodyMarker format
      // Backend uses: locationX, locationY, viewType, markingType, description
      const transformedMarkers: BodyMarker[] = data.map((m: any) => ({
        id: m.id,
        x: m.locationX ?? m.location_x ?? m.x ?? 0,
        y: m.locationY ?? m.location_y ?? m.y ?? 0,
        view: mapViewType(m.viewType || m.view_type || m.view || 'front'),
        note: m.description || m.note || m.diagnosisDescription || '',
        type: mapMarkingType(m.markingType || m.marking_type || m.type || 'lesion'),
        date: m.createdAt || m.created_at || m.date || new Date().toISOString(),
        severity: m.status === 'active' ? 'high' : m.status === 'monitored' ? 'medium' : 'low',
      }));

      setMarkers(transformedMarkers);
    } catch (err: any) {
      if (requestId !== latestRequestRef.current) {
        return;
      }

      if (err?.response?.status === 404) {
        setMarkers([]);
        setError(null);
        return;
      }

      if (err?.response?.status === 401 || err?.response?.status === 403) {
        setError('Body diagram unavailable for this user');
        setMarkers([]);
        return;
      }

      setError('Failed to load body markers');
      setMarkers([]);
    } finally {
      if (requestId === latestRequestRef.current) {
        setIsLoading(false);
      }
    }
  }, [patientId]);

  // Map backend viewType to our BodyView
  function mapViewType(viewType: string): BodyView {
    if (viewType === 'back') return 'back';
    if (viewType === 'left' || viewType === 'left-side') return 'left';
    if (viewType === 'right' || viewType === 'right-side') return 'right';
    return 'front';
  }

  // Map backend markingType to our marker type
  function mapMarkingType(markingType: string): BodyMarker['type'] {
    if (markingType === 'lesion') return 'lesion';
    if (markingType === 'biopsy' || markingType === 'excision') return 'procedure';
    if (markingType === 'injection') return 'cosmetic';
    if (markingType === 'examined') return 'note';
    return 'lesion';
  }

  useEffect(() => {
    fetchMarkers();
    return () => {
      latestRequestRef.current += 1;
    };
  }, [fetchMarkers]);

  useEffect(() => {
    onMarkersChange?.(markers);
  }, [markers, onMarkersChange]);

  // Handle adding a new marker
  const handleAddMarker = useCallback(
    (x: number, y: number, view: BodyView) => {
      setPendingPosition({ x, y, view });
      setSelectedMarker(null);
      setIsModalOpen(true);
    },
    []
  );

  // Handle clicking an existing marker
  const handleMarkerClick = useCallback((marker: BodyMarker) => {
    setSelectedMarker(marker);
    setPendingPosition(null);
    setIsModalOpen(true);
  }, []);

  // Map our marker type to backend markingType
  function reverseMapMarkingType(type: BodyMarker['type']): string {
    if (type === 'lesion') return 'lesion';
    if (type === 'procedure') return 'biopsy';
    if (type === 'cosmetic') return 'injection';
    if (type === 'wound') return 'lesion';
    if (type === 'condition') return 'lesion';
    return 'examined';
  }

  // Map our severity to backend status
  function mapSeverityToStatus(severity: BodyMarker['severity']): string {
    if (severity === 'high') return 'active';
    if (severity === 'medium') return 'monitored';
    return 'resolved';
  }

  // Save marker (create or update)
  const handleSaveMarker = useCallback(
    async (markerData: Omit<BodyMarker, 'id'>) => {
      // Save current state for undo
      setMarkerHistory((prev) => [...prev, markers]);

      // Prepare backend-compatible payload
      const backendPayload = {
        patientId: patientId,
        encounterId: encounterId,
        locationCode: 'custom',
        locationX: markerData.x,
        locationY: markerData.y,
        viewType: markerData.view === 'left' ? 'front' : markerData.view === 'right' ? 'front' : markerData.view,
        markingType: reverseMapMarkingType(markerData.type),
        description: markerData.note,
        status: mapSeverityToStatus(markerData.severity),
      };

      try {
        if (selectedMarker) {
          // Update existing marker
          await api.put(`/api/body-diagram/markings/${selectedMarker.id}`, backendPayload);

          setMarkers((prev) =>
            prev.map((m) =>
              m.id === selectedMarker.id
                ? { ...m, ...markerData }
                : m
            )
          );
          toast.success('Marker updated');
        } else {
          // Create new marker
          const response = await api.post(`/api/body-diagram/markings`, backendPayload);

          const responseData = response.data;
          const newMarker: BodyMarker = {
            id: responseData?.id || responseData?.marking?.id || `temp-${Date.now()}`,
            ...markerData,
          };

          setMarkers((prev) => [...prev, newMarker]);
          toast.success('Marker added');
        }
      } catch (err) {
        console.error('Failed to save marker:', err);
        toast.error('Failed to save marker');
        // Optimistic update - add to local state even if API fails
        if (!selectedMarker) {
          const tempMarker: BodyMarker = {
            id: `temp-${Date.now()}`,
            ...markerData,
          };
          setMarkers((prev) => [...prev, tempMarker]);
        }
      }

      setIsModalOpen(false);
      setSelectedMarker(null);
      setPendingPosition(null);
    },
    [patientId, encounterId, selectedMarker, markers]
  );

  // Delete marker
  const handleDeleteMarker = useCallback(async () => {
    if (!selectedMarker) return;

    // Save current state for undo
    setMarkerHistory((prev) => [...prev, markers]);

    try {
      await api.delete(`/api/body-diagram/markings/${selectedMarker.id}`);

      setMarkers((prev) => prev.filter((m) => m.id !== selectedMarker.id));
      toast.success('Marker deleted');
    } catch (err) {
      console.error('Failed to delete marker:', err);
      toast.error('Failed to delete marker');
      // Still remove from local state
      setMarkers((prev) => prev.filter((m) => m.id !== selectedMarker.id));
    }

    setIsModalOpen(false);
    setSelectedMarker(null);
  }, [selectedMarker, markers]);

  // Undo last action
  const handleUndo = useCallback(() => {
    if (markerHistory.length === 0) return;
    const previousState = markerHistory[markerHistory.length - 1];
    setMarkers(previousState);
    setMarkerHistory((prev) => prev.slice(0, -1));
  }, [markerHistory]);

  if (isLoading) {
    return (
      <div
        className={className}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px',
          background: '#f9fafb',
          borderRadius: '12px',
        }}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            border: '3px solid #e5e7eb',
            borderTopColor: '#6366f1',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        />
        <style>
          {`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}
        </style>
      </div>
    );
  }

  return (
    <div className={`patient-body-diagram ${className}`}>
      {/* Header with controls */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: '18px',
            fontWeight: '600',
            color: '#111827',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2a5 5 0 0 0-5 5v4a5 5 0 0 0 10 0V7a5 5 0 0 0-5-5Z" />
            <path d="M8 14v1a4 4 0 0 0 8 0v-1" />
            <path d="M12 19v3" />
            <path d="M8 22h8" />
          </svg>
          Body Diagram
        </h3>

        <div style={{ display: 'flex', gap: '8px' }}>
          {markerHistory.length > 0 && (
            <button
              onClick={handleUndo}
              style={{
                padding: '8px 12px',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                background: 'white',
                fontSize: '13px',
                color: '#6b7280',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M3 7v6h6" />
                <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
              </svg>
              Undo
            </button>
          )}

          <button
            onClick={fetchMarkers}
            style={{
              padding: '8px 12px',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              background: 'white',
              fontSize: '13px',
              color: '#6b7280',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div
          style={{
            padding: '12px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            color: '#991b1b',
            fontSize: '14px',
            marginBottom: '16px',
          }}
        >
          {error}
        </div>
      )}

      {/* Stats bar */}
      <div
        style={{
          display: 'flex',
          gap: '16px',
          marginBottom: '16px',
          padding: '12px 16px',
          background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
          borderRadius: '8px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ fontSize: '14px', color: '#0369a1' }}>
          <strong>{markers.length}</strong> total markers
        </div>
        <div style={{ fontSize: '14px', color: '#0369a1' }}>
          <strong>{markers.filter((m) => m.type === 'lesion').length}</strong> lesions
        </div>
        <div style={{ fontSize: '14px', color: '#0369a1' }}>
          <strong>{markers.filter((m) => m.type === 'procedure').length}</strong> procedures
        </div>
        <div style={{ fontSize: '14px', color: '#0369a1' }}>
          <strong>{markers.filter((m) => m.severity === 'high').length}</strong> high severity
        </div>
      </div>

      {/* Body Diagram */}
      <AnatomicalBodyDiagram
        patientId={patientId}
        markers={markers}
        onAddMarker={editable ? handleAddMarker : undefined}
        onMarkerClick={handleMarkerClick}
        editable={editable}
        showLabels={false}
      />

      {/* Markers list */}
      {markers.length > 0 && (
        <div
          style={{
            marginTop: '24px',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '12px 16px',
              background: '#f9fafb',
              borderBottom: '1px solid #e5e7eb',
              fontWeight: '600',
              fontSize: '14px',
              color: '#374151',
            }}
          >
            All Markers ({markers.length})
          </div>
          <div style={{ maxHeight: '300px', overflow: 'auto' }}>
            {markers.map((marker) => (
              <div
                key={marker.id}
                onClick={() => handleMarkerClick(marker)}
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid #f3f4f6',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f9fafb';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'white';
                }}
              >
                <span
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background:
                      marker.type === 'lesion'
                        ? '#EF4444'
                        : marker.type === 'procedure'
                        ? '#3B82F6'
                        : marker.type === 'condition'
                        ? '#F59E0B'
                        : marker.type === 'cosmetic'
                        ? '#EC4899'
                        : marker.type === 'wound'
                        ? '#8B5CF6'
                        : '#10B981',
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#111827',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {marker.note}
                  </div>
                  <div
                    style={{
                      fontSize: '12px',
                      color: '#6b7280',
                      marginTop: '2px',
                    }}
                  >
                    {marker.view.charAt(0).toUpperCase() + marker.view.slice(1)} view •{' '}
                    {marker.type.charAt(0).toUpperCase() + marker.type.slice(1)}
                    {marker.severity && (
                      <span
                        style={{
                          marginLeft: '8px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          background:
                            marker.severity === 'high'
                              ? '#fef2f2'
                              : marker.severity === 'medium'
                              ? '#fffbeb'
                              : '#f0fdf4',
                          color:
                            marker.severity === 'high'
                              ? '#991b1b'
                              : marker.severity === 'medium'
                              ? '#92400e'
                              : '#166534',
                        }}
                      >
                        {marker.severity}
                      </span>
                    )}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: '12px',
                    color: '#9ca3af',
                  }}
                >
                  {new Date(marker.date).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal */}
      <BodyMarkerModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedMarker(null);
          setPendingPosition(null);
        }}
        onSave={handleSaveMarker}
        onDelete={selectedMarker ? handleDeleteMarker : undefined}
        marker={selectedMarker}
        position={pendingPosition || undefined}
      />
    </div>
  );
}

export default PatientBodyDiagram;
