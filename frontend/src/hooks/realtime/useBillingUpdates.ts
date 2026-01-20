/**
 * Real-time Billing/Claims Updates Hook
 * Subscribes to billing, claims, payments, and prior auth events
 */

import { useEffect, useCallback, useState } from 'react';
import { useWebSocketContext } from '../../contexts/WebSocketContext';
import toast from 'react-hot-toast';

export interface ClaimData {
  id: string;
  claimNumber: string;
  patientId: string;
  patientName?: string;
  encounterId?: string;
  status: 'draft' | 'scrubbed' | 'ready' | 'submitted' | 'accepted' | 'denied' | 'paid' | 'appealed';
  totalCharges: number;
  payer?: string;
  payerName?: string;
  serviceDate?: string;
  submittedAt?: string;
  scrubStatus?: string;
  denialReason?: string;
  appealStatus?: string;
}

export interface PaymentData {
  id: string;
  patientId: string;
  patientName?: string;
  claimId?: string;
  amount: number;
  paymentDate: string;
  paymentMethod?: string;
  payer?: string;
  createdAt: string;
}

export interface PriorAuthData {
  id: string;
  patientId: string;
  patientName?: string;
  status: 'pending' | 'submitted' | 'approved' | 'denied' | 'expired';
  serviceType: string;
  insurancePlan?: string;
  authNumber?: string;
  expirationDate?: string;
  createdAt: string;
  updatedAt: string;
}

interface UseBillingUpdatesOptions {
  onClaimCreated?: (claim: ClaimData) => void;
  onClaimUpdated?: (claim: ClaimData) => void;
  onClaimStatusChanged?: (claimId: string, oldStatus: string, newStatus: string) => void;
  onClaimSubmitted?: (claimId: string, payer: string) => void;
  onClaimDenied?: (claimId: string, reason: string) => void;
  onClaimPaid?: (claimId: string, amount: number) => void;
  onPaymentReceived?: (payment: PaymentData) => void;
  onPriorAuthStatusChanged?: (priorAuthId: string, oldStatus: string, newStatus: string) => void;
  showToasts?: boolean;
  showDenialAlerts?: boolean; // Show prominent alerts for claim denials
}

export function useBillingUpdates(options: UseBillingUpdatesOptions = {}) {
  const { socket, isConnected, on, off } = useWebSocketContext();
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [highlightedClaimId, setHighlightedClaimId] = useState<string | null>(null);

  const {
    onClaimCreated,
    onClaimUpdated,
    onClaimStatusChanged,
    onClaimSubmitted,
    onClaimDenied,
    onClaimPaid,
    onPaymentReceived,
    onPriorAuthStatusChanged,
    showToasts = true,
    showDenialAlerts = true,
  } = options;

  // Helper to highlight a claim briefly
  const highlightClaim = useCallback((claimId: string) => {
    setHighlightedClaimId(claimId);
    setTimeout(() => setHighlightedClaimId(null), 3000);
  }, []);

  useEffect(() => {
    if (!socket || !isConnected) return;

    // Handler for claim created
    const handleClaimCreated = (data: { claim: ClaimData; timestamp: string }) => {
      setLastUpdate(new Date(data.timestamp));
      highlightClaim(data.claim.id);

      if (showToasts) {
        toast(`New claim created: ${data.claim.claimNumber}`, {
          duration: 3000,
          icon: '📄',
        });
      }

      onClaimCreated?.(data.claim);
    };

    // Handler for claim updated
    const handleClaimUpdated = (data: { claim: ClaimData; timestamp: string }) => {
      setLastUpdate(new Date(data.timestamp));
      highlightClaim(data.claim.id);
      setIsUpdating(true);
      setTimeout(() => setIsUpdating(false), 2000);

      onClaimUpdated?.(data.claim);
    };

    // Handler for claim status changed
    const handleClaimStatusChanged = (data: {
      claimId: string;
      oldStatus: string;
      newStatus: string;
      timestamp: string;
    }) => {
      setLastUpdate(new Date(data.timestamp));
      highlightClaim(data.claimId);

      if (showToasts) {
        toast(`Claim status: ${data.oldStatus} → ${data.newStatus}`, {
          duration: 3000,
          icon: '🔄',
        });
      }

      onClaimStatusChanged?.(data.claimId, data.oldStatus, data.newStatus);
    };

    // Handler for claim submitted
    const handleClaimSubmitted = (data: { claimId: string; payer: string; timestamp: string }) => {
      setLastUpdate(new Date(data.timestamp));
      highlightClaim(data.claimId);

      if (showToasts) {
        toast.success(`Claim submitted to ${data.payer}`, {
          duration: 4000,
          icon: '📤',
        });
      }

      onClaimSubmitted?.(data.claimId, data.payer);
    };

    // Handler for claim denied
    const handleClaimDenied = (data: { claimId: string; reason: string; timestamp: string }) => {
      setLastUpdate(new Date(data.timestamp));
      highlightClaim(data.claimId);

      if (showDenialAlerts) {
        toast.error(`Claim DENIED: ${data.reason}`, {
          duration: 8000,
          icon: '❌',
          style: {
            background: '#fef2f2',
            border: '2px solid #dc2626',
          },
        });
      }

      onClaimDenied?.(data.claimId, data.reason);
    };

    // Handler for claim paid
    const handleClaimPaid = (data: { claimId: string; amount: number; timestamp: string }) => {
      setLastUpdate(new Date(data.timestamp));
      highlightClaim(data.claimId);

      if (showToasts) {
        toast.success(`Claim paid: $${(data.amount / 100).toFixed(2)}`, {
          duration: 4000,
          icon: '💵',
        });
      }

      onClaimPaid?.(data.claimId, data.amount);
    };

    // Handler for payment received
    const handlePaymentReceived = (data: { payment: PaymentData; timestamp: string }) => {
      setLastUpdate(new Date(data.timestamp));
      setIsUpdating(true);
      setTimeout(() => setIsUpdating(false), 2000);

      if (showToasts) {
        toast.success(
          `Payment received: $${(data.payment.amount / 100).toFixed(2)} from ${data.payment.payer || data.payment.patientName || 'patient'}`,
          {
            duration: 4000,
            icon: '💰',
          }
        );
      }

      onPaymentReceived?.(data.payment);
    };

    // Handler for prior auth status changed
    const handlePriorAuthStatusChanged = (data: {
      priorAuthId: string;
      oldStatus: string;
      newStatus: string;
      timestamp: string;
    }) => {
      setLastUpdate(new Date(data.timestamp));

      if (showToasts) {
        const icon = data.newStatus === 'approved' ? '✅' : data.newStatus === 'denied' ? '❌' : '📋';
        const message = `Prior Auth: ${data.oldStatus} → ${data.newStatus}`;

        if (data.newStatus === 'approved') {
          toast.success(message, { duration: 4000, icon });
        } else if (data.newStatus === 'denied') {
          toast.error(message, { duration: 6000, icon });
        } else {
          toast(message, { duration: 3000, icon });
        }
      }

      onPriorAuthStatusChanged?.(data.priorAuthId, data.oldStatus, data.newStatus);
    };

    // Subscribe to events
    on('claim:created', handleClaimCreated);
    on('claim:updated', handleClaimUpdated);
    on('claim:status_changed', handleClaimStatusChanged);
    on('claim:submitted', handleClaimSubmitted);
    on('claim:denied', handleClaimDenied);
    on('claim:paid', handleClaimPaid);
    on('payment:received', handlePaymentReceived);
    on('prior_auth:status_changed', handlePriorAuthStatusChanged);

    // Cleanup
    return () => {
      off('claim:created', handleClaimCreated);
      off('claim:updated', handleClaimUpdated);
      off('claim:status_changed', handleClaimStatusChanged);
      off('claim:submitted', handleClaimSubmitted);
      off('claim:denied', handleClaimDenied);
      off('claim:paid', handleClaimPaid);
      off('payment:received', handlePaymentReceived);
      off('prior_auth:status_changed', handlePriorAuthStatusChanged);
    };
  }, [
    socket,
    isConnected,
    on,
    off,
    onClaimCreated,
    onClaimUpdated,
    onClaimStatusChanged,
    onClaimSubmitted,
    onClaimDenied,
    onClaimPaid,
    onPaymentReceived,
    onPriorAuthStatusChanged,
    showToasts,
    showDenialAlerts,
    highlightClaim,
  ]);

  return {
    lastUpdate,
    isUpdating,
    highlightedClaimId,
    isConnected,
  };
}
