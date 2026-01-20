import React, { useState, useRef, useEffect } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Download,
  FileText,
  X,
  Calendar,
  TrendingUp,
  Maximize2,
} from 'lucide-react';
import { format } from 'date-fns';
import type { Photo } from './PhotoGallery';

/**
 * BeforeAfterSlider Component
 *
 * Features:
 * - Side-by-side photo comparison
 * - Slider to reveal before/after
 * - Zoom and pan (synchronized between both)
 * - Date stamps on each photo
 * - Download/print comparison
 * - Add to clinical note
 */

interface BeforeAfterSliderProps {
  beforePhoto: Photo;
  afterPhoto: Photo;
  onClose: () => void;
  onAddToNote?: () => void;
  onDownload?: () => void;
  showImprovementScore?: boolean;
}

export function BeforeAfterSlider({
  beforePhoto,
  afterPhoto,
  onClose,
  onAddToNote,
  onDownload,
  showImprovementScore = true,
}: BeforeAfterSliderProps) {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [viewMode, setViewMode] = useState<'slider' | 'side-by-side'>('slider');
  const [improvementScore, setImprovementScore] = useState<number | null>(null);
  const [notes, setNotes] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const beforeImgRef = useRef<HTMLImageElement>(null);
  const afterImgRef = useRef<HTMLImageElement>(null);

  // Calculate days between photos
  const daysBetween = Math.floor(
    (new Date(afterPhoto.taken_at).getTime() -
      new Date(beforePhoto.taken_at).getTime()) /
      (1000 * 60 * 60 * 24)
  );

  const handleSliderMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    let clientX: number;

    if ('touches' in e) {
      clientX = e.touches[0].clientX;
    } else {
      clientX = e.clientX;
    }

    const x = clientX - rect.left;
    const percentage = (x / rect.width) * 100;
    setSliderPosition(Math.max(0, Math.min(100, percentage)));
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.5, 5));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.5, 1));
    if (zoom <= 1.5) {
      setPan({ x: 0, y: 0 });
    }
  };

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

  const handleDownload = () => {
    // In a real implementation, this would trigger the comparison image download
    onDownload?.();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setSliderPosition((p) => Math.max(0, p - 5));
      if (e.key === 'ArrowRight') setSliderPosition((p) => Math.min(100, p + 5));
      if (e.key === '+' || e.key === '=') handleZoomIn();
      if (e.key === '-') handleZoomOut();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex flex-col">
      {/* Header */}
      <div className="bg-gray-900 text-white p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Before & After Comparison</h2>
          <div className="flex items-center gap-2 text-sm text-gray-300">
            <Calendar className="w-4 h-4" />
            <span>{daysBetween} days between photos</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setViewMode('slider')}
              className={`px-3 py-1 rounded text-sm ${
                viewMode === 'slider'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              Slider
            </button>
            <button
              onClick={() => setViewMode('side-by-side')}
              className={`px-3 py-1 rounded text-sm ${
                viewMode === 'side-by-side'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              Side-by-Side
            </button>
          </div>

          {/* Zoom Controls */}
          <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
            <button
              onClick={handleZoomOut}
              disabled={zoom <= 1}
              className="p-2 hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ZoomOut className="w-5 h-5" />
            </button>
            <span className="px-2 text-sm">{Math.round(zoom * 100)}%</span>
            <button
              onClick={handleZoomIn}
              disabled={zoom >= 5}
              className="p-2 hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ZoomIn className="w-5 h-5" />
            </button>
          </div>

          {/* Action Buttons */}
          {onDownload && (
            <button
              onClick={handleDownload}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              title="Download comparison"
            >
              <Download className="w-5 h-5" />
            </button>
          )}

          {onAddToNote && (
            <button
              onClick={onAddToNote}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              title="Add to clinical note"
            >
              <FileText className="w-5 h-5" />
            </button>
          )}

          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Comparison View */}
      <div className="flex-1 flex items-center justify-center p-8 overflow-hidden">
        {viewMode === 'slider' ? (
          <div
            ref={containerRef}
            className="relative w-full max-w-5xl aspect-video bg-black rounded-lg overflow-hidden cursor-crosshair"
            onMouseMove={handleSliderMove}
            onTouchMove={handleSliderMove}
            onMouseDown={handleMouseDown}
            onMouseMove={(e) => {
              handleSliderMove(e);
              handleMouseMove(e);
            }}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {/* After Image (full) */}
            <div className="absolute inset-0">
              <img
                ref={afterImgRef}
                src={afterPhoto.file_path}
                alt="After"
                className="w-full h-full object-contain"
                style={{
                  transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                  cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'crosshair',
                }}
              />
              <div className="absolute top-4 right-4 bg-black bg-opacity-75 text-white px-3 py-1 rounded-lg text-sm">
                After: {format(new Date(afterPhoto.taken_at), 'MMM d, yyyy')}
              </div>
            </div>

            {/* Before Image (clipped) */}
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ width: `${sliderPosition}%` }}
            >
              <img
                ref={beforeImgRef}
                src={beforePhoto.file_path}
                alt="Before"
                className="absolute inset-0 w-full h-full object-contain"
                style={{
                  transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                }}
              />
              <div className="absolute top-4 left-4 bg-black bg-opacity-75 text-white px-3 py-1 rounded-lg text-sm">
                Before: {format(new Date(beforePhoto.taken_at), 'MMM d, yyyy')}
              </div>
            </div>

            {/* Slider Handle */}
            <div
              className="absolute top-0 bottom-0 w-1 bg-white shadow-lg"
              style={{ left: `${sliderPosition}%` }}
            >
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center">
                <div className="w-4 h-4 border-2 border-gray-400 rounded-full"></div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex gap-4 w-full max-w-6xl">
            {/* Before */}
            <div className="flex-1 relative bg-black rounded-lg overflow-hidden">
              <img
                src={beforePhoto.file_path}
                alt="Before"
                className="w-full h-full object-contain"
                style={{
                  transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                }}
              />
              <div className="absolute top-4 left-4 bg-black bg-opacity-75 text-white px-3 py-2 rounded-lg">
                <div className="text-xs text-gray-300">Before</div>
                <div className="text-sm font-medium">
                  {format(new Date(beforePhoto.taken_at), 'MMM d, yyyy')}
                </div>
              </div>
            </div>

            {/* After */}
            <div className="flex-1 relative bg-black rounded-lg overflow-hidden">
              <img
                src={afterPhoto.file_path}
                alt="After"
                className="w-full h-full object-contain"
                style={{
                  transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                }}
              />
              <div className="absolute top-4 left-4 bg-black bg-opacity-75 text-white px-3 py-2 rounded-lg">
                <div className="text-xs text-gray-300">After</div>
                <div className="text-sm font-medium">
                  {format(new Date(afterPhoto.taken_at), 'MMM d, yyyy')}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Improvement Assessment Panel */}
      {showImprovementScore && (
        <div className="bg-gray-900 text-white p-4 border-t border-gray-800">
          <div className="max-w-5xl mx-auto grid grid-cols-3 gap-4">
            {/* Improvement Score */}
            <div>
              <label className="block text-sm text-gray-300 mb-2 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Improvement Score (0-10)
              </label>
              <input
                type="number"
                min="0"
                max="10"
                value={improvementScore ?? ''}
                onChange={(e) => setImprovementScore(Number(e.target.value))}
                placeholder="Rate improvement..."
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-white"
              />
            </div>

            {/* Notes */}
            <div className="col-span-2">
              <label className="block text-sm text-gray-300 mb-2">
                Clinical Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Describe the changes observed..."
                rows={1}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-white resize-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* Tips */}
      <div className="bg-gray-800 text-gray-300 text-xs text-center py-2">
        <span className="hidden md:inline">
          Tip: Use arrow keys to adjust slider • +/- to zoom • Drag to pan when zoomed
        </span>
        <span className="md:hidden">
          Tap and drag to reveal before/after
        </span>
      </div>
    </div>
  );
}
