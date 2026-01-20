import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { KioskLayout } from '../../components/kiosk/KioskLayout';
import { SignaturePad } from '../../components/kiosk/SignaturePad';
import '../../styles/kiosk.css';

interface ConsentForm {
  id: string;
  formName: string;
  formType: string;
  formContent: string;
  requiresSignature: boolean;
  version: string;
}

const cardStyle: React.CSSProperties = {
  background: 'white',
  borderRadius: '1rem',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  padding: '2rem',
};

export function KioskConsentFormsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [consentForms, setConsentForms] = useState<ConsentForm[]>([]);
  const [currentFormIndex, setCurrentFormIndex] = useState(0);
  const [showSignature, setShowSignature] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [signing, setSigning] = useState(false);

  const sessionId = sessionStorage.getItem('kioskSessionId');

  useEffect(() => {
    if (!sessionId) {
      navigate('/kiosk');
      return;
    }

    fetchConsentForms();
  }, [sessionId]);

  const fetchConsentForms = async () => {
    try {
      const response = await fetch('/api/consent-forms/active', {
        headers: {
          'X-Kiosk-Code': localStorage.getItem('kioskCode') || 'KIOSK-001',
          'X-Tenant-Id': localStorage.getItem('tenantId') || 'modmed-demo',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch consent forms');
      }

      const data = await response.json();
      setConsentForms(data.forms || []);
    } catch (err) {
      setError('Unable to load consent forms.');
      console.error('Error fetching consent forms:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTimeout = () => {
    sessionStorage.clear();
    navigate('/kiosk');
  };

  const handleBack = () => {
    if (showSignature) {
      setShowSignature(false);
      setAgreed(false);
    } else if (currentFormIndex > 0) {
      setCurrentFormIndex(currentFormIndex - 1);
      setHasScrolledToBottom(false);
      setAgreed(false);
    } else {
      navigate('/kiosk/insurance');
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const element = e.currentTarget;
    const isAtBottom = element.scrollHeight - element.scrollTop <= element.clientHeight + 50;
    if (isAtBottom) {
      setHasScrolledToBottom(true);
    }
  };

  const handleContinue = () => {
    if (!agreed) {
      setError('Please agree to the consent form before continuing');
      return;
    }

    if (consentForms[currentFormIndex].requiresSignature) {
      setShowSignature(true);
    } else {
      moveToNextForm();
    }
  };

  const handleSignatureSave = async (signatureData: string) => {
    setSigning(true);
    setError('');

    try {
      const response = await fetch(`/api/kiosk/checkin/${sessionId}/signature`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Kiosk-Code': localStorage.getItem('kioskCode') || 'KIOSK-001',
          'X-Tenant-Id': localStorage.getItem('tenantId') || 'modmed-demo',
        },
        body: JSON.stringify({
          signatureData,
          consentFormId: consentForms[currentFormIndex].id,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save signature');
      }

      moveToNextForm();
    } catch (err) {
      setError('Failed to save signature. Please try again.');
      console.error('Error saving signature:', err);
    } finally {
      setSigning(false);
    }
  };

  const moveToNextForm = () => {
    if (currentFormIndex < consentForms.length - 1) {
      setCurrentFormIndex(currentFormIndex + 1);
      setShowSignature(false);
      setAgreed(false);
      setHasScrolledToBottom(false);
    } else {
      completeCheckIn();
    }
  };

  const completeCheckIn = async () => {
    try {
      const response = await fetch(`/api/kiosk/checkin/${sessionId}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Kiosk-Code': localStorage.getItem('kioskCode') || 'KIOSK-001',
          'X-Tenant-Id': localStorage.getItem('tenantId') || 'modmed-demo',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to complete check-in');
      }

      navigate('/kiosk/complete');
    } catch (err) {
      setError('Failed to complete check-in. Please see the front desk.');
      console.error('Error completing check-in:', err);
    }
  };

  if (loading) {
    return (
      <KioskLayout currentStep={4} totalSteps={6} stepName="Loading..." onTimeout={handleTimeout}>
        <div style={{ ...cardStyle, textAlign: 'center', padding: '3rem' }}>
          <div className="kiosk-spinner" style={{ margin: '0 auto 1rem' }} />
          <p style={{ fontSize: '1.5rem', color: '#4b5563' }}>Loading consent forms...</p>
        </div>
      </KioskLayout>
    );
  }

  if (consentForms.length === 0) {
    // No consent forms, skip to completion
    completeCheckIn();
    return null;
  }

  const currentForm = consentForms[currentFormIndex];

  if (showSignature) {
    return (
      <KioskLayout currentStep={5} totalSteps={6} stepName="Sign Consent" onTimeout={handleTimeout}>
        <div style={cardStyle}>
          <h2 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', marginBottom: '1rem' }}>
            Sign: {currentForm.formName}
          </h2>
          <p style={{ fontSize: '1.25rem', color: '#4b5563', marginBottom: '2rem' }}>
            Please sign below to acknowledge your consent.
          </p>

          <div style={{ marginBottom: '2rem' }}>
            <p style={{ fontSize: '1.125rem', color: '#374151', marginBottom: '1rem' }}>
              Sign using your finger or stylus in the box below:
            </p>
            <SignaturePad onSave={handleSignatureSave} width={800} height={250} />
          </div>

          {signing && (
            <div style={{ textAlign: 'center', padding: '1rem' }}>
              <div className="kiosk-spinner" style={{ margin: '0 auto 0.5rem' }} />
              <p style={{ fontSize: '1.125rem', color: '#4b5563' }}>Saving signature...</p>
            </div>
          )}

          {error && <div className="kiosk-error">{error}</div>}

          <button onClick={handleBack} className="kiosk-btn-secondary" style={{ width: '100%' }}>
            Back
          </button>
        </div>
      </KioskLayout>
    );
  }

  return (
    <KioskLayout currentStep={4} totalSteps={6} stepName="Review & Sign Consent" onTimeout={handleTimeout}>
      <div style={cardStyle}>
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', marginBottom: '0.5rem' }}>
            {currentForm.formName}
          </h2>
          <p style={{ fontSize: '1.125rem', color: '#4b5563' }}>
            Form {currentFormIndex + 1} of {consentForms.length}
          </p>
        </div>

        <div
          onScroll={handleScroll}
          style={{
            background: '#f9fafb',
            border: '2px solid #d1d5db',
            borderRadius: '0.5rem',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            overflowY: 'auto',
            maxHeight: '400px',
          }}
        >
          {/* Sanitize HTML content to prevent XSS attacks */}
          <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(currentForm.formContent) }} />
        </div>

        {!hasScrolledToBottom && (
          <div style={{
            marginBottom: '1.5rem',
            padding: '1rem',
            background: '#fef3c7',
            border: '2px solid #fcd34d',
            borderRadius: '0.5rem',
            textAlign: 'center',
          }}>
            <p style={{ fontSize: '1.125rem', color: '#92400e' }}>Please scroll to the bottom to continue</p>
          </div>
        )}

        {hasScrolledToBottom && (
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              padding: '1rem',
              background: '#f3e8ff',
              border: '2px solid #c4b5fd',
              borderRadius: '0.5rem',
              cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                style={{ width: '2rem', height: '2rem', marginRight: '1rem' }}
              />
              <span style={{ fontSize: '1.25rem', fontWeight: 500, color: '#111827' }}>
                I have read and agree to this consent form
              </span>
            </label>
          </div>
        )}

        {error && <div className="kiosk-error">{error}</div>}

        <div className="kiosk-nav-buttons">
          <button onClick={handleBack} className="kiosk-btn-secondary" style={{ flex: 1 }}>
            Back
          </button>
          <button
            onClick={handleContinue}
            disabled={!agreed || !hasScrolledToBottom}
            className="kiosk-btn-primary"
            style={{ flex: 1 }}
          >
            {currentForm.requiresSignature ? 'Continue to Sign' : 'Continue'}
          </button>
        </div>
      </div>
    </KioskLayout>
  );
}
