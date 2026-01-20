import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Typography,
  Box,
  Paper,
} from '@mui/material';
import { AutoAwesome as AIIcon } from '@mui/icons-material';
import toast from 'react-hot-toast';
import { api } from '../../api';

interface PriorAuthAppealProps {
  priorAuthId: string;
  denialReason: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const PriorAuthAppeal: React.FC<PriorAuthAppealProps> = ({
  priorAuthId,
  denialReason,
  open,
  onClose,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [appealLevel, setAppealLevel] = useState(1);
  const [appealType, setAppealType] = useState<'written' | 'peer_to_peer' | 'external_review'>('written');
  const [appealLetter, setAppealLetter] = useState('');
  const [additionalClinicalInfo, setAdditionalClinicalInfo] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = async () => {
    if (!appealLetter && !additionalClinicalInfo) {
      toast.error('Please provide appeal letter or additional clinical information');
      return;
    }

    setLoading(true);
    try {
      await api.post(`/api/prior-auth/${priorAuthId}/appeal`, {
        appealLevel,
        appealType,
        appealLetter,
        additionalClinicalInfo,
        notes,
      });

      toast.success('Appeal filed successfully');
      onSuccess();
    } catch (error) {
      console.error('Error filing appeal:', error);
      toast.error('Failed to file appeal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>File Prior Authorization Appeal</DialogTitle>
      <DialogContent>
        <Grid container spacing={3} sx={{ mt: 0.5 }}>
          {/* Denial Reason Display */}
          <Grid item xs={12}>
            <Paper sx={{ p: 2, bgcolor: 'error.light' }}>
              <Typography variant="subtitle2" gutterBottom>
                Denial Reason:
              </Typography>
              <Typography variant="body2">{denialReason}</Typography>
            </Paper>
          </Grid>

          {/* Appeal Level */}
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Appeal Level</InputLabel>
              <Select
                value={appealLevel}
                label="Appeal Level"
                onChange={(e) => setAppealLevel(Number(e.target.value))}
              >
                <MenuItem value={1}>1st Level Appeal</MenuItem>
                <MenuItem value={2}>2nd Level Appeal</MenuItem>
                <MenuItem value={3}>3rd Level / External Review</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {/* Appeal Type */}
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Appeal Type</InputLabel>
              <Select
                value={appealType}
                label="Appeal Type"
                onChange={(e) => setAppealType(e.target.value as any)}
              >
                <MenuItem value="written">Written Appeal</MenuItem>
                <MenuItem value="peer_to_peer">Peer-to-Peer Review</MenuItem>
                <MenuItem value="external_review">External Review</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {/* Appeal Letter */}
          <Grid item xs={12}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
              <Typography variant="subtitle2">Appeal Letter</Typography>
              <Button
                size="small"
                startIcon={<AIIcon />}
                onClick={async () => {
                  toast.info('AI letter generation coming soon...');
                  // TODO: Implement AI appeal letter generation
                }}
              >
                Generate with AI
              </Button>
            </Box>
            <TextField
              fullWidth
              multiline
              rows={8}
              value={appealLetter}
              onChange={(e) => setAppealLetter(e.target.value)}
              placeholder="Enter your appeal letter here, or use AI to generate a professional appeal based on the denial reason..."
            />
          </Grid>

          {/* Additional Clinical Info */}
          <Grid item xs={12}>
            <TextField
              fullWidth
              multiline
              rows={4}
              label="Additional Clinical Information"
              value={additionalClinicalInfo}
              onChange={(e) => setAdditionalClinicalInfo(e.target.value)}
              placeholder="New clinical data, updated test results, recent treatment failures, worsening condition..."
              helperText="Include any new information not in the original request"
            />
          </Grid>

          {/* Notes */}
          <Grid item xs={12}>
            <TextField
              fullWidth
              multiline
              rows={2}
              label="Internal Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal tracking notes (not sent to payer)"
            />
          </Grid>

          {/* Tips */}
          <Grid item xs={12}>
            <Box sx={{ bgcolor: 'info.light', p: 2, borderRadius: 1 }}>
              <Typography variant="body2" color="text.secondary">
                <strong>Appeal Tips:</strong>
                <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                  <li>Address each specific denial reason point-by-point</li>
                  <li>Cite clinical guidelines and peer-reviewed literature</li>
                  <li>Include new clinical information if available</li>
                  <li>Emphasize patient safety and medical necessity</li>
                  <li>Request peer-to-peer review if available</li>
                  <li>Submit within payer's appeal deadline (usually 60-180 days)</li>
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
        <Button onClick={handleSubmit} variant="contained" color="error" disabled={loading}>
          {loading ? 'Filing Appeal...' : 'File Appeal'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default PriorAuthAppeal;
