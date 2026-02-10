/**
 * AllergyForm Component
 *
 * Form for adding or editing patient allergies.
 * Includes common dermatology allergens for quick selection.
 */

import { useState, useEffect } from 'react';
import { X, Search, Plus } from 'lucide-react';
import type { AllergenType, AllergySeverity, PatientAllergy } from './AllergyList';

interface AllergyFormData {
  allergenType: AllergenType;
  allergenName: string;
  rxcui?: string;
  reactionType?: string;
  severity: AllergySeverity;
  onsetDate?: string;
  notes?: string;
  source?: string;
  symptoms?: string[];
  reactionDescription?: string;
}

interface AllergyFormProps {
  initialData?: PatientAllergy | null;
  onSubmit: (data: AllergyFormData) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

interface CommonAllergy {
  name: string;
  rxcui?: string;
  type?: AllergenType;
}

// Common dermatology allergies for quick selection
const commonDrugAllergies: CommonAllergy[] = [
  { name: 'Sulfonamides (Sulfa drugs)', rxcui: '10831' },
  { name: 'Dapsone', rxcui: '3108' },
  { name: 'Doxycycline', rxcui: '3640' },
  { name: 'Minocycline', rxcui: '6922' },
  { name: 'Tetracycline', rxcui: '10395' },
  { name: 'Isotretinoin', rxcui: '6064' },
  { name: 'Penicillin', rxcui: '7984' },
  { name: 'Amoxicillin', rxcui: '723' },
  { name: 'Cephalexin', rxcui: '2176' },
  { name: 'Trimethoprim', rxcui: '10829' },
  { name: 'Methotrexate', rxcui: '6851' },
  { name: 'Hydroxychloroquine', rxcui: '5521' },
  { name: 'Prednisone', rxcui: '8640' },
  { name: 'Lidocaine', rxcui: '6387' },
];

const commonTopicalAllergies: CommonAllergy[] = [
  { name: 'Neomycin' },
  { name: 'Bacitracin' },
  { name: 'Triple Antibiotic Ointment' },
  { name: 'Benzoyl Peroxide' },
  { name: 'Salicylic Acid' },
  { name: 'Hydrocortisone' },
  { name: 'Tretinoin' },
  { name: 'Adapalene' },
  { name: 'Imiquimod' },
  { name: 'Fluorouracil (5-FU)' },
];

const commonOtherAllergies: CommonAllergy[] = [
  { name: 'Latex', type: 'latex' },
  { name: 'Medical Adhesive/Tape', type: 'contact' },
  { name: 'Nickel', type: 'contact' },
  { name: 'Fragrance/Perfume', type: 'contact' },
  { name: 'Formaldehyde', type: 'contact' },
  { name: 'Parabens', type: 'contact' },
  { name: 'Lanolin', type: 'contact' },
  { name: 'Propylene Glycol', type: 'contact' },
  { name: 'Cobalt', type: 'contact' },
  { name: 'Balsam of Peru', type: 'contact' },
];

const reactionTypes = [
  'Anaphylaxis',
  'Rash',
  'Hives/Urticaria',
  'Angioedema',
  'Contact Dermatitis',
  'Fixed Drug Eruption',
  'Drug-Induced Photosensitivity',
  'Stevens-Johnson Syndrome',
  'Pruritus',
  'Nausea/Vomiting',
  'Diarrhea',
  'Respiratory Distress',
  'Other',
];

const severityOptions: { value: AllergySeverity; label: string; description: string }[] = [
  { value: 'mild', label: 'Mild', description: 'Minor symptoms, self-limiting' },
  { value: 'moderate', label: 'Moderate', description: 'Requires treatment, not life-threatening' },
  { value: 'severe', label: 'Severe', description: 'Serious reaction requiring urgent care' },
  { value: 'life_threatening', label: 'Life-Threatening', description: 'Anaphylaxis or severe systemic reaction' },
];

const sourceOptions = [
  { value: 'patient_reported', label: 'Patient Reported' },
  { value: 'chart_review', label: 'Chart Review' },
  { value: 'patch_test', label: 'Patch Testing' },
  { value: 'drug_challenge', label: 'Drug Challenge' },
];

export function AllergyForm({
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
}: AllergyFormProps) {
  const [formData, setFormData] = useState<AllergyFormData>({
    allergenType: 'drug',
    allergenName: '',
    severity: 'moderate',
    source: 'patient_reported',
    symptoms: [],
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [showQuickSelect, setShowQuickSelect] = useState(true);
  const [customSymptom, setCustomSymptom] = useState('');

  useEffect(() => {
    if (initialData) {
      setFormData({
        allergenType: initialData.allergenType,
        allergenName: initialData.allergenName,
        rxcui: initialData.rxcui,
        reactionType: initialData.reactionType,
        severity: initialData.severity,
        onsetDate: initialData.onsetDate,
        notes: initialData.notes,
        source: initialData.source,
      });
      setShowQuickSelect(false);
    }
  }, [initialData]);

  const handleQuickSelect = (allergy: CommonAllergy) => {
    setFormData((prev) => ({
      ...prev,
      allergenName: allergy.name,
      rxcui: allergy.rxcui,
      allergenType: allergy.type || prev.allergenType,
    }));
    setShowQuickSelect(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.allergenName.trim()) return;
    onSubmit(formData);
  };

  const addSymptom = () => {
    if (customSymptom.trim() && !formData.symptoms?.includes(customSymptom.trim())) {
      setFormData((prev) => ({
        ...prev,
        symptoms: [...(prev.symptoms || []), customSymptom.trim()],
      }));
      setCustomSymptom('');
    }
  };

  const removeSymptom = (symptom: string) => {
    setFormData((prev) => ({
      ...prev,
      symptoms: prev.symptoms?.filter((s) => s !== symptom) || [],
    }));
  };

  const getFilteredQuickSelect = () => {
    const term = searchTerm.toLowerCase();
    const allAllergies = [
      ...commonDrugAllergies.map((a) => ({ ...a, category: 'Drug' })),
      ...commonTopicalAllergies.map((a) => ({ ...a, category: 'Topical', type: 'drug' as AllergenType })),
      ...commonOtherAllergies.map((a) => ({ ...a, category: 'Other' })),
    ];

    if (!term) return allAllergies;
    return allAllergies.filter((a) => a.name.toLowerCase().includes(term));
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Quick Select */}
      {showQuickSelect && !initialData && (
        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, color: '#374151' }}>
            Quick Select Common Allergen
          </label>
          <div
            style={{
              position: 'relative',
              marginBottom: '12px',
            }}
          >
            <Search
              size={18}
              style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}
            />
            <input
              type="text"
              placeholder="Search allergens..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px 10px 40px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
              }}
            />
          </div>
          <div
            style={{
              maxHeight: '200px',
              overflowY: 'auto',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              backgroundColor: '#f9fafb',
            }}
          >
            {getFilteredQuickSelect().map((allergy, index) => (
              <button
                key={index}
                type="button"
                onClick={() => handleQuickSelect(allergy)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  textAlign: 'left',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid #e5e7eb',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontWeight: 500 }}>{allergy.name}</span>
                <span style={{ fontSize: '12px', color: '#6b7280' }}>{allergy.category}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowQuickSelect(false)}
            style={{
              marginTop: '8px',
              padding: '8px 12px',
              backgroundColor: 'transparent',
              color: '#3b82f6',
              border: '1px solid #3b82f6',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Enter Custom Allergen
          </button>
        </div>
      )}

      {/* Custom Entry Form */}
      {(!showQuickSelect || initialData) && (
        <>
          {/* Allergen Type */}
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500, color: '#374151' }}>
              Allergen Type *
            </label>
            <select
              value={formData.allergenType}
              onChange={(e) => setFormData((prev) => ({ ...prev, allergenType: e.target.value as AllergenType }))}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
              }}
            >
              <option value="drug">Drug/Medication</option>
              <option value="food">Food</option>
              <option value="environmental">Environmental</option>
              <option value="latex">Latex</option>
              <option value="contact">Contact (Patch Test)</option>
            </select>
          </div>

          {/* Allergen Name */}
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500, color: '#374151' }}>
              Allergen Name *
            </label>
            <input
              type="text"
              value={formData.allergenName}
              onChange={(e) => setFormData((prev) => ({ ...prev, allergenName: e.target.value }))}
              placeholder="Enter allergen name"
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
              }}
            />
          </div>

          {/* Severity */}
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500, color: '#374151' }}>
              Severity *
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
              {severityOptions.map((option) => (
                <label
                  key={option.value}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '12px',
                    border: formData.severity === option.value ? '2px solid #dc2626' : '1px solid #d1d5db',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    backgroundColor: formData.severity === option.value ? '#fef2f2' : 'white',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="radio"
                      name="severity"
                      value={option.value}
                      checked={formData.severity === option.value}
                      onChange={() => setFormData((prev) => ({ ...prev, severity: option.value }))}
                      style={{ margin: 0 }}
                    />
                    <span style={{ fontWeight: 600, fontSize: '14px' }}>{option.label}</span>
                  </div>
                  <span style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                    {option.description}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Reaction Type */}
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500, color: '#374151' }}>
              Reaction Type
            </label>
            <select
              value={formData.reactionType || ''}
              onChange={(e) => setFormData((prev) => ({ ...prev, reactionType: e.target.value || undefined }))}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
              }}
            >
              <option value="">Select reaction type...</option>
              {reactionTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* Symptoms */}
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500, color: '#374151' }}>
              Symptoms
            </label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input
                type="text"
                value={customSymptom}
                onChange={(e) => setCustomSymptom(e.target.value)}
                placeholder="Add symptom..."
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSymptom())}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
              />
              <button
                type="button"
                onClick={addSymptom}
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                <Plus size={18} />
              </button>
            </div>
            {formData.symptoms && formData.symptoms.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {formData.symptoms.map((symptom, index) => (
                  <span
                    key={index}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 8px',
                      backgroundColor: '#f3f4f6',
                      borderRadius: '4px',
                      fontSize: '13px',
                    }}
                  >
                    {symptom}
                    <button
                      type="button"
                      onClick={() => removeSymptom(symptom)}
                      style={{
                        padding: '2px',
                        backgroundColor: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#6b7280',
                      }}
                    >
                      <X size={14} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Source */}
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500, color: '#374151' }}>
              Source
            </label>
            <select
              value={formData.source || 'patient_reported'}
              onChange={(e) => setFormData((prev) => ({ ...prev, source: e.target.value }))}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
              }}
            >
              {sourceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Onset Date */}
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500, color: '#374151' }}>
              Onset Date
            </label>
            <input
              type="date"
              value={formData.onsetDate || ''}
              onChange={(e) => setFormData((prev) => ({ ...prev, onsetDate: e.target.value || undefined }))}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
              }}
            />
          </div>

          {/* Notes */}
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500, color: '#374151' }}>
              Notes
            </label>
            <textarea
              value={formData.notes || ''}
              onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value || undefined }))}
              placeholder="Additional notes about this allergy..."
              rows={3}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                resize: 'vertical',
              }}
            />
          </div>
        </>
      )}

      {/* Form Actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={isLoading}
          style={{
            padding: '10px 20px',
            backgroundColor: 'white',
            color: '#374151',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: 500,
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading || !formData.allergenName.trim()}
          style={{
            padding: '10px 20px',
            backgroundColor: isLoading || !formData.allergenName.trim() ? '#fca5a5' : '#dc2626',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: isLoading || !formData.allergenName.trim() ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: 500,
          }}
        >
          {isLoading ? 'Saving...' : initialData ? 'Update Allergy' : 'Add Allergy'}
        </button>
      </div>
    </form>
  );
}
