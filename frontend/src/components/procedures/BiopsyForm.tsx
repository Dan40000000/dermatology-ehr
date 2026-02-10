/**
 * BiopsyForm - Shave and Punch Biopsy-specific procedure fields
 * CPT Codes: 11102-11107 (Shave), 11104-11107 (Punch)
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
  FormControlLabel,
  Checkbox,
  Divider,
  Alert,
  type SelectChangeEvent
} from '@mui/material';

// ============================================
// TYPES
// ============================================

interface BiopsyFormProps {
  procedureType: 'shave_biopsy' | 'punch_biopsy';
  documentation: Record<string, unknown>;
  onChange: (updates: Record<string, unknown>) => void;
  depth?: string;
  onDepthChange: (value: string) => void;
  specimenSent?: boolean;
  onSpecimenSentChange: (value: boolean) => void;
  punchSize?: number;
  onPunchSizeChange: (value: number | undefined) => void;
  closureType?: string;
  onClosureTypeChange: (value: string) => void;
  sutureType?: string;
  onSutureTypeChange: (value: string) => void;
  sutureSize?: string;
  onSutureSizeChange: (value: string) => void;
  sutureCount?: number;
  onSutureCountChange: (value: number | undefined) => void;
}

// ============================================
// CONSTANTS
// ============================================

const BIOPSY_DEPTHS = [
  { value: 'superficial', label: 'Superficial (Epidermis only)' },
  { value: 'partial', label: 'Partial Thickness (Into dermis)' },
  { value: 'full', label: 'Full Thickness (Through dermis)' }
];

const PUNCH_SIZES = [2, 3, 4, 5, 6, 8];

const CLOSURE_TYPES = [
  { value: 'none', label: 'None (Secondary intention)' },
  { value: 'steri_strips', label: 'Steri-Strips' },
  { value: 'simple', label: 'Simple Interrupted Sutures' },
  { value: 'mattress', label: 'Mattress Sutures' }
];

const SUTURE_TYPES = [
  { value: 'nylon', label: 'Nylon (Ethilon)' },
  { value: 'prolene', label: 'Prolene' },
  { value: 'vicryl', label: 'Vicryl (Absorbable)' },
  { value: 'chromic', label: 'Chromic Gut' },
  { value: 'silk', label: 'Silk' }
];

const SUTURE_SIZES = ['2-0', '3-0', '4-0', '5-0', '6-0'];

const ABCDE_OPTIONS = {
  asymmetry: ['Symmetric', 'Asymmetric'],
  border: ['Regular', 'Irregular', 'Notched'],
  color: ['Uniform', 'Variegated', 'Multiple colors'],
  diameter: ['<6mm', '>=6mm'],
  evolution: ['Stable', 'Changing', 'New lesion']
};

// ============================================
// COMPONENT
// ============================================

export const BiopsyForm: React.FC<BiopsyFormProps> = ({
  procedureType,
  documentation,
  onChange,
  depth,
  onDepthChange,
  specimenSent,
  onSpecimenSentChange,
  punchSize,
  onPunchSizeChange,
  closureType,
  onClosureTypeChange,
  sutureType,
  onSutureTypeChange,
  sutureSize,
  onSutureSizeChange,
  sutureCount,
  onSutureCountChange
}) => {
  const isPunchBiopsy = procedureType === 'punch_biopsy';
  const abcde = (documentation.abcde_assessment as Record<string, string>) || {};
  const isPigmentedLesion = (documentation.is_pigmented_lesion as boolean) || false;

  const handleSelectChange = (e: SelectChangeEvent) => {
    const { name, value } = e.target;
    switch (name) {
      case 'depth':
        onDepthChange(value);
        break;
      case 'closure_type':
        onClosureTypeChange(value);
        break;
      case 'suture_type':
        onSutureTypeChange(value);
        break;
      case 'suture_size':
        onSutureSizeChange(value);
        break;
      default:
        onChange({ [name]: value });
    }
  };

  const handleAbcdeChange = (field: string, value: string) => {
    onChange({
      abcde_assessment: {
        ...abcde,
        [field]: value
      }
    });
  };

  return (
    <Box>
      <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
        {isPunchBiopsy ? 'Punch Biopsy Details' : 'Shave Biopsy Details'}
      </Typography>

      <Grid container spacing={3}>
        {/* Lesion Description */}
        <Grid item xs={12}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Lesion Description
          </Typography>
        </Grid>

        <Grid item xs={12}>
          <TextField
            fullWidth
            label="Clinical Description"
            multiline
            rows={2}
            value={(documentation.clinical_description as string) || ''}
            onChange={(e) => onChange({ clinical_description: e.target.value })}
            placeholder="Describe the lesion appearance, color, texture, etc..."
          />
        </Grid>

        {/* Pigmented Lesion ABCDE Assessment */}
        <Grid item xs={12}>
          <FormControlLabel
            control={
              <Checkbox
                checked={isPigmentedLesion}
                onChange={(e) => onChange({ is_pigmented_lesion: e.target.checked })}
              />
            }
            label="Pigmented Lesion (Show ABCDE Assessment)"
          />
        </Grid>

        {isPigmentedLesion && (
          <>
            <Grid item xs={12}>
              <Alert severity="info" sx={{ mb: 2 }}>
                ABCDE Criteria for Pigmented Lesions
              </Alert>
            </Grid>

            <Grid item xs={12} sm={6} md={4}>
              <FormControl fullWidth size="small">
                <InputLabel>A - Asymmetry</InputLabel>
                <Select
                  value={abcde.asymmetry || ''}
                  label="A - Asymmetry"
                  onChange={(e) => handleAbcdeChange('asymmetry', e.target.value)}
                >
                  {ABCDE_OPTIONS.asymmetry.map(opt => (
                    <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} sm={6} md={4}>
              <FormControl fullWidth size="small">
                <InputLabel>B - Border</InputLabel>
                <Select
                  value={abcde.border || ''}
                  label="B - Border"
                  onChange={(e) => handleAbcdeChange('border', e.target.value)}
                >
                  {ABCDE_OPTIONS.border.map(opt => (
                    <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} sm={6} md={4}>
              <FormControl fullWidth size="small">
                <InputLabel>C - Color</InputLabel>
                <Select
                  value={abcde.color || ''}
                  label="C - Color"
                  onChange={(e) => handleAbcdeChange('color', e.target.value)}
                >
                  {ABCDE_OPTIONS.color.map(opt => (
                    <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} sm={6} md={4}>
              <FormControl fullWidth size="small">
                <InputLabel>D - Diameter</InputLabel>
                <Select
                  value={abcde.diameter || ''}
                  label="D - Diameter"
                  onChange={(e) => handleAbcdeChange('diameter', e.target.value)}
                >
                  {ABCDE_OPTIONS.diameter.map(opt => (
                    <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} sm={6} md={4}>
              <FormControl fullWidth size="small">
                <InputLabel>E - Evolution</InputLabel>
                <Select
                  value={abcde.evolution || ''}
                  label="E - Evolution"
                  onChange={(e) => handleAbcdeChange('evolution', e.target.value)}
                >
                  {ABCDE_OPTIONS.evolution.map(opt => (
                    <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </>
        )}

        <Grid item xs={12}>
          <Divider sx={{ my: 1 }} />
        </Grid>

        {/* Procedure Details */}
        <Grid item xs={12}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Procedure Details
          </Typography>
        </Grid>

        {/* Punch Size (for punch biopsy only) */}
        {isPunchBiopsy && (
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Punch Size (mm)</InputLabel>
              <Select
                value={punchSize?.toString() || '4'}
                label="Punch Size (mm)"
                onChange={(e) => onPunchSizeChange(Number(e.target.value))}
              >
                {PUNCH_SIZES.map(size => (
                  <MenuItem key={size} value={size.toString()}>
                    {size} mm
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        )}

        {/* Depth */}
        <Grid item xs={12} sm={isPunchBiopsy ? 6 : 6}>
          <FormControl fullWidth>
            <InputLabel>Depth</InputLabel>
            <Select
              name="depth"
              value={depth || 'partial'}
              label="Depth"
              onChange={handleSelectChange}
            >
              {BIOPSY_DEPTHS.map(d => (
                <MenuItem key={d.value} value={d.value}>
                  {d.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>

        {/* Shave-specific: Blade Type */}
        {!isPunchBiopsy && (
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Blade/Technique</InputLabel>
              <Select
                name="blade_type"
                value={(documentation.blade_type as string) || '#15_blade'}
                label="Blade/Technique"
                onChange={handleSelectChange}
              >
                <MenuItem value="#15_blade">#15 Blade</MenuItem>
                <MenuItem value="#10_blade">#10 Blade</MenuItem>
                <MenuItem value="dermablade">DermaBlade</MenuItem>
                <MenuItem value="curette">Curette</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        )}

        <Grid item xs={12}>
          <Divider sx={{ my: 1 }} />
        </Grid>

        {/* Closure (for punch biopsy) */}
        {isPunchBiopsy && (
          <>
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Closure
              </Typography>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <FormControl fullWidth>
                <InputLabel>Closure Type</InputLabel>
                <Select
                  name="closure_type"
                  value={closureType || 'simple'}
                  label="Closure Type"
                  onChange={handleSelectChange}
                >
                  {CLOSURE_TYPES.map(type => (
                    <MenuItem key={type.value} value={type.value}>
                      {type.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {closureType && closureType !== 'none' && closureType !== 'steri_strips' && (
              <>
                <Grid item xs={12} sm={6} md={3}>
                  <FormControl fullWidth>
                    <InputLabel>Suture Type</InputLabel>
                    <Select
                      name="suture_type"
                      value={sutureType || 'nylon'}
                      label="Suture Type"
                      onChange={handleSelectChange}
                    >
                      {SUTURE_TYPES.map(type => (
                        <MenuItem key={type.value} value={type.value}>
                          {type.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                  <FormControl fullWidth>
                    <InputLabel>Suture Size</InputLabel>
                    <Select
                      name="suture_size"
                      value={sutureSize || '4-0'}
                      label="Suture Size"
                      onChange={handleSelectChange}
                    >
                      {SUTURE_SIZES.map(size => (
                        <MenuItem key={size} value={size}>{size}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    fullWidth
                    label="Number of Sutures"
                    type="number"
                    value={sutureCount || 1}
                    onChange={(e) => onSutureCountChange(
                      e.target.value ? Number(e.target.value) : undefined
                    )}
                    inputProps={{ min: 1, max: 10 }}
                  />
                </Grid>
              </>
            )}

            <Grid item xs={12}>
              <Divider sx={{ my: 1 }} />
            </Grid>
          </>
        )}

        {/* Specimen */}
        <Grid item xs={12}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Specimen
          </Typography>
        </Grid>

        <Grid item xs={12} sm={4}>
          <FormControlLabel
            control={
              <Checkbox
                checked={specimenSent || false}
                onChange={(e) => onSpecimenSentChange(e.target.checked)}
              />
            }
            label="Specimen Sent to Pathology"
          />
        </Grid>

        {specimenSent && (
          <>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Specimen Container"
                value={(documentation.specimen_container as string) || 'Formalin'}
                onChange={(e) => onChange({ specimen_container: e.target.value })}
              />
            </Grid>

            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Specimen Label"
                value={(documentation.specimen_label as string) || ''}
                onChange={(e) => onChange({ specimen_label: e.target.value })}
                placeholder="e.g., Right cheek lesion"
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Pathology Lab"
                value={(documentation.pathology_lab as string) || ''}
                onChange={(e) => onChange({ pathology_lab: e.target.value })}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Clinical History for Pathologist"
                multiline
                rows={2}
                value={(documentation.clinical_history_for_path as string) || ''}
                onChange={(e) => onChange({ clinical_history_for_path: e.target.value })}
                placeholder="Brief history and clinical concern..."
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Differential Diagnoses"
                value={(documentation.differential_diagnoses as string) || ''}
                onChange={(e) => onChange({ differential_diagnoses: e.target.value })}
                placeholder="e.g., R/O melanoma, BCC, benign nevus"
              />
            </Grid>
          </>
        )}

        {/* Suture Removal Instructions (for punch biopsy with sutures) */}
        {isPunchBiopsy && closureType && closureType !== 'none' && closureType !== 'steri_strips' && (
          <>
            <Grid item xs={12}>
              <Divider sx={{ my: 1 }} />
            </Grid>

            <Grid item xs={12}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Suture Removal
              </Typography>
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Suture Removal Timeframe</InputLabel>
                <Select
                  name="suture_removal_days"
                  value={(documentation.suture_removal_days as string) || '7-10'}
                  label="Suture Removal Timeframe"
                  onChange={handleSelectChange}
                >
                  <MenuItem value="5-7">5-7 days (Face)</MenuItem>
                  <MenuItem value="7-10">7-10 days (Body)</MenuItem>
                  <MenuItem value="10-14">10-14 days (Back/Extremities)</MenuItem>
                  <MenuItem value="14-21">14-21 days (Joints/High Tension)</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </>
        )}
      </Grid>
    </Box>
  );
};

export default BiopsyForm;
