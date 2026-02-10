import React from 'react';
import {
  Card,
  CardContent,
  CardActions,
  Typography,
  Button,
  Box,
  Chip
} from '@mui/material';
import {
  Warning as WarningIcon,
  Error as ErrorIcon,
  TrendingUp as GrowthIcon,
  Assessment as ABCDEIcon,
  Visibility as ViewIcon,
  CheckCircle as AcknowledgeIcon
} from '@mui/icons-material';
import { format } from 'date-fns';

interface LesionAlert {
  id: string;
  lesionId: string;
  patientId: string;
  alertType: string;
  severity: string;
  message: string;
  status: string;
  createdAt: string;
  bodyLocation?: string;
  patientName?: string;
  previousValue?: Record<string, unknown>;
  currentValue?: Record<string, unknown>;
  changePercentage?: number;
}

interface ChangeAlertProps {
  alert: LesionAlert;
  onAcknowledge: () => void;
  onViewLesion: () => void;
}

const ChangeAlert: React.FC<ChangeAlertProps> = ({
  alert,
  onAcknowledge,
  onViewLesion
}) => {
  const getSeverityColor = (severity: string): 'error' | 'warning' | 'info' => {
    switch (severity) {
      case 'critical': return 'error';
      case 'high': return 'error';
      case 'medium': return 'warning';
      default: return 'info';
    }
  };

  const getAlertIcon = (alertType: string) => {
    switch (alertType) {
      case 'size_increase':
        return <GrowthIcon />;
      case 'abcde_increase':
        return <ABCDEIcon />;
      case 'suspicion_elevated':
        return <ErrorIcon />;
      default:
        return <WarningIcon />;
    }
  };

  const getAlertTypeLabel = (alertType: string): string => {
    switch (alertType) {
      case 'size_increase':
        return 'Size Increase';
      case 'abcde_increase':
        return 'ABCDE Score Increase';
      case 'suspicion_elevated':
        return 'Suspicion Elevated';
      case 'follow_up_due':
        return 'Follow-up Due';
      default:
        return alertType;
    }
  };

  const formatChangeDetails = (): string | null => {
    if (alert.alertType === 'size_increase' && alert.changePercentage) {
      return `+${alert.changePercentage.toFixed(1)}% size increase`;
    }
    if (alert.alertType === 'abcde_increase' && alert.previousValue && alert.currentValue) {
      const prevScore = (alert.previousValue as { total_score?: number }).total_score;
      const currScore = (alert.currentValue as { total_score?: number }).total_score;
      if (prevScore !== undefined && currScore !== undefined) {
        return `Score: ${prevScore} -> ${currScore}`;
      }
    }
    return null;
  };

  const changeDetails = formatChangeDetails();

  return (
    <Card
      sx={{
        borderLeft: 4,
        borderColor: getSeverityColor(alert.severity) + '.main'
      }}
    >
      <CardContent sx={{ pb: 1 }}>
        {/* Header */}
        <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
          <Box display="flex" alignItems="center" gap={1}>
            {getAlertIcon(alert.alertType)}
            <Chip
              label={getAlertTypeLabel(alert.alertType)}
              size="small"
              color={getSeverityColor(alert.severity)}
            />
          </Box>
          <Chip
            label={alert.severity.toUpperCase()}
            size="small"
            variant="outlined"
            color={getSeverityColor(alert.severity)}
          />
        </Box>

        {/* Message */}
        <Typography variant="body2" gutterBottom>
          {alert.message}
        </Typography>

        {/* Change details */}
        {changeDetails && (
          <Typography variant="body2" fontWeight="medium" color={getSeverityColor(alert.severity) + '.main'}>
            {changeDetails}
          </Typography>
        )}

        {/* Location */}
        {alert.bodyLocation && (
          <Typography variant="caption" color="text.secondary" display="block" mt={1}>
            Location: {alert.bodyLocation}
          </Typography>
        )}

        {/* Timestamp */}
        <Typography variant="caption" color="text.secondary" display="block">
          {format(new Date(alert.createdAt), 'MMM d, yyyy h:mm a')}
        </Typography>
      </CardContent>

      <CardActions sx={{ justifyContent: 'flex-end', pt: 0 }}>
        <Button
          size="small"
          startIcon={<ViewIcon />}
          onClick={onViewLesion}
        >
          View
        </Button>
        <Button
          size="small"
          startIcon={<AcknowledgeIcon />}
          onClick={onAcknowledge}
          color="primary"
        >
          Acknowledge
        </Button>
      </CardActions>
    </Card>
  );
};

export default ChangeAlert;
