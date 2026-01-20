import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  LinearProgress,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
  Collapse,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  History as HistoryIcon,
  LocalPharmacy as PharmacyIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import api from '../../api';

interface RefillHistory {
  id: string;
  fillNumber: number;
  filledDate: string;
  quantityFilled: number;
  pharmacyName?: string;
  pharmacyPhone?: string;
  filledByProviderName?: string;
  refillMethod?: string;
  costToPatientCents?: number;
  insurancePaidCents?: number;
  notes?: string;
}

interface PrescriptionInfo {
  id: string;
  patientId: string;
  medicationName: string;
  totalRefills: number;
  refillsRemaining?: number;
}

interface RefillTrackerProps {
  prescriptionId: string;
  compact?: boolean;
}

export const RefillTracker: React.FC<RefillTrackerProps> = ({ prescriptionId, compact = false }) => {
  const [prescription, setPrescription] = useState<PrescriptionInfo | null>(null);
  const [refills, setRefills] = useState<RefillHistory[]>([]);
  const [summary, setSummary] = useState({
    totalRefills: 0,
    refillsUsed: 0,
    refillsRemaining: 0,
    lastFilledDate: null as string | null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(!compact);

  useEffect(() => {
    const fetchRefillHistory = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.get(`/api/prescriptions/${prescriptionId}/refill-history`);
        setPrescription(response.data.prescription);
        setRefills(response.data.refills || []);
        setSummary(response.data.summary);
      } catch (err: any) {
        console.error('Error fetching refill history:', err);
        setError(err.response?.data?.error || 'Failed to load refill history');
      } finally {
        setLoading(false);
      }
    };

    if (prescriptionId) {
      fetchRefillHistory();
    }
  }, [prescriptionId]);

  const getRefillProgress = () => {
    if (!summary.totalRefills) return 0;
    return (summary.refillsUsed / summary.totalRefills) * 100;
  };

  const getProgressColor = () => {
    const progress = getRefillProgress();
    if (progress >= 100) return 'error';
    if (progress >= 75) return 'warning';
    return 'primary';
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={100}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (!prescription) {
    return <Alert severity="info">No refill information available</Alert>;
  }

  return (
    <Card variant={compact ? 'outlined' : 'elevation'}>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant={compact ? 'subtitle1' : 'h6'}>
            <HistoryIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
            Refill Tracker
          </Typography>
          {compact && (
            <IconButton size="small" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          )}
        </Box>

        <Box mb={2}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
            <Typography variant="body2" color="text.secondary">
              Refills Used: {summary.refillsUsed} / {summary.totalRefills}
            </Typography>
            <Chip
              label={`${summary.refillsRemaining} remaining`}
              size="small"
              color={summary.refillsRemaining === 0 ? 'error' : summary.refillsRemaining <= 1 ? 'warning' : 'success'}
            />
          </Box>
          <LinearProgress
            variant="determinate"
            value={getRefillProgress()}
            color={getProgressColor() as any}
            sx={{ height: 8, borderRadius: 1 }}
          />
        </Box>

        {summary.lastFilledDate && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Last filled: {format(new Date(summary.lastFilledDate), 'MMMM dd, yyyy')}
          </Alert>
        )}

        {summary.refillsRemaining === 0 && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            No refills remaining. Patient needs a new prescription.
          </Alert>
        )}

        <Collapse in={expanded}>
          {refills.length === 0 ? (
            <Alert severity="info">No refill history available</Alert>
          ) : (
            <TableContainer>
              <Table size={compact ? 'small' : 'medium'}>
                <TableHead>
                  <TableRow>
                    <TableCell>Fill #</TableCell>
                    <TableCell>Date Filled</TableCell>
                    <TableCell>Quantity</TableCell>
                    <TableCell>Pharmacy</TableCell>
                    <TableCell>Cost</TableCell>
                    <TableCell>Method</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {refills.map((refill) => (
                    <TableRow key={refill.id}>
                      <TableCell>
                        <Chip label={`#${refill.fillNumber}`} size="small" color="primary" />
                      </TableCell>
                      <TableCell>{format(new Date(refill.filledDate), 'MM/dd/yyyy')}</TableCell>
                      <TableCell>{refill.quantityFilled}</TableCell>
                      <TableCell>
                        <Box>
                          <Typography variant="body2">{refill.pharmacyName || 'Unknown'}</Typography>
                          {refill.pharmacyPhone && (
                            <Typography variant="caption" color="text.secondary">
                              {refill.pharmacyPhone}
                            </Typography>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        {refill.costToPatientCents !== null && refill.costToPatientCents !== undefined ? (
                          <Box>
                            <Typography variant="body2">
                              ${(refill.costToPatientCents / 100).toFixed(2)}
                            </Typography>
                            {refill.insurancePaidCents !== null &&
                              refill.insurancePaidCents !== undefined &&
                              refill.insurancePaidCents > 0 && (
                                <Typography variant="caption" color="text.secondary">
                                  Ins: ${(refill.insurancePaidCents / 100).toFixed(2)}
                                </Typography>
                              )}
                          </Box>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            N/A
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip label={refill.refillMethod || 'eRx'} size="small" variant="outlined" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Collapse>
      </CardContent>
    </Card>
  );
};

export default RefillTracker;
