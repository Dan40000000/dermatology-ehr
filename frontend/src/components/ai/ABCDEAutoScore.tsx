import React from 'react';
import {
  Box,
  Typography,
  Grid,
  Paper,
  LinearProgress,
  Tooltip,
  Chip,
} from '@mui/material';
import {
  Symmetric,
  CropFree as BorderIcon,
  Palette as ColorIcon,
  Straighten as DiameterIcon,
  TrendingUp as EvolutionIcon,
} from '@mui/icons-material';
import type { ABCDEScores, ABCDEFeatureScore } from './AIAnalysisButton';

interface ABCDEAutoScoreProps {
  scores: ABCDEScores;
  showDescriptions?: boolean;
}

interface FeatureConfig {
  key: keyof Omit<ABCDEScores, 'total_score'>;
  label: string;
  fullName: string;
  icon: React.ReactNode;
  maxScore: number;
  descriptions: Record<number, string>;
}

const featureConfigs: FeatureConfig[] = [
  {
    key: 'asymmetry',
    label: 'A',
    fullName: 'Asymmetry',
    icon: <BorderIcon />,
    maxScore: 3,
    descriptions: {
      0: 'Symmetric in both axes',
      1: 'Asymmetric in one axis',
      2: 'Asymmetric in both axes',
      3: 'Highly asymmetric with irregular shape',
    },
  },
  {
    key: 'border',
    label: 'B',
    fullName: 'Border',
    icon: <BorderIcon />,
    maxScore: 3,
    descriptions: {
      0: 'Regular, well-defined borders',
      1: 'Slightly irregular borders',
      2: 'Noticeably irregular borders',
      3: 'Highly irregular, blurred or notched borders',
    },
  },
  {
    key: 'color',
    label: 'C',
    fullName: 'Color',
    icon: <ColorIcon />,
    maxScore: 3,
    descriptions: {
      0: 'Uniform single color',
      1: '2 colors present',
      2: '3-4 colors present',
      3: '5+ colors or concerning colors (blue, white, red)',
    },
  },
  {
    key: 'diameter',
    label: 'D',
    fullName: 'Diameter',
    icon: <DiameterIcon />,
    maxScore: 3,
    descriptions: {
      0: 'Less than 5mm',
      1: '5-6mm',
      2: '6-7mm',
      3: 'Greater than 7mm',
    },
  },
  {
    key: 'evolution',
    label: 'E',
    fullName: 'Evolution',
    icon: <EvolutionIcon />,
    maxScore: 3,
    descriptions: {
      0: 'No change / stable',
      1: 'Minor changes noted',
      2: 'Moderate changes',
      3: 'Significant/rapid evolution',
    },
  },
];

const ABCDEAutoScore: React.FC<ABCDEAutoScoreProps> = ({
  scores,
  showDescriptions = true,
}) => {
  const getScoreColor = (score: number, maxScore: number): 'success' | 'warning' | 'error' => {
    const percentage = score / maxScore;
    if (percentage >= 0.67) return 'error';
    if (percentage >= 0.34) return 'warning';
    return 'success';
  };

  const getConfidenceLabel = (confidence: number): string => {
    if (confidence >= 0.8) return 'High';
    if (confidence >= 0.6) return 'Medium';
    return 'Low';
  };

  const getTotalScoreColor = (): 'success' | 'warning' | 'error' => {
    if (scores.total_score >= 10) return 'error';
    if (scores.total_score >= 5) return 'warning';
    return 'success';
  };

  const getTotalScoreInterpretation = (): string => {
    if (scores.total_score >= 10) {
      return 'High ABCDE score suggests significant concern. Biopsy strongly recommended.';
    }
    if (scores.total_score >= 5) {
      return 'Moderate ABCDE score. Close monitoring or biopsy may be indicated.';
    }
    return 'Low ABCDE score suggests likely benign lesion. Routine monitoring.';
  };

  return (
    <Box>
      {/* Total Score Summary */}
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          mb: 2,
          bgcolor: `${getTotalScoreColor()}.lighter`,
          borderColor: `${getTotalScoreColor()}.main`,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="h6" color={`${getTotalScoreColor()}.main`}>
              Total ABCDE Score: {scores.total_score} / 15
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {getTotalScoreInterpretation()}
            </Typography>
          </Box>
          <Chip
            label={scores.total_score >= 10 ? 'HIGH' : scores.total_score >= 5 ? 'MODERATE' : 'LOW'}
            color={getTotalScoreColor()}
            size="medium"
          />
        </Box>
      </Paper>

      {/* Individual Feature Scores */}
      <Grid container spacing={2}>
        {featureConfigs.map((config) => {
          const featureScore = scores[config.key] as ABCDEFeatureScore;
          const scoreColor = getScoreColor(featureScore.score, config.maxScore);

          return (
            <Grid item xs={12} sm={6} md={4} key={config.key}>
              <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Box
                    sx={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      bgcolor: `${scoreColor}.main`,
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold',
                    }}
                  >
                    {config.label}
                  </Box>
                  <Box>
                    <Typography variant="subtitle2" fontWeight="bold">
                      {config.fullName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Confidence: {getConfidenceLabel(featureScore.confidence)} (
                      {(featureScore.confidence * 100).toFixed(0)}%)
                    </Typography>
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Typography variant="h5" color={`${scoreColor}.main`} fontWeight="bold">
                    {featureScore.score}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    / {config.maxScore}
                  </Typography>
                </Box>

                <LinearProgress
                  variant="determinate"
                  value={(featureScore.score / config.maxScore) * 100}
                  color={scoreColor}
                  sx={{ height: 8, borderRadius: 4, mb: 1 }}
                />

                {showDescriptions && (
                  <Tooltip title={config.descriptions[featureScore.score] || ''}>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {featureScore.description || config.descriptions[featureScore.score]}
                    </Typography>
                  </Tooltip>
                )}
              </Paper>
            </Grid>
          );
        })}
      </Grid>

      {/* Legend */}
      <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <Typography variant="caption" color="text.secondary">
          ABCDE Scoring: Each feature scored 0-3 (0=none/normal, 3=severe/abnormal). Higher total
          scores indicate increased concern. Score interpretation: 0-4 Low, 5-9 Moderate, 10-15
          High.
        </Typography>
      </Box>
    </Box>
  );
};

export default ABCDEAutoScore;
