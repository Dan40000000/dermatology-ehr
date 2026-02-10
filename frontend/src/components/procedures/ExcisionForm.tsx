/**
 * ExcisionForm - Excision-specific procedure fields
 * CPT Codes: 11400-11446, 11600-11646
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

interface ExcisionFormProps {
  documentation: Record<string, unknown>;
  onChange: (updates: Record<string, unknown>) => void;
  lesionSize?: number;
  onLesionSizeChange: (value: number | undefined) => void;
  marginsPlanned?: number;
  onMarginsPlannedChange: (value: number | undefined) => void;
  dimensionsLength?: number;
  onDimensionsLengthChange: (value: number | undefined) => void;
  dimensionsWidth?: number;
  onDimensionsWidthChange: (value: number | undefined) => void;
  dimensionsDepth?: number;
  onDimensionsDepthChange: (value: number | undefined) => void;
  closureType?: string;
  onClosureTypeChange: (value: string) => void;
  sutureType?: string;
  onSutureTypeChange: (value: string) => void;
  sutureSize?: string;
  onSutureSizeChange: (value: string) => void;
  sutureCount?: number;
  onSutureCountChange: (value: number | undefined) => void;
  specimenSent?: boolean;
  onSpecimenSentChange: (value: boolean) => void;
}

// ============================================
// CONSTANTS
// ============================================

const MARGIN_OPTIONS = [1, 2, 3, 4, 5, 10];

const CLOSURE_TYPES = [
  { value: 'simple', label: 'Simple (Single Layer)' },
  { value: 'intermediate', label: 'Intermediate (Layered)' },
  { value: 'complex', label: 'Complex Repair' }
];

const SUTURE_TYPES = [
  { value: 'nylon', label: 'Nylon (Ethilon)' },
  { value: 'prolene', label: 'Prolene' },
  { value: 'vicryl', label: 'Vicryl (Absorbable)' },
  { value: 'pds', label: 'PDS (Absorbable)' },
  { value: 'monocryl', label: 'Monocryl (Absorbable)' },
  { value: 'chromic', label: 'Chromic Gut' }
];

const SUTURE_SIZES = ['2-0', '3-0', '4-0', '5-0', '6-0'];

const ORIENTATION_OPTIONS = [
  'Superior 12 o\'clock',
  'Lateral suture',
  'Medial nick',
  'Ink marking',
  'None'
];

// ============================================
// COMPONENT
// ============================================

export const ExcisionForm: React.FC<ExcisionFormProps> = ({
  documentation,
  onChange,
  lesionSize,
  onLesionSizeChange,
  marginsPlanned,
  onMarginsPlannedChange,
  dimensionsLength,
  onDimensionsLengthChange,
  dimensionsWidth,
  onDimensionsWidthChange,
  dimensionsDepth,
  onDimensionsDepthChange,
  closureType,
  onClosureTypeChange,
  sutureType,
  onSutureTypeChange,
  sutureSize,
  onSutureSizeChange,
  sutureCount,
  onSutureCountChange,
  specimenSent,
  onSpecimenSentChange
}) => {
  const handleSelectChange = (e: SelectChangeEvent) => {
    const { name, value } = e.target;
    switch (name) {
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

  // Calculate excised specimen diameter for CPT code guidance
  const excisedDiameter = lesionSize && marginsPlanned
    ? lesionSize + (marginsPlanned * 2)
    : null;

  return (
    <Box>
      <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
        Excision Details
      </Typography>

      <Grid container spacing={3}>
        {/* Pre-operative Assessment */}
        <Grid item xs={12}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Pre-Operative Assessment
          </Typography>
        </Grid>

        <Grid item xs={12}>
          <TextField
            fullWidth
            label="Pre-operative Diagnosis"
            value={(documentation.preop_diagnosis as string) || ''}
            onChange={(e) => onChange({ preop_diagnosis: e.target.value })}
            placeholder="e.g., Suspected basal cell carcinoma"
          />
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
            helperText="Largest diameter of the lesion"
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <FormControl fullWidth>
            <InputLabel>Planned Margins (mm)</InputLabel>
            <Select
              name="margins_planned"
              value={marginsPlanned?.toString() || '2'}
              label="Planned Margins (mm)"
              onChange={(e) => onMarginsPlannedChange(Number(e.target.value))}
            >
              {MARGIN_OPTIONS.map(margin => (
                <MenuItem key={margin} value={margin.toString()}>
                  {margin} mm
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>

        {/* CPT Code Guidance */}
        {excisedDiameter && (
          <Grid item xs={12}>
            <Alert severity="info">
              <Typography variant="body2">
                <strong>Excised Specimen Diameter:</strong> {excisedDiameter} mm
                (Lesion {lesionSize}mm + Margins {marginsPlanned}mm x 2)
              </Typography>
              <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                Use excised specimen diameter for CPT code selection, not lesion size alone.
              </Typography>
            </Alert>
          </Grid>
        )}

        <Grid item xs={12}>
          <Divider sx={{ my: 1 }} />
        </Grid>

        {/* Excision Dimensions */}
        <Grid item xs={12}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Excision Dimensions (Actual)
          </Typography>
        </Grid>

        <Grid item xs={12} sm={4}>
          <TextField
            fullWidth
            label="Length (mm)"
            type="number"
            value={dimensionsLength || ''}
            onChange={(e) => onDimensionsLengthChange(
              e.target.value ? Number(e.target.value) : undefined
            )}
            inputProps={{ min: 0, step: 0.5 }}
          />
        </Grid>

        <Grid item xs={12} sm={4}>
          <TextField
            fullWidth
            label="Width (mm)"
            type="number"
            value={dimensionsWidth || ''}
            onChange={(e) => onDimensionsWidthChange(
              e.target.value ? Number(e.target.value) : undefined
            )}
            inputProps={{ min: 0, step: 0.5 }}
          />
        </Grid>

        <Grid item xs={12} sm={4}>
          <TextField
            fullWidth
            label="Depth (mm)"
            type="number"
            value={dimensionsDepth || ''}
            onChange={(e) => onDimensionsDepthChange(
              e.target.value ? Number(e.target.value) : undefined
            )}
            inputProps={{ min: 0, step: 0.5 }}
          />
        </Grid>

        <Grid item xs={12}>
          <TextField
            fullWidth
            label="Excision Technique Notes"
            multiline
            rows={2}
            value={(documentation.excision_technique as string) || ''}
            onChange={(e) => onChange({ excision_technique: e.target.value })}
            placeholder="e.g., Elliptical excision with 3:1 length to width ratio..."
          />
        </Grid>

        <Grid item xs={12}>
          <Divider sx={{ my: 1 }} />
        </Grid>

        {/* Closure */}
        <Grid item xs={12}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Closure
          </Typography>
        </Grid>

        <Grid item xs={12} sm={6}>
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

        {/* Layered Closure Details */}
        {closureType === 'intermediate' && (
          <>
            <Grid item xs={12}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Deep Layer
              </Typography>
            </Grid>

            <Grid item xs={12} sm={4}>
              <FormControl fullWidth size="small">
                <InputLabel>Deep Suture</InputLabel>
                <Select
                  name="deep_suture_type"
                  value={(documentation.deep_suture_type as string) || 'vicryl'}
                  label="Deep Suture"
                  onChange={handleSelectChange}
                >
                  <MenuItem value="vicryl">Vicryl</MenuItem>
                  <MenuItem value="pds">PDS</MenuItem>
                  <MenuItem value="monocryl">Monocryl</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} sm={4}>
              <FormControl fullWidth size="small">
                <InputLabel>Deep Suture Size</InputLabel>
                <Select
                  name="deep_suture_size"
                  value={(documentation.deep_suture_size as string) || '4-0'}
                  label="Deep Suture Size"
                  onChange={handleSelectChange}
                >
                  {SUTURE_SIZES.map(size => (
                    <MenuItem key={size} value={size}>{size}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                size="small"
                label="Deep Suture Count"
                type="number"
                value={(documentation.deep_suture_count as number) || ''}
                onChange={(e) => onChange({
                  deep_suture_count: e.target.value ? Number(e.target.value) : undefined
                })}
                inputProps={{ min: 1 }}
              />
            </Grid>

            <Grid item xs={12}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Superficial Layer
              </Typography>
            </Grid>
          </>
        )}

        <Grid item xs={12} sm={4}>
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

        <Grid item xs={12} sm={4}>
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

        <Grid item xs={12} sm={4}>
          <TextField
            fullWidth
            label="Number of Sutures"
            type="number"
            value={sutureCount || ''}
            onChange={(e) => onSutureCountChange(
              e.target.value ? Number(e.target.value) : undefined
            )}
            inputProps={{ min: 1 }}
          />
        </Grid>

        <Grid item xs={12}>
          <TextField
            fullWidth
            label="Closure Notes"
            value={(documentation.closure_notes as string) || ''}
            onChange={(e) => onChange({ closure_notes: e.target.value })}
            placeholder="e.g., Undermining performed, dog-ear repair..."
          />
        </Grid>

        <Grid item xs={12}>
          <Divider sx={{ my: 1 }} />
        </Grid>

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
              <FormControl fullWidth>
                <InputLabel>Specimen Orientation</InputLabel>
                <Select
                  name="specimen_orientation"
                  value={(documentation.specimen_orientation as string) || ''}
                  label="Specimen Orientation"
                  onChange={handleSelectChange}
                >
                  {ORIENTATION_OPTIONS.map(opt => (
                    <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Specimen Container"
                value={(documentation.specimen_container as string) || 'Formalin'}
                onChange={(e) => onChange({ specimen_container: e.target.value })}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Specimen Label"
                value={(documentation.specimen_label as string) || ''}
                onChange={(e) => onChange({ specimen_label: e.target.value })}
                placeholder="e.g., Left forearm lesion with superior suture for orientation"
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Pathology Lab"
                value={(documentation.pathology_lab as string) || ''}
                onChange={(e) => onChange({ pathology_lab: e.target.value })}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={(documentation.rush_processing as boolean) || false}
                    onChange={(e) => onChange({ rush_processing: e.target.checked })}
                  />
                }
                label="Rush Processing Requested"
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
          </>
        )}

        {/* Suture Removal */}
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
              <MenuItem value="10-14">10-14 days (Extremities)</MenuItem>
              <MenuItem value="14-21">14-21 days (Back/Joints)</MenuItem>
            </Select>
          </FormControl>
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="Follow-up Appointment"
            value={(documentation.followup_appointment as string) || ''}
            onChange={(e) => onChange({ followup_appointment: e.target.value })}
            placeholder="e.g., Return in 10 days for suture removal"
          />
        </Grid>
      </Grid>
    </Box>
  );
};

export default ExcisionForm;
