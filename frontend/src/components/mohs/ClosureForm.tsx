/**
 * ClosureForm Component
 * Documents closure/repair for Mohs surgery cases
 */

import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Button,
  Chip,
  Autocomplete,
  Divider,
  Alert,
  FormControlLabel,
  Checkbox,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import {
  Save as SaveIcon,
  ExpandMore as ExpandMoreIcon
} from '@mui/icons-material';

interface ClosureData {
  closure_type: string;
  closure_subtype: string;
  repair_length_cm: string;
  repair_width_cm: string;
  repair_area_sq_cm: string;
  repair_cpt_codes: string[];
  suture_layers: string;
  deep_sutures: string;
  superficial_sutures: string;
  suture_removal_days: string;
  dressing_type: string;
  pressure_dressing: boolean;
  closure_notes: string;
  technique_notes: string;
  flap_type?: string;
  donor_site?: string;
  pedicle_width?: string;
  arc_of_rotation?: string;
  graft_source?: string;
  graft_thickness?: string;
}

interface ClosureFormProps {
  caseId: string;
  defectSizeMm?: number;
  tumorLocation?: string;
  onSave: (data: ClosureData) => Promise<void>;
  onCancel?: () => void;
}

const CLOSURE_TYPES = [
  { value: 'primary', label: 'Primary Closure', group: 'Simple' },
  { value: 'complex_linear', label: 'Complex Linear Closure', group: 'Simple' },
  { value: 'advancement_flap', label: 'Advancement Flap', group: 'Flap' },
  { value: 'rotation_flap', label: 'Rotation Flap', group: 'Flap' },
  { value: 'transposition_flap', label: 'Transposition Flap', group: 'Flap' },
  { value: 'interpolation_flap', label: 'Interpolation Flap', group: 'Flap' },
  { value: 'full_thickness_graft', label: 'Full Thickness Skin Graft (FTSG)', group: 'Graft' },
  { value: 'split_thickness_graft', label: 'Split Thickness Skin Graft (STSG)', group: 'Graft' },
  { value: 'secondary_intention', label: 'Secondary Intention (Healing)', group: 'Other' },
  { value: 'delayed', label: 'Delayed Closure', group: 'Other' },
  { value: 'referred', label: 'Referred for Reconstruction', group: 'Other' }
];

const REPAIR_CPT_CODES = [
  // Simple repairs
  { code: '12031', description: 'Simple repair, scalp/trunk/ext, 2.5cm or less' },
  { code: '12032', description: 'Simple repair, scalp/trunk/ext, 2.6-7.5cm' },
  { code: '12041', description: 'Simple repair, neck/hands/feet, 2.5cm or less' },
  { code: '12051', description: 'Simple repair, face, 2.5cm or less' },
  { code: '12052', description: 'Simple repair, face, 2.6-5.0cm' },
  // Complex repairs
  { code: '13131', description: 'Complex repair, forehead/cheek/chin, 2.6-7.5cm' },
  { code: '13132', description: 'Complex repair, add-on each 5cm' },
  { code: '13151', description: 'Complex repair, eyelids/nose/ears/lips, 1.1-2.5cm' },
  { code: '13152', description: 'Complex repair, eyelids/nose/ears/lips, 2.6-7.5cm' },
  // Flaps
  { code: '14040', description: 'Flap, forehead/cheek/chin/neck, 10 sq cm or less' },
  { code: '14041', description: 'Flap, forehead/cheek/chin/neck, 10.1-30 sq cm' },
  { code: '14060', description: 'Flap, eyelids/nose/ears/lips, 10 sq cm or less' },
  { code: '14061', description: 'Flap, eyelids/nose/ears/lips, 10.1-30 sq cm' },
  // Grafts
  { code: '15120', description: 'STSG, face/scalp, first 100 sq cm' },
  { code: '15200', description: 'FTSG, trunk, 20 sq cm or less' },
  { code: '15220', description: 'FTSG, scalp/arms/legs, 20 sq cm or less' },
  { code: '15240', description: 'FTSG, face/eyelids/nose/lips, 20 sq cm or less' }
];

const SUTURE_MATERIALS = [
  '5-0 Vicryl',
  '4-0 Vicryl',
  '3-0 Vicryl',
  '5-0 Monocryl',
  '4-0 Monocryl',
  '6-0 Prolene',
  '5-0 Prolene',
  '6-0 Nylon',
  '5-0 Nylon',
  '4-0 Nylon',
  '5-0 Fast Gut',
  '4-0 Chromic',
  'Dermabond'
];

const DRESSING_TYPES = [
  'Xeroform',
  'Telfa',
  'Adaptic',
  'Steri-Strips',
  'Tegaderm',
  'Pressure bolster',
  'Foam dressing',
  'Aquacel',
  'Mepilex',
  'None'
];

const ClosureForm: React.FC<ClosureFormProps> = ({
  caseId,
  defectSizeMm,
  tumorLocation,
  onSave,
  onCancel
}) => {
  const [formData, setFormData] = useState<ClosureData>({
    closure_type: '',
    closure_subtype: '',
    repair_length_cm: '',
    repair_width_cm: '',
    repair_area_sq_cm: '',
    repair_cpt_codes: [],
    suture_layers: '2',
    deep_sutures: '',
    superficial_sutures: '',
    suture_removal_days: '7',
    dressing_type: '',
    pressure_dressing: false,
    closure_notes: '',
    technique_notes: ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFlap = formData.closure_type.includes('flap');
  const isGraft = formData.closure_type.includes('graft');

  const updateField = (field: keyof ClosureData, value: unknown) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value
    }));

    // Auto-calculate area
    if (field === 'repair_length_cm' || field === 'repair_width_cm') {
      const length = field === 'repair_length_cm' ? parseFloat(value as string) : parseFloat(formData.repair_length_cm);
      const width = field === 'repair_width_cm' ? parseFloat(value as string) : parseFloat(formData.repair_width_cm);
      if (!isNaN(length) && !isNaN(width)) {
        setFormData((prev) => ({
          ...prev,
          repair_area_sq_cm: (length * width).toFixed(2)
        }));
      }
    }
  };

  const handleSubmit = async () => {
    if (!formData.closure_type) {
      setError('Please select a closure type');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onSave(formData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save closure');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        Closure Documentation
      </Typography>

      {defectSizeMm && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Final defect size: {defectSizeMm}mm
          {tumorLocation && ` at ${tumorLocation}`}
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Closure Type */}
        <Grid item xs={12} md={6}>
          <FormControl fullWidth>
            <InputLabel>Closure Type *</InputLabel>
            <Select
              value={formData.closure_type}
              label="Closure Type *"
              onChange={(e) => updateField('closure_type', e.target.value)}
            >
              {CLOSURE_TYPES.map((type) => (
                <MenuItem key={type.value} value={type.value}>
                  <Box>
                    <Typography>{type.label}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {type.group}
                    </Typography>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>

        <Grid item xs={12} md={6}>
          <TextField
            label="Subtype/Variant"
            value={formData.closure_subtype}
            onChange={(e) => updateField('closure_subtype', e.target.value)}
            fullWidth
            placeholder="e.g., V-Y advancement, Rhomboid"
          />
        </Grid>

        {/* Repair Dimensions */}
        <Grid item xs={12}>
          <Typography variant="subtitle2" gutterBottom>
            Repair Dimensions
          </Typography>
        </Grid>

        <Grid item xs={12} sm={4}>
          <TextField
            label="Length (cm)"
            value={formData.repair_length_cm}
            onChange={(e) => updateField('repair_length_cm', e.target.value)}
            fullWidth
            type="number"
            inputProps={{ step: 0.1, min: 0 }}
          />
        </Grid>

        <Grid item xs={12} sm={4}>
          <TextField
            label="Width (cm)"
            value={formData.repair_width_cm}
            onChange={(e) => updateField('repair_width_cm', e.target.value)}
            fullWidth
            type="number"
            inputProps={{ step: 0.1, min: 0 }}
          />
        </Grid>

        <Grid item xs={12} sm={4}>
          <TextField
            label="Area (sq cm)"
            value={formData.repair_area_sq_cm}
            onChange={(e) => updateField('repair_area_sq_cm', e.target.value)}
            fullWidth
            type="number"
            inputProps={{ step: 0.01, min: 0 }}
          />
        </Grid>

        {/* Flap-specific fields */}
        {isFlap && (
          <>
            <Grid item xs={12}>
              <Divider>
                <Chip label="Flap Details" size="small" />
              </Divider>
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                label="Flap Type"
                value={formData.flap_type || ''}
                onChange={(e) => updateField('flap_type', e.target.value)}
                fullWidth
                placeholder="e.g., unilateral, bilateral"
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                label="Pedicle Width (cm)"
                value={formData.pedicle_width || ''}
                onChange={(e) => updateField('pedicle_width', e.target.value)}
                fullWidth
                type="number"
                inputProps={{ step: 0.1, min: 0 }}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                label="Arc of Rotation"
                value={formData.arc_of_rotation || ''}
                onChange={(e) => updateField('arc_of_rotation', e.target.value)}
                fullWidth
                placeholder="e.g., 90 degrees"
              />
            </Grid>
          </>
        )}

        {/* Graft-specific fields */}
        {isGraft && (
          <>
            <Grid item xs={12}>
              <Divider>
                <Chip label="Graft Details" size="small" />
              </Divider>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Donor Site"
                value={formData.donor_site || ''}
                onChange={(e) => updateField('donor_site', e.target.value)}
                fullWidth
                placeholder="e.g., preauricular, supraclavicular"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Graft Thickness"
                value={formData.graft_thickness || ''}
                onChange={(e) => updateField('graft_thickness', e.target.value)}
                fullWidth
                placeholder="Full thickness or Split thickness"
              />
            </Grid>
          </>
        )}

        {/* CPT Codes */}
        <Grid item xs={12}>
          <Autocomplete
            multiple
            options={REPAIR_CPT_CODES}
            getOptionLabel={(option) => `${option.code} - ${option.description}`}
            value={REPAIR_CPT_CODES.filter((c) => formData.repair_cpt_codes.includes(c.code))}
            onChange={(_, newValue) => {
              updateField('repair_cpt_codes', newValue.map((v) => v.code));
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Repair CPT Codes"
                placeholder="Select applicable codes"
              />
            )}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => {
                const { key, ...tagProps } = getTagProps({ index });
                return (
                  <Chip
                    key={key}
                    label={option.code}
                    size="small"
                    {...tagProps}
                  />
                );
              })
            }
          />
        </Grid>

        {/* Suture Information */}
        <Grid item xs={12}>
          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle2">Suture Information</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <TextField
                    label="Number of Layers"
                    value={formData.suture_layers}
                    onChange={(e) => updateField('suture_layers', e.target.value)}
                    fullWidth
                    type="number"
                    inputProps={{ min: 1, max: 5 }}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Autocomplete
                    options={SUTURE_MATERIALS}
                    value={formData.deep_sutures}
                    onChange={(_, newValue) => updateField('deep_sutures', newValue || '')}
                    renderInput={(params) => (
                      <TextField {...params} label="Deep Sutures" />
                    )}
                    freeSolo
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Autocomplete
                    options={SUTURE_MATERIALS}
                    value={formData.superficial_sutures}
                    onChange={(_, newValue) => updateField('superficial_sutures', newValue || '')}
                    renderInput={(params) => (
                      <TextField {...params} label="Superficial Sutures" />
                    )}
                    freeSolo
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Suture Removal (days)"
                    value={formData.suture_removal_days}
                    onChange={(e) => updateField('suture_removal_days', e.target.value)}
                    fullWidth
                    type="number"
                    inputProps={{ min: 0, max: 30 }}
                  />
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>
        </Grid>

        {/* Dressing */}
        <Grid item xs={12} sm={6}>
          <Autocomplete
            options={DRESSING_TYPES}
            value={formData.dressing_type}
            onChange={(_, newValue) => updateField('dressing_type', newValue || '')}
            renderInput={(params) => (
              <TextField {...params} label="Dressing Type" />
            )}
            freeSolo
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <FormControlLabel
            control={
              <Checkbox
                checked={formData.pressure_dressing}
                onChange={(e) => updateField('pressure_dressing', e.target.checked)}
              />
            }
            label="Pressure Dressing Applied"
          />
        </Grid>

        {/* Notes */}
        <Grid item xs={12}>
          <TextField
            label="Closure Notes"
            value={formData.closure_notes}
            onChange={(e) => updateField('closure_notes', e.target.value)}
            fullWidth
            multiline
            rows={3}
            placeholder="Document any relevant details about the closure..."
          />
        </Grid>

        <Grid item xs={12}>
          <TextField
            label="Technique Notes"
            value={formData.technique_notes}
            onChange={(e) => updateField('technique_notes', e.target.value)}
            fullWidth
            multiline
            rows={3}
            placeholder="Describe the surgical technique used..."
          />
        </Grid>
      </Grid>

      <Divider sx={{ my: 3 }} />

      {/* Actions */}
      <Box display="flex" justifyContent="flex-end" gap={2}>
        {onCancel && (
          <Button onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        )}
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={handleSubmit}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Document Closure'}
        </Button>
      </Box>
    </Paper>
  );
};

export default ClosureForm;
