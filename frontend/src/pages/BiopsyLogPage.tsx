import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogContent,
  Divider,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  AssignmentTurnedIn as TaskIcon,
  CalendarMonth as CalendarIcon,
  Download as DownloadIcon,
  FactCheck as ReviewIcon,
  LocalHospital as LabIcon,
  NotificationsActive as NotifyIcon,
  Person as PatientIcon,
  Search as SearchIcon,
  Shield as SafetyIcon,
  Visibility as ViewIcon,
  WarningAmber as WarningIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import BiopsyResultReview from '../components/Biopsy/BiopsyResultReview';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL, createTask } from '../api';

type Severity = 'low' | 'medium' | 'high' | 'critical';
type QueueTab = 'critical' | 'pendingResults' | 'pendingReview' | 'pendingNotification' | 'treatmentFollowUp' | 'all';

interface BiopsySafetyFlag {
  id: string;
  type: string;
  severity: Severity;
  title: string;
  message: string;
  action: string;
}

interface Biopsy {
  id: string;
  specimen_id: string;
  patient_id?: string;
  patientId?: string;
  patient_name: string;
  mrn: string;
  body_location: string;
  specimen_type: string;
  status: string;
  ordered_at: string;
  sent_at?: string | null;
  resulted_at: string | null;
  reviewed_at?: string | null;
  pathology_diagnosis: string | null;
  malignancy_type: string | null;
  diagnosis_code: string | null;
  follow_up_action: string | null;
  turnaround_time_days: number | null;
  ordering_provider_name: string;
  path_lab: string;
  patient_notified: boolean;
  days_since_sent?: number | null;
  days_since_result?: number | null;
  safety_flags?: BiopsySafetyFlag[];
  highest_severity?: Severity | null;
  safety_stage?: string;
  loop_status?: string;
  next_action?: string;
}

interface CommandCenterSummary {
  total_open_loops: number;
  overdue_results: number;
  pending_review: number;
  needs_patient_notification: number;
  needs_treatment_scheduling: number;
  open_malignancies: number;
  open_melanomas: number;
  closed_loop_complete: number;
  critical_items: number;
  avg_turnaround_days: number | null;
}

interface CommandCenterResponse {
  generated_at: string;
  summary: CommandCenterSummary;
  queues: Record<string, Biopsy[]>;
  biopsies: Biopsy[];
}

interface QualityMetrics {
  total_biopsies: number;
  avg_turnaround_days: number | null;
  within_7_days: number;
  within_7_days_percentage: number | null;
  total_overdue: number;
  total_malignancies: number;
  total_melanoma: number;
  patients_notified: number;
  completed_biopsies: number;
}

const severityColors: Record<Severity, 'default' | 'warning' | 'error' | 'info'> = {
  low: 'info',
  medium: 'warning',
  high: 'error',
  critical: 'error',
};

const queueLabels: Record<QueueTab, string> = {
  critical: 'Safety Queue',
  pendingResults: 'Pending Results',
  pendingReview: 'Provider Review',
  pendingNotification: 'Notify Patient',
  treatmentFollowUp: 'Treatment Follow-up',
  all: 'All Biopsies',
};

function patientIdFor(biopsy: Biopsy): string {
  return biopsy.patient_id || biopsy.patientId || '';
}

function formatDate(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return format(date, 'MM/dd/yyyy');
}

function statusColor(status: string): 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error' {
  switch (status) {
    case 'sent':
    case 'processing':
    case 'received_by_lab':
      return 'secondary';
    case 'resulted':
      return 'warning';
    case 'reviewed':
      return 'primary';
    case 'closed':
      return 'success';
    default:
      return 'default';
  }
}

function MetricCard({
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  tone?: 'neutral' | 'danger' | 'warning' | 'success' | 'info';
}) {
  const palette = {
    neutral: { border: '#d9dee7', bg: '#ffffff', color: 'text.primary' },
    danger: { border: '#f0b8b8', bg: '#fff7f7', color: 'error.main' },
    warning: { border: '#f0d28a', bg: '#fffbeb', color: 'warning.dark' },
    success: { border: '#a9d8bf', bg: '#f3fbf6', color: 'success.dark' },
    info: { border: '#afc9ef', bg: '#f5f9ff', color: 'primary.main' },
  }[tone];

  return (
    <Card variant="outlined" sx={{ height: '100%', borderColor: palette.border, bgcolor: palette.bg, borderRadius: 2 }}>
      <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
          {label}
        </Typography>
        <Typography variant="h4" sx={{ mt: 0.5, fontWeight: 800, color: palette.color }}>
          {value}
        </Typography>
        {detail && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {detail}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

const BiopsyLogPage: React.FC = () => {
  const navigate = useNavigate();
  const { session, headers } = useAuth();
  const [commandCenter, setCommandCenter] = useState<CommandCenterResponse | null>(null);
  const [metrics, setMetrics] = useState<QualityMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [selectedQueue, setSelectedQueue] = useState<QueueTab>('critical');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [malignancyFilter, setMalignancyFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedBiopsyId, setSelectedBiopsyId] = useState<string | null>(null);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!session) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [commandRes, metricsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/biopsies/command-center`, { headers }),
        fetch(`${API_BASE_URL}/api/biopsies/quality-metrics`, { headers }),
      ]);

      if (!commandRes.ok) throw new Error('Failed to load biopsy command center');
      if (!metricsRes.ok) throw new Error('Failed to load biopsy quality metrics');

      setCommandCenter(await commandRes.json());
      setMetrics(await metricsRes.json());
    } catch (error: any) {
      console.error('Error loading biopsy command center:', error);
      toast.error(error.message || 'Failed to load biopsy safety data');
    } finally {
      setLoading(false);
    }
  }, [headers, session]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const allRows = commandCenter?.biopsies || [];

  const queueRows = useMemo(() => {
    if (!commandCenter) return [];
    if (selectedQueue === 'all') return allRows;
    return commandCenter.queues[selectedQueue] || [];
  }, [allRows, commandCenter, selectedQueue]);

  const filteredRows = useMemo(() => {
    let rows = [...queueRows];
    const term = searchTerm.trim().toLowerCase();

    if (term) {
      rows = rows.filter((biopsy) =>
        [
          biopsy.specimen_id,
          biopsy.patient_name,
          biopsy.mrn,
          biopsy.body_location,
          biopsy.pathology_diagnosis,
          biopsy.path_lab,
          biopsy.loop_status,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term)),
      );
    }

    if (statusFilter !== 'all') {
      rows = rows.filter((biopsy) => biopsy.status === statusFilter);
    }

    if (malignancyFilter !== 'all') {
      if (malignancyFilter === 'malignant') {
        rows = rows.filter((biopsy) => Boolean(biopsy.malignancy_type));
      } else if (malignancyFilter === 'benign') {
        rows = rows.filter((biopsy) => !biopsy.malignancy_type && Boolean(biopsy.pathology_diagnosis));
      } else {
        rows = rows.filter((biopsy) => biopsy.malignancy_type === malignancyFilter);
      }
    }

    if (startDate) {
      rows = rows.filter((biopsy) => new Date(biopsy.ordered_at) >= new Date(startDate));
    }

    if (endDate) {
      rows = rows.filter((biopsy) => new Date(biopsy.ordered_at) <= new Date(endDate));
    }

    return rows;
  }, [endDate, malignancyFilter, queueRows, searchTerm, startDate, statusFilter]);

  const paginatedRows = filteredRows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  const summary = commandCenter?.summary;
  const safetyQueue = commandCenter?.queues.critical || [];

  useEffect(() => {
    setPage(0);
  }, [selectedQueue, searchTerm, statusFilter, malignancyFilter, startDate, endDate]);

  const openReviewDialog = (biopsyId: string) => {
    setSelectedBiopsyId(biopsyId);
    setShowReviewDialog(true);
  };

  const closeReviewDialog = () => {
    setShowReviewDialog(false);
    setSelectedBiopsyId(null);
  };

  const handleNotifyPatient = async (biopsy: Biopsy) => {
    setActionBusyId(biopsy.id);
    try {
      const response = await fetch(`${API_BASE_URL}/api/biopsies/${biopsy.id}/notify-patient`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          method: 'phone',
          notes: `Notification recorded from biopsy safety queue for ${biopsy.specimen_id}.`,
        }),
      });
      if (!response.ok) throw new Error('Failed to record patient notification');
      toast.success('Patient notification recorded');
      await loadData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to record notification');
    } finally {
      setActionBusyId(null);
    }
  };

  const handleCreateTask = async (biopsy: Biopsy) => {
    if (!session) return;
    setActionBusyId(biopsy.id);
    try {
      const severity = biopsy.highest_severity;
      await createTask(session.tenantId, session.accessToken, {
        title: `Biopsy follow-up: ${biopsy.specimen_id}`,
        description: `${biopsy.patient_name} (${biopsy.mrn}) - ${biopsy.loop_status || 'Biopsy follow-up'} at ${biopsy.body_location}. ${biopsy.next_action || ''}`,
        category: 'lab-path-followup',
        priority: severity === 'critical' ? 'urgent' : severity === 'high' ? 'high' : 'normal',
        status: 'todo',
        patientId: patientIdFor(biopsy) || undefined,
        dueDate: new Date().toISOString().slice(0, 10),
      });
      toast.success('Safety task created');
    } catch (error: any) {
      toast.error(error.message || 'Failed to create safety task');
    } finally {
      setActionBusyId(null);
    }
  };

  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', new Date(startDate).toISOString());
      if (endDate) params.append('end_date', new Date(endDate).toISOString());
      const response = await fetch(`${API_BASE_URL}/api/biopsies/export/log?${params.toString()}`, { headers });
      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `biopsy-log-${format(new Date(), 'yyyy-MM-dd')}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(anchor);
      toast.success('Biopsy log exported');
    } catch (error: any) {
      toast.error(error.message || 'Failed to export biopsy log');
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setMalignancyFilter('all');
    setStartDate('');
    setEndDate('');
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1680, mx: 'auto' }}>
        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'stretch', lg: 'center' }} sx={{ mb: 3 }}>
          <Box>
            <Stack direction="row" alignItems="center" spacing={1.25}>
              <SafetyIcon color="primary" />
              <Typography variant="h4" sx={{ fontWeight: 800 }}>
                Biopsy Safety Command Center
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {commandCenter ? `Updated ${format(new Date(commandCenter.generated_at), 'MMM d, yyyy h:mm a')}` : 'Loading pathology safety queues'}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button variant="outlined" startIcon={<LabIcon />} onClick={() => navigate('/labs?tab=pending-results')}>
              Labs/Path
            </Button>
            <Button variant="outlined" startIcon={<TaskIcon />} onClick={() => navigate('/tasks?category=Clinical')}>
              Tasks
            </Button>
            <Button variant="contained" startIcon={<DownloadIcon />} onClick={handleExport}>
              Export
            </Button>
          </Stack>
        </Stack>

        {loading && <LinearProgress sx={{ mb: 2 }} />}

        {summary && (
          <Grid container spacing={2} sx={{ mb: 2.5 }}>
            <Grid item xs={12} sm={6} lg={2}>
              <MetricCard label="Open Loops" value={summary.total_open_loops} detail={`${summary.critical_items} critical`} tone="danger" />
            </Grid>
            <Grid item xs={12} sm={6} lg={2}>
              <MetricCard label="Overdue Results" value={summary.overdue_results} detail="Lab follow-up needed" tone="warning" />
            </Grid>
            <Grid item xs={12} sm={6} lg={2}>
              <MetricCard label="Pending Review" value={summary.pending_review} detail="Provider sign-off" tone="info" />
            </Grid>
            <Grid item xs={12} sm={6} lg={2}>
              <MetricCard label="Notify Patient" value={summary.needs_patient_notification} detail="Documentation missing" tone="warning" />
            </Grid>
            <Grid item xs={12} sm={6} lg={2}>
              <MetricCard label="Treatment Needed" value={summary.needs_treatment_scheduling} detail={`${summary.open_melanomas} melanoma`} tone="danger" />
            </Grid>
            <Grid item xs={12} sm={6} lg={2}>
              <MetricCard
                label="Avg Turnaround"
                value={summary.avg_turnaround_days == null ? 'N/A' : `${Math.round(summary.avg_turnaround_days)}d`}
                detail={metrics?.within_7_days_percentage == null ? 'No completed TAT' : `${metrics.within_7_days_percentage}% within 7 days`}
                tone="success"
              />
            </Grid>
          </Grid>
        )}

        {safetyQueue.length > 0 && (
          <Paper variant="outlined" sx={{ mb: 2.5, borderRadius: 2, overflow: 'hidden' }}>
            <Box sx={{ p: 2, bgcolor: '#fff8f1', borderBottom: '1px solid', borderColor: 'divider' }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <WarningIcon color="warning" />
                <Typography variant="h6" sx={{ fontWeight: 800 }}>
                  Highest Priority Safety Queue
                </Typography>
              </Stack>
            </Box>
            <Stack divider={<Divider />} sx={{ p: 0 }}>
              {safetyQueue.slice(0, 5).map((biopsy) => (
                <Stack
                  key={biopsy.id}
                  direction={{ xs: 'column', md: 'row' }}
                  spacing={2}
                  justifyContent="space-between"
                  alignItems={{ xs: 'stretch', md: 'center' }}
                  sx={{ p: 2 }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Chip
                        label={biopsy.highest_severity || 'open'}
                        color={biopsy.highest_severity ? severityColors[biopsy.highest_severity] : 'default'}
                        size="small"
                        sx={{ textTransform: 'capitalize', fontWeight: 700 }}
                      />
                      <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                        {biopsy.patient_name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {biopsy.specimen_id} - {biopsy.body_location}
                      </Typography>
                    </Stack>
                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                      {biopsy.loop_status}: {biopsy.next_action}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Button size="small" startIcon={<ReviewIcon />} variant="contained" onClick={() => openReviewDialog(biopsy.id)}>
                      Review
                    </Button>
                    {biopsy.status === 'reviewed' && !biopsy.patient_notified && (
                      <Button size="small" startIcon={<NotifyIcon />} variant="outlined" disabled={actionBusyId === biopsy.id} onClick={() => handleNotifyPatient(biopsy)}>
                        Notify
                      </Button>
                    )}
                    <Button size="small" startIcon={<CalendarIcon />} variant="outlined" onClick={() => navigate(`/schedule?patientId=${patientIdFor(biopsy)}&reason=${encodeURIComponent(`Biopsy follow-up ${biopsy.specimen_id}`)}`)}>
                      Schedule
                    </Button>
                    <Button size="small" startIcon={<TaskIcon />} variant="outlined" disabled={actionBusyId === biopsy.id} onClick={() => handleCreateTask(biopsy)}>
                      Task
                    </Button>
                  </Stack>
                </Stack>
              ))}
            </Stack>
          </Paper>
        )}

        <Paper variant="outlined" sx={{ p: 2, mb: 2.5, borderRadius: 2 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="Search"
                placeholder="Specimen, patient, MRN, diagnosis, lab..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} /> }}
              />
            </Grid>
            <Grid item xs={6} md={2}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select value={statusFilter} label="Status" onChange={(event) => setStatusFilter(event.target.value)}>
                  <MenuItem value="all">All Statuses</MenuItem>
                  <MenuItem value="ordered">Ordered</MenuItem>
                  <MenuItem value="collected">Collected</MenuItem>
                  <MenuItem value="sent">Sent</MenuItem>
                  <MenuItem value="received_by_lab">Received by Lab</MenuItem>
                  <MenuItem value="processing">Processing</MenuItem>
                  <MenuItem value="resulted">Resulted</MenuItem>
                  <MenuItem value="reviewed">Reviewed</MenuItem>
                  <MenuItem value="closed">Closed</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} md={2}>
              <FormControl fullWidth>
                <InputLabel>Result Type</InputLabel>
                <Select value={malignancyFilter} label="Result Type" onChange={(event) => setMalignancyFilter(event.target.value)}>
                  <MenuItem value="all">All Results</MenuItem>
                  <MenuItem value="benign">Benign</MenuItem>
                  <MenuItem value="malignant">Any Malignancy</MenuItem>
                  <MenuItem value="melanoma">Melanoma</MenuItem>
                  <MenuItem value="BCC">BCC</MenuItem>
                  <MenuItem value="SCC">SCC</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} md={2}>
              <TextField
                fullWidth
                type="date"
                label="Start Date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={6} md={2}>
              <TextField
                fullWidth
                type="date"
                label="End Date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Button size="small" onClick={clearFilters}>
                  Clear Filters
                </Button>
                <Typography variant="body2" color="text.secondary">
                  Showing {filteredRows.length} of {queueRows.length} in {queueLabels[selectedQueue]}
                </Typography>
              </Stack>
            </Grid>
          </Grid>
        </Paper>

        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
          <Tabs
            value={selectedQueue}
            onChange={(_, value) => setSelectedQueue(value)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ px: 1, borderBottom: '1px solid', borderColor: 'divider' }}
          >
            <Tab value="critical" label={`Safety Queue (${commandCenter?.queues.critical?.length || 0})`} />
            <Tab value="pendingResults" label={`Pending Results (${commandCenter?.queues.pendingResults?.length || 0})`} />
            <Tab value="pendingReview" label={`Review (${commandCenter?.queues.pendingReview?.length || 0})`} />
            <Tab value="pendingNotification" label={`Notify (${commandCenter?.queues.pendingNotification?.length || 0})`} />
            <Tab value="treatmentFollowUp" label={`Treatment (${commandCenter?.queues.treatmentFollowUp?.length || 0})`} />
            <Tab value="all" label={`All (${allRows.length})`} />
          </Tabs>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Loop</TableCell>
                  <TableCell>Specimen</TableCell>
                  <TableCell>Patient</TableCell>
                  <TableCell>Location</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Diagnosis</TableCell>
                  <TableCell>Timing</TableCell>
                  <TableCell>Provider/Lab</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9}>
                      <Alert severity={loading ? 'info' : 'success'} sx={{ my: 2 }}>
                        {loading ? 'Loading biopsy safety data...' : 'No biopsies match the current queue and filters.'}
                      </Alert>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedRows.map((biopsy) => (
                    <TableRow key={biopsy.id} hover>
                      <TableCell sx={{ minWidth: 180 }}>
                        <Stack spacing={0.75}>
                          <Typography variant="body2" sx={{ fontWeight: 800 }}>
                            {biopsy.loop_status || 'Open loop'}
                          </Typography>
                          {biopsy.highest_severity && (
                            <Chip
                              label={biopsy.highest_severity}
                              color={severityColors[biopsy.highest_severity]}
                              size="small"
                              sx={{ width: 'fit-content', textTransform: 'capitalize', fontWeight: 700 }}
                            />
                          )}
                          <Typography variant="caption" color="text.secondary">
                            {biopsy.next_action || 'Monitor status'}
                          </Typography>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 800 }}>
                          {biopsy.specimen_id}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'capitalize' }}>
                          {biopsy.specimen_type}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{biopsy.patient_name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {biopsy.mrn}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{biopsy.body_location}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={biopsy.status.replaceAll('_', ' ')} color={statusColor(biopsy.status)} size="small" sx={{ textTransform: 'capitalize' }} />
                      </TableCell>
                      <TableCell sx={{ minWidth: 240 }}>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 260 }}>
                          {biopsy.pathology_diagnosis || 'Pending pathology'}
                        </Typography>
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                          {biopsy.malignancy_type && <Chip label={biopsy.malignancy_type} size="small" color="error" />}
                          {biopsy.diagnosis_code && <Chip label={biopsy.diagnosis_code} size="small" variant="outlined" />}
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">Ordered {formatDate(biopsy.ordered_at)}</Typography>
                        <Typography variant="caption" color={Number(biopsy.days_since_sent || 0) > 7 && !biopsy.resulted_at ? 'error.main' : 'text.secondary'}>
                          {biopsy.resulted_at
                            ? `TAT ${biopsy.turnaround_time_days ?? '-'}d`
                            : biopsy.sent_at
                              ? `${biopsy.days_since_sent ?? '-'}d since sent`
                              : 'Not sent'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 180 }}>
                          {biopsy.ordering_provider_name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', maxWidth: 180 }}>
                          {biopsy.path_lab}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          <Tooltip title="Open patient chart">
                            <span>
                              <IconButton size="small" disabled={!patientIdFor(biopsy)} onClick={() => navigate(`/patients/${patientIdFor(biopsy)}`)}>
                                <PatientIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Review result">
                            <IconButton size="small" onClick={() => openReviewDialog(biopsy.id)}>
                              <ViewIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Create safety task">
                            <span>
                              <IconButton size="small" disabled={actionBusyId === biopsy.id} onClick={() => handleCreateTask(biopsy)}>
                                <TaskIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Schedule follow-up">
                            <span>
                              <IconButton
                                size="small"
                                disabled={!patientIdFor(biopsy)}
                                onClick={() => navigate(`/schedule?patientId=${patientIdFor(biopsy)}&reason=${encodeURIComponent(`Biopsy follow-up ${biopsy.specimen_id}`)}`)}
                              >
                                <CalendarIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          {biopsy.status === 'reviewed' && !biopsy.patient_notified && (
                            <Tooltip title="Mark patient notified">
                              <span>
                                <IconButton size="small" disabled={actionBusyId === biopsy.id} onClick={() => handleNotifyPatient(biopsy)}>
                                  <NotifyIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <TablePagination
            rowsPerPageOptions={[10, 25, 50, 100]}
            component="div"
            count={filteredRows.length}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            onRowsPerPageChange={(event) => {
              setRowsPerPage(parseInt(event.target.value, 10));
              setPage(0);
            }}
          />
        </Paper>

        <Dialog open={showReviewDialog} onClose={closeReviewDialog} maxWidth="lg" fullWidth>
          <DialogContent>
            {selectedBiopsyId && (
              <BiopsyResultReview
                biopsyId={selectedBiopsyId}
                onClose={closeReviewDialog}
                onReviewComplete={async () => {
                  closeReviewDialog();
                  await loadData();
                }}
              />
            )}
          </DialogContent>
        </Dialog>
    </Box>
  );
};

export default BiopsyLogPage;
