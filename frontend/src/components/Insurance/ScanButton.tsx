/**
 * ScanButton Component
 *
 * Quick scan button for patient pages
 * Opens insurance card scanner modal
 * Shows scan status and last scan info
 */

import React, { useState } from 'react';
import { Camera, Check, AlertCircle, Loader2, X } from 'lucide-react';
import { CardScanner } from './CardScanner';
import { CardPreview } from './CardPreview';
import { ExtractedFieldsForm } from './ExtractedFieldsForm';
import { api } from '../../api';

interface ScanButtonProps {
  patientId: string;
  variant?: 'primary' | 'secondary' | 'icon';
  size?: 'sm' | 'md' | 'lg';
  onScanComplete?: (insuranceId: string) => void;
  className?: string;
}

interface ScanResult {
  scanId: string;
  side: 'front' | 'back';
  extractedData: ExtractedData;
  rawText: string;
  confidence: number;
  payerMatch?: {
    payerId: string;
    payerName: string;
    confidence: number;
  };
}

interface ExtractedData {
  memberId?: string;
  groupNumber?: string;
  payerName?: string;
  planType?: string;
  planName?: string;
  subscriberName?: string;
  subscriberDob?: string;
  effectiveDate?: string;
  terminationDate?: string;
  copayPcp?: number;
  copaySpecialist?: number;
  copayEr?: number;
  copayUrgentCare?: number;
  claimsPhone?: string;
  priorAuthPhone?: string;
  memberServicesPhone?: string;
  rxBin?: string;
  rxPcn?: string;
  rxGroup?: string;
}

type ModalStep = 'closed' | 'scan-front' | 'scan-back' | 'review' | 'complete';

export const ScanButton: React.FC<ScanButtonProps> = ({
  patientId,
  variant = 'primary',
  size = 'md',
  onScanComplete,
  className = '',
}) => {
  const [modalStep, setModalStep] = useState<ModalStep>('closed');
  const [frontScan, setFrontScan] = useState<ScanResult | null>(null);
  const [backScan, setBackScan] = useState<ScanResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Merge extracted data from front and back scans
  const getMergedData = (): ExtractedData => {
    const merged: ExtractedData = {};

    // Front scan typically has primary info
    if (frontScan?.extractedData) {
      Object.assign(merged, frontScan.extractedData);
    }

    // Back scan typically has phone numbers and copays - merge in if not present
    if (backScan?.extractedData) {
      const backData = backScan.extractedData;
      if (backData.copayPcp !== undefined) merged.copayPcp = backData.copayPcp;
      if (backData.copaySpecialist !== undefined) merged.copaySpecialist = backData.copaySpecialist;
      if (backData.copayEr !== undefined) merged.copayEr = backData.copayEr;
      if (backData.copayUrgentCare !== undefined) merged.copayUrgentCare = backData.copayUrgentCare;
      if (backData.claimsPhone) merged.claimsPhone = backData.claimsPhone;
      if (backData.priorAuthPhone) merged.priorAuthPhone = backData.priorAuthPhone;
      if (backData.memberServicesPhone) merged.memberServicesPhone = backData.memberServicesPhone;
      if (backData.rxBin) merged.rxBin = backData.rxBin;
      if (backData.rxPcn) merged.rxPcn = backData.rxPcn;
      if (backData.rxGroup) merged.rxGroup = backData.rxGroup;
    }

    return merged;
  };

  const handleFrontScanComplete = (result: ScanResult) => {
    setFrontScan(result);
    setModalStep('scan-back');
  };

  const handleBackScanComplete = (result: ScanResult) => {
    setBackScan(result);
    setModalStep('review');
  };

  const handleSkipBack = () => {
    setModalStep('review');
  };

  const handleConfirm = async (confirmedData: ExtractedData) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await api.post('/api/insurance-ocr/confirm', {
        scanId: frontScan?.scanId || backScan?.scanId,
        patientId,
        extractedData: confirmedData,
      });

      if (response.data.success) {
        setModalStep('complete');
        onScanComplete?.(response.data.insuranceId);

        // Close modal after success
        setTimeout(() => {
          handleClose();
        }, 2000);
      } else {
        setError(response.data.error || 'Failed to save insurance data');
      }
    } catch (err) {
      console.error('Error confirming insurance data:', err);
      setError('Failed to save insurance data. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setModalStep('closed');
    setFrontScan(null);
    setBackScan(null);
    setError(null);
  };

  const openScanner = () => {
    setModalStep('scan-front');
  };

  // Button styles based on variant and size
  const getButtonStyles = () => {
    const baseStyles = 'inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500';

    const sizeStyles = {
      sm: 'px-3 py-1.5 text-sm rounded-md',
      md: 'px-4 py-2 text-sm rounded-lg',
      lg: 'px-6 py-3 text-base rounded-lg',
    };

    const variantStyles = {
      primary: 'bg-blue-600 text-white hover:bg-blue-700',
      secondary: 'border border-gray-300 text-gray-700 bg-white hover:bg-gray-50',
      icon: 'p-2 text-gray-600 hover:bg-gray-100 rounded-full',
    };

    if (variant === 'icon') {
      return `${baseStyles} ${variantStyles[variant]} ${className}`;
    }

    return `${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`;
  };

  const getButtonContent = () => {
    if (variant === 'icon') {
      return <Camera className="w-5 h-5" />;
    }

    return (
      <>
        <Camera className="w-4 h-4 mr-2" />
        <span>Scan Insurance Card</span>
      </>
    );
  };

  return (
    <>
      {/* Trigger Button */}
      <button
        onClick={openScanner}
        className={getButtonStyles()}
        title="Scan insurance card"
      >
        {getButtonContent()}
      </button>

      {/* Modal */}
      {modalStep !== 'closed' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={handleClose}
          />

          {/* Modal Content */}
          <div className="relative z-10 max-h-[90vh] overflow-y-auto">
            {/* Scan Front Step */}
            {modalStep === 'scan-front' && (
              <CardScanner
                patientId={patientId}
                initialSide="front"
                onScanComplete={handleFrontScanComplete}
                onClose={handleClose}
              />
            )}

            {/* Scan Back Step */}
            {modalStep === 'scan-back' && (
              <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full mx-auto">
                <div className="p-4 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-semibold text-gray-900">Front Scanned Successfully</h2>
                      <p className="text-sm text-gray-600">Would you like to scan the back of the card?</p>
                    </div>
                    <button
                      onClick={handleClose}
                      className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Preview of front scan */}
                {frontScan && (
                  <div className="p-4">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                      <div className="flex items-center space-x-2 text-green-700">
                        <Check className="w-5 h-5" />
                        <span className="font-medium">Front of card scanned</span>
                      </div>
                      {frontScan.extractedData.payerName && (
                        <p className="text-sm text-green-600 mt-1">
                          Detected: {frontScan.extractedData.payerName}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <div className="p-4 border-t border-gray-200 flex justify-end space-x-3">
                  <button
                    onClick={handleSkipBack}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  >
                    Skip - Review Data
                  </button>
                  <button
                    onClick={() => {}}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Scan Back of Card
                  </button>
                </div>
              </div>
            )}

            {/* Review Step */}
            {modalStep === 'review' && (
              <div className="bg-white rounded-lg shadow-lg max-w-4xl w-full mx-auto">
                <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-gray-900">Review Insurance Information</h2>
                  <button
                    onClick={handleClose}
                    className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {error && (
                  <div className="m-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center text-red-700">
                    <AlertCircle className="w-5 h-5 mr-2" />
                    {error}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 p-4">
                  {/* Card Preview */}
                  <CardPreview
                    frontImageUrl={undefined}
                    backImageUrl={undefined}
                    extractedData={getMergedData()}
                    showHighlights={true}
                  />

                  {/* Form */}
                  <div className="overflow-y-auto max-h-[60vh]">
                    <ExtractedFieldsForm
                      scanId={frontScan?.scanId || backScan?.scanId || ''}
                      patientId={patientId}
                      extractedData={getMergedData()}
                      confidence={
                        ((frontScan?.confidence || 0) + (backScan?.confidence || 0)) /
                        ((frontScan ? 1 : 0) + (backScan ? 1 : 0) || 1)
                      }
                      onConfirm={handleConfirm}
                      onCancel={handleClose}
                      isSubmitting={isSubmitting}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Complete Step */}
            {modalStep === 'complete' && (
              <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-auto p-8 text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="w-8 h-8 text-green-600" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Insurance Card Saved
                </h2>
                <p className="text-gray-600">
                  The insurance information has been successfully added to the patient's record.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
