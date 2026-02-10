/**
 * IntakeFormBuilder - Admin interface for creating and editing intake form templates
 * Allows administrators to customize sections, fields, and conditional logic
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  TextField,
  Button,
  IconButton,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Switch,
  FormControlLabel,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Paper,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  DragIndicator as DragIcon,
  ExpandMore as ExpandMoreIcon,
  Edit as EditIcon,
  ContentCopy as CopyIcon,
  Save as SaveIcon,
  Preview as PreviewIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE_URL, TENANT_HEADER_NAME } from '../../api';
import toast from 'react-hot-toast';

// Types
interface FieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'checkbox_group' | 'date' | 'phone' | 'email' | 'state_select' | 'number';
  required: boolean;
  options?: string[];
  placeholder?: string;
  auto_populate?: boolean;
  conditional?: {
    field: string;
    equals: string | boolean;
  };
}

interface Section {
  id?: string;
  sectionName: string;
  sectionKey: string;
  sectionOrder: number;
  title: string;
  description?: string;
  instructions?: string;
  fields: FieldDefinition[];
  isRequired: boolean;
  isRepeatable: boolean;
  maxRepeats?: number;
}

interface Template {
  id?: string;
  name: string;
  description?: string;
  formType: 'new_patient' | 'returning' | 'procedure_specific';
  procedureType?: string;
  isActive: boolean;
  isDefault: boolean;
  sendDaysBeforeAppointment: number;
  dueHoursBeforeAppointment: number;
}

// Field type options
const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Multi-line Text' },
  { value: 'select', label: 'Dropdown' },
  { value: 'radio', label: 'Radio Buttons' },
  { value: 'checkbox', label: 'Checkbox (Yes/No)' },
  { value: 'checkbox_group', label: 'Checkbox Group' },
  { value: 'date', label: 'Date' },
  { value: 'phone', label: 'Phone Number' },
  { value: 'email', label: 'Email' },
  { value: 'state_select', label: 'State Selector' },
  { value: 'number', label: 'Number' },
];

interface IntakeFormBuilderProps {
  templateId?: string;
  onSave?: (templateId: string) => void;
  onCancel?: () => void;
}

export const IntakeFormBuilder: React.FC<IntakeFormBuilderProps> = ({
  templateId,
  onSave,
  onCancel,
}) => {
  const { tenantId, accessToken } = useAuth();
  const [template, setTemplate] = useState<Template>({
    name: '',
    description: '',
    formType: 'new_patient',
    isActive: true,
    isDefault: false,
    sendDaysBeforeAppointment: 3,
    dueHoursBeforeAppointment: 24,
  });
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | false>(false);
  const [fieldDialog, setFieldDialog] = useState<{
    open: boolean;
    sectionIndex: number;
    fieldIndex?: number;
    field?: FieldDefinition;
  }>({ open: false, sectionIndex: -1 });

  // Fetch template if editing
  const fetchTemplate = useCallback(async () => {
    if (!templateId || !tenantId || !accessToken) return;

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/intake-forms/templates/${templateId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          [TENANT_HEADER_NAME]: tenantId,
        },
      });

      if (!response.ok) throw new Error('Failed to fetch template');

      const data = await response.json();
      setTemplate({
        id: data.template.id,
        name: data.template.name,
        description: data.template.description,
        formType: data.template.form_type,
        procedureType: data.template.procedure_type,
        isActive: data.template.is_active,
        isDefault: data.template.is_default,
        sendDaysBeforeAppointment: data.template.send_days_before_appointment,
        dueHoursBeforeAppointment: data.template.due_hours_before_appointment,
      });
      setSections(
        data.sections.map((s: Record<string, unknown>) => ({
          id: s.id,
          sectionName: s.section_name,
          sectionKey: s.section_key,
          sectionOrder: s.section_order,
          title: s.title,
          description: s.description,
          instructions: s.instructions,
          fields: s.fields,
          isRequired: s.is_required,
          isRepeatable: s.is_repeatable,
          maxRepeats: s.max_repeats,
        }))
      );
    } catch (error) {
      console.error('Error fetching template:', error);
      toast.error('Failed to load template');
    } finally {
      setLoading(false);
    }
  }, [templateId, tenantId, accessToken]);

  useEffect(() => {
    fetchTemplate();
  }, [fetchTemplate]);

  // Save template
  const handleSave = async () => {
    if (!tenantId || !accessToken) return;
    if (!template.name.trim()) {
      toast.error('Template name is required');
      return;
    }

    setLoading(true);
    try {
      const method = template.id ? 'PUT' : 'POST';
      const url = template.id
        ? `${API_BASE_URL}/api/intake-forms/templates/${template.id}`
        : `${API_BASE_URL}/api/intake-forms/templates`;

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          [TENANT_HEADER_NAME]: tenantId,
        },
        body: JSON.stringify({
          name: template.name,
          description: template.description,
          formType: template.formType,
          procedureType: template.procedureType,
          isDefault: template.isDefault,
          sendDaysBeforeAppointment: template.sendDaysBeforeAppointment,
          dueHoursBeforeAppointment: template.dueHoursBeforeAppointment,
        }),
      });

      if (!response.ok) throw new Error('Failed to save template');

      const data = await response.json();
      toast.success('Template saved successfully');
      onSave?.(data.id);
    } catch (error) {
      console.error('Error saving template:', error);
      toast.error('Failed to save template');
    } finally {
      setLoading(false);
    }
  };

  // Create default template with all dermatology sections
  const handleCreateDefault = async () => {
    if (!tenantId || !accessToken) return;

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/intake-forms/templates/default`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          [TENANT_HEADER_NAME]: tenantId,
        },
        body: JSON.stringify({ formType: template.formType }),
      });

      if (!response.ok) throw new Error('Failed to create default template');

      const data = await response.json();
      toast.success('Default template created with all dermatology sections');
      onSave?.(data.id);
    } catch (error) {
      console.error('Error creating default template:', error);
      toast.error('Failed to create default template');
    } finally {
      setLoading(false);
    }
  };

  // Add new section
  const handleAddSection = () => {
    const newSection: Section = {
      sectionName: `Section ${sections.length + 1}`,
      sectionKey: `section_${sections.length + 1}`,
      sectionOrder: sections.length,
      title: '',
      description: '',
      fields: [],
      isRequired: true,
      isRepeatable: false,
    };
    setSections([...sections, newSection]);
    setExpandedSection(`section-${sections.length}`);
  };

  // Delete section
  const handleDeleteSection = (index: number) => {
    const updated = sections.filter((_, i) => i !== index);
    setSections(updated.map((s, i) => ({ ...s, sectionOrder: i })));
  };

  // Update section
  const handleUpdateSection = (index: number, updates: Partial<Section>) => {
    const updated = [...sections];
    updated[index] = { ...updated[index], ...updates };
    setSections(updated);
  };

  // Add field to section
  const handleAddField = (sectionIndex: number) => {
    setFieldDialog({
      open: true,
      sectionIndex,
      field: {
        key: '',
        label: '',
        type: 'text',
        required: false,
      },
    });
  };

  // Save field
  const handleSaveField = (field: FieldDefinition) => {
    const { sectionIndex, fieldIndex } = fieldDialog;
    const updated = [...sections];

    if (fieldIndex !== undefined) {
      updated[sectionIndex].fields[fieldIndex] = field;
    } else {
      updated[sectionIndex].fields.push(field);
    }

    setSections(updated);
    setFieldDialog({ open: false, sectionIndex: -1 });
  };

  // Delete field
  const handleDeleteField = (sectionIndex: number, fieldIndex: number) => {
    const updated = [...sections];
    updated[sectionIndex].fields.splice(fieldIndex, 1);
    setSections(updated);
  };

  return (
    <Box>
      {/* Template Settings */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Template Settings
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Template Name"
                value={template.name}
                onChange={(e) => setTemplate({ ...template, name: e.target.value })}
                required
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Form Type</InputLabel>
                <Select
                  value={template.formType}
                  label="Form Type"
                  onChange={(e) => setTemplate({ ...template, formType: e.target.value as Template['formType'] })}
                >
                  <MenuItem value="new_patient">New Patient</MenuItem>
                  <MenuItem value="returning">Returning Patient</MenuItem>
                  <MenuItem value="procedure_specific">Procedure-Specific</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Description"
                value={template.description || ''}
                onChange={(e) => setTemplate({ ...template, description: e.target.value })}
                multiline
                rows={2}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                label="Send Days Before Appointment"
                type="number"
                value={template.sendDaysBeforeAppointment}
                onChange={(e) => setTemplate({ ...template, sendDaysBeforeAppointment: parseInt(e.target.value) || 0 })}
                InputProps={{ inputProps: { min: 0, max: 30 } }}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                label="Due Hours Before Appointment"
                type="number"
                value={template.dueHoursBeforeAppointment}
                onChange={(e) => setTemplate({ ...template, dueHoursBeforeAppointment: parseInt(e.target.value) || 0 })}
                InputProps={{ inputProps: { min: 0, max: 168 } }}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControlLabel
                control={
                  <Switch
                    checked={template.isDefault}
                    onChange={(e) => setTemplate({ ...template, isDefault: e.target.checked })}
                  />
                }
                label="Default Template"
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControlLabel
                control={
                  <Switch
                    checked={template.isActive}
                    onChange={(e) => setTemplate({ ...template, isActive: e.target.checked })}
                  />
                }
                label="Active"
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Create Default Button */}
      {!templateId && sections.length === 0 && (
        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Would you like to create a template with all standard dermatology intake sections?
          </Typography>
          <Button
            variant="contained"
            color="primary"
            onClick={handleCreateDefault}
            disabled={loading}
          >
            Create Default Template
          </Button>
        </Alert>
      )}

      {/* Sections */}
      <Typography variant="h6" gutterBottom>
        Form Sections
      </Typography>

      {sections.map((section, sectionIndex) => (
        <Accordion
          key={`section-${sectionIndex}`}
          expanded={expandedSection === `section-${sectionIndex}`}
          onChange={(_, expanded) => setExpandedSection(expanded ? `section-${sectionIndex}` : false)}
          sx={{ mb: 1 }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
              <DragIcon sx={{ color: 'text.secondary' }} />
              <Typography sx={{ flexGrow: 1 }}>
                {section.title || section.sectionName}
              </Typography>
              <Chip
                size="small"
                label={`${section.fields.length} fields`}
                sx={{ mr: 1 }}
              />
              {section.isRequired && (
                <Chip size="small" label="Required" color="primary" variant="outlined" />
              )}
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Section Title"
                  value={section.title}
                  onChange={(e) => handleUpdateSection(sectionIndex, { title: e.target.value })}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Section Key"
                  value={section.sectionKey}
                  onChange={(e) => handleUpdateSection(sectionIndex, { sectionKey: e.target.value })}
                  helperText="Used internally (e.g., demographics, allergies)"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Description"
                  value={section.description || ''}
                  onChange={(e) => handleUpdateSection(sectionIndex, { description: e.target.value })}
                  multiline
                  rows={2}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={section.isRequired}
                      onChange={(e) => handleUpdateSection(sectionIndex, { isRequired: e.target.checked })}
                    />
                  }
                  label="Required"
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={section.isRepeatable}
                      onChange={(e) => handleUpdateSection(sectionIndex, { isRepeatable: e.target.checked })}
                    />
                  }
                  label="Repeatable"
                />
              </Grid>
              {section.isRepeatable && (
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Max Repeats"
                    type="number"
                    value={section.maxRepeats || ''}
                    onChange={(e) => handleUpdateSection(sectionIndex, { maxRepeats: parseInt(e.target.value) || undefined })}
                    InputProps={{ inputProps: { min: 1, max: 50 } }}
                  />
                </Grid>
              )}
            </Grid>

            <Divider sx={{ my: 2 }} />

            {/* Fields */}
            <Typography variant="subtitle2" gutterBottom>
              Fields
            </Typography>
            <List dense>
              {section.fields.map((field, fieldIndex) => (
                <ListItem key={field.key}>
                  <ListItemText
                    primary={field.label || field.key}
                    secondary={`${field.type}${field.required ? ' (required)' : ''}`}
                  />
                  <ListItemSecondaryAction>
                    <Tooltip title="Edit Field">
                      <IconButton
                        size="small"
                        onClick={() => setFieldDialog({
                          open: true,
                          sectionIndex,
                          fieldIndex,
                          field,
                        })}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete Field">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleDeleteField(sectionIndex, fieldIndex)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>

            <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
              <Button
                startIcon={<AddIcon />}
                onClick={() => handleAddField(sectionIndex)}
              >
                Add Field
              </Button>
              <Button
                color="error"
                startIcon={<DeleteIcon />}
                onClick={() => handleDeleteSection(sectionIndex)}
              >
                Delete Section
              </Button>
            </Box>
          </AccordionDetails>
        </Accordion>
      ))}

      <Button
        variant="outlined"
        startIcon={<AddIcon />}
        onClick={handleAddSection}
        sx={{ mt: 2 }}
      >
        Add Section
      </Button>

      {/* Action Buttons */}
      <Box sx={{ display: 'flex', gap: 2, mt: 4, justifyContent: 'flex-end' }}>
        {onCancel && (
          <Button onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={handleSave}
          disabled={loading}
        >
          Save Template
        </Button>
      </Box>

      {/* Field Edit Dialog */}
      <FieldEditDialog
        open={fieldDialog.open}
        field={fieldDialog.field}
        onSave={handleSaveField}
        onClose={() => setFieldDialog({ open: false, sectionIndex: -1 })}
      />
    </Box>
  );
};

// Field Edit Dialog Component
interface FieldEditDialogProps {
  open: boolean;
  field?: FieldDefinition;
  onSave: (field: FieldDefinition) => void;
  onClose: () => void;
}

const FieldEditDialog: React.FC<FieldEditDialogProps> = ({ open, field, onSave, onClose }) => {
  const [editField, setEditField] = useState<FieldDefinition>(
    field || { key: '', label: '', type: 'text', required: false }
  );
  const [options, setOptions] = useState<string>(
    field?.options?.join('\n') || ''
  );

  useEffect(() => {
    if (field) {
      setEditField(field);
      setOptions(field.options?.join('\n') || '');
    } else {
      setEditField({ key: '', label: '', type: 'text', required: false });
      setOptions('');
    }
  }, [field]);

  const handleSave = () => {
    const updatedField = { ...editField };
    if (['select', 'radio', 'checkbox_group'].includes(editField.type)) {
      updatedField.options = options.split('\n').filter(o => o.trim());
    }
    onSave(updatedField);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{field ? 'Edit Field' : 'Add Field'}</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Field Key"
              value={editField.key}
              onChange={(e) => setEditField({ ...editField, key: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
              helperText="Unique identifier (e.g., first_name)"
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Label"
              value={editField.label}
              onChange={(e) => setEditField({ ...editField, label: e.target.value })}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <FormControl fullWidth>
              <InputLabel>Field Type</InputLabel>
              <Select
                value={editField.type}
                label="Field Type"
                onChange={(e) => setEditField({ ...editField, type: e.target.value as FieldDefinition['type'] })}
              >
                {FIELD_TYPES.map((ft) => (
                  <MenuItem key={ft.value} value={ft.value}>
                    {ft.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={6}>
            <FormControlLabel
              control={
                <Switch
                  checked={editField.required}
                  onChange={(e) => setEditField({ ...editField, required: e.target.checked })}
                />
              }
              label="Required"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={editField.auto_populate || false}
                  onChange={(e) => setEditField({ ...editField, auto_populate: e.target.checked })}
                />
              }
              label="Auto-populate"
            />
          </Grid>
          {['select', 'radio', 'checkbox_group'].includes(editField.type) && (
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Options (one per line)"
                value={options}
                onChange={(e) => setOptions(e.target.value)}
                multiline
                rows={4}
              />
            </Grid>
          )}
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Placeholder"
              value={editField.placeholder || ''}
              onChange={(e) => setEditField({ ...editField, placeholder: e.target.value })}
            />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave}>
          Save Field
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default IntakeFormBuilder;
