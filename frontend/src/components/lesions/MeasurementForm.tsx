import React, { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Grid,
  Paper,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  InputAdornment
} from '@mui/material';
import {
  Straighten as MeasureIcon
} from '@mui/icons-material';

interface MeasurementFormProps {
  lesionId: string;
  encounterId?: string;
  onSave: () => void;
  onCancel: () => void;
}

const MeasurementForm: React.FC<MeasurementFormProps> = ({
  lesionId,
  encounterId,
  onSave,
  onCancel
}) => {
  const [lengthMm, setLengthMm] = useState<string>('');
  const [widthMm, setWidthMm] = useState<string>('');
  const [heightMm, setHeightMm] = useState<string>('');
  const [color, setColor] = useState<string>('');
  const [border, setBorder] = useState<string>('');
  const [symmetry, setSymmetry] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!lengthMm && !widthMm) {
      setError('Please enter at least length or width');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const token = localStorage.getItem('token');
      const tenantId = localStorage.getItem('tenantId');

      const response = await fetch(`/api/lesion-tracking/${lesionId}/measurements`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-tenant-id': tenantId || ''
        },
        body: JSON.stringify({
          encounterId,
          lengthMm: lengthMm ? parseFloat(lengthMm) : undefined,
          widthMm: widthMm ? parseFloat(widthMm) : undefined,
          heightMm: heightMm ? parseFloat(heightMm) : undefined,
          color: color || undefined,
          border: border || undefined,
          symmetry: symmetry || undefined,
          notes: notes || undefined
        })
      });

      if (response.ok) {
        onSave();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to save measurements');
      }
    } catch (err) {
      console.error('Error saving measurements:', err);
      setError('Failed to save measurements');
    } finally {
      setSaving(false);
    }
  };

  const calculateArea = (): string => {
    if (lengthMm && widthMm) {
      const area = parseFloat(lengthMm) * parseFloat(widthMm);
      return area.toFixed(2);
    }
    return '-';
  };

  const colorOptions = [
    'Brown (uniform)',
    'Brown (variegated)',
    'Black',
    'Blue',
    'Blue-gray',
    'White',
    'Red',
    'Pink',
    'Tan',
    'Multiple colors'
  ];

  const borderOptions = [
    'Regular',
    'Irregular',
    'Well-defined',
    'Poorly-defined',
    'Notched',
    'Scalloped'
  ];

  const symmetryOptions = [
    'Symmetric',
    'Asymmetric (1 axis)',
    'Asymmetric (2 axes)'
  ];

  return (
    <Box sx={{ pt: 2 }}>
      {/* Size Measurements */}
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <MeasureIcon color="primary" />
          <Typography variant="subtitle1" fontWeight="bold">
            Size Measurements
          </Typography>
        </Box>

        <Grid container spacing={2}>
          <Grid item xs={4}>
            <TextField
              label="Length"
              value={lengthMm}
              onChange={(e) => setLengthMm(e.target.value)}
              type="number"
              fullWidth
              size="small"
              InputProps={{
                endAdornment: <InputAdornment position="end">mm</InputAdornment>
              }}
              inputProps={{ min: 0, step: 0.1 }}
            />
          </Grid>
          <Grid item xs={4}>
            <TextField
              label="Width"
              value={widthMm}
              onChange={(e) => setWidthMm(e.target.value)}
              type="number"
              fullWidth
              size="small"
              InputProps={{
                endAdornment: <InputAdornment position="end">mm</InputAdornment>
              }}
              inputProps={{ min: 0, step: 0.1 }}
            />
          </Grid>
          <Grid item xs={4}>
            <TextField
              label="Height/Depth"
              value={heightMm}
              onChange={(e) => setHeightMm(e.target.value)}
              type="number"
              fullWidth
              size="small"
              InputProps={{
                endAdornment: <InputAdornment position="end">mm</InputAdornment>
              }}
              inputProps={{ min: 0, step: 0.1 }}
              helperText="Optional"
            />
          </Grid>
        </Grid>

        {/* Calculated Area */}
        <Box mt={2} p={1.5} bgcolor="action.hover" borderRadius={1}>
          <Typography variant="body2" color="text.secondary">
            Calculated Area: <strong>{calculateArea()} mm2</strong>
          </Typography>
        </Box>
      </Paper>

      {/* Visual Characteristics */}
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
          Visual Characteristics
        </Typography>

        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <FormControl fullWidth size="small">
              <InputLabel>Color</InputLabel>
              <Select
                value={color}
                label="Color"
                onChange={(e) => setColor(e.target.value)}
              >
                <MenuItem value="">
                  <em>Not specified</em>
                </MenuItem>
                {colorOptions.map((option) => (
                  <MenuItem key={option} value={option}>{option}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={4}>
            <FormControl fullWidth size="small">
              <InputLabel>Border</InputLabel>
              <Select
                value={border}
                label="Border"
                onChange={(e) => setBorder(e.target.value)}
              >
                <MenuItem value="">
                  <em>Not specified</em>
                </MenuItem>
                {borderOptions.map((option) => (
                  <MenuItem key={option} value={option}>{option}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={4}>
            <FormControl fullWidth size="small">
              <InputLabel>Symmetry</InputLabel>
              <Select
                value={symmetry}
                label="Symmetry"
                onChange={(e) => setSymmetry(e.target.value)}
              >
                <MenuItem value="">
                  <em>Not specified</em>
                </MenuItem>
                {symmetryOptions.map((option) => (
                  <MenuItem key={option} value={option}>{option}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {/* Notes */}
      <TextField
        label="Notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        multiline
        rows={2}
        fullWidth
        sx={{ mb: 2 }}
        placeholder="Any additional observations about the lesion..."
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
          disabled={saving || (!lengthMm && !widthMm)}
        >
          {saving ? 'Saving...' : 'Save Measurements'}
        </Button>
      </Box>
    </Box>
  );
};

export default MeasurementForm;
