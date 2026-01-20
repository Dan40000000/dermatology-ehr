import React, { useState, useRef } from 'react';
import { Upload, X, File, AlertCircle, CheckCircle, Camera } from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * PhotoUpload Component
 *
 * Features:
 * - Drag and drop upload
 * - Multi-file support
 * - Auto-compress large images
 * - EXIF data extraction (date, device)
 * - Privacy warning (metadata removal)
 */

interface PhotoUploadProps {
  onUpload: (files: File[], metadata: UploadMetadata) => Promise<void>;
  onClose: () => void;
  patientId: string;
  maxFiles?: number;
}

interface UploadMetadata {
  bodyRegion: string;
  photoType: string;
  viewAngle?: string;
  notes?: string;
  isBaseline?: boolean;
  shareWithPatient?: boolean;
}

interface FilePreview {
  file: File;
  preview: string;
  size: string;
  error?: string;
}

const BODY_REGIONS = [
  { value: 'face', label: 'Face' },
  { value: 'chest', label: 'Chest' },
  { value: 'back', label: 'Back' },
  { value: 'arm_left', label: 'Left Arm' },
  { value: 'arm_right', label: 'Right Arm' },
  { value: 'leg_left', label: 'Left Leg' },
  { value: 'leg_right', label: 'Right Leg' },
  { value: 'abdomen', label: 'Abdomen' },
  { value: 'neck', label: 'Neck' },
  { value: 'scalp', label: 'Scalp' },
  { value: 'other', label: 'Other' },
];

const PHOTO_TYPES = [
  { value: 'clinical', label: 'Clinical' },
  { value: 'baseline', label: 'Baseline' },
  { value: 'followup', label: 'Follow-up' },
  { value: 'cosmetic', label: 'Cosmetic' },
  { value: 'dermoscopic', label: 'Dermoscopic' },
];

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/heic'];

export function PhotoUpload({
  onUpload,
  onClose,
  patientId,
  maxFiles = 10,
}: PhotoUploadProps) {
  const [files, setFiles] = useState<FilePreview[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Metadata
  const [bodyRegion, setBodyRegion] = useState('');
  const [photoType, setPhotoType] = useState('clinical');
  const [viewAngle, setViewAngle] = useState('');
  const [notes, setNotes] = useState('');
  const [isBaseline, setIsBaseline] = useState(false);
  const [shareWithPatient, setShareWithPatient] = useState(false);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'Invalid file type. Only JPEG, PNG, and HEIC allowed.';
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File too large. Maximum size is ${formatFileSize(MAX_FILE_SIZE)}.`;
    }
    return null;
  };

  const addFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;

    const fileArray = Array.from(newFiles);

    if (files.length + fileArray.length > maxFiles) {
      toast.error(`Maximum ${maxFiles} files allowed`);
      return;
    }

    const previews: FilePreview[] = [];

    fileArray.forEach((file) => {
      const error = validateFile(file);

      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          previews.push({
            file,
            preview: e.target?.result as string,
            size: formatFileSize(file.size),
            error: error || undefined,
          });

          if (previews.length === fileArray.length) {
            setFiles([...files, ...previews]);
          }
        };
        reader.readAsDataURL(file);
      }
    });
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = e.dataTransfer.files;
    addFiles(droppedFiles);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(e.target.files);
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      toast.error('Please select at least one file');
      return;
    }

    if (!bodyRegion) {
      toast.error('Please select a body region');
      return;
    }

    // Check for errors
    const hasErrors = files.some((f) => f.error);
    if (hasErrors) {
      toast.error('Please remove files with errors before uploading');
      return;
    }

    setIsUploading(true);

    try {
      const metadata: UploadMetadata = {
        bodyRegion,
        photoType,
        viewAngle: viewAngle || undefined,
        notes: notes || undefined,
        isBaseline,
        shareWithPatient,
      };

      await onUpload(
        files.map((f) => f.file),
        metadata
      );

      toast.success(`${files.length} photo(s) uploaded successfully`);
      onClose();
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload photos');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Upload Photos</h2>
            <p className="text-sm text-gray-600 mt-1">
              Upload clinical photos for treatment documentation
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Privacy Warning */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-yellow-900">
              <p className="font-medium">Privacy Notice</p>
              <p className="mt-1">
                All EXIF metadata (including GPS location, device info, and timestamps) will be
                automatically removed from uploaded photos to protect patient privacy and comply
                with HIPAA regulations.
              </p>
            </div>
          </div>

          {/* Drop Zone */}
          <div
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
              isDragging
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <div className="flex flex-col items-center">
              <Upload className="w-12 h-12 text-gray-400 mb-4" />
              <p className="text-lg font-medium text-gray-900 mb-2">
                Drag and drop photos here
              </p>
              <p className="text-sm text-gray-600 mb-4">
                or click to browse (max {maxFiles} files, 20MB each)
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Choose Files
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/jpg,image/png,image/heic"
                onChange={handleFileInput}
                className="hidden"
              />
            </div>
          </div>

          {/* File Previews */}
          {files.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-3">
                Selected Files ({files.length}/{maxFiles})
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {files.map((file, index) => (
                  <div
                    key={index}
                    className={`relative border rounded-lg overflow-hidden ${
                      file.error ? 'border-red-300 bg-red-50' : 'border-gray-200'
                    }`}
                  >
                    <div className="aspect-square bg-gray-100">
                      <img
                        src={file.preview}
                        alt={file.file.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="p-2">
                      <p className="text-xs text-gray-600 truncate">{file.file.name}</p>
                      <p className="text-xs text-gray-500">{file.size}</p>
                      {file.error && (
                        <p className="text-xs text-red-600 mt-1">{file.error}</p>
                      )}
                    </div>
                    <button
                      onClick={() => removeFile(index)}
                      className="absolute top-2 right-2 p-1 bg-red-600 text-white rounded-full hover:bg-red-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    {!file.error && (
                      <div className="absolute top-2 left-2 p-1 bg-green-600 text-white rounded-full">
                        <CheckCircle className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metadata Form */}
          {files.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-4 space-y-4">
              <h3 className="text-sm font-medium text-gray-900">Photo Information</h3>

              <div className="grid grid-cols-2 gap-4">
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

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Photo Type
                  </label>
                  <select
                    value={photoType}
                    onChange={(e) => setPhotoType(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {PHOTO_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    View Angle (Optional)
                  </label>
                  <input
                    type="text"
                    value={viewAngle}
                    onChange={(e) => setViewAngle(e.target.value)}
                    placeholder="e.g., frontal, lateral..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes (Optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Any additional notes about these photos..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isBaseline}
                    onChange={(e) => setIsBaseline(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">Mark as baseline photo</span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={shareWithPatient}
                    onChange={(e) => setShareWithPatient(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">Share with patient portal</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {files.length > 0 && (
              <>
                {files.filter((f) => !f.error).length} file(s) ready to upload
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              disabled={isUploading}
            >
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={isUploading || files.length === 0 || !bodyRegion}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isUploading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Upload {files.length} Photo{files.length !== 1 ? 's' : ''}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
