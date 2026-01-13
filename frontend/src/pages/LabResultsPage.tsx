import React, { useState, useEffect } from 'react';
import {
  Container,
  Paper,
  Typography,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  TextField,
  MenuItem,
  Grid,
  Alert,
  Tooltip,
  CircularProgress,
  Button,
  Card,
  CardContent
} from '@mui/material';
import {
  TrendingUp as TrendIcon,
  Warning as WarningIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Visibility as ViewIcon
} from '@mui/icons-material';
import ResultViewer from '../components/ResultViewer';

interface LabResult {
  id: string;
  patient_name: string;
  mrn: string;
  test_code: string;
  test_name: string;
  result_value: string;
  result_unit?: string;
  reference_range_text?: string;
  is_abnormal: boolean;
  is_critical: boolean;
  abnormal_flag?: string;
  result_status: string;
  result_date: string;
  ordering_provider_name: string;
  order_date: string;
}

interface CriticalNotification {
  id: string;
  patient_name: string;
  mrn: string;
  test_name: string;
  result_value: string;
  critical_reason: string;
  status: string;
  created_at: string;
}

const LabResultsPage: React.FC = () => {
  const [results, setResults] = useState<LabResult[]>([]);
  const [criticalNotifications, setCriticalNotifications] = useState<CriticalNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedResult, setSelectedResult] = useState<LabResult | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);

  // Filters
  const [abnormalOnly, setAbnormalOnly] = useState(false);
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [patientFilter, setPatientFilter] = useState('');

  useEffect(() => {
    fetchResults();
    fetchCriticalNotifications();
  }, [abnormalOnly, criticalOnly]);

  const fetchResults = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();

      if (abnormalOnly) params.append('abnormal_only', 'true');
      if (criticalOnly) params.append('critical_only', 'true');

      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'}/api/lab-results?${params}`, {
        credentials: 'include'
      });

      if (!response.ok) throw new Error('Failed to fetch lab results');

      const data = await response.json();
      setResults(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchCriticalNotifications = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'}/api/lab-results/critical`, {
        credentials: 'include'
      });

      if (!response.ok) throw new Error('Failed to fetch critical notifications');

      const data = await response.json();
      setCriticalNotifications(data);
    } catch (err: any) {
      console.error('Error fetching critical notifications:', err);
    }
  };

  const handleAcknowledgeCritical = async (notificationId: string) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'}/api/lab-results/critical/${notificationId}/acknowledge`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            notification_method: 'in_app',
            action_taken: 'Reviewed and will follow up with patient'
          })
        }
      );

      if (!response.ok) throw new Error('Failed to acknowledge notification');

      fetchCriticalNotifications();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const getAbnormalIcon = (result: LabResult) => {
    if (result.is_critical) {
      return <ErrorIcon color="error" fontSize="small" />;
    }
    if (result.is_abnormal) {
      return <WarningIcon color="warning" fontSize="small" />;
    }
    return <CheckIcon color="success" fontSize="small" />;
  };

  const getAbnormalChip = (result: LabResult) => {
    if (result.is_critical) {
      return <Chip label="CRITICAL" color="error" size="small" />;
    }
    if (result.is_abnormal) {
      const flagText = result.abnormal_flag === 'H' ? 'HIGH' : result.abnormal_flag === 'L' ? 'LOW' : 'ABNORMAL';
      return <Chip label={flagText} color="warning" size="small" />;
    }
    return <Chip label="NORMAL" color="success" size="small" variant="outlined" />;
  };

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Laboratory Results
      </Typography>

      {/* Critical Notifications */}
      {criticalNotifications.length > 0 && (
        <Alert severity="error" sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            {criticalNotifications.length} Critical Value Alert{criticalNotifications.length > 1 ? 's' : ''}
          </Typography>
          {criticalNotifications.map((notification) => (
            <Card key={notification.id} sx={{ mb: 2, bgcolor: '#fff3e0' }}>
              <CardContent>
                <Grid container spacing={2} alignItems="center">
                  <Grid item xs={12} md={8}>
                    <Typography variant="subtitle1">
                      <strong>{notification.patient_name}</strong> (MRN: {notification.mrn})
                    </Typography>
                    <Typography variant="body2">
                      {notification.test_name}: <strong>{notification.result_value}</strong>
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      {notification.critical_reason}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      {new Date(notification.created_at).toLocaleString()}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} md={4} sx={{ textAlign: 'right' }}>
                    {notification.status === 'pending' && (
                      <Button
                        variant="contained"
                        color="error"
                        size="small"
                        onClick={() => handleAcknowledgeCritical(notification.id)}
                      >
                        Acknowledge
                      </Button>
                    )}
                    {notification.status === 'acknowledged' && (
                      <Chip label="Acknowledged" color="success" size="small" />
                    )}
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          ))}
        </Alert>
      )}

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={3}>
            <TextField
              fullWidth
              select
              label="Filter"
              value={abnormalOnly ? 'abnormal' : criticalOnly ? 'critical' : 'all'}
              onChange={(e) => {
                if (e.target.value === 'abnormal') {
                  setAbnormalOnly(true);
                  setCriticalOnly(false);
                } else if (e.target.value === 'critical') {
                  setAbnormalOnly(false);
                  setCriticalOnly(true);
                } else {
                  setAbnormalOnly(false);
                  setCriticalOnly(false);
                }
              }}
              size="small"
            >
              <MenuItem value="all">All Results</MenuItem>
              <MenuItem value="abnormal">Abnormal Only</MenuItem>
              <MenuItem value="critical">Critical Only</MenuItem>
            </TextField>
          </Grid>
        </Grid>
      </Paper>

      {/* Results Table */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : error ? (
        <Alert severity="error">{error}</Alert>
      ) : results.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="textSecondary">No lab results found</Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Result Date</TableCell>
                <TableCell>Patient</TableCell>
                <TableCell>Test</TableCell>
                <TableCell>Result</TableCell>
                <TableCell>Reference Range</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Provider</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {results.map((result) => (
                <TableRow
                  key={result.id}
                  hover
                  sx={{
                    bgcolor: result.is_critical
                      ? '#ffebee'
                      : result.is_abnormal
                      ? '#fff3e0'
                      : 'inherit'
                  }}
                >
                  <TableCell>
                    {new Date(result.result_date).toLocaleDateString()}
                    <Typography variant="caption" display="block" color="textSecondary">
                      {new Date(result.result_date).toLocaleTimeString()}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <div>
                      <strong>{result.patient_name}</strong>
                      <div style={{ fontSize: '0.85em', color: '#666' }}>
                        MRN: {result.mrn}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <strong>{result.test_name}</strong>
                      <Typography variant="caption" display="block" color="textSecondary">
                        {result.test_code}
                      </Typography>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {getAbnormalIcon(result)}
                      <div>
                        <strong>
                          {result.result_value} {result.result_unit}
                        </strong>
                      </div>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {result.reference_range_text || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {getAbnormalChip(result)}
                  </TableCell>
                  <TableCell>{result.ordering_provider_name}</TableCell>
                  <TableCell>
                    <Tooltip title="View Details">
                      <IconButton
                        size="small"
                        onClick={() => {
                          setSelectedResult(result);
                          setViewDialogOpen(true);
                        }}
                      >
                        <ViewIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="View Trends">
                      <IconButton size="small" color="primary">
                        <TrendIcon />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Result Viewer Dialog */}
      <Dialog
        open={viewDialogOpen}
        onClose={() => setViewDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Lab Result Details</DialogTitle>
        <DialogContent>
          {selectedResult && <ResultViewer result={selectedResult} />}
        </DialogContent>
      </Dialog>
    </Container>
  );
};

export default LabResultsPage;
