// This file contains the enhanced Insurance components to be integrated into PatientDetailPage.tsx
// Copy the InsuranceTab and EditInsuranceModal components from this file

import { useEffect, useState } from 'react';
import type { Patient, PolicyType, EligibilityStatus, RelationshipToInsured } from '../types';
import { Modal } from '../components/ui';
import { API_BASE_URL, TENANT_HEADER_NAME } from '../api';

// Helper component for displaying info rows
function InfoRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>{label}</div>
      <div style={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>{value}</div>
    </div>
  );
}

// Enhanced Insurance Tab Component
export function InsuranceTab({ patient, onEdit }: { patient: Patient; onEdit: () => void }) {
  const insuranceDetails = (patient as any).insuranceDetails || {};
  const primary = insuranceDetails.primary || {};
  const secondary = insuranceDetails.secondary || {};
  const payerContacts = insuranceDetails.payerContacts || [];

  const handleCheckEligibility = () => {
    alert('Eligibility check integration coming soon');
  };

  return (
    <div style={{ maxWidth: '1200px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div className="ema-section-header">Insurance Information</div>
        <button type="button" className="ema-action-btn" onClick={onEdit}>
          <span className="icon"></span>
          Edit Insurance
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Primary Insurance */}
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ background: '#0369a1', color: '#fff', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>PRIMARY</span>
            Primary Insurance
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
            <InfoRow label="Payer" value={primary.payer || 'Not provided'} />
            <InfoRow label="Plan Name" value={primary.planName || 'Not provided'} />
            <InfoRow label="Policy Number" value={primary.policyNumber || 'Not provided'} />
            <InfoRow label="Group Number" value={primary.groupNumber || 'Not provided'} />
            <InfoRow label="Policy Type" value={primary.policyType || 'Not specified'} />
            <InfoRow label="Patient Name on Card" value={primary.patientNameOnCard || (primary.usePatientName ? `${patient.firstName} ${patient.lastName}` : 'Not provided')} />
            <InfoRow label="Signature on File" value={primary.signatureOnFile ? 'Yes' : 'No'} />
            <InfoRow label="Relationship to Insured" value={primary.relationshipToInsured || 'Self'} />
            {primary.relationshipToInsured && primary.relationshipToInsured !== 'Self' && (
              <>
                <InfoRow label="Policy Holder Name" value={`${primary.policyHolderFirstName || ''} ${primary.policyHolderMiddle || ''} ${primary.policyHolderLastName || ''}`.trim() || 'Not provided'} />
                <InfoRow label="Policy Holder DOB" value={primary.policyHolderDob ? new Date(primary.policyHolderDob).toLocaleDateString() : 'Not provided'} />
                <InfoRow label="Policy Holder SSN" value={primary.policyHolderSsn ? `***-**-${primary.policyHolderSsn.slice(-4)}` : 'Not provided'} />
              </>
            )}
          </div>
          {primary.notes && (
            <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#fff', borderRadius: '4px' }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Notes</div>
              <div style={{ fontSize: '0.875rem', color: '#374151' }}>{primary.notes}</div>
            </div>
          )}
          {(primary.requiresReferralAuth || primary.requiresInPatientPreCert || primary.requiresOutPatientPreAuth) && (
            <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#fff', borderRadius: '4px' }}>
              <h4 style={{ fontSize: '0.875rem', fontWeight: 600, margin: '0 0 0.5rem 0' }}>Authorization Requirements</h4>
              <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.875rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input type="checkbox" checked={!!primary.requiresReferralAuth} disabled />
                  Referral/Auth for office visit
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input type="checkbox" checked={!!primary.requiresInPatientPreCert} disabled />
                  Pre-Cert for In-Patient Services
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input type="checkbox" checked={!!primary.requiresOutPatientPreAuth} disabled />
                  Pre-Auth for Out-Patient Services
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Primary Eligibility Information */}
        {primary.eligibilityStatus && (
          <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem' }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
              Primary Eligibility Information
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
              <InfoRow label="Eligibility Status" value={primary.eligibilityStatus || 'Unknown/Error'} />
              <InfoRow label="Co-Pay Amount" value={primary.copayAmount ? `$${primary.copayAmount}` : 'Not provided'} />
              <InfoRow label="Co-Insurance" value={primary.coinsurancePercent ? `${primary.coinsurancePercent}%` : 'Not provided'} />
              <InfoRow label="Deductible" value={primary.deductible ? `$${primary.deductible}` : 'Not provided'} />
              <InfoRow label="Remaining Deductible" value={primary.remainingDeductible !== undefined ? `$${primary.remainingDeductible}` : 'Not provided'} />
              <InfoRow label="Out of Pocket" value={primary.outOfPocket ? `$${primary.outOfPocket}` : 'Not provided'} />
              <InfoRow label="Remaining OOP" value={primary.remainingOutOfPocket !== undefined ? `$${primary.remainingOutOfPocket}` : 'Not provided'} />
              <InfoRow label="Policy Effective Date" value={primary.policyEffectiveDate ? new Date(primary.policyEffectiveDate).toLocaleDateString() : 'Not provided'} />
              <InfoRow label="Policy End Date" value={primary.policyEndDate ? new Date(primary.policyEndDate).toLocaleDateString() : 'Not provided'} />
            </div>
          </div>
        )}

        {/* Primary Insurance Card Images */}
        {(primary.cardFrontUrl || primary.cardBackUrl) && (
          <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem' }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
              Primary Insurance Card Images
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <p style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem', color: '#6b7280' }}>Front</p>
                {primary.cardFrontUrl ? (
                  <img src={primary.cardFrontUrl} alt="Primary insurance card front" style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '4px' }} />
                ) : (
                  <div style={{ padding: '3rem', background: '#fff', border: '1px dashed #d1d5db', borderRadius: '4px', textAlign: 'center', color: '#9ca3af' }}>
                    No image uploaded
                  </div>
                )}
              </div>
              <div>
                <p style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem', color: '#6b7280' }}>Back</p>
                {primary.cardBackUrl ? (
                  <img src={primary.cardBackUrl} alt="Primary insurance card back" style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '4px' }} />
                ) : (
                  <div style={{ padding: '3rem', background: '#fff', border: '1px dashed #d1d5db', borderRadius: '4px', textAlign: 'center', color: '#9ca3af' }}>
                    No image uploaded
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Secondary Insurance */}
        {(secondary.payer || secondary.planName || secondary.policyNumber) && (
          <>
            <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem' }}>
              <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ background: '#6b7280', color: '#fff', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>SECONDARY</span>
                Secondary Insurance
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
                <InfoRow label="Payer" value={secondary.payer || 'Not provided'} />
                <InfoRow label="Plan Name" value={secondary.planName || 'Not provided'} />
                <InfoRow label="Policy Number" value={secondary.policyNumber || 'Not provided'} />
                <InfoRow label="Group Number" value={secondary.groupNumber || 'Not provided'} />
                <InfoRow label="Policy Type" value={secondary.policyType || 'Not specified'} />
                <InfoRow label="Patient Name on Card" value={secondary.patientNameOnCard || (secondary.usePatientName ? `${patient.firstName} ${patient.lastName}` : 'Not provided')} />
                <InfoRow label="Signature on File" value={secondary.signatureOnFile ? 'Yes' : 'No'} />
                <InfoRow label="Relationship to Insured" value={secondary.relationshipToInsured || 'Self'} />
                {secondary.relationshipToInsured && secondary.relationshipToInsured !== 'Self' && (
                  <>
                    <InfoRow label="Policy Holder Name" value={`${secondary.policyHolderFirstName || ''} ${secondary.policyHolderMiddle || ''} ${secondary.policyHolderLastName || ''}`.trim() || 'Not provided'} />
                    <InfoRow label="Policy Holder DOB" value={secondary.policyHolderDob ? new Date(secondary.policyHolderDob).toLocaleDateString() : 'Not provided'} />
                    <InfoRow label="Policy Holder SSN" value={secondary.policyHolderSsn ? `***-**-${secondary.policyHolderSsn.slice(-4)}` : 'Not provided'} />
                  </>
                )}
              </div>
              {secondary.notes && (
                <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#fff', borderRadius: '4px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Notes</div>
                  <div style={{ fontSize: '0.875rem', color: '#374151' }}>{secondary.notes}</div>
                </div>
              )}
            </div>

            {/* Secondary Insurance Card Images */}
            {(secondary.cardFrontUrl || secondary.cardBackUrl) && (
              <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem' }}>
                <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
                  Secondary Insurance Card Images
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <p style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem', color: '#6b7280' }}>Front</p>
                    {secondary.cardFrontUrl ? (
                      <img src={secondary.cardFrontUrl} alt="Secondary insurance card front" style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '4px' }} />
                    ) : (
                      <div style={{ padding: '3rem', background: '#fff', border: '1px dashed #d1d5db', borderRadius: '4px', textAlign: 'center', color: '#9ca3af' }}>
                        No image uploaded
                      </div>
                    )}
                  </div>
                  <div>
                    <p style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem', color: '#6b7280' }}>Back</p>
                    {secondary.cardBackUrl ? (
                      <img src={secondary.cardBackUrl} alt="Secondary insurance card back" style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '4px' }} />
                    ) : (
                      <div style={{ padding: '3rem', background: '#fff', border: '1px dashed #d1d5db', borderRadius: '4px', textAlign: 'center', color: '#9ca3af' }}>
                        No image uploaded
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Payer Contact Information */}
        {payerContacts.length > 0 && (
          <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem' }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
              Payer Contact Information
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
              {payerContacts.map((contact: any, idx: number) => (
                <div key={idx} style={{ background: '#fff', padding: '1rem', borderRadius: '4px', border: '1px solid #e5e7eb' }}>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: '#0369a1' }}>
                    {contact.contactType}
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
                    {contact.phone && <div>Phone: {contact.phone}</div>}
                    {contact.fax && <div>Fax: {contact.fax}</div>}
                    {contact.email && <div>Email: {contact.email}</div>}
                    {contact.address && <div>Address: {contact.address}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button type="button" className="ema-action-btn" onClick={handleCheckEligibility}>
            <span className="icon"></span>
            Check Eligibility
          </button>
        </div>
      </div>
    </div>
  );
}

// Full EditInsuranceModal Component
export function EditInsuranceModal({
  isOpen,
  onClose,
  patient,
  onSave,
  session
}: {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient | null;
  onSave: () => void;
  session: any;
}) {
  const [activeTab, setActiveTab] = useState<'primary' | 'secondary' | 'contacts'>('primary');

  // Primary insurance state
  const [primaryPayer, setPrimaryPayer] = useState('');
  const [primaryPlanName, setPrimaryPlanName] = useState('');
  const [primaryPolicyNumber, setPrimaryPolicyNumber] = useState('');
  const [primaryGroupNumber, setPrimaryGroupNumber] = useState('');
  const [primaryPolicyType, setPrimaryPolicyType] = useState<PolicyType | ''>('');
  const [primaryNotes, setPrimaryNotes] = useState('');
  const [primaryRequiresReferralAuth, setPrimaryRequiresReferralAuth] = useState(false);
  const [primaryRequiresInPatientPreCert, setPrimaryRequiresInPatientPreCert] = useState(false);
  const [primaryRequiresOutPatientPreAuth, setPrimaryRequiresOutPatientPreAuth] = useState(false);
  const [primaryUsePatientName, setPrimaryUsePatientName] = useState(true);
  const [primaryPatientNameOnCard, setPrimaryPatientNameOnCard] = useState('');
  const [primarySignatureOnFile, setPrimarySignatureOnFile] = useState(false);
  const [primaryRelationshipToInsured, setPrimaryRelationshipToInsured] = useState<RelationshipToInsured>('Self');
  const [primaryPolicyHolderFirstName, setPrimaryPolicyHolderFirstName] = useState('');
  const [primaryPolicyHolderMiddle, setPrimaryPolicyHolderMiddle] = useState('');
  const [primaryPolicyHolderLastName, setPrimaryPolicyHolderLastName] = useState('');
  const [primaryPolicyHolderDob, setPrimaryPolicyHolderDob] = useState('');
  const [primaryPolicyHolderSsn, setPrimaryPolicyHolderSsn] = useState('');
  const [primaryEligibilityStatus, setPrimaryEligibilityStatus] = useState<EligibilityStatus>('Unknown/Error');
  const [primaryCopayAmount, setPrimaryCopayAmount] = useState('');
  const [primaryCoinsurancePercent, setPrimaryCoinsurancePercent] = useState('');
  const [primaryDeductible, setPrimaryDeductible] = useState('');
  const [primaryRemainingDeductible, setPrimaryRemainingDeductible] = useState('');
  const [primaryOutOfPocket, setPrimaryOutOfPocket] = useState('');
  const [primaryRemainingOutOfPocket, setPrimaryRemainingOutOfPocket] = useState('');
  const [primaryPolicyEffectiveDate, setPrimaryPolicyEffectiveDate] = useState('');
  const [primaryPolicyEndDate, setPrimaryPolicyEndDate] = useState('');
  const [primaryCardFrontUrl, setPrimaryCardFrontUrl] = useState('');
  const [primaryCardBackUrl, setPrimaryCardBackUrl] = useState('');

  // Secondary insurance state
  const [secondaryPayer, setSecondaryPayer] = useState('');
  const [secondaryPlanName, setSecondaryPlanName] = useState('');
  const [secondaryPolicyNumber, setSecondaryPolicyNumber] = useState('');
  const [secondaryGroupNumber, setSecondaryGroupNumber] = useState('');
  const [secondaryPolicyType, setSecondaryPolicyType] = useState<PolicyType | ''>('');
  const [secondaryNotes, setSecondaryNotes] = useState('');
  const [secondaryUsePatientName, setSecondaryUsePatientName] = useState(true);
  const [secondaryPatientNameOnCard, setSecondaryPatientNameOnCard] = useState('');
  const [secondarySignatureOnFile, setSecondarySignatureOnFile] = useState(false);
  const [secondaryRelationshipToInsured, setSecondaryRelationshipToInsured] = useState<RelationshipToInsured>('Self');
  const [secondaryPolicyHolderFirstName, setSecondaryPolicyHolderFirstName] = useState('');
  const [secondaryPolicyHolderMiddle, setSecondaryPolicyHolderMiddle] = useState('');
  const [secondaryPolicyHolderLastName, setSecondaryPolicyHolderLastName] = useState('');
  const [secondaryPolicyHolderDob, setSecondaryPolicyHolderDob] = useState('');
  const [secondaryPolicyHolderSsn, setSecondaryPolicyHolderSsn] = useState('');
  const [secondaryCardFrontUrl, setSecondaryCardFrontUrl] = useState('');
  const [secondaryCardBackUrl, setSecondaryCardBackUrl] = useState('');

  // Payer contacts state
  const [payerContacts, setPayerContacts] = useState<any[]>([]);

  const policyTypes: PolicyType[] = [
    'EPO',
    'Group Health Plan (GHP)',
    'HMO',
    'IPA',
    'Medicare Advantage',
    'PPO',
    'POS',
    'Commercial - Other',
    'ACA Exchange',
    'CHAMPVA',
    'CHIP',
    'FECA',
    'Medicare',
    'Medicaid',
    'Tricare',
    'Government - Other'
  ];

  useEffect(() => {
    if (patient && isOpen) {
      const insuranceDetails = (patient as any).insuranceDetails || {};
      const primary = insuranceDetails.primary || {};
      const secondary = insuranceDetails.secondary || {};
      const contacts = insuranceDetails.payerContacts || [];

      // Load primary insurance
      setPrimaryPayer(primary.payer || '');
      setPrimaryPlanName(primary.planName || '');
      setPrimaryPolicyNumber(primary.policyNumber || '');
      setPrimaryGroupNumber(primary.groupNumber || '');
      setPrimaryPolicyType(primary.policyType || '');
      setPrimaryNotes(primary.notes || '');
      setPrimaryRequiresReferralAuth(primary.requiresReferralAuth || false);
      setPrimaryRequiresInPatientPreCert(primary.requiresInPatientPreCert || false);
      setPrimaryRequiresOutPatientPreAuth(primary.requiresOutPatientPreAuth || false);
      setPrimaryUsePatientName(primary.usePatientName !== false);
      setPrimaryPatientNameOnCard(primary.patientNameOnCard || '');
      setPrimarySignatureOnFile(primary.signatureOnFile || false);
      setPrimaryRelationshipToInsured(primary.relationshipToInsured || 'Self');
      setPrimaryPolicyHolderFirstName(primary.policyHolderFirstName || '');
      setPrimaryPolicyHolderMiddle(primary.policyHolderMiddle || '');
      setPrimaryPolicyHolderLastName(primary.policyHolderLastName || '');
      setPrimaryPolicyHolderDob(primary.policyHolderDob || '');
      setPrimaryPolicyHolderSsn(primary.policyHolderSsn || '');
      setPrimaryEligibilityStatus(primary.eligibilityStatus || 'Unknown/Error');
      setPrimaryCopayAmount(primary.copayAmount?.toString() || '');
      setPrimaryCoinsurancePercent(primary.coinsurancePercent?.toString() || '');
      setPrimaryDeductible(primary.deductible?.toString() || '');
      setPrimaryRemainingDeductible(primary.remainingDeductible?.toString() || '');
      setPrimaryOutOfPocket(primary.outOfPocket?.toString() || '');
      setPrimaryRemainingOutOfPocket(primary.remainingOutOfPocket?.toString() || '');
      setPrimaryPolicyEffectiveDate(primary.policyEffectiveDate || '');
      setPrimaryPolicyEndDate(primary.policyEndDate || '');
      setPrimaryCardFrontUrl(primary.cardFrontUrl || '');
      setPrimaryCardBackUrl(primary.cardBackUrl || '');

      // Load secondary insurance
      setSecondaryPayer(secondary.payer || '');
      setSecondaryPlanName(secondary.planName || '');
      setSecondaryPolicyNumber(secondary.policyNumber || '');
      setSecondaryGroupNumber(secondary.groupNumber || '');
      setSecondaryPolicyType(secondary.policyType || '');
      setSecondaryNotes(secondary.notes || '');
      setSecondaryUsePatientName(secondary.usePatientName !== false);
      setSecondaryPatientNameOnCard(secondary.patientNameOnCard || '');
      setSecondarySignatureOnFile(secondary.signatureOnFile || false);
      setSecondaryRelationshipToInsured(secondary.relationshipToInsured || 'Self');
      setSecondaryPolicyHolderFirstName(secondary.policyHolderFirstName || '');
      setSecondaryPolicyHolderMiddle(secondary.policyHolderMiddle || '');
      setSecondaryPolicyHolderLastName(secondary.policyHolderLastName || '');
      setSecondaryPolicyHolderDob(secondary.policyHolderDob || '');
      setSecondaryPolicyHolderSsn(secondary.policyHolderSsn || '');
      setSecondaryCardFrontUrl(secondary.cardFrontUrl || '');
      setSecondaryCardBackUrl(secondary.cardBackUrl || '');

      // Load payer contacts
      setPayerContacts(contacts);
    }
  }, [patient, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !patient) return;

    try {
      const insuranceDetails = {
        primary: {
          payer: primaryPayer,
          planName: primaryPlanName,
          policyNumber: primaryPolicyNumber,
          groupNumber: primaryGroupNumber,
          policyType: primaryPolicyType,
          notes: primaryNotes,
          requiresReferralAuth: primaryRequiresReferralAuth,
          requiresInPatientPreCert: primaryRequiresInPatientPreCert,
          requiresOutPatientPreAuth: primaryRequiresOutPatientPreAuth,
          usePatientName: primaryUsePatientName,
          patientNameOnCard: primaryUsePatientName ? '' : primaryPatientNameOnCard,
          signatureOnFile: primarySignatureOnFile,
          relationshipToInsured: primaryRelationshipToInsured,
          policyHolderFirstName: primaryRelationshipToInsured !== 'Self' ? primaryPolicyHolderFirstName : '',
          policyHolderMiddle: primaryRelationshipToInsured !== 'Self' ? primaryPolicyHolderMiddle : '',
          policyHolderLastName: primaryRelationshipToInsured !== 'Self' ? primaryPolicyHolderLastName : '',
          policyHolderDob: primaryRelationshipToInsured !== 'Self' ? primaryPolicyHolderDob : '',
          policyHolderSsn: primaryRelationshipToInsured !== 'Self' ? primaryPolicyHolderSsn : '',
          eligibilityStatus: primaryEligibilityStatus,
          copayAmount: primaryCopayAmount ? parseFloat(primaryCopayAmount) : undefined,
          coinsurancePercent: primaryCoinsurancePercent ? parseFloat(primaryCoinsurancePercent) : undefined,
          deductible: primaryDeductible ? parseFloat(primaryDeductible) : undefined,
          remainingDeductible: primaryRemainingDeductible ? parseFloat(primaryRemainingDeductible) : undefined,
          outOfPocket: primaryOutOfPocket ? parseFloat(primaryOutOfPocket) : undefined,
          remainingOutOfPocket: primaryRemainingOutOfPocket ? parseFloat(primaryRemainingOutOfPocket) : undefined,
          policyEffectiveDate: primaryPolicyEffectiveDate || undefined,
          policyEndDate: primaryPolicyEndDate || undefined,
          cardFrontUrl: primaryCardFrontUrl || undefined,
          cardBackUrl: primaryCardBackUrl || undefined,
        },
        secondary: {
          payer: secondaryPayer,
          planName: secondaryPlanName,
          policyNumber: secondaryPolicyNumber,
          groupNumber: secondaryGroupNumber,
          policyType: secondaryPolicyType,
          notes: secondaryNotes,
          usePatientName: secondaryUsePatientName,
          patientNameOnCard: secondaryUsePatientName ? '' : secondaryPatientNameOnCard,
          signatureOnFile: secondarySignatureOnFile,
          relationshipToInsured: secondaryRelationshipToInsured,
          policyHolderFirstName: secondaryRelationshipToInsured !== 'Self' ? secondaryPolicyHolderFirstName : '',
          policyHolderMiddle: secondaryRelationshipToInsured !== 'Self' ? secondaryPolicyHolderMiddle : '',
          policyHolderLastName: secondaryRelationshipToInsured !== 'Self' ? secondaryPolicyHolderLastName : '',
          policyHolderDob: secondaryRelationshipToInsured !== 'Self' ? secondaryPolicyHolderDob : '',
          policyHolderSsn: secondaryRelationshipToInsured !== 'Self' ? secondaryPolicyHolderSsn : '',
          cardFrontUrl: secondaryCardFrontUrl || undefined,
          cardBackUrl: secondaryCardBackUrl || undefined,
        },
        payerContacts: payerContacts
      };

      const res = await fetch(`${API_BASE_URL}/api/patients/${patient.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.accessToken}`,
          [TENANT_HEADER_NAME]: session.tenantId,
        },
        body: JSON.stringify({ insuranceDetails }),
      });

      if (!res.ok) throw new Error('Failed to update insurance');

      onSave();
      onClose();
    } catch (error) {
      console.error('Error updating insurance:', error);
      alert('Failed to update insurance information');
    }
  };

  const addPayerContact = () => {
    setPayerContacts([...payerContacts, {
      contactType: 'Customer Service',
      phone: '',
      fax: '',
      email: '',
      address: ''
    }]);
  };

  const updatePayerContact = (index: number, field: string, value: string) => {
    const updated = [...payerContacts];
    updated[index][field] = value;
    setPayerContacts(updated);
  };

  const removePayerContact = (index: number) => {
    setPayerContacts(payerContacts.filter((_, i) => i !== index));
  };

  const inputStyle = {
    width: '100%',
    padding: '0.5rem',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '0.875rem'
  };

  const labelStyle = {
    display: 'block',
    fontSize: '0.875rem',
    fontWeight: 500,
    marginBottom: '0.25rem',
    color: '#374151'
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Insurance Information" size="xl">
      <form onSubmit={handleSubmit}>
        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb', marginBottom: '1.5rem' }}>
          <button
            type="button"
            onClick={() => setActiveTab('primary')}
            style={{
              padding: '0.75rem 1.5rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'primary' ? '3px solid #0369a1' : '3px solid transparent',
              color: activeTab === 'primary' ? '#0369a1' : '#6b7280',
              fontWeight: activeTab === 'primary' ? 600 : 400,
              cursor: 'pointer'
            }}
          >
            Primary Insurance
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('secondary')}
            style={{
              padding: '0.75rem 1.5rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'secondary' ? '3px solid #0369a1' : '3px solid transparent',
              color: activeTab === 'secondary' ? '#0369a1' : '#6b7280',
              fontWeight: activeTab === 'secondary' ? 600 : 400,
              cursor: 'pointer'
            }}
          >
            Secondary Insurance
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('contacts')}
            style={{
              padding: '0.75rem 1.5rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'contacts' ? '3px solid #0369a1' : '3px solid transparent',
              color: activeTab === 'contacts' ? '#0369a1' : '#6b7280',
              fontWeight: activeTab === 'contacts' ? 600 : 400,
              cursor: 'pointer'
            }}
          >
            Payer Contacts
          </button>
        </div>

        <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '0.5rem' }}>
          {/* Primary Insurance Tab */}
          {activeTab === 'primary' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Basic Policy Information */}
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: '#374151' }}>
                  Policy Information
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={labelStyle}>Payer</label>
                    <input
                      type="text"
                      value={primaryPayer}
                      onChange={(e) => setPrimaryPayer(e.target.value)}
                      style={inputStyle}
                      placeholder="Enter payer name"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Plan Name</label>
                    <input
                      type="text"
                      value={primaryPlanName}
                      onChange={(e) => setPrimaryPlanName(e.target.value)}
                      style={inputStyle}
                      placeholder="Enter plan name"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Policy Number *</label>
                    <input
                      type="text"
                      value={primaryPolicyNumber}
                      onChange={(e) => setPrimaryPolicyNumber(e.target.value)}
                      style={inputStyle}
                      placeholder="Enter policy number"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Group Number</label>
                    <input
                      type="text"
                      value={primaryGroupNumber}
                      onChange={(e) => setPrimaryGroupNumber(e.target.value)}
                      style={inputStyle}
                      placeholder="Enter group number"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Policy Type *</label>
                    <select
                      value={primaryPolicyType}
                      onChange={(e) => setPrimaryPolicyType(e.target.value as PolicyType)}
                      style={inputStyle}
                    >
                      <option value="">Select policy type...</option>
                      {policyTypes.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>Notes</label>
                    <textarea
                      value={primaryNotes}
                      onChange={(e) => setPrimaryNotes(e.target.value)}
                      style={{ ...inputStyle, minHeight: '80px' }}
                      placeholder="Enter any additional notes"
                    />
                  </div>
                </div>
              </div>

              {/* Authorization Requirements */}
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: '#374151' }}>
                  Authorization Requirements
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={primaryRequiresReferralAuth}
                      onChange={(e) => setPrimaryRequiresReferralAuth(e.target.checked)}
                    />
                    Referral/Authorization for office visit
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={primaryRequiresInPatientPreCert}
                      onChange={(e) => setPrimaryRequiresInPatientPreCert(e.target.checked)}
                    />
                    Pre-Certification for In-Patient Services
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={primaryRequiresOutPatientPreAuth}
                      onChange={(e) => setPrimaryRequiresOutPatientPreAuth(e.target.checked)}
                    />
                    Pre-Authorization for Out-Patient Services
                  </label>
                </div>
              </div>

              {/* Patient Name */}
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: '#374151' }}>
                  Patient Name (as registered with insurance)
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={primaryUsePatientName}
                      onChange={(e) => setPrimaryUsePatientName(e.target.checked)}
                    />
                    Use patient's name ({patient?.firstName} {patient?.lastName})
                  </label>
                  {!primaryUsePatientName && (
                    <div>
                      <label style={labelStyle}>Custom Name on Card</label>
                      <input
                        type="text"
                        value={primaryPatientNameOnCard}
                        onChange={(e) => setPrimaryPatientNameOnCard(e.target.value)}
                        style={inputStyle}
                        placeholder="Enter name as it appears on card"
                      />
                    </div>
                  )}
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={primarySignatureOnFile}
                      onChange={(e) => setPrimarySignatureOnFile(e.target.checked)}
                    />
                    Signature on File
                  </label>
                </div>
              </div>

              {/* Policy Holder Section */}
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: '#374151' }}>
                  Policy Holder Information
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
                  <div>
                    <label style={labelStyle}>Patient's Relationship to Policy Holder</label>
                    <select
                      value={primaryRelationshipToInsured}
                      onChange={(e) => setPrimaryRelationshipToInsured(e.target.value as RelationshipToInsured)}
                      style={inputStyle}
                    >
                      <option value="Self">Self</option>
                      <option value="Spouse">Spouse</option>
                      <option value="Child">Child</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  {primaryRelationshipToInsured !== 'Self' && (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr', gap: '1rem' }}>
                        <div>
                          <label style={labelStyle}>Policy Holder First Name</label>
                          <input
                            type="text"
                            value={primaryPolicyHolderFirstName}
                            onChange={(e) => setPrimaryPolicyHolderFirstName(e.target.value)}
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label style={labelStyle}>Middle</label>
                          <input
                            type="text"
                            value={primaryPolicyHolderMiddle}
                            onChange={(e) => setPrimaryPolicyHolderMiddle(e.target.value)}
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label style={labelStyle}>Policy Holder Last Name</label>
                          <input
                            type="text"
                            value={primaryPolicyHolderLastName}
                            onChange={(e) => setPrimaryPolicyHolderLastName(e.target.value)}
                            style={inputStyle}
                          />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                          <label style={labelStyle}>Policy Holder Date of Birth</label>
                          <input
                            type="date"
                            value={primaryPolicyHolderDob}
                            onChange={(e) => setPrimaryPolicyHolderDob(e.target.value)}
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label style={labelStyle}>Policy Holder SSN</label>
                          <input
                            type="text"
                            value={primaryPolicyHolderSsn}
                            onChange={(e) => setPrimaryPolicyHolderSsn(e.target.value)}
                            style={inputStyle}
                            placeholder="XXX-XX-XXXX"
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Eligibility Information */}
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: '#374151' }}>
                  Eligibility Information
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={labelStyle}>Eligibility Status</label>
                    <select
                      value={primaryEligibilityStatus}
                      onChange={(e) => setPrimaryEligibilityStatus(e.target.value as EligibilityStatus)}
                      style={inputStyle}
                    >
                      <option value="Unknown/Error">Unknown/Error</option>
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Co-Pay Amount ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={primaryCopayAmount}
                      onChange={(e) => setPrimaryCopayAmount(e.target.value)}
                      style={inputStyle}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Co-Insurance (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={primaryCoinsurancePercent}
                      onChange={(e) => setPrimaryCoinsurancePercent(e.target.value)}
                      style={inputStyle}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Deductible ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={primaryDeductible}
                      onChange={(e) => setPrimaryDeductible(e.target.value)}
                      style={inputStyle}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Remaining Deductible ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={primaryRemainingDeductible}
                      onChange={(e) => setPrimaryRemainingDeductible(e.target.value)}
                      style={inputStyle}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Out of Pocket ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={primaryOutOfPocket}
                      onChange={(e) => setPrimaryOutOfPocket(e.target.value)}
                      style={inputStyle}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Remaining Out of Pocket ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={primaryRemainingOutOfPocket}
                      onChange={(e) => setPrimaryRemainingOutOfPocket(e.target.value)}
                      style={inputStyle}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Policy Effective Date</label>
                    <input
                      type="date"
                      value={primaryPolicyEffectiveDate}
                      onChange={(e) => setPrimaryPolicyEffectiveDate(e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Policy End Date</label>
                    <input
                      type="date"
                      value={primaryPolicyEndDate}
                      onChange={(e) => setPrimaryPolicyEndDate(e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                </div>
              </div>

              {/* Card Images */}
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: '#374151' }}>
                  Card Images
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={labelStyle}>Card Front URL</label>
                    <input
                      type="text"
                      value={primaryCardFrontUrl}
                      onChange={(e) => setPrimaryCardFrontUrl(e.target.value)}
                      style={inputStyle}
                      placeholder="Enter image URL or upload"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Card Back URL</label>
                    <input
                      type="text"
                      value={primaryCardBackUrl}
                      onChange={(e) => setPrimaryCardBackUrl(e.target.value)}
                      style={inputStyle}
                      placeholder="Enter image URL or upload"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Secondary Insurance Tab */}
          {activeTab === 'secondary' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Basic Policy Information */}
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: '#374151' }}>
                  Policy Information
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={labelStyle}>Payer</label>
                    <input
                      type="text"
                      value={secondaryPayer}
                      onChange={(e) => setSecondaryPayer(e.target.value)}
                      style={inputStyle}
                      placeholder="Enter payer name"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Plan Name</label>
                    <input
                      type="text"
                      value={secondaryPlanName}
                      onChange={(e) => setSecondaryPlanName(e.target.value)}
                      style={inputStyle}
                      placeholder="Enter plan name"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Policy Number</label>
                    <input
                      type="text"
                      value={secondaryPolicyNumber}
                      onChange={(e) => setSecondaryPolicyNumber(e.target.value)}
                      style={inputStyle}
                      placeholder="Enter policy number"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Group Number</label>
                    <input
                      type="text"
                      value={secondaryGroupNumber}
                      onChange={(e) => setSecondaryGroupNumber(e.target.value)}
                      style={inputStyle}
                      placeholder="Enter group number"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Policy Type</label>
                    <select
                      value={secondaryPolicyType}
                      onChange={(e) => setSecondaryPolicyType(e.target.value as PolicyType)}
                      style={inputStyle}
                    >
                      <option value="">Select policy type...</option>
                      {policyTypes.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>Notes</label>
                    <textarea
                      value={secondaryNotes}
                      onChange={(e) => setSecondaryNotes(e.target.value)}
                      style={{ ...inputStyle, minHeight: '80px' }}
                      placeholder="Enter any additional notes"
                    />
                  </div>
                </div>
              </div>

              {/* Patient Name */}
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: '#374151' }}>
                  Patient Name (as registered with insurance)
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={secondaryUsePatientName}
                      onChange={(e) => setSecondaryUsePatientName(e.target.checked)}
                    />
                    Use patient's name ({patient?.firstName} {patient?.lastName})
                  </label>
                  {!secondaryUsePatientName && (
                    <div>
                      <label style={labelStyle}>Custom Name on Card</label>
                      <input
                        type="text"
                        value={secondaryPatientNameOnCard}
                        onChange={(e) => setSecondaryPatientNameOnCard(e.target.value)}
                        style={inputStyle}
                        placeholder="Enter name as it appears on card"
                      />
                    </div>
                  )}
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={secondarySignatureOnFile}
                      onChange={(e) => setSecondarySignatureOnFile(e.target.checked)}
                    />
                    Signature on File
                  </label>
                </div>
              </div>

              {/* Policy Holder Section */}
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: '#374151' }}>
                  Policy Holder Information
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
                  <div>
                    <label style={labelStyle}>Patient's Relationship to Policy Holder</label>
                    <select
                      value={secondaryRelationshipToInsured}
                      onChange={(e) => setSecondaryRelationshipToInsured(e.target.value as RelationshipToInsured)}
                      style={inputStyle}
                    >
                      <option value="Self">Self</option>
                      <option value="Spouse">Spouse</option>
                      <option value="Child">Child</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  {secondaryRelationshipToInsured !== 'Self' && (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr', gap: '1rem' }}>
                        <div>
                          <label style={labelStyle}>Policy Holder First Name</label>
                          <input
                            type="text"
                            value={secondaryPolicyHolderFirstName}
                            onChange={(e) => setSecondaryPolicyHolderFirstName(e.target.value)}
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label style={labelStyle}>Middle</label>
                          <input
                            type="text"
                            value={secondaryPolicyHolderMiddle}
                            onChange={(e) => setSecondaryPolicyHolderMiddle(e.target.value)}
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label style={labelStyle}>Policy Holder Last Name</label>
                          <input
                            type="text"
                            value={secondaryPolicyHolderLastName}
                            onChange={(e) => setSecondaryPolicyHolderLastName(e.target.value)}
                            style={inputStyle}
                          />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                          <label style={labelStyle}>Policy Holder Date of Birth</label>
                          <input
                            type="date"
                            value={secondaryPolicyHolderDob}
                            onChange={(e) => setSecondaryPolicyHolderDob(e.target.value)}
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label style={labelStyle}>Policy Holder SSN</label>
                          <input
                            type="text"
                            value={secondaryPolicyHolderSsn}
                            onChange={(e) => setSecondaryPolicyHolderSsn(e.target.value)}
                            style={inputStyle}
                            placeholder="XXX-XX-XXXX"
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Card Images */}
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: '#374151' }}>
                  Card Images
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={labelStyle}>Card Front URL</label>
                    <input
                      type="text"
                      value={secondaryCardFrontUrl}
                      onChange={(e) => setSecondaryCardFrontUrl(e.target.value)}
                      style={inputStyle}
                      placeholder="Enter image URL or upload"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Card Back URL</label>
                    <input
                      type="text"
                      value={secondaryCardBackUrl}
                      onChange={(e) => setSecondaryCardBackUrl(e.target.value)}
                      style={inputStyle}
                      placeholder="Enter image URL or upload"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Payer Contacts Tab */}
          {activeTab === 'contacts' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#374151', margin: 0 }}>
                  Payer Contact Information
                </h3>
                <button
                  type="button"
                  onClick={addPayerContact}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#0369a1',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  + Add Contact
                </button>
              </div>

              {payerContacts.length === 0 ? (
                <div style={{
                  padding: '2rem',
                  textAlign: 'center',
                  color: '#6b7280',
                  background: '#f9fafb',
                  borderRadius: '8px',
                  border: '1px dashed #d1d5db'
                }}>
                  No payer contacts added. Click "Add Contact" to add one.
                </div>
              ) : (
                payerContacts.map((contact, index) => (
                  <div key={index} style={{
                    padding: '1rem',
                    background: '#f9fafb',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151', margin: 0 }}>
                        Contact {index + 1}
                      </h4>
                      <button
                        type="button"
                        onClick={() => removePayerContact(index)}
                        style={{
                          padding: '0.25rem 0.5rem',
                          background: '#ef4444',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.75rem'
                        }}
                      >
                        Remove
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={labelStyle}>Contact Type</label>
                        <select
                          value={contact.contactType}
                          onChange={(e) => updatePayerContact(index, 'contactType', e.target.value)}
                          style={inputStyle}
                        >
                          <option value="Customer Service">Customer Service</option>
                          <option value="Claims">Claims</option>
                          <option value="Appeals">Appeals</option>
                          <option value="Precertification">Precertification</option>
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Phone</label>
                        <input
                          type="text"
                          value={contact.phone}
                          onChange={(e) => updatePayerContact(index, 'phone', e.target.value)}
                          style={inputStyle}
                          placeholder="(555) 555-5555"
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Fax</label>
                        <input
                          type="text"
                          value={contact.fax}
                          onChange={(e) => updatePayerContact(index, 'fax', e.target.value)}
                          style={inputStyle}
                          placeholder="(555) 555-5555"
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Email</label>
                        <input
                          type="email"
                          value={contact.email}
                          onChange={(e) => updatePayerContact(index, 'email', e.target.value)}
                          style={inputStyle}
                          placeholder="contact@insurer.com"
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Address</label>
                        <input
                          type="text"
                          value={contact.address}
                          onChange={(e) => updatePayerContact(index, 'address', e.target.value)}
                          style={inputStyle}
                          placeholder="123 Main St, City, ST 12345"
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Form Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #e5e7eb' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem',
              background: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            style={{
              padding: '0.5rem 1rem',
              background: '#0369a1',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 500
            }}
          >
            Save Changes
          </button>
        </div>
      </form>
    </Modal>
  );
}
