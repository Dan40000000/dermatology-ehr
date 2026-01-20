import React, { useState, useRef, useEffect } from 'react';
import { Camera, FlipHorizontal, X, Check, Lightbulb, Grid3x3 } from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * PhotoCapture Component
 *
 * Features:
 * - Camera access for taking photos
 * - Guideline overlay for consistent angles
 * - Flash/lighting recommendations
 * - Body region selector
 * - Quick capture mode
 */

interface PhotoCaptureProps {
  onCapture: (file: File, metadata: CaptureMetadata) => void;
  onClose: () => void;
  preselectedRegion?: string;
  patientId: string;
}

export interface CaptureMetadata {
  bodyRegion: string;
  viewAngle?: string;
  lightingConditions: 'good' | 'poor' | 'flash' | 'natural';
  notes?: string;
}

const BODY_REGIONS = [
  { value: 'face', label: 'Face' },
  { value: 'chest', label: 'Chest' },
  { value: 'back', label: 'Back' },
  { value: 'arm_left', label: 'Left Arm' },
  { value: 'arm_right', label: 'Right Arm' },
  { value: 'leg_left', label: 'Left Leg' },
  { value: 'leg_right', label: 'Right Leg' },
  { value: 'hand_left', label: 'Left Hand' },
  { value: 'hand_right', label: 'Right Hand' },
  { value: 'foot_left', label: 'Left Foot' },
  { value: 'foot_right', label: 'Right Foot' },
  { value: 'abdomen', label: 'Abdomen' },
  { value: 'neck', label: 'Neck' },
  { value: 'scalp', label: 'Scalp' },
  { value: 'other', label: 'Other' },
];

const VIEW_ANGLES = [
  { value: 'frontal', label: 'Frontal' },
  { value: 'left_lateral', label: 'Left Lateral' },
  { value: 'right_lateral', label: 'Right Lateral' },
  { value: 'superior', label: 'Top View' },
  { value: 'inferior', label: 'Bottom View' },
  { value: 'closeup', label: 'Close-up' },
];

export function PhotoCapture({
  onCapture,
  onClose,
  preselectedRegion,
  patientId,
}: PhotoCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [showGuidelines, setShowGuidelines] = useState(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');

  // Metadata
  const [bodyRegion, setBodyRegion] = useState(preselectedRegion || '');
  const [viewAngle, setViewAngle] = useState('');
  const [lightingConditions, setLightingConditions] = useState<'good' | 'poor' | 'flash' | 'natural'>('natural');
  const [notes, setNotes] = useState('');

  // Start camera
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [facingMode]);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      toast.error('Could not access camera. Please check permissions.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
  };

  const takePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    setCapturedImage(dataUrl);
  };

  const retake = () => {
    setCapturedImage(null);
  };

  const flipCamera = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  const savePhoto = async () => {
    if (!capturedImage) return;

    if (!bodyRegion) {
      toast.error('Please select a body region');
      return;
    }

    // Convert data URL to File
    const response = await fetch(capturedImage);
    const blob = await response.blob();
    const file = new File(
      [blob],
      `photo_${bodyRegion}_${Date.now()}.jpg`,
      { type: 'image/jpeg' }
    );

    const metadata: CaptureMetadata = {
      bodyRegion,
      viewAngle: viewAngle || undefined,
      lightingConditions,
      notes: notes || undefined,
    };

    onCapture(file, metadata);
    stopCamera();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Header */}
      <div className="bg-gray-900 text-white p-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Capture Clinical Photo</h2>
        <button
          onClick={() => {
            stopCamera();
            onClose();
          }}
          className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Camera View */}
      <div className="flex-1 relative bg-black">
        {!capturedImage ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-full object-contain"
            />

            {/* Guidelines Overlay */}
            {showGuidelines && (
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ opacity: 0.5 }}
              >
                {/* Rule of thirds */}
                <line x1="33.33%" y1="0" x2="33.33%" y2="100%" stroke="white" strokeWidth="1" />
                <line x1="66.66%" y1="0" x2="66.66%" y2="100%" stroke="white" strokeWidth="1" />
                <line x1="0" y1="33.33%" x2="100%" y2="33.33%" stroke="white" strokeWidth="1" />
                <line x1="0" y1="66.66%" x2="100%" y2="66.66%" stroke="white" strokeWidth="1" />
                {/* Center circle */}
                <circle cx="50%" cy="50%" r="80" fill="none" stroke="white" strokeWidth="2" />
              </svg>
            )}

            {/* Camera Controls */}
            <div className="absolute bottom-8 left-0 right-0 flex items-center justify-center gap-8">
              <button
                onClick={flipCamera}
                className="p-4 bg-gray-800 bg-opacity-50 rounded-full hover:bg-opacity-70 transition-all"
              >
                <FlipHorizontal className="w-6 h-6 text-white" />
              </button>

              <button
                onClick={takePhoto}
                className="p-6 bg-white rounded-full hover:scale-110 transition-transform shadow-lg"
              >
                <Camera className="w-8 h-8 text-gray-900" />
              </button>

              <button
                onClick={() => setShowGuidelines(!showGuidelines)}
                className="p-4 bg-gray-800 bg-opacity-50 rounded-full hover:bg-opacity-70 transition-all"
              >
                <Grid3x3 className="w-6 h-6 text-white" />
              </button>
            </div>
          </>
        ) : (
          <>
            <img
              src={capturedImage}
              alt="Captured"
              className="w-full h-full object-contain"
            />

            {/* Preview Controls */}
            <div className="absolute bottom-8 left-0 right-0 flex items-center justify-center gap-8">
              <button
                onClick={retake}
                className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Retake
              </button>
              <button
                onClick={savePhoto}
                className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
              >
                <Check className="w-5 h-5" />
                Save Photo
              </button>
            </div>
          </>
        )}
      </div>

      {/* Metadata Form */}
      <div className="bg-white p-4 space-y-4 max-h-64 overflow-y-auto">
        {/* Lighting Tips */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
          <Lightbulb className="w-5 h-5 text-blue-600 mt-0.5" />
          <div className="text-sm text-blue-900">
            <p className="font-medium">Lighting Tips:</p>
            <ul className="list-disc list-inside mt-1">
              <li>Use natural light when possible</li>
              <li>Avoid harsh shadows</li>
              <li>Keep camera steady</li>
              <li>Use consistent distance for comparisons</li>
            </ul>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Body Region */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Body Region *
            </label>
            <select
              value={bodyRegion}
              onChange={(e) => setBodyRegion(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            >
              <option value="">Select region...</option>
              {BODY_REGIONS.map((region) => (
                <option key={region.value} value={region.value}>
                  {region.label}
                </option>
              ))}
            </select>
          </div>

          {/* View Angle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              View Angle
            </label>
            <select
              value={viewAngle}
              onChange={(e) => setViewAngle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select angle...</option>
              {VIEW_ANGLES.map((angle) => (
                <option key={angle.value} value={angle.value}>
                  {angle.label}
                </option>
              ))}
            </select>
          </div>

          {/* Lighting Conditions */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Lighting
            </label>
            <select
              value={lightingConditions}
              onChange={(e) => setLightingConditions(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="natural">Natural Light</option>
              <option value="flash">Flash</option>
              <option value="good">Good Lighting</option>
              <option value="poor">Poor Lighting</option>
            </select>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notes (Optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Any additional notes about this photo..."
          />
        </div>
      </div>

      {/* Hidden canvas for photo capture */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
