/**
 * MohsTimeline Component
 * Visual timeline of Mohs surgery stages
 */

import React from 'react';
import {
  Box,
  Paper,
  Typography,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Chip,
  Stack
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  RadioButtonUnchecked as PendingIcon,
  Schedule as ScheduleIcon,
  LocalHospital as SurgeryIcon,
  Visibility as ReadingIcon,
  Healing as ClosureIcon,
  Done as DoneIcon
} from '@mui/icons-material';
import { format, formatDistanceToNow } from 'date-fns';

interface TimelineStage {
  id: string;
  stage_number: number;
  excision_time?: string;
  frozen_section_time?: string;
  reading_time?: string;
  margin_status?: 'positive' | 'negative' | 'partial' | 'pending';
  block_count: number;
}

interface MohsTimelineProps {
  caseStatus: string;
  stages: TimelineStage[];
  startTime?: string;
  endTime?: string;
  closureType?: string;
  totalStages: number;
}

const getStatusIcon = (status?: string) => {
  switch (status) {
    case 'negative':
      return <CheckCircleIcon color="success" />;
    case 'positive':
      return <WarningIcon color="error" />;
    case 'partial':
      return <WarningIcon color="warning" />;
    default:
      return <PendingIcon color="disabled" />;
  }
};

const formatTime = (timeStr?: string) => {
  if (!timeStr) return null;
  try {
    return format(new Date(timeStr), 'h:mm a');
  } catch {
    return null;
  }
};

const getElapsedTime = (start?: string, end?: string) => {
  if (!start) return null;
  try {
    const startDate = new Date(start);
    const endDate = end ? new Date(end) : new Date();
    const diffMs = endDate.getTime() - startDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  } catch {
    return null;
  }
};

const MohsTimeline: React.FC<MohsTimelineProps> = ({
  caseStatus,
  stages,
  startTime,
  endTime,
  closureType,
  totalStages
}) => {
  const getActiveStep = () => {
    switch (caseStatus) {
      case 'scheduled':
        return 0;
      case 'pre_op':
        return 1;
      case 'in_progress':
      case 'reading':
        return 2 + stages.length - 1;
      case 'closure':
        return 2 + stages.length;
      case 'post_op':
      case 'completed':
        return 3 + stages.length;
      default:
        return 0;
    }
  };

  const allStagesClear = stages.length > 0 &&
    stages.every((s) => s.margin_status === 'negative');

  const lastStage = stages[stages.length - 1];

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Procedure Timeline
      </Typography>

      {startTime && (
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Started: {formatTime(startTime)}
          {endTime && ` - Completed: ${formatTime(endTime)}`}
          {startTime && (
            <Chip
              size="small"
              label={`Duration: ${getElapsedTime(startTime, endTime) || 'In progress'}`}
              sx={{ ml: 1 }}
            />
          )}
        </Typography>
      )}

      <Stepper activeStep={getActiveStep()} orientation="vertical" sx={{ mt: 2 }}>
        {/* Pre-op Step */}
        <Step completed={caseStatus !== 'scheduled'}>
          <StepLabel
            StepIconComponent={() => (
              <ScheduleIcon color={caseStatus === 'scheduled' ? 'primary' : 'success'} />
            )}
          >
            <Typography variant="subtitle2">Pre-operative</Typography>
          </StepLabel>
          <StepContent>
            <Typography variant="body2" color="text.secondary">
              Mark tumor, consent, anesthesia
            </Typography>
          </StepContent>
        </Step>

        {/* Stage Steps */}
        {stages.map((stage, index) => (
          <Step key={stage.id} completed={!!stage.margin_status && stage.margin_status !== 'pending'}>
            <StepLabel
              StepIconComponent={() => getStatusIcon(stage.margin_status)}
              optional={
                <Stack direction="row" spacing={1} alignItems="center">
                  {stage.excision_time && (
                    <Typography variant="caption" color="text.secondary">
                      {formatTime(stage.excision_time)}
                    </Typography>
                  )}
                  <Chip
                    size="small"
                    label={stage.margin_status?.toUpperCase() || 'PENDING'}
                    color={
                      stage.margin_status === 'negative' ? 'success' :
                      stage.margin_status === 'positive' ? 'error' :
                      stage.margin_status === 'partial' ? 'warning' : 'default'
                    }
                  />
                </Stack>
              }
            >
              <Typography variant="subtitle2">Stage {stage.stage_number}</Typography>
            </StepLabel>
            <StepContent>
              <Box>
                <Typography variant="body2" color="text.secondary">
                  {stage.block_count} tissue block{stage.block_count !== 1 ? 's' : ''} processed
                </Typography>
                {stage.frozen_section_time && (
                  <Typography variant="caption" color="text.secondary" display="block">
                    Frozen section: {formatTime(stage.frozen_section_time)}
                  </Typography>
                )}
                {stage.reading_time && (
                  <Typography variant="caption" color="text.secondary" display="block">
                    Reading completed: {formatTime(stage.reading_time)}
                  </Typography>
                )}
              </Box>
            </StepContent>
          </Step>
        ))}

        {/* Show pending stage if in progress */}
        {(caseStatus === 'in_progress' || caseStatus === 'reading') &&
         lastStage?.margin_status === 'positive' && (
          <Step>
            <StepLabel
              StepIconComponent={() => <SurgeryIcon color="primary" />}
            >
              <Typography variant="subtitle2">Stage {totalStages + 1}</Typography>
            </StepLabel>
            <StepContent>
              <Typography variant="body2" color="text.secondary">
                Re-excision needed for positive margins
              </Typography>
            </StepContent>
          </Step>
        )}

        {/* Closure Step */}
        <Step completed={caseStatus === 'post_op' || caseStatus === 'completed'}>
          <StepLabel
            StepIconComponent={() => (
              <ClosureIcon color={
                caseStatus === 'post_op' || caseStatus === 'completed' ? 'success' :
                caseStatus === 'closure' ? 'primary' : 'disabled'
              } />
            )}
            optional={closureType && (
              <Chip size="small" label={closureType.replace(/_/g, ' ')} variant="outlined" />
            )}
          >
            <Typography variant="subtitle2">Closure</Typography>
          </StepLabel>
          <StepContent>
            <Typography variant="body2" color="text.secondary">
              {allStagesClear
                ? 'All margins clear - ready for closure'
                : 'Complete all stages before closure'}
            </Typography>
          </StepContent>
        </Step>

        {/* Post-op Step */}
        <Step completed={caseStatus === 'completed'}>
          <StepLabel
            StepIconComponent={() => (
              <DoneIcon color={caseStatus === 'completed' ? 'success' : 'disabled'} />
            )}
          >
            <Typography variant="subtitle2">Post-operative</Typography>
          </StepLabel>
          <StepContent>
            <Typography variant="body2" color="text.secondary">
              Instructions, dressing, follow-up scheduling
            </Typography>
          </StepContent>
        </Step>
      </Stepper>

      {/* Summary */}
      <Box mt={3} p={2} sx={{ backgroundColor: '#f5f5f5', borderRadius: 1 }}>
        <Typography variant="subtitle2" gutterBottom>
          Summary
        </Typography>
        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
          <Chip
            label={`${totalStages} Stage${totalStages !== 1 ? 's' : ''}`}
            size="small"
            icon={<SurgeryIcon />}
          />
          {allStagesClear && (
            <Chip
              label="Clear Margins"
              size="small"
              color="success"
              icon={<CheckCircleIcon />}
            />
          )}
          {startTime && !endTime && (
            <Chip
              label={`In Progress - ${getElapsedTime(startTime)}`}
              size="small"
              color="primary"
            />
          )}
          {endTime && (
            <Chip
              label={`Completed - ${getElapsedTime(startTime, endTime)}`}
              size="small"
              color="success"
            />
          )}
        </Stack>
      </Box>
    </Paper>
  );
};

export default MohsTimeline;
