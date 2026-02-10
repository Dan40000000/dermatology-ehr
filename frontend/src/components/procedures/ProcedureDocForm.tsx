/**
 * ProcedureDocForm - Main Procedure Documentation Form
 * Handles all dermatology procedure types with dynamic form sections
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
  TextField,
  MenuItem,
  Grid,
  FormControl,
  InputLabel,
  Select,
  Typography,
  Divider,
  Alert,
  FormControlLabel,
  Checkbox,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
  CircularProgress,
  type SelectChangeEvent
} from '@mui/material';
import toast from 'react-hot-toast';
import { CryotherapyForm } from './CryotherapyForm';
import { BiopsyForm } from './BiopsyForm';
import { ExcisionForm } from './ExcisionForm';
import { BodyLocationPicker } from './BodyLocationPicker';
import { ProcedureNote } from './ProcedureNote';

// ============================================
// TYPES
// ============================================

export type ProcedureType =
  | 'cryotherapy'
  | 'shave_biopsy'
  | 'punch_biopsy'
  | 'excision'
  | 'incision_drainage';

export interface ProcedureFormData {
  encounter_id: string;
  patient_id: string;
  template_id?: string;
  procedure_type: ProcedureType;
  procedure_name?: string;
  body_location: string;
  body_location_code?: string;
  laterality?: 'left' | 'right' | 'bilateral' | 'midline';
  lesion_description?: string;
  lesion_size_mm?: number;
  lesion_type?: string;
  size_mm?: number;
  depth?: string;
  dimensions_length_mm?: number;
  dimensions_width_mm?: number;
  dimensions_depth_mm?: number;
  anesthesia_type?: string;
  anesthesia_agent?: string;
  anesthesia_concentration?: string;
  anesthesia_with_epinephrine?: boolean;
  anesthesia_volume_ml?: number;
  documentation: Record<string, unknown>;
  hemostasis_method?: string;
  hemostasis_details?: string;
  closure_type?: string;
  suture_type?: string;
  suture_size?: string;
  suture_count?: number;
  complications?: string[];
  complication_details?: string;
  specimen_sent?: boolean;
  specimen_container?: string;
  specimen_label?: string;
  margins_taken_mm?: number;
  margins_peripheral_mm?: number;
  margins_deep_mm?: number;
  patient_instructions_given?: boolean;
  wound_care_handout_provided?: boolean;
  follow_up_instructions?: string;
  performing_provider_id: string;
  assistant_id?: string;
  cpt_code?: string;
  cpt_modifier?: string;
  units?: number;
  procedure_start_time?: string;
  procedure_end_time?: string;
  supplies?: Array<{
    supply_name: string;
    quantity: number;
    lot_number?: string;
    inventory_item_id?: string;
  }>;
}

interface ProcedureDocFormProps {
  patientId: string;
  encounterId: string;
  providerId: string;
  onSuccess: (procedureId: string) => void;
  onCancel: () => void;
  initialProcedureType?: ProcedureType;
}

interface ProcedureTemplate {
  id: string;
  name: string;
  procedure_type: ProcedureType;
  cpt_codes: string[];
  template_sections: {
    sections: Array<{
      name: string;
      label: string;
      fields: string[];
    }>;
  };
  default_values: Record<string, unknown>;
}

interface Provider {
  id: string;
  first_name: string;
  last_name: string;
}

// ============================================
// CONSTANTS
// ============================================

const PROCEDURE_TYPES: { value: ProcedureType; label: string }[] = [
  { value: 'cryotherapy', label: 'Cryotherapy' },
  { value: 'shave_biopsy', label: 'Shave Biopsy' },
  { value: 'punch_biopsy', label: 'Punch Biopsy' },
  { value: 'excision', label: 'Excision' },
  { value: 'incision_drainage', label: 'Incision & Drainage' }
];

const ANESTHESIA_TYPES = [
  { value: 'none', label: 'None' },
  { value: 'local', label: 'Local' },
  { value: 'topical', label: 'Topical' }
];

const ANESTHESIA_AGENTS = [
  { value: 'lidocaine', label: 'Lidocaine' },
  { value: 'bupivacaine', label: 'Bupivacaine' },
  { value: 'prilocaine', label: 'Prilocaine' }
];

const ANESTHESIA_CONCENTRATIONS = ['0.5%', '1%', '2%'];

const HEMOSTASIS_METHODS = [
  { value: 'aluminum_chloride', label: 'Aluminum Chloride' },
  { value: 'electrocautery', label: 'Electrocautery' },
  { value: 'pressure', label: 'Pressure' },
  { value: 'suture', label: 'Suture Ligation' },
  { value: 'ferric_subsulfate', label: 'Ferric Subsulfate' }
];

const COMMON_COMPLICATIONS = [
  'Bleeding',
  'Infection',
  'Scarring',
  'Incomplete removal',
  'Nerve damage',
  'Allergic reaction'
];

// ============================================
// COMPONENT
// ============================================

export const ProcedureDocForm: React.FC<ProcedureDocFormProps> = ({
  patientId,
  encounterId,
  providerId,
  onSuccess,
  onCancel,
  initialProcedureType
}) => {
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [templates, setTemplates] = useState<ProcedureTemplate[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [showNotePreview, setShowNotePreview] = useState(false);
  const [generatedNote, setGeneratedNote] = useState<string>('');
  const [savedProcedureId, setSavedProcedureId] = useState<string | null>(null);

  const [formData, setFormData] = useState<ProcedureFormData>({
    encounter_id: encounterId,
    patient_id: patientId,
    procedure_type: initialProcedureType || 'shave_biopsy',
    body_location: '',
    performing_provider_id: providerId,
    documentation: {},
    anesthesia_type: 'local',
    anesthesia_agent: 'lidocaine',
    anesthesia_concentration: '1%',
    anesthesia_with_epinephrine: true,
    hemostasis_method: 'aluminum_chloride',
    patient_instructions_given: true,
    specimen_sent: true,
    complications: [],
    supplies: []
  });

  // Fetch templates and providers on mount
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [templatesRes, providersRes] = await Promise.all([
          fetch('/api/procedure-templates', {
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
          }),
          fetch('/api/providers', {
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
          })
        ]);

        if (templatesRes.ok) {
          const data = await templatesRes.json();
          setTemplates(data.templates || []);
        }

        if (providersRes.ok) {
          const data = await providersRes.json();
          setProviders(data.providers || data || []);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Apply template defaults when procedure type changes
  useEffect(() => {
    const template = templates.find(t => t.procedure_type === formData.procedure_type);
    if (template?.default_values) {
      setFormData(prev => ({
        ...prev,
        template_id: template.id,
        ...template.default_values,
        documentation: {
          ...prev.documentation,
          ...(template.default_values as Record<string, unknown>)
        }
      }));
    }
  }, [formData.procedure_type, templates]);

  const handleInputChange = useCallback((
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  }, []);

  const handleCheckboxChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: checked }));
  }, []);

  const handleNumberChange = useCallback((name: string, value: number | undefined) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  }, []);

  const handleDocumentationChange = useCallback((updates: Record<string, unknown>) => {
    setFormData(prev => ({
      ...prev,
      documentation: { ...prev.documentation, ...updates }
    }));
  }, []);

  const handleLocationSelect = useCallback((location: { code: string; name: string; laterality?: string }) => {
    setFormData(prev => ({
      ...prev,
      body_location: location.name,
      body_location_code: location.code,
      laterality: location.laterality as ProcedureFormData['laterality']
    }));
    setShowLocationPicker(false);
  }, []);

  const handleComplicationToggle = useCallback((complication: string) => {
    setFormData(prev => {
      const complications = prev.complications || [];
      const exists = complications.includes(complication);
      return {
        ...prev,
        complications: exists
          ? complications.filter(c => c !== complication)
          : [...complications, complication]
      };
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.body_location) {
      toast.error('Please select a body location');
      return;
    }

    if (!formData.performing_provider_id) {
      toast.error('Please select a performing provider');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/procedures/document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to document procedure');
      }

      const result = await response.json();
      setSavedProcedureId(result.id);
      toast.success('Procedure documented successfully');
      onSuccess(result.id);
    } catch (error) {
      console.error('Error documenting procedure:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to document procedure');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateNote = async () => {
    if (!savedProcedureId) {
      toast.error('Please save the procedure first');
      return;
    }

    try {
      const response = await fetch(`/api/procedures/${savedProcedureId}/generate-note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to generate note');
      }

      const result = await response.json();
      setGeneratedNote(result.note);
      setShowNotePreview(true);
    } catch (error) {
      console.error('Error generating note:', error);
      toast.error('Failed to generate procedure note');
    }
  };

  const renderProcedureSpecificFields = () => {
    switch (formData.procedure_type) {
      case 'cryotherapy':
        return (
          <CryotherapyForm
            documentation={formData.documentation}
            onChange={handleDocumentationChange}
            lesionType={formData.lesion_type}
            lesionSize={formData.lesion_size_mm}
            onLesionTypeChange={(value) => setFormData(prev => ({ ...prev, lesion_type: value }))}
            onLesionSizeChange={(value) => handleNumberChange('lesion_size_mm', value)}
          />
        );

      case 'shave_biopsy':
      case 'punch_biopsy':
        return (
          <BiopsyForm
            procedureType={formData.procedure_type}
            documentation={formData.documentation}
            onChange={handleDocumentationChange}
            depth={formData.depth}
            onDepthChange={(value) => setFormData(prev => ({ ...prev, depth: value }))}
            specimenSent={formData.specimen_sent}
            onSpecimenSentChange={(value) => setFormData(prev => ({ ...prev, specimen_sent: value }))}
            punchSize={formData.size_mm}
            onPunchSizeChange={(value) => handleNumberChange('size_mm', value)}
            closureType={formData.closure_type}
            onClosureTypeChange={(value) => setFormData(prev => ({ ...prev, closure_type: value }))}
            sutureType={formData.suture_type}
            onSutureTypeChange={(value) => setFormData(prev => ({ ...prev, suture_type: value }))}
            sutureSize={formData.suture_size}
            onSutureSizeChange={(value) => setFormData(prev => ({ ...prev, suture_size: value }))}
            sutureCount={formData.suture_count}
            onSutureCountChange={(value) => handleNumberChange('suture_count', value)}
          />
        );

      case 'excision':
        return (
          <ExcisionForm
            documentation={formData.documentation}
            onChange={handleDocumentationChange}
            lesionSize={formData.lesion_size_mm}
            onLesionSizeChange={(value) => handleNumberChange('lesion_size_mm', value)}
            marginsPlanned={formData.margins_taken_mm}
            onMarginsPlannedChange={(value) => handleNumberChange('margins_taken_mm', value)}
            dimensionsLength={formData.dimensions_length_mm}
            onDimensionsLengthChange={(value) => handleNumberChange('dimensions_length_mm', value)}
            dimensionsWidth={formData.dimensions_width_mm}
            onDimensionsWidthChange={(value) => handleNumberChange('dimensions_width_mm', value)}
            dimensionsDepth={formData.dimensions_depth_mm}
            onDimensionsDepthChange={(value) => handleNumberChange('dimensions_depth_mm', value)}
            closureType={formData.closure_type}
            onClosureTypeChange={(value) => setFormData(prev => ({ ...prev, closure_type: value }))}
            sutureType={formData.suture_type}
            onSutureTypeChange={(value) => setFormData(prev => ({ ...prev, suture_type: value }))}
            sutureSize={formData.suture_size}
            onSutureSizeChange={(value) => setFormData(prev => ({ ...prev, suture_size: value }))}
            sutureCount={formData.suture_count}
            onSutureCountChange={(value) => handleNumberChange('suture_count', value)}
            specimenSent={formData.specimen_sent}
            onSpecimenSentChange={(value) => setFormData(prev => ({ ...prev, specimen_sent: value }))}
          />
        );

      case 'incision_drainage':
        return (
          <Box>
            <Typography variant="subtitle2" gutterBottom>Abscess Details</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Abscess Size (mm)"
                  type="number"
                  value={formData.size_mm || ''}
                  onChange={(e) => handleNumberChange('size_mm', e.target.value ? Number(e.target.value) : undefined)}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Duration"
                  value={(formData.documentation.duration as string) || ''}
                  onChange={(e) => handleDocumentationChange({ duration: e.target.value })}
                  placeholder="e.g., 3 days"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Symptoms"
                  multiline
                  rows={2}
                  value={(formData.documentation.symptoms as string) || ''}
                  onChange={(e) => handleDocumentationChange({ symptoms: e.target.value })}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Incision Size (mm)"
                  type="number"
                  value={(formData.documentation.incision_size_mm as number) || ''}
                  onChange={(e) => handleDocumentationChange({
                    incision_size_mm: e.target.value ? Number(e.target.value) : undefined
                  })}
                />
              </Grid>
              <Grid item xs={12}>
                <Typography variant="subtitle2" gutterBottom>Drainage</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Drainage Description"
                  value={(formData.documentation.drainage_description as string) || ''}
                  onChange={(e) => handleDocumentationChange({ drainage_description: e.target.value })}
                  placeholder="e.g., Purulent material"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Drainage Amount (mL)"
                  type="number"
                  value={(formData.documentation.drainage_amount_ml as number) || ''}
                  onChange={(e) => handleDocumentationChange({
                    drainage_amount_ml: e.target.value ? Number(e.target.value) : undefined
                  })}
                />
              </Grid>
              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={(formData.documentation.culture_sent as boolean) || false}
                      onChange={(e) => handleDocumentationChange({ culture_sent: e.target.checked })}
                    />
                  }
                  label="Culture Sent"
                />
              </Grid>
              <Grid item xs={12}>
                <Typography variant="subtitle2" gutterBottom>Packing</Typography>
              </Grid>
              <Grid item xs={12} sm={4}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={(formData.documentation.packing_used as boolean) || false}
                      onChange={(e) => handleDocumentationChange({ packing_used: e.target.checked })}
                    />
                  }
                  label="Packing Used"
                />
              </Grid>
              {formData.documentation.packing_used && (
                <>
                  <Grid item xs={12} sm={4}>
                    <FormControl fullWidth>
                      <InputLabel>Packing Type</InputLabel>
                      <Select
                        value={(formData.documentation.packing_type as string) || ''}
                        label="Packing Type"
                        onChange={(e) => handleDocumentationChange({ packing_type: e.target.value })}
                      >
                        <MenuItem value="iodoform_gauze">Iodoform Gauze</MenuItem>
                        <MenuItem value="plain_gauze">Plain Gauze</MenuItem>
                        <MenuItem value="nu_gauze">Nu-Gauze</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      label="Packing Length (cm)"
                      type="number"
                      value={(formData.documentation.packing_length_cm as number) || ''}
                      onChange={(e) => handleDocumentationChange({
                        packing_length_cm: e.target.value ? Number(e.target.value) : undefined
                      })}
                    />
                  </Grid>
                </>
              )}
            </Grid>
          </Box>
        );

      default:
        return null;
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box component="form" onSubmit={handleSubmit}>
      <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)} sx={{ mb: 3 }}>
        <Tab label="Procedure Details" />
        <Tab label="Anesthesia & Hemostasis" />
        <Tab label="Closure & Wound Care" />
      </Tabs>

      {activeTab === 0 && (
        <Box>
          <Grid container spacing={3}>
            {/* Procedure Type Selection */}
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth required>
                <InputLabel>Procedure Type</InputLabel>
                <Select
                  name="procedure_type"
                  value={formData.procedure_type}
                  label="Procedure Type"
                  onChange={handleInputChange}
                >
                  {PROCEDURE_TYPES.map(type => (
                    <MenuItem key={type.value} value={type.value}>
                      {type.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Provider Selection */}
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth required>
                <InputLabel>Performing Provider</InputLabel>
                <Select
                  name="performing_provider_id"
                  value={formData.performing_provider_id}
                  label="Performing Provider"
                  onChange={handleInputChange}
                >
                  {providers.map(provider => (
                    <MenuItem key={provider.id} value={provider.id}>
                      {provider.first_name} {provider.last_name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Body Location */}
            <Grid item xs={12}>
              <Box display="flex" alignItems="center" gap={2}>
                <TextField
                  fullWidth
                  required
                  label="Body Location"
                  name="body_location"
                  value={formData.body_location}
                  onChange={handleInputChange}
                  InputProps={{
                    readOnly: true
                  }}
                  onClick={() => setShowLocationPicker(true)}
                  placeholder="Click to select location"
                />
                <Button
                  variant="outlined"
                  onClick={() => setShowLocationPicker(true)}
                >
                  Select
                </Button>
              </Box>
            </Grid>

            {/* Laterality */}
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Laterality</InputLabel>
                <Select
                  name="laterality"
                  value={formData.laterality || ''}
                  label="Laterality"
                  onChange={handleInputChange}
                >
                  <MenuItem value="">Not Applicable</MenuItem>
                  <MenuItem value="left">Left</MenuItem>
                  <MenuItem value="right">Right</MenuItem>
                  <MenuItem value="bilateral">Bilateral</MenuItem>
                  <MenuItem value="midline">Midline</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {/* Lesion Description */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Lesion Description"
                name="lesion_description"
                value={formData.lesion_description || ''}
                onChange={handleInputChange}
                multiline
                rows={2}
              />
            </Grid>

            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
            </Grid>

            {/* Procedure-Specific Fields */}
            <Grid item xs={12}>
              {renderProcedureSpecificFields()}
            </Grid>
          </Grid>
        </Box>
      )}

      {activeTab === 1 && (
        <Box>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>Anesthesia</Typography>
            </Grid>

            <Grid item xs={12} sm={4}>
              <FormControl fullWidth>
                <InputLabel>Anesthesia Type</InputLabel>
                <Select
                  name="anesthesia_type"
                  value={formData.anesthesia_type || ''}
                  label="Anesthesia Type"
                  onChange={handleInputChange}
                >
                  {ANESTHESIA_TYPES.map(type => (
                    <MenuItem key={type.value} value={type.value}>
                      {type.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {formData.anesthesia_type === 'local' && (
              <>
                <Grid item xs={12} sm={4}>
                  <FormControl fullWidth>
                    <InputLabel>Anesthetic Agent</InputLabel>
                    <Select
                      name="anesthesia_agent"
                      value={formData.anesthesia_agent || ''}
                      label="Anesthetic Agent"
                      onChange={handleInputChange}
                    >
                      {ANESTHESIA_AGENTS.map(agent => (
                        <MenuItem key={agent.value} value={agent.value}>
                          {agent.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} sm={4}>
                  <FormControl fullWidth>
                    <InputLabel>Concentration</InputLabel>
                    <Select
                      name="anesthesia_concentration"
                      value={formData.anesthesia_concentration || ''}
                      label="Concentration"
                      onChange={handleInputChange}
                    >
                      {ANESTHESIA_CONCENTRATIONS.map(conc => (
                        <MenuItem key={conc} value={conc}>
                          {conc}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        name="anesthesia_with_epinephrine"
                        checked={formData.anesthesia_with_epinephrine || false}
                        onChange={handleCheckboxChange}
                      />
                    }
                    label="With Epinephrine"
                  />
                </Grid>

                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Volume (mL)"
                    type="number"
                    value={formData.anesthesia_volume_ml || ''}
                    onChange={(e) => handleNumberChange('anesthesia_volume_ml',
                      e.target.value ? Number(e.target.value) : undefined)}
                    inputProps={{ step: 0.1, min: 0 }}
                  />
                </Grid>
              </>
            )}

            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <Typography variant="h6" gutterBottom>Hemostasis</Typography>
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Hemostasis Method</InputLabel>
                <Select
                  name="hemostasis_method"
                  value={formData.hemostasis_method || ''}
                  label="Hemostasis Method"
                  onChange={handleInputChange}
                >
                  {HEMOSTASIS_METHODS.map(method => (
                    <MenuItem key={method.value} value={method.value}>
                      {method.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Hemostasis Details"
                name="hemostasis_details"
                value={formData.hemostasis_details || ''}
                onChange={handleInputChange}
                multiline
                rows={2}
              />
            </Grid>

            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <Typography variant="h6" gutterBottom>Complications</Typography>
            </Grid>

            <Grid item xs={12}>
              <Box display="flex" flexWrap="wrap" gap={1}>
                {COMMON_COMPLICATIONS.map(complication => (
                  <Button
                    key={complication}
                    variant={formData.complications?.includes(complication) ? 'contained' : 'outlined'}
                    size="small"
                    color={formData.complications?.includes(complication) ? 'error' : 'inherit'}
                    onClick={() => handleComplicationToggle(complication)}
                  >
                    {complication}
                  </Button>
                ))}
              </Box>
            </Grid>

            {formData.complications && formData.complications.length > 0 && (
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Complication Details"
                  name="complication_details"
                  value={formData.complication_details || ''}
                  onChange={handleInputChange}
                  multiline
                  rows={2}
                />
              </Grid>
            )}

            {(!formData.complications || formData.complications.length === 0) && (
              <Grid item xs={12}>
                <Alert severity="success">No complications noted</Alert>
              </Grid>
            )}
          </Grid>
        </Box>
      )}

      {activeTab === 2 && (
        <Box>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>Patient Instructions</Typography>
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={
                  <Checkbox
                    name="patient_instructions_given"
                    checked={formData.patient_instructions_given || false}
                    onChange={handleCheckboxChange}
                  />
                }
                label="Patient Instructions Given"
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={
                  <Checkbox
                    name="wound_care_handout_provided"
                    checked={formData.wound_care_handout_provided || false}
                    onChange={handleCheckboxChange}
                  />
                }
                label="Wound Care Handout Provided"
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Follow-up Instructions"
                name="follow_up_instructions"
                value={formData.follow_up_instructions || ''}
                onChange={handleInputChange}
                multiline
                rows={3}
                placeholder="e.g., Return in 7-10 days for suture removal..."
              />
            </Grid>

            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <Typography variant="h6" gutterBottom>Billing</Typography>
            </Grid>

            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="CPT Code"
                name="cpt_code"
                value={formData.cpt_code || ''}
                onChange={handleInputChange}
              />
            </Grid>

            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Modifier"
                name="cpt_modifier"
                value={formData.cpt_modifier || ''}
                onChange={handleInputChange}
              />
            </Grid>

            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Units"
                type="number"
                value={formData.units || 1}
                onChange={(e) => handleNumberChange('units', e.target.value ? Number(e.target.value) : undefined)}
                inputProps={{ min: 1 }}
              />
            </Grid>
          </Grid>
        </Box>
      )}

      {/* Form Actions */}
      <Box display="flex" justifyContent="flex-end" gap={2} mt={4}>
        <Button variant="outlined" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        {savedProcedureId && (
          <Button variant="outlined" onClick={handleGenerateNote} disabled={submitting}>
            Preview Note
          </Button>
        )}
        <Button type="submit" variant="contained" disabled={submitting}>
          {submitting ? <CircularProgress size={24} /> : 'Save Procedure'}
        </Button>
      </Box>

      {/* Body Location Picker Dialog */}
      <Dialog
        open={showLocationPicker}
        onClose={() => setShowLocationPicker(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Select Body Location</DialogTitle>
        <DialogContent>
          <BodyLocationPicker onSelect={handleLocationSelect} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowLocationPicker(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>

      {/* Note Preview Dialog */}
      <Dialog
        open={showNotePreview}
        onClose={() => setShowNotePreview(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Procedure Note Preview</DialogTitle>
        <DialogContent>
          <ProcedureNote note={generatedNote} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowNotePreview(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ProcedureDocForm;
