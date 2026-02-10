import { useRef, useState, useEffect, useCallback } from 'react';

interface SignaturePadProps {
  onSignatureChange: (signatureData: string | null) => void;
  width?: number;
  height?: number;
  penColor?: string;
  backgroundColor?: string;
  disabled?: boolean;
  initialSignature?: string;
}

interface Point {
  x: number;
  y: number;
}

export function SignaturePad({
  onSignatureChange,
  width = 500,
  height = 200,
  penColor = '#000000',
  backgroundColor = '#ffffff',
  disabled = false,
  initialSignature,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const lastPoint = useRef<Point | null>(null);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = width;
    canvas.height = height;

    // Fill background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    // Load initial signature if provided
    if (initialSignature) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        setHasSignature(true);
      };
      img.src = initialSignature;
    }
  }, [width, height, backgroundColor, initialSignature]);

  const getPoint = useCallback((e: React.MouseEvent | React.TouchEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ('touches' in e) {
      const touch = e.touches[0];
      if (!touch) return { x: 0, y: 0 };
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    } else {
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    }
  }, []);

  const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return;
    e.preventDefault();

    const point = getPoint(e);
    lastPoint.current = point;
    setIsDrawing(true);
  }, [disabled, getPoint]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || disabled) return;
    e.preventDefault();

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !lastPoint.current) return;

    const currentPoint = getPoint(e);

    ctx.beginPath();
    ctx.strokeStyle = penColor;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(currentPoint.x, currentPoint.y);
    ctx.stroke();

    lastPoint.current = currentPoint;
    setHasSignature(true);
  }, [isDrawing, disabled, penColor, getPoint]);

  const stopDrawing = useCallback(() => {
    if (!isDrawing) return;

    setIsDrawing(false);
    lastPoint.current = null;

    // Export signature data
    const canvas = canvasRef.current;
    if (canvas && hasSignature) {
      const signatureData = canvas.toDataURL('image/png');
      onSignatureChange(signatureData);
    }
  }, [isDrawing, hasSignature, onSignatureChange]);

  const clearSignature = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);
    setHasSignature(false);
    onSignatureChange(null);
  }, [backgroundColor, width, height, onSignatureChange]);

  // Handle mouse leaving canvas
  useEffect(() => {
    const handleMouseUp = () => {
      if (isDrawing) {
        stopDrawing();
      }
    };

    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchend', handleMouseUp);

    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDrawing, stopDrawing]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div
        style={{
          border: '2px solid #d1d5db',
          borderRadius: '8px',
          overflow: 'hidden',
          backgroundColor: backgroundColor,
          opacity: disabled ? 0.6 : 1,
          cursor: disabled ? 'not-allowed' : 'crosshair',
        }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          style={{
            display: 'block',
            width: '100%',
            maxWidth: `${width}px`,
            height: 'auto',
            aspectRatio: `${width}/${height}`,
            touchAction: 'none',
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <button
          type="button"
          onClick={clearSignature}
          disabled={disabled || !hasSignature}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            cursor: disabled || !hasSignature ? 'not-allowed' : 'pointer',
            fontSize: '0.875rem',
            opacity: disabled || !hasSignature ? 0.5 : 1,
          }}
        >
          Clear Signature
        </button>

        {hasSignature && (
          <span style={{ color: '#059669', fontSize: '0.875rem' }}>
            Signature captured
          </span>
        )}
      </div>

      <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0 }}>
        Sign above using your mouse or finger (on touch devices)
      </p>
    </div>
  );
}

export default SignaturePad;
