import React, { useState, useEffect } from 'react';
import { LesionMarker, MarkerType } from './BodyMapMarker';

export interface LesionObservation {
  id: string;
  lesion_id: string;
  observed_date: string;
  provider_id?: string;
  provider_name?: string;
  size_mm?: number;
  photo_id?: string;
  notes?: string;
  created_at: string;
}

export interface LesionDetailModalProps {
  lesion: LesionMarker;
  onClose: () => void;
  onUpdate: (lesionId: string, updates: Partial<LesionMarker>) => Promise<void>;
  onDelete: (lesionId: string) => Promise<void>;
}

export function LesionDetailModal({ lesion, onClose, onUpdate, onDelete }: LesionDetailModalProps) {
  const markerType: MarkerType = lesion.marker_type || 'lesion';
  const [activeTab, setActiveTab] = useState<'details' | 'history' | 'photos' | 'biopsy'>('details');
  const [isEditing, setIsEditing] = useState(false);
  const [editedLesion, setEditedLesion] = useState<Partial<LesionMarker>>(lesion);
  const [observations, setObservations] = useState<LesionObservation[]>([]);
  const [newObservation, setNewObservation] = useState({
    size_mm: '',
    notes: '',
    observed_date: new Date().toISOString().split('T')[0],
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    // Load observation history
    fetchObservations();
  }, [lesion.id]);

  const fetchObservations = async () => {
    try {
      const response = await fetch(`/api/patients/${lesion.patient_id}/lesions/${lesion.id}/history`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setObservations(data.observations || []);
      }
    } catch (error) {
      console.error('Failed to fetch observations:', error);
    }
  };

  const handleSave = async () => {
    try {
      await onUpdate(lesion.id, editedLesion);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update lesion:', error);
    }
  };

  const handleAddObservation = async () => {
    try {
      const response = await fetch(`/api/patients/${lesion.patient_id}/lesions/${lesion.id}/observations`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newObservation,
          size_mm: newObservation.size_mm ? parseFloat(newObservation.size_mm) : undefined,
        }),
      });

      if (response.ok) {
        setNewObservation({ size_mm: '', notes: '', observed_date: new Date().toISOString().split('T')[0] });
        await fetchObservations();
      }
    } catch (error) {
      console.error('Failed to add observation:', error);
    }
  };

  const handleDelete = async () => {
    try {
      await onDelete(lesion.id);
      onClose();
    } catch (error) {
      console.error('Failed to delete lesion:', error);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  const statusColor =
    {
      monitoring: '#3B82F6',
      suspicious: '#EAB308',
      benign: '#10B981',
      malignant: '#EF4444',
      treated: '#8B5CF6',
      resolved: '#6B7280',
    }[lesion.status] || '#6B7280';

  return (
    <div
      className="lesion-detail-modal-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        className="lesion-detail-modal"
        style={{
          background: 'white',
          borderRadius: '12px',
          maxWidth: '800px',
          width: '90%',
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #E5E7EB',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h2 style={{ margin: '0 0 4px 0', fontSize: '20px', fontWeight: '600', color: '#111827' }}>
              {markerType === 'lesion' ? 'Lesion' :
               markerType === 'procedure' ? 'Procedure' :
               markerType === 'condition' ? 'Condition' :
               markerType === 'cosmetic' ? 'Cosmetic' :
               markerType === 'wound' ? 'Wound' : 'Marker'} Details
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px', color: '#6B7280' }}>ID: {lesion.id.slice(0, 8)}</span>
              <div
                style={{
                  fontSize: '11px',
                  color: 'white',
                  background: statusColor,
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontWeight: '500',
                  textTransform: 'uppercase',
                }}
              >
                {markerType === 'lesion' ? lesion.status : markerType}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '8px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: '24px',
              color: '#6B7280',
            }}
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div style={{ borderBottom: '1px solid #E5E7EB', display: 'flex', padding: '0 24px' }}>
          {(['details', 'history', 'photos', 'biopsy'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '12px 16px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                color: activeTab === tab ? '#6B46C1' : '#6B7280',
                borderBottom: activeTab === tab ? '2px solid #6B46C1' : '2px solid transparent',
                textTransform: 'capitalize',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
          {activeTab === 'details' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                {/* Location */}
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '4px' }}>
                    Anatomical Location
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editedLesion.anatomical_location || ''}
                      onChange={(e) => setEditedLesion({ ...editedLesion, anatomical_location: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #D1D5DB',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    />
                  ) : (
                    <div style={{ fontSize: '14px', color: '#111827' }}>{lesion.anatomical_location || 'Not specified'}</div>
                  )}
                </div>

                {/* Type-Specific Field */}
                {markerType === 'lesion' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '4px' }}>
                      Lesion Type
                    </label>
                    {isEditing ? (
                      <select
                        value={editedLesion.lesion_type || ''}
                        onChange={(e) => setEditedLesion({ ...editedLesion, lesion_type: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: '1px solid #D1D5DB',
                          borderRadius: '6px',
                          fontSize: '14px',
                        }}
                      >
                        <option value="">Select type</option>
                        <option value="nevus">Nevus (Mole)</option>
                        <option value="cyst">Cyst</option>
                        <option value="papule">Papule</option>
                        <option value="plaque">Plaque</option>
                        <option value="nodule">Nodule</option>
                        <option value="melanoma">Melanoma</option>
                        <option value="bcc">Basal Cell Carcinoma</option>
                        <option value="scc">Squamous Cell Carcinoma</option>
                        <option value="ak">Actinic Keratosis</option>
                        <option value="sk">Seborrheic Keratosis</option>
                      </select>
                    ) : (
                      <div style={{ fontSize: '14px', color: '#111827' }}>{lesion.lesion_type || 'Not specified'}</div>
                    )}
                  </div>
                )}

                {markerType === 'procedure' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '4px' }}>
                      Procedure Type
                    </label>
                    {isEditing ? (
                      <select
                        value={editedLesion.procedure_type || ''}
                        onChange={(e) => setEditedLesion({ ...editedLesion, procedure_type: e.target.value as any })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: '1px solid #D1D5DB',
                          borderRadius: '6px',
                          fontSize: '14px',
                        }}
                      >
                        <option value="">Select procedure</option>
                        <option value="biopsy">Biopsy</option>
                        <option value="excision">Excision</option>
                        <option value="cryo">Cryotherapy</option>
                        <option value="laser">Laser Treatment</option>
                      </select>
                    ) : (
                      <div style={{ fontSize: '14px', color: '#111827', textTransform: 'capitalize' }}>{lesion.procedure_type || 'Not specified'}</div>
                    )}
                  </div>
                )}

                {markerType === 'condition' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '4px' }}>
                      Condition Type
                    </label>
                    {isEditing ? (
                      <select
                        value={editedLesion.condition_type || ''}
                        onChange={(e) => setEditedLesion({ ...editedLesion, condition_type: e.target.value as any })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: '1px solid #D1D5DB',
                          borderRadius: '6px',
                          fontSize: '14px',
                        }}
                      >
                        <option value="">Select condition</option>
                        <option value="psoriasis">Psoriasis</option>
                        <option value="eczema">Eczema</option>
                        <option value="vitiligo">Vitiligo</option>
                        <option value="dermatitis">Dermatitis</option>
                        <option value="other">Other</option>
                      </select>
                    ) : (
                      <div style={{ fontSize: '14px', color: '#111827', textTransform: 'capitalize' }}>{lesion.condition_type || 'Not specified'}</div>
                    )}
                  </div>
                )}

                {markerType === 'cosmetic' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '4px' }}>
                      Cosmetic Type
                    </label>
                    {isEditing ? (
                      <select
                        value={editedLesion.cosmetic_type || ''}
                        onChange={(e) => setEditedLesion({ ...editedLesion, cosmetic_type: e.target.value as any })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: '1px solid #D1D5DB',
                          borderRadius: '6px',
                          fontSize: '14px',
                        }}
                      >
                        <option value="">Select treatment</option>
                        <option value="injection">Injection</option>
                        <option value="filler">Filler</option>
                        <option value="botox">Botox</option>
                        <option value="treatment">Treatment</option>
                        <option value="other">Other</option>
                      </select>
                    ) : (
                      <div style={{ fontSize: '14px', color: '#111827', textTransform: 'capitalize' }}>{lesion.cosmetic_type || 'Not specified'}</div>
                    )}
                  </div>
                )}

                {markerType === 'wound' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '4px' }}>
                      Wound Status
                    </label>
                    {isEditing ? (
                      <select
                        value={editedLesion.wound_status || ''}
                        onChange={(e) => setEditedLesion({ ...editedLesion, wound_status: e.target.value as any })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: '1px solid #D1D5DB',
                          borderRadius: '6px',
                          fontSize: '14px',
                        }}
                      >
                        <option value="">Select status</option>
                        <option value="fresh">Fresh</option>
                        <option value="healing">Healing</option>
                        <option value="infected">Infected</option>
                        <option value="healed">Healed</option>
                      </select>
                    ) : (
                      <div style={{ fontSize: '14px', color: '#111827', textTransform: 'capitalize' }}>{lesion.wound_status || 'Not specified'}</div>
                    )}
                  </div>
                )}

                {/* Size */}
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '4px' }}>
                    Size (mm)
                  </label>
                  {isEditing ? (
                    <input
                      type="number"
                      step="0.1"
                      value={editedLesion.size_mm || ''}
                      onChange={(e) => setEditedLesion({ ...editedLesion, size_mm: parseFloat(e.target.value) })}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #D1D5DB',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    />
                  ) : (
                    <div style={{ fontSize: '14px', color: '#111827' }}>{lesion.size_mm ? `${lesion.size_mm} mm` : 'Not measured'}</div>
                  )}
                </div>

                {/* Status */}
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '4px' }}>
                    Status
                  </label>
                  {isEditing ? (
                    <select
                      value={editedLesion.status || ''}
                      onChange={(e) => setEditedLesion({ ...editedLesion, status: e.target.value as any })}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #D1D5DB',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    >
                      <option value="monitoring">Monitoring</option>
                      <option value="suspicious">Suspicious</option>
                      <option value="benign">Benign</option>
                      <option value="malignant">Malignant</option>
                      <option value="treated">Treated</option>
                      <option value="resolved">Resolved</option>
                    </select>
                  ) : (
                    <div style={{ fontSize: '14px', color: '#111827', textTransform: 'capitalize' }}>{lesion.status}</div>
                  )}
                </div>

                {/* Color */}
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '4px' }}>
                    Color
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editedLesion.color || ''}
                      onChange={(e) => setEditedLesion({ ...editedLesion, color: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #D1D5DB',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    />
                  ) : (
                    <div style={{ fontSize: '14px', color: '#111827' }}>{lesion.color || 'Not specified'}</div>
                  )}
                </div>

                {/* Border */}
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '4px' }}>
                    Border
                  </label>
                  {isEditing ? (
                    <select
                      value={editedLesion.border || ''}
                      onChange={(e) => setEditedLesion({ ...editedLesion, border: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #D1D5DB',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    >
                      <option value="">Select border</option>
                      <option value="well-defined">Well-defined</option>
                      <option value="irregular">Irregular</option>
                      <option value="poorly-defined">Poorly-defined</option>
                    </select>
                  ) : (
                    <div style={{ fontSize: '14px', color: '#111827' }}>{lesion.border || 'Not specified'}</div>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '4px' }}>
                  Clinical Notes
                </label>
                {isEditing ? (
                  <textarea
                    value={editedLesion.notes || ''}
                    onChange={(e) => setEditedLesion({ ...editedLesion, notes: e.target.value })}
                    rows={4}
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #D1D5DB',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontFamily: 'inherit',
                    }}
                  />
                ) : (
                  <div style={{ fontSize: '14px', color: '#111827', whiteSpace: 'pre-wrap' }}>
                    {lesion.notes || 'No notes'}
                  </div>
                )}
              </div>

              {/* Dates */}
              <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '4px' }}>
                    First Noted
                  </label>
                  <div style={{ fontSize: '14px', color: '#6B7280' }}>
                    {lesion.first_noted_date ? formatDate(lesion.first_noted_date) : 'Not recorded'}
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '4px' }}>
                    Last Examined
                  </label>
                  <div style={{ fontSize: '14px', color: '#6B7280' }}>
                    {lesion.last_examined_date ? formatDate(lesion.last_examined_date) : 'Not examined'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div>
              {/* Add new observation */}
              <div
                style={{
                  padding: '16px',
                  background: '#F9FAFB',
                  borderRadius: '8px',
                  marginBottom: '16px',
                }}
              >
                <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827' }}>
                  Add New Observation
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', color: '#6B7280', marginBottom: '4px' }}>
                      Date
                    </label>
                    <input
                      type="date"
                      value={newObservation.observed_date}
                      onChange={(e) => setNewObservation({ ...newObservation, observed_date: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #D1D5DB',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', color: '#6B7280', marginBottom: '4px' }}>
                      Size (mm)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={newObservation.size_mm}
                      onChange={(e) => setNewObservation({ ...newObservation, size_mm: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #D1D5DB',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    />
                  </div>
                </div>
                <textarea
                  placeholder="Observation notes..."
                  value={newObservation.notes}
                  onChange={(e) => setNewObservation({ ...newObservation, notes: e.target.value })}
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '14px',
                    marginBottom: '12px',
                  }}
                />
                <button
                  onClick={handleAddObservation}
                  style={{
                    padding: '8px 16px',
                    background: '#6B46C1',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                  }}
                >
                  Add Observation
                </button>
              </div>

              {/* Observation history */}
              <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827' }}>
                Observation History
              </h3>
              {observations.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', color: '#6B7280', fontSize: '14px' }}>
                  No observations recorded yet
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {observations.map((obs) => (
                    <div
                      key={obs.id}
                      style={{
                        padding: '12px',
                        border: '1px solid #E5E7EB',
                        borderRadius: '6px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <div style={{ fontSize: '13px', fontWeight: '500', color: '#111827' }}>
                          {formatDate(obs.observed_date)}
                        </div>
                        {obs.size_mm && (
                          <div style={{ fontSize: '13px', color: '#6B7280' }}>Size: {obs.size_mm}mm</div>
                        )}
                      </div>
                      {obs.notes && (
                        <div style={{ fontSize: '14px', color: '#6B7280' }}>{obs.notes}</div>
                      )}
                      {obs.provider_name && (
                        <div style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '4px' }}>
                          By: {obs.provider_name}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'photos' && (
            <div style={{ textAlign: 'center', padding: '32px', color: '#6B7280' }}>
              Photo comparison feature coming soon
            </div>
          )}

          {activeTab === 'biopsy' && (
            <div>
              {lesion.biopsy_id ? (
                <div>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '4px' }}>
                      Biopsy ID
                    </label>
                    <div style={{ fontSize: '14px', color: '#111827' }}>{lesion.biopsy_id}</div>
                  </div>
                  {lesion.pathology_result && (
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '4px' }}>
                        Pathology Result
                      </label>
                      <div style={{ fontSize: '14px', color: '#111827', whiteSpace: 'pre-wrap' }}>
                        {lesion.pathology_result}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '32px', color: '#6B7280' }}>
                  No biopsy performed
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quick Actions Bar */}
        {!isEditing && (
          <div
            style={{
              padding: '12px 24px',
              borderTop: '1px solid #E5E7EB',
              background: '#F9FAFB',
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap',
            }}
          >
            <button
              onClick={() => setActiveTab('history')}
              style={{
                padding: '6px 12px',
                background: 'white',
                color: '#6B7280',
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              Add Note
            </button>
            <button
              onClick={() => setActiveTab('photos')}
              style={{
                padding: '6px 12px',
                background: 'white',
                color: '#6B7280',
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              Take Photo
            </button>
            {markerType === 'lesion' && (
              <button
                onClick={() => {
                  setEditedLesion({ ...lesion, status: 'resolved' });
                  onUpdate(lesion.id, { status: 'resolved' });
                }}
                style={{
                  padding: '6px 12px',
                  background: 'white',
                  color: '#10B981',
                  border: '1px solid #10B981',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                Mark Resolved
              </button>
            )}
            {markerType === 'wound' && lesion.wound_status !== 'healed' && (
              <button
                onClick={() => {
                  setEditedLesion({ ...lesion, wound_status: 'healed' });
                  onUpdate(lesion.id, { wound_status: 'healed' });
                }}
                style={{
                  padding: '6px 12px',
                  background: 'white',
                  color: '#10B981',
                  border: '1px solid #10B981',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                Mark Healed
              </button>
            )}
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #E5E7EB',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            {showDeleteConfirm ? (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '14px', color: '#EF4444', marginRight: '8px' }}>
                  Are you sure?
                </span>
                <button
                  onClick={handleDelete}
                  style={{
                    padding: '6px 12px',
                    background: '#EF4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  Delete
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  style={{
                    padding: '6px 12px',
                    background: 'white',
                    color: '#6B7280',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                style={{
                  padding: '8px 16px',
                  background: 'white',
                  color: '#EF4444',
                  border: '1px solid #EF4444',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Delete {markerType === 'lesion' ? 'Lesion' : markerType === 'procedure' ? 'Procedure' : markerType === 'condition' ? 'Condition' : markerType === 'cosmetic' ? 'Treatment' : 'Wound'}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {isEditing ? (
              <>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditedLesion(lesion);
                  }}
                  style={{
                    padding: '8px 16px',
                    background: 'white',
                    color: '#6B7280',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  style={{
                    padding: '8px 16px',
                    background: '#6B46C1',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                  }}
                >
                  Save Changes
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                style={{
                  padding: '8px 16px',
                  background: '#6B46C1',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                }}
              >
                Edit Details
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
