import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import type { BodyMarking } from './InteractiveBodyMap';

interface MarkingDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  marking?: BodyMarking | null;
  initialData?: {
    locationCode: string;
    locationX: number;
    locationY: number;
    viewType: 'front' | 'back';
  };
  patientId: string;
  encounterId?: string;
  onSave: (data: MarkingFormData) => Promise<void>;
  onDelete?: (markingId: string) => Promise<void>;
  locations?: Array<{ code: string; name: string; category: string }>;
}

export interface MarkingFormData {
  locationCode: string;
  locationX: number;
  locationY: number;
  viewType: 'front' | 'back';
  markingType: 'lesion' | 'examined' | 'biopsy' | 'excision' | 'injection';
  diagnosisCode?: string;
  diagnosisDescription?: string;
  lesionType?: string;
  lesionSizeMm?: number;
  lesionColor?: string;
  status: 'active' | 'resolved' | 'monitored' | 'biopsied' | 'excised';
  examinedDate?: string;
  resolvedDate?: string;
  description?: string;
  treatmentNotes?: string;
}

// Common lesion types in dermatology
const LESION_TYPES = [
  'Melanoma',
  'Basal Cell Carcinoma',
  'Squamous Cell Carcinoma',
  'Actinic Keratosis',
  'Nevus (Mole)',
  'Seborrheic Keratosis',
  'Acne',
  'Rash',
  'Eczema',
  'Psoriasis',
  'Wart',
  'Cyst',
  'Lipoma',
  'Hemangioma',
  'Other',
];

const LESION_COLORS = [
  'Brown',
  'Black',
  'Red',
  'Pink',
  'White',
  'Yellow',
  'Purple',
  'Blue',
  'Tan',
  'Mixed',
];

export function MarkingDetailModal({
  isOpen,
  onClose,
  marking,
  initialData,
  patientId,
  encounterId,
  onSave,
  onDelete,
  locations = [],
}: MarkingDetailModalProps) {
  const isEditing = !!marking;

  const [formData, setFormData] = useState<MarkingFormData>({
    locationCode: '',
    locationX: 0,
    locationY: 0,
    viewType: 'front',
    markingType: 'lesion',
    status: 'active',
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Initialize form data
  useEffect(() => {
    if (marking) {
      setFormData({
        locationCode: marking.locationCode,
        locationX: marking.locationX,
        locationY: marking.locationY,
        viewType: marking.viewType,
        markingType: marking.markingType,
        diagnosisCode: marking.diagnosisCode,
        diagnosisDescription: marking.diagnosisDescription,
        lesionType: marking.lesionType,
        lesionSizeMm: marking.lesionSizeMm,
        lesionColor: marking.lesionColor,
        status: marking.status,
        examinedDate: marking.examinedDate,
        resolvedDate: marking.resolvedDate,
        description: marking.description,
        treatmentNotes: marking.treatmentNotes,
      });
    } else if (initialData) {
      setFormData({
        ...formData,
        ...initialData,
      });
    }
  }, [marking, initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error('Error saving marking:', error);
      alert('Failed to save marking. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!marking || !onDelete) return;

    setIsDeleting(true);
    try {
      await onDelete(marking.id);
      onClose();
    } catch (error) {
      console.error('Error deleting marking:', error);
      alert('Failed to delete marking. Please try again.');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const updateField = <K extends keyof MarkingFormData>(field: K, value: MarkingFormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const selectedLocation = locations.find((loc) => loc.code === formData.locationCode);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? 'Edit Body Marking' : 'Add Body Marking'} size="lg">
      <form onSubmit={handleSubmit} style={{ maxHeight: '70vh', overflowY: 'auto' }}>
        {/* Location Information */}
        <div style={{ marginBottom: '24px', padding: '16px', background: '#F3F4F6', borderRadius: '8px' }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#374151' }}>Location</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px', color: '#6B7280' }}>
            <div>
              <strong>Region:</strong> {selectedLocation?.name || formData.locationCode}
            </div>
            <div>
              <strong>View:</strong> {formData.viewType === 'front' ? 'Front' : 'Back'}
            </div>
            <div>
              <strong>Coordinates:</strong> ({formData.locationX.toFixed(1)}, {formData.locationY.toFixed(1)})
            </div>
          </div>
        </div>

        {/* Marking Type */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
            Marking Type <span style={{ color: '#EF4444' }}>*</span>
          </label>
          <select
            value={formData.markingType}
            onChange={(e) => updateField('markingType', e.target.value as any)}
            required
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          >
            <option value="lesion">Lesion</option>
            <option value="examined">Examined Area</option>
            <option value="biopsy">Biopsy</option>
            <option value="excision">Excision</option>
            <option value="injection">Injection</option>
          </select>
        </div>

        {/* Status */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
            Status <span style={{ color: '#EF4444' }}>*</span>
          </label>
          <select
            value={formData.status}
            onChange={(e) => updateField('status', e.target.value as any)}
            required
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          >
            <option value="active">Active</option>
            <option value="resolved">Resolved</option>
            <option value="monitored">Monitored</option>
            <option value="biopsied">Biopsied</option>
            <option value="excised">Excised</option>
          </select>
        </div>

        {/* Lesion-specific fields */}
        {formData.markingType === 'lesion' && (
          <>
            {/* Lesion Type */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                Lesion Type
              </label>
              <select
                value={formData.lesionType || ''}
                onChange={(e) => updateField('lesionType', e.target.value || undefined)}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
              >
                <option value="">Select lesion type...</option>
                {LESION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            {/* Size and Color */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                  Size (mm)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={formData.lesionSizeMm || ''}
                  onChange={(e) => updateField('lesionSizeMm', e.target.value ? parseFloat(e.target.value) : undefined)}
                  placeholder="e.g., 5.5"
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '14px',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                  Color
                </label>
                <select
                  value={formData.lesionColor || ''}
                  onChange={(e) => updateField('lesionColor', e.target.value || undefined)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '14px',
                  }}
                >
                  <option value="">Select color...</option>
                  {LESION_COLORS.map((color) => (
                    <option key={color} value={color}>
                      {color}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </>
        )}

        {/* Diagnosis */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
            Diagnosis / ICD-10 Code
          </label>
          <input
            type="text"
            value={formData.diagnosisCode || ''}
            onChange={(e) => updateField('diagnosisCode', e.target.value || undefined)}
            placeholder="e.g., L40.0"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              fontSize: '14px',
              marginBottom: '8px',
            }}
          />
          <input
            type="text"
            value={formData.diagnosisDescription || ''}
            onChange={(e) => updateField('diagnosisDescription', e.target.value || undefined)}
            placeholder="Diagnosis description"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          />
        </div>

        {/* Description */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
            Description
          </label>
          <textarea
            value={formData.description || ''}
            onChange={(e) => updateField('description', e.target.value || undefined)}
            placeholder="Describe the marking, appearance, or clinical notes..."
            rows={3}
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              fontSize: '14px',
              fontFamily: 'inherit',
              resize: 'vertical',
            }}
          />
        </div>

        {/* Treatment Notes */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
            Treatment Notes
          </label>
          <textarea
            value={formData.treatmentNotes || ''}
            onChange={(e) => updateField('treatmentNotes', e.target.value || undefined)}
            placeholder="Treatment plan, medications, procedures..."
            rows={3}
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              fontSize: '14px',
              fontFamily: 'inherit',
              resize: 'vertical',
            }}
          />
        </div>

        {/* Dates */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
              Examined Date
            </label>
            <input
              type="date"
              value={formData.examinedDate || ''}
              onChange={(e) => updateField('examinedDate', e.target.value || undefined)}
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                fontSize: '14px',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
              Resolved Date
            </label>
            <input
              type="date"
              value={formData.resolvedDate || ''}
              onChange={(e) => updateField('resolvedDate', e.target.value || undefined)}
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                fontSize: '14px',
              }}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div
          style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'space-between',
            paddingTop: '16px',
            borderTop: '1px solid #E5E7EB',
          }}
        >
          <div>
            {isEditing && onDelete && (
              <>
                {!showDeleteConfirm ? (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    style={{
                      padding: '10px 20px',
                      border: '1px solid #DC2626',
                      borderRadius: '6px',
                      background: 'white',
                      color: '#DC2626',
                      fontWeight: '500',
                      cursor: 'pointer',
                    }}
                  >
                    Delete
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', color: '#6B7280' }}>Are you sure?</span>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={isDeleting}
                      style={{
                        padding: '6px 12px',
                        border: 'none',
                        borderRadius: '6px',
                        background: '#DC2626',
                        color: 'white',
                        fontWeight: '500',
                        cursor: isDeleting ? 'not-allowed' : 'pointer',
                        opacity: isDeleting ? 0.6 : 1,
                      }}
                    >
                      {isDeleting ? 'Deleting...' : 'Yes, Delete'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      style={{
                        padding: '6px 12px',
                        border: '1px solid #D1D5DB',
                        borderRadius: '6px',
                        background: 'white',
                        color: '#374151',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              style={{
                padding: '10px 20px',
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                background: 'white',
                color: '#374151',
                fontWeight: '500',
                cursor: isSaving ? 'not-allowed' : 'pointer',
                opacity: isSaving ? 0.6 : 1,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              style={{
                padding: '10px 20px',
                border: 'none',
                borderRadius: '6px',
                background: '#6B46C1',
                color: 'white',
                fontWeight: '500',
                cursor: isSaving ? 'not-allowed' : 'pointer',
                opacity: isSaving ? 0.6 : 1,
              }}
            >
              {isSaving ? 'Saving...' : isEditing ? 'Update Marking' : 'Add Marking'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
