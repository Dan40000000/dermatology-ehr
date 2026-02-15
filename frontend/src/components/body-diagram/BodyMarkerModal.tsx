import React, { useState, useEffect } from 'react';
import type { BodyMarker, BodyView } from './AnatomicalBodyDiagram';

interface BodyMarkerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (marker: Omit<BodyMarker, 'id'>) => void;
  onDelete?: () => void;
  marker?: BodyMarker | null;
  position?: { x: number; y: number; view: BodyView };
}

const markerTypes: { value: BodyMarker['type']; label: string; color: string }[] = [
  { value: 'lesion', label: 'Lesion', color: '#EF4444' },
  { value: 'procedure', label: 'Procedure', color: '#3B82F6' },
  { value: 'condition', label: 'Condition', color: '#F59E0B' },
  { value: 'cosmetic', label: 'Cosmetic', color: '#EC4899' },
  { value: 'wound', label: 'Wound', color: '#8B5CF6' },
  { value: 'note', label: 'General Note', color: '#10B981' },
];

const severityOptions: { value: BodyMarker['severity']; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export function BodyMarkerModal({
  isOpen,
  onClose,
  onSave,
  onDelete,
  marker,
  position,
}: BodyMarkerModalProps) {
  const [type, setType] = useState<BodyMarker['type']>('note');
  const [note, setNote] = useState('');
  const [severity, setSeverity] = useState<BodyMarker['severity']>('low');

  useEffect(() => {
    if (marker) {
      setType(marker.type);
      setNote(marker.note);
      setSeverity(marker.severity || 'low');
    } else {
      setType('note');
      setNote('');
      setSeverity('low');
    }
  }, [marker, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!note.trim()) return;

    const markerData: Omit<BodyMarker, 'id'> = {
      x: marker?.x ?? position?.x ?? 0,
      y: marker?.y ?? position?.y ?? 0,
      view: marker?.view ?? position?.view ?? 'front',
      type,
      note: note.trim(),
      date: marker?.date ?? new Date().toISOString(),
      severity,
    };

    onSave(markerData);
    onClose();
  };

  const handleDelete = () => {
    if (onDelete && window.confirm('Are you sure you want to delete this marker?')) {
      onDelete();
      onClose();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '16px',
          padding: '24px',
          maxWidth: '480px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        }}
      >
        <h2
          style={{
            margin: '0 0 20px 0',
            fontSize: '20px',
            fontWeight: '600',
            color: '#111827',
          }}
        >
          {marker ? 'Edit Body Marker' : 'Add Body Marker'}
        </h2>

        {/* Marker Type Selection */}
        <div style={{ marginBottom: '20px' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: '500',
              color: '#374151',
            }}
          >
            Marker Type
          </label>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '8px',
            }}
          >
            {markerTypes.map((mt) => (
              <button
                key={mt.value}
                onClick={() => setType(mt.value)}
                style={{
                  padding: '10px 12px',
                  border: `2px solid ${type === mt.value ? mt.color : '#e5e7eb'}`,
                  borderRadius: '8px',
                  background: type === mt.value ? `${mt.color}15` : 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s',
                }}
              >
                <span
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    background: mt.color,
                  }}
                />
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: type === mt.value ? '600' : '400',
                    color: type === mt.value ? mt.color : '#4b5563',
                  }}
                >
                  {mt.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Severity Selection */}
        <div style={{ marginBottom: '20px' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: '500',
              color: '#374151',
            }}
          >
            Severity
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {severityOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSeverity(opt.value)}
                style={{
                  flex: 1,
                  padding: '10px',
                  border: `2px solid ${severity === opt.value ? '#6366f1' : '#e5e7eb'}`,
                  borderRadius: '8px',
                  background: severity === opt.value ? '#eef2ff' : 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: severity === opt.value ? '600' : '400',
                  color: severity === opt.value ? '#4f46e5' : '#6b7280',
                  transition: 'all 0.2s',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Note Input */}
        <div style={{ marginBottom: '24px' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: '500',
              color: '#374151',
            }}
          >
            Clinical Note
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Enter clinical observations, findings, or notes..."
            rows={4}
            style={{
              width: '100%',
              padding: '12px',
              border: '2px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '14px',
              resize: 'vertical',
              outline: 'none',
              transition: 'border-color 0.2s',
              boxSizing: 'border-box',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = '#6366f1';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = '#e5e7eb';
            }}
            autoFocus
          />
        </div>

        {/* Position info */}
        <div
          style={{
            padding: '12px',
            background: '#f9fafb',
            borderRadius: '8px',
            marginBottom: '20px',
            fontSize: '13px',
            color: '#6b7280',
          }}
        >
          <strong>Location:</strong>{' '}
          {(marker?.view ?? position?.view ?? 'front').charAt(0).toUpperCase() +
            (marker?.view ?? position?.view ?? 'front').slice(1)}{' '}
          view at ({Math.round(marker?.x ?? position?.x ?? 0)}%, {Math.round(marker?.y ?? position?.y ?? 0)}%)
        </div>

        {/* Actions */}
        <div
          style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end',
          }}
        >
          {marker && onDelete && (
            <button
              onClick={handleDelete}
              style={{
                padding: '10px 20px',
                border: '2px solid #ef4444',
                borderRadius: '8px',
                background: 'white',
                color: '#ef4444',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                marginRight: 'auto',
              }}
            >
              Delete
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              border: '2px solid #e5e7eb',
              borderRadius: '8px',
              background: 'white',
              color: '#6b7280',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!note.trim()}
            style={{
              padding: '10px 24px',
              border: 'none',
              borderRadius: '8px',
              background: note.trim()
                ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                : '#e5e7eb',
              color: note.trim() ? 'white' : '#9ca3af',
              fontSize: '14px',
              fontWeight: '600',
              cursor: note.trim() ? 'pointer' : 'not-allowed',
              boxShadow: note.trim() ? '0 4px 12px rgba(102, 126, 234, 0.4)' : 'none',
            }}
          >
            {marker ? 'Update' : 'Add Marker'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default BodyMarkerModal;
