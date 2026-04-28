import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

type FeedbackMarkupTool = 'highlight' | 'circle' | 'arrow';

type FeedbackMarkup = {
  type: FeedbackMarkupTool;
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
};

interface FeedbackScreenshotEditorProps {
  imageFile: File;
  onConfirm: (file: File) => void;
  onUseOriginal: () => void;
  onCancel: () => void;
}

const TOOL_LABELS: Record<FeedbackMarkupTool, string> = {
  highlight: 'Highlight',
  circle: 'Circle',
  arrow: 'Arrow',
};

function drawArrow(ctx: CanvasRenderingContext2D, shape: FeedbackMarkup) {
  const fromX = shape.x;
  const fromY = shape.y;
  const toX = shape.x + (shape.width || 0);
  const toY = shape.y + (shape.height || 0);
  const headLength = 18;
  const angle = Math.atan2(toY - fromY, toX - fromX);

  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(
    toX - headLength * Math.cos(angle - Math.PI / 7),
    toY - headLength * Math.sin(angle - Math.PI / 7),
  );
  ctx.lineTo(
    toX - headLength * Math.cos(angle + Math.PI / 7),
    toY - headLength * Math.sin(angle + Math.PI / 7),
  );
  ctx.lineTo(toX, toY);
  ctx.fillStyle = '#dc2626';
  ctx.fill();
}

function drawMarkup(ctx: CanvasRenderingContext2D, shape: FeedbackMarkup) {
  switch (shape.type) {
    case 'highlight':
      ctx.fillStyle = 'rgba(250, 204, 21, 0.28)';
      ctx.strokeStyle = 'rgba(217, 119, 6, 0.95)';
      ctx.lineWidth = 4;
      ctx.fillRect(shape.x, shape.y, shape.width || 0, shape.height || 0);
      ctx.strokeRect(shape.x, shape.y, shape.width || 0, shape.height || 0);
      break;
    case 'circle':
      ctx.beginPath();
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 5;
      ctx.arc(shape.x, shape.y, shape.radius || 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'arrow':
      drawArrow(ctx, shape);
      break;
  }
}

export function FeedbackScreenshotEditor({
  imageFile,
  onConfirm,
  onUseOriginal,
  onCancel,
}: FeedbackScreenshotEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const activePointerId = useRef<number | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [selectedTool, setSelectedTool] = useState<FeedbackMarkupTool>('highlight');
  const [markups, setMarkups] = useState<FeedbackMarkup[]>([]);
  const [history, setHistory] = useState<FeedbackMarkup[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [currentMarkup, setCurrentMarkup] = useState<FeedbackMarkup | null>(null);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMarkups([]);
    setHistory([[]]);
    setHistoryIndex(0);
    setCurrentMarkup(null);
    setStartPoint(null);
    setIsDrawing(false);
    setImageLoaded(false);
    setError(null);

    const url = URL.createObjectURL(imageFile);
    objectUrlRef.current = url;
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      imageRef.current = image;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      setImageLoaded(true);
    };
    image.onerror = () => {
      if (cancelled) return;
      setError('Could not load the screenshot for markup.');
    };
    image.src = url;

    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
      if (objectUrlRef.current === url) {
        objectUrlRef.current = null;
      }
    };
  }, [imageFile]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !imageLoaded) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    markups.forEach((shape) => drawMarkup(ctx, shape));
    if (currentMarkup) {
      drawMarkup(ctx, currentMarkup);
    }
  }, [currentMarkup, imageLoaded, markups]);

  const addToHistory = (nextMarkups: FeedbackMarkup[]) => {
    const nextHistory = history.slice(0, historyIndex + 1);
    nextHistory.push(nextMarkups);
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
  };

  const getCanvasPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!imageLoaded || activePointerId.current !== null) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const point = getCanvasPoint(event);
    canvas.setPointerCapture(event.pointerId);
    activePointerId.current = event.pointerId;
    setStartPoint(point);
    setIsDrawing(true);
    setCurrentMarkup({
      type: selectedTool,
      x: point.x,
      y: point.y,
      width: 0,
      height: 0,
      radius: 0,
    });
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !startPoint || activePointerId.current !== event.pointerId) return;
    const point = getCanvasPoint(event);

    setCurrentMarkup((prev) => {
      if (!prev) return prev;
      if (prev.type === 'circle') {
        const radius = Math.sqrt(((point.x - startPoint.x) ** 2) + ((point.y - startPoint.y) ** 2));
        return {
          ...prev,
          radius,
        };
      }
      return {
        ...prev,
        width: point.x - startPoint.x,
        height: point.y - startPoint.y,
      };
    });
  };

  const finishDrawing = (pointerId: number | null) => {
    const canvas = canvasRef.current;
    if (canvas && pointerId !== null) {
      canvas.releasePointerCapture(pointerId);
    }
    activePointerId.current = null;

    if (currentMarkup) {
      const nextMarkups = [...markups, currentMarkup];
      setMarkups(nextMarkups);
      addToHistory(nextMarkups);
    }

    setCurrentMarkup(null);
    setStartPoint(null);
    setIsDrawing(false);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activePointerId.current !== event.pointerId) return;
    finishDrawing(event.pointerId);
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activePointerId.current !== event.pointerId) return;
    finishDrawing(event.pointerId);
  };

  const handleUndo = () => {
    if (historyIndex === 0) return;
    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    setMarkups(history[nextIndex]);
  };

  const handleRedo = () => {
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    setMarkups(history[nextIndex]);
  };

  const handleClear = () => {
    const nextMarkups: FeedbackMarkup[] = [];
    setMarkups(nextMarkups);
    addToHistory(nextMarkups);
  };

  const handleConfirm = () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      setError('Could not prepare the marked-up screenshot.');
      return;
    }

    canvas.toBlob((blob) => {
      if (!blob) {
        setError('Could not prepare the marked-up screenshot.');
        return;
      }

      const baseName = imageFile.name.replace(/\.png$/i, '');
      const annotatedFile = new File([blob], `${baseName}-annotated.png`, { type: 'image/png' });
      onConfirm(annotatedFile);
    }, 'image/png');
  };

  return (
    <div style={{ display: 'grid', gap: '0.9rem' }}>
      <div
        style={{
          background: '#f8fafc',
          border: '1px solid #dbeafe',
          borderRadius: '10px',
          padding: '0.85rem',
          color: '#1e3a8a',
          fontSize: '0.85rem',
          lineHeight: 1.45,
        }}
      >
        Drag on the screenshot to mark the problem area before sending it to Dan. Use <strong>Highlight</strong> for regions, <strong>Circle</strong> for one item, and <strong>Arrow</strong> to point at something specific.
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}>
        {(['highlight', 'circle', 'arrow'] as const).map((tool) => (
          <button
            key={tool}
            type="button"
            className={selectedTool === tool ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setSelectedTool(tool)}
          >
            {TOOL_LABELS[tool]}
          </button>
        ))}
        <button type="button" className="btn-secondary" onClick={handleUndo} disabled={historyIndex === 0}>
          Undo
        </button>
        <button type="button" className="btn-secondary" onClick={handleRedo} disabled={historyIndex >= history.length - 1}>
          Redo
        </button>
        <button type="button" className="btn-secondary" onClick={handleClear} disabled={markups.length === 0}>
          Clear
        </button>
      </div>

      <div
        style={{
          border: '1px solid #d1d5db',
          borderRadius: '12px',
          overflow: 'auto',
          maxHeight: '68vh',
          background: '#e5e7eb',
        }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerCancel}
          onPointerCancel={handlePointerCancel}
          style={{
            display: 'block',
            width: '100%',
            cursor: 'crosshair',
            touchAction: 'none',
            background: '#ffffff',
          }}
          aria-label="Feedback screenshot editor"
        />
      </div>

      {error ? (
        <div
          role="alert"
          style={{
            border: '1px solid #fecaca',
            borderRadius: '8px',
            background: '#fef2f2',
            color: '#991b1b',
            padding: '0.65rem 0.75rem',
            fontSize: '0.82rem',
          }}
        >
          {error}
        </div>
      ) : null}

      <div className="modal-footer" style={{ padding: 0 }}>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn-secondary" onClick={onUseOriginal}>
          Skip Markup
        </button>
        <button type="button" className="btn-primary" onClick={handleConfirm} disabled={!imageLoaded}>
          OK
        </button>
      </div>
    </div>
  );
}
