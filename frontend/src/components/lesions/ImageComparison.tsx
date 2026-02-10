import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  Paper,
  Grid,
  Slider,
  Alert,
  Chip,
  IconButton,
  Tooltip,
  Card,
  CardMedia,
  CardContent
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import {
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  SwapHoriz as SwapIcon,
  TrendingUp as GrowthIcon,
  TrendingDown as ShrinkIcon
} from '@mui/icons-material';
import { format, subMonths } from 'date-fns';

interface LesionImage {
  id: string;
  imageUrl: string;
  thumbnailUrl: string | null;
  capturedAt: string;
  dermoscopy: boolean;
  measurements: Record<string, unknown>;
}

interface LesionMeasurement {
  lengthMm: number | null;
  widthMm: number | null;
}

interface ComparisonData {
  lesionId: string;
  image1: LesionImage | null;
  image2: LesionImage | null;
  measurement1: LesionMeasurement | null;
  measurement2: LesionMeasurement | null;
  sizeChange: number | null;
  timespan: string;
}

interface ImageComparisonProps {
  lesionId: string;
}

const ImageComparison: React.FC<ImageComparisonProps> = ({ lesionId }) => {
  const [comparison, setComparison] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [date1, setDate1] = useState<Date>(subMonths(new Date(), 6));
  const [date2, setDate2] = useState<Date>(new Date());
  const [sliderPosition, setSliderPosition] = useState(50);
  const [zoom, setZoom] = useState(1);

  const containerRef = useRef<HTMLDivElement>(null);

  const fetchComparison = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('token');
      const tenantId = localStorage.getItem('tenantId');

      const params = new URLSearchParams({
        date1: date1.toISOString(),
        date2: date2.toISOString()
      });

      const response = await fetch(`/api/lesion-tracking/${lesionId}/compare?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-tenant-id': tenantId || ''
        }
      });

      if (response.ok) {
        const data = await response.json();
        setComparison(data);
      } else {
        setError('Failed to load comparison');
      }
    } catch (err) {
      console.error('Error fetching comparison:', err);
      setError('Failed to load comparison');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComparison();
  }, [lesionId, date1, date2]);

  const handleSwapDates = () => {
    const temp = date1;
    setDate1(date2);
    setDate2(temp);
  };

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.25, 0.5));
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={4}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (!comparison) {
    return <Alert severity="info">No comparison data available</Alert>;
  }

  const hasImages = comparison.image1 && comparison.image2;
  const hasMeasurements = comparison.measurement1 && comparison.measurement2;

  return (
    <Box>
      {/* Date Selection */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={5}>
              <DatePicker
                label="Earlier Date"
                value={date1}
                onChange={(newValue) => newValue && setDate1(newValue)}
                slotProps={{ textField: { fullWidth: true, size: 'small' } }}
              />
            </Grid>
            <Grid item xs={2} textAlign="center">
              <Tooltip title="Swap dates">
                <IconButton onClick={handleSwapDates}>
                  <SwapIcon />
                </IconButton>
              </Tooltip>
            </Grid>
            <Grid item xs={5}>
              <DatePicker
                label="Later Date"
                value={date2}
                onChange={(newValue) => newValue && setDate2(newValue)}
                slotProps={{ textField: { fullWidth: true, size: 'small' } }}
              />
            </Grid>
          </Grid>
        </LocalizationProvider>
      </Paper>

      {/* Size Change Summary */}
      {hasMeasurements && comparison.sizeChange !== null && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={4}>
              <Typography variant="caption" color="text.secondary">Earlier Size</Typography>
              <Typography variant="h6">
                {comparison.measurement1?.lengthMm || '-'} x {comparison.measurement1?.widthMm || '-'} mm
              </Typography>
            </Grid>
            <Grid item xs={4} textAlign="center">
              <Typography variant="caption" color="text.secondary">Change over {comparison.timespan}</Typography>
              <Box display="flex" alignItems="center" justifyContent="center" gap={1}>
                {comparison.sizeChange > 0 ? (
                  <GrowthIcon color="error" />
                ) : comparison.sizeChange < 0 ? (
                  <ShrinkIcon color="success" />
                ) : null}
                <Chip
                  label={`${comparison.sizeChange > 0 ? '+' : ''}${comparison.sizeChange.toFixed(1)}%`}
                  color={
                    comparison.sizeChange > 20 ? 'error' :
                    comparison.sizeChange > 0 ? 'warning' :
                    'success'
                  }
                  size="small"
                />
              </Box>
              {comparison.sizeChange > 20 && (
                <Alert severity="warning" sx={{ mt: 1, py: 0 }}>
                  Significant size increase detected
                </Alert>
              )}
            </Grid>
            <Grid item xs={4} textAlign="right">
              <Typography variant="caption" color="text.secondary">Current Size</Typography>
              <Typography variant="h6">
                {comparison.measurement2?.lengthMm || '-'} x {comparison.measurement2?.widthMm || '-'} mm
              </Typography>
            </Grid>
          </Grid>
        </Paper>
      )}

      {/* Image Comparison */}
      {hasImages ? (
        <Box>
          {/* Zoom Controls */}
          <Box display="flex" justifyContent="center" gap={1} mb={2}>
            <IconButton onClick={handleZoomOut} disabled={zoom <= 0.5}>
              <ZoomOutIcon />
            </IconButton>
            <Chip label={`${Math.round(zoom * 100)}%`} size="small" />
            <IconButton onClick={handleZoomIn} disabled={zoom >= 3}>
              <ZoomInIcon />
            </IconButton>
          </Box>

          {/* Slider Comparison View */}
          <Paper
            ref={containerRef}
            sx={{
              position: 'relative',
              overflow: 'hidden',
              height: 400,
              mb: 2
            }}
          >
            {/* Background (Later) Image */}
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                overflow: 'hidden'
              }}
            >
              <img
                src={comparison.image2?.imageUrl}
                alt="Later image"
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  transform: `scale(${zoom})`
                }}
              />
            </Box>

            {/* Foreground (Earlier) Image with clip */}
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                clipPath: `polygon(0 0, ${sliderPosition}% 0, ${sliderPosition}% 100%, 0 100%)`,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                overflow: 'hidden'
              }}
            >
              <img
                src={comparison.image1?.imageUrl}
                alt="Earlier image"
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  transform: `scale(${zoom})`
                }}
              />
            </Box>

            {/* Slider Line */}
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${sliderPosition}%`,
                width: 4,
                bgcolor: 'primary.main',
                cursor: 'ew-resize',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  bgcolor: 'primary.main',
                  border: '2px solid white'
                }
              }}
            />

            {/* Date Labels */}
            <Box
              sx={{
                position: 'absolute',
                bottom: 8,
                left: 8,
                bgcolor: 'rgba(0,0,0,0.7)',
                color: 'white',
                px: 1,
                py: 0.5,
                borderRadius: 1
              }}
            >
              <Typography variant="caption">
                {format(new Date(comparison.image1?.capturedAt || date1), 'MMM d, yyyy')}
              </Typography>
            </Box>
            <Box
              sx={{
                position: 'absolute',
                bottom: 8,
                right: 8,
                bgcolor: 'rgba(0,0,0,0.7)',
                color: 'white',
                px: 1,
                py: 0.5,
                borderRadius: 1
              }}
            >
              <Typography variant="caption">
                {format(new Date(comparison.image2?.capturedAt || date2), 'MMM d, yyyy')}
              </Typography>
            </Box>
          </Paper>

          {/* Slider Control */}
          <Box px={2}>
            <Slider
              value={sliderPosition}
              onChange={(_, value) => setSliderPosition(value as number)}
              min={0}
              max={100}
              valueLabelDisplay="auto"
              valueLabelFormat={(value) => `${value}%`}
            />
          </Box>
        </Box>
      ) : (
        <Alert severity="info">
          No images available for the selected date range. Try adjusting the dates or capture new images.
        </Alert>
      )}

      {/* Side by Side View */}
      {hasImages && (
        <Box mt={3}>
          <Typography variant="subtitle2" gutterBottom>Side by Side</Typography>
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <Card>
                <CardMedia
                  component="img"
                  height="200"
                  image={comparison.image1?.imageUrl}
                  alt="Earlier image"
                  sx={{ objectFit: 'contain', bgcolor: '#f5f5f5' }}
                />
                <CardContent sx={{ py: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    {format(new Date(comparison.image1?.capturedAt || date1), 'MMM d, yyyy')}
                  </Typography>
                  {comparison.image1?.dermoscopy && (
                    <Chip label="Dermoscopy" size="small" sx={{ ml: 1 }} />
                  )}
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6}>
              <Card>
                <CardMedia
                  component="img"
                  height="200"
                  image={comparison.image2?.imageUrl}
                  alt="Later image"
                  sx={{ objectFit: 'contain', bgcolor: '#f5f5f5' }}
                />
                <CardContent sx={{ py: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    {format(new Date(comparison.image2?.capturedAt || date2), 'MMM d, yyyy')}
                  </Typography>
                  {comparison.image2?.dermoscopy && (
                    <Chip label="Dermoscopy" size="small" sx={{ ml: 1 }} />
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      )}
    </Box>
  );
};

export default ImageComparison;
