/**
 * MohsStageCard Component
 * Displays individual stage information in the Mohs workflow
 */

import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  IconButton,
  Collapse,
  Grid,
  Divider,
  Tooltip
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  RadioButtonUnchecked as PendingIcon,
  AccessTime as TimeIcon
} from '@mui/icons-material';
import { format } from 'date-fns';

export interface StageBlock {
  id: string;
  block_label: string;
  position?: string;
  position_degrees?: number;
  margin_status: 'positive' | 'negative' | 'close' | 'indeterminate';
  deep_margin_status?: 'positive' | 'negative' | 'close' | 'indeterminate';
  depth_mm?: number;
  tumor_type_found?: string;
  tumor_percentage?: number;
  notes?: string;
}

export interface MohsStage {
  id: string;
  stage_number: number;
  excision_time?: string;
  frozen_section_time?: string;
  reading_time?: string;
  margin_status?: 'positive' | 'negative' | 'partial' | 'pending';
  margin_status_details?: string;
  block_count: number;
  excision_width_mm?: number;
  excision_length_mm?: number;
  excision_depth_mm?: number;
  map_image_url?: string;
  notes?: string;
  blocks?: StageBlock[];
}

interface MohsStageCardProps {
  stage: MohsStage;
  isActive?: boolean;
  onRecordMargins?: (stageId: string) => void;
  onViewMap?: (stageId: string) => void;
}

const getMarginStatusColor = (status?: string): 'success' | 'error' | 'warning' | 'default' => {
  switch (status) {
    case 'negative':
      return 'success';
    case 'positive':
      return 'error';
    case 'partial':
    case 'close':
      return 'warning';
    default:
      return 'default';
  }
};

const getMarginStatusIcon = (status?: string) => {
  switch (status) {
    case 'negative':
      return <CheckCircleIcon color="success" />;
    case 'positive':
      return <WarningIcon color="error" />;
    case 'partial':
    case 'close':
      return <WarningIcon color="warning" />;
    default:
      return <PendingIcon color="disabled" />;
  }
};

const MohsStageCard: React.FC<MohsStageCardProps> = ({
  stage,
  isActive = false,
  onRecordMargins,
  onViewMap
}) => {
  const [expanded, setExpanded] = React.useState(isActive);

  const formatTime = (timeStr?: string) => {
    if (!timeStr) return '--:--';
    try {
      return format(new Date(timeStr), 'HH:mm');
    } catch {
      return '--:--';
    }
  };

  const getBlockStatusColor = (status: string) => {
    switch (status) {
      case 'negative':
        return '#4caf50';
      case 'positive':
        return '#f44336';
      case 'close':
        return '#ff9800';
      default:
        return '#9e9e9e';
    }
  };

  return (
    <Card
      sx={{
        mb: 2,
        border: isActive ? '2px solid #1976d2' : '1px solid #e0e0e0',
        backgroundColor: isActive ? '#f5f9ff' : 'white'
      }}
    >
      <CardContent sx={{ pb: 1 }}>
        {/* Header */}
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box display="flex" alignItems="center" gap={2}>
            <Typography variant="h6" component="span">
              Stage {stage.stage_number}
            </Typography>
            <Chip
              label={stage.margin_status?.toUpperCase() || 'PENDING'}
              color={getMarginStatusColor(stage.margin_status)}
              size="small"
              icon={getMarginStatusIcon(stage.margin_status)}
            />
            {stage.block_count > 0 && (
              <Chip
                label={`${stage.block_count} blocks`}
                size="small"
                variant="outlined"
              />
            )}
          </Box>
          <IconButton onClick={() => setExpanded(!expanded)} size="small">
            {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </Box>

        {/* Timing summary */}
        <Box display="flex" gap={3} mt={1}>
          <Tooltip title="Excision Time">
            <Box display="flex" alignItems="center" gap={0.5}>
              <TimeIcon fontSize="small" color="action" />
              <Typography variant="body2" color="text.secondary">
                Excision: {formatTime(stage.excision_time)}
              </Typography>
            </Box>
          </Tooltip>
          {stage.frozen_section_time && (
            <Typography variant="body2" color="text.secondary">
              Frozen: {formatTime(stage.frozen_section_time)}
            </Typography>
          )}
          {stage.reading_time && (
            <Typography variant="body2" color="text.secondary">
              Read: {formatTime(stage.reading_time)}
            </Typography>
          )}
        </Box>

        {/* Expanded content */}
        <Collapse in={expanded}>
          <Divider sx={{ my: 2 }} />

          {/* Dimensions */}
          {(stage.excision_width_mm || stage.excision_length_mm) && (
            <Box mb={2}>
              <Typography variant="subtitle2" gutterBottom>
                Excision Dimensions
              </Typography>
              <Typography variant="body2">
                {stage.excision_width_mm && `Width: ${stage.excision_width_mm}mm`}
                {stage.excision_width_mm && stage.excision_length_mm && ' x '}
                {stage.excision_length_mm && `Length: ${stage.excision_length_mm}mm`}
                {stage.excision_depth_mm && ` x Depth: ${stage.excision_depth_mm}mm`}
              </Typography>
            </Box>
          )}

          {/* Blocks */}
          {stage.blocks && stage.blocks.length > 0 && (
            <Box mb={2}>
              <Typography variant="subtitle2" gutterBottom>
                Tissue Blocks
              </Typography>
              <Grid container spacing={1}>
                {stage.blocks.map((block) => (
                  <Grid item key={block.id}>
                    <Tooltip
                      title={
                        <Box>
                          <Typography variant="body2">
                            Position: {block.position || 'N/A'}
                          </Typography>
                          <Typography variant="body2">
                            Margin: {block.margin_status}
                          </Typography>
                          {block.deep_margin_status && (
                            <Typography variant="body2">
                              Deep: {block.deep_margin_status}
                            </Typography>
                          )}
                          {block.depth_mm && (
                            <Typography variant="body2">
                              Depth: {block.depth_mm}mm
                            </Typography>
                          )}
                          {block.notes && (
                            <Typography variant="body2">
                              Note: {block.notes}
                            </Typography>
                          )}
                        </Box>
                      }
                    >
                      <Chip
                        label={block.block_label}
                        size="small"
                        sx={{
                          backgroundColor: getBlockStatusColor(block.margin_status),
                          color: 'white',
                          fontWeight: 'bold'
                        }}
                      />
                    </Tooltip>
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}

          {/* Notes */}
          {stage.notes && (
            <Box mb={2}>
              <Typography variant="subtitle2" gutterBottom>
                Notes
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {stage.notes}
              </Typography>
            </Box>
          )}

          {/* Actions */}
          <Box display="flex" gap={1} mt={2}>
            {onRecordMargins && stage.margin_status === 'pending' && (
              <Chip
                label="Record Margins"
                onClick={() => onRecordMargins(stage.id)}
                color="primary"
                variant="outlined"
                clickable
              />
            )}
            {onViewMap && stage.map_image_url && (
              <Chip
                label="View Map"
                onClick={() => onViewMap(stage.id)}
                variant="outlined"
                clickable
              />
            )}
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  );
};

export default MohsStageCard;
