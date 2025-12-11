import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { createPatient } from '../api';

interface PatientFormData {
  firstName: string;
  lastName: string;
  middleName: string;
  preferredName: string;
  dateOfBirth: string;
  sex: 'male' | 'female' | 'other' | '';
  ssn: string;
  email: string;
  phone: string;
  cellPhone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  insuranceProvider: string;
  insuranceId: string;
  insuranceGroupNumber: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelation: string;
  allergies: string;
  primaryCarePhysician: string;
  referralSource: string;
  preferredPharmacy: string;
}

const STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

const REFERRAL_SOURCES = [
  'Primary Care Physician',
  'Other Specialist',
  'Insurance Directory',
  'Online Search',
  'Friend/Family Referral',
  'Previous Patient',
  'Other',
];

export function NewPatientPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<'demographics' | 'contact' | 'insurance' | 'medical'>('demographics');
  const [formData, setFormData] = useState<PatientFormData>({
    firstName: '',
    lastName: '',
    middleName: '',
    preferredName: '',
    dateOfBirth: '',
    sex: '',
    ssn: '',
    email: '',
    phone: '',
    cellPhone: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    insuranceProvider: '',
    insuranceId: '',
    insuranceGroupNumber: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContactRelation: '',
    allergies: '',
    primaryCarePhysician: '',
    referralSource: '',
    preferredPharmacy: '',
  });

  const updateField = (field: keyof PatientFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;

    // Basic validation
    if (!formData.firstName || !formData.lastName || !formData.dateOfBirth) {
      showError('Please fill in required fields: First Name, Last Name, and Date of Birth');
      return;
    }

    setSaving(true);
    try {
      const result = await createPatient(session.tenantId, session.accessToken, {
        firstName: formData.firstName,
        lastName: formData.lastName,
        dateOfBirth: formData.dateOfBirth,
        sex: formData.sex || undefined,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        address: formData.address
          ? {
              street: formData.address,
              city: formData.city,
              state: formData.state,
              zip: formData.zipCode,
            }
          : undefined,
        insurance: formData.insuranceProvider
          ? {
              provider: formData.insuranceProvider,
              memberId: formData.insuranceId,
            }
          : undefined,
        emergencyContact: formData.emergencyContactName
          ? {
              name: formData.emergencyContactName,
              phone: formData.emergencyContactPhone,
            }
          : undefined,
        allergies: formData.allergies || undefined,
        primaryCarePhysician: formData.primaryCarePhysician || undefined,
        referralSource: formData.referralSource || undefined,
      });

      showSuccess('Patient created successfully');
      navigate(`/patients/${result.patient.id}`);
    } catch (err: any) {
      showError(err.message || 'Failed to create patient');
    } finally {
      setSaving(false);
    }
  };

  const sections = [
    { id: 'demographics', label: 'Demographics', icon: '👤' },
    { id: 'contact', label: 'Contact Info', icon: '📞' },
    { id: 'insurance', label: 'Insurance', icon: '🏥' },
    { id: 'medical', label: 'Medical Info', icon: '📋' },
  ];

  return (
    <div className="new-patient-page">
      {/* Action Bar */}
      <div className="ema-action-bar">
        <button type="button" className="ema-action-btn" onClick={() => navigate('/patients')}>
          <span className="icon">←</span>
          Back to Patients
        </button>
        <button type="button" className="ema-action-btn" onClick={handleSubmit} disabled={saving}>
          <span className="icon">💾</span>
          {saving ? 'Saving...' : 'Save Patient'}
        </button>
        <button type="button" className="ema-action-btn" onClick={() => navigate('/patients')}>
          <span className="icon">❌</span>
          Cancel
        </button>
      </div>

      {/* Section Header */}
      <div className="ema-section-header">
        New Patient Registration
      </div>

      {/* Section Tabs */}
      <div style={{
        display: 'flex',
        background: '#f3f4f6',
        borderBottom: '1px solid #e5e7eb'
      }}>
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => setActiveSection(section.id as any)}
            style={{
              padding: '0.75rem 1.5rem',
              background: activeSection === section.id ? '#ffffff' : 'transparent',
              border: 'none',
              borderBottom: activeSection === section.id ? '3px solid #0369a1' : '3px solid transparent',
              color: activeSection === section.id ? '#0369a1' : '#6b7280',
              fontWeight: activeSection === section.id ? 600 : 400,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem'
            }}
          >
            <span>{section.icon}</span>
            {section.label}
          </button>
        ))}
      </div>

      {/* Form Content */}
      <form onSubmit={handleSubmit} style={{ background: '#ffffff', padding: '1.5rem' }}>
        {activeSection === 'demographics' && (
          <div>
            <div className="ema-section-header" style={{ marginBottom: '1rem' }}>Patient Demographics</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
              <div className="form-field">
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 500, color: '#374151' }}>
                  Last Name *
                </label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => updateField('lastName', e.target.value)}
                  placeholder="Last name"
                  required
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
              <div className="form-field">
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 500, color: '#374151' }}>
                  First Name *
                </label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => updateField('firstName', e.target.value)}
                  placeholder="First name"
                  required
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
              <div className="form-field">
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 500, color: '#374151' }}>
                  Middle Name
                </label>
                <input
                  type="text"
                  value={formData.middleName}
                  onChange={(e) => updateField('middleName', e.target.value)}
                  placeholder="Middle name"
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
              <div className="form-field">
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 500, color: '#374151' }}>
                  Preferred Name
                </label>
                <input
                  type="text"
                  value={formData.preferredName}
                  onChange={(e) => updateField('preferredName', e.target.value)}
                  placeholder="Preferred name"
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
              <div className="form-field">
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 500, color: '#374151' }}>
                  Date of Birth *
                </label>
                <input
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={(e) => updateField('dateOfBirth', e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
              <div className="form-field">
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 500, color: '#374151' }}>
                  Sex
                </label>
                <select
                  value={formData.sex}
                  onChange={(e) => updateField('sex', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '0.875rem',
                    background: '#ffffff'
                  }}
                >
                  <option value="">Select...</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="form-field">
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 500, color: '#374151' }}>
                  SSN (Last 4)
                </label>
                <input
                  type="text"
                  value={formData.ssn}
                  onChange={(e) => updateField('ssn', e.target.value)}
                  placeholder="XXXX"
                  maxLength={4}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
            </div>

            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setActiveSection('contact')}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#0369a1',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.875rem'
                }}
              >
                Next: Contact Info →
              </button>
            </div>
          </div>
        )}

        {activeSection === 'contact' && (
          <div>
            <div className="ema-section-header" style={{ marginBottom: '1rem' }}>Contact Information</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
              <div className="form-field">
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 500, color: '#374151' }}>
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  placeholder="email@example.com"
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
              <div className="form-field">
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 500, color: '#374151' }}>
                  Home Phone
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => updateField('phone', e.target.value)}
                  placeholder="(555) 123-4567"
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
              <div className="form-field">
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 500, color: '#374151' }}>
                  Cell Phone
                </label>
                <input
                  type="tel"
                  value={formData.cellPhone}
                  onChange={(e) => updateField('cellPhone', e.target.value)}
                  placeholder="(555) 123-4567"
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
            </div>

            <div className="ema-section-header" style={{ margin: '1.5rem 0 1rem' }}>Address</div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '1rem' }}>
              <div className="form-field">
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 500, color: '#374151' }}>
                  Street Address
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => updateField('address', e.target.value)}
                  placeholder="123 Main St"
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
              <div className="form-field">
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 500, color: '#374151' }}>
                  City
                </label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => updateField('city', e.target.value)}
                  placeholder="City"
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
              <div className="form-field">
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 500, color: '#374151' }}>
                  State
                </label>
                <select
                  value={formData.state}
                  onChange={(e) => updateField('state', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '0.875rem',
                    background: '#ffffff'
                  }}
                >
                  <option value="">Select...</option>
                  {STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 500, color: '#374151' }}>
                  ZIP Code
                </label>
                <input
                  type="text"
                  value={formData.zipCode}
                  onChange={(e) => updateField('zipCode', e.target.value)}
                  placeholder="12345"
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
            </div>

            <div className="ema-section-header" style={{ margin: '1.5rem 0 1rem' }}>Emergency Contact</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
              <div className="form-field">
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 500, color: '#374151' }}>
                  Contact Name
                </label>
                <input
                  type="text"
                  value={formData.emergencyContactName}
                  onChange={(e) => updateField('emergencyContactName', e.target.value)}
                  placeholder="Emergency contact name"
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
              <div className="form-field">
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 500, color: '#374151' }}>
                  Contact Phone
                </label>
                <input
                  type="tel"
                  value={formData.emergencyContactPhone}
                  onChange={(e) => updateField('emergencyContactPhone', e.target.value)}
                  placeholder="(555) 123-4567"
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
              <div className="form-field">
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 500, color: '#374151' }}>
                  Relationship
                </label>
                <input
                  type="text"
                  value={formData.emergencyContactRelation}
                  onChange={(e) => updateField('emergencyContactRelation', e.target.value)}
                  placeholder="e.g., Spouse, Parent"
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
            </div>

            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between' }}>
              <button
                type="button"
                onClick={() => setActiveSection('demographics')}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#f3f4f6',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.875rem'
                }}
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('insurance')}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#0369a1',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.875rem'
                }}
              >
                Next: Insurance →
              </button>
            </div>
          </div>
        )}

        {activeSection === 'insurance' && (
          <div>
            <div className="ema-section-header" style={{ marginBottom: '1rem' }}>Insurance Information</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
              <div className="form-field">
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 500, color: '#374151' }}>
                  Insurance Provider
                </label>
                <input
                  type="text"
                  value={formData.insuranceProvider}
                  onChange={(e) => updateField('insuranceProvider', e.target.value)}
                  placeholder="e.g., Blue Cross Blue Shield"
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
              <div className="form-field">
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 500, color: '#374151' }}>
                  Member ID
                </label>
                <input
                  type="text"
                  value={formData.insuranceId}
                  onChange={(e) => updateField('insuranceId', e.target.value)}
                  placeholder="Insurance member ID"
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
              <div className="form-field">
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 500, color: '#374151' }}>
                  Group Number
                </label>
                <input
                  type="text"
                  value={formData.insuranceGroupNumber}
                  onChange={(e) => updateField('insuranceGroupNumber', e.target.value)}
                  placeholder="Group number"
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
            </div>

            <div style={{
              marginTop: '1.5rem',
              padding: '1rem',
              background: '#f0fdf4',
              border: '1px solid #10b981',
              borderRadius: '8px'
            }}>
              <div style={{ fontWeight: 500, color: '#047857', marginBottom: '0.5rem' }}>Insurance Verification</div>
              <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                Insurance eligibility will be verified when the patient is saved. Ensure the member ID and group number are accurate.
              </div>
            </div>

            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between' }}>
              <button
                type="button"
                onClick={() => setActiveSection('contact')}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#f3f4f6',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.875rem'
                }}
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('medical')}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#0369a1',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.875rem'
                }}
              >
                Next: Medical Info →
              </button>
            </div>
          </div>
        )}

        {activeSection === 'medical' && (
          <div>
            <div className="ema-section-header" style={{ marginBottom: '1rem' }}>Medical Information</div>
            <div style={{ display: 'grid', gap: '1rem' }}>
              <div className="form-field">
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 500, color: '#374151' }}>
                  Known Allergies
                </label>
                <textarea
                  value={formData.allergies}
                  onChange={(e) => updateField('allergies', e.target.value)}
                  placeholder="List any known allergies (medications, latex, etc.)"
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '0.875rem',
                    fontFamily: 'inherit'
                  }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                <div className="form-field">
                  <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 500, color: '#374151' }}>
                    Primary Care Physician
                  </label>
                  <input
                    type="text"
                    value={formData.primaryCarePhysician}
                    onChange={(e) => updateField('primaryCarePhysician', e.target.value)}
                    placeholder="Dr. Name"
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '0.875rem'
                    }}
                  />
                </div>
                <div className="form-field">
                  <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 500, color: '#374151' }}>
                    Referral Source
                  </label>
                  <select
                    value={formData.referralSource}
                    onChange={(e) => updateField('referralSource', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '0.875rem',
                      background: '#ffffff'
                    }}
                  >
                    <option value="">Select...</option>
                    {REFERRAL_SOURCES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 500, color: '#374151' }}>
                    Preferred Pharmacy
                  </label>
                  <input
                    type="text"
                    value={formData.preferredPharmacy}
                    onChange={(e) => updateField('preferredPharmacy', e.target.value)}
                    placeholder="Pharmacy name and location"
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '0.875rem'
                    }}
                  />
                </div>
              </div>
            </div>

            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between' }}>
              <button
                type="button"
                onClick={() => setActiveSection('insurance')}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#f3f4f6',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.875rem'
                }}
              >
                ← Back
              </button>
              <button
                type="submit"
                disabled={saving}
                style={{
                  padding: '0.75rem 2rem',
                  background: '#10b981',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600
                }}
              >
                {saving ? 'Creating Patient...' : 'Create Patient'}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
