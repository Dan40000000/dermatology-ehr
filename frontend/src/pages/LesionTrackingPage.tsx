import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Button,
  TextField,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  Chip,
  IconButton,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import {
  Add as AddIcon,
  Warning as WarningIcon,
  Refresh as RefreshIcon,
  FilterList as FilterIcon,
  Timeline as TimelineIcon,
  CompareArrows as CompareIcon
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import LesionCard from '../components/lesions/LesionCard';
import LesionTimeline from '../components/lesions/LesionTimeline';
import BodyMapLesions from '../components/lesions/BodyMapLesions';
import ChangeAlert from '../components/lesions/ChangeAlert';
import ABCDEScorer from '../components/lesions/ABCDEScorer';
import MeasurementForm from '../components/lesions/MeasurementForm';
import ImageComparison from '../components/lesions/ImageComparison';
import { PatientLookupSelect } from '../components/patients/PatientLookupSelect';
import { fetchPatients } from '../api';
import type { Patient } from '../types';
import { useAuth } from '../contexts/AuthContext';

interface TrackedLesion {
  id: string;
  patientId: string;
  bodyLocationCode: string;
  bodyLocationDescription: string;
  firstDocumented: string;
  status: 'active' | 'resolved' | 'excised';
  clinicalDescription: string | null;
  suspicionLevel: number;
}

interface LesionAlert {
  id: string;
  lesionId: string;
  patientId: string;
  alertType: string;
  severity: string;
  message: string;
  status: string;
  createdAt: string;
  bodyLocation?: string;
  patientName?: string;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`lesion-tabpanel-${index}`}
      aria-labelledby={`lesion-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

function closeDialogExceptBackdrop(onClose: () => void) {
  return (_event: unknown, reason?: string) => {
    if (reason === 'backdropClick') return;
    onClose();
  };
}

const LesionTrackingPage: React.FC = () => {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();

  const [lesions, setLesions] = useState<TrackedLesion[]>([]);
  const [alerts, setAlerts] = useState<LesionAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [selectedLesion, setSelectedLesion] = useState<TrackedLesion | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [suspicionFilter, setSuspicionFilter] = useState<string>('all');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(!patientId);

  // Dialog states
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showTimelineDialog, setShowTimelineDialog] = useState(false);
  const [showCompareDialog, setShowCompareDialog] = useState(false);
  const [showABCDEDialog, setShowABCDEDialog] = useState(false);
  const [showMeasurementDialog, setShowMeasurementDialog] = useState(false);

  // New lesion form
  const [newLesion, setNewLesion] = useState({
    locationCode: '',
    locationDescription: '',
    clinicalDescription: '',
    suspicionLevel: 1
  });

  const fetchLesions = useCallback(async () => {
    if (!patientId) return;

    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const tenantId = localStorage.getItem('tenantId');

      const response = await fetch(`/api/lesion-tracking/patient/${patientId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-tenant-id': tenantId || ''
        }
      });

      if (response.ok) {
        const data = await response.json();
        setLesions(data.lesions || []);
      } else {
        toast.error('Failed to load lesions');
      }
    } catch (error) {
      console.error('Error fetching lesions:', error);
      toast.error('Failed to load lesions');
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  const fetchAlerts = useCallback(async () => {
    if (!patientId) return;

    try {
      const token = localStorage.getItem('token');
      const tenantId = localStorage.getItem('tenantId');

      const response = await fetch(`/api/lesion-tracking/alerts?patientId=${patientId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-tenant-id': tenantId || ''
        }
      });

      if (response.ok) {
        const data = await response.json();
        setAlerts(data.alerts || []);
      }
    } catch (error) {
      console.error('Error fetching alerts:', error);
    }
  }, [patientId]);

  useEffect(() => {
    fetchLesions();
    fetchAlerts();
  }, [fetchLesions, fetchAlerts]);

  useEffect(() => {
    if (patientId) return;

    const loadPatients = async () => {
      try {
        if (!session?.tenantId || !session.accessToken) return;
        const response = await fetchPatients(session.tenantId, session.accessToken);
        setPatients(response.patients || []);
      } catch (error) {
        console.error('Failed to load patients for lesion tracking:', error);
        toast.error('Failed to load patients');
      } finally {
        setPatientsLoading(false);
      }
    };

    void loadPatients();
  }, [patientId, session]);

  const handleAddLesion = async () => {
    if (!patientId) return;

    try {
      const token = localStorage.getItem('token');
      const tenantId = localStorage.getItem('tenantId');

      const response = await fetch('/api/lesion-tracking', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-tenant-id': tenantId || ''
        },
        body: JSON.stringify({
          patientId,
          ...newLesion
        })
      });

      if (response.ok) {
        toast.success('Lesion added for tracking');
        setShowAddDialog(false);
        setNewLesion({
          locationCode: '',
          locationDescription: '',
          clinicalDescription: '',
          suspicionLevel: 1
        });
        fetchLesions();
      } else {
        toast.error('Failed to add lesion');
      }
    } catch (error) {
      console.error('Error adding lesion:', error);
      toast.error('Failed to add lesion');
    }
  };

  const handleAcknowledgeAlert = async (alertId: string) => {
    try {
      const token = localStorage.getItem('token');
      const tenantId = localStorage.getItem('tenantId');

      const response = await fetch(`/api/lesion-tracking/alerts/${alertId}/acknowledge`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-tenant-id': tenantId || ''
        }
      });

      if (response.ok) {
        toast.success('Alert acknowledged');
        fetchAlerts();
      } else {
        toast.error('Failed to acknowledge alert');
      }
    } catch (error) {
      console.error('Error acknowledging alert:', error);
      toast.error('Failed to acknowledge alert');
    }
  };

  const filteredLesions = lesions.filter(lesion => {
    if (statusFilter !== 'all' && lesion.status !== statusFilter) return false;
    if (suspicionFilter !== 'all' && lesion.suspicionLevel.toString() !== suspicionFilter) return false;
    return true;
  });

  const getSuspicionColor = (level: number): 'default' | 'success' | 'warning' | 'error' => {
    if (level >= 4) return 'error';
    if (level >= 3) return 'warning';
    if (level >= 2) return 'default';
    return 'success';
  };

  if (!patientId) {
    return (
      <Box sx={{ p: 3, maxWidth: 800 }}>
        <Typography variant="h4" component="h1" gutterBottom>Lesion Tracking</Typography>
        <Typography sx={{ mb: 3 }}>
          Select a patient to review or document tracked lesions.
        </Typography>
        <Paper sx={{ p: 3 }}>
          <PatientLookupSelect
            patients={patients}
            value=""
            onChange={(selectedPatientId) => {
              if (selectedPatientId) navigate(`/lesion-tracking/${selectedPatientId}`);
            }}
            label="Patient"
            loading={patientsLoading}
            showInitialResults
          />
        </Paper>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1">Lesion Tracking</Typography>
        <Box display="flex" gap={2}>
          <Tooltip title="Refresh">
            <IconButton aria-label="Refresh lesion tracking" onClick={() => { fetchLesions(); fetchAlerts(); }}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setShowAddDialog(true)}
          >
            Track New Lesion
          </Button>
        </Box>
      </Box>

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <Paper sx={{ p: 2, mb: 3, bgcolor: 'warning.light' }}>
          <Box display="flex" alignItems="center" gap={1} mb={2}>
            <WarningIcon color="warning" />
            <Typography variant="h6">Active Alerts ({alerts.length})</Typography>
          </Box>
          <Grid container spacing={2}>
            {alerts.slice(0, 3).map(alert => (
              <Grid item xs={12} md={4} key={alert.id}>
                <ChangeAlert
                  alert={alert}
                  onAcknowledge={() => handleAcknowledgeAlert(alert.id)}
                  onViewLesion={() => {
                    const lesion = lesions.find(l => l.id === alert.lesionId);
                    if (lesion) {
                      setSelectedLesion(lesion);
                      setShowTimelineDialog(true);
                    }
                  }}
                />
              </Grid>
            ))}
          </Grid>
          {alerts.length > 3 && (
            <Typography variant="body2" sx={{ mt: 1 }}>
              + {alerts.length - 3} more alerts
            </Typography>
          )}
        </Paper>
      )}

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          aria-label="Lesion tracking views"
        >
          <Tab id="lesion-tab-0" aria-controls="lesion-tabpanel-0" label="List View" />
          <Tab id="lesion-tab-1" aria-controls="lesion-tabpanel-1" label="Body Map" />
        </Tabs>
      </Paper>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box display="flex" gap={2} alignItems="center">
          <FilterIcon color="action" />
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={statusFilter}
              label="Status"
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="resolved">Resolved</MenuItem>
              <MenuItem value="excised">Excised</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Suspicion Level</InputLabel>
            <Select
              value={suspicionFilter}
              label="Suspicion Level"
              onChange={(e) => setSuspicionFilter(e.target.value)}
            >
              <MenuItem value="all">All Levels</MenuItem>
              <MenuItem value="5">5 - Highly Suspicious</MenuItem>
              <MenuItem value="4">4 - Suspicious</MenuItem>
              <MenuItem value="3">3 - Moderate</MenuItem>
              <MenuItem value="2">2 - Low</MenuItem>
              <MenuItem value="1">1 - Benign Appearing</MenuItem>
            </Select>
          </FormControl>
          <Chip
            label={`${filteredLesions.length} lesion${filteredLesions.length !== 1 ? 's' : ''}`}
            color="primary"
            variant="outlined"
          />
        </Box>
      </Paper>

      {/* Tab Panels */}
      <TabPanel value={activeTab} index={0}>
        {filteredLesions.length === 0 ? (
          <Paper sx={{ p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">
              No tracked lesions found. Click "Track New Lesion" to begin monitoring.
            </Typography>
          </Paper>
        ) : (
          <Grid container spacing={3}>
            {filteredLesions.map(lesion => (
              <Grid item xs={12} md={6} lg={4} key={lesion.id}>
                <LesionCard
                  lesion={lesion}
                  alertCount={alerts.filter(a => a.lesionId === lesion.id).length}
                  onViewTimeline={() => {
                    setSelectedLesion(lesion);
                    setShowTimelineDialog(true);
                  }}
                  onCompare={() => {
                    setSelectedLesion(lesion);
                    setShowCompareDialog(true);
                  }}
                  onRecordABCDE={() => {
                    setSelectedLesion(lesion);
                    setShowABCDEDialog(true);
                  }}
                  onRecordMeasurement={() => {
                    setSelectedLesion(lesion);
                    setShowMeasurementDialog(true);
                  }}
                />
              </Grid>
            ))}
          </Grid>
        )}
      </TabPanel>

      <TabPanel value={activeTab} index={1}>
        <BodyMapLesions
          lesions={filteredLesions}
          alerts={alerts}
          onSelectLesion={(lesion) => {
            setSelectedLesion(lesion);
            setShowTimelineDialog(true);
          }}
        />
      </TabPanel>

      {/* Add Lesion Dialog */}
      <Dialog open={showAddDialog} onClose={closeDialogExceptBackdrop(() => setShowAddDialog(false))} maxWidth="sm" fullWidth>
        <DialogTitle>Track New Lesion</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Location Code"
              value={newLesion.locationCode}
              onChange={(e) => setNewLesion({ ...newLesion, locationCode: e.target.value })}
              placeholder="e.g., ARM-L-UPPER"
              fullWidth
              required
            />
            <TextField
              label="Location Description"
              value={newLesion.locationDescription}
              onChange={(e) => setNewLesion({ ...newLesion, locationDescription: e.target.value })}
              placeholder="e.g., Left upper arm, lateral aspect"
              fullWidth
              required
            />
            <TextField
              label="Clinical Description"
              value={newLesion.clinicalDescription}
              onChange={(e) => setNewLesion({ ...newLesion, clinicalDescription: e.target.value })}
              placeholder="Describe the lesion appearance"
              multiline
              rows={3}
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel>Suspicion Level</InputLabel>
              <Select
                value={newLesion.suspicionLevel}
                label="Suspicion Level"
                onChange={(e) => setNewLesion({ ...newLesion, suspicionLevel: Number(e.target.value) })}
              >
                <MenuItem value={1}>1 - Benign Appearing</MenuItem>
                <MenuItem value={2}>2 - Low Suspicion</MenuItem>
                <MenuItem value={3}>3 - Moderate Suspicion</MenuItem>
                <MenuItem value={4}>4 - Suspicious</MenuItem>
                <MenuItem value={5}>5 - Highly Suspicious</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowAddDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleAddLesion}
            disabled={!newLesion.locationCode || !newLesion.locationDescription}
          >
            Add Lesion
          </Button>
        </DialogActions>
      </Dialog>

      {/* Timeline Dialog */}
      <Dialog
        open={showTimelineDialog}
        onClose={closeDialogExceptBackdrop(() => setShowTimelineDialog(false))}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          Lesion Timeline - {selectedLesion?.bodyLocationDescription}
        </DialogTitle>
        <DialogContent>
          {selectedLesion && (
            <LesionTimeline
              lesionId={selectedLesion.id}
              onClose={() => setShowTimelineDialog(false)}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowTimelineDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Compare Dialog */}
      <Dialog
        open={showCompareDialog}
        onClose={closeDialogExceptBackdrop(() => setShowCompareDialog(false))}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          Image Comparison - {selectedLesion?.bodyLocationDescription}
        </DialogTitle>
        <DialogContent>
          {selectedLesion && (
            <ImageComparison
              lesionId={selectedLesion.id}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowCompareDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* ABCDE Scorer Dialog */}
      <Dialog
        open={showABCDEDialog}
        onClose={closeDialogExceptBackdrop(() => setShowABCDEDialog(false))}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          ABCDE Assessment - {selectedLesion?.bodyLocationDescription}
        </DialogTitle>
        <DialogContent>
          {selectedLesion && (
            <ABCDEScorer
              lesionId={selectedLesion.id}
              onSave={() => {
                setShowABCDEDialog(false);
                fetchLesions();
                fetchAlerts();
                toast.success('ABCDE score recorded');
              }}
              onCancel={() => setShowABCDEDialog(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Measurement Dialog */}
      <Dialog
        open={showMeasurementDialog}
        onClose={closeDialogExceptBackdrop(() => setShowMeasurementDialog(false))}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Record Measurements - {selectedLesion?.bodyLocationDescription}
        </DialogTitle>
        <DialogContent>
          {selectedLesion && (
            <MeasurementForm
              lesionId={selectedLesion.id}
              onSave={() => {
                setShowMeasurementDialog(false);
                fetchLesions();
                fetchAlerts();
                toast.success('Measurements recorded');
              }}
              onCancel={() => setShowMeasurementDialog(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default LesionTrackingPage;
