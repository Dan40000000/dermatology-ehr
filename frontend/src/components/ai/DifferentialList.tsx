import React from 'react';
import {
  Box,
  Typography,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  Chip,
  Tooltip,
  Paper,
} from '@mui/material';
import { Info as InfoIcon } from '@mui/icons-material';
import type { DifferentialDiagnosis } from './AIAnalysisButton';

interface DifferentialListProps {
  diagnoses: DifferentialDiagnosis[];
  maxItems?: number;
  showConfidenceBar?: boolean;
}

const DifferentialList: React.FC<DifferentialListProps> = ({
  diagnoses,
  maxItems = 5,
  showConfidenceBar = true,
}) => {
  // Sort by confidence descending
  const sortedDiagnoses = [...diagnoses]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxItems);

  const getConfidenceColor = (confidence: number): 'error' | 'warning' | 'primary' | 'success' => {
    if (confidence >= 0.7) return 'success';
    if (confidence >= 0.4) return 'primary';
    if (confidence >= 0.2) return 'warning';
    return 'error';
  };

  const getConfidenceLabel = (confidence: number): string => {
    if (confidence >= 0.7) return 'High';
    if (confidence >= 0.4) return 'Moderate';
    if (confidence >= 0.2) return 'Low';
    return 'Very Low';
  };

  if (diagnoses.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No differential diagnoses available.
      </Typography>
    );
  }

  return (
    <List dense disablePadding>
      {sortedDiagnoses.map((diagnosis, index) => (
        <ListItem
          key={index}
          component={Paper}
          variant="outlined"
          sx={{
            mb: 1,
            flexDirection: 'column',
            alignItems: 'flex-start',
            p: 1.5,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              mb: 0.5,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography
                variant="body1"
                fontWeight={index === 0 ? 'bold' : 'medium'}
                color={index === 0 ? 'primary' : 'text.primary'}
              >
                {index + 1}. {diagnosis.diagnosis}
              </Typography>
              {diagnosis.icd10_code && (
                <Chip
                  label={diagnosis.icd10_code}
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: '0.7rem', height: 20 }}
                />
              )}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip
                label={`${(diagnosis.confidence * 100).toFixed(0)}%`}
                size="small"
                color={getConfidenceColor(diagnosis.confidence)}
              />
              <Tooltip title={`${getConfidenceLabel(diagnosis.confidence)} confidence`}>
                <InfoIcon fontSize="small" color="action" />
              </Tooltip>
            </Box>
          </Box>

          {showConfidenceBar && (
            <Box sx={{ width: '100%', mb: 0.5 }}>
              <LinearProgress
                variant="determinate"
                value={diagnosis.confidence * 100}
                color={getConfidenceColor(diagnosis.confidence)}
                sx={{ height: 6, borderRadius: 3 }}
              />
            </Box>
          )}

          <Typography variant="body2" color="text.secondary">
            {diagnosis.description}
          </Typography>
        </ListItem>
      ))}

      {diagnoses.length > maxItems && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
          Showing top {maxItems} of {diagnoses.length} differential diagnoses
        </Typography>
      )}
    </List>
  );
};

export default DifferentialList;
