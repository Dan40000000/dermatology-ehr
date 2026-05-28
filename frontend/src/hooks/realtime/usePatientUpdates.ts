/**
 * Real-time Patient Updates Hook
 * Subscribes to patient data events and updates local state
 */

import { useEffect, useCallback, useState } from 'react';
import { useWebSocketContext } from '../../contexts/WebSocketContext';
import toast from 'react-hot-toast';

export interface PatientData {
  id: string;
  firstName?: string;
  lastName?: string;
  dob?: string;
  phone?: string;
  email?: string;
  insurance?: string;
  balance?: number;
  lastUpdated?: string;
}

interface UsePatientUpdatesOptions {
  patientId?: string; // Filter by specific patient
  onPatientUpdated?: (patient: PatientData) => void;
  onInsuranceVerified?: (patientId: string, insuranceInfo: any) => void;
  onBalanceChanged?: (patientId: string, oldBalance: number, newBalance: number) => void;
  showToasts?: boolean;
}

export function usePatientUpdates(options: UsePatientUpdatesOptions = {}) {
  const { socket, isConnected, on, off } = useWebSocketContext();
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const {
    patientId,
    onPatientUpdated,
    onInsuranceVerified,
    onBalanceChanged,
    showToasts = true,
  } = options;

  useEffect(() => {
    if (!socket || !isConnected) return;

    // Handler for patient updated
    const handlePatientUpdated = (data: { patient: PatientData; timestamp: string }) => {
      // Filter by patientId if provided
      if (patientId && data.patient.id !== patientId) return;

      setLastUpdate(new Date(data.timestamp));
      setIsUpdating(true);
      setTimeout(() => setIsUpdating(false), 2000);

      if (showToasts) {
        const patientLabel = [data.patient.firstName, data.patient.lastName].filter(Boolean).join(' ') || 'Patient record';
        toast(`${patientLabel} updated`, {
          duration: 3000,
          icon: '📋',
        });
      }

      onPatientUpdated?.(data.patient);
    };

    // Handler for insurance verified
    const handleInsuranceVerified = (data: { patientId: string; insuranceInfo: any; timestamp: string }) => {
      if (patientId && data.patientId !== patientId) return;

      setLastUpdate(new Date(data.timestamp));

      if (showToasts) {
        toast.success('Insurance verified', {
          duration: 3000,
          icon: '✅',
        });
      }

      onInsuranceVerified?.(data.patientId, data.insuranceInfo);
    };

    // Handler for balance changed
    const handleBalanceChanged = (data: {
      patientId: string;
      oldBalance?: number;
      newBalance?: number;
      timestamp: string;
    }) => {
      if (patientId && data.patientId !== patientId) return;

      setLastUpdate(new Date(data.timestamp));

      if (showToasts) {
        const hasBalances = typeof data.newBalance === 'number' && typeof data.oldBalance === 'number';
        const diff = hasBalances ? data.newBalance - data.oldBalance : 0;
        const message = hasBalances
          ? diff > 0
            ? `Balance increased by $${(diff / 100).toFixed(2)}`
            : `Balance decreased by $${Math.abs(diff / 100).toFixed(2)}`
          : 'Patient balance updated';
        toast(message, {
          duration: 3000,
          icon: '💰',
        });
      }

      if (typeof data.oldBalance === 'number' && typeof data.newBalance === 'number') {
        onBalanceChanged?.(data.patientId, data.oldBalance, data.newBalance);
      }
    };

    // Subscribe to events
    on('patient:updated', handlePatientUpdated);
    on('patient:insurance_verified', handleInsuranceVerified);
    on('patient:balance_changed', handleBalanceChanged);

    // Cleanup
    return () => {
      off('patient:updated', handlePatientUpdated);
      off('patient:insurance_verified', handleInsuranceVerified);
      off('patient:balance_changed', handleBalanceChanged);
    };
  }, [socket, isConnected, on, off, patientId, onPatientUpdated, onInsuranceVerified, onBalanceChanged, showToasts]);

  return {
    lastUpdate,
    isUpdating,
    isConnected,
  };
}
