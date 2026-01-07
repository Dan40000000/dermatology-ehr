import { useState, useRef, DragEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { uploadDocumentFile } from '../../api';

interface DocumentUploadProps {
  onUpload: (file: File, url: string) => void;
  accept?: string;
  maxSizeMB?: number;
}

export function DocumentUpload({ onUpload, accept = '*/*', maxSizeMB = 10 }: DocumentUploadProps) {
  const { session } = useAuth();
  const { showError, showSuccess } = useToast();
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleFile = async (file: File) => {
    if (!session) {
      showError('Not authenticated');
      return;
    }

    // Validate file size
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > maxSizeMB) {
      showError(`File size exceeds ${maxSizeMB}MB limit`);
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      const result = await uploadDocumentFile(session.tenantId, session.accessToken, file);

      clearInterval(progressInterval);
      setUploadProgress(100);

      showSuccess(`File "${file.name}" uploaded successfully`);
      onUpload(file, result.url);

      // Reset
      setTimeout(() => {
        setUploadProgress(0);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }, 1000);
    } catch (error: any) {
      showError(error.message || 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${isDragging ? '#3b82f6' : '#d1d5db'}`,
          borderRadius: '8px',
          padding: '2rem',
          textAlign: 'center',
          background: isDragging ? '#eff6ff' : '#f9fafb',
          cursor: uploading ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handleFileSelect}
          style={{ display: 'none' }}
          disabled={uploading}
        />

        <div
          style={{
            fontSize: '2rem',
            marginBottom: '0.5rem',
          }}
        >
        </div>

        {uploading ? (
          <div>
            <div style={{ fontWeight: 500, color: '#3b82f6', marginBottom: '0.5rem' }}>Uploading...</div>
            <div
              style={{
                width: '100%',
                height: '4px',
                background: '#e5e7eb',
                borderRadius: '2px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${uploadProgress}%`,
                  height: '100%',
                  background: '#3b82f6',
                  transition: 'width 0.3s',
                }}
              />
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontWeight: 500, color: '#374151', marginBottom: '0.25rem' }}>
              Drop file here or click to browse
            </div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              Maximum file size: {maxSizeMB}MB
            </div>
          </>
        )}
      </div>
    </div>
  );
}
