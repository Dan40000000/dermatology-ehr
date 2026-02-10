/**
 * CardScanner Component
 *
 * Provides camera/upload interface for scanning insurance cards
 * Supports both file upload and camera capture
 * Processes front and back of insurance card
 */

import React, { useState, useRef, useCallback } from 'react';
import { Camera, Upload, X, RotateCcw, Check, Loader2 } from 'lucide-react';
import { api } from '../../api';

interface CardScannerProps {
  patientId: string;
  onScanComplete: (result: ScanResult) => void;
  onClose?: () => void;
  initialSide?: 'front' | 'back';
}

interface ScanResult {
  scanId: string;
  side: 'front' | 'back';
  extractedData: ExtractedData;
  rawText: string;
  confidence: number;
  payerMatch?: PayerMatch;
}

interface ExtractedData {
  memberId?: string;
  groupNumber?: string;
  payerName?: string;
  planType?: string;
  planName?: string;
  subscriberName?: string;
  effectiveDate?: string;
  copayPcp?: number;
  copaySpecialist?: number;
  copayEr?: number;
  claimsPhone?: string;
  priorAuthPhone?: string;
  rxBin?: string;
  rxPcn?: string;
  rxGroup?: string;
}

interface PayerMatch {
  payerId: string;
  payerName: string;
  confidence: number;
}

type ScanMode = 'upload' | 'camera';

export const CardScanner: React.FC<CardScannerProps> = ({
  patientId,
  onScanComplete,
  onClose,
  initialSide = 'front',
}) => {
  const [side, setSide] = useState<'front' | 'back'>(initialSide);
  const [mode, setMode] = useState<ScanMode>('upload');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Handle file upload
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Read and preview the image
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Start camera
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Use back camera on mobile
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setCameraActive(true);
      }
    } catch (err) {
      setError('Could not access camera. Please allow camera permissions or use file upload.');
      setMode('upload');
    }
  };

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  // Capture image from camera
  const captureImage = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0);

    const imageData = canvas.toDataURL('image/jpeg', 0.9);
    setImagePreview(imageData);
    stopCamera();
  };

  // Process the scanned image
  const processImage = async () => {
    if (!imagePreview) return;

    setIsProcessing(true);
    setError(null);

    try {
      // Extract base64 data (remove data URL prefix)
      const base64Data = imagePreview.split(',')[1];

      const response = await api.post('/api/insurance-ocr/scan', {
        patientId,
        imageData: base64Data,
        side,
        ocrProvider: 'mock', // Use mock for now
      });

      if (response.data.success) {
        onScanComplete({
          scanId: response.data.scan.id,
          side,
          extractedData: response.data.extractedData,
          rawText: response.data.rawText,
          confidence: response.data.scan.ocrConfidence || response.data.extractedData.confidence,
          payerMatch: response.data.payerMatch,
        });
      } else {
        setError(response.data.error || 'Failed to process image');
      }
    } catch (err) {
      console.error('Error processing image:', err);
      setError('Failed to process insurance card. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Reset scanner
  const resetScanner = () => {
    setImagePreview(null);
    setError(null);
    stopCamera();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Switch mode
  const switchMode = (newMode: ScanMode) => {
    resetScanner();
    setMode(newMode);
    if (newMode === 'camera') {
      startCamera();
    }
  };

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return (
    <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full mx-auto">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Scan Insurance Card</h2>
          <p className="text-sm text-gray-600">
            {side === 'front' ? 'Front of card' : 'Back of card'}
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Side Toggle */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex space-x-2">
          <button
            onClick={() => { setSide('front'); resetScanner(); }}
            className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
              side === 'front'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Front of Card
          </button>
          <button
            onClick={() => { setSide('back'); resetScanner(); }}
            className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
              side === 'back'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Back of Card
          </button>
        </div>
      </div>

      {/* Mode Toggle */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex space-x-2">
          <button
            onClick={() => switchMode('upload')}
            className={`flex items-center space-x-2 py-2 px-4 rounded-lg font-medium transition-colors ${
              mode === 'upload'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>Upload Image</span>
          </button>
          <button
            onClick={() => switchMode('camera')}
            className={`flex items-center space-x-2 py-2 px-4 rounded-lg font-medium transition-colors ${
              mode === 'camera'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Camera className="w-4 h-4" />
            <span>Use Camera</span>
          </button>
        </div>
      </div>

      {/* Scanner Area */}
      <div className="p-6">
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {/* Upload Mode */}
        {mode === 'upload' && !imagePreview && (
          <label className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors">
            <Upload className="w-12 h-12 text-gray-400 mb-4" />
            <span className="text-lg font-medium text-gray-600">Click to upload image</span>
            <span className="text-sm text-gray-500 mt-1">or drag and drop</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
        )}

        {/* Camera Mode */}
        {mode === 'camera' && !imagePreview && (
          <div className="relative">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-64 object-cover rounded-lg bg-gray-900"
            />
            <canvas ref={canvasRef} className="hidden" />
            {cameraActive && (
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
                <button
                  onClick={captureImage}
                  className="p-4 bg-white rounded-full shadow-lg hover:bg-gray-100 transition-colors"
                >
                  <Camera className="w-8 h-8 text-blue-600" />
                </button>
              </div>
            )}
            {!cameraActive && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900 rounded-lg">
                <Loader2 className="w-8 h-8 text-white animate-spin" />
              </div>
            )}
          </div>
        )}

        {/* Image Preview */}
        {imagePreview && (
          <div className="relative">
            <img
              src={imagePreview}
              alt={`${side} of insurance card`}
              className="w-full h-64 object-contain rounded-lg border border-gray-300"
            />
            <button
              onClick={resetScanner}
              className="absolute top-2 right-2 p-2 bg-white rounded-full shadow-lg hover:bg-gray-100"
            >
              <RotateCcw className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-gray-200 flex justify-end space-x-3">
        {onClose && (
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          onClick={processImage}
          disabled={!imagePreview || isProcessing}
          className="flex items-center space-x-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Processing...</span>
            </>
          ) : (
            <>
              <Check className="w-5 h-5" />
              <span>Scan Card</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
