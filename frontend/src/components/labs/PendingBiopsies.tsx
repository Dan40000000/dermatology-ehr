/**
 * Pending Biopsies Component
 * Dashboard view of biopsies awaiting pathology results
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
  MenuItem,
  Alert,
  Skeleton,
  Tooltip,
  Badge,
  LinearProgress
} from '@mui/material';
import {
  Visibility as VisibilityIcon,
  Refresh as RefreshIcon,
  LocalHospital as LocalHospitalIcon,
  Schedule as ScheduleIcon,
  Warning as WarningIcon
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE_URL } from '../../utils/apiBase';

interface PendingBiopsiesProps {
  providerId?: string;
  onViewResult?: (orderId: string) => void;
  maxItems?: number;
  compact?: boolean;
}

interface PendingBiopsy {
  id: string;
  order_number: string;
  order_date: string;
  patient_name: string;
  mrn: string;
  specimen_type: string;
  specimen_site?: string;
  clinical_diagnosis?: string;
  status: string;
  priority: string;
  provider_name: string;
  days_pending: number;
  accession_number?: string;
}

const getStatusColor = (status: string): 'default' | 'primary' | 'secondary' | 'info' | 'warning' | 'error' => {
  switch (status) {
    case 'pending':
      return 'default';
    case 'in_transit':
      return 'info';
    case 'received':
      return 'primary';
    case 'processing':
      return 'secondary';
    default:
      return 'default';
  }
};

const getPriorityColor = (priority: string): 'default' | 'warning' | 'error' => {
  switch (priority) {
    case 'stat':
      return 'error';
    case 'urgent':
      return 'warning';
    default:
      return 'default';
  }
};

const getDaysWarningLevel = (days: number): 'success' | 'warning' | 'error' => {
  if (days > 10) return 'error';
  if (days > 5) return 'warning';
  return 'success';
};

export const PendingBiopsies: React.FC<PendingBiopsiesProps> = ({
  providerId,
  onViewResult,
  maxItems = 50,
  compact = false
}) => {
  const { session } = useAuth();

  const [biopsies, setBiopsies] = useState<PendingBiopsy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

  const fetchPendingBiopsies = useCallback(async () => {
    if (!session) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (providerId) params.append('providerId', providerId);
      params.append('limit', String(maxItems));

      const url = `${API_BASE_URL}/api/labs/pathology/pending${params.toString() ? `?${params.toString()}` : ''}`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${session.accessToken}`,
          'x-tenant-id': session.tenantId
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch pending biopsies');
      }

      const data = await response.json();
      setBiopsies(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [session, providerId, maxItems]);

  useEffect(() => {
    fetchPendingBiopsies();
  }, [fetchPendingBiopsies]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchPendingBiopsies();
    setRefreshing(false);
  };

  // Filter biopsies by status
  const filteredBiopsies = biopsies.filter(biopsy => {
    if (statusFilter === 'all') return true;
    return biopsy.status === statusFilter;
  });

  // Summary statistics
  const stats = {
    total: biopsies.length,
    pending: biopsies.filter(b => b.status === 'pending').length,
    inTransit: biopsies.filter(b => b.status === 'in_transit').length,
    received: biopsies.filter(b => b.status === 'received').length,
    processing: biopsies.filter(b => b.status === 'processing').length,
    overdue: biopsies.filter(b => b.days_pending > 7).length
  };

  if (loading) {
    return (
      <Box>
        <Skeleton variant="rectangular" height={compact ? 200 : 400} />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" action={
        <Button color="inherit" size="small" onClick={handleRefresh}>
          Retry
        </Button>
      }>
        {error}
      </Alert>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <LocalHospitalIcon color="primary" />
          <Typography variant="h6">
            Pending Biopsies
          </Typography>
          <Badge badgeContent={stats.overdue} color="error" sx={{ ml: 1 }}>
            <Chip
              label={`${stats.total} Total`}
              size="small"
              variant="outlined"
            />
          </Badge>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          {!compact && (
            <TextField
              select
              size="small"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              sx={{ minWidth: 150 }}
            >
              <MenuItem value="all">All Statuses</MenuItem>
              <MenuItem value="pending">Pending</MenuItem>
              <MenuItem value="in_transit">In Transit</MenuItem>
              <MenuItem value="received">Received</MenuItem>
              <MenuItem value="processing">Processing</MenuItem>
            </TextField>
          )}
          <IconButton onClick={handleRefresh} disabled={refreshing}>
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      {refreshing && <LinearProgress sx={{ mb: 1 }} />}

      {/* Summary Stats (non-compact mode) */}
      {!compact && (
        <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
          <Chip
            icon={<ScheduleIcon />}
            label={`${stats.pending} Pending`}
            size="small"
            variant="outlined"
          />
          <Chip
            label={`${stats.inTransit} In Transit`}
            size="small"
            color="info"
            variant="outlined"
          />
          <Chip
            label={`${stats.received} Received`}
            size="small"
            color="primary"
            variant="outlined"
          />
          <Chip
            label={`${stats.processing} Processing`}
            size="small"
            color="secondary"
            variant="outlined"
          />
          {stats.overdue > 0 && (
            <Chip
              icon={<WarningIcon />}
              label={`${stats.overdue} Overdue (>7 days)`}
              size="small"
              color="error"
              variant="outlined"
            />
          )}
        </Box>
      )}

      {/* Empty State */}
      {filteredBiopsies.length === 0 ? (
        <Alert severity="info" icon={<LocalHospitalIcon />}>
          No pending biopsies found.
        </Alert>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Patient</TableCell>
                <TableCell>Specimen</TableCell>
                {!compact && <TableCell>Clinical Dx</TableCell>}
                <TableCell>Status</TableCell>
                <TableCell align="center">Days</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredBiopsies.map((biopsy) => (
                <TableRow
                  key={biopsy.id}
                  hover
                  sx={{
                    backgroundColor: biopsy.days_pending > 10
                      ? 'error.light'
                      : biopsy.days_pending > 7
                        ? 'warning.light'
                        : undefined
                  }}
                >
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {biopsy.patient_name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      MRN: {biopsy.mrn}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {biopsy.specimen_type}
                    </Typography>
                    {biopsy.specimen_site && (
                      <Typography variant="caption" color="text.secondary">
                        {biopsy.specimen_site}
                      </Typography>
                    )}
                  </TableCell>
                  {!compact && (
                    <TableCell>
                      <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                        {biopsy.clinical_diagnosis || '-'}
                      </Typography>
                    </TableCell>
                  )}
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      <Chip
                        label={biopsy.status.replace('_', ' ')}
                        size="small"
                        color={getStatusColor(biopsy.status)}
                      />
                      {biopsy.priority !== 'routine' && (
                        <Chip
                          label={biopsy.priority}
                          size="small"
                          color={getPriorityColor(biopsy.priority)}
                        />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title={`Ordered ${new Date(biopsy.order_date).toLocaleDateString()}`}>
                      <Chip
                        label={`${biopsy.days_pending}d`}
                        size="small"
                        color={getDaysWarningLevel(biopsy.days_pending)}
                        variant={biopsy.days_pending > 7 ? 'filled' : 'outlined'}
                      />
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Tooltip title="View Details">
                      <IconButton
                        size="small"
                        onClick={() => onViewResult?.(biopsy.id)}
                      >
                        <VisibilityIcon />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Show more link for compact mode */}
      {compact && biopsies.length > 0 && (
        <Box sx={{ mt: 1, textAlign: 'center' }}>
          <Button size="small">
            View All Pending Biopsies
          </Button>
        </Box>
      )}
    </Box>
  );
};

export default PendingBiopsies;
