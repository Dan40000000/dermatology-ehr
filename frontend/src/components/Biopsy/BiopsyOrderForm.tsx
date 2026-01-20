import React, { useState, useEffect } from 'react';
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
  Autocomplete,
  FormControlLabel,
  Checkbox,
  Card,
  CardContent,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import {
  Print as PrintIcon,
  Link as LinkIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import toast from 'react-hot-toast';

interface BiopsyOrderFormProps {
  patientId: string;
  encounterId?: string;
  lesionId?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  mrn: string;
  date_of_birth: string;
}

interface Provider {
  id: string;
  first_name: string;
  last_name: string;
}

interface LabVendor {
  id: string;
  name: string;
  vendor_type: string;
}

interface Lesion {
  id: string;
  body_location: string;
  location_code: string;
  lesion_type: string;
  description: string;
}

const BiopsyOrderForm: React.FC<BiopsyOrderFormProps> = ({
  patientId,
  encounterId,
  lesionId,
  onSuccess,
  onCancel
}) => {
  const [formData, setFormData] = useState({
    patient_id: patientId,
    encounter_id: encounterId || '',
    lesion_id: lesionId || '',
    specimen_type: 'punch',
    specimen_size: '',
    body_location: '',
    body_location_code: '',
    location_laterality: '',
    location_details: '',
    clinical_description: '',
    clinical_history: '',
    differential_diagnoses: [] as string[],
    indication: '',
    ordering_provider_id: '',
    path_lab: '',
    path_lab_id: '',
    special_stains: [] as string[],
    send_for_cultures: false,
    send_for_immunofluorescence: false,
    send_for_molecular_testing: false,
    special_instructions: '',
    procedure_code: '88305'
  });

  const [patient, setPatient] = useState<Patient | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [pathLabs, setPathLabs] = useState<LabVendor[]>([]);
  const [lesions, setLesions] = useState<Lesion[]>([]);
  const [selectedLesion, setSelectedLesion] = useState<Lesion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createdBiopsy, setCreatedBiopsy] = useState<any>(null);
  const [showPrintDialog, setShowPrintDialog] = useState(false);

  const [diagnosisInput, setDiagnosisInput] = useState('');

  // Specimen types
  const specimenTypes = [
    { value: 'punch', label: 'Punch Biopsy' },
    { value: 'shave', label: 'Shave Biopsy' },
    { value: 'excisional', label: 'Excisional Biopsy' },
    { value: 'incisional', label: 'Incisional Biopsy' }
  ];

  // Common punch sizes
  const punchSizes = ['2mm', '3mm', '4mm', '5mm', '6mm', '8mm'];

  // Common special stains
  const commonStains = [
    'PAS (Periodic Acid-Schiff)',
    'GMS (Grocott Methenamine Silver)',
    'AFB (Acid Fast Bacilli)',
    'Gram Stain',
    'Melanin Stain',
    'Iron Stain',
    'Elastic Stain'
  ];

  // Common differential diagnoses for derm
  const commonDifferentials = [
    'Basal Cell Carcinoma',
    'Squamous Cell Carcinoma',
    'Melanoma',
    'Seborrheic Keratosis',
    'Actinic Keratosis',
    'Dermatofibroma',
    'Nevus',
    'Keratoacanthoma',
    'Psoriasis',
    'Eczema',
    'Lichen Planus',
    'Granuloma Annulare'
  ];

  useEffect(() => {
    fetchPatient();
    fetchProviders();
    fetchPathLabs();
    if (patientId) {
      fetchPatientLesions();
    }
  }, [patientId]);

  useEffect(() => {
    if (lesionId && lesions.length > 0) {
      const lesion = lesions.find(l => l.id === lesionId);
      if (lesion) {
        setSelectedLesion(lesion);
        setFormData(prev => ({
          ...prev,
          lesion_id: lesion.id,
          body_location: lesion.body_location,
          body_location_code: lesion.location_code,
          clinical_description: lesion.description
        }));
      }
    }
  }, [lesionId, lesions]);

  const fetchPatient = async () => {
    try {
      const response = await fetch(`/api/patients/${patientId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setPatient(data);
      }
    } catch (error) {
      console.error('Error fetching patient:', error);
    }
  };

  const fetchProviders = async () => {
    try {
      const response = await fetch('/api/providers', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setProviders(data);
      }
    } catch (error) {
      console.error('Error fetching providers:', error);
    }
  };

  const fetchPathLabs = async () => {
    try {
      const response = await fetch('/api/lab-vendors?supports_dermpath=true', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setPathLabs(data);
      }
    } catch (error) {
      console.error('Error fetching pathology labs:', error);
    }
  };

  const fetchPatientLesions = async () => {
    try {
      const response = await fetch(`/api/body-diagram/markings?patient_id=${patientId}&marking_type=lesion`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setLesions(data);
      }
    } catch (error) {
      console.error('Error fetching lesions:', error);
    }
  };

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleLesionSelect = (lesion: Lesion | null) => {
    setSelectedLesion(lesion);
    if (lesion) {
      setFormData(prev => ({
        ...prev,
        lesion_id: lesion.id,
        body_location: lesion.body_location,
        body_location_code: lesion.location_code,
        clinical_description: prev.clinical_description || lesion.description
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        lesion_id: ''
      }));
    }
  };

  const addDifferentialDiagnosis = () => {
    if (diagnosisInput.trim() && !formData.differential_diagnoses.includes(diagnosisInput.trim())) {
      setFormData(prev => ({
        ...prev,
        differential_diagnoses: [...prev.differential_diagnoses, diagnosisInput.trim()]
      }));
      setDiagnosisInput('');
    }
  };

  const removeDifferentialDiagnosis = (diagnosis: string) => {
    setFormData(prev => ({
      ...prev,
      differential_diagnoses: prev.differential_diagnoses.filter(d => d !== diagnosis)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch('/api/biopsies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create biopsy order');
      }

      const biopsy = await response.json();
      setCreatedBiopsy(biopsy);

      toast.success(`Biopsy order created: ${biopsy.specimen_id}`);
      setShowPrintDialog(true);
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrintLabel = () => {
    if (createdBiopsy) {
      // Open print dialog with specimen label
      const printWindow = window.open(`/print/biopsy-label/${createdBiopsy.id}`, '_blank');
      if (printWindow) {
        printWindow.focus();
      }
    }
  };

  const handleClosePrintDialog = () => {
    setShowPrintDialog(false);
    onSuccess();
  };

  return (
    <Box component="form" onSubmit={handleSubmit}>
      <Typography variant="h5" gutterBottom>
        Order Biopsy
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {patient && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="subtitle2" color="text.secondary">
              Patient
            </Typography>
            <Typography variant="h6">
              {patient.first_name} {patient.last_name} (MRN: {patient.mrn})
            </Typography>
            <Typography variant="body2" color="text.secondary">
              DOB: {new Date(patient.date_of_birth).toLocaleDateString()}
            </Typography>
          </CardContent>
        </Card>
      )}

      <Grid container spacing={3}>
        {/* Link to Lesion */}
        <Grid item xs={12}>
          <Card variant="outlined">
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <LinkIcon sx={{ mr: 1 }} />
                <Typography variant="subtitle1">Link to Body Map Lesion (Optional)</Typography>
              </Box>

              <Autocomplete
                options={lesions}
                value={selectedLesion}
                onChange={(_, newValue) => handleLesionSelect(newValue)}
                getOptionLabel={(option) => `${option.body_location} - ${option.lesion_type || 'Unknown'}`}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Select Lesion from Body Map"
                    helperText="Links this biopsy to a marked lesion on the body diagram"
                  />
                )}
              />

              {selectedLesion && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  Linked to: {selectedLesion.body_location} - {selectedLesion.lesion_type}
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Specimen Details */}
        <Grid item xs={12}>
          <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600 }}>
            Specimen Details
          </Typography>
          <Divider sx={{ mb: 2 }} />
        </Grid>

        <Grid item xs={12} md={6}>
          <FormControl fullWidth required>
            <InputLabel>Specimen Type</InputLabel>
            <Select
              value={formData.specimen_type}
              label="Specimen Type"
              onChange={(e) => handleChange('specimen_type', e.target.value)}
            >
              {specimenTypes.map((type) => (
                <MenuItem key={type.value} value={type.value}>
                  {type.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>

        <Grid item xs={12} md={6}>
          {formData.specimen_type === 'punch' ? (
            <FormControl fullWidth>
              <InputLabel>Punch Size</InputLabel>
              <Select
                value={formData.specimen_size}
                label="Punch Size"
                onChange={(e) => handleChange('specimen_size', e.target.value)}
              >
                {punchSizes.map((size) => (
                  <MenuItem key={size} value={size}>
                    {size}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : (
            <TextField
              fullWidth
              label="Specimen Size"
              placeholder="e.g., 1.5 x 1.0 x 0.5 cm"
              value={formData.specimen_size}
              onChange={(e) => handleChange('specimen_size', e.target.value)}
              helperText="Dimensions or description"
            />
          )}
        </Grid>

        {/* Location */}
        <Grid item xs={12}>
          <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600 }}>
            Anatomic Location
          </Typography>
          <Divider sx={{ mb: 2 }} />
        </Grid>

        <Grid item xs={12} md={8}>
          <TextField
            fullWidth
            required
            label="Body Location"
            value={formData.body_location}
            onChange={(e) => handleChange('body_location', e.target.value)}
            placeholder="e.g., Left forearm, Right cheek"
            disabled={!!selectedLesion}
          />
        </Grid>

        <Grid item xs={12} md={4}>
          <FormControl fullWidth>
            <InputLabel>Laterality</InputLabel>
            <Select
              value={formData.location_laterality}
              label="Laterality"
              onChange={(e) => handleChange('location_laterality', e.target.value)}
            >
              <MenuItem value="">None</MenuItem>
              <MenuItem value="left">Left</MenuItem>
              <MenuItem value="right">Right</MenuItem>
              <MenuItem value="bilateral">Bilateral</MenuItem>
              <MenuItem value="midline">Midline</MenuItem>
            </Select>
          </FormControl>
        </Grid>

        <Grid item xs={12}>
          <TextField
            fullWidth
            label="Location Details"
            value={formData.location_details}
            onChange={(e) => handleChange('location_details', e.target.value)}
            placeholder="e.g., 5cm distal to elbow, medial aspect"
            helperText="Additional anatomic details"
          />
        </Grid>

        {/* Clinical Information */}
        <Grid item xs={12}>
          <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600 }}>
            Clinical Information
          </Typography>
          <Divider sx={{ mb: 2 }} />
        </Grid>

        <Grid item xs={12}>
          <TextField
            fullWidth
            multiline
            rows={3}
            label="Clinical Description"
            value={formData.clinical_description}
            onChange={(e) => handleChange('clinical_description', e.target.value)}
            placeholder="Describe the lesion appearance, size, color, borders, etc."
          />
        </Grid>

        <Grid item xs={12}>
          <TextField
            fullWidth
            multiline
            rows={2}
            label="Clinical History"
            value={formData.clinical_history}
            onChange={(e) => handleChange('clinical_history', e.target.value)}
            placeholder="Relevant patient history, previous treatments, duration, etc."
          />
        </Grid>

        <Grid item xs={12}>
          <Typography variant="subtitle2" gutterBottom>
            Differential Diagnoses
          </Typography>
          <Autocomplete
            freeSolo
            options={commonDifferentials}
            value={diagnosisInput}
            onInputChange={(_, newValue) => setDiagnosisInput(newValue)}
            onChange={(_, newValue) => {
              if (newValue) {
                setDiagnosisInput(newValue);
              }
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Add Differential Diagnosis"
                placeholder="Type or select diagnosis"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addDifferentialDiagnosis();
                  }
                }}
              />
            )}
          />
          <Button
            size="small"
            onClick={addDifferentialDiagnosis}
            sx={{ mt: 1 }}
            disabled={!diagnosisInput.trim()}
          >
            Add Diagnosis
          </Button>

          <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {formData.differential_diagnoses.map((diagnosis) => (
              <Chip
                key={diagnosis}
                label={diagnosis}
                onDelete={() => removeDifferentialDiagnosis(diagnosis)}
                color="primary"
                variant="outlined"
              />
            ))}
          </Box>
        </Grid>

        <Grid item xs={12}>
          <TextField
            fullWidth
            label="Indication for Biopsy"
            value={formData.indication}
            onChange={(e) => handleChange('indication', e.target.value)}
            placeholder="e.g., Rule out malignancy, confirm diagnosis"
          />
        </Grid>

        {/* Provider and Lab */}
        <Grid item xs={12}>
          <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600 }}>
            Provider and Laboratory
          </Typography>
          <Divider sx={{ mb: 2 }} />
        </Grid>

        <Grid item xs={12} md={6}>
          <FormControl fullWidth required>
            <InputLabel>Ordering Provider</InputLabel>
            <Select
              value={formData.ordering_provider_id}
              label="Ordering Provider"
              onChange={(e) => handleChange('ordering_provider_id', e.target.value)}
            >
              {providers.map((provider) => (
                <MenuItem key={provider.id} value={provider.id}>
                  {provider.first_name} {provider.last_name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>

        <Grid item xs={12} md={6}>
          <FormControl fullWidth required>
            <InputLabel>Pathology Lab</InputLabel>
            <Select
              value={formData.path_lab_id}
              label="Pathology Lab"
              onChange={(e) => {
                const lab = pathLabs.find(l => l.id === e.target.value);
                handleChange('path_lab_id', e.target.value);
                if (lab) handleChange('path_lab', lab.name);
              }}
            >
              {pathLabs.map((lab) => (
                <MenuItem key={lab.id} value={lab.id}>
                  {lab.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>

        {/* Special Studies */}
        <Grid item xs={12}>
          <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600 }}>
            Special Studies (Optional)
          </Typography>
          <Divider sx={{ mb: 2 }} />
        </Grid>

        <Grid item xs={12}>
          <Autocomplete
            multiple
            options={commonStains}
            value={formData.special_stains}
            onChange={(_, newValue) => handleChange('special_stains', newValue)}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Special Stains"
                placeholder="Select special stains if needed"
              />
            )}
          />
        </Grid>

        <Grid item xs={12} md={4}>
          <FormControlLabel
            control={
              <Checkbox
                checked={formData.send_for_cultures}
                onChange={(e) => handleChange('send_for_cultures', e.target.checked)}
              />
            }
            label="Send for Cultures"
          />
        </Grid>

        <Grid item xs={12} md={4}>
          <FormControlLabel
            control={
              <Checkbox
                checked={formData.send_for_immunofluorescence}
                onChange={(e) => handleChange('send_for_immunofluorescence', e.target.checked)}
              />
            }
            label="Immunofluorescence"
          />
        </Grid>

        <Grid item xs={12} md={4}>
          <FormControlLabel
            control={
              <Checkbox
                checked={formData.send_for_molecular_testing}
                onChange={(e) => handleChange('send_for_molecular_testing', e.target.checked)}
              />
            }
            label="Molecular Testing"
          />
        </Grid>

        <Grid item xs={12}>
          <TextField
            fullWidth
            multiline
            rows={2}
            label="Special Instructions"
            value={formData.special_instructions}
            onChange={(e) => handleChange('special_instructions', e.target.value)}
            placeholder="Any special handling or testing instructions for the lab"
          />
        </Grid>

        <Grid item xs={12}>
          <TextField
            fullWidth
            label="Procedure Code (CPT)"
            value={formData.procedure_code}
            onChange={(e) => handleChange('procedure_code', e.target.value)}
            helperText="88305 (skin biopsy) is default"
          />
        </Grid>
      </Grid>

      {/* Action Buttons */}
      <Box sx={{ mt: 4, display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
        <Button onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="contained"
          disabled={submitting}
        >
          {submitting ? 'Creating Order...' : 'Create Biopsy Order'}
        </Button>
      </Box>

      {/* Print Label Dialog */}
      <Dialog open={showPrintDialog} onClose={handleClosePrintDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          Biopsy Order Created Successfully
          <IconButton
            onClick={handleClosePrintDialog}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Alert severity="success" sx={{ mb: 2 }}>
            <Typography variant="h6">
              Specimen ID: {createdBiopsy?.specimen_id}
            </Typography>
          </Alert>
          <Typography variant="body1" gutterBottom>
            The biopsy order has been created. Would you like to print the specimen label now?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            The label includes patient information, specimen ID, body location, and a barcode for tracking.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClosePrintDialog}>
            Close
          </Button>
          <Button
            variant="contained"
            startIcon={<PrintIcon />}
            onClick={() => {
              handlePrintLabel();
              handleClosePrintDialog();
            }}
          >
            Print Specimen Label
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default BiopsyOrderForm;
