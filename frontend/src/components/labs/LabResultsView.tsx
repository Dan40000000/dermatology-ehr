/**
 * Lab Results View Component
 * Display lab results with abnormal highlighting and review functionality
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
  Alert,
  Skeleton,
  Divider,
  Grid
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Timeline as TimelineIcon,
  Visibility as VisibilityIcon,
  Print as PrintIcon
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE_URL } from '../../utils/apiBase';

interface LabResultsViewProps {
  orderId: string;
  onReviewComplete?: () => void;
}

interface LabOrder {
  id: string;
  order_number: string;
  order_date: string;
  status: string;
  priority: string;
  patient_name: string;
  mrn: string;
  dob: string;
  ordering_provider_name: string;
  lab_name?: string;
  clinical_indication?: string;
  results_reviewed_at?: string;
}

interface LabResult {
  id: string;
  test_code: string;
  test_name: string;
  result_value: string;
  result_value_numeric?: number;
  result_unit?: string;
  reference_range_low?: number;
  reference_range_high?: number;
  reference_range_text?: string;
  abnormal_flags?: string[];
  critical_flags?: string[];
  result_status: string;
  result_date: string;
  reviewed_by?: string;
  reviewed_at?: string;
  review_notes?: string;
  interpretation?: string;
}

const getResultStatus = (result: LabResult): 'normal' | 'abnormal' | 'critical' => {
  if (result.critical_flags && result.critical_flags.length > 0) {
    return 'critical';
  }
  if (result.abnormal_flags && result.abnormal_flags.length > 0) {
    return 'abnormal';
  }
  return 'normal';
};

const getStatusColor = (status: 'normal' | 'abnormal' | 'critical'): 'success' | 'warning' | 'error' => {
  switch (status) {
    case 'critical':
      return 'error';
    case 'abnormal':
      return 'warning';
    default:
      return 'success';
  }
};

const getStatusIcon = (status: 'normal' | 'abnormal' | 'critical') => {
  switch (status) {
    case 'critical':
      return <ErrorIcon color="error" />;
    case 'abnormal':
      return <WarningIcon color="warning" />;
    default:
      return <CheckCircleIcon color="success" />;
  }
};

export const LabResultsView: React.FC<LabResultsViewProps> = ({
  orderId,
  onReviewComplete
}) => {
  const { session } = useAuth();

  const [order, setOrder] = useState<LabOrder | null>(null);
  const [results, setResults] = useState<LabResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedResult, setSelectedResult] = useState<LabResult | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewing, setReviewing] = useState(false);

  const fetchResults = useCallback(async () => {
    if (!session) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/labs/results/${orderId}`, {
        headers: {
          'Authorization': `Bearer ${session.accessToken}`,
          'x-tenant-id': session.tenantId
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch lab results');
      }

      const data = await response.json();
      setOrder(data.order);
      setResults(data.results || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [session, orderId]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  const handleReviewClick = (result: LabResult) => {
    setSelectedResult(result);
    setReviewNotes(result.review_notes || '');
    setReviewDialogOpen(true);
  };

  const handleReviewSubmit = async () => {
    if (!selectedResult || !session) return;

    setReviewing(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/labs/results/${selectedResult.id}/review`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.accessToken}`,
          'x-tenant-id': session.tenantId
        },
        body: JSON.stringify({ reviewNotes })
      });

      if (!response.ok) {
        throw new Error('Failed to review result');
      }

      setReviewDialogOpen(false);
      await fetchResults();
      onReviewComplete?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setReviewing(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Calculate summary statistics
  const summaryStats = {
    total: results.length,
    normal: results.filter(r => getResultStatus(r) === 'normal').length,
    abnormal: results.filter(r => getResultStatus(r) === 'abnormal').length,
    critical: results.filter(r => getResultStatus(r) === 'critical').length,
    reviewed: results.filter(r => r.reviewed_at).length
  };

  if (loading) {
    return (
      <Box>
        <Skeleton variant="rectangular" height={100} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" height={300} />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
    );
  }

  if (!order) {
    return (
      <Alert severity="info">
        Lab order not found
      </Alert>
    );
  }

  return (
    <Box>
      {/* Order Header */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={6}>
              <Typography variant="h6">
                Lab Order: {order.order_number}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {order.patient_name} | MRN: {order.mrn} | DOB: {new Date(order.dob).toLocaleDateString()}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Ordered by: {order.ordering_provider_name} on {new Date(order.order_date).toLocaleDateString()}
              </Typography>
              {order.lab_name && (
                <Typography variant="body2" color="text.secondary">
                  Lab: {order.lab_name}
                </Typography>
              )}
            </Grid>
            <Grid item xs={12} md={6}>
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <Chip
                  label={order.status}
                  color={order.status === 'reviewed' ? 'success' : order.status === 'received' ? 'info' : 'default'}
                  size="small"
                />
                <Chip
                  label={order.priority}
                  color={order.priority === 'stat' ? 'error' : order.priority === 'urgent' ? 'warning' : 'default'}
                  size="small"
                />
                <IconButton onClick={handlePrint} size="small">
                  <PrintIcon />
                </IconButton>
              </Box>
            </Grid>
          </Grid>

          {order.clinical_indication && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" color="text.secondary">
                Clinical Indication:
              </Typography>
              <Typography variant="body2">
                {order.clinical_indication}
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <Chip
          icon={<CheckCircleIcon />}
          label={`${summaryStats.normal} Normal`}
          color="success"
          variant="outlined"
        />
        <Chip
          icon={<WarningIcon />}
          label={`${summaryStats.abnormal} Abnormal`}
          color="warning"
          variant="outlined"
        />
        <Chip
          icon={<ErrorIcon />}
          label={`${summaryStats.critical} Critical`}
          color="error"
          variant="outlined"
        />
        <Chip
          label={`${summaryStats.reviewed}/${summaryStats.total} Reviewed`}
          variant="outlined"
        />
      </Box>

      {/* Results Table */}
      {results.length === 0 ? (
        <Alert severity="info">
          No results available yet for this order.
        </Alert>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Status</TableCell>
                <TableCell>Test</TableCell>
                <TableCell>Result</TableCell>
                <TableCell>Reference Range</TableCell>
                <TableCell>Flags</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {results.map((result) => {
                const status = getResultStatus(result);
                return (
                  <TableRow
                    key={result.id}
                    sx={{
                      backgroundColor: status === 'critical'
                        ? 'error.light'
                        : status === 'abnormal'
                          ? 'warning.light'
                          : undefined,
                      '&:hover': { backgroundColor: 'action.hover' }
                    }}
                  >
                    <TableCell>
                      <Tooltip title={status.charAt(0).toUpperCase() + status.slice(1)}>
                        {getStatusIcon(status)}
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">
                        {result.test_name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {result.test_code}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        fontWeight={status !== 'normal' ? 'bold' : 'normal'}
                        color={getStatusColor(status)}
                      >
                        {result.result_value} {result.result_unit || ''}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {result.reference_range_text ||
                          (result.reference_range_low !== undefined && result.reference_range_high !== undefined
                            ? `${result.reference_range_low} - ${result.reference_range_high}`
                            : '-')}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {result.abnormal_flags?.map((flag, idx) => (
                        <Chip
                          key={idx}
                          label={flag}
                          size="small"
                          color={result.critical_flags?.includes(flag) ? 'error' : 'warning'}
                          sx={{ mr: 0.5 }}
                        />
                      ))}
                      {result.result_status === 'preliminary' && (
                        <Chip label="Preliminary" size="small" variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption">
                        {result.result_date
                          ? new Date(result.result_date).toLocaleString()
                          : '-'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Tooltip title={result.reviewed_at ? 'Reviewed' : 'Mark as Reviewed'}>
                          <IconButton
                            size="small"
                            onClick={() => handleReviewClick(result)}
                            color={result.reviewed_at ? 'success' : 'default'}
                          >
                            <CheckCircleIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="View Trend">
                          <IconButton size="small">
                            <TimelineIcon />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Review Dialog */}
      <Dialog
        open={reviewDialogOpen}
        onClose={() => setReviewDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Review Result: {selectedResult?.test_name}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            <Typography variant="body2" gutterBottom>
              <strong>Result:</strong> {selectedResult?.result_value} {selectedResult?.result_unit || ''}
            </Typography>
            <Typography variant="body2" gutterBottom>
              <strong>Reference Range:</strong> {selectedResult?.reference_range_text || '-'}
            </Typography>
            {selectedResult?.interpretation && (
              <Typography variant="body2" gutterBottom>
                <strong>Interpretation:</strong> {selectedResult.interpretation}
              </Typography>
            )}
            <Divider sx={{ my: 2 }} />
            <TextField
              fullWidth
              multiline
              rows={3}
              label="Review Notes"
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              placeholder="Add any clinical notes or follow-up actions..."
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReviewDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleReviewSubmit}
            disabled={reviewing}
          >
            {reviewing ? 'Saving...' : 'Mark as Reviewed'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default LabResultsView;
