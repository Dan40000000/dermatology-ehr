import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Button,
  TextField,
  Alert,
  CircularProgress,
  Grid,
  Stepper,
  Step,
  StepLabel,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  FormLabel,
  Checkbox,
  FormGroup,
  Paper,
  Divider,
} from '@mui/material';
import {
  Description as FormIcon,
  Check as CheckIcon,
  Send as SendIcon,
} from '@mui/icons-material';
import {
  fetchPortalIntakeForms,
  fetchPortalIntakeForm,
  startPortalIntakeForm,
  savePortalIntakeResponse,
  type IntakeFormAssignment,
} from '../../portalApi';

interface IntakePageProps {
  tenantId: string;
  portalToken: string;
}

interface FormField {
  id: string;
  type: 'text' | 'textarea' | 'yes_no' | 'multiple_choice' | 'date' | 'number';
  label: string;
  required: boolean;
  options?: string[];
}

interface FormSection {
  title: string;
  fields: FormField[];
}

export default function IntakePage({ tenantId, portalToken }: IntakePageProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [assignedForms, setAssignedForms] = useState<IntakeFormAssignment[]>([]);
  const [selectedForm, setSelectedForm] = useState<IntakeFormAssignment | null>(null);
  const [currentSection, setCurrentSection] = useState(0);
  const [responseId, setResponseId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});

  useEffect(() => {
    loadAssignedForms();
  }, []);

  const loadAssignedForms = async () => {
    try {
      setLoading(true);
      const data = await fetchPortalIntakeForms(tenantId, portalToken);
      setAssignedForms(data.forms);
    } catch (err) {
      setError('Failed to load forms');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectForm = async (form: IntakeFormAssignment) => {
    try {
      setLoading(true);
      setError(null);

      // Get full form details
      const fullForm = await fetchPortalIntakeForm(tenantId, portalToken, form.assignment_id);
      setSelectedForm(fullForm);

      // Start or resume form response
      if (fullForm.response_id) {
        setResponseId(fullForm.response_id);
        setFormData(fullForm.responseData || {});
      } else {
        const { responseId: newResponseId } = await startPortalIntakeForm(tenantId, portalToken, form.assignment_id);
        setResponseId(newResponseId);
      }
    } catch (err) {
      setError('Failed to load form');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (fieldId: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [fieldId]: value,
    }));
  };

  const handleSaveDraft = async () => {
    if (!responseId) return;

    try {
      setLoading(true);
      await savePortalIntakeResponse(tenantId, portalToken, responseId, {
        responseData: formData,
        submit: false,
      });
      setError(null);
      alert('Draft saved successfully');
    } catch (err) {
      setError('Failed to save draft');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!responseId) return;

    // Validate required fields
    const schema = selectedForm?.formSchema as { sections: FormSection[] };
    if (schema?.sections) {
      for (const section of schema.sections) {
        for (const field of section.fields) {
          if (field.required && !formData[field.id]) {
            setError(`Please complete all required fields in "${section.title}"`);
            return;
          }
        }
      }
    }

    try {
      setLoading(true);
      await savePortalIntakeResponse(tenantId, portalToken, responseId, {
        responseData: formData,
        submit: true,
      });
      setSuccess(true);
    } catch (err) {
      setError('Failed to submit form');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const renderField = (field: FormField) => {
    const value = formData[field.id] || '';

    switch (field.type) {
      case 'text':
      case 'date':
      case 'number':
        return (
          <TextField
            fullWidth
            type={field.type}
            label={field.label}
            value={value}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            required={field.required}
            InputLabelProps={field.type === 'date' ? { shrink: true } : undefined}
          />
        );

      case 'textarea':
        return (
          <TextField
            fullWidth
            multiline
            rows={4}
            label={field.label}
            value={value}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            required={field.required}
          />
        );

      case 'yes_no':
        return (
          <FormControl component="fieldset" required={field.required}>
            <FormLabel component="legend">{field.label}</FormLabel>
            <RadioGroup
              value={value}
              onChange={(e) => handleFieldChange(field.id, e.target.value)}
            >
              <FormControlLabel value="yes" control={<Radio />} label="Yes" />
              <FormControlLabel value="no" control={<Radio />} label="No" />
            </RadioGroup>
          </FormControl>
        );

      case 'multiple_choice':
        return (
          <FormControl component="fieldset" required={field.required}>
            <FormLabel component="legend">{field.label}</FormLabel>
            <FormGroup>
              {field.options?.map((option) => (
                <FormControlLabel
                  key={option}
                  control={
                    <Checkbox
                      checked={Array.isArray(value) && value.includes(option)}
                      onChange={(e) => {
                        const currentValue = Array.isArray(value) ? value : [];
                        if (e.target.checked) {
                          handleFieldChange(field.id, [...currentValue, option]);
                        } else {
                          handleFieldChange(field.id, currentValue.filter((v) => v !== option));
                        }
                      }}
                    />
                  }
                  label={option}
                />
              ))}
            </FormGroup>
          </FormControl>
        );

      default:
        return <Typography>Unsupported field type: {field.type}</Typography>;
    }
  };

  if (success) {
    return (
      <Container maxWidth="md" sx={{ py: 8 }}>
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <CheckIcon sx={{ fontSize: 80, color: 'success.main', mb: 2 }} />
          <Typography variant="h4" gutterBottom>
            Form Submitted Successfully!
          </Typography>
          <Typography variant="body1" color="text.secondary" paragraph>
            Thank you for completing the {selectedForm?.name}. Your responses have been recorded.
          </Typography>
          <Button variant="contained" onClick={() => window.location.reload()} sx={{ mt: 4 }}>
            Return to Forms
          </Button>
        </Paper>
      </Container>
    );
  }

  if (!selectedForm) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Typography variant="h4" gutterBottom>
          Intake Forms
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : assignedForms.length === 0 ? (
          <Alert severity="info">You have no forms to complete at this time.</Alert>
        ) : (
          <Grid container spacing={3}>
            {assignedForms.map((form) => (
              <Grid item xs={12} md={6} key={form.assignment_id}>
                <Card>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'start', mb: 2 }}>
                      <FormIcon sx={{ mr: 2, color: 'primary.main', fontSize: 40 }} />
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="h6">{form.name}</Typography>
                        {form.description && (
                          <Typography variant="body2" color="text.secondary">
                            {form.description}
                          </Typography>
                        )}
                        {form.dueDate && (
                          <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 1 }}>
                            Due: {new Date(form.dueDate).toLocaleDateString()}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                    <Button
                      variant="contained"
                      fullWidth
                      onClick={() => handleSelectForm(form)}
                    >
                      {form.response_status === 'draft' ? 'Continue Form' : 'Start Form'}
                    </Button>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Container>
    );
  }

  const schema = selectedForm.formSchema as { sections: FormSection[] };
  const sections = schema?.sections || [];
  const currentSectionData = sections[currentSection];

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>
        {selectedForm.name}
      </Typography>

      {selectedForm.description && (
        <Typography variant="body1" color="text.secondary" paragraph>
          {selectedForm.description}
        </Typography>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Progress Stepper */}
      {sections.length > 1 && (
        <Stepper activeStep={currentSection} sx={{ mb: 4 }}>
          {sections.map((section, index) => (
            <Step key={index}>
              <StepLabel>{section.title}</StepLabel>
            </Step>
          ))}
        </Stepper>
      )}

      {/* Current Section */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            {currentSectionData.title}
          </Typography>
          <Divider sx={{ mb: 3 }} />
          <Grid container spacing={3}>
            {currentSectionData.fields.map((field) => (
              <Grid item xs={12} key={field.id}>
                {renderField(field)}
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>

      {/* Navigation Buttons */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Button
          disabled={currentSection === 0}
          onClick={() => setCurrentSection((prev) => prev - 1)}
        >
          Back
        </Button>
        <Box>
          <Button onClick={handleSaveDraft} disabled={loading} sx={{ mr: 1 }}>
            Save Draft
          </Button>
          {currentSection < sections.length - 1 ? (
            <Button variant="contained" onClick={() => setCurrentSection((prev) => prev + 1)}>
              Next
            </Button>
          ) : (
            <Button
              variant="contained"
              startIcon={<SendIcon />}
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? <CircularProgress size={24} /> : 'Submit Form'}
            </Button>
          )}
        </Box>
      </Box>

      <Button variant="text" onClick={() => setSelectedForm(null)}>
        Back to Forms List
      </Button>
    </Container>
  );
}
