import React, { useState, useRef, useEffect } from 'react';
import {
  Circle,
  ArrowRight,
  Type,
  Minus,
  Undo,
  Redo,
  Save,
  X,
  Trash2,
  Ruler,
} from 'lucide-react';

/**
 * PhotoAnnotation Component
 *
 * Features:
 * - Draw on photos (circles, arrows, lines, text)
 * - Measure distances (for lesion size)
 * - Save annotations
 * - Compare annotated vs clean
 */

interface AnnotationShape {
  id: string;
  type: 'circle' | 'arrow' | 'line' | 'text' | 'measurement';
  x: number;
  y: number;
  endX?: number;
  endY?: number;
  radius?: number;
  text?: string;
  color: string;
  thickness: number;
}

interface PhotoAnnotationProps {
  photoUrl: string;
  existingAnnotations?: AnnotationShape[];
  onSave: (annotations: AnnotationShape[]) => void;
  onClose: () => void;
}

type Tool = 'select' | 'circle' | 'arrow' | 'line' | 'text' | 'measurement';

const COLORS = [
  { name: 'Red', value: '#EF4444' },
  { name: 'Yellow', value: '#EAB308' },
  { name: 'Green', value: '#22C55E' },
  { name: 'Blue', value: '#3B82F6' },
  { name: 'White', value: '#FFFFFF' },
];

export function PhotoAnnotation({
  photoUrl,
  existingAnnotations = [],
  onSave,
  onClose,
}: PhotoAnnotationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [color, setColor] = useState('#EF4444');
  const [thickness, setThickness] = useState(3);
  const [annotations, setAnnotations] = useState<AnnotationShape[]>(existingAnnotations);
  const [history, setHistory] = useState<AnnotationShape[][]>([existingAnnotations]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentShape, setCurrentShape] = useState<AnnotationShape | null>(null);
  const [textInput, setTextInput] = useState('');
  const [textPosition, setTextPosition] = useState<{ x: number; y: number } | null>(null);
  const [showClean, setShowClean] = useState(false);
  const [pixelsPerMm, setPixelsPerMm] = useState<number | null>(null);

  useEffect(() => {
    drawCanvas();
  }, [annotations, showClean, photoUrl]);

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !image.complete) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match image
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    // Draw image
    ctx.drawImage(image, 0, 0);

    // Draw annotations if not showing clean version
    if (!showClean) {
      annotations.forEach((shape) => {
        ctx.strokeStyle = shape.color;
        ctx.fillStyle = shape.color;
        ctx.lineWidth = shape.thickness;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        switch (shape.type) {
          case 'circle':
            ctx.beginPath();
            ctx.arc(shape.x, shape.y, shape.radius || 50, 0, Math.PI * 2);
            ctx.stroke();
            break;

          case 'arrow':
          case 'line':
            if (shape.endX !== undefined && shape.endY !== undefined) {
              ctx.beginPath();
              ctx.moveTo(shape.x, shape.y);
              ctx.lineTo(shape.endX, shape.endY);
              ctx.stroke();

              // Draw arrowhead for arrows
              if (shape.type === 'arrow') {
                const angle = Math.atan2(shape.endY - shape.y, shape.endX - shape.x);
                const headLength = 20;
                ctx.beginPath();
                ctx.moveTo(shape.endX, shape.endY);
                ctx.lineTo(
                  shape.endX - headLength * Math.cos(angle - Math.PI / 6),
                  shape.endY - headLength * Math.sin(angle - Math.PI / 6)
                );
                ctx.moveTo(shape.endX, shape.endY);
                ctx.lineTo(
                  shape.endX - headLength * Math.cos(angle + Math.PI / 6),
                  shape.endY - headLength * Math.sin(angle + Math.PI / 6)
                );
                ctx.stroke();
              }
            }
            break;

          case 'measurement':
            if (shape.endX !== undefined && shape.endY !== undefined) {
              // Draw line
              ctx.beginPath();
              ctx.moveTo(shape.x, shape.y);
              ctx.lineTo(shape.endX, shape.endY);
              ctx.stroke();

              // Calculate distance
              const pixelDistance = Math.sqrt(
                Math.pow(shape.endX - shape.x, 2) + Math.pow(shape.endY - shape.y, 2)
              );
              const mmDistance = pixelsPerMm ? pixelDistance / pixelsPerMm : null;

              // Draw measurement label
              ctx.fillStyle = '#000000';
              ctx.font = '16px Arial';
              ctx.fillRect(
                (shape.x + shape.endX) / 2 - 30,
                (shape.y + shape.endY) / 2 - 12,
                60,
                24
              );
              ctx.fillStyle = '#FFFFFF';
              const label = mmDistance ? `${mmDistance.toFixed(1)}mm` : `${Math.round(pixelDistance)}px`;
              ctx.fillText(
                label,
                (shape.x + shape.endX) / 2 - ctx.measureText(label).width / 2,
                (shape.y + shape.endY) / 2 + 6
              );
            }
            break;

          case 'text':
            if (shape.text) {
              ctx.font = '20px Arial';
              ctx.fillStyle = '#000000';
              ctx.fillRect(shape.x - 5, shape.y - 20, ctx.measureText(shape.text).width + 10, 30);
              ctx.fillStyle = shape.color;
              ctx.fillText(shape.text, shape.x, shape.y);
            }
            break;
        }
      });
    }
  };

  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool === 'select' || tool === 'text') return;

    const { x, y } = getCanvasCoordinates(e);
    setIsDrawing(true);

    const newShape: AnnotationShape = {
      id: Date.now().toString(),
      type: tool as any,
      x,
      y,
      color,
      thickness,
    };

    setCurrentShape(newShape);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !currentShape) return;

    const { x, y } = getCanvasCoordinates(e);

    if (currentShape.type === 'circle') {
      const radius = Math.sqrt(Math.pow(x - currentShape.x, 2) + Math.pow(y - currentShape.y, 2));
      setCurrentShape({ ...currentShape, radius });
    } else if (['arrow', 'line', 'measurement'].includes(currentShape.type)) {
      setCurrentShape({ ...currentShape, endX: x, endY: y });
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing || !currentShape) return;

    const newAnnotations = [...annotations, currentShape];
    setAnnotations(newAnnotations);
    addToHistory(newAnnotations);
    setCurrentShape(null);
    setIsDrawing(false);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool === 'text') {
      const { x, y } = getCanvasCoordinates(e);
      setTextPosition({ x, y });
    }
  };

  const addText = () => {
    if (!textPosition || !textInput.trim()) return;

    const newShape: AnnotationShape = {
      id: Date.now().toString(),
      type: 'text',
      x: textPosition.x,
      y: textPosition.y,
      text: textInput,
      color,
      thickness,
    };

    const newAnnotations = [...annotations, newShape];
    setAnnotations(newAnnotations);
    addToHistory(newAnnotations);
    setTextInput('');
    setTextPosition(null);
  };

  const addToHistory = (newAnnotations: AnnotationShape[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newAnnotations);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setAnnotations(history[historyIndex - 1]);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setAnnotations(history[historyIndex + 1]);
    }
  };

  const clearAll = () => {
    if (confirm('Clear all annotations?')) {
      const newAnnotations: AnnotationShape[] = [];
      setAnnotations(newAnnotations);
      addToHistory(newAnnotations);
    }
  };

  const handleSave = () => {
    onSave(annotations);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex flex-col">
      {/* Header */}
      <div className="bg-gray-900 text-white p-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Photo Annotation</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowClean(!showClean)}
            className="px-3 py-1 text-sm bg-gray-800 hover:bg-gray-700 rounded"
          >
            {showClean ? 'Show Annotations' : 'Hide Annotations'}
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            Save
          </button>
          <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-gray-800 text-white p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Tools */}
          <div className="flex bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => setTool('circle')}
              className={`p-2 rounded ${tool === 'circle' ? 'bg-blue-600' : 'hover:bg-gray-600'}`}
              title="Circle"
            >
              <Circle className="w-5 h-5" />
            </button>
            <button
              onClick={() => setTool('arrow')}
              className={`p-2 rounded ${tool === 'arrow' ? 'bg-blue-600' : 'hover:bg-gray-600'}`}
              title="Arrow"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => setTool('line')}
              className={`p-2 rounded ${tool === 'line' ? 'bg-blue-600' : 'hover:bg-gray-600'}`}
              title="Line"
            >
              <Minus className="w-5 h-5" />
            </button>
            <button
              onClick={() => setTool('text')}
              className={`p-2 rounded ${tool === 'text' ? 'bg-blue-600' : 'hover:bg-gray-600'}`}
              title="Text"
            >
              <Type className="w-5 h-5" />
            </button>
            <button
              onClick={() => setTool('measurement')}
              className={`p-2 rounded ${tool === 'measurement' ? 'bg-blue-600' : 'hover:bg-gray-600'}`}
              title="Measurement"
            >
              <Ruler className="w-5 h-5" />
            </button>
          </div>

          {/* Colors */}
          <div className="flex gap-1">
            {COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => setColor(c.value)}
                className={`w-8 h-8 rounded border-2 ${
                  color === c.value ? 'border-white' : 'border-transparent'
                }`}
                style={{ backgroundColor: c.value }}
                title={c.name}
              />
            ))}
          </div>

          {/* Thickness */}
          <div className="flex items-center gap-2">
            <label className="text-sm">Thickness:</label>
            <input
              type="range"
              min="1"
              max="10"
              value={thickness}
              onChange={(e) => setThickness(Number(e.target.value))}
              className="w-24"
            />
            <span className="text-sm w-6">{thickness}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={undo}
            disabled={historyIndex === 0}
            className="p-2 rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Undo"
          >
            <Undo className="w-5 h-5" />
          </button>
          <button
            onClick={redo}
            disabled={historyIndex === history.length - 1}
            className="p-2 rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Redo"
          >
            <Redo className="w-5 h-5" />
          </button>
          <button
            onClick={clearAll}
            className="p-2 rounded hover:bg-gray-700 text-red-400"
            title="Clear All"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 flex items-center justify-center overflow-auto p-4 bg-gray-900">
        <div className="relative">
          <img
            ref={imageRef}
            src={photoUrl}
            alt="Photo to annotate"
            className="hidden"
            onLoad={drawCanvas}
          />
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onClick={handleCanvasClick}
            className="max-w-full max-h-[calc(100vh-200px)] cursor-crosshair"
            style={{
              cursor: tool === 'select' ? 'default' : 'crosshair',
            }}
          />
        </div>
      </div>

      {/* Text Input Modal */}
      {textPosition && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="font-semibold mb-4">Add Text</h3>
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addText()}
              placeholder="Enter text..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setTextPosition(null)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded"
              >
                Cancel
              </button>
              <button
                onClick={addText}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
