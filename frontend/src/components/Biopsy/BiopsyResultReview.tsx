import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  TextField,
  Button,
  Divider,
  Alert,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Autocomplete
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Close as CloseIcon,
  Send as SendIcon,
  Image as ImageIcon,
  Assignment as AssignmentIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

interface BiopsyResultReviewProps {
  biopsyId: string;
  onClose: () => void;
  onReviewComplete: () => void;
}

interface Biopsy {
  id: string;
  specimen_id: string;
  patient_name: string;
  mrn: string;
  date_of_birth: string;
  patient_phone: string;
  patient_email: string;
  body_location: string;
  location_details: string;
  specimen_type: string;
  clinical_description: string;
  differential_diagnoses: string[];
  ordered_at: string;
  sent_at: string;
  resulted_at: string;
  pathology_diagnosis: string;
  pathology_report: string;
  pathology_gross_description: string;
  pathology_microscopic_description: string;
  pathology_comment: string;
  malignancy_type: string | null;
  malignancy_subtype: string | null;
  margins: string | null;
  margin_distance_mm: number | null;
  breslow_depth_mm: number | null;
  clark_level: string | null;
  mitotic_rate: number | null;
  ulceration: boolean | null;
  diagnosis_code: string | null;
  diagnosis_description: string | null;
  path_lab: string;
  path_lab_case_number: string;
  photo_ids: string[];
  lesion_id: string | null;
  ordering_provider_name: string;
}

interface ICD10Code {
  code: string;
  description: string;
}

const BiopsyResultReview: React.FC<BiopsyResultReviewProps> = ({
  biopsyId,
  onClose,
  onReviewComplete
}) => {
  const [biopsy, setBiopsy] = useState<Biopsy | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [reviewData, setReviewData] = useState({
    follow_up_action: 'none',
    follow_up_interval: '',
    follow_up_notes: '',
    reexcision_required: false,
    patient_notification_notes: ''
  });

  const [diagnosisCode, setDiagnosisCode] = useState('');
  const [diagnosisDescription, setDiagnosisDescription] = useState('');
  const [showPatientNotification, setShowPatientNotification] = useState(false);
  const [notificationMethod, setNotificationMethod] = useState('portal');
  const [notificationNotes, setNotificationNotes] = useState('');

  // Common ICD-10 codes for dermatology
  const commonICD10: ICD10Code[] = [
    { code: 'C43.9', description: 'Malignant melanoma of skin, unspecified' },
    { code: 'C44.91', description: 'Basal cell carcinoma of skin, unspecified' },
    { code: 'C44.92', description: 'Squamous cell carcinoma of skin, unspecified' },
    { code: 'D22.9', description: 'Melanocytic nevi, unspecified' },
    { code: 'D23.9', description: 'Other benign neoplasm of skin, unspecified' },
    { code: 'L57.0', description: 'Actinic keratosis' },
    { code: 'L82.1', description: 'Other seborrheic keratosis' },
    { code: 'L40.9', description: 'Psoriasis, unspecified' },
    { code: 'L30.9', description: 'Dermatitis, unspecified' }
  ];

  const followUpActions = [
    { value: 'none', label: 'No action needed - Benign' },
    { value: 'reexcision', label: 'Re-excision required' },
    { value: 'mohs', label: 'Refer for Mohs surgery' },
    { value: 'dermatology_followup', label: 'Dermatology follow-up' },
    { value: 'oncology_referral', label: 'Oncology referral' },
    { value: 'monitoring', label: 'Monitoring/surveillance' }
  ];

  useEffect(() => {
    fetchBiopsy();
  }, [biopsyId]);

  const fetchBiopsy = async () => {
    try {
      const response = await fetch(`/api/biopsies/${biopsyId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setBiopsy(data);

        // Pre-populate diagnosis code if available
        if (data.diagnosis_code) {
          setDiagnosisCode(data.diagnosis_code);
          setDiagnosisDescription(data.diagnosis_description || '');
        }

        // Auto-suggest follow-up based on findings
        if (data.malignancy_type) {
          if (data.malignancy_type === 'melanoma') {
            setReviewData(prev => ({
              ...prev,
              follow_up_action: 'oncology_referral',
              follow_up_notes: 'Melanoma diagnosis - oncology evaluation recommended'
            }));
          } else if (data.margins === 'involved' || data.margins === 'close') {
            setReviewData(prev => ({
              ...prev,
              follow_up_action: 'reexcision',
              reexcision_required: true,
              follow_up_notes: 'Margins involved/close - re-excision recommended'
            }));
          } else if (['BCC', 'SCC'].includes(data.malignancy_type)) {
            setReviewData(prev => ({
              ...prev,
              follow_up_action: 'dermatology_followup',
              follow_up_interval: '3 months'
            }));
          }
        }
      } else {
        throw new Error('Failed to load biopsy');
      }
    } catch (error: any) {
      console.error('Error fetching biopsy:', error);
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReviewSubmit = async () => {
    if (!diagnosisCode) {
      toast.error('Please enter an ICD-10 diagnosis code');
      return;
    }

    setSubmitting(true);

    try {
      // First update diagnosis code if needed
      if (diagnosisCode !== biopsy?.diagnosis_code) {
        await fetch(`/api/biopsies/${biopsyId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({
            diagnosis_code: diagnosisCode,
            diagnosis_description: diagnosisDescription
          })
        });
      }

      // Submit review
      const response = await fetch(`/api/biopsies/${biopsyId}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(reviewData)
      });

      if (!response.ok) {
        throw new Error('Failed to submit review');
      }

      toast.success('Biopsy reviewed and signed off');

      // Show patient notification dialog
      setShowPatientNotification(true);
    } catch (error: any) {
      console.error('Error submitting review:', error);
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePatientNotification = async () => {
    try {
      const response = await fetch(`/api/biopsies/${biopsyId}/notify-patient`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          method: notificationMethod,
          notes: notificationNotes
        })
      });

      if (!response.ok) {
        throw new Error('Failed to mark patient as notified');
      }

      toast.success('Patient notification recorded');
      setShowPatientNotification(false);
      onReviewComplete();
    } catch (error: any) {
      console.error('Error notifying patient:', error);
      toast.error(error.message);
    }
  };

  const getSeverityColor = (malignancyType: string | null): 'success' | 'warning' | 'error' => {
    if (!malignancyType) return 'success';
    if (malignancyType === 'melanoma') return 'error';
    return 'warning';
  };

  if (loading || !biopsy) {
    return <Typography>Loading...</Typography>;
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">
          Biopsy Result Review - {biopsy.specimen_id}
        </Typography>
        <IconButton onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Patient & Specimen Info */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Patient Information
              </Typography>
              <Typography variant="h6">
                {biopsy.patient_name}
              </Typography>
              <Table size="small">
                <TableBody>
                  <TableRow>
                    <TableCell>MRN:</TableCell>
                    <TableCell>{biopsy.mrn}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>DOB:</TableCell>
                    <TableCell>{format(new Date(biopsy.date_of_birth), 'MM/dd/yyyy')}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Phone:</TableCell>
                    <TableCell>{biopsy.patient_phone || 'Not on file'}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Email:</TableCell>
                    <TableCell>{biopsy.patient_email || 'Not on file'}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Specimen Information
              </Typography>
              <Table size="small">
                <TableBody>
                  <TableRow>
                    <TableCell>Location:</TableCell>
                    <TableCell>
                      <strong>{biopsy.body_location}</strong>
                      {biopsy.location_details && (
                        <Typography variant="caption" display="block" color="text.secondary">
                          {biopsy.location_details}
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Type:</TableCell>
                    <TableCell sx={{ textTransform: 'capitalize' }}>{biopsy.specimen_type}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Ordered:</TableCell>
                    <TableCell>{format(new Date(biopsy.ordered_at), 'MM/dd/yyyy')}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Provider:</TableCell>
                    <TableCell>{biopsy.ordering_provider_name}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Path Lab:</TableCell>
                    <TableCell>
                      {biopsy.path_lab}
                      {biopsy.path_lab_case_number && (
                        <Typography variant="caption" display="block" color="text.secondary">
                          Case #: {biopsy.path_lab_case_number}
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Grid>

        {/* Clinical Description */}
        {biopsy.clinical_description && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Clinical Description
                </Typography>
                <Typography variant="body2">{biopsy.clinical_description}</Typography>
                {biopsy.differential_diagnoses && biopsy.differential_diagnoses.length > 0 && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="caption" color="text.secondary">
                      Differential Diagnoses:
                    </Typography>
                    <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      {biopsy.differential_diagnoses.map((dx) => (
                        <Chip key={dx} label={dx} size="small" variant="outlined" />
                      ))}
                    </Box>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Pathology Results */}
        <Grid item xs={12}>
          <Card sx={{ border: 2, borderColor: getSeverityColor(biopsy.malignancy_type) + '.main' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">
                  Pathology Results
                </Typography>
                {biopsy.malignancy_type && (
                  <Alert severity={getSeverityColor(biopsy.malignancy_type)} icon={false}>
                    <strong>MALIGNANCY DETECTED: {biopsy.malignancy_type}</strong>
                  </Alert>
                )}
              </Box>

              <Divider sx={{ mb: 2 }} />

              <Typography variant="subtitle2" gutterBottom>
                Diagnosis:
              </Typography>
              <Typography variant="body1" sx={{ mb: 2, fontWeight: 500 }}>
                {biopsy.pathology_diagnosis}
              </Typography>

              {biopsy.pathology_gross_description && (
                <>
                  <Typography variant="subtitle2" gutterBottom>
                    Gross Description:
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 2 }}>
                    {biopsy.pathology_gross_description}
                  </Typography>
                </>
              )}

              {biopsy.pathology_microscopic_description && (
                <>
                  <Typography variant="subtitle2" gutterBottom>
                    Microscopic Description:
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 2 }}>
                    {biopsy.pathology_microscopic_description}
                  </Typography>
                </>
              )}

              {biopsy.pathology_report && (
                <>
                  <Typography variant="subtitle2" gutterBottom>
                    Full Report:
                  </Typography>
                  <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50', maxHeight: 300, overflow: 'auto' }}>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                      {biopsy.pathology_report}
                    </Typography>
                  </Paper>
                </>
              )}

              {/* Malignancy Details */}
              {biopsy.malignancy_type && (
                <Box sx={{ mt: 2, p: 2, bgcolor: 'warning.lighter', borderRadius: 1 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Malignancy Details:
                  </Typography>
                  <Grid container spacing={2}>
                    {biopsy.malignancy_subtype && (
                      <Grid item xs={6}>
                        <Typography variant="caption" color="text.secondary">Subtype:</Typography>
                        <Typography variant="body2">{biopsy.malignancy_subtype}</Typography>
                      </Grid>
                    )}
                    {biopsy.margins && (
                      <Grid item xs={6}>
                        <Typography variant="caption" color="text.secondary">Margins:</Typography>
                        <Chip
                          label={biopsy.margins}
                          size="small"
                          color={biopsy.margins === 'clear' ? 'success' : 'error'}
                          sx={{ textTransform: 'capitalize' }}
                        />
                      </Grid>
                    )}
                    {biopsy.breslow_depth_mm && (
                      <Grid item xs={6}>
                        <Typography variant="caption" color="text.secondary">Breslow Depth:</Typography>
                        <Typography variant="body2">{biopsy.breslow_depth_mm} mm</Typography>
                      </Grid>
                    )}
                    {biopsy.clark_level && (
                      <Grid item xs={6}>
                        <Typography variant="caption" color="text.secondary">Clark Level:</Typography>
                        <Typography variant="body2">{biopsy.clark_level}</Typography>
                      </Grid>
                    )}
                  </Grid>
                </Box>
              )}

              {biopsy.pathology_comment && (
                <>
                  <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                    Comment:
                  </Typography>
                  <Alert severity="info">
                    {biopsy.pathology_comment}
                  </Alert>
                </>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Review Section */}
        <Grid item xs={12}>
          <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
            Provider Review & Action Plan
          </Typography>
          <Divider sx={{ mb: 2 }} />
        </Grid>

        {/* ICD-10 Coding */}
        <Grid item xs={12} md={6}>
          <Autocomplete
            freeSolo
            options={commonICD10}
            getOptionLabel={(option) =>
              typeof option === 'string' ? option : `${option.code} - ${option.description}`
            }
            value={diagnosisCode}
            onInputChange={(_, newValue) => setDiagnosisCode(newValue)}
            onChange={(_, newValue) => {
              if (typeof newValue === 'object' && newValue) {
                setDiagnosisCode(newValue.code);
                setDiagnosisDescription(newValue.description);
              }
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="ICD-10 Diagnosis Code"
                required
                helperText="Enter or select diagnosis code"
              />
            )}
          />
        </Grid>

        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            label="Diagnosis Description"
            value={diagnosisDescription}
            onChange={(e) => setDiagnosisDescription(e.target.value)}
          />
        </Grid>

        {/* Follow-up Action */}
        <Grid item xs={12} md={6}>
          <FormControl fullWidth required>
            <InputLabel>Follow-up Action</InputLabel>
            <Select
              value={reviewData.follow_up_action}
              label="Follow-up Action"
              onChange={(e) => setReviewData({ ...reviewData, follow_up_action: e.target.value })}
            >
              {followUpActions.map((action) => (
                <MenuItem key={action.value} value={action.value}>
                  {action.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>

        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            label="Follow-up Interval"
            value={reviewData.follow_up_interval}
            onChange={(e) => setReviewData({ ...reviewData, follow_up_interval: e.target.value })}
            placeholder="e.g., 3 months, 6 months, 1 year"
            helperText="When should patient return for follow-up?"
          />
        </Grid>

        <Grid item xs={12}>
          <TextField
            fullWidth
            multiline
            rows={3}
            label="Follow-up Notes"
            value={reviewData.follow_up_notes}
            onChange={(e) => setReviewData({ ...reviewData, follow_up_notes: e.target.value })}
            placeholder="Additional instructions, referrals needed, monitoring plan, etc."
          />
        </Grid>

        <Grid item xs={12}>
          <TextField
            fullWidth
            multiline
            rows={3}
            label="Patient Notification Template"
            value={reviewData.patient_notification_notes}
            onChange={(e) => setReviewData({ ...reviewData, patient_notification_notes: e.target.value })}
            placeholder="Message to be communicated to patient about results and next steps"
            helperText="This will be used when notifying the patient"
          />
        </Grid>
      </Grid>

      {/* Action Buttons */}
      <Box sx={{ mt: 4, display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          startIcon={<CheckCircleIcon />}
          onClick={handleReviewSubmit}
          disabled={submitting || !diagnosisCode}
        >
          {submitting ? 'Submitting...' : 'Sign & Close Review'}
        </Button>
      </Box>

      {/* Patient Notification Dialog */}
      <Dialog open={showPatientNotification} maxWidth="sm" fullWidth>
        <DialogTitle>
          Notify Patient of Results
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" gutterBottom sx={{ mb: 2 }}>
            The biopsy has been reviewed and closed. Would you like to record patient notification now?
          </Typography>

          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Notification Method</InputLabel>
            <Select
              value={notificationMethod}
              label="Notification Method"
              onChange={(e) => setNotificationMethod(e.target.value)}
            >
              <MenuItem value="phone">Phone Call</MenuItem>
              <MenuItem value="portal">Patient Portal</MenuItem>
              <MenuItem value="letter">Letter</MenuItem>
              <MenuItem value="email">Email</MenuItem>
            </Select>
          </FormControl>

          <TextField
            fullWidth
            multiline
            rows={3}
            label="Notification Notes"
            value={notificationNotes}
            onChange={(e) => setNotificationNotes(e.target.value)}
            placeholder="Document communication with patient"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setShowPatientNotification(false);
            onReviewComplete();
          }}>
            Skip - Notify Later
          </Button>
          <Button
            variant="contained"
            startIcon={<SendIcon />}
            onClick={handlePatientNotification}
          >
            Mark Patient Notified
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default BiopsyResultReview;
