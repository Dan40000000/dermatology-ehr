import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tabs,
  Tab,
  Tooltip,
  Alert,
  CircularProgress,
  Badge,
} from '@mui/material';
import {
  Warning as WarningIcon,
  LocalPharmacy as PharmacyIcon,
  History as HistoryIcon,
  Info as InfoIcon,
  Print as PrintIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import api from '../../api';

interface Prescription {
  id: string;
  patientId: string;
  providerId: string;
  encounterId?: string;
  medicationName: string;
  genericName?: string;
  strength?: string;
  dosageForm?: string;
  sig: string;
  quantity: number;
  quantityUnit?: string;
  refills: number;
  refillsRemaining?: number;
  daysSupply?: number;
  status: string;
  isControlled: boolean;
  deaSchedule?: string;
  pharmacyName?: string;
  pharmacyFullName?: string;
  pharmacyPhone?: string;
  indication?: string;
  notes?: string;
  writtenDate: string;
  sentAt?: string;
  lastFilledDate?: string;
  createdAt: string;
  providerName?: string;
  encounterDate?: string;
}

interface PatientMedicationListProps {
  patientId: string;
  onPrescriptionClick?: (prescription: Prescription) => void;
  showEncounterInfo?: boolean;
  compact?: boolean;
}

export const PatientMedicationList: React.FC<PatientMedicationListProps> = ({
  patientId,
  onPrescriptionClick,
  showEncounterInfo = true,
  compact = false,
}) => {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [summary, setSummary] = useState({
    total: 0,
    active: 0,
    inactive: 0,
    controlled: 0,
  });

  const fetchPrescriptions = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/api/patients/${patientId}/prescriptions`, {
        params: {
          includeInactive: activeTab === 1 ? 'true' : 'false',
        },
      });
      setPrescriptions(response.data.prescriptions || []);
      if (response.data.summary) {
        setSummary(response.data.summary);
      }
    } catch (err: any) {
      console.error('Error fetching prescriptions:', err);
      setError(err.response?.data?.error || 'Failed to load prescriptions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (patientId) {
      fetchPrescriptions();
    }
  }, [patientId, activeTab]);

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
      case 'discontinued':
        return 'default';
      default:
        return 'info';
    }
  };

  const isActive = (prescription: Prescription) => {
    return (
      prescription.status !== 'cancelled' &&
      prescription.status !== 'discontinued' &&
      (prescription.refillsRemaining === null || prescription.refillsRemaining > 0)
    );
  };

  const filteredPrescriptions = prescriptions.filter((p) => {
    if (activeTab === 0) {
      // Active medications
      return isActive(p);
    } else if (activeTab === 1) {
      // All medications
      return true;
    } else if (activeTab === 2) {
      // Controlled substances
      return p.isControlled;
    }
    return true;
  });

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  return (
    <Card>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6" gutterBottom>
            <PharmacyIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
            Medications
          </Typography>
          <Box>
            <Tooltip title="Refresh">
              <IconButton onClick={fetchPrescriptions} size="small">
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        <Tabs value={activeTab} onChange={(_, val) => setActiveTab(val)} sx={{ mb: 2 }}>
          <Tab label={`Active (${summary.active})`} />
          <Tab label={`All (${summary.total})`} />
          <Tab
            label={
              <Badge badgeContent={summary.controlled} color="error">
                Controlled
              </Badge>
            }
          />
        </Tabs>

        {filteredPrescriptions.length === 0 ? (
          <Alert severity="info">No prescriptions found for this filter.</Alert>
        ) : (
          <TableContainer>
            <Table size={compact ? 'small' : 'medium'}>
              <TableHead>
                <TableRow>
                  <TableCell>Medication</TableCell>
                  <TableCell>Directions</TableCell>
                  <TableCell>Quantity</TableCell>
                  <TableCell>Refills</TableCell>
                  <TableCell>Provider</TableCell>
                  {showEncounterInfo && <TableCell>Date</TableCell>}
                  <TableCell>Status</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredPrescriptions.map((prescription) => (
                  <TableRow
                    key={prescription.id}
                    hover
                    onClick={() => onPrescriptionClick?.(prescription)}
                    sx={{ cursor: onPrescriptionClick ? 'pointer' : 'default' }}
                  >
                    <TableCell>
                      <Box>
                        <Typography variant="body2" fontWeight="bold">
                          {prescription.medicationName}
                          {prescription.isControlled && (
                            <Tooltip title={`DEA Schedule ${prescription.deaSchedule}`}>
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
                      {prescription.daysSupply && (
                        <Typography variant="caption" color="text.secondary">
                          {prescription.daysSupply} day supply
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {prescription.quantity} {prescription.quantityUnit || 'each'}
                    </TableCell>
                    <TableCell>
                      <Box>
                        <Typography variant="body2">
                          {prescription.refillsRemaining ?? prescription.refills} / {prescription.refills}
                        </Typography>
                        {prescription.lastFilledDate && (
                          <Typography variant="caption" color="text.secondary">
                            Last: {format(new Date(prescription.lastFilledDate), 'MM/dd/yyyy')}
                          </Typography>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{prescription.providerName || 'Unknown'}</Typography>
                      {prescription.pharmacyName && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          {prescription.pharmacyFullName || prescription.pharmacyName}
                        </Typography>
                      )}
                    </TableCell>
                    {showEncounterInfo && (
                      <TableCell>
                        <Typography variant="body2">
                          {format(new Date(prescription.writtenDate || prescription.createdAt), 'MM/dd/yyyy')}
                        </Typography>
                        {prescription.encounterDate && (
                          <Typography variant="caption" color="text.secondary">
                            Encounter: {format(new Date(prescription.encounterDate), 'MM/dd/yyyy')}
                          </Typography>
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      <Chip
                        label={prescription.status}
                        color={getStatusColor(prescription.status) as any}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Tooltip title="View History">
                        <IconButton size="small">
                          <HistoryIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Print">
                        <IconButton size="small">
                          <PrintIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>
    </Card>
  );
};

export default PatientMedicationList;
