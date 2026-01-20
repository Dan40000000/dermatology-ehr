import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { fetchPatientPhotos } from '../../api';
import { Skeleton } from '../ui';
import { Image, Calendar, MapPin, X, ZoomIn } from 'lucide-react';

interface PatientPhotoGalleryProps {
  patientId: string;
}

export function PatientPhotoGallery({ patientId }: PatientPhotoGalleryProps) {
  const { session } = useAuth();
  const [selectedPhoto, setSelectedPhoto] = useState<any>(null);
  const [groupBy, setGroupBy] = useState<'date' | 'location'>('date');

  const { data, isLoading, error } = useQuery({
    queryKey: ['patient-photos', patientId],
    queryFn: () => fetchPatientPhotos(session!.tenantId, session!.accessToken, patientId),
    enabled: !!session && !!patientId,
  });

  const photos = data?.photos || [];

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const groupPhotos = () => {
    if (groupBy === 'date') {
      const grouped: { [key: string]: any[] } = {};
      photos.forEach((photo: any) => {
        const date = formatDate(photo.capturedAt);
        if (!grouped[date]) grouped[date] = [];
        grouped[date].push(photo);
      });
      return grouped;
    } else {
      const grouped: { [key: string]: any[] } = {};
      photos.forEach((photo: any) => {
        const location = photo.bodyLocation || 'Unknown Location';
        if (!grouped[location]) grouped[location] = [];
        grouped[location].push(photo);
      });
      return grouped;
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
        <Skeleton variant="card" height={200} />
        <Skeleton variant="card" height={200} />
        <Skeleton variant="card" height={200} />
        <Skeleton variant="card" height={200} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        background: '#fee2e2',
        border: '1px solid #fecaca',
        borderRadius: '8px',
        padding: '1rem',
        color: '#991b1b'
      }}>
        Failed to load photos
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div style={{
        background: '#f9fafb',
        border: '1px dashed #d1d5db',
        borderRadius: '8px',
        padding: '3rem',
        textAlign: 'center'
      }}>
        <Image size={48} style={{ margin: '0 auto 1rem', color: '#9ca3af' }} />
        <h3 style={{ margin: '0 0 0.5rem', color: '#374151' }}>No Photos</h3>
        <p style={{ color: '#6b7280', margin: 0 }}>
          This patient has no clinical photos on record.
        </p>
      </div>
    );
  }

  const groupedPhotos = groupPhotos();

  return (
    <>
      <div style={{ marginBottom: '1.5rem' }}>
        {/* Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setGroupBy('date')}
              style={{
                padding: '0.5rem 1rem',
                background: groupBy === 'date' ? '#3b82f6' : '#f3f4f6',
                color: groupBy === 'date' ? '#ffffff' : '#6b7280',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 500,
                transition: 'all 0.2s'
              }}
            >
              <Calendar size={16} style={{ display: 'inline', marginRight: '0.5rem', verticalAlign: 'middle' }} />
              By Date
            </button>
            <button
              onClick={() => setGroupBy('location')}
              style={{
                padding: '0.5rem 1rem',
                background: groupBy === 'location' ? '#3b82f6' : '#f3f4f6',
                color: groupBy === 'location' ? '#ffffff' : '#6b7280',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 500,
                transition: 'all 0.2s'
              }}
            >
              <MapPin size={16} style={{ display: 'inline', marginRight: '0.5rem', verticalAlign: 'middle' }} />
              By Location
            </button>
          </div>

          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            {photos.length} photo{photos.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Photo Groups */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {Object.entries(groupedPhotos).map(([group, groupPhotos]) => (
          <div key={group}>
            <h3 style={{
              margin: '0 0 1rem',
              fontSize: '1rem',
              fontWeight: 600,
              color: '#111827',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              {groupBy === 'date' ? <Calendar size={18} /> : <MapPin size={18} />}
              {group}
              <span style={{ color: '#9ca3af', fontWeight: 400, fontSize: '0.875rem' }}>
                ({groupPhotos.length})
              </span>
            </h3>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: '1rem'
            }}>
              {groupPhotos.map((photo: any) => (
                <div
                  key={photo.id}
                  style={{
                    position: 'relative',
                    aspectRatio: '1',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    transition: 'transform 0.2s',
                    border: '2px solid #e5e7eb'
                  }}
                  onClick={() => setSelectedPhoto(photo)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.05)';
                    e.currentTarget.style.zIndex = '10';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.zIndex = '1';
                  }}
                >
                  <img
                    src={photo.thumbnailUrl || photo.url}
                    alt={photo.caption || photo.bodyLocation}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover'
                    }}
                  />

                  {/* Overlay */}
                  <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)',
                    padding: '2rem 0.75rem 0.75rem',
                    color: '#ffffff'
                  }}>
                    {photo.bodyLocation && (
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.125rem' }}>
                        {photo.bodyLocation}
                      </div>
                    )}
                    <div style={{ fontSize: '0.7rem', opacity: 0.9 }}>
                      {formatDate(photo.capturedAt)}
                    </div>
                  </div>

                  {/* Zoom Icon */}
                  <div style={{
                    position: 'absolute',
                    top: '0.5rem',
                    right: '0.5rem',
                    background: 'rgba(0, 0, 0, 0.6)',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: 0,
                    transition: 'opacity 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = '1';
                  }}
                  >
                    <ZoomIn size={16} style={{ color: '#ffffff' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Photo Modal */}
      {selectedPhoto && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.9)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem'
          }}
          onClick={() => setSelectedPhoto(null)}
        >
          <button
            onClick={() => setSelectedPhoto(null)}
            style={{
              position: 'absolute',
              top: '1rem',
              right: '1rem',
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              borderRadius: '50%',
              width: '48px',
              height: '48px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
            }}
          >
            <X size={24} />
          </button>

          <div
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={selectedPhoto.url}
              alt={selectedPhoto.caption || selectedPhoto.bodyLocation}
              style={{
                maxWidth: '100%',
                maxHeight: 'calc(90vh - 120px)',
                objectFit: 'contain',
                borderRadius: '8px'
              }}
            />

            <div style={{
              background: 'rgba(255, 255, 255, 0.95)',
              borderRadius: '8px',
              padding: '1rem',
              color: '#111827'
            }}>
              {selectedPhoto.bodyLocation && (
                <div style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '1.125rem' }}>
                  {selectedPhoto.bodyLocation}
                </div>
              )}
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                {formatDate(selectedPhoto.capturedAt)}
                {selectedPhoto.photoType && ` • ${selectedPhoto.photoType}`}
              </div>
              {selectedPhoto.caption && (
                <div style={{ fontSize: '0.875rem', color: '#374151' }}>
                  {selectedPhoto.caption}
                </div>
              )}
              {selectedPhoto.tags && selectedPhoto.tags.length > 0 && (
                <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {selectedPhoto.tags.map((tag: string, idx: number) => (
                    <span
                      key={idx}
                      style={{
                        background: '#e5e7eb',
                        color: '#374151',
                        padding: '0.25rem 0.75rem',
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                        fontWeight: 500
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
