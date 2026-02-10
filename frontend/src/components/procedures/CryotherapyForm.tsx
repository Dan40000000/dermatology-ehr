/**
 * CryotherapyForm - Cryotherapy-specific procedure fields
 * CPT Codes: 17000-17004, 17110-17111
 */

import React from 'react';
import {
  Box,
  TextField,
  MenuItem,
  Grid,
  FormControl,
  InputLabel,
  Select,
  Typography,
  Slider,
  type SelectChangeEvent
} from '@mui/material';

// ============================================
// TYPES
// ============================================

interface CryotherapyFormProps {
  documentation: Record<string, unknown>;
  onChange: (updates: Record<string, unknown>) => void;
  lesionType?: string;
  lesionSize?: number;
  onLesionTypeChange: (value: string) => void;
  onLesionSizeChange: (value: number | undefined) => void;
}

// ============================================
// CONSTANTS
// ============================================

const LESION_TYPES = [
  { value: 'actinic_keratosis', label: 'Actinic Keratosis' },
  { value: 'seborrheic_keratosis', label: 'Seborrheic Keratosis' },
  { value: 'verruca', label: 'Verruca (Wart)' },
  { value: 'molluscum', label: 'Molluscum Contagiosum' },
  { value: 'skin_tag', label: 'Skin Tag' },
  { value: 'lentigo', label: 'Lentigo' },
  { value: 'cherry_angioma', label: 'Cherry Angioma' },
  { value: 'keloid', label: 'Keloid' },
  { value: 'hypertrophic_scar', label: 'Hypertrophic Scar' },
  { value: 'granuloma', label: 'Granuloma' },
  { value: 'other', label: 'Other' }
];

const FREEZE_MARKS = [
  { value: 5, label: '5s' },
  { value: 10, label: '10s' },
  { value: 15, label: '15s' },
  { value: 20, label: '20s' },
  { value: 30, label: '30s' }
];

const THAW_MARKS = [
  { value: 15, label: '15s' },
  { value: 30, label: '30s' },
  { value: 45, label: '45s' },
  { value: 60, label: '60s' }
];

// ============================================
// COMPONENT
// ============================================

export const CryotherapyForm: React.FC<CryotherapyFormProps> = ({
  documentation,
  onChange,
  lesionType,
  lesionSize,
  onLesionTypeChange,
  onLesionSizeChange
}) => {
  const freezeTime = (documentation.freeze_time_seconds as number) || 10;
  const cycles = (documentation.number_of_cycles as number) || 2;
  const thawTime = (documentation.thaw_time_seconds as number) || 30;
  const technique = (documentation.technique as string) || 'spray';
  const tipSize = (documentation.tip_size as string) || '';

  const handleSelectChange = (e: SelectChangeEvent) => {
    const { name, value } = e.target;
    if (name === 'lesion_type') {
      onLesionTypeChange(value);
    } else if (name === 'technique' || name === 'tip_size') {
      onChange({ [name]: value });
    }
  };

  return (
    <Box>
      <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
        Cryotherapy Details
      </Typography>

      <Grid container spacing={3}>
        {/* Lesion Information */}
        <Grid item xs={12}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Lesion Information
          </Typography>
        </Grid>

        <Grid item xs={12} sm={6}>
          <FormControl fullWidth>
            <InputLabel>Lesion Type</InputLabel>
            <Select
              name="lesion_type"
              value={lesionType || ''}
              label="Lesion Type"
              onChange={handleSelectChange}
            >
              {LESION_TYPES.map(type => (
                <MenuItem key={type.value} value={type.value}>
                  {type.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="Lesion Size (mm)"
            type="number"
            value={lesionSize || ''}
            onChange={(e) => onLesionSizeChange(
              e.target.value ? Number(e.target.value) : undefined
            )}
            inputProps={{ min: 0, step: 0.5 }}
          />
        </Grid>

        <Grid item xs={12}>
          <TextField
            fullWidth
            label="Lesion Description"
            multiline
            rows={2}
            value={(documentation.lesion_description as string) || ''}
            onChange={(e) => onChange({ lesion_description: e.target.value })}
            placeholder="Describe the lesion appearance..."
          />
        </Grid>

        {/* Technique */}
        <Grid item xs={12}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom sx={{ mt: 2 }}>
            Technique
          </Typography>
        </Grid>

        <Grid item xs={12} sm={6}>
          <FormControl fullWidth>
            <InputLabel>Technique</InputLabel>
            <Select
              name="technique"
              value={technique}
              label="Technique"
              onChange={handleSelectChange}
            >
              <MenuItem value="spray">Spray (Open)</MenuItem>
              <MenuItem value="dipstick">Cotton-Tip Applicator</MenuItem>
              <MenuItem value="probe">Cryoprobe</MenuItem>
              <MenuItem value="cone">Cone Spray</MenuItem>
            </Select>
          </FormControl>
        </Grid>

        {technique === 'probe' && (
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Probe Tip Size</InputLabel>
              <Select
                name="tip_size"
                value={tipSize}
                label="Probe Tip Size"
                onChange={handleSelectChange}
              >
                <MenuItem value="2mm">2 mm</MenuItem>
                <MenuItem value="4mm">4 mm</MenuItem>
                <MenuItem value="6mm">6 mm</MenuItem>
                <MenuItem value="10mm">10 mm</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        )}

        {/* Freeze Parameters */}
        <Grid item xs={12}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom sx={{ mt: 2 }}>
            Freeze Parameters
          </Typography>
        </Grid>

        <Grid item xs={12} sm={6}>
          <Typography gutterBottom>
            Freeze Time: <strong>{freezeTime} seconds</strong>
          </Typography>
          <Slider
            value={freezeTime}
            onChange={(_, value) => onChange({ freeze_time_seconds: value as number })}
            min={5}
            max={30}
            step={5}
            marks={FREEZE_MARKS}
            valueLabelDisplay="auto"
            valueLabelFormat={(value) => `${value}s`}
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <Typography gutterBottom>
            Number of Freeze-Thaw Cycles: <strong>{cycles}</strong>
          </Typography>
          <Slider
            value={cycles}
            onChange={(_, value) => onChange({ number_of_cycles: value as number })}
            min={1}
            max={4}
            step={1}
            marks={[
              { value: 1, label: '1' },
              { value: 2, label: '2' },
              { value: 3, label: '3' },
              { value: 4, label: '4' }
            ]}
            valueLabelDisplay="auto"
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <Typography gutterBottom>
            Thaw Time: <strong>{thawTime} seconds</strong>
          </Typography>
          <Slider
            value={thawTime}
            onChange={(_, value) => onChange({ thaw_time_seconds: value as number })}
            min={15}
            max={60}
            step={15}
            marks={THAW_MARKS}
            valueLabelDisplay="auto"
            valueLabelFormat={(value) => `${value}s`}
          />
        </Grid>

        {/* Total Treatment Time Display */}
        <Grid item xs={12} sm={6}>
          <Box
            sx={{
              p: 2,
              bgcolor: 'primary.50',
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'primary.200'
            }}
          >
            <Typography variant="subtitle2" color="primary.main">
              Total Treatment Time
            </Typography>
            <Typography variant="h5" color="primary.dark">
              {cycles * (freezeTime + thawTime)} seconds
            </Typography>
            <Typography variant="caption" color="text.secondary">
              ({cycles} cycles x ({freezeTime}s freeze + {thawTime}s thaw))
            </Typography>
          </Box>
        </Grid>

        {/* Expected Outcome */}
        <Grid item xs={12}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom sx={{ mt: 2 }}>
            Expected Outcome
          </Typography>
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="Immediate Reaction"
            value={(documentation.immediate_reaction as string) || 'Erythema and edema at treatment site'}
            onChange={(e) => onChange({ immediate_reaction: e.target.value })}
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="Expected Healing Time"
            value={(documentation.expected_healing_time as string) || '1-2 weeks'}
            onChange={(e) => onChange({ expected_healing_time: e.target.value })}
          />
        </Grid>

        {/* Patient Instructions */}
        <Grid item xs={12}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom sx={{ mt: 2 }}>
            Post-Procedure Care
          </Typography>
        </Grid>

        <Grid item xs={12}>
          <TextField
            fullWidth
            label="Patient Instructions"
            multiline
            rows={3}
            value={(documentation.patient_instructions as string) ||
              'Expect redness, swelling, and possible blister formation at the treatment site. Keep area clean and dry. ' +
              'Apply antibiotic ointment if instructed. Blister may form within 24 hours - do not pop. ' +
              'Return if signs of infection (increasing redness, warmth, pus, or fever).'}
            onChange={(e) => onChange({ patient_instructions: e.target.value })}
          />
        </Grid>
      </Grid>
    </Box>
  );
};

export default CryotherapyForm;
