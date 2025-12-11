import { useState, useRef, useEffect } from 'react';
import type { Photo } from '../../types';

interface PhotoComparisonProps {
  photos: Photo[];
  getPhotoUrl: (photo: Photo) => string;
}

type ViewMode = 'side-by-side' | 'slider' | 'overlay';

export function PhotoComparison({ photos, getPhotoUrl }: PhotoComparisonProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');
  const [sliderPosition, setSliderPosition] = useState(50);
  const [overlayOpacity, setOverlayOpacity] = useState(50);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  if (photos.length < 2) {
    return (
      <div className="photo-comparison-empty">
        <p>At least 2 photos are required for comparison</p>
      </div>
    );
  }

  const beforePhoto = photos[0];
  const afterPhoto = photos[photos.length - 1];

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoom > 1) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.25, 1));
    if (zoom <= 1.25) {
      setPan({ x: 0, y: 0 });
    }
  };

  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const imageStyle = {
    transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
    cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
  };

  return (
    <div className="photo-comparison">
      <div className="comparison-toolbar">
        <div className="view-mode-tabs">
          <button
            type="button"
            className={`mode-tab ${viewMode === 'side-by-side' ? 'active' : ''}`}
            onClick={() => setViewMode('side-by-side')}
          >
            Side by Side
          </button>
          <button
            type="button"
            className={`mode-tab ${viewMode === 'slider' ? 'active' : ''}`}
            onClick={() => setViewMode('slider')}
          >
            Slider
          </button>
          <button
            type="button"
            className={`mode-tab ${viewMode === 'overlay' ? 'active' : ''}`}
            onClick={() => setViewMode('overlay')}
          >
            Overlay
          </button>
        </div>

        <div className="zoom-controls">
          <button type="button" onClick={handleZoomOut} disabled={zoom <= 1}>
            -
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={handleZoomIn} disabled={zoom >= 3}>
            +
          </button>
          <button type="button" onClick={handleResetZoom} disabled={zoom === 1}>
            Reset
          </button>
        </div>
      </div>

      <div className="comparison-info">
        <div className="photo-label">
          <span className="label-badge before">Before</span>
          <span className="photo-date">
            {new Date(beforePhoto.createdAt).toLocaleDateString()}
          </span>
        </div>
        <div className="photo-label">
          <span className="label-badge after">After</span>
          <span className="photo-date">
            {new Date(afterPhoto.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>

      {viewMode === 'side-by-side' && (
        <div
          className="comparison-side-by-side"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div className="comparison-image-container">
            <img
              src={getPhotoUrl(beforePhoto)}
              alt="Before"
              style={imageStyle}
            />
          </div>
          <div className="comparison-image-container">
            <img
              src={getPhotoUrl(afterPhoto)}
              alt="After"
              style={imageStyle}
            />
          </div>
        </div>
      )}

      {viewMode === 'slider' && (
        <div className="comparison-slider">
          <div
            ref={containerRef}
            className="slider-container"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <div className="slider-images">
              <img
                src={getPhotoUrl(afterPhoto)}
                alt="After"
                className="slider-image-full"
                style={imageStyle}
              />
              <div
                className="slider-image-clipped"
                style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
              >
                <img
                  src={getPhotoUrl(beforePhoto)}
                  alt="Before"
                  style={imageStyle}
                />
              </div>
            </div>
            <div
              className="slider-handle"
              style={{ left: `${sliderPosition}%` }}
              onMouseDown={(e) => {
                e.stopPropagation();
                const handleMove = (moveEvent: MouseEvent) => {
                  if (!containerRef.current) return;
                  const rect = containerRef.current.getBoundingClientRect();
                  const x = moveEvent.clientX - rect.left;
                  const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
                  setSliderPosition(percentage);
                };
                const handleUp = () => {
                  document.removeEventListener('mousemove', handleMove);
                  document.removeEventListener('mouseup', handleUp);
                };
                document.addEventListener('mousemove', handleMove);
                document.addEventListener('mouseup', handleUp);
              }}
            >
              <div className="slider-line" />
              <div className="slider-button">
                <span>Before</span>
                <span>After</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewMode === 'overlay' && (
        <div
          className="comparison-overlay"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div className="overlay-container">
            <img
              src={getPhotoUrl(afterPhoto)}
              alt="After"
              className="overlay-base"
              style={imageStyle}
            />
            <img
              src={getPhotoUrl(beforePhoto)}
              alt="Before"
              className="overlay-top"
              style={{
                ...imageStyle,
                opacity: overlayOpacity / 100,
              }}
            />
          </div>
          <div className="overlay-controls">
            <label>Before Opacity:</label>
            <input
              type="range"
              min="0"
              max="100"
              value={overlayOpacity}
              onChange={(e) => setOverlayOpacity(Number(e.target.value))}
            />
            <span>{overlayOpacity}%</span>
          </div>
        </div>
      )}

      {photos.length > 2 && (
        <div className="comparison-timeline">
          <h4>All Photos in Series</h4>
          <div className="timeline-photos">
            {photos.map((photo, index) => (
              <div key={photo.id} className="timeline-photo">
                <img src={getPhotoUrl(photo)} alt={`Photo ${index + 1}`} />
                <div className="timeline-photo-info">
                  <span className="photo-number">#{index + 1}</span>
                  <span className="photo-date">
                    {new Date(photo.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
