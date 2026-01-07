import { useState } from 'react';
import type { Photo } from '../../types';

interface PhotoTimelineProps {
  photos: Photo[];
  getPhotoUrl: (photo: Photo) => string;
  onPhotoClick?: (photo: Photo) => void;
}

interface GroupedPhotos {
  date: string;
  photos: Photo[];
}

export function PhotoTimeline({ photos, getPhotoUrl, onPhotoClick }: PhotoTimelineProps) {
  const [groupBy, setGroupBy] = useState<'date' | 'location' | 'type'>('date');
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);

  // Group photos by selected criteria
  const groupPhotos = (): GroupedPhotos[] => {
    const groups: { [key: string]: Photo[] } = {};

    photos.forEach((photo) => {
      let key: string;

      switch (groupBy) {
        case 'date':
          key = new Date(photo.createdAt).toLocaleDateString();
          break;
        case 'location':
          key = photo.bodyLocation || photo.bodyRegion || 'Unknown Location';
          break;
        case 'type':
          key = photo.photoType || photo.category || 'Other';
          break;
        default:
          key = 'Other';
      }

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(photo);
    });

    return Object.entries(groups).map(([date, photos]) => ({
      date,
      photos: photos.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    }));
  };

  const groupedPhotos = groupPhotos();

  const handlePhotoClick = (photo: Photo) => {
    setSelectedPhoto(photo);
    if (onPhotoClick) {
      onPhotoClick(photo);
    }
  };

  const getPhotoTypeLabel = (photo: Photo) => {
    const type = photo.photoType || photo.category;
    switch (type) {
      case 'before':
        return 'Before';
      case 'after':
        return 'After';
      case 'dermoscopy':
        return 'Dermoscopy';
      case 'baseline':
        return 'Baseline';
      case 'clinical':
      default:
        return 'Clinical';
    }
  };

  return (
    <div className="photo-timeline">
      <div className="timeline-controls">
        <div className="group-by-selector">
          <label>Group by:</label>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as any)}>
            <option value="date">Date</option>
            <option value="location">Body Location</option>
            <option value="type">Photo Type</option>
          </select>
        </div>

        <div className="timeline-stats">
          <span className="stat-item">
            Total Photos: <strong>{photos.length}</strong>
          </span>
          <span className="stat-item">
            Groups: <strong>{groupedPhotos.length}</strong>
          </span>
        </div>
      </div>

      <div className="timeline-groups">
        {groupedPhotos.map((group, groupIndex) => (
          <div key={groupIndex} className="timeline-group">
            <div className="timeline-group-header">
              <div className="timeline-marker">
                <div className="timeline-dot" />
                {groupIndex < groupedPhotos.length - 1 && <div className="timeline-line" />}
              </div>
              <div className="timeline-group-info">
                <h3 className="group-title">{group.date}</h3>
                <span className="group-count">{group.photos.length} photos</span>
              </div>
            </div>

            <div className="timeline-group-content">
              <div className="timeline-photos">
                {group.photos.map((photo) => (
                  <div
                    key={photo.id}
                    className={`timeline-photo-card ${selectedPhoto?.id === photo.id ? 'selected' : ''}`}
                    onClick={() => handlePhotoClick(photo)}
                  >
                    <div className="photo-thumbnail">
                      <img src={getPhotoUrl(photo)} alt={photo.description || 'Photo'} />
                      <span className={`photo-type-badge ${photo.photoType || 'clinical'}`}>
                        {getPhotoTypeLabel(photo)}
                      </span>
                    </div>

                    <div className="photo-details">
                      <div className="photo-time">
                        {new Date(photo.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>

                      {(photo.bodyLocation || photo.bodyRegion) && (
                        <div className="photo-location">
                          {photo.bodyLocation || photo.bodyRegion}
                        </div>
                      )}

                      {photo.description && (
                        <div className="photo-description">{photo.description}</div>
                      )}

                      {photo.annotations && photo.annotations.shapes.length > 0 && (
                        <div className="photo-annotations-indicator">
                          <span className="annotation-icon">✎</span>
                          {photo.annotations.shapes.length} annotations
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {photos.length === 0 && (
        <div className="timeline-empty">
          <div className="empty-icon"></div>
          <h3>No photos to display</h3>
          <p className="muted">Upload photos to see them in the timeline</p>
        </div>
      )}
    </div>
  );
}
