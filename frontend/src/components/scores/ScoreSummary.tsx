/**
 * Score Summary Component
 * Displays a summary of the patient's current severity scores
 */

import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  Button,
  Divider,
  CircularProgress,
  Tooltip
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import HistoryIcon from '@mui/icons-material/History';
import { format, parseISO, formatDistanceToNow } from 'date-fns';

export type AssessmentType = 'IGA' | 'PASI' | 'BSA' | 'DLQI';

export interface AssessmentRecord {
  id: string;
  patient_id: string;
  encounter_id: string | null;
  assessment_type: AssessmentType;
  score_value: number;
  score_interpretation: string;
  severity_level: string;
  component_scores: Record<string, unknown>;
  assessed_by: string;
  assessed_at: string;
  clinical_notes: string | null;
  is_baseline: boolean;
  change_from_baseline: number | null;
  percent_change: number | null;
}

interface ScoreSummaryProps {
  scores: Record<AssessmentType, AssessmentRecord | null>;
  loading?: boolean;
  onAddAssessment?: (type: AssessmentType) => void;
  onViewHistory?: (type: AssessmentType) => void;
  onViewAssessment?: (assessmentId: string, type: AssessmentType) => void;
}

interface ScoreCardConfig {
  type: AssessmentType;
  label: string;
  fullName: string;
  maxScore: number;
  unit: string;
  description: string;
}

const SCORE_CONFIGS: ScoreCardConfig[] = [
  {
    type: 'IGA',
    label: 'IGA',
    fullName: 'Investigator Global Assessment',
    maxScore: 4,
    unit: '',
    description: 'Global disease severity'
  },
  {
    type: 'PASI',
    label: 'PASI',
    fullName: 'Psoriasis Area Severity Index',
    maxScore: 72,
    unit: '',
    description: 'Psoriasis severity'
  },
  {
    type: 'BSA',
    label: 'BSA',
    fullName: 'Body Surface Area',
    maxScore: 100,
    unit: '%',
    description: 'Affected body surface'
  },
  {
    type: 'DLQI',
    label: 'DLQI',
    fullName: 'Dermatology Life Quality Index',
    maxScore: 30,
    unit: '/30',
    description: 'Quality of life impact'
  }
];

const getSeverityColor = (type: AssessmentType, score: number): string => {
  if (type === 'IGA') {
    if (score === 0) return '#4caf50';
    if (score === 1) return '#8bc34a';
    if (score === 2) return '#ffeb3b';
    if (score === 3) return '#ff9800';
    return '#f44336';
  }

  const config = SCORE_CONFIGS.find(c => c.type === type);
  if (!config) return '#9e9e9e';

  const percent = (score / config.maxScore) * 100;
  if (percent === 0) return '#4caf50';
  if (percent < 15) return '#8bc34a';
  if (percent < 30) return '#ffeb3b';
  if (percent < 50) return '#ff9800';
  return '#f44336';
};

const getChangeIcon = (change: number | null): React.ReactNode => {
  if (change === null) return null;
  if (change < 0) return <TrendingDownIcon fontSize="small" color="success" />;
  if (change > 0) return <TrendingUpIcon fontSize="small" color="error" />;
  return <TrendingFlatIcon fontSize="small" color="disabled" />;
};

export const ScoreSummary: React.FC<ScoreSummaryProps> = ({
  scores,
  loading = false,
  onAddAssessment,
  onViewHistory,
  onViewAssessment
}) => {
  if (loading) {
    return (
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        </CardContent>
      </Card>
    );
  }

  const renderScoreCard = (config: ScoreCardConfig): React.ReactNode => {
    const assessment = scores[config.type];
    const hasScore = assessment !== null;

    return (
      <Grid item xs={12} sm={6} md={3} key={config.type}>
        <Card
          variant="outlined"
          sx={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            transition: 'box-shadow 0.2s',
            '&:hover': {
              boxShadow: 2
            }
          }}
        >
          <CardContent sx={{ flexGrow: 1, pb: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
              <Tooltip title={config.fullName}>
                <Typography variant="h6" component="span">
                  {config.label}
                </Typography>
              </Tooltip>
              {hasScore && (
                <Tooltip title="View history">
                  <Button
                    size="small"
                    onClick={() => onViewHistory?.(config.type)}
                    sx={{ minWidth: 'auto', p: 0.5 }}
                  >
                    <HistoryIcon fontSize="small" />
                  </Button>
                </Tooltip>
              )}
            </Box>

            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
              {config.description}
            </Typography>

            {hasScore ? (
              <Box
                onClick={() => onViewAssessment?.(assessment.id, config.type)}
                sx={{ cursor: onViewAssessment ? 'pointer' : 'default' }}
              >
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, mb: 1 }}>
                  <Typography
                    variant="h3"
                    component="span"
                    sx={{ color: getSeverityColor(config.type, assessment.score_value) }}
                  >
                    {config.type === 'BSA'
                      ? assessment.score_value.toFixed(1)
                      : config.type === 'PASI'
                        ? assessment.score_value.toFixed(1)
                        : assessment.score_value
                    }
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {config.unit}
                  </Typography>
                </Box>

                <Chip
                  size="small"
                  label={assessment.score_interpretation}
                  sx={{
                    backgroundColor: getSeverityColor(config.type, assessment.score_value),
                    color: assessment.score_value < config.maxScore * 0.3 ? 'text.primary' : 'white',
                    mb: 1
                  }}
                />

                {assessment.change_from_baseline !== null && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
                    {getChangeIcon(assessment.change_from_baseline)}
                    <Typography variant="caption" color="text.secondary">
                      {assessment.change_from_baseline > 0 ? '+' : ''}
                      {assessment.change_from_baseline.toFixed(1)} from baseline
                      {assessment.percent_change !== null && (
                        <span> ({assessment.percent_change > 0 ? '+' : ''}{assessment.percent_change.toFixed(0)}%)</span>
                      )}
                    </Typography>
                  </Box>
                )}

                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                  {formatDistanceToNow(parseISO(assessment.assessed_at), { addSuffix: true })}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                  {format(parseISO(assessment.assessed_at), 'MMM d, yyyy')}
                </Typography>
              </Box>
            ) : (
              <Box sx={{ textAlign: 'center', py: 2 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  No assessment recorded
                </Typography>
              </Box>
            )}
          </CardContent>

          <Divider />

          <Box sx={{ p: 1 }}>
            <Button
              fullWidth
              size="small"
              startIcon={<AddIcon />}
              onClick={() => onAddAssessment?.(config.type)}
            >
              {hasScore ? 'New Assessment' : 'Add Assessment'}
            </Button>
          </Box>
        </Card>
      </Grid>
    );
  };

  // Calculate overall severity summary
  const getOverallStatus = (): { label: string; color: string; description: string } => {
    const activeScores = SCORE_CONFIGS
      .filter(config => scores[config.type] !== null)
      .map(config => {
        const score = scores[config.type];
        if (!score) return 0;
        return (score.score_value / config.maxScore) * 100;
      });

    if (activeScores.length === 0) {
      return { label: 'No Data', color: '#9e9e9e', description: 'No assessments recorded' };
    }

    const avgPercent = activeScores.reduce((a, b) => a + b, 0) / activeScores.length;

    if (avgPercent === 0) return { label: 'Clear', color: '#4caf50', description: 'Disease is well controlled' };
    if (avgPercent < 15) return { label: 'Mild', color: '#8bc34a', description: 'Minor disease activity' };
    if (avgPercent < 30) return { label: 'Moderate', color: '#ffeb3b', description: 'Moderate disease activity' };
    if (avgPercent < 50) return { label: 'Severe', color: '#ff9800', description: 'Significant disease activity' };
    return { label: 'Very Severe', color: '#f44336', description: 'Severe disease activity' };
  };

  const overallStatus = getOverallStatus();
  const assessmentCount = SCORE_CONFIGS.filter(config => scores[config.type] !== null).length;

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box>
            <Typography variant="h6">
              Severity Scores Summary
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {assessmentCount} of {SCORE_CONFIGS.length} assessments recorded
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'right' }}>
            <Chip
              label={overallStatus.label}
              sx={{ backgroundColor: overallStatus.color, color: 'white', fontWeight: 'bold' }}
            />
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
              {overallStatus.description}
            </Typography>
          </Box>
        </Box>

        <Grid container spacing={2}>
          {SCORE_CONFIGS.map(config => renderScoreCard(config))}
        </Grid>
      </CardContent>
    </Card>
  );
};

export default ScoreSummary;
