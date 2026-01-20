/**
 * Real-time Encounter Updates Hook
 * Subscribes to encounter/visit events and updates local state
 */

import { useEffect, useCallback, useState } from 'react';
import { useWebSocketContext } from '../../contexts/WebSocketContext';
import toast from 'react-hot-toast';

export interface EncounterData {
  id: string;
  patientId: string;
  patientName?: string;
  providerId: string;
  providerName?: string;
  appointmentId?: string;
  status: 'draft' | 'in_progress' | 'completed' | 'signed';
  chiefComplaint?: string;
  createdAt: string;
  updatedAt: string;
}

interface UseEncounterUpdatesOptions {
  encounterId?: string; // Filter by specific encounter
  patientId?: string; // Filter by patient
  onEncounterCreated?: (encounter: EncounterData) => void;
  onEncounterUpdated?: (encounter: EncounterData) => void;
  onEncounterCompleted?: (encounterId: string, providerId: string) => void;
  onEncounterSigned?: (encounterId: string, providerId: string) => void;
  showToasts?: boolean;
}

export function useEncounterUpdates(options: UseEncounterUpdatesOptions = {}) {
  const { socket, isConnected, on, off } = useWebSocketContext();
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const {
    encounterId,
    patientId,
    onEncounterCreated,
    onEncounterUpdated,
    onEncounterCompleted,
    onEncounterSigned,
    showToasts = true,
  } = options;

  useEffect(() => {
    if (!socket || !isConnected) return;

    // Handler for encounter created
    const handleEncounterCreated = (data: { encounter: EncounterData; timestamp: string }) => {
      if (patientId && data.encounter.patientId !== patientId) return;
      if (encounterId && data.encounter.id !== encounterId) return;

      setLastUpdate(new Date(data.timestamp));
      setIsUpdating(true);
      setTimeout(() => setIsUpdating(false), 2000);

      if (showToasts) {
        toast(`New encounter started: ${data.encounter.patientName || 'Patient'}`, {
          duration: 3000,
          icon: '📝',
        });
      }

      onEncounterCreated?.(data.encounter);
    };

    // Handler for encounter updated
    const handleEncounterUpdated = (data: { encounter: EncounterData; timestamp: string }) => {
      if (patientId && data.encounter.patientId !== patientId) return;
      if (encounterId && data.encounter.id !== encounterId) return;

      setLastUpdate(new Date(data.timestamp));
      setIsUpdating(true);
      setTimeout(() => setIsUpdating(false), 2000);

      onEncounterUpdated?.(data.encounter);
    };

    // Handler for encounter completed
    const handleEncounterCompleted = (data: { encounterId: string; providerId: string; timestamp: string }) => {
      if (encounterId && data.encounterId !== encounterId) return;

      setLastUpdate(new Date(data.timestamp));

      if (showToasts) {
        toast.success('Encounter completed', {
          duration: 3000,
          icon: '✅',
        });
      }

      onEncounterCompleted?.(data.encounterId, data.providerId);
    };

    // Handler for encounter signed
    const handleEncounterSigned = (data: { encounterId: string; providerId: string; timestamp: string }) => {
      if (encounterId && data.encounterId !== encounterId) return;

      setLastUpdate(new Date(data.timestamp));

      if (showToasts) {
        toast.success('Encounter signed', {
          duration: 3000,
          icon: '✍️',
        });
      }

      onEncounterSigned?.(data.encounterId, data.providerId);
    };

    // Subscribe to events
    on('encounter:created', handleEncounterCreated);
    on('encounter:updated', handleEncounterUpdated);
    on('encounter:completed', handleEncounterCompleted);
    on('encounter:signed', handleEncounterSigned);

    // Cleanup
    return () => {
      off('encounter:created', handleEncounterCreated);
      off('encounter:updated', handleEncounterUpdated);
      off('encounter:completed', handleEncounterCompleted);
      off('encounter:signed', handleEncounterSigned);
    };
  }, [socket, isConnected, on, off, encounterId, patientId, onEncounterCreated, onEncounterUpdated, onEncounterCompleted, onEncounterSigned, showToasts]);

  return {
    lastUpdate,
    isUpdating,
    isConnected,
  };
}
