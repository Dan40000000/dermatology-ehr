/**
 * Check-In Kiosk Component
 *
 * Self-service check-in screen for patient kiosks
 * Allows patients to check in and see wait time estimate
 */

import { useState, useCallback } from 'react';
import { WaitEstimate } from './WaitEstimate';

interface KioskConfig {
  welcomeMessage: string;
  showWaitTime: boolean;
  customBranding: {
    logoUrl?: string;
    primaryColor?: string;
    secondaryColor?: string;
    practiceName?: string;
  };
}

interface CheckInResult {
  success: boolean;
  displayName: string;
  position: number;
  estimatedWaitMinutes: number;
  estimatedCallTime: string;
  providerName?: string;
  queueNumber?: number;
}

interface CheckInKioskProps {
  config: KioskConfig;
  onCheckIn: (appointmentCode: string) => Promise<CheckInResult>;
  onNeedHelp?: () => void;
  className?: string;
}

type KioskStep = 'welcome' | 'input' | 'confirming' | 'success' | 'error';

export function CheckInKiosk({
  config,
  onCheckIn,
  onNeedHelp,
  className = '',
}: CheckInKioskProps) {
  const [step, setStep] = useState<KioskStep>('welcome');
  const [appointmentCode, setAppointmentCode] = useState('');
  const [checkInResult, setCheckInResult] = useState<CheckInResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const primaryColor = config.customBranding.primaryColor || '#2563eb';
  const practiceName = config.customBranding.practiceName || 'Our Clinic';

  const handleStartCheckIn = useCallback(() => {
    setStep('input');
    setAppointmentCode('');
    setErrorMessage('');
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!appointmentCode.trim()) {
      setErrorMessage('Please enter your confirmation code');
      return;
    }

    setStep('confirming');
    setErrorMessage('');

    try {
      const result = await onCheckIn(appointmentCode.trim());
      if (result.success) {
        setCheckInResult(result);
        setStep('success');
      } else {
        setErrorMessage('Check-in failed. Please try again or see the front desk.');
        setStep('error');
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'An error occurred. Please see the front desk.'
      );
      setStep('error');
    }
  }, [appointmentCode, onCheckIn]);

  const handleReset = useCallback(() => {
    setStep('welcome');
    setAppointmentCode('');
    setCheckInResult(null);
    setErrorMessage('');
  }, []);

  const handleKeypadPress = useCallback((key: string) => {
    if (key === 'clear') {
      setAppointmentCode('');
    } else if (key === 'backspace') {
      setAppointmentCode((prev) => prev.slice(0, -1));
    } else {
      setAppointmentCode((prev) => prev + key);
    }
  }, []);

  // Welcome screen
  if (step === 'welcome') {
    return (
      <div className={`check-in-kiosk min-h-screen flex flex-col ${className}`}>
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          {config.customBranding.logoUrl && (
            <img
              src={config.customBranding.logoUrl}
              alt={practiceName}
              className="h-24 mb-8"
            />
          )}
          <h1 className="text-4xl font-bold text-gray-800 mb-4">
            {config.welcomeMessage}
          </h1>
          <p className="text-xl text-gray-600 mb-12">
            Tap below to check in for your appointment
          </p>
          <button
            onClick={handleStartCheckIn}
            className="px-12 py-6 text-2xl font-bold text-white rounded-2xl shadow-lg hover:shadow-xl transition-all"
            style={{ backgroundColor: primaryColor }}
          >
            Check In Now
          </button>
        </div>
        {onNeedHelp && (
          <div className="p-6 text-center">
            <button
              onClick={onNeedHelp}
              className="text-gray-500 hover:text-gray-700 text-lg"
            >
              Need help? See the front desk
            </button>
          </div>
        )}
      </div>
    );
  }

  // Code input screen
  if (step === 'input') {
    return (
      <div className={`check-in-kiosk min-h-screen flex flex-col ${className}`}>
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <h2 className="text-3xl font-bold text-gray-800 mb-4">
            Enter Your Confirmation Code
          </h2>
          <p className="text-gray-600 mb-8">
            This was sent to you via text or email
          </p>

          {/* Code display */}
          <div className="bg-gray-100 rounded-xl px-8 py-4 mb-8 min-w-[300px] text-center">
            <span className="text-4xl font-mono tracking-wider">
              {appointmentCode || '------'}
            </span>
          </div>

          {errorMessage && (
            <p className="text-red-600 mb-4">{errorMessage}</p>
          )}

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-3 mb-8">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'backspace'].map(
              (key) => (
                <button
                  key={key}
                  onClick={() => handleKeypadPress(key)}
                  className={`w-20 h-20 text-2xl font-bold rounded-xl transition-all ${
                    key === 'clear'
                      ? 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                      : key === 'backspace'
                      ? 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                      : 'bg-white border-2 border-gray-300 text-gray-800 hover:border-gray-400'
                  }`}
                >
                  {key === 'clear' ? 'CLR' : key === 'backspace' ? '<-' : key}
                </button>
              )
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-4">
            <button
              onClick={handleReset}
              className="px-8 py-4 text-lg font-medium text-gray-600 bg-gray-200 rounded-xl hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!appointmentCode.trim()}
              className="px-8 py-4 text-lg font-bold text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: primaryColor }}
            >
              Check In
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Confirming screen
  if (step === 'confirming') {
    return (
      <div className={`check-in-kiosk min-h-screen flex flex-col items-center justify-center ${className}`}>
        <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-300 mb-8" style={{ borderTopColor: primaryColor }} />
        <p className="text-2xl text-gray-600">Checking you in...</p>
      </div>
    );
  }

  // Success screen
  if (step === 'success' && checkInResult) {
    return (
      <div className={`check-in-kiosk min-h-screen flex flex-col ${className}`}>
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="bg-green-100 rounded-full p-6 mb-6">
            <svg className="w-16 h-16 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-gray-800 mb-2">
            You are Checked In!
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            Welcome, {checkInResult.displayName}
          </p>

          {config.showWaitTime && (
            <div className="w-full max-w-md">
              <WaitEstimate
                position={checkInResult.position}
                estimatedWaitMinutes={checkInResult.estimatedWaitMinutes}
                estimatedCallTime={checkInResult.estimatedCallTime}
                providerName={checkInResult.providerName}
                status="waiting"
                showDetails={false}
              />
            </div>
          )}

          <div className="mt-8 text-center">
            <p className="text-gray-600 mb-4">
              Please have a seat. You will be called when it is your turn.
            </p>
            <button
              onClick={handleReset}
              className="px-8 py-3 text-lg font-medium text-white rounded-xl transition-colors"
              style={{ backgroundColor: primaryColor }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Error screen
  if (step === 'error') {
    return (
      <div className={`check-in-kiosk min-h-screen flex flex-col items-center justify-center p-8 ${className}`}>
        <div className="bg-red-100 rounded-full p-6 mb-6">
          <svg className="w-16 h-16 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-4">
          Unable to Check In
        </h2>
        <p className="text-gray-600 text-center mb-8 max-w-md">
          {errorMessage}
        </p>
        <div className="flex gap-4">
          <button
            onClick={handleReset}
            className="px-8 py-3 text-lg font-medium text-gray-600 bg-gray-200 rounded-xl hover:bg-gray-300 transition-colors"
          >
            Try Again
          </button>
          {onNeedHelp && (
            <button
              onClick={onNeedHelp}
              className="px-8 py-3 text-lg font-medium text-white rounded-xl transition-colors"
              style={{ backgroundColor: primaryColor }}
            >
              Get Help
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}

export default CheckInKiosk;
