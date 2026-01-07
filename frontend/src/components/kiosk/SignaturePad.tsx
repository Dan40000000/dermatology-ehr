import { useRef, useEffect, useState } from 'react';
import '../../styles/kiosk.css';

interface SignaturePadProps {
  onSave: (signatureData: string) => void;
  onClear?: () => void;
  width?: number;
  height?: number;
  lineWidth?: number;
  lineColor?: string;
}

const canvasStyle: React.CSSProperties = {
  border: '2px solid #d1d5db',
  borderRadius: '0.5rem',
  touchAction: 'none',
  cursor: 'crosshair',
  background: 'white',
  width: '100%',
  height: 'auto',
};

const buttonContainerStyle: React.CSSProperties = {
  display: 'flex',
  gap: '1rem',
  marginTop: '1.5rem',
};

const clearBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: '1rem 2rem',
  fontSize: '1.25rem',
  fontWeight: 500,
  color: '#374151',
  background: 'white',
  border: '2px solid #d1d5db',
  borderRadius: '0.5rem',
  cursor: 'pointer',
};

const saveBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: '1rem 2rem',
  fontSize: '1.25rem',
  fontWeight: 500,
  color: 'white',
  background: '#7c3aed',
  border: 'none',
  borderRadius: '0.5rem',
  cursor: 'pointer',
};

const disabledStyle: React.CSSProperties = {
  opacity: 0.5,
  cursor: 'not-allowed',
};

export function SignaturePad({
  onSave,
  onClear,
  width = 600,
  height = 200,
  lineWidth = 2,
  lineColor = '#000000',
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const [context, setContext] = useState<CanvasRenderingContext2D | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    setContext(ctx);

    // Set canvas background to white
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }, [lineColor, lineWidth, width, height]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!context) return;

    setIsDrawing(true);
    setIsEmpty(false);

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    let x: number, y: number;

    if ('touches' in e) {
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
    } else {
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
    }

    context.beginPath();
    context.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !context) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    let x: number, y: number;

    if ('touches' in e) {
      e.preventDefault(); // Prevent scrolling while drawing
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
    } else {
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
    }

    context.lineTo(x, y);
    context.stroke();
  };

  const stopDrawing = () => {
    if (!context) return;
    context.closePath();
    setIsDrawing(false);
  };

  const clear = () => {
    if (!context || !canvasRef.current) return;

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    setIsEmpty(true);

    if (onClear) {
      onClear();
    }
  };

  const save = () => {
    if (!canvasRef.current || isEmpty) return;

    const dataUrl = canvasRef.current.toDataURL('image/png');
    onSave(dataUrl);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
        style={{ ...canvasStyle, maxWidth: `${width}px` }}
      />
      <div style={buttonContainerStyle}>
        <button
          type="button"
          onClick={clear}
          disabled={isEmpty}
          style={isEmpty ? { ...clearBtnStyle, ...disabledStyle } : clearBtnStyle}
        >
          Clear
        </button>
        <button
          type="button"
          onClick={save}
          disabled={isEmpty}
          style={isEmpty ? { ...saveBtnStyle, ...disabledStyle } : saveBtnStyle}
        >
          Save Signature
        </button>
      </div>
    </div>
  );
}
