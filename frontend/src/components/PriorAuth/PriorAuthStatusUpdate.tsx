import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Grid,
  Typography,
} from '@mui/material';
import toast from 'react-hot-toast';
import { api } from '../../api';

interface PriorAuthStatusUpdateProps {
  priorAuthId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const PriorAuthStatusUpdate: React.FC<PriorAuthStatusUpdateProps> = ({
  priorAuthId,
  open,
  onClose,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [contactedPerson, setContactedPerson] = useState('');
  const [contactMethod, setContactMethod] = useState<string>('phone');

  const handleSubmit = async () => {
    if (!status) {
      toast.error('Please select a status');
      return;
    }

    setLoading(true);
    try {
      await api.post(`/api/prior-auth/${priorAuthId}/status`, {
        status,
        notes,
        referenceNumber: referenceNumber || undefined,
        contactedPerson: contactedPerson || undefined,
        contactMethod,
      });

      toast.success('Status updated successfully');
      onSuccess();
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Status Update</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid item xs={12}>
            <FormControl fullWidth required>
              <InputLabel>New Status</InputLabel>
              <Select
                value={status}
                label="New Status"
                onChange={(e) => setStatus(e.target.value)}
              >
                <MenuItem value="submitted">Submitted to Payer</MenuItem>
                <MenuItem value="pending">Pending Review</MenuItem>
                <MenuItem value="approved">Approved</MenuItem>
                <MenuItem value="denied">Denied</MenuItem>
                <MenuItem value="appealed">Appealed</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Contact Method</InputLabel>
              <Select
                value={contactMethod}
                label="Contact Method"
                onChange={(e) => setContactMethod(e.target.value)}
              >
                <MenuItem value="phone">Phone Call</MenuItem>
                <MenuItem value="fax">Fax</MenuItem>
                <MenuItem value="portal">Payer Portal</MenuItem>
                <MenuItem value="email">Email</MenuItem>
                <MenuItem value="mail">Mail</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Reference Number"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="From payer"
              helperText="Optional"
            />
          </Grid>

          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Contacted Person"
              value={contactedPerson}
              onChange={(e) => setContactedPerson(e.target.value)}
              placeholder="Name of payer representative"
              helperText="Optional but recommended"
            />
          </Grid>

          <Grid item xs={12}>
            <TextField
              fullWidth
              multiline
              rows={4}
              label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Details from payer call, next steps, additional requirements..."
            />
          </Grid>

          <Grid item xs={12}>
            <Typography variant="caption" color="text.secondary">
              <strong>Tip:</strong> Document all communication with the payer. Include reference
              numbers, names, and specific requirements mentioned.
            </Typography>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} variant="contained" disabled={loading}>
          {loading ? 'Updating...' : 'Update Status'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default PriorAuthStatusUpdate;
