import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE_URL, TENANT_HEADER_NAME } from '../../api';
import { SignaturePad } from './SignaturePad';

interface ConsentFormField {
  id: string;
  templateId: string;
  fieldName: string;
  fieldLabel: string;
  fieldType: string;
  required: boolean;
  position: number;
  options?: { value: string; label: string }[];
  placeholder?: string;
  helpText?: string;
  validationPattern?: string;
  defaultValue?: string;
  dependsOnField?: string;
  dependsOnValue?: string;
}

interface ConsentTemplate {
  id: string;
  name: string;
  formType: string;
  contentHtml: string;
  requiredFields: string[];
  version: string;
}

interface ConsentSession {
  id: string;
  patientId: string;
  templateId: string;
  encounterId?: string;
  sessionToken: string;
  status: string;
  expiresAt: string;
  fieldValues: Record<string, unknown>;
}

interface ConsentFormProps {
  sessionToken: string;
  onSubmit?: (consent: unknown) => void;
  onCancel?: () => void;
  patientName?: string;
  requireWitness?: boolean;
}

export function ConsentForm({
  sessionToken,
  onSubmit,
  onCancel,
  patientName,
  requireWitness = false,
}: ConsentFormProps) {
  const { session: authSession } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [consentSession, setConsentSession] = useState<ConsentSession | null>(null);
  const [template, setTemplate] = useState<ConsentTemplate | null>(null);
  const [fields, setFields] = useState<ConsentFormField[]>([]);

  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({});
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [signerName, setSignerName] = useState('');
  const [signerRelationship, setSigerRelationship] = useState('self');
  const [witnessName, setWitnessName] = useState('');
  const [witnessSignature, setWitnessSignature] = useState<string | null>(null);

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Fetch session and template
  useEffect(() => {
    async function fetchSession() {
      if (!authSession) return;

      try {
        const res = await fetch(`${API_BASE_URL}/api/consents/session/${sessionToken}`, {
          headers: {
            Authorization: `Bearer ${authSession.accessToken}`,
            [TENANT_HEADER_NAME]: authSession.tenantId,
          },
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to load consent session');
        }

        const data = await res.json();
        setConsentSession(data.session);
        setTemplate(data.template);
        setFields(data.fields || []);
        setFieldValues(data.session.fieldValues || {});

        // Set default values
        const defaults: Record<string, unknown> = {};
        for (const field of data.fields || []) {
          if (field.defaultValue && !data.session.fieldValues?.[field.fieldName]) {
            defaults[field.fieldName] = field.defaultValue;
          }
        }
        if (Object.keys(defaults).length > 0) {
          setFieldValues((prev) => ({ ...defaults, ...prev }));
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }

    fetchSession();
  }, [sessionToken, authSession]);

  // Check if a field should be visible based on dependencies
  const isFieldVisible = useCallback(
    (field: ConsentFormField): boolean => {
      if (!field.dependsOnField) return true;
      const dependentValue = fieldValues[field.dependsOnField];
      return dependentValue === field.dependsOnValue;
    },
    [fieldValues]
  );

  // Handle field value change
  const handleFieldChange = useCallback((fieldName: string, value: unknown) => {
    setFieldValues((prev) => ({ ...prev, [fieldName]: value }));
    setValidationErrors((prev) => {
      const next = { ...prev };
      delete next[fieldName];
      return next;
    });
  }, []);

  // Validate form
  const validateForm = useCallback((): boolean => {
    const errors: Record<string, string> = {};

    // Validate required fields
    for (const field of fields) {
      if (!isFieldVisible(field)) continue;

      if (field.required) {
        const value = fieldValues[field.fieldName];
        if (!value || (typeof value === 'string' && !value.trim())) {
          errors[field.fieldName] = `${field.fieldLabel} is required`;
        }
      }

      // Validate pattern if provided
      if (field.validationPattern && fieldValues[field.fieldName]) {
        const regex = new RegExp(field.validationPattern);
        if (!regex.test(String(fieldValues[field.fieldName]))) {
          errors[field.fieldName] = `${field.fieldLabel} is not in the correct format`;
        }
      }
    }

    // Validate signature
    if (!signatureData) {
      errors.signature = 'Signature is required';
    }

    // Validate witness if required
    if (requireWitness) {
      if (!witnessName.trim()) {
        errors.witnessName = 'Witness name is required';
      }
      if (!witnessSignature) {
        errors.witnessSignature = 'Witness signature is required';
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [fields, fieldValues, signatureData, requireWitness, witnessName, witnessSignature, isFieldVisible]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    if (!authSession || !consentSession) return;

    setSubmitting(true);
    setError(null);

    try {
      // First, save field values
      await fetch(`${API_BASE_URL}/api/consents/session/${consentSession.id}/fields`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authSession.accessToken}`,
          [TENANT_HEADER_NAME]: authSession.tenantId,
        },
        body: JSON.stringify({ fieldValues }),
      });

      // Then submit signature
      const signResponse = await fetch(`${API_BASE_URL}/api/consents/sign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authSession.accessToken}`,
          [TENANT_HEADER_NAME]: authSession.tenantId,
        },
        body: JSON.stringify({
          sessionId: consentSession.id,
          signatureData,
          signatureType: 'drawn',
          signerName: signerName || patientName,
          signerRelationship,
          witnessName: requireWitness ? witnessName : undefined,
          witnessSignatureData: requireWitness ? witnessSignature : undefined,
        }),
      });

      if (!signResponse.ok) {
        const err = await signResponse.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to submit consent');
      }

      const result = await signResponse.json();
      onSubmit?.(result.consent);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  // Render a form field
  const renderField = (field: ConsentFormField) => {
    if (!isFieldVisible(field)) return null;

    const value = fieldValues[field.fieldName] ?? '';
    const hasError = !!validationErrors[field.fieldName];

    const commonStyles = {
      width: '100%',
      padding: '0.75rem',
      border: `1px solid ${hasError ? '#ef4444' : '#d1d5db'}`,
      borderRadius: '4px',
      fontSize: '0.875rem',
    };

    switch (field.fieldType) {
      case 'text':
        return (
          <input
            type="text"
            value={String(value)}
            onChange={(e) => handleFieldChange(field.fieldName, e.target.value)}
            placeholder={field.placeholder}
            style={commonStyles}
          />
        );

      case 'textarea':
        return (
          <textarea
            value={String(value)}
            onChange={(e) => handleFieldChange(field.fieldName, e.target.value)}
            placeholder={field.placeholder}
            rows={4}
            style={commonStyles}
          />
        );

      case 'date':
        return (
          <input
            type="date"
            value={String(value)}
            onChange={(e) => handleFieldChange(field.fieldName, e.target.value)}
            style={commonStyles}
          />
        );

      case 'checkbox':
        return (
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={!!value}
              onChange={(e) => handleFieldChange(field.fieldName, e.target.checked)}
              style={{ width: '1.25rem', height: '1.25rem' }}
            />
            <span>{field.fieldLabel}</span>
          </label>
        );

      case 'select':
        return (
          <select
            value={String(value)}
            onChange={(e) => handleFieldChange(field.fieldName, e.target.value)}
            style={commonStyles}
          >
            <option value="">Select...</option>
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );

      case 'radio':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {field.options?.map((opt) => (
              <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name={field.fieldName}
                  value={opt.value}
                  checked={value === opt.value}
                  onChange={(e) => handleFieldChange(field.fieldName, e.target.value)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        );

      default:
        return (
          <input
            type="text"
            value={String(value)}
            onChange={(e) => handleFieldChange(field.fieldName, e.target.value)}
            style={commonStyles}
          />
        );
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading consent form...</p>
      </div>
    );
  }

  if (error && !template) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#dc2626' }}>
        <p>Error: {error}</p>
        <button onClick={onCancel} style={{ marginTop: '1rem' }}>
          Go Back
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: '800px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
          {template?.name}
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
          Version {template?.version} | Please read carefully and sign below
        </p>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          style={{
            padding: '1rem',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            marginBottom: '1.5rem',
            color: '#dc2626',
          }}
        >
          {error}
        </div>
      )}

      {/* Form Content */}
      <div
        style={{
          backgroundColor: '#f9fafb',
          padding: '1.5rem',
          borderRadius: '8px',
          marginBottom: '2rem',
        }}
        dangerouslySetInnerHTML={{ __html: template?.contentHtml || '' }}
      />

      {/* Dynamic Fields */}
      {fields.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>
            Required Information
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {fields
              .filter((f) => f.fieldType !== 'checkbox')
              .sort((a, b) => a.position - b.position)
              .map((field) => {
                if (!isFieldVisible(field)) return null;

                return (
                  <div key={field.id}>
                    <label
                      style={{
                        display: 'block',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      {field.fieldLabel}
                      {field.required && <span style={{ color: '#dc2626' }}> *</span>}
                    </label>
                    {renderField(field)}
                    {field.helpText && (
                      <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                        {field.helpText}
                      </p>
                    )}
                    {validationErrors[field.fieldName] && (
                      <p style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '0.25rem' }}>
                        {validationErrors[field.fieldName]}
                      </p>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Acknowledgments (Checkboxes) */}
      {fields.filter((f) => f.fieldType === 'checkbox').length > 0 && (
        <div
          style={{
            marginBottom: '2rem',
            padding: '1.5rem',
            backgroundColor: '#fffbeb',
            borderRadius: '8px',
            border: '1px solid #fcd34d',
          }}
        >
          <h2 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem' }}>
            Acknowledgments
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {fields
              .filter((f) => f.fieldType === 'checkbox')
              .sort((a, b) => a.position - b.position)
              .map((field) => {
                if (!isFieldVisible(field)) return null;

                return (
                  <div key={field.id}>
                    {renderField(field)}
                    {validationErrors[field.fieldName] && (
                      <p style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '0.25rem' }}>
                        {validationErrors[field.fieldName]}
                      </p>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Signer Information */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>
          Signer Information
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontWeight: 500, marginBottom: '0.5rem' }}>
              Full Name <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder={patientName || 'Enter your full name'}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '0.875rem',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 500, marginBottom: '0.5rem' }}>
              Relationship to Patient
            </label>
            <select
              value={signerRelationship}
              onChange={(e) => setSigerRelationship(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '0.875rem',
              }}
            >
              <option value="self">Self (Patient)</option>
              <option value="parent">Parent/Guardian</option>
              <option value="legal_representative">Legal Representative</option>
              <option value="spouse">Spouse</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
      </div>

      {/* Patient Signature */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>
          Signature <span style={{ color: '#dc2626' }}>*</span>
        </h2>
        <SignaturePad
          onSignatureChange={setSignatureData}
          width={500}
          height={150}
        />
        {validationErrors.signature && (
          <p style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '0.5rem' }}>
            {validationErrors.signature}
          </p>
        )}
      </div>

      {/* Witness Section */}
      {requireWitness && (
        <div
          style={{
            marginBottom: '2rem',
            padding: '1.5rem',
            backgroundColor: '#f0fdf4',
            borderRadius: '8px',
            border: '1px solid #86efac',
          }}
        >
          <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>
            Witness Information
          </h2>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontWeight: 500, marginBottom: '0.5rem' }}>
              Witness Name <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              type="text"
              value={witnessName}
              onChange={(e) => setWitnessName(e.target.value)}
              placeholder="Enter witness full name"
              style={{
                width: '100%',
                padding: '0.75rem',
                border: `1px solid ${validationErrors.witnessName ? '#ef4444' : '#d1d5db'}`,
                borderRadius: '4px',
                fontSize: '0.875rem',
              }}
            />
            {validationErrors.witnessName && (
              <p style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '0.25rem' }}>
                {validationErrors.witnessName}
              </p>
            )}
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 500, marginBottom: '0.5rem' }}>
              Witness Signature <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <SignaturePad
              onSignatureChange={setWitnessSignature}
              width={400}
              height={120}
            />
            {validationErrors.witnessSignature && (
              <p style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '0.5rem' }}>
                {validationErrors.witnessSignature}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div
        style={{
          display: 'flex',
          gap: '1rem',
          justifyContent: 'flex-end',
          paddingTop: '1rem',
          borderTop: '1px solid #e5e7eb',
        }}
      >
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '0.875rem',
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#2563eb',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '0.875rem',
            fontWeight: 500,
            cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? 'Submitting...' : 'Sign and Submit Consent'}
        </button>
      </div>
    </form>
  );
}

export default ConsentForm;
