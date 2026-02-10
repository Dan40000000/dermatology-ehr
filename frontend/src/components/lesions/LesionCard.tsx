import React from 'react';
import {
  Card,
  CardContent,
  CardActions,
  Typography,
  Box,
  Chip,
  IconButton,
  Tooltip,
  Divider
} from '@mui/material';
import {
  Timeline as TimelineIcon,
  CompareArrows as CompareIcon,
  Assessment as AssessmentIcon,
  Straighten as MeasureIcon,
  Warning as WarningIcon,
  LocationOn as LocationIcon
} from '@mui/icons-material';
import { format } from 'date-fns';

interface TrackedLesion {
  id: string;
  patientId: string;
  bodyLocationCode: string;
  bodyLocationDescription: string;
  firstDocumented: string;
  status: 'active' | 'resolved' | 'excised';
  clinicalDescription: string | null;
  suspicionLevel: number;
}

interface LesionCardProps {
  lesion: TrackedLesion;
  alertCount: number;
  onViewTimeline: () => void;
  onCompare: () => void;
  onRecordABCDE: () => void;
  onRecordMeasurement: () => void;
}

const LesionCard: React.FC<LesionCardProps> = ({
  lesion,
  alertCount,
  onViewTimeline,
  onCompare,
  onRecordABCDE,
  onRecordMeasurement
}) => {
  const getSuspicionColor = (level: number): 'default' | 'success' | 'warning' | 'error' => {
    if (level >= 4) return 'error';
    if (level >= 3) return 'warning';
    if (level >= 2) return 'default';
    return 'success';
  };

  const getSuspicionLabel = (level: number): string => {
    switch (level) {
      case 5: return 'Highly Suspicious';
      case 4: return 'Suspicious';
      case 3: return 'Moderate';
      case 2: return 'Low';
      default: return 'Benign Appearing';
    }
  };

  const getStatusColor = (status: string): 'default' | 'success' | 'info' => {
    switch (status) {
      case 'active': return 'info';
      case 'resolved': return 'success';
      case 'excised': return 'default';
      default: return 'default';
    }
  };

  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderLeft: lesion.suspicionLevel >= 4 ? 4 : 0,
        borderColor: lesion.suspicionLevel >= 4 ? 'error.main' : 'transparent'
      }}
    >
      <CardContent sx={{ flexGrow: 1 }}>
        {/* Header with alerts */}
        <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
          <Box display="flex" alignItems="center" gap={1}>
            <LocationIcon color="action" fontSize="small" />
            <Typography variant="subtitle1" fontWeight="bold">
              {lesion.bodyLocationDescription}
            </Typography>
          </Box>
          {alertCount > 0 && (
            <Tooltip title={`${alertCount} active alert${alertCount > 1 ? 's' : ''}`}>
              <Chip
                icon={<WarningIcon />}
                label={alertCount}
                size="small"
                color="warning"
              />
            </Tooltip>
          )}
        </Box>

        {/* Location code */}
        <Typography variant="caption" color="text.secondary" gutterBottom>
          Code: {lesion.bodyLocationCode}
        </Typography>

        {/* Status and Suspicion chips */}
        <Box display="flex" gap={1} my={1.5} flexWrap="wrap">
          <Chip
            label={lesion.status.charAt(0).toUpperCase() + lesion.status.slice(1)}
            size="small"
            color={getStatusColor(lesion.status)}
            variant="outlined"
          />
          <Chip
            label={`Level ${lesion.suspicionLevel}: ${getSuspicionLabel(lesion.suspicionLevel)}`}
            size="small"
            color={getSuspicionColor(lesion.suspicionLevel)}
          />
        </Box>

        {/* Clinical description */}
        {lesion.clinicalDescription && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              mb: 1
            }}
          >
            {lesion.clinicalDescription}
          </Typography>
        )}

        <Divider sx={{ my: 1 }} />

        {/* First documented date */}
        <Typography variant="caption" color="text.secondary">
          First documented: {format(new Date(lesion.firstDocumented), 'MMM d, yyyy')}
        </Typography>
      </CardContent>

      <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
        <Box>
          <Tooltip title="View Timeline">
            <IconButton size="small" onClick={onViewTimeline} color="primary">
              <TimelineIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Compare Images">
            <IconButton size="small" onClick={onCompare} color="primary">
              <CompareIcon />
            </IconButton>
          </Tooltip>
        </Box>
        <Box>
          <Tooltip title="Record ABCDE Score">
            <IconButton size="small" onClick={onRecordABCDE} color="secondary">
              <AssessmentIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Record Measurements">
            <IconButton size="small" onClick={onRecordMeasurement} color="secondary">
              <MeasureIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </CardActions>
    </Card>
  );
};

export default LesionCard;
