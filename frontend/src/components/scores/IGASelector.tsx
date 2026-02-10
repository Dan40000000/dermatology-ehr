/**
 * IGA (Investigator Global Assessment) Selector Component
 * Simple 0-4 scale for global disease severity assessment
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  RadioGroup,
  FormControlLabel,
  Radio,
  Chip,
  Alert,
  Button,
  TextField,
  Divider
} from '@mui/material';

export interface IGAValue {
  selection: number;
  description: string;
}

interface IGASelectorProps {
  value?: IGAValue;
  onChange?: (value: IGAValue) => void;
  onCalculate?: (result: IGAScoreResult) => void;
  readOnly?: boolean;
  showDescription?: boolean;
}

export interface IGAScoreResult {
  score: number;
  interpretation: string;
  severity_level: string;
  component_breakdown?: {
    selection: number;
    description: string;
  };
}

const IGA_OPTIONS = [
  {
    value: 0,
    label: 'Clear',
    severity: 'none',
    description: 'No inflammatory signs of disease',
    color: '#4caf50'
  },
  {
    value: 1,
    label: 'Almost Clear',
    severity: 'minimal',
    description: 'Just perceptible erythema and just perceptible induration/papulation',
    color: '#8bc34a'
  },
  {
    value: 2,
    label: 'Mild',
    severity: 'mild',
    description: 'Clearly perceptible erythema and clearly perceptible induration/papulation',
    color: '#ffeb3b'
  },
  {
    value: 3,
    label: 'Moderate',
    severity: 'moderate',
    description: 'Marked erythema and marked induration/papulation',
    color: '#ff9800'
  },
  {
    value: 4,
    label: 'Severe',
    severity: 'severe',
    description: 'Severe erythema and severe induration/papulation',
    color: '#f44336'
  }
];

export const IGASelector: React.FC<IGASelectorProps> = ({
  value,
  onChange,
  onCalculate,
  readOnly = false,
  showDescription = true
}) => {
  const [selectedValue, setSelectedValue] = useState<number | null>(value?.selection ?? null);
  const [notes, setNotes] = useState<string>(value?.description ?? '');

  useEffect(() => {
    if (value) {
      setSelectedValue(value.selection);
      setNotes(value.description);
    }
  }, [value]);

  const handleSelectionChange = (newValue: number): void => {
    setSelectedValue(newValue);
    const option = IGA_OPTIONS.find(o => o.value === newValue);
    const igaValue: IGAValue = {
      selection: newValue,
      description: option?.description ?? ''
    };
    onChange?.(igaValue);
  };

  const handleCalculate = (): void => {
    if (selectedValue === null) return;

    const option = IGA_OPTIONS.find(o => o.value === selectedValue);
    if (!option) return;

    const result: IGAScoreResult = {
      score: selectedValue,
      interpretation: option.label,
      severity_level: option.severity,
      component_breakdown: {
        selection: selectedValue,
        description: option.description
      }
    };
    onCalculate?.(result);
  };

  const selectedOption = selectedValue !== null
    ? IGA_OPTIONS.find(o => o.value === selectedValue)
    : null;

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          IGA - Investigator Global Assessment
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Select the score that best represents the overall disease severity
        </Typography>

        <RadioGroup
          value={selectedValue ?? ''}
          onChange={(e) => handleSelectionChange(parseInt(e.target.value, 10))}
        >
          {IGA_OPTIONS.map((option) => (
            <Box
              key={option.value}
              sx={{
                mb: 1,
                p: 1.5,
                borderRadius: 1,
                border: '1px solid',
                borderColor: selectedValue === option.value ? option.color : 'grey.300',
                backgroundColor: selectedValue === option.value ? `${option.color}10` : 'transparent',
                cursor: readOnly ? 'default' : 'pointer',
                '&:hover': readOnly ? {} : {
                  backgroundColor: `${option.color}08`
                }
              }}
            >
              <FormControlLabel
                value={option.value}
                control={<Radio disabled={readOnly} />}
                label={
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body1" fontWeight="medium">
                        {option.value} - {option.label}
                      </Typography>
                      <Chip
                        size="small"
                        label={option.severity}
                        sx={{
                          backgroundColor: option.color,
                          color: option.value <= 1 ? 'text.primary' : 'white',
                          fontSize: '0.7rem'
                        }}
                      />
                    </Box>
                    {showDescription && (
                      <Typography variant="body2" color="text.secondary" sx={{ ml: 3 }}>
                        {option.description}
                      </Typography>
                    )}
                  </Box>
                }
              />
            </Box>
          ))}
        </RadioGroup>

        {selectedOption && (
          <>
            <Divider sx={{ my: 2 }} />
            <Alert
              severity={selectedOption.value <= 1 ? 'success' : selectedOption.value === 2 ? 'info' : selectedOption.value === 3 ? 'warning' : 'error'}
              sx={{ mb: 2 }}
            >
              <Typography variant="body2">
                <strong>Current Assessment:</strong> {selectedOption.label} (Score: {selectedOption.value})
              </Typography>
            </Alert>
          </>
        )}

        {!readOnly && (
          <>
            <TextField
              fullWidth
              multiline
              rows={2}
              label="Clinical Notes (Optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any relevant clinical observations..."
              sx={{ mt: 2 }}
            />

            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="contained"
                onClick={handleCalculate}
                disabled={selectedValue === null}
              >
                Calculate Score
              </Button>
            </Box>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default IGASelector;
