import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { KioskLayout } from '../../components/kiosk/KioskLayout';
import { SignaturePad } from '../../components/kiosk/SignaturePad';

interface ConsentForm {
  id: string;
  formName: string;
  formType: string;
  formContent: string;
  requiresSignature: boolean;
  version: string;
}

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
        <div className="bg-white rounded-2xl shadow-xl p-12 text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-purple-600 mx-auto mb-4"></div>
          <p className="text-2xl text-gray-600">Loading consent forms...</p>
        </div>
      </KioskLayout>
    );
  }

  if (consentForms.length === 0) {
    // No consent forms, skip to completion
    useEffect(() => {
      completeCheckIn();
    }, []);

    return null;
  }

  const currentForm = consentForms[currentFormIndex];

  if (showSignature) {
    return (
      <KioskLayout currentStep={5} totalSteps={6} stepName="Sign Consent" onTimeout={handleTimeout}>
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Sign: {currentForm.formName}</h2>
          <p className="text-xl text-gray-600 mb-8">
            Please sign below to acknowledge your consent.
          </p>

          <div className="mb-8">
            <p className="text-lg text-gray-700 mb-4">
              Sign using your finger or stylus in the box below:
            </p>
            <SignaturePad onSave={handleSignatureSave} width={800} height={250} />
          </div>

          {signing && (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-purple-600 mx-auto mb-2"></div>
              <p className="text-lg text-gray-600">Saving signature...</p>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-50 border-2 border-red-200 rounded-lg">
              <p className="text-lg text-red-800">{error}</p>
            </div>
          )}

          <button
            onClick={handleBack}
            className="w-full py-5 text-xl font-medium text-gray-700 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Back
          </button>
        </div>
      </KioskLayout>
    );
  }

  return (
    <KioskLayout currentStep={4} totalSteps={6} stepName="Review & Sign Consent" onTimeout={handleTimeout}>
      <div className="bg-white rounded-2xl shadow-xl p-8">
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">{currentForm.formName}</h2>
          <p className="text-lg text-gray-600">
            Form {currentFormIndex + 1} of {consentForms.length}
          </p>
        </div>

        <div
          onScroll={handleScroll}
          className="bg-gray-50 border-2 border-gray-300 rounded-lg p-6 mb-6 overflow-y-auto"
          style={{ maxHeight: '400px' }}
        >
          <div
            className="prose prose-lg max-w-none"
            dangerouslySetInnerHTML={{ __html: currentForm.formContent }}
          />
        </div>

        {!hasScrolledToBottom && (
          <div className="mb-6 p-4 bg-yellow-50 border-2 border-yellow-200 rounded-lg text-center">
            <p className="text-lg text-yellow-800">Please scroll to the bottom to continue</p>
          </div>
        )}

        {hasScrolledToBottom && (
          <div className="mb-6">
            <label className="flex items-center p-4 bg-purple-50 border-2 border-purple-300 rounded-lg cursor-pointer hover:bg-purple-100">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="w-8 h-8 text-purple-600 border-2 border-gray-300 rounded focus:ring-purple-500 focus:ring-2"
              />
              <span className="ml-4 text-xl font-medium text-gray-900">
                I have read and agree to this consent form
              </span>
            </label>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 border-2 border-red-200 rounded-lg">
            <p className="text-lg text-red-800">{error}</p>
          </div>
        )}

        <div className="flex gap-4">
          <button
            onClick={handleBack}
            className="flex-1 py-5 text-xl font-medium text-gray-700 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Back
          </button>
          <button
            onClick={handleContinue}
            disabled={!agreed || !hasScrolledToBottom}
            className="flex-1 py-5 text-xl font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {currentForm.requiresSignature ? 'Continue to Sign' : 'Continue'}
          </button>
        </div>
      </div>
    </KioskLayout>
  );
}
