import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  Card,
  CardContent,
  Tabs,
  Tab
} from '@mui/material';
import {
  Search as SearchIcon,
  Download as DownloadIcon,
  Visibility as ViewIcon,
  FilterList as FilterIcon,
  Print as PrintIcon,
  Assessment as AssessmentIcon
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import BiopsyResultReview from '../components/Biopsy/BiopsyResultReview';

interface Biopsy {
  id: string;
  specimen_id: string;
  patient_name: string;
  mrn: string;
  body_location: string;
  specimen_type: string;
  status: string;
  ordered_at: string;
  resulted_at: string | null;
  pathology_diagnosis: string | null;
  malignancy_type: string | null;
  diagnosis_code: string | null;
  follow_up_action: string | null;
  turnaround_time_days: number | null;
  ordering_provider_name: string;
  path_lab: string;
  patient_notified: boolean;
}

interface QualityMetrics {
  total_biopsies: number;
  avg_turnaround_days: number;
  within_7_days: number;
  within_7_days_percentage: number;
  total_overdue: number;
  total_malignancies: number;
  total_melanoma: number;
  patients_notified: number;
  completed_biopsies: number;
}

const BiopsyLogPage: React.FC = () => {
  const [biopsies, setBiopsies] = useState<Biopsy[]>([]);
  const [filteredBiopsies, setFilteredBiopsies] = useState<Biopsy[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [selectedTab, setSelectedTab] = useState(0);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [malignancyFilter, setMalignancyFilter] = useState('all');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);

  // Quality metrics
  const [metrics, setMetrics] = useState<QualityMetrics | null>(null);

  // View biopsy dialog
  const [selectedBiopsyId, setSelectedBiopsyId] = useState<string | null>(null);
  const [showReviewDialog, setShowReviewDialog] = useState(false);

  useEffect(() => {
    fetchBiopsies();
    fetchMetrics();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [biopsies, searchTerm, statusFilter, malignancyFilter, startDate, endDate]);

  const fetchBiopsies = async () => {
    try {
      const response = await fetch('/api/biopsies?limit=1000', {
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
      toast.error('Failed to load biopsy log');
    } finally {
      setLoading(false);
    }
  };

  const fetchMetrics = async () => {
    try {
      const response = await fetch('/api/biopsies/quality-metrics', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setMetrics(data);
      }
    } catch (error) {
      console.error('Error fetching metrics:', error);
    }
  };

  const applyFilters = () => {
    let filtered = [...biopsies];

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        b =>
          b.specimen_id.toLowerCase().includes(term) ||
          b.patient_name.toLowerCase().includes(term) ||
          b.mrn.toLowerCase().includes(term) ||
          b.body_location.toLowerCase().includes(term)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(b => b.status === statusFilter);
    }

    // Malignancy filter
    if (malignancyFilter !== 'all') {
      if (malignancyFilter === 'malignant') {
        filtered = filtered.filter(b => b.malignancy_type !== null);
      } else if (malignancyFilter === 'benign') {
        filtered = filtered.filter(b => b.malignancy_type === null);
      } else {
        filtered = filtered.filter(b => b.malignancy_type === malignancyFilter);
      }
    }

    // Date filter
    if (startDate) {
      filtered = filtered.filter(b => new Date(b.ordered_at) >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter(b => new Date(b.ordered_at) <= endDate);
    }

    setFilteredBiopsies(filtered);
    setPage(0);
  };

  const handleExportToExcel = async () => {
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate.toISOString());
      if (endDate) params.append('end_date', endDate.toISOString());

      const response = await fetch(`/api/biopsies/export/log?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `biopsy-log-${format(new Date(), 'yyyy-MM-dd')}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast.success('Biopsy log exported successfully');
      } else {
        throw new Error('Export failed');
      }
    } catch (error) {
      console.error('Error exporting:', error);
      toast.error('Failed to export biopsy log');
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setMalignancyFilter('all');
    setStartDate(null);
    setEndDate(null);
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
      case 'closed':
        return 'success';
      default:
        return 'default';
    }
  };

  const paginatedBiopsies = filteredBiopsies.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h4">
            Biopsy Log & Registry
          </Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={handleExportToExcel}
            >
              Export to Excel
            </Button>
          </Box>
        </Box>

        {/* Quality Metrics */}
        {metrics && (
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AssessmentIcon />
                  Quality Metrics
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6} sm={3}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="caption" color="text.secondary">
                          Total Biopsies
                        </Typography>
                        <Typography variant="h5">{metrics.total_biopsies}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>

                  <Grid item xs={6} sm={3}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="caption" color="text.secondary">
                          Avg Turnaround
                        </Typography>
                        <Typography variant="h5">
                          {metrics.avg_turnaround_days ? Math.round(metrics.avg_turnaround_days) : 'N/A'} days
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>

                  <Grid item xs={6} sm={3}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="caption" color="text.secondary">
                          Within 7 Days
                        </Typography>
                        <Typography variant="h5">
                          {metrics.within_7_days_percentage ? `${metrics.within_7_days_percentage}%` : 'N/A'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {metrics.within_7_days} of {metrics.total_biopsies}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>

                  <Grid item xs={6} sm={3}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="caption" color="text.secondary">
                          Malignancies
                        </Typography>
                        <Typography variant="h5">{metrics.total_malignancies}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {metrics.total_melanoma} melanoma
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>
              </Paper>
            </Grid>
          </Grid>
        )}

        {/* Filters */}
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FilterIcon />
            Filters
          </Typography>

          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="Search"
                placeholder="Specimen ID, patient name, MRN, location..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />
                }}
              />
            </Grid>

            <Grid item xs={6} md={2}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  value={statusFilter}
                  label="Status"
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <MenuItem value="all">All Statuses</MenuItem>
                  <MenuItem value="ordered">Ordered</MenuItem>
                  <MenuItem value="collected">Collected</MenuItem>
                  <MenuItem value="sent">Sent</MenuItem>
                  <MenuItem value="resulted">Resulted</MenuItem>
                  <MenuItem value="reviewed">Reviewed</MenuItem>
                  <MenuItem value="closed">Closed</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={6} md={2}>
              <FormControl fullWidth>
                <InputLabel>Malignancy</InputLabel>
                <Select
                  value={malignancyFilter}
                  label="Malignancy"
                  onChange={(e) => setMalignancyFilter(e.target.value)}
                >
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
              <DatePicker
                label="Start Date"
                value={startDate}
                onChange={(newValue) => setStartDate(newValue)}
                slotProps={{ textField: { fullWidth: true } }}
              />
            </Grid>

            <Grid item xs={6} md={2}>
              <DatePicker
                label="End Date"
                value={endDate}
                onChange={(newValue) => setEndDate(newValue)}
                slotProps={{ textField: { fullWidth: true } }}
              />
            </Grid>

            <Grid item xs={12}>
              <Button onClick={clearFilters} size="small">
                Clear Filters
              </Button>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Showing {filteredBiopsies.length} of {biopsies.length} biopsies
              </Typography>
            </Grid>
          </Grid>
        </Paper>

        {/* Biopsy Table */}
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Specimen ID</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Patient</TableCell>
                <TableCell>Location</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Diagnosis</TableCell>
                <TableCell>ICD-10</TableCell>
                <TableCell>TAT</TableCell>
                <TableCell>Provider</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedBiopsies.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} align="center">
                    <Typography variant="body2" color="text.secondary" py={4}>
                      No biopsies found matching the current filters
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedBiopsies.map((biopsy) => (
                  <TableRow key={biopsy.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold">
                        {biopsy.specimen_id}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      <Typography variant="body2">
                        {format(new Date(biopsy.ordered_at), 'MM/dd/yyyy')}
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
                      <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>
                        {biopsy.specimen_type}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      <Chip
                        label={biopsy.status}
                        size="small"
                        color={getStatusColor(biopsy.status)}
                        sx={{ textTransform: 'capitalize' }}
                      />
                    </TableCell>

                    <TableCell>
                      {biopsy.pathology_diagnosis ? (
                        <>
                          <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                            {biopsy.pathology_diagnosis}
                          </Typography>
                          {biopsy.malignancy_type && (
                            <Chip
                              label={biopsy.malignancy_type}
                              size="small"
                              color="error"
                              sx={{ mt: 0.5 }}
                            />
                          )}
                        </>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          Pending
                        </Typography>
                      )}
                    </TableCell>

                    <TableCell>
                      <Typography variant="body2">
                        {biopsy.diagnosis_code || '-'}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      {biopsy.turnaround_time_days !== null ? (
                        <Typography
                          variant="body2"
                          color={biopsy.turnaround_time_days > 7 ? 'error' : 'inherit'}
                        >
                          {biopsy.turnaround_time_days}d
                        </Typography>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          -
                        </Typography>
                      )}
                    </TableCell>

                    <TableCell>
                      <Typography variant="body2" noWrap>
                        {biopsy.ordering_provider_name}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      <Tooltip title="View Details">
                        <IconButton
                          size="small"
                          onClick={() => {
                            setSelectedBiopsyId(biopsy.id);
                            setShowReviewDialog(true);
                          }}
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

          <TablePagination
            rowsPerPageOptions={[10, 25, 50, 100]}
            component="div"
            count={filteredBiopsies.length}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
          />
        </TableContainer>

        {/* View Biopsy Dialog */}
        <Dialog
          open={showReviewDialog}
          onClose={() => {
            setShowReviewDialog(false);
            setSelectedBiopsyId(null);
          }}
          maxWidth="lg"
          fullWidth
        >
          <DialogContent>
            {selectedBiopsyId && (
              <BiopsyResultReview
                biopsyId={selectedBiopsyId}
                onClose={() => {
                  setShowReviewDialog(false);
                  setSelectedBiopsyId(null);
                }}
                onReviewComplete={() => {
                  fetchBiopsies();
                  setShowReviewDialog(false);
                  setSelectedBiopsyId(null);
                }}
              />
            )}
          </DialogContent>
        </Dialog>
      </Box>
    </LocalizationProvider>
  );
};

export default BiopsyLogPage;
