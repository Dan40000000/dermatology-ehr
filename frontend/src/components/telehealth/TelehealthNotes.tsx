import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  saveSessionNotes,
  fetchSessionNotes,
  finalizeSessionNotes,
  fetchSessionPhotos,
  type SessionNotes,
  type TelehealthSession,
  type SessionPhoto,
} from '../../api';
import { Button } from '../ui/Button';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import '../../styles/telehealth.css';

interface TelehealthNotesProps {
  session: TelehealthSession;
  onNotesFinalized?: () => void;
}

const TelehealthNotes: React.FC<TelehealthNotesProps> = ({ session, onNotesFinalized }) => {
  const { session: authSession } = useAuth();
  const tenantId = authSession?.tenantId;
  const accessToken = authSession?.accessToken;

  const [notes, setNotes] = useState<Partial<SessionNotes>>({
    chief_complaint: '',
    hpi: '',
    examination_findings: '',
    assessment: '',
    plan: '',
    suggested_cpt_codes: [],
    suggested_icd10_codes: [],
    complexity_level: '',
  });
  const [photos, setPhotos] = useState<SessionPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [showAISuggestions, setShowAISuggestions] = useState(false);

  // Common CPT codes for dermatology telehealth
  const commonCptCodes = [
    { code: '99212', description: 'Office visit, Level 2 (10 min)', rvu: 1.3 },
    { code: '99213', description: 'Office visit, Level 3 (15 min)', rvu: 1.9 },
    { code: '99214', description: 'Office visit, Level 4 (25 min)', rvu: 2.8 },
    { code: '99215', description: 'Office visit, Level 5 (40 min)', rvu: 3.8 },
    { code: '99441', description: 'Phone E/M 5-10 min', rvu: 0.5 },
    { code: '99442', description: 'Phone E/M 11-20 min', rvu: 1.0 },
    { code: '99443', description: 'Phone E/M 21-30 min', rvu: 1.5 },
  ];

  // Common ICD-10 codes for dermatology
  const commonIcd10Codes = [
    { code: 'L70.0', description: 'Acne vulgaris' },
    { code: 'L20.9', description: 'Atopic dermatitis, unspecified' },
    { code: 'L30.9', description: 'Dermatitis, unspecified' },
    { code: 'L40.0', description: 'Psoriasis vulgaris' },
    { code: 'L82.1', description: 'Seborrheic keratosis' },
    { code: 'L57.0', description: 'Actinic keratosis' },
    { code: 'B07.9', description: 'Viral wart, unspecified' },
    { code: 'L21.9', description: 'Seborrheic dermatitis, unspecified' },
  ];

  useEffect(() => {
    loadNotes();
    loadPhotos();
  }, []);

  useEffect(() => {
    if (autoSaveEnabled && !saving) {
      const autoSaveTimer = setTimeout(() => {
        handleSave(true);
      }, 5000); // Auto-save every 5 seconds

      return () => clearTimeout(autoSaveTimer);
    }
  }, [notes, autoSaveEnabled]);

  const loadNotes = async () => {
    if (!tenantId || !accessToken) {
      setLoading(false);
      return;
    }
    try {
      const existingNotes = await fetchSessionNotes(tenantId, accessToken, session.id);
      setNotes(existingNotes);
      setLoading(false);
    } catch (error) {
      // Notes don't exist yet, that's okay
      setLoading(false);
    }
  };

  const loadPhotos = async () => {
    if (!tenantId || !accessToken) return;
    try {
      const sessionPhotos = await fetchSessionPhotos(tenantId, accessToken, session.id);
      setPhotos(sessionPhotos);
    } catch (error) {
      console.error('Failed to load photos:', error);
    }
  };

  const handleSave = async (isAutoSave = false) => {
    if (!tenantId || !accessToken) return;
    if (notes.finalized) {
      alert('Notes have been finalized and cannot be edited.');
      return;
    }

    setSaving(true);
    try {
      const savedNotes = await saveSessionNotes(tenantId, accessToken, session.id, {
        chiefComplaint: notes.chief_complaint,
        hpi: notes.hpi,
        examinationFindings: notes.examination_findings,
        assessment: notes.assessment,
        plan: notes.plan,
        suggestedCptCodes: notes.suggested_cpt_codes,
        suggestedIcd10Codes: notes.suggested_icd10_codes,
        complexityLevel: notes.complexity_level,
      });

      setNotes(savedNotes);
      setLastSaved(new Date());

      if (!isAutoSave) {
        alert('Notes saved successfully!');
      }
    } catch (error) {
      console.error('Failed to save notes:', error);
      if (!isAutoSave) {
        alert('Failed to save notes. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = async () => {
    if (!tenantId || !accessToken) return;
    if (!confirm('Are you sure you want to finalize these notes? They cannot be edited after finalization.')) {
      return;
    }

    // Save first
    await handleSave();

    try {
      const finalized = await finalizeSessionNotes(tenantId, accessToken, session.id);
      setNotes(finalized);
      alert('Notes have been finalized successfully!');

      if (onNotesFinalized) {
        onNotesFinalized();
      }
    } catch (error) {
      console.error('Failed to finalize notes:', error);
      alert('Failed to finalize notes. Please try again.');
    }
  };

  const toggleCptCode = (code: string) => {
    const currentCodes = notes.suggested_cpt_codes || [];
    if (currentCodes.includes(code)) {
      setNotes({
        ...notes,
        suggested_cpt_codes: currentCodes.filter(c => c !== code),
      });
    } else {
      setNotes({
        ...notes,
        suggested_cpt_codes: [...currentCodes, code],
      });
    }
  };

  const toggleIcd10Code = (code: string) => {
    const currentCodes = notes.suggested_icd10_codes || [];
    if (currentCodes.includes(code)) {
      setNotes({
        ...notes,
        suggested_icd10_codes: currentCodes.filter(c => c !== code),
      });
    } else {
      setNotes({
        ...notes,
        suggested_icd10_codes: [...currentCodes, code],
      });
    }
  };

  const generateAISuggestions = () => {
    // Mock AI suggestions based on chief complaint
    const chiefComplaint = notes.chief_complaint?.toLowerCase() || '';

    let suggestedCpt = '99213'; // Default
    let suggestedIcd10: string[] = [];

    if (chiefComplaint.includes('acne')) {
      suggestedIcd10 = ['L70.0'];
      suggestedCpt = '99213';
    } else if (chiefComplaint.includes('rash') || chiefComplaint.includes('eczema')) {
      suggestedIcd10 = ['L20.9', 'L30.9'];
      suggestedCpt = '99213';
    } else if (chiefComplaint.includes('psoriasis')) {
      suggestedIcd10 = ['L40.0'];
      suggestedCpt = '99214';
    }

    setNotes({
      ...notes,
      suggested_cpt_codes: [suggestedCpt],
      suggested_icd10_codes: suggestedIcd10,
    });

    setShowAISuggestions(true);
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  const containerStyle: React.CSSProperties = {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: 'white',
  };

  const headerStyle: React.CSSProperties = {
    borderBottom: '1px solid #e5e7eb',
    padding: '1rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: '#f9fafb',
  };

  const contentStyle: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    padding: '1.5rem',
  };

  const sectionStyle: React.CSSProperties = {
    marginBottom: '1.5rem',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: '#374151',
    marginBottom: '0.5rem',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.5rem 1rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
  };

  const textareaStyle: React.CSSProperties = {
    ...inputStyle,
    resize: 'vertical',
  };

  const footerStyle: React.CSSProperties = {
    borderTop: '1px solid #e5e7eb',
    padding: '1rem',
    background: '#f9fafb',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  };

  const codeGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '0.5rem',
  };

  const codeItemStyle = (isSelected: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    padding: '0.75rem',
    border: `1px solid ${isSelected ? '#4f46e5' : '#e5e7eb'}`,
    borderRadius: '0.5rem',
    cursor: 'pointer',
    background: isSelected ? '#eef2ff' : 'white',
  });

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>Session Notes</h2>
          <p style={{ fontSize: '0.875rem', color: '#4b5563', margin: 0 }}>
            {session.patient_first_name} {session.patient_last_name}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {lastSaved && (
            <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              Last saved: {lastSaved.toLocaleTimeString()}
            </span>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
            <input
              type="checkbox"
              checked={autoSaveEnabled}
              onChange={(e) => setAutoSaveEnabled(e.target.checked)}
            />
            <span>Auto-save</span>
          </label>
          {saving && <LoadingSpinner size="small" />}
        </div>
      </div>

      <div style={contentStyle}>
        <div style={{ maxWidth: '56rem', margin: '0 auto' }}>
          {/* Chief Complaint */}
          <div style={sectionStyle}>
            <label style={labelStyle}>Chief Complaint</label>
            <input
              type="text"
              value={notes.chief_complaint || ''}
              onChange={(e) => setNotes({ ...notes, chief_complaint: e.target.value })}
              disabled={notes.finalized}
              placeholder="e.g., Rash on arms for 2 weeks"
              style={inputStyle}
            />
          </div>

          {/* HPI */}
          <div style={sectionStyle}>
            <label style={labelStyle}>History of Present Illness (HPI)</label>
            <textarea
              value={notes.hpi || ''}
              onChange={(e) => setNotes({ ...notes, hpi: e.target.value })}
              disabled={notes.finalized}
              rows={4}
              placeholder="Document onset, location, duration, characteristics, aggravating/alleviating factors, associated symptoms..."
              style={textareaStyle}
            />
          </div>

          {/* Examination Findings */}
          <div style={sectionStyle}>
            <label style={labelStyle}>Examination Findings</label>
            <textarea
              value={notes.examination_findings || ''}
              onChange={(e) => setNotes({ ...notes, examination_findings: e.target.value })}
              disabled={notes.finalized}
              rows={4}
              placeholder="Document visual findings, lesion characteristics, distribution..."
              style={textareaStyle}
            />
          </div>

          {/* Photos captured during session */}
          {photos.length > 0 && (
            <div style={sectionStyle}>
              <label style={labelStyle}>Photos Captured During Session ({photos.length})</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                {photos.map((photo) => (
                  <div key={photo.id} style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '0.5rem' }}>
                    <div style={{
                      aspectRatio: '1',
                      background: '#e5e7eb',
                      borderRadius: '0.25rem',
                      marginBottom: '0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <span style={{ fontSize: '2rem' }}></span>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: '#4b5563', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {photo.body_site || 'Unknown site'}
                    </p>
                    <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0 }}>
                      {new Date(photo.captured_at).toLocaleTimeString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Assessment */}
          <div style={sectionStyle}>
            <label style={labelStyle}>Assessment / Diagnosis</label>
            <textarea
              value={notes.assessment || ''}
              onChange={(e) => setNotes({ ...notes, assessment: e.target.value })}
              disabled={notes.finalized}
              rows={3}
              placeholder="Clinical impression and diagnosis..."
              style={textareaStyle}
            />
          </div>

          {/* Plan */}
          <div style={sectionStyle}>
            <label style={labelStyle}>Plan</label>
            <textarea
              value={notes.plan || ''}
              onChange={(e) => setNotes({ ...notes, plan: e.target.value })}
              disabled={notes.finalized}
              rows={4}
              placeholder="Treatment plan, medications, follow-up, patient education..."
              style={textareaStyle}
            />
          </div>

          {/* AI Suggestions Button */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
            <Button
              onClick={generateAISuggestions}
              variant="secondary"
              disabled={notes.finalized || !notes.chief_complaint}
            >
              Generate AI Suggestions
            </Button>
          </div>

          {/* Billing Codes */}
          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1.5rem' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem' }}>Billing Codes</h3>

            {/* CPT Codes */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={labelStyle}>CPT Codes (Select applicable)</label>
              <div style={codeGridStyle}>
                {commonCptCodes.map((cpt) => (
                  <label
                    key={cpt.code}
                    style={codeItemStyle(notes.suggested_cpt_codes?.includes(cpt.code) || false)}
                  >
                    <input
                      type="checkbox"
                      checked={notes.suggested_cpt_codes?.includes(cpt.code) || false}
                      onChange={() => toggleCptCode(cpt.code)}
                      disabled={notes.finalized}
                      style={{ marginRight: '0.75rem' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{cpt.code}</div>
                      <div style={{ fontSize: '0.875rem', color: '#4b5563' }}>{cpt.description}</div>
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>RVU: {cpt.rvu}</div>
                  </label>
                ))}
              </div>
            </div>

            {/* ICD-10 Codes */}
            <div>
              <label style={labelStyle}>ICD-10 Diagnosis Codes (Select applicable)</label>
              <div style={codeGridStyle}>
                {commonIcd10Codes.map((icd) => (
                  <label
                    key={icd.code}
                    style={codeItemStyle(notes.suggested_icd10_codes?.includes(icd.code) || false)}
                  >
                    <input
                      type="checkbox"
                      checked={notes.suggested_icd10_codes?.includes(icd.code) || false}
                      onChange={() => toggleIcd10Code(icd.code)}
                      disabled={notes.finalized}
                      style={{ marginRight: '0.75rem' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{icd.code}</div>
                      <div style={{ fontSize: '0.875rem', color: '#4b5563' }}>{icd.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Complexity Level */}
            <div style={{ marginTop: '1rem' }}>
              <label style={labelStyle}>Visit Complexity Level</label>
              <select
                value={notes.complexity_level || ''}
                onChange={(e) => setNotes({ ...notes, complexity_level: e.target.value })}
                disabled={notes.finalized}
                style={inputStyle}
              >
                <option value="">Select complexity...</option>
                <option value="straightforward">Straightforward</option>
                <option value="low">Low Complexity</option>
                <option value="moderate">Moderate Complexity</option>
                <option value="high">High Complexity</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div style={footerStyle}>
        <div style={{ fontSize: '0.875rem', color: '#4b5563' }}>
          {notes.finalized && (
            <span style={{ color: '#16a34a', fontWeight: 600 }}>
              Notes finalized on {new Date(notes.finalized_at!).toLocaleString()}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button onClick={() => handleSave()} disabled={saving || notes.finalized} variant="secondary">
            {saving ? 'Saving...' : 'Save Draft'}
          </Button>
          <Button onClick={handleFinalize} disabled={notes.finalized} variant="primary">
            Finalize Notes
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TelehealthNotes;
