import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Tooltip,
  TextField,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  Button,
  Alert,
  LinearProgress,
  Badge,
  Tabs,
  Tab
} from '@mui/material';
import {
  Visibility as ViewIcon,
  Warning as WarningIcon,
  CheckCircle as CheckIcon,
  Schedule as ScheduleIcon,
  LocalShipping as ShippingIcon,
  Science as ScienceIcon,
  Assignment as AssignmentIcon,
  Notifications as NotificationIcon
} from '@mui/icons-material';
import { format, differenceInDays } from 'date-fns';
import toast from 'react-hot-toast';

interface BiopsyTrackerProps {
  providerId?: string;
  onViewBiopsy: (biopsyId: string) => void;
}

interface Biopsy {
  id: string;
  specimen_id: string;
  patient_name: string;
  mrn: string;
  body_location: string;
  specimen_type: string;
  status: string;
  ordered_at: string;
  collected_at: string | null;
  sent_at: string | null;
  resulted_at: string | null;
  reviewed_at: string | null;
  is_overdue: boolean;
  days_since_sent: number | null;
  malignancy_type: string | null;
  ordering_provider_name: string;
  path_lab: string;
  active_alert_count: number;
}

interface BiopsyStats {
  ordered_count: number;
  collected_count: number;
  sent_count: number;
  pending_review_count: number;
  overdue_count: number;
  malignancy_count: number;
  melanoma_count: number;
  needs_patient_notification: number;
  avg_turnaround_days: number;
}

const BiopsyTracker: React.FC<BiopsyTrackerProps> = ({ providerId, onViewBiopsy }) => {
  const [biopsies, setBiopsies] = useState<Biopsy[]>([]);
  const [stats, setStats] = useState<BiopsyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState(0);
  const [statusFilter, setStatusFilter] = useState('all');
  const [overdueOnly, setOverdueOnly] = useState(false);

  useEffect(() => {
    fetchBiopsies();
    fetchStats();
    // Refresh every 5 minutes for safety-critical tracking
    const interval = setInterval(() => {
      fetchBiopsies();
      fetchStats();
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [providerId, statusFilter, overdueOnly]);

  const fetchBiopsies = async () => {
    try {
      const params = new URLSearchParams();
      if (providerId) params.append('ordering_provider_id', providerId);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (overdueOnly) params.append('is_overdue', 'true');

      const response = await fetch(`/api/biopsies?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setBiopsies(data.biopsies || []);
      }
    } catch (error) {
      console.error('Error fetching biopsies:', error);
      toast.error('Failed to load biopsies');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const params = new URLSearchParams();
      if (providerId) params.append('provider_id', providerId);

      const response = await fetch(`/api/biopsies/stats?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const getStatusColor = (status: string): 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error' => {
    switch (status) {
      case 'ordered':
        return 'default';
      case 'collected':
        return 'primary';
      case 'sent':
        return 'secondary';
      case 'resulted':
        return 'warning';
      case 'reviewed':
        return 'success';
      case 'closed':
        return 'success';
      default:
        return 'default';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ordered':
        return <ScheduleIcon fontSize="small" />;
      case 'collected':
        return <ScienceIcon fontSize="small" />;
      case 'sent':
        return <ShippingIcon fontSize="small" />;
      case 'resulted':
        return <AssignmentIcon fontSize="small" />;
      case 'reviewed':
      case 'closed':
        return <CheckIcon fontSize="small" />;
      default:
        return null;
    }
  };

  const formatStatus = (status: string): string => {
    return status.split('_').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const getDaysColor = (days: number | null, status: string): string => {
    if (!days || status === 'reviewed' || status === 'closed') return 'inherit';
    if (days > 7) return 'error.main';
    if (days > 5) return 'warning.main';
    return 'inherit';
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setSelectedTab(newValue);
    switch (newValue) {
      case 0: // All
        setStatusFilter('all');
        setOverdueOnly(false);
        break;
      case 1: // Pending
        setStatusFilter('all');
        setOverdueOnly(false);
        setBiopsies(prev => prev.filter(b => !['reviewed', 'closed'].includes(b.status)));
        break;
      case 2: // Needs Review
        setStatusFilter('resulted');
        setOverdueOnly(false);
        break;
      case 3: // Overdue
        setStatusFilter('all');
        setOverdueOnly(true);
        break;
    }
  };

  if (loading) {
    return <LinearProgress />;
  }

  return (
    <Box>
      <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <ScienceIcon />
        Biopsy Tracker
      </Typography>

      {/* Statistics Cards */}
      {stats && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={6} sm={4} md={2}>
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  Ordered
                </Typography>
                <Typography variant="h4">{stats.ordered_count}</Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={6} sm={4} md={2}>
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  In Transit
                </Typography>
                <Typography variant="h4">{stats.sent_count}</Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={6} sm={4} md={2}>
            <Card sx={{ bgcolor: 'warning.light' }}>
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  Needs Review
                </Typography>
                <Typography variant="h4">{stats.pending_review_count}</Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={6} sm={4} md={2}>
            <Card sx={{ bgcolor: stats.overdue_count > 0 ? 'error.light' : 'inherit' }}>
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  Overdue
                </Typography>
                <Typography variant="h4">
                  {stats.overdue_count}
                  {stats.overdue_count > 0 && <WarningIcon sx={{ ml: 1, color: 'error.main' }} />}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={6} sm={4} md={2}>
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  Malignancies
                </Typography>
                <Typography variant="h4">{stats.malignancy_count}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {stats.melanoma_count} melanoma
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={6} sm={4} md={2}>
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  Avg TAT
                </Typography>
                <Typography variant="h4">
                  {stats.avg_turnaround_days ? Math.round(stats.avg_turnaround_days) : '-'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  days
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Critical Alerts */}
      {stats && stats.overdue_count > 0 && (
        <Alert severity="error" icon={<WarningIcon />} sx={{ mb: 2 }}>
          <Typography variant="subtitle2" fontWeight="bold">
            PATIENT SAFETY ALERT: {stats.overdue_count} Overdue Biopsies
          </Typography>
          <Typography variant="body2">
            Biopsies sent over 7 days ago without results. Immediate follow-up required.
          </Typography>
        </Alert>
      )}

      {stats && stats.pending_review_count > 0 && (
        <Alert severity="warning" icon={<NotificationIcon />} sx={{ mb: 2 }}>
          <Typography variant="subtitle2" fontWeight="bold">
            {stats.pending_review_count} Results Pending Review
          </Typography>
          <Typography variant="body2">
            Pathology results have been received and require provider review and sign-off.
          </Typography>
        </Alert>
      )}

      {/* Filter Tabs */}
      <Paper sx={{ mb: 2 }}>
        <Tabs value={selectedTab} onChange={handleTabChange}>
          <Tab label="All Biopsies" />
          <Tab
            label="Pending"
            icon={
              <Badge badgeContent={stats ? stats.ordered_count + stats.sent_count : 0} color="primary">
                <span />
              </Badge>
            }
          />
          <Tab
            label="Needs Review"
            icon={
              <Badge badgeContent={stats?.pending_review_count} color="warning">
                <span />
              </Badge>
            }
          />
          <Tab
            label="Overdue"
            icon={
              <Badge badgeContent={stats?.overdue_count} color="error">
                <span />
              </Badge>
            }
          />
        </Tabs>
      </Paper>

      {/* Biopsy Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Specimen ID</TableCell>
              <TableCell>Patient</TableCell>
              <TableCell>Location</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Days Since Sent</TableCell>
              <TableCell>Ordered Date</TableCell>
              <TableCell>Path Lab</TableCell>
              <TableCell>Alerts</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {biopsies.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} align="center">
                  <Typography variant="body2" color="text.secondary" py={4}>
                    No biopsies found
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              biopsies.map((biopsy) => (
                <TableRow
                  key={biopsy.id}
                  sx={{
                    bgcolor: biopsy.is_overdue ? 'error.lighter' : 'inherit',
                    '&:hover': { bgcolor: 'action.hover' }
                  }}
                >
                  <TableCell>
                    <Typography variant="body2" fontWeight="bold">
                      {biopsy.specimen_id}
                    </Typography>
                    {biopsy.malignancy_type && (
                      <Chip
                        label={biopsy.malignancy_type}
                        size="small"
                        color="error"
                        sx={{ mt: 0.5 }}
                      />
                    )}
                  </TableCell>

                  <TableCell>
                    <Typography variant="body2">{biopsy.patient_name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      MRN: {biopsy.mrn}
                    </Typography>
                  </TableCell>

                  <TableCell>
                    <Typography variant="body2">{biopsy.body_location}</Typography>
                  </TableCell>

                  <TableCell>
                    <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>
                      {biopsy.specimen_type}
                    </Typography>
                  </TableCell>

                  <TableCell>
                    <Chip
                      icon={getStatusIcon(biopsy.status)}
                      label={formatStatus(biopsy.status)}
                      size="small"
                      color={getStatusColor(biopsy.status)}
                    />
                  </TableCell>

                  <TableCell>
                    {biopsy.days_since_sent !== null ? (
                      <Typography
                        variant="body2"
                        sx={{
                          color: getDaysColor(biopsy.days_since_sent, biopsy.status),
                          fontWeight: biopsy.is_overdue ? 'bold' : 'normal'
                        }}
                      >
                        {biopsy.days_since_sent} days
                        {biopsy.is_overdue && (
                          <WarningIcon fontSize="small" sx={{ ml: 0.5, verticalAlign: 'middle' }} />
                        )}
                      </Typography>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        Not sent
                      </Typography>
                    )}
                  </TableCell>

                  <TableCell>
                    <Typography variant="body2">
                      {format(new Date(biopsy.ordered_at), 'MM/dd/yyyy')}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {biopsy.ordering_provider_name}
                    </Typography>
                  </TableCell>

                  <TableCell>
                    <Typography variant="body2">{biopsy.path_lab}</Typography>
                  </TableCell>

                  <TableCell>
                    {biopsy.active_alert_count > 0 && (
                      <Badge badgeContent={biopsy.active_alert_count} color="error">
                        <WarningIcon color="error" />
                      </Badge>
                    )}
                  </TableCell>

                  <TableCell>
                    <Tooltip title="View Details">
                      <IconButton
                        size="small"
                        onClick={() => onViewBiopsy(biopsy.id)}
                        color="primary"
                      >
                        <ViewIcon />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Legend */}
      <Box sx={{ mt: 2, p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
        <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
          Status Workflow:
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Chip label="Ordered" size="small" color="default" />
          <Typography variant="caption" sx={{ alignSelf: 'center' }}>→</Typography>
          <Chip label="Collected" size="small" color="primary" />
          <Typography variant="caption" sx={{ alignSelf: 'center' }}>→</Typography>
          <Chip label="Sent" size="small" color="secondary" />
          <Typography variant="caption" sx={{ alignSelf: 'center' }}>→</Typography>
          <Chip label="Resulted" size="small" color="warning" />
          <Typography variant="caption" sx={{ alignSelf: 'center' }}>→</Typography>
          <Chip label="Reviewed" size="small" color="success" />
          <Typography variant="caption" sx={{ alignSelf: 'center' }}>→</Typography>
          <Chip label="Closed" size="small" color="success" />
        </Box>
        <Typography variant="caption" color="error.main" display="block" sx={{ mt: 1 }}>
          ⚠ Red highlight = Overdue (over 7 days without result)
        </Typography>
      </Box>
    </Box>
  );
};

export default BiopsyTracker;
