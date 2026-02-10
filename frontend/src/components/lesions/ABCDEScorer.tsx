import React, { useState } from 'react';
import {
  Box,
  Typography,
  Slider,
  Paper,
  Grid,
  Button,
  TextField,
  Alert,
  Chip,
  Divider,
  Card,
  CardContent
} from '@mui/material';
import {
  Warning as WarningIcon,
  CheckCircle as CheckIcon
} from '@mui/icons-material';

interface ABCDEScores {
  asymmetry: number;
  border: number;
  color: number;
  diameter: number;
  evolution: number;
}

interface ABCDEScorerProps {
  lesionId: string;
  encounterId?: string;
  onSave: () => void;
  onCancel: () => void;
}

const ABCDEScorer: React.FC<ABCDEScorerProps> = ({
  lesionId,
  encounterId,
  onSave,
  onCancel
}) => {
  const [scores, setScores] = useState<ABCDEScores>({
    asymmetry: 0,
    border: 0,
    color: 0,
    diameter: 0,
    evolution: 0
  });
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalScore = scores.asymmetry + scores.border + scores.color + scores.diameter + scores.evolution;

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      const token = localStorage.getItem('token');
      const tenantId = localStorage.getItem('tenantId');

      const response = await fetch(`/api/lesion-tracking/${lesionId}/abcde`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-tenant-id': tenantId || ''
        },
        body: JSON.stringify({
          ...scores,
          encounterId,
          notes: notes || undefined
        })
      });

      if (response.ok) {
        onSave();
      } else {
        setError('Failed to save ABCDE score');
      }
    } catch (err) {
      console.error('Error saving ABCDE score:', err);
      setError('Failed to save ABCDE score');
    } finally {
      setSaving(false);
    }
  };

  const getRiskLevel = (): { level: string; color: 'success' | 'warning' | 'error'; description: string } => {
    if (totalScore >= 7) {
      return {
        level: 'High Risk',
        color: 'error',
        description: 'Strong recommendation for biopsy or excision'
      };
    }
    if (totalScore >= 5) {
      return {
        level: 'Moderate Risk',
        color: 'warning',
        description: 'Consider biopsy or close monitoring'
      };
    }
    if (totalScore >= 3) {
      return {
        level: 'Low Risk',
        color: 'warning',
        description: 'Regular monitoring recommended'
      };
    }
    return {
      level: 'Minimal Risk',
      color: 'success',
      description: 'Routine follow-up appropriate'
    };
  };

  const risk = getRiskLevel();

  const criteriaInfo = {
    asymmetry: {
      title: 'A - Asymmetry',
      description: 'Is the lesion asymmetric in shape?',
      options: [
        { value: 0, label: 'Symmetric', description: 'Both halves match' },
        { value: 1, label: 'Asymmetric in 1 axis', description: 'One axis asymmetric' },
        { value: 2, label: 'Asymmetric in 2 axes', description: 'Both axes asymmetric' }
      ]
    },
    border: {
      title: 'B - Border',
      description: 'Are the borders regular and well-defined?',
      options: [
        { value: 0, label: 'Regular', description: 'Smooth, even borders' },
        { value: 1, label: 'Irregular in 1-2 segments', description: 'Some irregular areas' },
        { value: 2, label: 'Irregular in 3+ segments', description: 'Significantly irregular' }
      ]
    },
    color: {
      title: 'C - Color',
      description: 'How many colors are present?',
      options: [
        { value: 0, label: 'Uniform', description: '1 color' },
        { value: 1, label: '2-3 colors', description: 'Multiple shades' },
        { value: 2, label: '4+ colors', description: 'Many colors including white/blue/red' }
      ]
    },
    diameter: {
      title: 'D - Diameter',
      description: 'What is the diameter of the lesion?',
      options: [
        { value: 0, label: '< 5mm', description: 'Smaller than pencil eraser' },
        { value: 1, label: '5-6mm', description: 'About pencil eraser size' },
        { value: 2, label: '> 6mm', description: 'Larger than pencil eraser' }
      ]
    },
    evolution: {
      title: 'E - Evolution',
      description: 'Has the lesion changed over time?',
      options: [
        { value: 0, label: 'Stable', description: 'No change noted' },
        { value: 1, label: 'Slow change', description: 'Gradual changes observed' },
        { value: 2, label: 'Rapid change', description: 'Recent significant changes' }
      ]
    }
  };

  const renderCriterion = (key: keyof ABCDEScores) => {
    const info = criteriaInfo[key];
    const value = scores[key];

    return (
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
            {info.title}
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {info.description}
          </Typography>

          <Grid container spacing={1} sx={{ mt: 1 }}>
            {info.options.map((option) => (
              <Grid item xs={4} key={option.value}>
                <Paper
                  elevation={value === option.value ? 3 : 0}
                  sx={{
                    p: 1.5,
                    cursor: 'pointer',
                    border: value === option.value ? 2 : 1,
                    borderColor: value === option.value ? 'primary.main' : 'divider',
                    bgcolor: value === option.value ? 'primary.light' : 'background.paper',
                    transition: 'all 0.2s',
                    '&:hover': {
                      borderColor: 'primary.main',
                      bgcolor: 'action.hover'
                    }
                  }}
                  onClick={() => setScores({ ...scores, [key]: option.value })}
                >
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="body2" fontWeight="medium">
                      {option.label}
                    </Typography>
                    <Chip
                      label={option.value}
                      size="small"
                      color={option.value === 0 ? 'success' : option.value === 1 ? 'warning' : 'error'}
                    />
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    {option.description}
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>
    );
  };

  return (
    <Box sx={{ pt: 2 }}>
      {/* Score Summary */}
      <Paper
        sx={{
          p: 2,
          mb: 3,
          bgcolor: risk.color === 'error' ? 'error.light' :
                   risk.color === 'warning' ? 'warning.light' : 'success.light'
        }}
      >
        <Grid container alignItems="center" spacing={2}>
          <Grid item>
            {risk.color === 'success' ? (
              <CheckIcon color="success" sx={{ fontSize: 40 }} />
            ) : (
              <WarningIcon color={risk.color} sx={{ fontSize: 40 }} />
            )}
          </Grid>
          <Grid item xs>
            <Typography variant="h4">{totalScore}/10</Typography>
            <Typography variant="subtitle1" fontWeight="bold">
              {risk.level}
            </Typography>
            <Typography variant="body2">{risk.description}</Typography>
          </Grid>
          <Grid item>
            <Box display="flex" gap={0.5}>
              {(['asymmetry', 'border', 'color', 'diameter', 'evolution'] as const).map((key) => (
                <Chip
                  key={key}
                  label={`${key.charAt(0).toUpperCase()}: ${scores[key]}`}
                  size="small"
                  variant="outlined"
                />
              ))}
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* ABCDE Criteria */}
      {renderCriterion('asymmetry')}
      {renderCriterion('border')}
      {renderCriterion('color')}
      {renderCriterion('diameter')}
      {renderCriterion('evolution')}

      {/* Notes */}
      <TextField
        label="Additional Notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        multiline
        rows={2}
        fullWidth
        sx={{ mb: 2 }}
        placeholder="Any additional observations..."
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Actions */}
      <Box display="flex" justifyContent="flex-end" gap={2}>
        <Button onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save ABCDE Score'}
        </Button>
      </Box>
    </Box>
  );
};

export default ABCDEScorer;
