/**
 * PhotoUploader Component
 * Multi-photo upload with preview, compression, and body location tagging
 */

import { useState, useRef, useCallback } from 'react';
import { Button } from '../ui/Button';

export interface UploadedPhoto {
  id?: string;
  file?: File;
  previewUrl: string;
  bodyLocation: string;
  bodyLocationDetail?: string;
  bodyView?: 'front' | 'back' | 'side';
  description?: string;
  isCloseUp?: boolean;
  status: 'pending' | 'uploading' | 'uploaded' | 'error';
  errorMessage?: string;
  progress?: number;
}

interface PhotoUploaderProps {
  photos: UploadedPhoto[];
  onPhotosChange: (photos: UploadedPhoto[]) => void;
  maxPhotos?: number;
  minPhotos?: number;
  onUpload?: (photo: UploadedPhoto, file: File) => Promise<{ id: string } | void>;
  disabled?: boolean;
  photoRequirements?: Array<{
    description: string;
    bodyLocation: string;
    required: boolean;
  }>;
}

const BODY_LOCATIONS = [
  { value: 'face', label: 'Face' },
  { value: 'scalp', label: 'Scalp' },
  { value: 'neck', label: 'Neck' },
  { value: 'chest', label: 'Chest' },
  { value: 'abdomen', label: 'Abdomen' },
  { value: 'back_upper', label: 'Upper Back' },
  { value: 'back_lower', label: 'Lower Back' },
  { value: 'arm_left', label: 'Left Arm' },
  { value: 'arm_right', label: 'Right Arm' },
  { value: 'hand_left', label: 'Left Hand' },
  { value: 'hand_right', label: 'Right Hand' },
  { value: 'leg_left', label: 'Left Leg' },
  { value: 'leg_right', label: 'Right Leg' },
  { value: 'foot_left', label: 'Left Foot' },
  { value: 'foot_right', label: 'Right Foot' },
  { value: 'groin', label: 'Groin Area' },
  { value: 'other', label: 'Other' },
];

export function PhotoUploader({
  photos,
  onPhotosChange,
  maxPhotos = 5,
  minPhotos = 1,
  onUpload,
  disabled = false,
  photoRequirements,
}: PhotoUploaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (files: FileList) => {
      if (disabled) return;

      const remainingSlots = maxPhotos - photos.length;
      const filesToProcess = Array.from(files).slice(0, remainingSlots);

      const newPhotos: UploadedPhoto[] = [];

      for (const file of filesToProcess) {
        // Validate file type
        if (!file.type.startsWith('image/')) {
          continue;
        }

        // Create preview
        const previewUrl = URL.createObjectURL(file);

        const photo: UploadedPhoto = {
          file,
          previewUrl,
          bodyLocation: '',
          status: 'pending',
        };

        newPhotos.push(photo);
      }

      if (newPhotos.length > 0) {
        onPhotosChange([...photos, ...newPhotos]);
        // Select first new photo for editing
        setSelectedPhotoIndex(photos.length);
      }
    },
    [disabled, maxPhotos, photos, onPhotosChange]
  );

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFiles(e.target.files);
      }
    },
    [handleFiles]
  );

  const updatePhoto = (index: number, updates: Partial<UploadedPhoto>) => {
    const newPhotos = [...photos];
    newPhotos[index] = { ...newPhotos[index], ...updates };
    onPhotosChange(newPhotos);
  };

  const removePhoto = (index: number) => {
    const photo = photos[index];
    if (photo.previewUrl && photo.file) {
      URL.revokeObjectURL(photo.previewUrl);
    }
    const newPhotos = photos.filter((_, i) => i !== index);
    onPhotosChange(newPhotos);
    setSelectedPhotoIndex(null);
  };

  const handleUploadPhoto = async (index: number) => {
    if (!onUpload) return;

    const photo = photos[index];
    if (!photo.file || photo.status === 'uploading') return;

    updatePhoto(index, { status: 'uploading', progress: 0 });

    try {
      const result = await onUpload(photo, photo.file);
      updatePhoto(index, {
        status: 'uploaded',
        id: result?.id,
        progress: 100,
      });
    } catch (error: any) {
      updatePhoto(index, {
        status: 'error',
        errorMessage: error.message || 'Upload failed',
      });
    }
  };

  const selectedPhoto = selectedPhotoIndex !== null ? photos[selectedPhotoIndex] : null;

  return (
    <div className="photo-uploader">
      {/* Photo Requirements Info */}
      {photoRequirements && photoRequirements.length > 0 && (
        <div
          style={{
            background: '#f0f9ff',
            border: '1px solid #bae6fd',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1rem',
          }}
        >
          <h4 style={{ margin: '0 0 0.5rem', color: '#0369a1', fontSize: '0.875rem' }}>
            Photo Requirements
          </h4>
          <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.875rem', color: '#0c4a6e' }}>
            {photoRequirements.map((req, i) => (
              <li key={i} style={{ marginBottom: '0.25rem' }}>
                {req.description}
                {req.required && <span style={{ color: '#dc2626' }}> *</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Drop Zone */}
      <div
        className={`photo-drop-zone ${dragActive ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
        style={{
          border: `2px dashed ${dragActive ? '#3b82f6' : '#d1d5db'}`,
          borderRadius: '12px',
          padding: '2rem',
          textAlign: 'center',
          background: dragActive ? '#eff6ff' : '#f9fafb',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s ease',
          marginBottom: '1rem',
        }}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/heic"
          multiple
          style={{ display: 'none' }}
          onChange={handleInputChange}
          disabled={disabled}
        />

        <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>
          {photos.length >= maxPhotos ? '!' : '+'}
        </div>

        {photos.length >= maxPhotos ? (
          <p style={{ margin: 0, color: '#6b7280' }}>Maximum photos reached ({maxPhotos})</p>
        ) : (
          <>
            <p style={{ margin: '0 0 0.5rem', fontWeight: 500, color: '#374151' }}>
              Drop photos here or click to upload
            </p>
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#9ca3af' }}>
              JPEG, PNG, or HEIC - up to 10MB each
            </p>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
              {photos.length} of {maxPhotos} photos
              {minPhotos > 0 && ` (minimum ${minPhotos} required)`}
            </p>
          </>
        )}
      </div>

      {/* Photo Grid */}
      {photos.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
            gap: '1rem',
            marginBottom: '1rem',
          }}
        >
          {photos.map((photo, index) => (
            <div
              key={index}
              style={{
                position: 'relative',
                borderRadius: '8px',
                overflow: 'hidden',
                border:
                  selectedPhotoIndex === index
                    ? '3px solid #3b82f6'
                    : '1px solid #e5e7eb',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onClick={() => setSelectedPhotoIndex(index)}
            >
              <img
                src={photo.previewUrl}
                alt={`Photo ${index + 1}`}
                style={{
                  width: '100%',
                  height: '120px',
                  objectFit: 'cover',
                }}
              />

              {/* Status Overlay */}
              {photo.status === 'uploading' && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      border: '3px solid rgba(255,255,255,0.3)',
                      borderTopColor: '#fff',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                    }}
                  />
                </div>
              )}

              {photo.status === 'uploaded' && (
                <div
                  style={{
                    position: 'absolute',
                    top: '4px',
                    right: '4px',
                    background: '#10b981',
                    color: '#fff',
                    borderRadius: '50%',
                    width: '24px',
                    height: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                  }}
                >
                  ok
                </div>
              )}

              {photo.status === 'error' && (
                <div
                  style={{
                    position: 'absolute',
                    top: '4px',
                    right: '4px',
                    background: '#dc2626',
                    color: '#fff',
                    borderRadius: '50%',
                    width: '24px',
                    height: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                  }}
                >
                  !
                </div>
              )}

              {/* Location Badge */}
              {photo.bodyLocation && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background: 'rgba(0,0,0,0.7)',
                    color: '#fff',
                    padding: '4px 8px',
                    fontSize: '0.75rem',
                    textAlign: 'center',
                  }}
                >
                  {BODY_LOCATIONS.find((l) => l.value === photo.bodyLocation)?.label ||
                    photo.bodyLocation}
                </div>
              )}

              {/* Remove Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removePhoto(index);
                }}
                style={{
                  position: 'absolute',
                  top: '4px',
                  left: '4px',
                  background: 'rgba(0,0,0,0.7)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '50%',
                  width: '24px',
                  height: '24px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                X
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Selected Photo Details */}
      {selectedPhoto && selectedPhotoIndex !== null && (
        <div
          style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1rem',
          }}
        >
          <h4 style={{ margin: '0 0 1rem', fontSize: '1rem' }}>
            Photo {selectedPhotoIndex + 1} Details
          </h4>

          <div style={{ display: 'grid', gap: '1rem' }}>
            {/* Body Location */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>
                Body Location <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <select
                value={selectedPhoto.bodyLocation}
                onChange={(e) => updatePhoto(selectedPhotoIndex, { bodyLocation: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                }}
              >
                <option value="">Select location...</option>
                {BODY_LOCATIONS.map((loc) => (
                  <option key={loc.value} value={loc.value}>
                    {loc.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Location Detail */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>
                Specific Area (optional)
              </label>
              <input
                type="text"
                value={selectedPhoto.bodyLocationDetail || ''}
                onChange={(e) =>
                  updatePhoto(selectedPhotoIndex, { bodyLocationDetail: e.target.value })
                }
                placeholder="e.g., left cheek, between toes"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                }}
              />
            </div>

            {/* Description */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>
                Description (optional)
              </label>
              <textarea
                value={selectedPhoto.description || ''}
                onChange={(e) => updatePhoto(selectedPhotoIndex, { description: e.target.value })}
                placeholder="Describe what you want the provider to see..."
                rows={2}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  resize: 'vertical',
                }}
              />
            </div>

            {/* Options */}
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={selectedPhoto.isCloseUp || false}
                  onChange={(e) =>
                    updatePhoto(selectedPhotoIndex, { isCloseUp: e.target.checked })
                  }
                />
                Close-up photo
              </label>

              <div>
                <label style={{ marginRight: '0.5rem' }}>View:</label>
                {(['front', 'back', 'side'] as const).map((view) => (
                  <label
                    key={view}
                    style={{ marginRight: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                  >
                    <input
                      type="radio"
                      name={`view-${selectedPhotoIndex}`}
                      value={view}
                      checked={selectedPhoto.bodyView === view}
                      onChange={() => updatePhoto(selectedPhotoIndex, { bodyView: view })}
                    />
                    {view.charAt(0).toUpperCase() + view.slice(1)}
                  </label>
                ))}
              </div>
            </div>

            {/* Error Message */}
            {selectedPhoto.status === 'error' && selectedPhoto.errorMessage && (
              <div
                style={{
                  background: '#fef2f2',
                  color: '#dc2626',
                  padding: '0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                }}
              >
                {selectedPhoto.errorMessage}
              </div>
            )}

            {/* Upload Button */}
            {onUpload && selectedPhoto.status !== 'uploaded' && (
              <Button
                onClick={() => handleUploadPhoto(selectedPhotoIndex)}
                disabled={!selectedPhoto.bodyLocation || selectedPhoto.status === 'uploading'}
                loading={selectedPhoto.status === 'uploading'}
              >
                {selectedPhoto.status === 'error' ? 'Retry Upload' : 'Upload Photo'}
              </Button>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
