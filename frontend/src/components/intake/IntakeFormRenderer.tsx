/**
 * IntakeFormRenderer - Renders intake forms for patient completion
 * Displays form fields, handles validation, and manages auto-save
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  FormControl,
  FormControlLabel,
  FormLabel,
  RadioGroup,
  Radio,
  Checkbox,
  FormGroup,
  Select,
  MenuItem,
  InputLabel,
  Grid,
  Stepper,
  Step,
  StepLabel,
  StepButton,
  Alert,
  CircularProgress,
  Divider,
  IconButton,
  Paper,
} from '@mui/material';
import {
  NavigateNext as NextIcon,
  NavigateBefore as PrevIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
} from '@mui/icons-material';

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
  id: string;
  name: string;
  key: string;
  order: number;
  title: string;
  description?: string;
  instructions?: string;
  fields: FieldDefinition[];
  isRequired: boolean;
  isRepeatable: boolean;
  maxRepeats?: number;
}

interface ExistingResponse {
  sectionId: string;
  fieldResponses: Record<string, unknown>;
  repeatIndex: number;
  isComplete: boolean;
}

interface IntakeFormRendererProps {
  sections: Section[];
  patientData?: Record<string, unknown>;
  existingResponses?: ExistingResponse[];
  dueBy?: string;
  onSave: (sectionId: string, responses: Record<string, unknown>, isComplete: boolean) => Promise<void>;
  onSubmit: (allResponses: Array<{ sectionId: string; fieldResponses: Record<string, unknown> }>) => Promise<void>;
  readOnly?: boolean;
}

// US States for state selector
const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

export const IntakeFormRenderer: React.FC<IntakeFormRendererProps> = ({
  sections,
  patientData,
  existingResponses,
  dueBy,
  onSave,
  onSubmit,
  readOnly = false,
}) => {
  const [activeStep, setActiveStep] = useState(0);
  const [responses, setResponses] = useState<Record<string, Record<string, unknown>>>({});
  const [sectionComplete, setSectionComplete] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, Record<string, string>>>({});
  const [repeatCounts, setRepeatCounts] = useState<Record<string, number>>({});

  // Initialize responses from existing data and patient data
  useEffect(() => {
    const initialResponses: Record<string, Record<string, unknown>> = {};
    const initialComplete: Record<string, boolean> = {};
    const initialRepeatCounts: Record<string, number> = {};

    sections.forEach((section) => {
      // Check for existing responses
      const existing = existingResponses?.filter((r) => r.sectionId === section.id);
      if (existing && existing.length > 0) {
        existing.forEach((r) => {
          const key = section.isRepeatable ? `${section.id}_${r.repeatIndex}` : section.id;
          initialResponses[key] = r.fieldResponses;
        });
        initialComplete[section.id] = existing.some((r) => r.isComplete);
        if (section.isRepeatable) {
          initialRepeatCounts[section.id] = Math.max(...existing.map((r) => r.repeatIndex)) + 1;
        }
      } else {
        // Auto-populate from patient data
        const autoPopulated: Record<string, unknown> = {};
        section.fields.forEach((field) => {
          if (field.auto_populate && patientData?.[field.key] !== undefined) {
            autoPopulated[field.key] = patientData[field.key];
          }
        });
        initialResponses[section.id] = autoPopulated;
        initialRepeatCounts[section.id] = section.isRepeatable ? 1 : 0;
      }
    });

    setResponses(initialResponses);
    setSectionComplete(initialComplete);
    setRepeatCounts(initialRepeatCounts);
  }, [sections, existingResponses, patientData]);

  // Current section
  const currentSection = sections[activeStep];

  // Get responses for current section
  const getCurrentResponses = useCallback((repeatIndex?: number): Record<string, unknown> => {
    if (!currentSection) return {};
    const key = currentSection.isRepeatable && repeatIndex !== undefined
      ? `${currentSection.id}_${repeatIndex}`
      : currentSection.id;
    return responses[key] || {};
  }, [currentSection, responses]);

  // Update field value
  const handleFieldChange = useCallback((fieldKey: string, value: unknown, repeatIndex?: number) => {
    const key = currentSection?.isRepeatable && repeatIndex !== undefined
      ? `${currentSection.id}_${repeatIndex}`
      : currentSection?.id;

    if (!key) return;

    setResponses((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [fieldKey]: value,
      },
    }));

    // Clear error for this field
    setErrors((prev) => {
      const sectionErrors = { ...prev[key] };
      delete sectionErrors[fieldKey];
      return { ...prev, [key]: sectionErrors };
    });
  }, [currentSection]);

  // Validate section
  const validateSection = useCallback((): boolean => {
    if (!currentSection) return true;

    const sectionErrors: Record<string, string> = {};
    const repeatCount = repeatCounts[currentSection.id] || 1;

    for (let i = 0; i < repeatCount; i++) {
      const key = currentSection.isRepeatable ? `${currentSection.id}_${i}` : currentSection.id;
      const sectionResponses = responses[key] || {};

      currentSection.fields.forEach((field) => {
        // Check conditional visibility
        if (field.conditional) {
          const condValue = sectionResponses[field.conditional.field];
          if (condValue !== field.conditional.equals) {
            return; // Field not visible, skip validation
          }
        }

        if (field.required) {
          const value = sectionResponses[field.key];
          if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
            sectionErrors[`${field.key}_${i}`] = `${field.label} is required`;
          }
        }

        // Email validation
        if (field.type === 'email' && sectionResponses[field.key]) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(String(sectionResponses[field.key]))) {
            sectionErrors[`${field.key}_${i}`] = 'Please enter a valid email address';
          }
        }

        // Phone validation
        if (field.type === 'phone' && sectionResponses[field.key]) {
          const phoneRegex = /^[\d\s\-\(\)]+$/;
          if (!phoneRegex.test(String(sectionResponses[field.key]))) {
            sectionErrors[`${field.key}_${i}`] = 'Please enter a valid phone number';
          }
        }
      });
    }

    setErrors((prev) => ({ ...prev, [currentSection.id]: sectionErrors }));
    return Object.keys(sectionErrors).length === 0;
  }, [currentSection, responses, repeatCounts]);

  // Save current section
  const handleSaveSection = useCallback(async () => {
    if (!currentSection || readOnly) return;

    const isComplete = validateSection();
    setSaving(true);

    try {
      const sectionResponses = responses[currentSection.id] || {};
      await onSave(currentSection.id, sectionResponses, isComplete);
      setSectionComplete((prev) => ({ ...prev, [currentSection.id]: isComplete }));
    } catch (error) {
      console.error('Error saving section:', error);
    } finally {
      setSaving(false);
    }
  }, [currentSection, responses, onSave, validateSection, readOnly]);

  // Navigate to next section
  const handleNext = async () => {
    if (!validateSection()) return;
    await handleSaveSection();
    setActiveStep((prev) => Math.min(prev + 1, sections.length - 1));
  };

  // Navigate to previous section
  const handleBack = () => {
    setActiveStep((prev) => Math.max(prev - 1, 0));
  };

  // Submit form
  const handleSubmit = async () => {
    if (!validateSection()) return;

    setSubmitting(true);
    try {
      const allResponses = sections.map((section) => ({
        sectionId: section.id,
        fieldResponses: responses[section.id] || {},
      }));
      await onSubmit(allResponses);
    } catch (error) {
      console.error('Error submitting form:', error);
    } finally {
      setSubmitting(false);
    }
  };

  // Add repeat entry
  const handleAddRepeat = () => {
    if (!currentSection?.isRepeatable) return;
    const currentCount = repeatCounts[currentSection.id] || 1;
    if (currentSection.maxRepeats && currentCount >= currentSection.maxRepeats) return;

    setRepeatCounts((prev) => ({
      ...prev,
      [currentSection.id]: currentCount + 1,
    }));
  };

  // Remove repeat entry
  const handleRemoveRepeat = (index: number) => {
    if (!currentSection?.isRepeatable) return;
    const currentCount = repeatCounts[currentSection.id] || 1;
    if (currentCount <= 1) return;

    setRepeatCounts((prev) => ({
      ...prev,
      [currentSection.id]: currentCount - 1,
    }));

    // Remove response for this index
    const key = `${currentSection.id}_${index}`;
    setResponses((prev) => {
      const updated = { ...prev };
      delete updated[key];
      return updated;
    });
  };

  // Check if field is visible (based on conditional logic)
  const isFieldVisible = (field: FieldDefinition, sectionResponses: Record<string, unknown>): boolean => {
    if (!field.conditional) return true;
    return sectionResponses[field.conditional.field] === field.conditional.equals;
  };

  // Render field
  const renderField = (field: FieldDefinition, repeatIndex?: number) => {
    const sectionResponses = getCurrentResponses(repeatIndex);
    if (!isFieldVisible(field, sectionResponses)) return null;

    const value = sectionResponses[field.key];
    const key = currentSection?.isRepeatable && repeatIndex !== undefined
      ? `${currentSection.id}_${repeatIndex}`
      : currentSection?.id;
    const errorKey = repeatIndex !== undefined ? `${field.key}_${repeatIndex}` : field.key;
    const error = errors[key || '']?.[errorKey];

    const commonProps = {
      fullWidth: true,
      required: field.required,
      error: !!error,
      helperText: error,
      disabled: readOnly,
      placeholder: field.placeholder,
    };

    switch (field.type) {
      case 'text':
      case 'email':
      case 'phone':
        return (
          <TextField
            {...commonProps}
            label={field.label}
            type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
            value={value || ''}
            onChange={(e) => handleFieldChange(field.key, e.target.value, repeatIndex)}
          />
        );

      case 'number':
        return (
          <TextField
            {...commonProps}
            label={field.label}
            type="number"
            value={value || ''}
            onChange={(e) => handleFieldChange(field.key, e.target.value, repeatIndex)}
          />
        );

      case 'textarea':
        return (
          <TextField
            {...commonProps}
            label={field.label}
            multiline
            rows={4}
            value={value || ''}
            onChange={(e) => handleFieldChange(field.key, e.target.value, repeatIndex)}
          />
        );

      case 'date':
        return (
          <TextField
            {...commonProps}
            label={field.label}
            type="date"
            value={value || ''}
            onChange={(e) => handleFieldChange(field.key, e.target.value, repeatIndex)}
            InputLabelProps={{ shrink: true }}
          />
        );

      case 'select':
        return (
          <FormControl {...commonProps}>
            <InputLabel>{field.label}</InputLabel>
            <Select
              value={value || ''}
              label={field.label}
              onChange={(e) => handleFieldChange(field.key, e.target.value, repeatIndex)}
            >
              {field.options?.map((option) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        );

      case 'state_select':
        return (
          <FormControl {...commonProps}>
            <InputLabel>{field.label}</InputLabel>
            <Select
              value={value || ''}
              label={field.label}
              onChange={(e) => handleFieldChange(field.key, e.target.value, repeatIndex)}
            >
              {US_STATES.map((state) => (
                <MenuItem key={state} value={state}>
                  {state}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        );

      case 'radio':
        return (
          <FormControl component="fieldset" error={!!error} disabled={readOnly}>
            <FormLabel component="legend">{field.label}{field.required && ' *'}</FormLabel>
            <RadioGroup
              value={value || ''}
              onChange={(e) => handleFieldChange(field.key, e.target.value, repeatIndex)}
            >
              {field.options?.map((option) => (
                <FormControlLabel
                  key={option}
                  value={option}
                  control={<Radio />}
                  label={option}
                />
              ))}
            </RadioGroup>
            {error && <Typography color="error" variant="caption">{error}</Typography>}
          </FormControl>
        );

      case 'checkbox':
        return (
          <FormControlLabel
            control={
              <Checkbox
                checked={value === true || value === 'true'}
                onChange={(e) => handleFieldChange(field.key, e.target.checked, repeatIndex)}
                disabled={readOnly}
              />
            }
            label={field.label}
          />
        );

      case 'checkbox_group':
        return (
          <FormControl component="fieldset" error={!!error} disabled={readOnly}>
            <FormLabel component="legend">{field.label}{field.required && ' *'}</FormLabel>
            <FormGroup>
              {field.options?.map((option) => {
                const checked = Array.isArray(value) ? value.includes(option) : false;
                return (
                  <FormControlLabel
                    key={option}
                    control={
                      <Checkbox
                        checked={checked}
                        onChange={(e) => {
                          const current = Array.isArray(value) ? [...value] : [];
                          if (e.target.checked) {
                            handleFieldChange(field.key, [...current, option], repeatIndex);
                          } else {
                            handleFieldChange(field.key, current.filter((v) => v !== option), repeatIndex);
                          }
                        }}
                      />
                    }
                    label={option}
                  />
                );
              })}
            </FormGroup>
            {error && <Typography color="error" variant="caption">{error}</Typography>}
          </FormControl>
        );

      default:
        return null;
    }
  };

  // Calculate progress
  const progress = useMemo(() => {
    const completed = Object.values(sectionComplete).filter(Boolean).length;
    return Math.round((completed / sections.length) * 100);
  }, [sectionComplete, sections.length]);

  if (!currentSection) {
    return <Typography>No sections available</Typography>;
  }

  return (
    <Box>
      {/* Due date warning */}
      {dueBy && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Please complete this form by {new Date(dueBy).toLocaleDateString()} at {new Date(dueBy).toLocaleTimeString()}
        </Alert>
      )}

      {/* Stepper */}
      <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 4 }}>
        {sections.map((section, index) => (
          <Step key={section.id} completed={sectionComplete[section.id]}>
            <StepButton onClick={() => setActiveStep(index)}>
              {section.title || section.name}
            </StepButton>
          </Step>
        ))}
      </Stepper>

      {/* Current Section */}
      <Card>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            {currentSection.title}
          </Typography>
          {currentSection.description && (
            <Typography variant="body2" color="text.secondary" paragraph>
              {currentSection.description}
            </Typography>
          )}
          {currentSection.instructions && (
            <Alert severity="info" sx={{ mb: 2 }}>
              {currentSection.instructions}
            </Alert>
          )}

          <Divider sx={{ my: 2 }} />

          {/* Repeatable sections */}
          {currentSection.isRepeatable ? (
            <>
              {Array.from({ length: repeatCounts[currentSection.id] || 1 }).map((_, index) => (
                <Paper key={index} sx={{ p: 2, mb: 2, bgcolor: 'grey.50' }} variant="outlined">
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="subtitle2">Entry {index + 1}</Typography>
                    {index > 0 && !readOnly && (
                      <IconButton size="small" onClick={() => handleRemoveRepeat(index)} color="error">
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Box>
                  <Grid container spacing={2}>
                    {currentSection.fields.map((field) => (
                      <Grid item xs={12} md={6} key={`${field.key}_${index}`}>
                        {renderField(field, index)}
                      </Grid>
                    ))}
                  </Grid>
                </Paper>
              ))}
              {!readOnly && (!currentSection.maxRepeats || (repeatCounts[currentSection.id] || 1) < currentSection.maxRepeats) && (
                <Button startIcon={<AddIcon />} onClick={handleAddRepeat}>
                  Add Another Entry
                </Button>
              )}
            </>
          ) : (
            <Grid container spacing={2}>
              {currentSection.fields.map((field) => (
                <Grid item xs={12} md={6} key={field.key}>
                  {renderField(field)}
                </Grid>
              ))}
            </Grid>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
        <Button
          onClick={handleBack}
          disabled={activeStep === 0}
          startIcon={<PrevIcon />}
        >
          Previous
        </Button>

        <Box sx={{ display: 'flex', gap: 1 }}>
          {!readOnly && (
            <Button
              onClick={handleSaveSection}
              disabled={saving}
              startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
            >
              Save Progress
            </Button>
          )}

          {activeStep === sections.length - 1 ? (
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={submitting || readOnly}
              endIcon={submitting ? <CircularProgress size={16} color="inherit" /> : null}
            >
              {submitting ? 'Submitting...' : 'Submit Form'}
            </Button>
          ) : (
            <Button
              variant="contained"
              onClick={handleNext}
              endIcon={<NextIcon />}
            >
              Next
            </Button>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default IntakeFormRenderer;
