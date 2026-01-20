import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Autocomplete,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Typography,
  Chip,
  Box,
} from '@mui/material';
import toast from 'react-hot-toast';
import { api } from '../../api';

// Common dermatology medications requiring PA
const COMMON_BIOLOGICS = [
  'Humira (adalimumab)',
  'Dupixent (dupilumab)',
  'Otezla (apremilast)',
  'Skyrizi (risankizumab)',
  'Tremfya (guselkumab)',
  'Cosentyx (secukinumab)',
  'Stelara (ustekinumab)',
  'Enbrel (etanercept)',
  'Taltz (ixekizumab)',
  'Isotretinoin (Accutane)',
];

const COMMON_PROCEDURES = [
  { label: 'Mohs Micrographic Surgery', code: '17311' },
  { label: 'Narrowband UVB Phototherapy', code: '96912' },
  { label: 'PUVA Phototherapy', code: '96913' },
  { label: 'Laser - Ablative', code: '17360' },
  { label: 'Laser - Non-ablative', code: '17340' },
];

const COMMON_DIAGNOSES = [
  { code: 'L40.0', description: 'Psoriasis vulgaris (plaque psoriasis)' },
  { code: 'L40.9', description: 'Psoriasis, unspecified' },
  { code: 'L20.9', description: 'Atopic dermatitis, unspecified' },
  { code: 'L20.89', description: 'Other atopic dermatitis' },
  { code: 'L70.0', description: 'Acne vulgaris' },
  { code: 'L70.1', description: 'Acne conglobata' },
  { code: 'C44.91', description: 'Basal cell carcinoma of skin, unspecified' },
  { code: 'C44.92', description: 'Squamous cell carcinoma of skin, unspecified' },
];

interface PriorAuthFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  patientId?: string;
}

const PriorAuthForm: React.FC<PriorAuthFormProps> = ({
  open,
  onClose,
  onSuccess,
  patientId: initialPatientId,
}) => {
  const [loading, setLoading] = useState(false);
  const [authType, setAuthType] = useState<'medication' | 'procedure' | 'service'>('medication');
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [medicationName, setMedicationName] = useState('');
  const [procedureCode, setProcedureCode] = useState('');
  const [payerName, setPayerName] = useState('');
  const [payerPhone, setPayerPhone] = useState('');
  const [diagnosisCodes, setDiagnosisCodes] = useState<any[]>([]);
  const [clinicalJustification, setClinicalJustification] = useState('');
  const [previousTreatments, setPreviousTreatments] = useState('');
  const [urgency, setUrgency] = useState<'routine' | 'urgent' | 'stat'>('routine');
  const [patients, setPatients] = useState<any[]>([]);

  // Search patients
  const searchPatients = async (searchTerm: string) => {
    if (!searchTerm || searchTerm.length < 2) return;

    try {
      const response = await api.get('/api/patients', {
        params: { search: searchTerm, limit: 10 },
      });
      setPatients(response.data.data || response.data);
    } catch (error) {
      console.error('Error searching patients:', error);
    }
  };

  const handleSubmit = async () => {
    if (!selectedPatient && !initialPatientId) {
      toast.error('Please select a patient');
      return;
    }

    if (authType === 'medication' && !medicationName) {
      toast.error('Please enter medication name');
      return;
    }

    if (authType === 'procedure' && !procedureCode) {
      toast.error('Please select a procedure');
      return;
    }

    setLoading(true);
    try {
      await api.post('/api/prior-auth', {
        patientId: selectedPatient?.id || initialPatientId,
        authType,
        medicationName: authType === 'medication' ? medicationName : undefined,
        procedureCode: authType === 'procedure' ? procedureCode : undefined,
        payerName,
        payerPhone,
        diagnosisCodes: diagnosisCodes.map((d) => d.code),
        diagnosisDescriptions: diagnosisCodes.map((d) => d.description),
        clinicalJustification,
        previousTreatments,
        urgency,
      });

      toast.success('Prior authorization created successfully');
      onSuccess();
    } catch (error) {
      console.error('Error creating PA:', error);
      toast.error('Failed to create prior authorization');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>New Prior Authorization Request</DialogTitle>
      <DialogContent>
        <Grid container spacing={3} sx={{ mt: 0.5 }}>
          {/* Patient Selection */}
          {!initialPatientId && (
            <Grid item xs={12}>
              <Autocomplete
                options={patients}
                getOptionLabel={(option) =>
                  `${option.first_name} ${option.last_name} (MRN: ${option.mrn || 'N/A'})`
                }
                value={selectedPatient}
                onChange={(_, newValue) => setSelectedPatient(newValue)}
                onInputChange={(_, newInputValue) => {
                  setPatientSearch(newInputValue);
                  searchPatients(newInputValue);
                }}
                renderInput={(params) => (
                  <TextField {...params} label="Patient *" placeholder="Search by name or MRN" />
                )}
              />
            </Grid>
          )}

          {/* Authorization Type */}
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Authorization Type *</InputLabel>
              <Select
                value={authType}
                label="Authorization Type *"
                onChange={(e) => setAuthType(e.target.value as any)}
              >
                <MenuItem value="medication">Medication (Biologics, Isotretinoin)</MenuItem>
                <MenuItem value="procedure">Procedure (Mohs, Phototherapy, Laser)</MenuItem>
                <MenuItem value="service">Service</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {/* Urgency */}
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Urgency</InputLabel>
              <Select value={urgency} label="Urgency" onChange={(e) => setUrgency(e.target.value as any)}>
                <MenuItem value="routine">Routine (72 hours)</MenuItem>
                <MenuItem value="urgent">Urgent (24 hours)</MenuItem>
                <MenuItem value="stat">STAT (Same day)</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {/* Medication Name (if medication) */}
          {authType === 'medication' && (
            <Grid item xs={12}>
              <Autocomplete
                freeSolo
                options={COMMON_BIOLOGICS}
                value={medicationName}
                onChange={(_, newValue) => setMedicationName(newValue || '')}
                onInputChange={(_, newInputValue) => setMedicationName(newInputValue)}
                renderInput={(params) => (
                  <TextField {...params} label="Medication Name *" placeholder="Type or select" />
                )}
              />
            </Grid>
          )}

          {/* Procedure Code (if procedure) */}
          {authType === 'procedure' && (
            <Grid item xs={12}>
              <Autocomplete
                options={COMMON_PROCEDURES}
                getOptionLabel={(option) => `${option.label} (${option.code})`}
                value={COMMON_PROCEDURES.find((p) => p.code === procedureCode) || null}
                onChange={(_, newValue) => setProcedureCode(newValue?.code || '')}
                renderInput={(params) => (
                  <TextField {...params} label="Procedure *" placeholder="Select procedure" />
                )}
              />
            </Grid>
          )}

          {/* Payer Information */}
          <Grid item xs={12} sm={8}>
            <TextField
              fullWidth
              label="Payer/Insurance Name"
              value={payerName}
              onChange={(e) => setPayerName(e.target.value)}
              placeholder="e.g., Aetna, BCBS, Cigna"
            />
          </Grid>

          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label="Payer Phone"
              value={payerPhone}
              onChange={(e) => setPayerPhone(e.target.value)}
              placeholder="800-XXX-XXXX"
            />
          </Grid>

          {/* Diagnosis Codes */}
          <Grid item xs={12}>
            <Autocomplete
              multiple
              options={COMMON_DIAGNOSES}
              getOptionLabel={(option) => `${option.code} - ${option.description}`}
              value={diagnosisCodes}
              onChange={(_, newValue) => setDiagnosisCodes(newValue)}
              renderInput={(params) => (
                <TextField {...params} label="Diagnosis Codes" placeholder="Select diagnoses" />
              )}
              renderTags={(value, getTagProps) =>
                value.map((option, index) => (
                  <Chip label={option.code} {...getTagProps({ index })} size="small" />
                ))
              }
            />
          </Grid>

          {/* Clinical Justification */}
          <Grid item xs={12}>
            <TextField
              fullWidth
              multiline
              rows={4}
              label="Clinical Justification"
              value={clinicalJustification}
              onChange={(e) => setClinicalJustification(e.target.value)}
              placeholder="Why is this medication/procedure medically necessary? Include disease severity, impact on quality of life..."
              helperText="Tip: Use the AI letter generator after creating the PA"
            />
          </Grid>

          {/* Previous Treatments */}
          <Grid item xs={12}>
            <TextField
              fullWidth
              multiline
              rows={3}
              label="Previous Treatments Attempted"
              value={previousTreatments}
              onChange={(e) => setPreviousTreatments(e.target.value)}
              placeholder="List treatments tried: topicals, oral medications, other biologics, phototherapy..."
              helperText="Document all failed treatments - critical for approval!"
            />
          </Grid>

          {/* Help Text */}
          <Grid item xs={12}>
            <Box sx={{ bgcolor: 'info.light', p: 2, borderRadius: 1 }}>
              <Typography variant="body2" color="text.secondary">
                <strong>Tips for Success:</strong>
                <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                  <li>Document at least 2-3 failed treatments</li>
                  <li>Include specific dates and reasons for failure</li>
                  <li>Mention impact on daily life and work</li>
                  <li>For biologics: Include %BSA affected, PASI/EASI scores if available</li>
                  <li>Use AI letter generator for comprehensive medical necessity letter</li>
                </ul>
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} variant="contained" disabled={loading}>
          {loading ? 'Creating...' : 'Create PA Request'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default PriorAuthForm;
