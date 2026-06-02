import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Tooltip,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Send as SendIcon,
  Print as PrintIcon,
  LocalPharmacy as PharmacyIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import api from '../../api';
import { closeDialogByExplicitAction } from '../../utils/dialogClose';

interface Prescription {
  id: string;
  medicationName: string;
  genericName?: string;
  strength?: string;
  dosageForm?: string;
  sig: string;
  quantity: number;
  quantityUnit?: string;
  refills: number;
  refillsRemaining?: number;
  status: string;
  isControlled: boolean;
  deaSchedule?: string;
  pharmacyName?: string;
  pharmacyFullName?: string;
  pharmacyPhone?: string;
  providerName?: string;
  indication?: string;
  notes?: string;
  deliveryMethod?: string;
  deliveryStatus?: string;
  deliveryNotes?: string;
  documentedAt?: string;
  lastPrintedAt?: string;
  manuallyFilledAt?: string;
}

interface EncounterPrescriptionsProps {
  encounterId: string;
  patientId: string;
  onAddPrescription?: () => void;
  onEditPrescription?: (prescription: Prescription) => void;
  readOnly?: boolean;
}

export const EncounterPrescriptions: React.FC<EncounterPrescriptionsProps> = ({
  encounterId,
  patientId,
  onAddPrescription,
  onEditPrescription,
  readOnly = false,
}) => {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [prescriptionToDelete, setPrescriptionToDelete] = useState<string | null>(null);
  const [newPrescription, setNewPrescription] = useState({
    medicationName: '',
    sig: '',
    quantity: '1',
    refills: '0',
    pharmacyName: '',
    deliveryMethod: 'electronic',
  });

  const fetchPrescriptions = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/api/encounters/${encounterId}/prescriptions`);
      setPrescriptions(response.data.prescriptions || []);
    } catch (err: any) {
      console.error('Error fetching encounter prescriptions:', err);
      setError(err.response?.data?.error || 'Failed to load prescriptions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (encounterId) {
      fetchPrescriptions();
    }
  }, [encounterId]);

  const handleDelete = async () => {
    if (!prescriptionToDelete) return;

    try {
      await api.delete(`/api/prescriptions/${prescriptionToDelete}`);
      setPrescriptions((prev) => prev.filter((p) => p.id !== prescriptionToDelete));
      setDeleteDialogOpen(false);
      setPrescriptionToDelete(null);
    } catch (err: any) {
      console.error('Error deleting prescription:', err);
      setError(err.response?.data?.error || 'Failed to delete prescription');
    }
  };

  const handleSend = async (prescriptionId: string) => {
    try {
      await api.post('/api/prescriptions/send', { prescriptionId });
      fetchPrescriptions();
    } catch (err: any) {
      console.error('Error sending prescription:', err);
      setError(err.response?.data?.error || 'Failed to send prescription');
    }
  };

  const handlePrint = async (prescriptionId: string) => {
    try {
      await api.post(`/api/prescriptions/${prescriptionId}/print`, {
        notes: 'Printed from encounter prescription panel.',
      });
      fetchPrescriptions();
      window.setTimeout(() => window.print(), 50);
    } catch (err: any) {
      console.error('Error printing prescription:', err);
      setError(err.response?.data?.error || 'Failed to document printed prescription');
    }
  };

  const handleManualFill = async (prescriptionId: string) => {
    const notes = window.prompt(
      'Document manual prescription details (optional)',
      'Manually filled out / hand-written for patient.'
    );
    if (notes === null) return;

    try {
      await api.post(`/api/prescriptions/${prescriptionId}/manual-fill`, {
        notes: notes.trim() || 'Manually filled out / hand-written for patient.',
      });
      fetchPrescriptions();
    } catch (err: any) {
      console.error('Error documenting manual prescription:', err);
      setError(err.response?.data?.error || 'Failed to document manual prescription');
    }
  };

  const handleCreatePrescription = async () => {
    const quantity = Number(newPrescription.quantity);
    const refills = Number(newPrescription.refills);
    if (!newPrescription.medicationName.trim() || !newPrescription.sig.trim()) {
      setError('Medication and directions are required');
      return;
    }

    try {
      const response = await api.post('/api/prescriptions', {
        patientId,
        encounterId,
        medicationName: newPrescription.medicationName.trim(),
        sig: newPrescription.sig.trim(),
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        quantityUnit: 'each',
        refills: Number.isFinite(refills) && refills >= 0 ? refills : 0,
        pharmacyName: newPrescription.pharmacyName.trim() || undefined,
        deliveryMethod: newPrescription.deliveryMethod,
      });

      if (newPrescription.deliveryMethod === 'print' && response.data?.id) {
        await api.post(`/api/prescriptions/${response.data.id}/print`, {
          notes: 'Printed at prescription creation from encounter.',
          pharmacyName: newPrescription.pharmacyName.trim() || undefined,
        });
        window.setTimeout(() => window.print(), 50);
      } else if (newPrescription.deliveryMethod === 'manual' && response.data?.id) {
        await api.post(`/api/prescriptions/${response.data.id}/manual-fill`, {
          notes: 'Manual/fill-out prescription documented at creation from encounter.',
          pharmacyName: newPrescription.pharmacyName.trim() || undefined,
        });
      }

      setAddDialogOpen(false);
      setNewPrescription({ medicationName: '', sig: '', quantity: '1', refills: '0', pharmacyName: '', deliveryMethod: 'electronic' });
      fetchPrescriptions();
    } catch (err: any) {
      console.error('Error creating prescription:', err);
      setError(err.response?.data?.error || 'Failed to create prescription');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'warning';
      case 'sent':
      case 'transmitted':
        return 'success';
      case 'error':
        return 'error';
      case 'cancelled':
        return 'default';
      default:
        return 'info';
    }
  };

  const getDeliveryLabel = (prescription: Prescription) => {
    const method = (prescription.deliveryMethod || '').toLowerCase();
    const status = prescription.deliveryStatus?.replace(/_/g, ' ');
    if (method === 'print') return status ? `Printed · ${status}` : 'Printed';
    if (method === 'manual') return status ? `Manual · ${status}` : 'Manual';
    if (method === 'electronic') return status ? `eRx · ${status}` : 'eRx';
    return 'Not documented';
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Card>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6">
            <PharmacyIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
            Prescriptions This Visit
          </Typography>
          {!readOnly && (
            <Button
              variant="contained"
              color="primary"
              startIcon={<AddIcon />}
              onClick={onAddPrescription || (() => setAddDialogOpen(true))}
            >
              Add Prescription
            </Button>
          )}
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {prescriptions.length === 0 ? (
          <Alert severity="info">No prescriptions added for this encounter yet.</Alert>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Medication</TableCell>
                  <TableCell>Directions</TableCell>
                  <TableCell>Quantity</TableCell>
                  <TableCell>Refills</TableCell>
                  <TableCell>Pharmacy</TableCell>
                  <TableCell>Delivery</TableCell>
                  <TableCell>Status</TableCell>
                  {!readOnly && <TableCell align="right">Actions</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {prescriptions.map((prescription) => (
                  <TableRow key={prescription.id}>
                    <TableCell>
                      <Box>
                        <Typography variant="body2" fontWeight="bold">
                          {prescription.medicationName}
                          {prescription.isControlled && (
                            <Tooltip title={`Controlled Substance - Schedule ${prescription.deaSchedule}`}>
                              <WarningIcon
                                color="error"
                                fontSize="small"
                                sx={{ ml: 0.5, verticalAlign: 'middle' }}
                              />
                            </Tooltip>
                          )}
                        </Typography>
                        {prescription.genericName && prescription.genericName !== prescription.medicationName && (
                          <Typography variant="caption" color="text.secondary">
                            ({prescription.genericName})
                          </Typography>
                        )}
                        {prescription.strength && (
                          <Typography variant="caption" display="block" color="text.secondary">
                            {prescription.strength} {prescription.dosageForm}
                          </Typography>
                        )}
                        {prescription.indication && (
                          <Typography variant="caption" display="block" color="primary">
                            For: {prescription.indication}
                          </Typography>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{prescription.sig}</Typography>
                    </TableCell>
                    <TableCell>
                      {prescription.quantity} {prescription.quantityUnit || 'each'}
                    </TableCell>
                    <TableCell>{prescription.refills}</TableCell>
                    <TableCell>
                      {prescription.pharmacyFullName || prescription.pharmacyName || (
                        <Typography variant="body2" color="text.secondary">
                          Not specified
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={getDeliveryLabel(prescription)}
                        size="small"
                        color={
                          prescription.deliveryMethod === 'manual'
                            ? 'warning'
                            : prescription.deliveryMethod === 'print'
                              ? 'primary'
                              : 'success'
                        }
                        variant="outlined"
                      />
                      {prescription.deliveryNotes && (
                        <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
                          {prescription.deliveryNotes}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip label={prescription.status} size="small" color={getStatusColor(prescription.status) as any} />
                    </TableCell>
                    {!readOnly && (
                      <TableCell align="right">
                        <Tooltip title="Edit">
                          <IconButton
                            size="small"
                            onClick={() => onEditPrescription?.(prescription)}
                            disabled={!onEditPrescription || prescription.status === 'sent' || prescription.status === 'transmitted'}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Send to Pharmacy">
                          <IconButton
                            size="small"
                            onClick={() => handleSend(prescription.id)}
                            disabled={prescription.status === 'sent' || prescription.status === 'transmitted'}
                          >
                            <SendIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Print">
                          <IconButton
                            size="small"
                            onClick={() => handlePrint(prescription.id)}
                            disabled={prescription.status === 'cancelled' || prescription.status === 'discontinued'}
                          >
                            <PrintIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Document Manual Fill">
                          <Button
                            size="small"
                            variant="text"
                            onClick={() => handleManualFill(prescription.id)}
                            disabled={prescription.status === 'cancelled' || prescription.status === 'discontinued'}
                            sx={{ minWidth: 0, px: 0.75, fontSize: '0.7rem' }}
                          >
                            Manual
                          </Button>
                        </Tooltip>
                        <Tooltip title="Cancel">
                          <IconButton
                            size="small"
                            onClick={() => {
                              setPrescriptionToDelete(prescription.id);
                              setDeleteDialogOpen(true);
                            }}
                            disabled={prescription.status === 'sent' || prescription.status === 'transmitted'}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>

      <Dialog open={addDialogOpen} onClose={closeDialogByExplicitAction(() => setAddDialogOpen(false))} disableEscapeKeyDown maxWidth="sm" fullWidth>
        <DialogTitle>Add Prescription</DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={2} mt={1}>
            <TextField
              label="Medication"
              value={newPrescription.medicationName}
              onChange={(e) => setNewPrescription((prev) => ({ ...prev, medicationName: e.target.value }))}
              fullWidth
              required
            />
            <TextField
              label="Directions"
              value={newPrescription.sig}
              onChange={(e) => setNewPrescription((prev) => ({ ...prev, sig: e.target.value }))}
              fullWidth
              required
              multiline
              minRows={2}
            />
            <Box display="grid" gridTemplateColumns="1fr 1fr" gap={2}>
              <TextField
                label="Quantity"
                type="number"
                value={newPrescription.quantity}
                onChange={(e) => setNewPrescription((prev) => ({ ...prev, quantity: e.target.value }))}
                inputProps={{ min: 0, step: 1 }}
              />
              <TextField
                label="Refills"
                type="number"
                value={newPrescription.refills}
                onChange={(e) => setNewPrescription((prev) => ({ ...prev, refills: e.target.value }))}
                inputProps={{ min: 0, max: 5, step: 1 }}
              />
            </Box>
            <TextField
              label="Pharmacy"
              value={newPrescription.pharmacyName}
              onChange={(e) => setNewPrescription((prev) => ({ ...prev, pharmacyName: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Prescription Handling"
              value={newPrescription.deliveryMethod}
              onChange={(e) => setNewPrescription((prev) => ({ ...prev, deliveryMethod: e.target.value }))}
              fullWidth
              select
              SelectProps={{ native: true }}
              helperText="Electronic is the default. Print/manual creates a documented exception trail."
            >
              <option value="electronic">Send electronically</option>
              <option value="print">Print prescription</option>
              <option value="manual">Manual fill-out / hand-written</option>
            </TextField>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreatePrescription} variant="contained">
            Save Prescription
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteDialogOpen} onClose={closeDialogByExplicitAction(() => setDeleteDialogOpen(false))} disableEscapeKeyDown>
        <DialogTitle>Cancel Prescription?</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to cancel this prescription? This action cannot be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>No, Keep It</Button>
          <Button onClick={handleDelete} color="error" variant="contained">
            Yes, Cancel
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

export default EncounterPrescriptions;
