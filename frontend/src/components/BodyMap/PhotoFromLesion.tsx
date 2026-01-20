import React, { useState } from 'react';
import { Camera, Upload, X, Image as ImageIcon } from 'lucide-react';
import { PhotoCapture } from '../Photos/PhotoCapture';
import toast from 'react-hot-toast';

interface PhotoFromLesionProps {
  lesionId: string;
  patientId: string;
  lesionLocation: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function PhotoFromLesion({
  lesionId,
  patientId,
  lesionLocation,
  onSuccess,
  onCancel
}: PhotoFromLesionProps) {
  const [mode, setMode] = useState<'select' | 'camera' | 'upload'>('select');
  const [uploading, setUploading] = useState(false);

  const handleCameraCapture = async (file: File, metadata: any) => {
    await uploadPhoto(file, {
      ...metadata,
      lesionId,
      photoType: 'clinical',
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      await uploadPhoto(file, {
        bodyRegion: lesionLocation,
        photoType: 'clinical',
        lesionId,
        lightingConditions: 'good',
      });
    }
  };

  const uploadPhoto = async (file: File, metadata: any) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('photos', file);
      formData.append('metadata', JSON.stringify({
        patientId,
        lesionId,
        bodyRegion: metadata.bodyRegion,
        photoType: metadata.photoType || 'clinical',
        viewAngle: metadata.viewAngle,
        lightingConditions: metadata.lightingConditions || 'good',
        notes: metadata.notes,
      }));

      const response = await fetch(`/api/patients/${patientId}/photos`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to upload photo');
      }

      const result = await response.json();
      toast.success('Photo uploaded successfully');
      onSuccess();
    } catch (error: any) {
      console.error('Error uploading photo:', error);
      toast.error(error.message || 'Failed to upload photo');
    } finally {
      setUploading(false);
    }
  };

  if (mode === 'camera') {
    return (
      <PhotoCapture
        onCapture={handleCameraCapture}
        onClose={() => setMode('select')}
        preselectedRegion={lesionLocation}
        patientId={patientId}
      />
    );
  }

  return (
    <div className="bg-white rounded-lg p-6 max-w-md mx-auto">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Add Photo to Lesion</h3>
          <p className="text-sm text-gray-500 mt-1">Location: {lesionLocation}</p>
        </div>
        <button
          onClick={onCancel}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {mode === 'select' ? (
        <div className="space-y-3">
          <button
            onClick={() => setMode('camera')}
            className="w-full p-6 border-2 border-dashed border-gray-300 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-all group"
          >
            <div className="flex flex-col items-center gap-3">
              <div className="p-3 bg-purple-100 rounded-full group-hover:bg-purple-200 transition-colors">
                <Camera className="w-8 h-8 text-purple-600" />
              </div>
              <div>
                <div className="font-medium text-gray-900">Take Photo with Camera</div>
                <div className="text-sm text-gray-500">Use device camera to capture photo</div>
              </div>
            </div>
          </button>

          <button
            onClick={() => setMode('upload')}
            className="w-full p-6 border-2 border-dashed border-gray-300 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-all group"
          >
            <div className="flex flex-col items-center gap-3">
              <div className="p-3 bg-purple-100 rounded-full group-hover:bg-purple-200 transition-colors">
                <Upload className="w-8 h-8 text-purple-600" />
              </div>
              <div>
                <div className="font-medium text-gray-900">Upload Existing Photo</div>
                <div className="text-sm text-gray-500">Select from device gallery</div>
              </div>
            </div>
          </button>

          <div className="pt-4 border-t">
            <button
              onClick={onCancel}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : mode === 'upload' ? (
        <div className="space-y-4">
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="p-4 bg-purple-100 rounded-full">
                <ImageIcon className="w-12 h-12 text-purple-600" />
              </div>
              <div>
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer text-purple-600 hover:text-purple-700 font-medium"
                >
                  Choose files
                </label>
                <input
                  id="file-upload"
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/heic"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={uploading}
                />
                <p className="text-sm text-gray-500 mt-1">
                  or drag and drop
                </p>
              </div>
              <p className="text-xs text-gray-400">
                PNG, JPG, HEIC up to 20MB
              </p>
            </div>
          </div>

          {uploading && (
            <div className="flex items-center justify-center gap-2 text-purple-600">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-600"></div>
              <span>Uploading...</span>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setMode('select')}
              disabled={uploading}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Back
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
