# E-Prescribing Integration Guide

## Quick Start: Integrating eRx Components into PrescriptionsPage

This guide shows how to enhance the existing `/frontend/src/pages/PrescriptionsPage.tsx` with the new eRx components.

---

## Step 1: Import New Components and APIs

Add these imports to the top of `PrescriptionsPage.tsx`:

```typescript
import { DrugSearchAutocomplete } from '../components/DrugSearchAutocomplete';
import { PharmacySearchModal } from '../components/PharmacySearchModal';
import { DrugInteractionWarnings } from '../components/DrugInteractionWarnings';
import {
  performSafetyCheck,
  checkFormulary,
  getCurrentMedications,
  Drug,
  DrugInteraction,
  AllergyWarning,
} from '../api-erx';
```

---

## Step 2: Add State for New Features

Add these state variables to your component:

```typescript
const [selectedDrug, setSelectedDrug] = useState<Drug | null>(null);
const [selectedPharmacy, setSelectedPharmacy] = useState<any>(null);
const [isPharmacyModalOpen, setIsPharmacyModalOpen] = useState(false);
const [drugInteractions, setDrugInteractions] = useState<DrugInteraction[]>([]);
const [allergyWarnings, setAllergyWarnings] = useState<AllergyWarning[]>([]);
const [formularyInfo, setFormularyInfo] = useState<any>(null);
const [isCheckingSafety, setIsCheckingSafety] = useState(false);
const [currentMedications, setCurrentMedications] = useState<any[]>([]);
```

---

## Step 3: Replace Medication Name Input

**BEFORE:**
```tsx
<input
  type="text"
  name="medicationName"
  value={formData.medicationName}
  onChange={handleInputChange}
  placeholder="Enter medication name"
/>
```

**AFTER:**
```tsx
<DrugSearchAutocomplete
  onSelect={handleDrugSelect}
  placeholder="Search medications (e.g., Tretinoin, Clobetasol...)"
  category={undefined} // or specific category like "topical-steroid"
/>
```

Add the handler:
```typescript
const handleDrugSelect = async (drug: Drug) => {
  setSelectedDrug(drug);

  // Auto-fill form fields
  setFormData({
    ...formData,
    medicationName: drug.name,
    genericName: drug.generic_name || '',
    strength: drug.strength || '',
    dosageForm: drug.dosage_form || '',
    isControlled: drug.is_controlled,
    deaSchedule: drug.dea_schedule || '',
    sig: drug.typical_sig || '',
  });

  // Check for safety issues
  if (currentPatientId) {
    setIsCheckingSafety(true);
    try {
      const { session } = useAuth();
      const safety = await performSafetyCheck(
        session!.tenantId,
        session!.accessToken,
        drug.name,
        currentPatientId
      );

      setDrugInteractions(safety.drugInteractions);
      setAllergyWarnings(safety.allergyWarnings);

      // Check formulary if we have NDC
      if (drug.ndc) {
        const formulary = await checkFormulary(
          session!.tenantId,
          session!.accessToken,
          drug.name,
          drug.ndc
        );
        setFormularyInfo(formulary);
      }
    } catch (error) {
      console.error('Error checking safety:', error);
    } finally {
      setIsCheckingSafety(false);
    }
  }
};
```

---

## Step 4: Replace Pharmacy Selection

**BEFORE:**
```tsx
<select
  name="pharmacyId"
  value={formData.pharmacyId}
  onChange={handleInputChange}
>
  <option value="">Select Pharmacy</option>
  {pharmacies.map(p => (
    <option key={p.id} value={p.id}>{p.name}</option>
  ))}
</select>
```

**AFTER:**
```tsx
<div>
  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
    Pharmacy
  </label>

  {selectedPharmacy ? (
    <div style={{
      padding: '12px',
      border: '1px solid #d1d5db',
      borderRadius: '8px',
      backgroundColor: '#f9fafb'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>
            {selectedPharmacy.name}
          </div>
          <div style={{ fontSize: '13px', color: '#6b7280' }}>
            {selectedPharmacy.street}, {selectedPharmacy.city}, {selectedPharmacy.state}
          </div>
          <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>
            NCPDP: {selectedPharmacy.ncpdp_id}
          </div>
        </div>
        <button
          onClick={() => setSelectedPharmacy(null)}
          style={{
            padding: '4px 12px',
            fontSize: '12px',
            backgroundColor: '#ef4444',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Change
        </button>
      </div>
    </div>
  ) : (
    <button
      onClick={() => setIsPharmacyModalOpen(true)}
      style={{
        width: '100%',
        padding: '12px',
        border: '2px dashed #d1d5db',
        borderRadius: '8px',
        backgroundColor: 'white',
        cursor: 'pointer',
        fontSize: '14px',
        color: '#6b7280'
      }}
    >
      + Select Pharmacy
    </button>
  )}
</div>

<PharmacySearchModal
  isOpen={isPharmacyModalOpen}
  onClose={() => setIsPharmacyModalOpen(false)}
  onSelect={(pharmacy) => {
    setSelectedPharmacy(pharmacy);
    setFormData({
      ...formData,
      pharmacyId: pharmacy.id,
      pharmacyNcpdp: pharmacy.ncpdp_id,
    });
  }}
  patientLocation={{
    city: patientData?.city,
    state: patientData?.state,
    zip: patientData?.zip,
  }}
/>
```

---

## Step 5: Add Safety Warnings Display

Add this before the form submit button:

```tsx
{/* Safety Warnings */}
{(drugInteractions.length > 0 || allergyWarnings.length > 0) && (
  <DrugInteractionWarnings
    interactions={drugInteractions}
    allergies={allergyWarnings}
    showDismiss={false}
  />
)}

{/* Formulary Information */}
{formularyInfo && (
  <div style={{
    padding: '12px',
    backgroundColor: formularyInfo.formularyStatus === 'preferred' ? '#ecfdf5' : '#eff6ff',
    border: `1px solid ${formularyInfo.formularyStatus === 'preferred' ? '#10b981' : '#3b82f6'}`,
    borderRadius: '8px',
    marginBottom: '16px'
  }}>
    <div style={{ fontWeight: 600, marginBottom: '4px' }}>
      Insurance Coverage: {formularyInfo.formularyStatus.replace('_', ' ').toUpperCase()}
    </div>
    <div style={{ fontSize: '13px', color: '#6b7280' }}>
      Tier {formularyInfo.tier} -
      {formularyInfo.copayAmount && ` $${formularyInfo.copayAmount} copay`}
      {formularyInfo.requiresPriorAuth && ' - Prior Authorization Required'}
    </div>
    {formularyInfo.alternatives?.length > 0 && (
      <div style={{ marginTop: '8px', fontSize: '12px' }}>
        <strong>Alternatives:</strong>
        {formularyInfo.alternatives.map((alt: any, i: number) => (
          <div key={i} style={{ marginLeft: '12px' }}>
            • {alt.medicationName} (Tier {alt.tier})
          </div>
        ))}
      </div>
    )}
  </div>
)}
```

---

## Step 6: Add Current Medications Sidebar

Add this section to show active medications:

```tsx
<div style={{
  display: 'grid',
  gridTemplateColumns: '1fr 300px',
  gap: '24px'
}}>
  {/* Main form */}
  <div>
    {/* Your existing form */}
  </div>

  {/* Medication History Sidebar */}
  <div style={{
    padding: '16px',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    height: 'fit-content'
  }}>
    <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>
      Current Medications
    </h3>

    {currentMedications.length === 0 ? (
      <div style={{ fontSize: '13px', color: '#6b7280', textAlign: 'center', padding: '20px' }}>
        No active medications
      </div>
    ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {currentMedications.map((med) => (
          <div
            key={med.id}
            style={{
              padding: '10px',
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '6px'
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '2px' }}>
              {med.medication_name}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>
              {med.sig}
            </div>
            {med.refills > 0 && (
              <div style={{ fontSize: '11px', color: '#059669', marginTop: '4px' }}>
                {med.refills} refills remaining
              </div>
            )}
          </div>
        ))}
      </div>
    )}
  </div>
</div>
```

Load current medications when patient is selected:

```typescript
useEffect(() => {
  if (currentPatientId && session) {
    loadCurrentMedications();
  }
}, [currentPatientId, session]);

const loadCurrentMedications = async () => {
  if (!session?.tenantId || !session?.accessToken || !currentPatientId) return;

  try {
    const { medications } = await getCurrentMedications(
      session.tenantId,
      session.accessToken,
      currentPatientId
    );
    setCurrentMedications(medications);
  } catch (error) {
    console.error('Error loading medications:', error);
  }
};
```

---

## Step 7: Update Form Submission

Modify your submit handler to use the selected values:

```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  // Check for critical safety issues
  if (allergyWarnings.length > 0) {
    const confirmed = window.confirm(
      'CRITICAL ALLERGY WARNING: Patient has documented allergy to this medication. Are you sure you want to proceed?'
    );
    if (!confirmed) return;
  }

  const severeInteractions = drugInteractions.filter(i => i.severity === 'severe');
  if (severeInteractions.length > 0) {
    const confirmed = window.confirm(
      `SEVERE DRUG INTERACTION: ${severeInteractions.length} severe interaction(s) detected. Continue?`
    );
    if (!confirmed) return;
  }

  // Prepare prescription data
  const prescriptionData = {
    ...formData,
    patientId: currentPatientId,
    medicationId: selectedDrug?.id,
    pharmacyId: selectedPharmacy?.id,
    pharmacyNcpdp: selectedPharmacy?.ncpdp_id,
  };

  // Submit prescription...
  try {
    const result = await createPrescription(
      session!.tenantId,
      session!.accessToken,
      prescriptionData
    );

    // Optionally send to pharmacy
    if (result.id && selectedPharmacy) {
      await sendElectronicRx(session!.tenantId, session!.accessToken, {
        prescriptionId: result.id,
        pharmacyNcpdp: selectedPharmacy.ncpdp_id,
      });
    }

    // Success!
    toast.success('Prescription created successfully');
    resetForm();
  } catch (error) {
    console.error('Error creating prescription:', error);
    toast.error('Failed to create prescription');
  }
};
```

---

## Complete Example Component

Here's a minimal working example of a prescription form with all eRx features:

```tsx
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { DrugSearchAutocomplete } from '../components/DrugSearchAutocomplete';
import { PharmacySearchModal } from '../components/PharmacySearchModal';
import { DrugInteractionWarnings } from '../components/DrugInteractionWarnings';
import {
  performSafetyCheck,
  getCurrentMedications,
  Drug,
  DrugInteraction,
  AllergyWarning,
} from '../api-erx';
import { createPrescription, sendElectronicRx } from '../api';

export function EnhancedPrescriptionForm({ patientId }: { patientId: string }) {
  const { session } = useAuth();
  const [selectedDrug, setSelectedDrug] = useState<Drug | null>(null);
  const [selectedPharmacy, setSelectedPharmacy] = useState<any>(null);
  const [isPharmacyModalOpen, setIsPharmacyModalOpen] = useState(false);
  const [drugInteractions, setDrugInteractions] = useState<DrugInteraction[]>([]);
  const [allergyWarnings, setAllergyWarnings] = useState<AllergyWarning[]>([]);
  const [currentMedications, setCurrentMedications] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    sig: '',
    quantity: 30,
    refills: 0,
    daysSupply: 30,
    daw: false,
  });

  useEffect(() => {
    loadCurrentMedications();
  }, [patientId]);

  const loadCurrentMedications = async () => {
    if (!session) return;
    try {
      const { medications } = await getCurrentMedications(
        session.tenantId,
        session.accessToken,
        patientId
      );
      setCurrentMedications(medications);
    } catch (error) {
      console.error('Error loading medications:', error);
    }
  };

  const handleDrugSelect = async (drug: Drug) => {
    setSelectedDrug(drug);

    // Auto-fill SIG
    setFormData(prev => ({
      ...prev,
      sig: drug.typical_sig || '',
    }));

    // Check safety
    if (session) {
      try {
        const safety = await performSafetyCheck(
          session.tenantId,
          session.accessToken,
          drug.name,
          patientId
        );
        setDrugInteractions(safety.drugInteractions);
        setAllergyWarnings(safety.allergyWarnings);
      } catch (error) {
        console.error('Error checking safety:', error);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedDrug || !selectedPharmacy || !session) return;

    // Safety confirmations
    if (allergyWarnings.length > 0) {
      if (!window.confirm('CRITICAL ALLERGY WARNING. Continue?')) return;
    }

    try {
      const result = await createPrescription(session.tenantId, session.accessToken, {
        patientId,
        medicationId: selectedDrug.id,
        medicationName: selectedDrug.name,
        pharmacyId: selectedPharmacy.id,
        pharmacyNcpdp: selectedPharmacy.ncpdp_id,
        ...formData,
      });

      await sendElectronicRx(session.tenantId, session.accessToken, {
        prescriptionId: result.id,
        pharmacyNcpdp: selectedPharmacy.ncpdp_id,
      });

      alert('Prescription sent successfully!');
      // Reset form...
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to send prescription');
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
      <DrugSearchAutocomplete
        onSelect={handleDrugSelect}
        placeholder="Search medications..."
      />

      <DrugInteractionWarnings
        interactions={drugInteractions}
        allergies={allergyWarnings}
      />

      <PharmacySearchModal
        isOpen={isPharmacyModalOpen}
        onClose={() => setIsPharmacyModalOpen(false)}
        onSelect={setSelectedPharmacy}
      />

      {/* Rest of form fields... */}

      <button type="submit">Create Prescription</button>
    </form>
  );
}
```

---

## Testing Checklist

- [ ] Drug search returns results for "tretinoin"
- [ ] Selecting a drug auto-fills SIG field
- [ ] Safety check runs when drug is selected
- [ ] Interactions are displayed for problematic combinations (e.g., Isotretinoin + Doxycycline)
- [ ] Pharmacy modal opens and allows search
- [ ] Selecting pharmacy updates form
- [ ] Current medications sidebar loads
- [ ] Form submission creates prescription
- [ ] eRx transmission sends to pharmacy

---

## Styling Notes

All components use **inline styles** (no Tailwind CSS) as specified. You can customize colors and spacing by modifying the style objects directly.

Common color palette used:
- Primary: `#3b82f6` (blue)
- Success: `#10b981` (green)
- Warning: `#f59e0b` (amber)
- Danger: `#dc2626` (red)
- Gray: `#6b7280`

---

## Support

For questions or issues, refer to:
- `ERX_IMPLEMENTATION_SUMMARY.md` - Complete technical documentation
- API route definitions in `/backend/src/routes/erx.ts`
- Component source code in `/frontend/src/components/`

Happy prescribing! 💊
