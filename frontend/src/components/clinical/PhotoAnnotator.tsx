import { useRef, useState, useEffect } from 'react';
import type { PhotoAnnotationShape, PhotoAnnotations } from '../../types';

interface PhotoAnnotatorProps {
  imageUrl: string;
  annotations?: PhotoAnnotations;
  readOnly?: boolean;
  onSave?: (annotations: PhotoAnnotations) => void;
  onCancel?: () => void;
}

type ToolType = 'arrow' | 'circle' | 'rectangle' | 'text' | 'select';

export function PhotoAnnotator({
  imageUrl,
  annotations,
  readOnly = false,
  onSave,
  onCancel,
}: PhotoAnnotatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [shapes, setShapes] = useState<PhotoAnnotationShape[]>(annotations?.shapes || []);
  const [selectedTool, setSelectedTool] = useState<ToolType>('select');
  const [selectedColor, setSelectedColor] = useState('#FF0000');
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentShape, setCurrentShape] = useState<PhotoAnnotationShape | null>(null);
  const [history, setHistory] = useState<PhotoAnnotationShape[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [textInput, setTextInput] = useState('');
  const [showTextDialog, setShowTextDialog] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    if (annotations?.shapes) {
      setShapes(annotations.shapes);
      setHistory([annotations.shapes]);
      setHistoryIndex(0);
    }
  }, [annotations]);

  useEffect(() => {
    drawCanvas();
  }, [shapes, imageLoaded]);

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !imageLoaded) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw image
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    // Draw all shapes
    shapes.forEach((shape) => {
      drawShape(ctx, shape);
    });

    // Draw current shape being drawn
    if (currentShape) {
      drawShape(ctx, currentShape);
    }
  };

  const drawShape = (ctx: CanvasRenderingContext2D, shape: PhotoAnnotationShape) => {
    ctx.strokeStyle = shape.color;
    ctx.fillStyle = shape.color;
    ctx.lineWidth = shape.thickness || 2;

    switch (shape.type) {
      case 'arrow':
        drawArrow(ctx, shape);
        break;
      case 'circle':
        ctx.beginPath();
        ctx.arc(shape.x, shape.y, shape.radius || 20, 0, 2 * Math.PI);
        ctx.stroke();
        break;
      case 'rectangle':
        ctx.strokeRect(shape.x, shape.y, shape.width || 0, shape.height || 0);
        break;
      case 'text':
        ctx.font = '16px Arial';
        ctx.fillText(shape.text || '', shape.x, shape.y);
        break;
    }
  };

  const drawArrow = (ctx: CanvasRenderingContext2D, shape: PhotoAnnotationShape) => {
    const fromX = shape.x;
    const fromY = shape.y;
    const toX = shape.x + (shape.width || 0);
    const toY = shape.y + (shape.height || 0);

    const headLength = 15;
    const angle = Math.atan2(toY - fromY, toX - fromX);

    // Draw line
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    // Draw arrow head
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(
      toX - headLength * Math.cos(angle - Math.PI / 6),
      toY - headLength * Math.sin(angle - Math.PI / 6)
    );
    ctx.moveTo(toX, toY);
    ctx.lineTo(
      toX - headLength * Math.cos(angle + Math.PI / 6),
      toY - headLength * Math.sin(angle + Math.PI / 6)
    );
    ctx.stroke();
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (readOnly || selectedTool === 'select') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsDrawing(true);
    setStartPos({ x, y });

    if (selectedTool === 'text') {
      setShowTextDialog(true);
      setStartPos({ x, y });
      return;
    }

    const newShape: PhotoAnnotationShape = {
      type: selectedTool as any,
      x,
      y,
      width: 0,
      height: 0,
      radius: 0,
      color: selectedColor,
      thickness: 2,
    };

    setCurrentShape(newShape);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !startPos || selectedTool === 'text') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (selectedTool === 'arrow' || selectedTool === 'rectangle') {
      setCurrentShape({
        ...currentShape!,
        width: x - startPos.x,
        height: y - startPos.y,
      });
    } else if (selectedTool === 'circle') {
      const radius = Math.sqrt(
        Math.pow(x - startPos.x, 2) + Math.pow(y - startPos.y, 2)
      );
      setCurrentShape({
        ...currentShape!,
        radius,
      });
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing || selectedTool === 'text') return;

    if (currentShape) {
      const newShapes = [...shapes, currentShape];
      setShapes(newShapes);
      addToHistory(newShapes);
    }

    setIsDrawing(false);
    setCurrentShape(null);
  };

  const handleTextSubmit = () => {
    if (!textInput.trim() || !startPos) return;

    const newShape: PhotoAnnotationShape = {
      type: 'text',
      x: startPos.x,
      y: startPos.y,
      color: selectedColor,
      text: textInput,
    };

    const newShapes = [...shapes, newShape];
    setShapes(newShapes);
    addToHistory(newShapes);

    setTextInput('');
    setShowTextDialog(false);
    setIsDrawing(false);
  };

  const addToHistory = (newShapes: PhotoAnnotationShape[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newShapes);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setShapes(history[historyIndex - 1]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setShapes(history[historyIndex + 1]);
    }
  };

  const handleClear = () => {
    const newShapes: PhotoAnnotationShape[] = [];
    setShapes(newShapes);
    addToHistory(newShapes);
  };

  const handleSave = () => {
    if (onSave) {
      onSave({ shapes });
    }
  };

  const handleImageLoad = () => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;

    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    setImageLoaded(true);
  };

  return (
    <div className="photo-annotator">
      <div className="annotator-toolbar">
        {!readOnly && (
          <>
            <div className="tool-group">
              <button
                type="button"
                className={`tool-btn ${selectedTool === 'select' ? 'active' : ''}`}
                onClick={() => setSelectedTool('select')}
                title="Select"
              >
                Select
              </button>
              <button
                type="button"
                className={`tool-btn ${selectedTool === 'arrow' ? 'active' : ''}`}
                onClick={() => setSelectedTool('arrow')}
                title="Arrow"
              >
                Arrow
              </button>
              <button
                type="button"
                className={`tool-btn ${selectedTool === 'circle' ? 'active' : ''}`}
                onClick={() => setSelectedTool('circle')}
                title="Circle"
              >
                Circle
              </button>
              <button
                type="button"
                className={`tool-btn ${selectedTool === 'rectangle' ? 'active' : ''}`}
                onClick={() => setSelectedTool('rectangle')}
                title="Rectangle"
              >
                Box
              </button>
              <button
                type="button"
                className={`tool-btn ${selectedTool === 'text' ? 'active' : ''}`}
                onClick={() => setSelectedTool('text')}
                title="Text"
              >
                Text
              </button>
            </div>

            <div className="tool-group">
              <label>Color:</label>
              <input
                type="color"
                value={selectedColor}
                onChange={(e) => setSelectedColor(e.target.value)}
              />
            </div>

            <div className="tool-group">
              <button
                type="button"
                className="tool-btn"
                onClick={handleUndo}
                disabled={historyIndex <= 0}
                title="Undo"
              >
                Undo
              </button>
              <button
                type="button"
                className="tool-btn"
                onClick={handleRedo}
                disabled={historyIndex >= history.length - 1}
                title="Redo"
              >
                Redo
              </button>
              <button
                type="button"
                className="tool-btn"
                onClick={handleClear}
                title="Clear all"
              >
                Clear
              </button>
            </div>
          </>
        )}

        {readOnly && (
          <div className="read-only-badge">
            View Only
          </div>
        )}
      </div>

      <div className="annotator-canvas-container">
        <img
          ref={imageRef}
          src={imageUrl}
          alt="Clinical photo"
          style={{ display: 'none' }}
          onLoad={handleImageLoad}
          crossOrigin="anonymous"
        />
        <canvas
          ref={canvasRef}
          className="annotator-canvas"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          style={{ cursor: readOnly ? 'default' : 'crosshair' }}
        />
      </div>

      {!readOnly && (
        <div className="annotator-actions">
          {onCancel && (
            <button type="button" className="btn-secondary" onClick={onCancel}>
              Cancel
            </button>
          )}
          {onSave && (
            <button type="button" className="btn-primary" onClick={handleSave}>
              Save Annotations
            </button>
          )}
        </div>
      )}

      {showTextDialog && (
        <div className="text-dialog-overlay">
          <div className="text-dialog">
            <h3>Add Text Annotation</h3>
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Enter text..."
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTextSubmit();
                if (e.key === 'Escape') {
                  setShowTextDialog(false);
                  setIsDrawing(false);
                }
              }}
            />
            <div className="dialog-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowTextDialog(false);
                  setIsDrawing(false);
                }}
              >
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={handleTextSubmit}>
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
