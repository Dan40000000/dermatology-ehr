/**
 * Abnormal Alert Component
 * Highlights abnormal and critical lab results requiring attention
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
  Alert,
  Skeleton,
  Tooltip,
  Badge,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Collapse
} from '@mui/material';
import {
  Warning as WarningIcon,
  Error as ErrorIcon,
  CheckCircle as CheckCircleIcon,
  Visibility as VisibilityIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  NotificationsActive as NotificationsActiveIcon
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE_URL } from '../../utils/apiBase';

interface AbnormalAlertProps {
  onViewResult?: (orderId: string) => void;
  maxItems?: number;
  compact?: boolean;
  autoRefreshInterval?: number;
}

interface AbnormalResult {
  id: string;
  order_id: string;
  order_number: string;
  test_code: string;
  test_name: string;
  result_value: string;
  result_unit?: string;
  reference_range_text?: string;
  abnormal_flags: string[];
  critical_flags?: string[];
  result_date: string;
  patient_name: string;
  mrn: string;
  ordering_provider_name: string;
  reviewed_at?: string;
}

const isCritical = (result: AbnormalResult): boolean => {
  return !!(result.critical_flags && result.critical_flags.length > 0);
};

const getAlertIcon = (result: AbnormalResult) => {
  if (isCritical(result)) {
    return <ErrorIcon color="error" />;
  }
  return <WarningIcon color="warning" />;
};

const getAlertColor = (result: AbnormalResult): 'error' | 'warning' => {
  return isCritical(result) ? 'error' : 'warning';
};

export const AbnormalAlert: React.FC<AbnormalAlertProps> = ({
  onViewResult,
  maxItems = 20,
  compact = false,
  autoRefreshInterval = 60000 // 1 minute default
}) => {
  const { session } = useAuth();

  const [results, setResults] = useState<AbnormalResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(!compact);
  const [selectedResult, setSelectedResult] = useState<AbnormalResult | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewing, setReviewing] = useState(false);

  const fetchAbnormalResults = useCallback(async () => {
    if (!session) return;

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/labs/abnormal?reviewed=false&limit=${maxItems}`,
        {
          headers: {
            'Authorization': `Bearer ${session.accessToken}`,
            'x-tenant-id': session.tenantId
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch abnormal results');
      }

      const data = await response.json();
      setResults(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [session, maxItems]);

  useEffect(() => {
    fetchAbnormalResults();

    // Set up auto-refresh
    if (autoRefreshInterval > 0) {
      const interval = setInterval(fetchAbnormalResults, autoRefreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchAbnormalResults, autoRefreshInterval]);

  const handleReviewClick = (result: AbnormalResult) => {
    setSelectedResult(result);
    setReviewNotes('');
    setReviewDialogOpen(true);
  };

  const handleReviewSubmit = async () => {
    if (!selectedResult || !session) return;

    setReviewing(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/labs/results/${selectedResult.id}/review`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.accessToken}`,
            'x-tenant-id': session.tenantId
          },
          body: JSON.stringify({ reviewNotes })
        }
      );

      if (!response.ok) {
        throw new Error('Failed to review result');
      }

      setReviewDialogOpen(false);
      await fetchAbnormalResults();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setReviewing(false);
    }
  };

  // Count critical vs abnormal
  const criticalCount = results.filter(isCritical).length;
  const abnormalCount = results.length - criticalCount;

  if (loading) {
    return <Skeleton variant="rectangular" height={compact ? 80 : 200} />;
  }

  // No abnormal results
  if (results.length === 0 && !error) {
    return compact ? null : (
      <Alert severity="success" icon={<CheckCircleIcon />}>
        No abnormal lab results requiring attention.
      </Alert>
    );
  }

  return (
    <Box>
      {/* Alert Banner */}
      <Alert
        severity={criticalCount > 0 ? 'error' : 'warning'}
        icon={criticalCount > 0 ? <ErrorIcon /> : <WarningIcon />}
        action={
          compact ? (
            <IconButton
              size="small"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          ) : null
        }
        sx={{ mb: compact ? 0 : 2 }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Badge badgeContent={criticalCount} color="error">
            <NotificationsActiveIcon />
          </Badge>
          <Typography variant="body2">
            {criticalCount > 0 && (
              <strong>{criticalCount} CRITICAL</strong>
            )}
            {criticalCount > 0 && abnormalCount > 0 && ' and '}
            {abnormalCount > 0 && (
              <span>{abnormalCount} abnormal</span>
            )}
            {' '}lab result{results.length !== 1 ? 's' : ''} requiring review
          </Typography>
        </Box>
      </Alert>

      {/* Collapsible Details */}
      <Collapse in={!compact || expanded}>
        {error && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {error}
          </Alert>
        )}

        <TableContainer component={Paper} variant="outlined" sx={{ mt: 1 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox"></TableCell>
                <TableCell>Patient</TableCell>
                <TableCell>Test</TableCell>
                <TableCell>Result</TableCell>
                <TableCell>Flags</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {results.map((result) => (
                <TableRow
                  key={result.id}
                  sx={{
                    backgroundColor: isCritical(result)
                      ? 'error.light'
                      : 'warning.light',
                    '&:hover': { backgroundColor: 'action.hover' }
                  }}
                >
                  <TableCell padding="checkbox">
                    {getAlertIcon(result)}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {result.patient_name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      MRN: {result.mrn}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {result.test_name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {result.test_code}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      fontWeight="bold"
                      color={getAlertColor(result)}
                    >
                      {result.result_value} {result.result_unit || ''}
                    </Typography>
                    {result.reference_range_text && (
                      <Typography variant="caption" color="text.secondary">
                        Ref: {result.reference_range_text}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {result.abnormal_flags?.map((flag, idx) => (
                        <Chip
                          key={idx}
                          label={flag}
                          size="small"
                          color={result.critical_flags?.includes(flag) ? 'error' : 'warning'}
                        />
                      ))}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Tooltip title="View Order">
                        <IconButton
                          size="small"
                          onClick={() => onViewResult?.(result.order_id)}
                        >
                          <VisibilityIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Mark as Reviewed">
                        <IconButton
                          size="small"
                          color="success"
                          onClick={() => handleReviewClick(result)}
                        >
                          <CheckCircleIcon />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Collapse>

      {/* Review Dialog */}
      <Dialog
        open={reviewDialogOpen}
        onClose={() => setReviewDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {selectedResult && getAlertIcon(selectedResult)}
            Review Abnormal Result
          </Box>
        </DialogTitle>
        <DialogContent>
          {selectedResult && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                {selectedResult.test_name}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Patient:</strong> {selectedResult.patient_name} (MRN: {selectedResult.mrn})
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Result:</strong>{' '}
                <span style={{ fontWeight: 'bold', color: isCritical(selectedResult) ? 'red' : 'orange' }}>
                  {selectedResult.result_value} {selectedResult.result_unit || ''}
                </span>
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Reference Range:</strong> {selectedResult.reference_range_text || 'N/A'}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Flags:</strong> {selectedResult.abnormal_flags?.join(', ')}
              </Typography>
            </Box>
          )}
          <TextField
            fullWidth
            multiline
            rows={3}
            label="Review Notes"
            value={reviewNotes}
            onChange={(e) => setReviewNotes(e.target.value)}
            placeholder="Document any actions taken or clinical notes..."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReviewDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleReviewSubmit}
            disabled={reviewing}
            startIcon={<CheckCircleIcon />}
          >
            {reviewing ? 'Saving...' : 'Mark as Reviewed'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AbnormalAlert;
