/**
 * MohsMap Component
 * Interactive tumor mapping for Mohs surgery
 * Allows drawing margins and marking positive/negative areas
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Button,
  IconButton,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Slider,
  Stack
} from '@mui/material';
import {
  Brush as BrushIcon,
  Circle as CircleIcon,
  RadioButtonUnchecked as OutlineIcon,
  Undo as UndoIcon,
  Redo as RedoIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  RotateRight as RotateIcon
} from '@mui/icons-material';

interface Annotation {
  id: string;
  type: 'tumor_margin' | 'positive_margin' | 'negative_margin' | 'excision_line';
  points: [number, number][];
  color: string;
  stage?: number;
  block?: string;
  notes?: string;
}

interface MohsMapProps {
  caseId: string;
  stageId?: string;
  stageNumber?: number;
  initialAnnotations?: Annotation[];
  baseImageUrl?: string;
  orientation12Oclock?: string;
  onSave?: (mapSvg: string, annotations: Annotation[]) => void;
  readOnly?: boolean;
}

const COLORS = {
  tumor: '#ff0000',
  positive: '#ff4444',
  negative: '#4caf50',
  excision: '#2196f3',
  pending: '#ff9800'
};

const MohsMap: React.FC<MohsMapProps> = ({
  caseId,
  stageId,
  stageNumber,
  initialAnnotations = [],
  baseImageUrl,
  orientation12Oclock = 'superior',
  onSave,
  readOnly = false
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>(initialAnnotations);
  const [currentTool, setCurrentTool] = useState<'draw' | 'circle' | 'select'>('draw');
  const [currentColor, setCurrentColor] = useState<string>(COLORS.tumor);
  const [currentType, setCurrentType] = useState<Annotation['type']>('tumor_margin');
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState<[number, number][]>([]);
  const [history, setHistory] = useState<Annotation[][]>([initialAnnotations]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [brushSize, setBrushSize] = useState(3);
  const [selectedBlock, setSelectedBlock] = useState<string>('');

  const CANVAS_SIZE = 400;

  // Draw all annotations on canvas
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Draw base circle (tumor site)
    ctx.beginPath();
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2 - 20, 0, Math.PI * 2);
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw orientation markers
    ctx.fillStyle = '#666';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('12', CANVAS_SIZE / 2, 15);
    ctx.fillText('3', CANVAS_SIZE - 10, CANVAS_SIZE / 2 + 4);
    ctx.fillText('6', CANVAS_SIZE / 2, CANVAS_SIZE - 5);
    ctx.fillText('9', 10, CANVAS_SIZE / 2 + 4);

    // Draw orientation label
    ctx.font = '10px Arial';
    ctx.fillText(`(${orientation12Oclock})`, CANVAS_SIZE / 2, 28);

    // Draw all annotations
    annotations.forEach((annotation) => {
      if (annotation.points.length < 2) return;

      ctx.beginPath();
      ctx.strokeStyle = annotation.color;
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const firstPoint = annotation.points[0];
      if (firstPoint) {
        ctx.moveTo(firstPoint[0], firstPoint[1]);
        annotation.points.slice(1).forEach((point) => {
          ctx.lineTo(point[0], point[1]);
        });
      }
      ctx.stroke();
    });

    // Draw current path being drawn
    if (currentPath.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const firstPoint = currentPath[0];
      if (firstPoint) {
        ctx.moveTo(firstPoint[0], firstPoint[1]);
        currentPath.slice(1).forEach((point) => {
          ctx.lineTo(point[0], point[1]);
        });
      }
      ctx.stroke();
    }
  }, [annotations, currentPath, currentColor, brushSize, orientation12Oclock]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement>): [number, number] => {
    const canvas = canvasRef.current;
    if (!canvas) return [0, 0];

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    return [x, y];
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (readOnly) return;
    setIsDrawing(true);
    const coords = getCanvasCoordinates(e);
    setCurrentPath([coords]);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || readOnly) return;
    const coords = getCanvasCoordinates(e);
    setCurrentPath((prev) => [...prev, coords]);
  };

  const handleMouseUp = () => {
    if (!isDrawing || readOnly) return;
    setIsDrawing(false);

    if (currentPath.length > 1) {
      const newAnnotation: Annotation = {
        id: `annotation-${Date.now()}`,
        type: currentType,
        points: currentPath,
        color: currentColor,
        stage: stageNumber,
        block: selectedBlock || undefined
      };

      const newAnnotations = [...annotations, newAnnotation];
      setAnnotations(newAnnotations);

      // Update history
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(newAnnotations);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }

    setCurrentPath([]);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      const previousAnnotations = history[historyIndex - 1];
      if (previousAnnotations) {
        setAnnotations(previousAnnotations);
      }
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      const nextAnnotations = history[historyIndex + 1];
      if (nextAnnotations) {
        setAnnotations(nextAnnotations);
      }
    }
  };

  const handleClear = () => {
    setAnnotations([]);
    const newHistory = [...history, []];
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleTypeChange = (type: Annotation['type']) => {
    setCurrentType(type);
    switch (type) {
      case 'tumor_margin':
        setCurrentColor(COLORS.tumor);
        break;
      case 'positive_margin':
        setCurrentColor(COLORS.positive);
        break;
      case 'negative_margin':
        setCurrentColor(COLORS.negative);
        break;
      case 'excision_line':
        setCurrentColor(COLORS.excision);
        break;
    }
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas || !onSave) return;

    // Generate SVG from canvas
    const svgData = generateSvgFromAnnotations();
    onSave(svgData, annotations);
  };

  const generateSvgFromAnnotations = (): string => {
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}">`;

    // Base circle
    svg += `<circle cx="${CANVAS_SIZE / 2}" cy="${CANVAS_SIZE / 2}" r="${CANVAS_SIZE / 2 - 20}" fill="none" stroke="#e0e0e0" stroke-width="2"/>`;

    // Annotations
    annotations.forEach((annotation) => {
      if (annotation.points.length < 2) return;

      const pathData = annotation.points
        .map((point, i) => {
          const command = i === 0 ? 'M' : 'L';
          return `${command}${point[0]},${point[1]}`;
        })
        .join(' ');

      svg += `<path d="${pathData}" fill="none" stroke="${annotation.color}" stroke-width="${brushSize}" stroke-linecap="round" stroke-linejoin="round"/>`;
    });

    // Orientation markers
    svg += `<text x="${CANVAS_SIZE / 2}" y="15" text-anchor="middle" font-size="12" fill="#666">12</text>`;
    svg += `<text x="${CANVAS_SIZE - 10}" y="${CANVAS_SIZE / 2 + 4}" text-anchor="middle" font-size="12" fill="#666">3</text>`;
    svg += `<text x="${CANVAS_SIZE / 2}" y="${CANVAS_SIZE - 5}" text-anchor="middle" font-size="12" fill="#666">6</text>`;
    svg += `<text x="10" y="${CANVAS_SIZE / 2 + 4}" text-anchor="middle" font-size="12" fill="#666">9</text>`;

    svg += '</svg>';
    return svg;
  };

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Mohs Tumor Map {stageNumber && `- Stage ${stageNumber}`}
      </Typography>

      {/* Toolbar */}
      {!readOnly && (
        <Box mb={2}>
          <Stack direction="row" spacing={2} alignItems="center" mb={1}>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Annotation Type</InputLabel>
              <Select
                value={currentType}
                label="Annotation Type"
                onChange={(e) => handleTypeChange(e.target.value as Annotation['type'])}
              >
                <MenuItem value="tumor_margin">
                  <Box display="flex" alignItems="center" gap={1}>
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        backgroundColor: COLORS.tumor
                      }}
                    />
                    Tumor Margin
                  </Box>
                </MenuItem>
                <MenuItem value="positive_margin">
                  <Box display="flex" alignItems="center" gap={1}>
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        backgroundColor: COLORS.positive
                      }}
                    />
                    Positive (+)
                  </Box>
                </MenuItem>
                <MenuItem value="negative_margin">
                  <Box display="flex" alignItems="center" gap={1}>
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        backgroundColor: COLORS.negative
                      }}
                    />
                    Negative (-)
                  </Box>
                </MenuItem>
                <MenuItem value="excision_line">
                  <Box display="flex" alignItems="center" gap={1}>
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        backgroundColor: COLORS.excision
                      }}
                    />
                    Excision Line
                  </Box>
                </MenuItem>
              </Select>
            </FormControl>

            <TextField
              size="small"
              label="Block"
              value={selectedBlock}
              onChange={(e) => setSelectedBlock(e.target.value)}
              sx={{ width: 80 }}
              placeholder="A, B..."
            />

            <Box sx={{ width: 150 }}>
              <Typography variant="caption" color="text.secondary">
                Brush Size: {brushSize}
              </Typography>
              <Slider
                value={brushSize}
                onChange={(_, value) => setBrushSize(value as number)}
                min={1}
                max={10}
                size="small"
              />
            </Box>

            <Box>
              <Tooltip title="Undo">
                <IconButton onClick={handleUndo} disabled={historyIndex <= 0}>
                  <UndoIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Redo">
                <IconButton onClick={handleRedo} disabled={historyIndex >= history.length - 1}>
                  <RedoIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Clear All">
                <IconButton onClick={handleClear} color="error">
                  <DeleteIcon />
                </IconButton>
              </Tooltip>
            </Box>
          </Stack>
        </Box>
      )}

      {/* Canvas */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          mb: 2,
          overflow: 'hidden'
        }}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{
            border: '1px solid #e0e0e0',
            borderRadius: 8,
            cursor: readOnly ? 'default' : 'crosshair',
            transform: `scale(${zoom})`,
            transformOrigin: 'center'
          }}
        />
      </Box>

      {/* Legend */}
      <Box display="flex" gap={2} mb={2} justifyContent="center">
        <Box display="flex" alignItems="center" gap={0.5}>
          <Box sx={{ width: 16, height: 3, backgroundColor: COLORS.tumor }} />
          <Typography variant="caption">Tumor</Typography>
        </Box>
        <Box display="flex" alignItems="center" gap={0.5}>
          <Box sx={{ width: 16, height: 3, backgroundColor: COLORS.positive }} />
          <Typography variant="caption">Positive (+)</Typography>
        </Box>
        <Box display="flex" alignItems="center" gap={0.5}>
          <Box sx={{ width: 16, height: 3, backgroundColor: COLORS.negative }} />
          <Typography variant="caption">Negative (-)</Typography>
        </Box>
        <Box display="flex" alignItems="center" gap={0.5}>
          <Box sx={{ width: 16, height: 3, backgroundColor: COLORS.excision }} />
          <Typography variant="caption">Excision</Typography>
        </Box>
      </Box>

      {/* Zoom controls */}
      <Box display="flex" justifyContent="center" gap={1} mb={2}>
        <Tooltip title="Zoom Out">
          <IconButton onClick={() => setZoom(Math.max(0.5, zoom - 0.1))} size="small">
            <ZoomOutIcon />
          </IconButton>
        </Tooltip>
        <Typography variant="body2" sx={{ alignSelf: 'center' }}>
          {Math.round(zoom * 100)}%
        </Typography>
        <Tooltip title="Zoom In">
          <IconButton onClick={() => setZoom(Math.min(2, zoom + 0.1))} size="small">
            <ZoomInIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Save button */}
      {!readOnly && onSave && (
        <Box display="flex" justifyContent="flex-end">
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleSave}
          >
            Save Map
          </Button>
        </Box>
      )}
    </Paper>
  );
};

export default MohsMap;
