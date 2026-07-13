import { useState } from 'react';
import { Modal } from './ui';
import type { Prescription } from '../types';

interface RxHistoryTabProps {
  prescriptions: Prescription[];
  onRefresh: () => void;
}

type PrescriptionRecord = Prescription & Record<string, unknown>;

function firstString(record: PrescriptionRecord, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function firstNumber(record: PrescriptionRecord, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return undefined;
}

function firstBoolean(record: PrescriptionRecord, ...keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false') return false;
    }
  }
  return undefined;
}

function firstValidDate(record: PrescriptionRecord, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value !== 'string' || !value.trim()) continue;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return value;
    }
  }
  return undefined;
}

function formatDate(value?: string | null): string {
  if (!value) return 'Not on file';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not on file';
  return date.toLocaleDateString();
}

function normalizePrescription(rx: Prescription): Prescription {
  const record = rx as PrescriptionRecord;
  const medicationName = firstString(record, 'medicationName', 'medication_name', 'drugName', 'drug_name', 'name');
  const genericName = firstString(record, 'genericName', 'generic_name');
  const writtenDate = firstValidDate(record, 'writtenDate', 'written_date', 'prescribedDate', 'prescribed_date', 'createdAt', 'created_at');
  const createdAt = firstValidDate(record, 'createdAt', 'created_at', 'writtenDate', 'written_date');

  return {
    ...rx,
    tenantId: rx.tenantId || firstString(record, 'tenant_id') || '',
    patientId: rx.patientId || firstString(record, 'patient_id') || '',
    encounterId: rx.encounterId || firstString(record, 'encounter_id'),
    providerId: rx.providerId || firstString(record, 'provider_id') || '',
    providerName: rx.providerName || firstString(record, 'provider_name'),
    medicationId: rx.medicationId || firstString(record, 'medication_id'),
    medicationName: medicationName || 'Unknown medication',
    genericName,
    dosageForm: rx.dosageForm || firstString(record, 'dosage_form'),
    quantity: firstNumber(record, 'quantity') ?? rx.quantity,
    quantityUnit: rx.quantityUnit || firstString(record, 'quantity_unit'),
    refills: firstNumber(record, 'refills') ?? rx.refills ?? 0,
    daysSupply: firstNumber(record, 'daysSupply', 'days_supply'),
    pharmacyId: rx.pharmacyId || firstString(record, 'pharmacy_id'),
    pharmacyName: rx.pharmacyName || firstString(record, 'pharmacy_name'),
    pharmacyPhone: rx.pharmacyPhone || firstString(record, 'pharmacy_phone'),
    pharmacyAddress: rx.pharmacyAddress || firstString(record, 'pharmacy_address'),
    pharmacyNcpdp: rx.pharmacyNcpdp || firstString(record, 'pharmacy_ncpdp'),
    daw: rx.daw ?? firstBoolean(record, 'daw') ?? false,
    isControlled: rx.isControlled ?? firstBoolean(record, 'isControlled', 'is_controlled') ?? false,
    deaSchedule: rx.deaSchedule || firstString(record, 'dea_schedule'),
    sentAt: rx.sentAt || firstValidDate(record, 'sent_at'),
    transmittedAt: rx.transmittedAt || firstValidDate(record, 'transmitted_at'),
    surescriptsMessageId: rx.surescriptsMessageId || firstString(record, 'surescripts_message_id'),
    errorMessage: rx.errorMessage || firstString(record, 'error_message'),
    errorCode: rx.errorCode || firstString(record, 'error_code'),
    filledAt: rx.filledAt || firstValidDate(record, 'filled_at'),
    writtenDate,
    createdAt: createdAt || '',
    updatedAt: rx.updatedAt || firstValidDate(record, 'updated_at'),
    createdBy: rx.createdBy || firstString(record, 'created_by') || '',
  };
}

// Helper component for displaying info rows
function InfoRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>{label}</div>
      <div style={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>{value}</div>
    </div>
  );
}

export function RxHistoryTab({ prescriptions, onRefresh }: RxHistoryTabProps) {
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'discontinued'>('all');
  const [selectedPrescription, setSelectedPrescription] = useState<Prescription | null>(null);
  const normalizedPrescriptions = prescriptions.map(normalizePrescription);

  // Filter prescriptions based on status
  const filteredPrescriptions = normalizedPrescriptions.filter((rx) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'active') return rx.status === 'sent' || rx.status === 'transmitted' || rx.status === 'pending';
    if (statusFilter === 'discontinued') return rx.status === 'discontinued' || rx.status === 'cancelled';
    return true;
  });

  // Helper to determine display status
  const getDisplayStatus = (rx: Prescription): { label: string; color: string } => {
    if (rx.status === 'discontinued' || rx.status === 'cancelled') {
      return { label: 'Discontinued', color: '#dc2626' };
    }
    if (rx.status === 'sent' || rx.status === 'transmitted') {
      if (rx.refills > 0) {
        return { label: 'Active', color: '#10b981' };
      } else {
        return { label: 'Refill Needed', color: '#f59e0b' };
      }
    }
    if (rx.status === 'pending') {
      return { label: 'Pending', color: '#6b7280' };
    }
    if (rx.status === 'error') {
      return { label: 'Error', color: '#dc2626' };
    }
    return { label: 'Completed', color: '#6b7280' };
  };

  const handleRequestRefill = (rx: Prescription) => {
    alert(`Refill request functionality would be implemented here for: ${rx.medicationName}`);
    // In a real implementation, this would call the refill API
  };

  const handleDiscontinue = (rx: Prescription) => {
    if (confirm(`Are you sure you want to discontinue ${rx.medicationName}?`)) {
      alert('Discontinue functionality would be implemented here');
      // In a real implementation, this would update the prescription status
    }
  };

  return (
    <div style={{ maxWidth: '1200px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div className="ema-section-header">Prescription History</div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className="ema-action-btn"
            onClick={onRefresh}
          >
            <span className="icon"></span>
            Refresh
          </button>
        </div>
      </div>

      {/* Status Filter */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button
          type="button"
          onClick={() => setStatusFilter('all')}
          style={{
            padding: '0.5rem 1rem',
            background: statusFilter === 'all' ? '#0369a1' : '#f3f4f6',
            color: statusFilter === 'all' ? '#ffffff' : '#374151',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 500
          }}
        >
          All ({normalizedPrescriptions.length})
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter('active')}
          style={{
            padding: '0.5rem 1rem',
            background: statusFilter === 'active' ? '#0369a1' : '#f3f4f6',
            color: statusFilter === 'active' ? '#ffffff' : '#374151',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 500
          }}
        >
          Active ({normalizedPrescriptions.filter(rx => rx.status === 'sent' || rx.status === 'transmitted' || rx.status === 'pending').length})
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter('discontinued')}
          style={{
            padding: '0.5rem 1rem',
            background: statusFilter === 'discontinued' ? '#0369a1' : '#f3f4f6',
            color: statusFilter === 'discontinued' ? '#ffffff' : '#374151',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 500
          }}
        >
          Discontinued ({normalizedPrescriptions.filter(rx => rx.status === 'discontinued' || rx.status === 'cancelled').length})
        </button>
      </div>

      {filteredPrescriptions.length === 0 ? (
        <div style={{
          background: '#f9fafb',
          border: '1px dashed #d1d5db',
          borderRadius: '8px',
          padding: '3rem',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}></div>
          <h3 style={{ margin: '0 0 0.5rem', color: '#374151' }}>No prescriptions</h3>
          <p style={{ color: '#6b7280', margin: 0 }}>
            {statusFilter === 'all'
              ? 'No prescriptions have been written for this patient'
              : `No ${statusFilter} prescriptions found`
            }
          </p>
        </div>
      ) : (
        <table className="ema-table">
          <thead>
            <tr>
              <th>Medication</th>
              <th>Dosage & Directions</th>
              <th>Prescriber</th>
              <th>Pharmacy</th>
              <th>Date Prescribed</th>
              <th>Status</th>
              <th>Refills</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPrescriptions.map((rx) => {
              const displayStatus = getDisplayStatus(rx);
              return (
                <tr key={rx.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{rx.medicationName}</div>
                    {rx.genericName && (
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        ({rx.genericName})
                      </div>
                    )}
                    {rx.strength && (
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        {rx.strength}
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ fontSize: '0.875rem' }}>{rx.sig}</div>
                    {rx.quantity && (
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        Qty: {rx.quantity} {rx.quantityUnit || ''}
                      </div>
                    )}
                    {rx.daysSupply && (
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        {rx.daysSupply} days supply
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ fontSize: '0.875rem' }}>
                      {rx.providerName || 'Unknown'}
                    </div>
                  </td>
                  <td>
                    <div style={{ fontSize: '0.875rem' }}>
                      {rx.pharmacyName || 'Not specified'}
                    </div>
                    {rx.pharmacyPhone && (
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        {rx.pharmacyPhone}
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ fontSize: '0.875rem' }}>
                      {formatDate(rx.writtenDate || rx.createdAt)}
                    </div>
                    {rx.sentAt && (
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        Sent: {formatDate(rx.sentAt)}
                      </div>
                    )}
                  </td>
                  <td>
                    <span style={{
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      background: `${displayStatus.color}20`,
                      color: displayStatus.color
                    }}>
                      {displayStatus.label}
                    </span>
                    {rx.isControlled && (
                      <div style={{
                        fontSize: '0.625rem',
                        color: '#dc2626',
                        fontWeight: 600,
                        marginTop: '0.25rem'
                      }}>
                        CONTROLLED
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                      {rx.refills} refills
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <button
                        type="button"
                        onClick={() => setSelectedPrescription(rx)}
                        style={{
                          padding: '0.25rem 0.75rem',
                          background: '#0369a1',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        View Details
                      </button>
                      {(rx.status === 'sent' || rx.status === 'transmitted') && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRequestRefill(rx);
                            }}
                            style={{
                              padding: '0.25rem 0.75rem',
                              background: '#10b981',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            Request Refill
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDiscontinue(rx);
                            }}
                            style={{
                              padding: '0.25rem 0.75rem',
                              background: '#dc2626',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            Discontinue
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Prescription Details Modal */}
      {selectedPrescription && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedPrescription(null)}
          title="Prescription Details"
          size="lg"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Medication Info */}
            <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem' }}>
              <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
                Medication Information
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <InfoRow label="Medication Name" value={selectedPrescription.medicationName} />
                {selectedPrescription.genericName && (
                  <InfoRow label="Generic Name" value={selectedPrescription.genericName} />
                )}
                {selectedPrescription.strength && (
                  <InfoRow label="Strength" value={selectedPrescription.strength} />
                )}
                {selectedPrescription.dosageForm && (
                  <InfoRow label="Dosage Form" value={selectedPrescription.dosageForm} />
                )}
              </div>
            </div>

            {/* Directions */}
            <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem' }}>
              <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
                Directions
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <InfoRow label="Sig (Directions)" value={selectedPrescription.sig} />
                </div>
                <InfoRow label="Quantity" value={`${selectedPrescription.quantity} ${selectedPrescription.quantityUnit || ''}`} />
                <InfoRow label="Refills" value={selectedPrescription.refills} />
                {selectedPrescription.daysSupply && (
                  <InfoRow label="Days Supply" value={selectedPrescription.daysSupply} />
                )}
                {selectedPrescription.daw && (
                  <InfoRow label="DAW" value="Dispense As Written" />
                )}
              </div>
            </div>

            {/* Prescriber & Pharmacy */}
            <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem' }}>
              <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
                Prescriber & Pharmacy
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <InfoRow label="Prescriber" value={selectedPrescription.providerName || 'Unknown'} />
                <InfoRow label="Pharmacy" value={selectedPrescription.pharmacyName || 'Not specified'} />
                {selectedPrescription.pharmacyPhone && (
                  <InfoRow label="Pharmacy Phone" value={selectedPrescription.pharmacyPhone} />
                )}
                {selectedPrescription.pharmacyAddress && (
                  <InfoRow label="Pharmacy Address" value={selectedPrescription.pharmacyAddress} />
                )}
              </div>
            </div>

            {/* Status & Dates */}
            <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem' }}>
              <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
                Status & Dates
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <InfoRow label="Status" value={selectedPrescription.status} />
                <InfoRow
                  label="Written Date"
                  value={formatDate(selectedPrescription.writtenDate || selectedPrescription.createdAt)}
                />
                {selectedPrescription.sentAt && (
                  <InfoRow label="Sent Date" value={formatDate(selectedPrescription.sentAt)} />
                )}
                {selectedPrescription.transmittedAt && (
                  <InfoRow label="Transmitted Date" value={formatDate(selectedPrescription.transmittedAt)} />
                )}
              </div>
            </div>

            {/* Additional Info */}
            {(selectedPrescription.indication || selectedPrescription.notes || selectedPrescription.isControlled) && (
              <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem' }}>
                <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
                  Additional Information
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {selectedPrescription.indication && (
                    <InfoRow label="Indication" value={selectedPrescription.indication} />
                  )}
                  {selectedPrescription.isControlled && (
                    <InfoRow
                      label="Controlled Substance"
                      value={selectedPrescription.deaSchedule
                        ? `Schedule ${selectedPrescription.deaSchedule}`
                        : 'Yes'
                      }
                    />
                  )}
                  {selectedPrescription.notes && (
                    <InfoRow label="Notes" value={selectedPrescription.notes} />
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
              <button
                type="button"
                onClick={() => setSelectedPrescription(null)}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#f3f4f6',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.875rem'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
