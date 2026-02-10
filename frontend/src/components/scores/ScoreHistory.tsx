/**
 * Score History Component
 * Displays severity score trends over time with charts
 */

import React, { useState, useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Chip,
  Alert,
  CircularProgress,
  Tooltip as MuiTooltip
} from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import { format, parseISO } from 'date-fns';

export type AssessmentType = 'IGA' | 'PASI' | 'BSA' | 'DLQI';

export interface ScoreHistoryEntry {
  date: string;
  score: number;
  interpretation: string;
  assessment_id: string;
}

export interface AssessmentHistory {
  patient_id: string;
  assessment_type: AssessmentType;
  total_assessments: number;
  baseline_score: number | null;
  baseline_date: string | null;
  latest_score: number | null;
  latest_date: string | null;
  best_score: number | null;
  worst_score: number | null;
  average_score: number | null;
  trend: string | null;
  scores_over_time: ScoreHistoryEntry[];
}

interface ScoreHistoryProps {
  history: AssessmentHistory[];
  loading?: boolean;
  selectedType?: AssessmentType;
  onTypeChange?: (type: AssessmentType) => void;
  onViewAssessment?: (assessmentId: string) => void;
}

const TYPE_CONFIG: Record<AssessmentType, { label: string; maxScore: number; color: string }> = {
  IGA: { label: 'IGA', maxScore: 4, color: '#2196f3' },
  PASI: { label: 'PASI', maxScore: 72, color: '#9c27b0' },
  BSA: { label: 'BSA', maxScore: 100, color: '#4caf50' },
  DLQI: { label: 'DLQI', maxScore: 30, color: '#ff9800' }
};

const getSeverityColor = (type: AssessmentType, score: number): string => {
  const config = TYPE_CONFIG[type];
  const percent = (score / config.maxScore) * 100;

  if (type === 'IGA') {
    if (score === 0) return '#4caf50';
    if (score === 1) return '#8bc34a';
    if (score === 2) return '#ffeb3b';
    if (score === 3) return '#ff9800';
    return '#f44336';
  }

  if (percent === 0) return '#4caf50';
  if (percent < 15) return '#8bc34a';
  if (percent < 30) return '#ffeb3b';
  if (percent < 50) return '#ff9800';
  return '#f44336';
};

const getTrendIcon = (trend: string | null): React.ReactNode => {
  if (trend === 'improving') return <TrendingDownIcon color="success" />;
  if (trend === 'worsening') return <TrendingUpIcon color="error" />;
  return <TrendingFlatIcon color="disabled" />;
};

const getTrendLabel = (trend: string | null): string => {
  if (trend === 'improving') return 'Improving';
  if (trend === 'worsening') return 'Worsening';
  if (trend === 'stable') return 'Stable';
  return 'Fluctuating';
};

export const ScoreHistory: React.FC<ScoreHistoryProps> = ({
  history,
  loading = false,
  selectedType = 'PASI',
  onTypeChange,
  onViewAssessment
}) => {
  const [displayType, setDisplayType] = useState<AssessmentType>(selectedType);

  const selectedHistory = useMemo(() => {
    return history.find(h => h.assessment_type === displayType);
  }, [history, displayType]);

  const handleTypeChange = (_: React.MouseEvent<HTMLElement>, newType: AssessmentType | null): void => {
    if (newType !== null) {
      setDisplayType(newType);
      onTypeChange?.(newType);
    }
  };

  const renderSparkline = (entries: ScoreHistoryEntry[], type: AssessmentType): React.ReactNode => {
    if (entries.length < 2) return null;

    const config = TYPE_CONFIG[type];
    const width = 200;
    const height = 50;
    const padding = 5;

    const maxScore = config.maxScore;
    const minScore = 0;

    const points = entries.map((entry, index) => {
      const x = padding + (index / (entries.length - 1)) * (width - 2 * padding);
      const y = height - padding - ((entry.score - minScore) / (maxScore - minScore)) * (height - 2 * padding);
      return `${x},${y}`;
    }).join(' ');

    return (
      <svg width={width} height={height} style={{ overflow: 'visible' }}>
        <polyline
          points={points}
          fill="none"
          stroke={config.color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {entries.map((entry, index) => {
          const x = padding + (index / (entries.length - 1)) * (width - 2 * padding);
          const y = height - padding - ((entry.score - minScore) / (maxScore - minScore)) * (height - 2 * padding);
          return (
            <circle
              key={index}
              cx={x}
              cy={y}
              r="3"
              fill={getSeverityColor(type, entry.score)}
              stroke="white"
              strokeWidth="1"
            />
          );
        })}
      </svg>
    );
  };

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

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Score History
        </Typography>

        <ToggleButtonGroup
          value={displayType}
          exclusive
          onChange={handleTypeChange}
          sx={{ mb: 3 }}
        >
          {(['IGA', 'PASI', 'BSA', 'DLQI'] as AssessmentType[]).map(type => {
            const typeHistory = history.find(h => h.assessment_type === type);
            return (
              <ToggleButton key={type} value={type}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {type}
                  {typeHistory && typeHistory.total_assessments > 0 && (
                    <Chip
                      size="small"
                      label={typeHistory.total_assessments}
                      sx={{ height: 18, fontSize: '0.7rem' }}
                    />
                  )}
                </Box>
              </ToggleButton>
            );
          })}
        </ToggleButtonGroup>

        {!selectedHistory || selectedHistory.total_assessments === 0 ? (
          <Alert severity="info">
            No {displayType} assessments recorded for this patient yet.
          </Alert>
        ) : (
          <>
            {/* Summary Statistics */}
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', mb: 3 }}>
              <Box>
                <Typography variant="caption" color="text.secondary">Latest Score</Typography>
                <Typography variant="h4" sx={{ color: getSeverityColor(displayType, selectedHistory.latest_score ?? 0) }}>
                  {selectedHistory.latest_score?.toFixed(1) ?? '-'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {selectedHistory.latest_date ? format(parseISO(selectedHistory.latest_date), 'MMM d, yyyy') : '-'}
                </Typography>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">Baseline Score</Typography>
                <Typography variant="h4">
                  {selectedHistory.baseline_score?.toFixed(1) ?? '-'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {selectedHistory.baseline_date ? format(parseISO(selectedHistory.baseline_date), 'MMM d, yyyy') : '-'}
                </Typography>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">Change from Baseline</Typography>
                <Typography variant="h4" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {selectedHistory.baseline_score !== null && selectedHistory.latest_score !== null ? (
                    <>
                      {(selectedHistory.latest_score - selectedHistory.baseline_score).toFixed(1)}
                      {getTrendIcon(selectedHistory.trend)}
                    </>
                  ) : '-'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {getTrendLabel(selectedHistory.trend)}
                </Typography>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">Average</Typography>
                <Typography variant="h4">
                  {selectedHistory.average_score?.toFixed(1) ?? '-'}
                </Typography>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">Best / Worst</Typography>
                <Typography variant="h4">
                  {selectedHistory.best_score?.toFixed(1) ?? '-'} / {selectedHistory.worst_score?.toFixed(1) ?? '-'}
                </Typography>
              </Box>
            </Box>

            {/* Trend Chart */}
            {selectedHistory.scores_over_time.length > 1 && (
              <Box sx={{ mb: 3, p: 2, backgroundColor: 'grey.50', borderRadius: 1 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Score Trend
                </Typography>
                {renderSparkline(selectedHistory.scores_over_time, displayType)}
              </Box>
            )}

            {/* History Table */}
            <Typography variant="subtitle2" gutterBottom>
              Assessment History ({selectedHistory.total_assessments} records)
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell align="center">Score</TableCell>
                  <TableCell>Interpretation</TableCell>
                  <TableCell align="center">Change</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {selectedHistory.scores_over_time.slice().reverse().map((entry, index, arr) => {
                  const prevEntry = arr[index + 1];
                  const change = prevEntry ? entry.score - prevEntry.score : null;

                  return (
                    <TableRow
                      key={entry.assessment_id}
                      hover
                      onClick={() => onViewAssessment?.(entry.assessment_id)}
                      sx={{ cursor: onViewAssessment ? 'pointer' : 'default' }}
                    >
                      <TableCell>
                        {format(parseISO(entry.date), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          size="small"
                          label={entry.score.toFixed(1)}
                          sx={{
                            backgroundColor: getSeverityColor(displayType, entry.score),
                            color: entry.score < TYPE_CONFIG[displayType].maxScore * 0.3 ? 'text.primary' : 'white'
                          }}
                        />
                      </TableCell>
                      <TableCell>{entry.interpretation}</TableCell>
                      <TableCell align="center">
                        {change !== null ? (
                          <MuiTooltip title={`Change from previous: ${change > 0 ? '+' : ''}${change.toFixed(1)}`}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {change < 0 ? (
                                <TrendingDownIcon color="success" fontSize="small" />
                              ) : change > 0 ? (
                                <TrendingUpIcon color="error" fontSize="small" />
                              ) : (
                                <TrendingFlatIcon color="disabled" fontSize="small" />
                              )}
                              <Typography variant="caption" sx={{ ml: 0.5 }}>
                                {change > 0 ? '+' : ''}{change.toFixed(1)}
                              </Typography>
                            </Box>
                          </MuiTooltip>
                        ) : (
                          <Typography variant="caption" color="text.secondary">Baseline</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        {index === 0 && (
                          <Chip size="small" label="Latest" variant="outlined" />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default ScoreHistory;
