import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  Paper,
  Grid,
  Chip,
  Card,
  CardMedia,
  CardContent,
  Divider,
  Alert
} from '@mui/material';
import {
  Timeline,
  TimelineItem,
  TimelineSeparator,
  TimelineConnector,
  TimelineContent,
  TimelineDot,
  TimelineOppositeContent
} from '@mui/lab';
import {
  CameraAlt as CameraIcon,
  Straighten as MeasureIcon,
  Assessment as ABCDEIcon,
  LocalHospital as OutcomeIcon,
  Warning as AlertIcon,
  Add as AddIcon
} from '@mui/icons-material';
import { format } from 'date-fns';

interface LesionImage {
  id: string;
  imageUrl: string;
  thumbnailUrl: string | null;
  capturedAt: string;
  dermoscopy: boolean;
}

interface LesionMeasurement {
  id: string;
  lengthMm: number | null;
  widthMm: number | null;
  measuredAt: string;
  color: string | null;
  border: string | null;
}

interface ABCDEScore {
  id: string;
  asymmetry: number;
  border: number;
  color: number;
  diameter: number;
  evolution: number;
  totalScore: number;
  assessedAt: string;
}

interface LesionOutcome {
  id: string;
  outcomeType: string;
  outcomeDate: string;
  pathologyResult: string | null;
  diagnosisCode: string | null;
}

interface LesionAlert {
  id: string;
  alertType: string;
  severity: string;
  message: string;
  createdAt: string;
}

interface TrackedLesion {
  id: string;
  bodyLocationDescription: string;
  firstDocumented: string;
  status: string;
  clinicalDescription: string | null;
  suspicionLevel: number;
}

interface LesionHistory {
  lesion: TrackedLesion;
  images: LesionImage[];
  measurements: LesionMeasurement[];
  abcdeScores: ABCDEScore[];
  outcomes: LesionOutcome[];
  alerts: LesionAlert[];
}

interface TimelineEvent {
  type: 'image' | 'measurement' | 'abcde' | 'outcome' | 'alert' | 'created';
  date: string;
  data: LesionImage | LesionMeasurement | ABCDEScore | LesionOutcome | LesionAlert | TrackedLesion;
}

interface LesionTimelineProps {
  lesionId: string;
  onClose?: () => void;
}

const LesionTimeline: React.FC<LesionTimelineProps> = ({ lesionId }) => {
  const [history, setHistory] = useState<LesionHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        const tenantId = localStorage.getItem('tenantId');

        const response = await fetch(`/api/lesion-tracking/${lesionId}/timeline`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'x-tenant-id': tenantId || ''
          }
        });

        if (response.ok) {
          const data = await response.json();
          setHistory(data);
        } else {
          setError('Failed to load timeline');
        }
      } catch (err) {
        console.error('Error fetching timeline:', err);
        setError('Failed to load timeline');
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [lesionId]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={4}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !history) {
    return (
      <Alert severity="error">{error || 'Failed to load timeline'}</Alert>
    );
  }

  // Build timeline events
  const events: TimelineEvent[] = [];

  // Add lesion creation
  events.push({
    type: 'created',
    date: history.lesion.firstDocumented,
    data: history.lesion
  });

  // Add images
  history.images.forEach(img => {
    events.push({ type: 'image', date: img.capturedAt, data: img });
  });

  // Add measurements
  history.measurements.forEach(m => {
    events.push({ type: 'measurement', date: m.measuredAt, data: m });
  });

  // Add ABCDE scores
  history.abcdeScores.forEach(s => {
    events.push({ type: 'abcde', date: s.assessedAt, data: s });
  });

  // Add outcomes
  history.outcomes.forEach(o => {
    events.push({ type: 'outcome', date: o.outcomeDate, data: o });
  });

  // Add alerts
  history.alerts.forEach(a => {
    events.push({ type: 'alert', date: a.createdAt, data: a });
  });

  // Sort by date descending
  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const getTimelineIcon = (type: string) => {
    switch (type) {
      case 'image': return <CameraIcon />;
      case 'measurement': return <MeasureIcon />;
      case 'abcde': return <ABCDEIcon />;
      case 'outcome': return <OutcomeIcon />;
      case 'alert': return <AlertIcon />;
      case 'created': return <AddIcon />;
      default: return null;
    }
  };

  const getTimelineColor = (type: string): 'primary' | 'secondary' | 'warning' | 'error' | 'success' | 'info' => {
    switch (type) {
      case 'image': return 'primary';
      case 'measurement': return 'info';
      case 'abcde': return 'secondary';
      case 'outcome': return 'success';
      case 'alert': return 'warning';
      case 'created': return 'info';
      default: return 'primary';
    }
  };

  const renderEventContent = (event: TimelineEvent) => {
    switch (event.type) {
      case 'image': {
        const img = event.data as LesionImage;
        return (
          <Card variant="outlined" sx={{ maxWidth: 300 }}>
            <CardMedia
              component="img"
              height="150"
              image={img.thumbnailUrl || img.imageUrl}
              alt="Lesion image"
              sx={{ objectFit: 'cover' }}
            />
            <CardContent sx={{ py: 1 }}>
              <Typography variant="body2">
                {img.dermoscopy ? 'Dermoscopy Image' : 'Clinical Photo'}
              </Typography>
            </CardContent>
          </Card>
        );
      }

      case 'measurement': {
        const m = event.data as LesionMeasurement;
        return (
          <Box>
            <Typography variant="subtitle2">Measurement Recorded</Typography>
            <Typography variant="body2" color="text.secondary">
              Size: {m.lengthMm || '-'} x {m.widthMm || '-'} mm
            </Typography>
            {m.color && (
              <Typography variant="body2" color="text.secondary">
                Color: {m.color}
              </Typography>
            )}
            {m.border && (
              <Typography variant="body2" color="text.secondary">
                Border: {m.border}
              </Typography>
            )}
          </Box>
        );
      }

      case 'abcde': {
        const s = event.data as ABCDEScore;
        return (
          <Box>
            <Typography variant="subtitle2">ABCDE Score: {s.totalScore}/10</Typography>
            <Box display="flex" gap={0.5} flexWrap="wrap" mt={0.5}>
              <Chip label={`A: ${s.asymmetry}`} size="small" />
              <Chip label={`B: ${s.border}`} size="small" />
              <Chip label={`C: ${s.color}`} size="small" />
              <Chip label={`D: ${s.diameter}`} size="small" />
              <Chip label={`E: ${s.evolution}`} size="small" />
            </Box>
          </Box>
        );
      }

      case 'outcome': {
        const o = event.data as LesionOutcome;
        return (
          <Box>
            <Typography variant="subtitle2">
              Outcome: {o.outcomeType.charAt(0).toUpperCase() + o.outcomeType.slice(1)}
            </Typography>
            {o.pathologyResult && (
              <Typography variant="body2" color="text.secondary">
                Pathology: {o.pathologyResult}
              </Typography>
            )}
            {o.diagnosisCode && (
              <Typography variant="body2" color="text.secondary">
                Diagnosis: {o.diagnosisCode}
              </Typography>
            )}
          </Box>
        );
      }

      case 'alert': {
        const a = event.data as LesionAlert;
        return (
          <Alert severity={a.severity === 'critical' ? 'error' : 'warning'} sx={{ py: 0 }}>
            <Typography variant="body2">{a.message}</Typography>
          </Alert>
        );
      }

      case 'created': {
        const l = event.data as TrackedLesion;
        return (
          <Box>
            <Typography variant="subtitle2">Lesion Tracking Started</Typography>
            <Typography variant="body2" color="text.secondary">
              Location: {l.bodyLocationDescription}
            </Typography>
            {l.clinicalDescription && (
              <Typography variant="body2" color="text.secondary">
                {l.clinicalDescription}
              </Typography>
            )}
          </Box>
        );
      }

      default:
        return null;
    }
  };

  return (
    <Box>
      {/* Summary */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2}>
          <Grid item xs={3}>
            <Typography variant="caption" color="text.secondary">Images</Typography>
            <Typography variant="h6">{history.images.length}</Typography>
          </Grid>
          <Grid item xs={3}>
            <Typography variant="caption" color="text.secondary">Measurements</Typography>
            <Typography variant="h6">{history.measurements.length}</Typography>
          </Grid>
          <Grid item xs={3}>
            <Typography variant="caption" color="text.secondary">ABCDE Scores</Typography>
            <Typography variant="h6">{history.abcdeScores.length}</Typography>
          </Grid>
          <Grid item xs={3}>
            <Typography variant="caption" color="text.secondary">Latest Score</Typography>
            <Typography variant="h6">
              {history.abcdeScores.length > 0 ? history.abcdeScores[0]?.totalScore : '-'}/10
            </Typography>
          </Grid>
        </Grid>
      </Paper>

      {/* Timeline */}
      <Timeline position="alternate">
        {events.map((event, index) => (
          <TimelineItem key={`${event.type}-${index}`}>
            <TimelineOppositeContent color="text.secondary" sx={{ flex: 0.3 }}>
              <Typography variant="caption">
                {format(new Date(event.date), 'MMM d, yyyy')}
              </Typography>
              <br />
              <Typography variant="caption">
                {format(new Date(event.date), 'h:mm a')}
              </Typography>
            </TimelineOppositeContent>
            <TimelineSeparator>
              <TimelineDot color={getTimelineColor(event.type)}>
                {getTimelineIcon(event.type)}
              </TimelineDot>
              {index < events.length - 1 && <TimelineConnector />}
            </TimelineSeparator>
            <TimelineContent>
              {renderEventContent(event)}
            </TimelineContent>
          </TimelineItem>
        ))}
      </Timeline>
    </Box>
  );
};

export default LesionTimeline;
