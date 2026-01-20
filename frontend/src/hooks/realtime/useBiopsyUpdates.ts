/**
 * Real-time Biopsy Updates Hook
 * Critical patient safety feature - get immediate notifications about biopsy results
 */

import { useEffect, useState } from 'react';
import { useWebSocketContext } from '../../contexts/WebSocketContext';
import toast from 'react-hot-toast';

export interface BiopsyData {
  id: string;
  patientId: string;
  patientName?: string;
  orderingProviderId: string;
  orderingProviderName?: string;
  status: 'ordered' | 'collected' | 'sent' | 'received_by_lab' | 'processing' | 'resulted' | 'reviewed' | 'closed';
  bodyLocation: string;
  specimenType: string;
  pathLab: string;
  pathLabCaseNumber?: string;
  diagnosis?: string;
  createdAt: string;
  resultedAt?: string;
}

interface UseBiopsyUpdatesOptions {
  patientId?: string; // Filter by patient
  onBiopsyCreated?: (biopsy: BiopsyData) => void;
  onBiopsyUpdated?: (biopsy: BiopsyData) => void;
  onBiopsyResultReceived?: (biopsyId: string, patientId: string, diagnosis: string) => void;
  onBiopsyReviewed?: (biopsyId: string, patientId: string, reviewedBy: string) => void;
  showToasts?: boolean;
  showCriticalAlerts?: boolean; // Show prominent alerts for concerning results
}

export function useBiopsyUpdates(options: UseBiopsyUpdatesOptions = {}) {
  const { socket, isConnected, on, off } = useWebSocketContext();
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [pendingResults, setPendingResults] = useState<string[]>([]);

  const {
    patientId,
    onBiopsyCreated,
    onBiopsyUpdated,
    onBiopsyResultReceived,
    onBiopsyReviewed,
    showToasts = true,
    showCriticalAlerts = true,
  } = options;

  useEffect(() => {
    if (!socket || !isConnected) return;

    // Handler for biopsy created
    const handleBiopsyCreated = (data: { biopsy: BiopsyData; timestamp: string }) => {
      if (patientId && data.biopsy.patientId !== patientId) return;

      setLastUpdate(new Date(data.timestamp));
      setPendingResults((prev) => [...prev, data.biopsy.id]);

      if (showToasts) {
        toast(`New biopsy ordered: ${data.biopsy.bodyLocation}`, {
          duration: 4000,
          icon: '🔬',
        });
      }

      onBiopsyCreated?.(data.biopsy);
    };

    // Handler for biopsy updated
    const handleBiopsyUpdated = (data: { biopsy: BiopsyData; timestamp: string }) => {
      if (patientId && data.biopsy.patientId !== patientId) return;

      setLastUpdate(new Date(data.timestamp));

      onBiopsyUpdated?.(data.biopsy);
    };

    // Handler for biopsy result received - CRITICAL ALERT
    const handleBiopsyResultReceived = (data: {
      biopsyId: string;
      patientId: string;
      diagnosis: string;
      timestamp: string;
    }) => {
      if (patientId && data.patientId !== patientId) return;

      setLastUpdate(new Date(data.timestamp));
      setPendingResults((prev) => prev.filter((id) => id !== data.biopsyId));

      // Check for concerning diagnoses (melanoma, carcinoma, etc.)
      const isConcerning =
        /melanoma|carcinoma|malignant|cancer/i.test(data.diagnosis);

      if (showCriticalAlerts && isConcerning) {
        // Show prominent alert for concerning results
        toast.error(`BIOPSY RESULT: ${data.diagnosis}`, {
          duration: 10000,
          icon: '⚠️',
          style: {
            background: '#fef2f2',
            border: '3px solid #dc2626',
            fontSize: '16px',
            fontWeight: 'bold',
          },
        });
      } else if (showToasts) {
        toast.success(`Biopsy result received: ${data.diagnosis}`, {
          duration: 6000,
          icon: '📋',
        });
      }

      onBiopsyResultReceived?.(data.biopsyId, data.patientId, data.diagnosis);
    };

    // Handler for biopsy reviewed
    const handleBiopsyReviewed = (data: {
      biopsyId: string;
      patientId: string;
      reviewedBy: string;
      timestamp: string;
    }) => {
      if (patientId && data.patientId !== patientId) return;

      setLastUpdate(new Date(data.timestamp));

      if (showToasts) {
        toast(`Biopsy reviewed by ${data.reviewedBy}`, {
          duration: 3000,
          icon: '✅',
        });
      }

      onBiopsyReviewed?.(data.biopsyId, data.patientId, data.reviewedBy);
    };

    // Subscribe to events
    on('biopsy:created', handleBiopsyCreated);
    on('biopsy:updated', handleBiopsyUpdated);
    on('biopsy:result_received', handleBiopsyResultReceived);
    on('biopsy:reviewed', handleBiopsyReviewed);

    // Cleanup
    return () => {
      off('biopsy:created', handleBiopsyCreated);
      off('biopsy:updated', handleBiopsyUpdated);
      off('biopsy:result_received', handleBiopsyResultReceived);
      off('biopsy:reviewed', handleBiopsyReviewed);
    };
  }, [
    socket,
    isConnected,
    on,
    off,
    patientId,
    onBiopsyCreated,
    onBiopsyUpdated,
    onBiopsyResultReceived,
    onBiopsyReviewed,
    showToasts,
    showCriticalAlerts,
  ]);

  return {
    lastUpdate,
    pendingResults,
    pendingResultsCount: pendingResults.length,
    isConnected,
  };
}
