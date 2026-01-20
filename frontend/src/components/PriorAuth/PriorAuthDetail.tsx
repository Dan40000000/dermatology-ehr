import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Chip,
  Grid,
  Paper,
  Divider,
  IconButton,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  Timeline,
  TimelineItem,
  TimelineSeparator,
  TimelineConnector,
  TimelineContent,
  TimelineDot,
} from '@mui/lab';
import {
  Close as CloseIcon,
  Edit as EditIcon,
  Phone as PhoneIcon,
  Gavel as AppealIcon,
  Print as PrintIcon,
  AutoAwesome as AIIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { api } from '../../api';
import PriorAuthStatusUpdate from './PriorAuthStatusUpdate';
import PriorAuthAppeal from './PriorAuthAppeal';

interface PriorAuthDetailProps {
  priorAuthId: string;
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

const PriorAuthDetail: React.FC<PriorAuthDetailProps> = ({
  priorAuthId,
  open,
  onClose,
  onUpdate,
}) => {
  const [pa, setPa] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showStatusUpdate, setShowStatusUpdate] = useState(false);
  const [showAppeal, setShowAppeal] = useState(false);
  const [generatingLetter, setGeneratingLetter] = useState(false);

  useEffect(() => {
    if (open && priorAuthId) {
      loadPADetails();
    }
  }, [open, priorAuthId]);

  const loadPADetails = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/api/prior-auth/${priorAuthId}`);
      setPa(response.data);
    } catch (error) {
      console.error('Error loading PA details:', error);
      toast.error('Failed to load PA details');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateLetter = async () => {
    setGeneratingLetter(true);
    try {
      const response = await api.post(`/api/prior-auth/${priorAuthId}/generate-letter`);
      const { letterText } = response.data;

      // Open in new window for printing
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>Medical Necessity Letter - ${pa.reference_number}</title>
              <style>
                body { font-family: Arial, sans-serif; padding: 40px; line-height: 1.6; }
                pre { white-space: pre-wrap; font-family: inherit; }
              </style>
            </head>
            <body>
              <pre>${letterText}</pre>
            </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.print();
      }

      toast.success('Medical necessity letter generated');
    } catch (error) {
      console.error('Error generating letter:', error);
      toast.error('Failed to generate letter');
    } finally {
      setGeneratingLetter(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'success';
      case 'denied':
        return 'error';
      case 'pending':
      case 'submitted':
        return 'primary';
      case 'appealed':
        return 'warning';
      default:
        return 'default';
    }
  };

  if (loading) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
        <DialogContent>
          <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
            <CircularProgress />
          </Box>
        </DialogContent>
      </Dialog>
    );
  }

  if (!pa) return null;

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="h6">Prior Authorization Details</Typography>
              <Typography variant="body2" color="text.secondary">
                {pa.reference_number}
              </Typography>
            </Box>
            <IconButton onClick={onClose}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>

        <DialogContent dividers>
          <Grid container spacing={3}>
            {/* Status and Basic Info */}
            <Grid item xs={12}>
              <Paper sx={{ p: 2, bgcolor: 'background.default' }}>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6} md={3}>
                    <Typography variant="caption" color="text.secondary">
                      Status
                    </Typography>
                    <Box mt={0.5}>
                      <Chip label={pa.status.toUpperCase()} color={getStatusColor(pa.status)} />
                    </Box>
                  </Grid>

                  <Grid item xs={12} sm={6} md={3}>
                    <Typography variant="caption" color="text.secondary">
                      Patient
                    </Typography>
                    <Typography variant="body1">{pa.patient_name}</Typography>
                  </Grid>

                  <Grid item xs={12} sm={6} md={3}>
                    <Typography variant="caption" color="text.secondary">
                      Medication/Procedure
                    </Typography>
                    <Typography variant="body1">
                      {pa.medication_name || pa.procedure_code || '-'}
                    </Typography>
                  </Grid>

                  <Grid item xs={12} sm={6} md={3}>
                    <Typography variant="caption" color="text.secondary">
                      Payer
                    </Typography>
                    <Typography variant="body1">{pa.payer_name || '-'}</Typography>
                  </Grid>
                </Grid>
              </Paper>
            </Grid>

            {/* Expiration Warning */}
            {pa.status === 'approved' && pa.days_until_expiration !== null && (
              <Grid item xs={12}>
                {pa.days_until_expiration <= 7 ? (
                  <Alert severity="error">
                    <strong>URGENT:</strong> Authorization expires in {pa.days_until_expiration} days
                    on {format(new Date(pa.expiration_date), 'MM/dd/yyyy')}. Renewal required
                    immediately!
                  </Alert>
                ) : pa.days_until_expiration <= 30 ? (
                  <Alert severity="warning">
                    Authorization expires in {pa.days_until_expiration} days on{' '}
                    {format(new Date(pa.expiration_date), 'MM/dd/yyyy')}. Plan renewal soon.
                  </Alert>
                ) : null}
              </Grid>
            )}

            {/* Authorization Details */}
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>
                Authorization Details
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Type
                  </Typography>
                  <Typography>{pa.auth_type}</Typography>
                </Box>

                {pa.auth_number && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Auth Number
                    </Typography>
                    <Typography>{pa.auth_number}</Typography>
                  </Box>
                )}

                {pa.diagnosis_codes && pa.diagnosis_codes.length > 0 && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Diagnosis Codes
                    </Typography>
                    <Box display="flex" gap={0.5} flexWrap="wrap" mt={0.5}>
                      {pa.diagnosis_codes.map((code: string, idx: number) => (
                        <Chip key={idx} label={code} size="small" />
                      ))}
                    </Box>
                  </Box>
                )}

                {pa.days_pending !== null && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Days Pending
                    </Typography>
                    <Typography>{pa.days_pending} days</Typography>
                  </Box>
                )}
              </Box>
            </Grid>

            {/* Clinical Information */}
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>
                Clinical Information
              </Typography>
              {pa.clinical_justification && (
                <Box mb={2}>
                  <Typography variant="caption" color="text.secondary">
                    Clinical Justification
                  </Typography>
                  <Typography variant="body2">{pa.clinical_justification}</Typography>
                </Box>
              )}

              {pa.previous_treatments && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Previous Treatments
                  </Typography>
                  <Typography variant="body2">{pa.previous_treatments}</Typography>
                </Box>
              )}
            </Grid>

            {/* Status History */}
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                Status History
              </Typography>
              <Timeline>
                {pa.status_history && pa.status_history.length > 0 ? (
                  pa.status_history.map((entry: any, index: number) => (
                    <TimelineItem key={index}>
                      <TimelineSeparator>
                        <TimelineDot color={getStatusColor(entry.status)} />
                        {index < pa.status_history.length - 1 && <TimelineConnector />}
                      </TimelineSeparator>
                      <TimelineContent>
                        <Typography variant="body2" color="text.secondary">
                          {format(new Date(entry.created_at), 'MM/dd/yyyy HH:mm')}
                        </Typography>
                        <Typography variant="body1">
                          <strong>{entry.status}</strong>
                        </Typography>
                        {entry.notes && (
                          <Typography variant="body2" color="text.secondary">
                            {entry.notes}
                          </Typography>
                        )}
                        {entry.contacted_person && (
                          <Typography variant="caption" color="text.secondary">
                            Contact: {entry.contacted_person}
                          </Typography>
                        )}
                      </TimelineContent>
                    </TimelineItem>
                  ))
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No status history available
                  </Typography>
                )}
              </Timeline>
            </Grid>

            {/* Denial Info */}
            {pa.status === 'denied' && pa.denial_reason && (
              <Grid item xs={12}>
                <Alert severity="error">
                  <Typography variant="subtitle2">Denial Reason:</Typography>
                  <Typography variant="body2">{pa.denial_reason}</Typography>
                </Alert>
              </Grid>
            )}

            {/* Appeals */}
            {pa.appeals && pa.appeals.length > 0 && (
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom>
                  Appeals
                </Typography>
                {pa.appeals.map((appeal: any) => (
                  <Paper key={appeal.id} sx={{ p: 2, mb: 1 }}>
                    <Box display="flex" justifyContent="space-between">
                      <Box>
                        <Typography variant="subtitle2">
                          Level {appeal.appeal_level} Appeal
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Submitted: {format(new Date(appeal.submitted_at), 'MM/dd/yyyy')}
                        </Typography>
                      </Box>
                      <Chip label={appeal.status} size="small" color={getStatusColor(appeal.status)} />
                    </Box>
                  </Paper>
                ))}
              </Grid>
            )}
          </Grid>
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose}>Close</Button>

          {pa.status === 'denied' && (
            <Button
              variant="outlined"
              color="error"
              startIcon={<AppealIcon />}
              onClick={() => setShowAppeal(true)}
            >
              File Appeal
            </Button>
          )}

          <Button
            variant="outlined"
            startIcon={<PhoneIcon />}
            onClick={() => setShowStatusUpdate(true)}
          >
            Add Status Update
          </Button>

          <Button
            variant="outlined"
            startIcon={<AIIcon />}
            onClick={handleGenerateLetter}
            disabled={generatingLetter}
          >
            {generatingLetter ? 'Generating...' : 'Generate Letter'}
          </Button>

          <Button variant="contained" startIcon={<EditIcon />}>
            Edit
          </Button>
        </DialogActions>
      </Dialog>

      {/* Status Update Dialog */}
      {showStatusUpdate && (
        <PriorAuthStatusUpdate
          priorAuthId={priorAuthId}
          open={showStatusUpdate}
          onClose={() => setShowStatusUpdate(false)}
          onSuccess={() => {
            setShowStatusUpdate(false);
            loadPADetails();
            onUpdate();
          }}
        />
      )}

      {/* Appeal Dialog */}
      {showAppeal && (
        <PriorAuthAppeal
          priorAuthId={priorAuthId}
          denialReason={pa.denial_reason}
          open={showAppeal}
          onClose={() => setShowAppeal(false)}
          onSuccess={() => {
            setShowAppeal(false);
            loadPADetails();
            onUpdate();
          }}
        />
      )}
    </>
  );
};

export default PriorAuthDetail;
