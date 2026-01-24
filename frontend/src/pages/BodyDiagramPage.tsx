import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { InteractiveBodyMap } from '../components/body-diagram/InteractiveBodyMap';
import type { BodyMarking } from '../components/body-diagram/InteractiveBodyMap';
import { BodyDiagram3D } from '../components/body-diagram/BodyDiagram3D';
import type { BodyMarking3D } from '../components/body-diagram/BodyDiagram3D';
import { PremiumBodyDiagram, MARKING_TYPES } from '../components/body-diagram/PremiumBodyDiagram';
import type { BodyMarking as PremiumBodyMarking } from '../components/body-diagram/PremiumBodyDiagram';
import { MarkingDetailModal } from '../components/body-diagram/MarkingDetailModal';
import type { MarkingFormData } from '../components/body-diagram/MarkingDetailModal';
import { api, fetchPatients } from '../api';
import type { Patient } from '../types';

interface BodyLocation {
  code: string;
  name: string;
  category: string;
  svgCoordinates: any;
}

export function BodyDiagramPage() {
  const [searchParams] = useSearchParams();
  const patientIdParam = searchParams.get('patientId');
  const encounterIdParam = searchParams.get('encounterId');

  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>(patientIdParam || '');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [markings, setMarkings] = useState<BodyMarking[]>([]);
  const [locations, setLocations] = useState<BodyLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedMarking, setSelectedMarking] = useState<BodyMarking | null>(null);
  const [newMarkingData, setNewMarkingData] = useState<{
    locationCode: string;
    locationX: number;
    locationY: number;
    viewType: 'front' | 'back' | 'left' | 'right';
  } | null>(null);

  // View mode: 2D classic, 3D rotatable, or Premium
  const [viewMode, setViewMode] = useState<'2d' | '3d' | 'premium'>('premium');

  // Skin tone for premium view
  const [skinTone, setSkinTone] = useState<'light' | 'medium' | 'tan' | 'dark'>('light');

  // Filters
  const [filterMarkingType, setFilterMarkingType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Load patients
  useEffect(() => {
    const loadPatients = async () => {
      try {
        const session = JSON.parse(localStorage.getItem('ema_session') || '{}');
        if (!session.tenantId || !session.accessToken) return;
        const response = await fetchPatients(session.tenantId, session.accessToken);
        setPatients(response.patients);
      } catch (err) {
        console.error('Failed to load patients:', err);
      }
    };
    loadPatients();
  }, []);

  // Load locations
  useEffect(() => {
    const loadLocations = async () => {
      try {
        const session = JSON.parse(localStorage.getItem('ema_session') || '{}');
        if (!session.tenantId || !session.accessToken) return;
        const response = await api.get(session.tenantId, session.accessToken, '/body-diagram/locations');
        setLocations(response.locations);
      } catch (err) {
        console.error('Failed to load body locations:', err);
      }
    };
    loadLocations();
  }, []);

  // Load selected patient details
  useEffect(() => {
    if (selectedPatientId) {
      const patient = patients.find((p) => p.id === selectedPatientId);
      setSelectedPatient(patient || null);
    } else {
      setSelectedPatient(null);
    }
  }, [selectedPatientId, patients]);

  // Load markings when patient changes
  useEffect(() => {
    if (selectedPatientId) {
      loadMarkings();
    } else {
      setMarkings([]);
    }
  }, [selectedPatientId]);

  const loadMarkings = async () => {
    if (!selectedPatientId) return;

    setLoading(true);
    setError(null);

    try {
      const session = JSON.parse(localStorage.getItem('ema_session') || '{}');
      if (!session.tenantId || !session.accessToken) return;
      const response = await api.get(session.tenantId, session.accessToken, `/body-diagram/patient/${selectedPatientId}/markings`);
      setMarkings(response.markings);
    } catch (err: any) {
      console.error('Failed to load markings:', err);
      setError('Failed to load body diagram markings');
    } finally {
      setLoading(false);
    }
  };

  // Handle adding new marking
  const handleAddMarking = (locationCode: string, x: number, y: number, viewType: 'front' | 'back' | 'left' | 'right') => {
    setNewMarkingData({ locationCode, locationX: x, locationY: y, viewType });
    setSelectedMarking(null);
    setIsModalOpen(true);
  };

  // Handle adding new marking from 3D view
  const handleAddMarking3D = (locationCode: string, x: number, y: number, viewType: 'front' | 'back' | 'left' | 'right') => {
    setNewMarkingData({ locationCode, locationX: x, locationY: y, viewType });
    setSelectedMarking(null);
    setIsModalOpen(true);
  };

  // Handle clicking marking in 3D view
  const handleMarkingClick3D = (marking: BodyMarking3D) => {
    // Convert BodyMarking3D to BodyMarking for the modal
    const convertedMarking: BodyMarking = {
      ...marking,
      viewType: marking.viewType === 'left' || marking.viewType === 'right' ? 'front' : marking.viewType,
    };
    setSelectedMarking(convertedMarking);
    setNewMarkingData(null);
    setIsModalOpen(true);
  };

  // Handle clicking existing marking
  const handleMarkingClick = (marking: BodyMarking) => {
    setSelectedMarking(marking);
    setNewMarkingData(null);
    setIsModalOpen(true);
  };

  // Handle saving marking (create or update)
  const handleSaveMarking = async (data: MarkingFormData) => {
    if (!selectedPatientId) return;

    try {
      const session = JSON.parse(localStorage.getItem('ema_session') || '{}');
      if (!session.tenantId || !session.accessToken) return;

      if (selectedMarking) {
        // Update existing marking
        await api.put(session.tenantId, session.accessToken, `/body-diagram/markings/${selectedMarking.id}`, data);
      } else {
        // Create new marking
        await api.post(session.tenantId, session.accessToken, '/body-diagram/markings', {
          ...data,
          patientId: selectedPatientId,
          encounterId: encounterIdParam || undefined,
        });
      }

      await loadMarkings();
      setIsModalOpen(false);
      setSelectedMarking(null);
      setNewMarkingData(null);
    } catch (err: any) {
      console.error('Failed to save marking:', err);
      throw err;
    }
  };

  // Handle deleting marking
  const handleDeleteMarking = async (markingId: string) => {
    try {
      const session = JSON.parse(localStorage.getItem('ema_session') || '{}');
      if (!session.tenantId || !session.accessToken) return;
      await api.delete(session.tenantId, session.accessToken, `/body-diagram/markings/${markingId}`);
      await loadMarkings();
      setIsModalOpen(false);
      setSelectedMarking(null);
    } catch (err: any) {
      console.error('Failed to delete marking:', err);
      throw err;
    }
  };

  // Filtered markings
  const filteredMarkings = useMemo(() => {
    return markings.filter((marking) => {
      if (filterMarkingType !== 'all' && marking.markingType !== filterMarkingType) return false;
      if (filterStatus !== 'all' && marking.status !== filterStatus) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return (
          marking.locationName?.toLowerCase().includes(term) ||
          marking.diagnosisDescription?.toLowerCase().includes(term) ||
          marking.description?.toLowerCase().includes(term) ||
          marking.lesionType?.toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [markings, filterMarkingType, filterStatus, searchTerm]);

  // Export to PDF (placeholder)
  const handleExportPDF = () => {
    alert('PDF export functionality will be implemented with a PDF generation library');
  };

  return (
    <div className="body-diagram-page" style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ margin: '0 0 8px 0', fontSize: '28px', fontWeight: '600', color: '#111827' }}>Body Diagram</h1>
        <p style={{ margin: 0, color: '#6B7280', fontSize: '14px' }}>
          Document and track skin lesions, examined areas, biopsies, and procedures
        </p>
      </div>

      {/* Patient Selection */}
      <div
        style={{
          marginBottom: '24px',
          padding: '20px',
          background: 'white',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}
      >
        <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
          Select Patient
        </label>
        <select
          value={selectedPatientId}
          onChange={(e) => setSelectedPatientId(e.target.value)}
          style={{
            width: '100%',
            maxWidth: '500px',
            padding: '12px',
            border: '1px solid #D1D5DB',
            borderRadius: '6px',
            fontSize: '14px',
          }}
        >
          <option value="">-- Select a patient --</option>
          {patients.map((patient) => (
            <option key={patient.id} value={patient.id}>
              {patient.lastName}, {patient.firstName} - DOB: {patient.dob || 'N/A'} - MRN: {patient.mrn || 'N/A'}
            </option>
          ))}
        </select>

        {selectedPatient && (
          <div
            style={{
              marginTop: '16px',
              padding: '12px',
              background: '#F3F4F6',
              borderRadius: '6px',
              fontSize: '14px',
              color: '#374151',
            }}
          >
            <strong>
              {selectedPatient.firstName} {selectedPatient.lastName}
            </strong>{' '}
            - {selectedPatient.dob ? `DOB: ${selectedPatient.dob}` : ''} - {selectedPatient.mrn ? `MRN: ${selectedPatient.mrn}` : ''}
          </div>
        )}
      </div>

      {!selectedPatientId ? (
        <div
          style={{
            padding: '60px 20px',
            textAlign: 'center',
            background: 'white',
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          <p style={{ fontSize: '16px', color: '#6B7280', margin: 0 }}>Please select a patient to view their body diagram</p>
        </div>
      ) : (
        <>
          {/* Filters and Actions */}
          <div
            style={{
              marginBottom: '24px',
              padding: '20px',
              background: 'white',
              borderRadius: '8px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
          >
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Search */}
              <input
                type="text"
                placeholder="Search markings..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  flex: '1',
                  minWidth: '200px',
                  padding: '10px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
              />

              {/* Marking Type Filter */}
              <select
                value={filterMarkingType}
                onChange={(e) => setFilterMarkingType(e.target.value)}
                style={{
                  padding: '10px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
              >
                <option value="all">All Types</option>
                <option value="lesion">Lesions</option>
                <option value="examined">Examined</option>
                <option value="biopsy">Biopsies</option>
                <option value="excision">Excisions</option>
                <option value="injection">Injections</option>
              </select>

              {/* Status Filter */}
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                style={{
                  padding: '10px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="resolved">Resolved</option>
                <option value="monitored">Monitored</option>
                <option value="biopsied">Biopsied</option>
                <option value="excised">Excised</option>
              </select>

              {/* Export Button */}
              <button
                onClick={handleExportPDF}
                style={{
                  padding: '10px 20px',
                  border: '1px solid #6B46C1',
                  borderRadius: '6px',
                  background: 'white',
                  color: '#6B46C1',
                  fontWeight: '500',
                  cursor: 'pointer',
                }}
              >
                Export PDF
              </button>
            </div>
          </div>

          {/* Main Content Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: viewMode === 'premium' ? '1fr' : '1fr 1fr', gap: '24px' }}>
            {/* Body Diagram */}
            <div
              style={{
                background: 'white',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                padding: '20px',
              }}
            >
              {/* View Mode Toggle */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#111827' }}>
                  {viewMode === 'premium' ? 'Premium Body Diagram' : viewMode === '3d' ? '3D Interactive Body' : 'Interactive Body Map'}
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {/* Skin Tone Selector (only for premium view) */}
                  {viewMode === 'premium' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px', color: '#6B7280' }}>Skin:</span>
                      {(['light', 'medium', 'tan', 'dark'] as const).map((tone) => (
                        <button
                          key={tone}
                          onClick={() => setSkinTone(tone)}
                          title={tone.charAt(0).toUpperCase() + tone.slice(1)}
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            border: skinTone === tone ? '2px solid #6B46C1' : '2px solid transparent',
                            background: tone === 'light' ? '#FFE4D6' : tone === 'medium' ? '#E8C4A8' : tone === 'tan' ? '#C8A07A' : '#8B6240',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            boxShadow: skinTone === tone ? '0 0 0 2px rgba(107, 70, 193, 0.3)' : '0 1px 3px rgba(0,0,0,0.1)',
                          }}
                        />
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '4px', background: '#F3F4F6', padding: '4px', borderRadius: '8px' }}>
                    <button
                      onClick={() => setViewMode('premium')}
                      style={{
                        padding: '8px 16px',
                        border: 'none',
                        borderRadius: '6px',
                        background: viewMode === 'premium' ? 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' : 'transparent',
                        color: viewMode === 'premium' ? 'white' : '#6B7280',
                        fontWeight: '500',
                        fontSize: '13px',
                        cursor: 'pointer',
                        boxShadow: viewMode === 'premium' ? '0 2px 8px rgba(99, 102, 241, 0.4)' : 'none',
                        transition: 'all 0.2s',
                      }}
                    >
                      Premium
                    </button>
                    <button
                      onClick={() => setViewMode('3d')}
                      style={{
                        padding: '8px 16px',
                        border: 'none',
                        borderRadius: '6px',
                        background: viewMode === '3d' ? 'white' : 'transparent',
                        color: viewMode === '3d' ? '#6B46C1' : '#6B7280',
                        fontWeight: '500',
                        fontSize: '13px',
                        cursor: 'pointer',
                        boxShadow: viewMode === '3d' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        transition: 'all 0.2s',
                      }}
                    >
                      3D
                    </button>
                    <button
                      onClick={() => setViewMode('2d')}
                      style={{
                        padding: '8px 16px',
                        border: 'none',
                        borderRadius: '6px',
                        background: viewMode === '2d' ? 'white' : 'transparent',
                        color: viewMode === '2d' ? '#6B46C1' : '#6B7280',
                        fontWeight: '500',
                        fontSize: '13px',
                        cursor: 'pointer',
                        boxShadow: viewMode === '2d' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        transition: 'all 0.2s',
                      }}
                    >
                      2D
                    </button>
                  </div>
                </div>
              </div>

              {loading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#6B7280' }}>Loading markings...</div>
              ) : error ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#EF4444' }}>{error}</div>
              ) : viewMode === 'premium' ? (
                <PremiumBodyDiagram
                  markings={filteredMarkings.map((m) => ({
                    id: m.id,
                    x: m.locationX,
                    y: m.locationY,
                    regionCode: m.locationCode,
                    type: (m.markingType === 'lesion' ? 'lesion' : m.markingType === 'biopsy' ? 'biopsy' : m.markingType === 'excision' ? 'treatment' : 'other') as keyof typeof MARKING_TYPES,
                    notes: m.description,
                    severity: m.status === 'active' ? 'high' : m.status === 'monitored' ? 'medium' : 'low',
                    size: m.lesionSizeMm,
                    createdAt: m.createdAt || new Date().toISOString(),
                    evolving: m.status === 'monitored',
                  }))}
                  skinTone={skinTone}
                  mode="edit"
                  onAddMarking={(x, y, regionCode) => handleAddMarking(regionCode, x, y, 'front')}
                  onSelectMarking={(marking) => {
                    const original = filteredMarkings.find((m) => m.id === marking.id);
                    if (original) handleMarkingClick(original);
                  }}
                  selectedMarkingId={selectedMarking?.id}
                  showLegend={true}
                  showRegionInfo={true}
                />
              ) : viewMode === '3d' ? (
                <BodyDiagram3D
                  markings={filteredMarkings as BodyMarking3D[]}
                  editable={true}
                  onAddMarking={handleAddMarking3D}
                  onMarkingClick={handleMarkingClick3D}
                  selectedMarkingId={selectedMarking?.id}
                  showControls={true}
                />
              ) : (
                <InteractiveBodyMap
                  markings={filteredMarkings}
                  editable={true}
                  onAddMarking={handleAddMarking}
                  onMarkingClick={handleMarkingClick}
                  selectedMarkingId={selectedMarking?.id}
                />
              )}
            </div>

            {/* Markings List - Only shown for 2D/3D views */}
            {viewMode !== 'premium' && (
            <div
              style={{
                background: 'white',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                padding: '20px',
              }}
            >
              <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600', color: '#111827' }}>
                Markings ({filteredMarkings.length})
              </h3>

              <div style={{ maxHeight: '700px', overflowY: 'auto' }}>
                {filteredMarkings.length === 0 ? (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: '#6B7280' }}>
                    {markings.length === 0 ? 'No markings yet. Click on the body diagram to add one.' : 'No markings match your filters.'}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {filteredMarkings.map((marking) => (
                      <div
                        key={marking.id}
                        onClick={() => handleMarkingClick(marking)}
                        style={{
                          padding: '16px',
                          border: `2px solid ${marking.id === selectedMarking?.id ? '#6B46C1' : '#E5E7EB'}`,
                          borderRadius: '8px',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          background: marking.id === selectedMarking?.id ? '#F3F4F6' : 'white',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                          <div>
                            <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827', marginBottom: '4px' }}>
                              {marking.locationName || marking.locationCode}
                            </div>
                            <div style={{ fontSize: '12px', color: '#6B7280' }}>
                              {marking.viewType.charAt(0).toUpperCase() + marking.viewType.slice(1)} View • {marking.createdAt ? new Date(marking.createdAt).toLocaleDateString() : ''}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <span
                              style={{
                                padding: '4px 8px',
                                borderRadius: '4px',
                                background: '#F3F4F6',
                                color: '#374151',
                                fontSize: '11px',
                                fontWeight: '500',
                                textTransform: 'uppercase',
                              }}
                            >
                              {marking.markingType}
                            </span>
                            <span
                              style={{
                                padding: '4px 8px',
                                borderRadius: '4px',
                                background: '#EEF2FF',
                                color: '#6B46C1',
                                fontSize: '11px',
                                fontWeight: '500',
                                textTransform: 'uppercase',
                              }}
                            >
                              {marking.status}
                            </span>
                          </div>
                        </div>

                        {marking.diagnosisDescription && (
                          <div style={{ fontSize: '13px', color: '#374151', marginBottom: '4px' }}>
                            <strong>Diagnosis:</strong> {marking.diagnosisDescription}
                            {marking.diagnosisCode && ` (${marking.diagnosisCode})`}
                          </div>
                        )}

                        {marking.lesionType && (
                          <div style={{ fontSize: '13px', color: '#374151', marginBottom: '4px' }}>
                            <strong>Type:</strong> {marking.lesionType}
                            {marking.lesionSizeMm && ` - ${marking.lesionSizeMm}mm`}
                            {marking.lesionColor && ` - ${marking.lesionColor}`}
                          </div>
                        )}

                        {marking.description && (
                          <div style={{ fontSize: '13px', color: '#6B7280', marginTop: '8px', fontStyle: 'italic' }}>
                            "{marking.description}"
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            )}
          </div>
        </>
      )}

      {/* Marking Detail Modal */}
      {selectedPatientId && (
        <MarkingDetailModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedMarking(null);
            setNewMarkingData(null);
          }}
          marking={selectedMarking}
          initialData={newMarkingData || undefined}
          patientId={selectedPatientId}
          encounterId={encounterIdParam || undefined}
          onSave={handleSaveMarking}
          onDelete={selectedMarking ? handleDeleteMarking : undefined}
          locations={locations}
        />
      )}
    </div>
  );
}
