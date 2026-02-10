/**
 * ReadingScale Component
 * Visual representation of the ICDRG patch test reading scale
 */

import React from 'react';
import {
  Box,
  Paper,
  Typography,
  Tooltip,
  Chip,
} from '@mui/material';
import {
  Circle as CircleIcon,
  RadioButtonUnchecked as EmptyCircleIcon,
} from '@mui/icons-material';

export type ReadingValue =
  | 'not_read'
  | 'negative'
  | 'irritant'
  | 'doubtful'
  | 'weak_positive'
  | 'strong_positive'
  | 'extreme_positive';

export interface ReadingDefinition {
  code: string;
  label: string;
  description: string;
  color: string;
  severity: number;
}

export const READING_DEFINITIONS: Record<ReadingValue, ReadingDefinition> = {
  not_read: {
    code: 'NR',
    label: 'Not Read',
    description: 'Test not yet read',
    color: '#9e9e9e',
    severity: 0,
  },
  negative: {
    code: '-',
    label: 'Negative',
    description: 'No reaction',
    color: '#4caf50',
    severity: 1,
  },
  irritant: {
    code: 'IR',
    label: 'Irritant',
    description: 'Mild irritation, not allergy. May show erythema but no infiltration.',
    color: '#ff9800',
    severity: 2,
  },
  doubtful: {
    code: '?+',
    label: 'Doubtful',
    description: 'Faint erythema only. May need repeat testing.',
    color: '#ffc107',
    severity: 3,
  },
  weak_positive: {
    code: '+',
    label: 'Weak Positive',
    description: 'Erythema, infiltration, possibly papules. Definite allergic reaction.',
    color: '#f44336',
    severity: 4,
  },
  strong_positive: {
    code: '++',
    label: 'Strong Positive',
    description: 'Erythema, infiltration, papules, vesicles. Strong allergic reaction.',
    color: '#d32f2f',
    severity: 5,
  },
  extreme_positive: {
    code: '+++',
    label: 'Extreme Positive',
    description: 'Bullous reaction. Severe allergic response requiring immediate attention.',
    color: '#b71c1c',
    severity: 6,
  },
};

interface ReadingScaleProps {
  value?: ReadingValue;
  onChange?: (value: ReadingValue) => void;
  disabled?: boolean;
  showLabels?: boolean;
  compact?: boolean;
}

const ReadingScale: React.FC<ReadingScaleProps> = ({
  value,
  onChange,
  disabled = false,
  showLabels = true,
  compact = false,
}) => {
  const readings: ReadingValue[] = [
    'negative',
    'irritant',
    'doubtful',
    'weak_positive',
    'strong_positive',
    'extreme_positive',
  ];

  return (
    <Box>
      {showLabels && !compact && (
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
          Reading Scale (ICDRG)
        </Typography>
      )}

      <Box
        sx={{
          display: 'flex',
          gap: compact ? 0.5 : 1,
          flexWrap: compact ? 'nowrap' : 'wrap',
        }}
      >
        {readings.map((reading) => {
          const def = READING_DEFINITIONS[reading];
          const isSelected = value === reading;

          return (
            <Tooltip
              key={reading}
              title={
                <Box>
                  <Typography variant="subtitle2">{def.label}</Typography>
                  <Typography variant="body2">{def.description}</Typography>
                </Box>
              }
              placement="top"
            >
              <Box
                onClick={() => !disabled && onChange?.(reading)}
                sx={{
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.5 : 1,
                  p: compact ? 0.5 : 1,
                  borderRadius: 1,
                  border: isSelected ? `2px solid ${def.color}` : '2px solid transparent',
                  bgcolor: isSelected ? `${def.color}15` : 'transparent',
                  transition: 'all 0.2s',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  minWidth: compact ? 40 : 60,
                  '&:hover': {
                    bgcolor: disabled ? undefined : `${def.color}10`,
                  },
                }}
              >
                <Box
                  sx={{
                    width: compact ? 24 : 32,
                    height: compact ? 24 : 32,
                    borderRadius: '50%',
                    bgcolor: def.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontWeight: 'bold',
                    fontSize: compact ? '0.7rem' : '0.85rem',
                    mb: showLabels && !compact ? 0.5 : 0,
                  }}
                >
                  {def.code}
                </Box>
                {showLabels && !compact && (
                  <Typography
                    variant="caption"
                    align="center"
                    sx={{
                      fontWeight: isSelected ? 'bold' : 'normal',
                      color: isSelected ? def.color : 'text.secondary',
                    }}
                  >
                    {def.label}
                  </Typography>
                )}
              </Box>
            </Tooltip>
          );
        })}
      </Box>
    </Box>
  );
};

// Badge component for displaying a single reading value
export const ReadingBadge: React.FC<{
  value: ReadingValue;
  size?: 'small' | 'medium';
}> = ({ value, size = 'medium' }) => {
  const def = READING_DEFINITIONS[value];

  return (
    <Chip
      label={`${def.code} ${def.label}`}
      size={size}
      sx={{
        bgcolor: `${def.color}20`,
        color: def.color,
        fontWeight: 'bold',
        borderColor: def.color,
      }}
      variant="outlined"
    />
  );
};

// Legend component showing all reading values
export const ReadingLegend: React.FC = () => {
  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="subtitle1" gutterBottom fontWeight="bold">
        Patch Test Reading Scale (ICDRG)
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {Object.entries(READING_DEFINITIONS)
          .filter(([key]) => key !== 'not_read')
          .map(([key, def]) => (
            <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  bgcolor: def.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: '0.85rem',
                  flexShrink: 0,
                }}
              >
                {def.code}
              </Box>
              <Box>
                <Typography variant="body2" fontWeight="bold">
                  {def.label}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {def.description}
                </Typography>
              </Box>
            </Box>
          ))}
      </Box>
    </Paper>
  );
};

export default ReadingScale;
