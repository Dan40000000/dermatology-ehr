import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Panel, LoadingSpinner, ConfirmDialog } from '../ui';
import { ChargeCapture } from './ChargeCapture';
import { FeeScheduleDisplay } from './FeeScheduleDisplay';
import type {
  Superbill,
  SuperbillLineItem,
  SuperbillDetails,
} from '../../types/superbill';
import {
  generateSuperbill,
  getSuperbillByEncounter,
  addSuperbillLineItem,
  updateSuperbillLineItem,
  deleteSuperbillLineItem,
  finalizeSuperbill,
} from '../../api';

interface SuperbillPanelProps {
  encounterId: string;
  patientId: string;
  providerId: string;
  onSuperbillChange?: (superbill: Superbill | null) => void;
  readOnly?: boolean;
}

export function SuperbillPanel({
  encounterId,
  patientId,
  providerId,
  onSuperbillChange,
  readOnly = false,
}: SuperbillPanelProps) {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

  const [superbillDetails, setSuperbillDetails] = useState<SuperbillDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [showChargeCapture, setShowChargeCapture] = useState(false);
  const [editingLineItem, setEditingLineItem] = useState<SuperbillLineItem | null>(null);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  const loadSuperbill = useCallback(async () => {
    if (!session) return;

    try {
      setLoading(true);
      const details = await getSuperbillByEncounter(
        session.tenantId,
        session.accessToken,
        encounterId
      );
      setSuperbillDetails(details);
      onSuperbillChange?.(details?.superbill ?? null);
    } catch {
      // No superbill exists yet - this is fine
      setSuperbillDetails(null);
      onSuperbillChange?.(null);
    } finally {
      setLoading(false);
    }
  }, [session, encounterId, onSuperbillChange]);

  useEffect(() => {
    loadSuperbill();
  }, [loadSuperbill]);

  const handleGenerateSuperbill = async () => {
    if (!session) return;

    try {
      setGenerating(true);
      await generateSuperbill(session.tenantId, session.accessToken, encounterId);
      await loadSuperbill();
      showSuccess('Superbill generated successfully');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to generate superbill';
      showError(message);
    } finally {
      setGenerating(false);
    }
  };

  const handleAddLineItem = async (data: {
    cptCode: string;
    description?: string;
    icd10Codes?: string[];
    units?: number;
    fee?: number;
    modifier?: string;
  }) => {
    if (!session || !superbillDetails) return;

    try {
      await addSuperbillLineItem(
        session.tenantId,
        session.accessToken,
        superbillDetails.superbill.id,
        data
      );
      await loadSuperbill();
      setShowChargeCapture(false);
      showSuccess('Charge added');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to add charge';
      showError(message);
    }
  };

  const handleUpdateLineItem = async (
    itemId: string,
    data: Partial<{
      cptCode: string;
      description: string;
      icd10Codes: string[];
      units: number;
      fee: number;
      modifier: string;
    }>
  ) => {
    if (!session || !superbillDetails) return;

    try {
      await updateSuperbillLineItem(
        session.tenantId,
        session.accessToken,
        superbillDetails.superbill.id,
        itemId,
        data
      );
      await loadSuperbill();
      setEditingLineItem(null);
      showSuccess('Charge updated');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update charge';
      showError(message);
    }
  };

  const handleDeleteLineItem = async (itemId: string) => {
    if (!session || !superbillDetails) return;

    try {
      await deleteSuperbillLineItem(
        session.tenantId,
        session.accessToken,
        superbillDetails.superbill.id,
        itemId
      );
      await loadSuperbill();
      setDeletingItemId(null);
      showSuccess('Charge removed');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to remove charge';
      showError(message);
    }
  };

  const handleFinalize = async () => {
    if (!session || !superbillDetails) return;

    try {
      setFinalizing(true);
      await finalizeSuperbill(
        session.tenantId,
        session.accessToken,
        superbillDetails.superbill.id
      );
      await loadSuperbill();
      setConfirmFinalize(false);
      showSuccess('Superbill finalized for billing');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to finalize superbill';
      showError(message);
    } finally {
      setFinalizing(false);
    }
  };

  const formatCurrency = (cents: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'draft':
        return '#6b7280';
      case 'pending_review':
        return '#d97706';
      case 'approved':
        return '#059669';
      case 'finalized':
        return '#0369a1';
      case 'submitted':
        return '#7c3aed';
      case 'void':
        return '#dc2626';
      default:
        return '#6b7280';
    }
  };

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'draft':
        return 'Draft';
      case 'pending_review':
        return 'Pending Review';
      case 'approved':
        return 'Approved';
      case 'finalized':
        return 'Finalized';
      case 'submitted':
        return 'Submitted';
      case 'void':
        return 'Void';
      default:
        return status;
    }
  };

  const isEditable = !readOnly && superbillDetails?.superbill.status !== 'finalized' && superbillDetails?.superbill.status !== 'submitted';

  if (loading) {
    return (
      <Panel>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
          <LoadingSpinner />
        </div>
      </Panel>
    );
  }

  if (!superbillDetails) {
    return (
      <Panel>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>
            No Superbill
          </h3>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem' }}>
            Generate a superbill to capture charges for this encounter.
          </p>
          {!readOnly && (
            <button
              onClick={handleGenerateSuperbill}
              disabled={generating}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#0369a1',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 500,
                cursor: generating ? 'wait' : 'pointer',
                opacity: generating ? 0.7 : 1,
              }}
            >
              {generating ? 'Generating...' : 'Generate Superbill'}
            </button>
          )}
        </div>
      </Panel>
    );
  }

  const { superbill, lineItems, patient, provider } = superbillDetails;

  return (
    <Panel>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '1.5rem',
        paddingBottom: '1rem',
        borderBottom: '1px solid #e5e7eb',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#111827', margin: 0 }}>
              Superbill
            </h3>
            <span
              style={{
                padding: '0.25rem 0.75rem',
                background: `${getStatusColor(superbill.status)}15`,
                color: getStatusColor(superbill.status),
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: 600,
                textTransform: 'uppercase',
              }}
            >
              {getStatusLabel(superbill.status)}
            </span>
          </div>
          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            <span>Service Date: {new Date(superbill.serviceDate).toLocaleDateString()}</span>
            {provider?.fullName && <span> | Provider: {provider.fullName}</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>
            {formatCurrency(superbill.totalCharges)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
            {lineItems.length} line item{lineItems.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Line Items */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.75rem',
        }}>
          <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151', margin: 0 }}>
            Charges
          </h4>
          {isEditable && (
            <button
              onClick={() => setShowChargeCapture(true)}
              style={{
                padding: '0.375rem 0.75rem',
                background: '#f3f4f6',
                color: '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              + Add Charge
            </button>
          )}
        </div>

        {lineItems.length === 0 ? (
          <div style={{
            padding: '1.5rem',
            background: '#f9fafb',
            borderRadius: '8px',
            textAlign: 'center',
            color: '#6b7280',
            fontSize: '0.875rem',
          }}>
            No charges added yet. Click "Add Charge" to capture procedures.
          </div>
        ) : (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
            {/* Header Row */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '100px 1fr 80px 80px 80px 60px',
              padding: '0.75rem 1rem',
              background: '#f9fafb',
              borderBottom: '1px solid #e5e7eb',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#6b7280',
              textTransform: 'uppercase',
            }}>
              <div>CPT</div>
              <div>Description</div>
              <div style={{ textAlign: 'right' }}>Units</div>
              <div style={{ textAlign: 'right' }}>Fee</div>
              <div style={{ textAlign: 'right' }}>Total</div>
              <div></div>
            </div>

            {/* Line Items */}
            {lineItems.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '100px 1fr 80px 80px 80px 60px',
                  padding: '0.75rem 1rem',
                  borderBottom: '1px solid #e5e7eb',
                  alignItems: 'center',
                  fontSize: '0.875rem',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: '#0369a1' }}>{item.cptCode}</div>
                  {item.modifier && (
                    <span style={{
                      fontSize: '0.625rem',
                      background: '#e5e7eb',
                      padding: '0.125rem 0.25rem',
                      borderRadius: '2px',
                      color: '#374151',
                    }}>
                      {item.modifier}
                    </span>
                  )}
                </div>
                <div>
                  <div style={{ color: '#374151' }}>{item.description || '-'}</div>
                  {item.icd10Codes.length > 0 && (
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                      DX: {item.icd10Codes.join(', ')}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right', color: '#374151' }}>{item.units}</div>
                <div style={{ textAlign: 'right', color: '#374151' }}>{formatCurrency(item.fee)}</div>
                <div style={{ textAlign: 'right', fontWeight: 600, color: '#111827' }}>
                  {formatCurrency(item.lineTotal)}
                </div>
                <div style={{ textAlign: 'right' }}>
                  {isEditable && (
                    <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => setEditingLineItem(item)}
                        style={{
                          padding: '0.25rem',
                          background: 'transparent',
                          border: 'none',
                          color: '#6b7280',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                        }}
                        title="Edit"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeletingItemId(item.id)}
                        style={{
                          padding: '0.25rem',
                          background: 'transparent',
                          border: 'none',
                          color: '#dc2626',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                        }}
                        title="Delete"
                      >
                        X
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Total Row */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '100px 1fr 80px 80px 80px 60px',
              padding: '0.75rem 1rem',
              background: '#f9fafb',
              fontWeight: 600,
            }}>
              <div></div>
              <div></div>
              <div></div>
              <div style={{ textAlign: 'right', color: '#6b7280' }}>Total:</div>
              <div style={{ textAlign: 'right', color: '#111827', fontSize: '1rem' }}>
                {formatCurrency(superbill.totalCharges)}
              </div>
              <div></div>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      {isEditable && lineItems.length > 0 && (
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '0.75rem',
          paddingTop: '1rem',
          borderTop: '1px solid #e5e7eb',
        }}>
          <button
            onClick={() => setConfirmFinalize(true)}
            style={{
              padding: '0.625rem 1.25rem',
              background: '#059669',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Finalize for Billing
          </button>
        </div>
      )}

      {/* Fee Schedule Display */}
      {superbillDetails && session && (
        <FeeScheduleDisplay
          lineItems={lineItems}
          tenantId={session.tenantId}
          accessToken={session.accessToken}
        />
      )}

      {/* Charge Capture Modal */}
      {showChargeCapture && session && (
        <ChargeCapture
          isOpen={showChargeCapture}
          onClose={() => setShowChargeCapture(false)}
          onSubmit={handleAddLineItem}
          existingDiagnoses={lineItems.flatMap(li => li.icd10Codes)}
          tenantId={session.tenantId}
          accessToken={session.accessToken}
        />
      )}

      {/* Edit Line Item Modal */}
      {editingLineItem && session && (
        <ChargeCapture
          isOpen={!!editingLineItem}
          onClose={() => setEditingLineItem(null)}
          onSubmit={(data) => handleUpdateLineItem(editingLineItem.id, data)}
          initialValues={editingLineItem}
          existingDiagnoses={lineItems.flatMap(li => li.icd10Codes)}
          tenantId={session.tenantId}
          accessToken={session.accessToken}
        />
      )}

      {/* Confirm Finalize Dialog */}
      <ConfirmDialog
        isOpen={confirmFinalize}
        title="Finalize Superbill"
        message="Once finalized, this superbill cannot be edited. Are you sure you want to finalize it for billing?"
        confirmLabel="Finalize"
        onConfirm={handleFinalize}
        onCancel={() => setConfirmFinalize(false)}
        loading={finalizing}
      />

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={!!deletingItemId}
        title="Remove Charge"
        message="Are you sure you want to remove this charge from the superbill?"
        confirmLabel="Remove"
        variant="danger"
        onConfirm={() => deletingItemId && handleDeleteLineItem(deletingItemId)}
        onCancel={() => setDeletingItemId(null)}
      />
    </Panel>
  );
}
