/**
 * PatchTestPage
 * Main page for managing contact dermatitis patch testing workflow
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  Tabs,
  Tab,
  Button,
  Grid,
  Card,
  CardContent,
  Chip,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Alert,
  AlertTitle,
  CircularProgress,
  IconButton,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider,
} from '@mui/material';
import {
  Add as AddIcon,
  Science as ScienceIcon,
  Assessment as AssessmentIcon,
  Print as PrintIcon,
  Visibility as ViewIcon,
  Schedule as ScheduleIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Person as PersonIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { format, addHours } from 'date-fns';
import toast from 'react-hot-toast';
import { useReactToPrint } from 'react-to-print';

import PanelSelector, { type Panel } from '../components/patchtest/PanelSelector';
import ReadingGrid, { type AllergenResult } from '../components/patchtest/ReadingGrid';
import { ReadingLegend, type ReadingValue } from '../components/patchtest/ReadingScale';
import ResultsSummary, { type InterpretationSummary } from '../components/patchtest/ResultsSummary';
import AvoidanceList, { type AvoidanceItem } from '../components/patchtest/AvoidanceList';
import PatchTestReport, { type PatchTestReportData } from '../components/patchtest/PatchTestReport';

interface Session {
  id: string;
  patient_id: string;
  patient_name: string;
  mrn?: string;
  status: string;
  application_date: string;
  read_48hr_date: string;
  read_96hr_date: string;
  actual_48hr_read_date?: string;
  actual_96hr_read_date?: string;
  positive_count?: number;
  indication?: string;
  results?: AllergenResult[];
  report?: any;
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
      id={`patch-test-tabpanel-${index}`}
      aria-labelledby={`patch-test-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

const STATUS_COLORS: Record<string, 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info'> = {
  scheduled: 'default',
  applied: 'primary',
  awaiting_48hr: 'warning',
  read_48hr: 'info',
  awaiting_96hr: 'warning',
  read_96hr: 'info',
  completed: 'success',
  cancelled: 'error',
};

const PatchTestPage: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [attentionSessions, setAttentionSessions] = useState<Session[]>([]);
  const [panels, setPanels] = useState<Panel[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [interpretation, setInterpretation] = useState<InterpretationSummary | null>(null);
  const [reportData, setReportData] = useState<PatchTestReportData | null>(null);

  // New session dialog
  const [showNewSessionDialog, setShowNewSessionDialog] = useState(false);
  const [newSessionData, setNewSessionData] = useState({
    patientId: '',
    patientName: '',
    panelIds: [] as string[],
    applicationDate: new Date(),
    indication: '',
  });
  const [patients, setPatients] = useState<Array<{ id: string; name: string; mrn: string }>>([]);
  const [patientSearch, setPatientSearch] = useState('');

  // Print ref
  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: 'Patch Test Report',
  });

  // Fetch data on mount
  useEffect(() => {
    fetchPanels();
    fetchSessions();
    fetchAttentionSessions();
  }, []);

  const fetchPanels = async () => {
    try {
      const response = await fetch('/api/patch-test/panels', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (response.ok) {
        const data = await response.json();
        setPanels(data.panels || []);
      }
    } catch (error) {
      console.error('Error fetching panels:', error);
      toast.error('Failed to load test panels');
    }
  };

  const fetchSessions = async () => {
    try {
      const response = await fetch('/api/patch-test/sessions?limit=100', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (response.ok) {
        const data = await response.json();
        setSessions(data.sessions || []);
      }
    } catch (error) {
      console.error('Error fetching sessions:', error);
      toast.error('Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  const fetchAttentionSessions = async () => {
    try {
      const response = await fetch('/api/patch-test/sessions/attention', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (response.ok) {
        const data = await response.json();
        setAttentionSessions(data.sessions || []);
      }
    } catch (error) {
      console.error('Error fetching attention sessions:', error);
    }
  };

  const fetchSessionDetails = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/patch-test/sessions/${sessionId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (response.ok) {
        const data = await response.json();
        setSelectedSession(data);
        return data;
      }
    } catch (error) {
      console.error('Error fetching session details:', error);
      toast.error('Failed to load session details');
    }
    return null;
  };

  const searchPatients = async (query: string) => {
    if (query.length < 2) return;
    try {
      const response = await fetch(`/api/patients?search=${encodeURIComponent(query)}&limit=10`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (response.ok) {
        const data = await response.json();
        setPatients(
          (data.patients || []).map((p: any) => ({
            id: p.id,
            name: `${p.first_name} ${p.last_name}`,
            mrn: p.mrn || '',
          }))
        );
      }
    } catch (error) {
      console.error('Error searching patients:', error);
    }
  };

  const createSession = async () => {
    if (!newSessionData.patientId || newSessionData.panelIds.length === 0) {
      toast.error('Please select a patient and at least one panel');
      return;
    }

    try {
      const response = await fetch('/api/patch-test/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          patient_id: newSessionData.patientId,
          panel_ids: newSessionData.panelIds,
          application_date: newSessionData.applicationDate.toISOString(),
          indication: newSessionData.indication,
        }),
      });

      if (response.ok) {
        const session = await response.json();
        toast.success('Patch test session created');
        setShowNewSessionDialog(false);
        setNewSessionData({
          patientId: '',
          patientName: '',
          panelIds: [],
          applicationDate: new Date(),
          indication: '',
        });
        fetchSessions();
        fetchSessionDetails(session.id);
        setTabValue(2); // Go to reading tab
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to create session');
      }
    } catch (error) {
      console.error('Error creating session:', error);
      toast.error('Failed to create session');
    }
  };

  const recordReadings = async (
    sessionId: string,
    readings: Array<{ allergenId: string; reading: ReadingValue; notes?: string }>,
    timepoint: '48hr' | '96hr'
  ) => {
    try {
      const response = await fetch(`/api/patch-test/sessions/${sessionId}/readings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          timepoint,
          readings: readings.map((r) => ({
            allergen_id: r.allergenId,
            reading: r.reading,
            notes: r.notes,
          })),
        }),
      });

      if (response.ok) {
        const updated = await response.json();
        setSelectedSession(updated);
        toast.success(`${timepoint} readings saved`);
        fetchSessions();
      } else {
        toast.error('Failed to save readings');
      }
    } catch (error) {
      console.error('Error recording readings:', error);
      toast.error('Failed to save readings');
    }
  };

  const interpretResults = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/patch-test/sessions/${sessionId}/interpret`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });

      if (response.ok) {
        const data = await response.json();
        setInterpretation(data);
        setTabValue(3); // Go to results tab
      } else {
        toast.error('Failed to interpret results');
      }
    } catch (error) {
      console.error('Error interpreting results:', error);
      toast.error('Failed to interpret results');
    }
  };

  const generateReport = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/patch-test/sessions/${sessionId}/report`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });

      if (response.ok) {
        const data = await response.json();

        // Transform to report format
        const report: PatchTestReportData = {
          patientName: selectedSession?.patient_name || '',
          mrn: selectedSession?.mrn,
          applicationDate: selectedSession?.application_date || new Date().toISOString(),
          read48hrDate: selectedSession?.actual_48hr_read_date,
          read96hrDate: selectedSession?.actual_96hr_read_date,
          positiveAllergens: (data.interpretation?.positive || []).map((a: any) => ({
            allergenName: a.allergenName,
            reading48hr: a.reading48hr,
            reading96hr: a.reading96hr,
            interpretation: a.interpretation,
          })),
          negativeAllergens: (data.interpretation?.negative || []).map((a: any) => ({
            allergenName: a.allergenName,
            reading48hr: a.reading48hr,
            reading96hr: a.reading96hr,
            interpretation: a.interpretation,
          })),
          irritantReactions: (data.interpretation?.irritant || []).map((a: any) => ({
            allergenName: a.allergenName,
            reading48hr: a.reading48hr,
            reading96hr: a.reading96hr,
            interpretation: a.interpretation,
          })),
          recommendations: data.recommendations || '',
          avoidanceList: data.avoidanceList || [],
        };

        setReportData(report);
        setTabValue(4); // Go to report tab
        toast.success('Report generated');
      } else {
        toast.error('Failed to generate report');
      }
    } catch (error) {
      console.error('Error generating report:', error);
      toast.error('Failed to generate report');
    }
  };

  const handleReadingChange = (allergenId: string, reading: ReadingValue, notes?: string) => {
    if (!selectedSession) return;

    // Determine timepoint based on session status
    const timepoint =
      selectedSession.status === 'applied' || selectedSession.status === 'awaiting_48hr'
        ? '48hr'
        : '96hr';

    recordReadings(selectedSession.id, [{ allergenId, reading, notes }], timepoint);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box sx={{ p: 3 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h4" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ScienceIcon fontSize="large" />
            Patch Testing
          </Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={() => {
                fetchSessions();
                fetchAttentionSessions();
              }}
            >
              Refresh
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setShowNewSessionDialog(true)}
            >
              New Session
            </Button>
          </Box>
        </Box>

        {/* Attention Alert */}
        {attentionSessions.length > 0 && (
          <Alert severity="warning" sx={{ mb: 3 }}>
            <AlertTitle>Sessions Requiring Attention</AlertTitle>
            {attentionSessions.length} session(s) are due for readings.
            <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {attentionSessions.slice(0, 5).map((s) => (
                <Chip
                  key={s.id}
                  label={`${s.patient_name} - ${s.attention_type === '48hr_due' ? '48hr' : '96hr'} due`}
                  size="small"
                  color="warning"
                  onClick={() => {
                    fetchSessionDetails(s.id);
                    setTabValue(2);
                  }}
                />
              ))}
            </Box>
          </Alert>
        )}

        {/* Tabs */}
        <Paper sx={{ width: '100%' }}>
          <Tabs
            value={tabValue}
            onChange={(_, newValue) => setTabValue(newValue)}
            aria-label="patch test tabs"
          >
            <Tab label="Sessions" icon={<ScheduleIcon />} iconPosition="start" />
            <Tab label="Reading Scale" icon={<AssessmentIcon />} iconPosition="start" />
            <Tab
              label="Record Readings"
              icon={<ScienceIcon />}
              iconPosition="start"
              disabled={!selectedSession}
            />
            <Tab
              label="Results"
              icon={<CheckCircleIcon />}
              iconPosition="start"
              disabled={!interpretation}
            />
            <Tab
              label="Report"
              icon={<PrintIcon />}
              iconPosition="start"
              disabled={!reportData}
            />
          </Tabs>

          {/* Sessions Tab */}
          <TabPanel value={tabValue} index={0}>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Patient</TableCell>
                    <TableCell>Application Date</TableCell>
                    <TableCell>48hr Reading</TableCell>
                    <TableCell>96hr Reading</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Positive</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sessions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center">
                        <Typography color="text.secondary" py={4}>
                          No patch test sessions found
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    sessions.map((session) => (
                      <TableRow key={session.id} hover>
                        <TableCell>
                          <Typography fontWeight="bold">{session.patient_name}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {session.mrn}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {format(new Date(session.application_date), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell>
                          {session.actual_48hr_read_date ? (
                            <Chip
                              label={format(new Date(session.actual_48hr_read_date), 'MMM d')}
                              size="small"
                              color="success"
                            />
                          ) : (
                            <Typography variant="caption">
                              Due: {format(new Date(session.read_48hr_date), 'MMM d, h:mm a')}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          {session.actual_96hr_read_date ? (
                            <Chip
                              label={format(new Date(session.actual_96hr_read_date), 'MMM d')}
                              size="small"
                              color="success"
                            />
                          ) : (
                            <Typography variant="caption">
                              Due: {format(new Date(session.read_96hr_date), 'MMM d, h:mm a')}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={session.status.replace(/_/g, ' ')}
                            size="small"
                            color={STATUS_COLORS[session.status] || 'default'}
                            sx={{ textTransform: 'capitalize' }}
                          />
                        </TableCell>
                        <TableCell>
                          {session.positive_count !== undefined && (
                            <Chip
                              label={session.positive_count}
                              size="small"
                              color={session.positive_count > 0 ? 'error' : 'success'}
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <Tooltip title="View/Edit">
                            <IconButton
                              size="small"
                              onClick={async () => {
                                await fetchSessionDetails(session.id);
                                setTabValue(2);
                              }}
                            >
                              <ViewIcon />
                            </IconButton>
                          </Tooltip>
                          {session.status === 'completed' && (
                            <Tooltip title="View Report">
                              <IconButton
                                size="small"
                                onClick={async () => {
                                  await fetchSessionDetails(session.id);
                                  await generateReport(session.id);
                                }}
                              >
                                <PrintIcon />
                              </IconButton>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </TabPanel>

          {/* Reading Scale Tab */}
          <TabPanel value={tabValue} index={1}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={8}>
                <ReadingLegend />
              </Grid>
              <Grid item xs={12} md={4}>
                <Paper sx={{ p: 2 }}>
                  <Typography variant="h6" gutterBottom>
                    About Patch Testing
                  </Typography>
                  <Typography variant="body2" paragraph>
                    Patch testing is the gold standard for diagnosing allergic contact dermatitis.
                    Allergens are applied to the skin under occlusion and readings are taken at 48
                    and 96 hours.
                  </Typography>
                  <Typography variant="body2" paragraph>
                    The ICDRG (International Contact Dermatitis Research Group) scale is used to
                    standardize readings across practitioners.
                  </Typography>
                </Paper>
              </Grid>
            </Grid>
          </TabPanel>

          {/* Record Readings Tab */}
          <TabPanel value={tabValue} index={2}>
            {selectedSession ? (
              <Box>
                <Paper sx={{ p: 2, mb: 3 }}>
                  <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} md={4}>
                      <Typography variant="h6">{selectedSession.patient_name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        MRN: {selectedSession.mrn}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <Typography variant="body2">
                        <strong>Applied:</strong>{' '}
                        {format(new Date(selectedSession.application_date), 'MMM d, yyyy h:mm a')}
                      </Typography>
                      <Typography variant="body2">
                        <strong>Status:</strong>{' '}
                        <Chip
                          label={selectedSession.status.replace(/_/g, ' ')}
                          size="small"
                          color={STATUS_COLORS[selectedSession.status] || 'default'}
                        />
                      </Typography>
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                        <Button
                          variant="outlined"
                          onClick={() => interpretResults(selectedSession.id)}
                          disabled={selectedSession.status === 'applied'}
                        >
                          Interpret Results
                        </Button>
                        <Button
                          variant="contained"
                          onClick={() => generateReport(selectedSession.id)}
                          disabled={
                            selectedSession.status !== 'read_96hr' &&
                            selectedSession.status !== 'completed'
                          }
                        >
                          Generate Report
                        </Button>
                      </Box>
                    </Grid>
                  </Grid>
                </Paper>

                {selectedSession.results && (
                  <ReadingGrid
                    results={selectedSession.results}
                    timepoint={
                      selectedSession.status === 'applied' ||
                      selectedSession.status === 'awaiting_48hr'
                        ? '48hr'
                        : '96hr'
                    }
                    onReadingChange={handleReadingChange}
                    showPreviousReading={
                      selectedSession.status === 'read_48hr' ||
                      selectedSession.status === 'awaiting_96hr' ||
                      selectedSession.status === 'read_96hr'
                    }
                  />
                )}
              </Box>
            ) : (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography color="text.secondary">
                  Select a session from the Sessions tab to record readings
                </Typography>
              </Box>
            )}
          </TabPanel>

          {/* Results Tab */}
          <TabPanel value={tabValue} index={3}>
            {interpretation ? (
              <Grid container spacing={3}>
                <Grid item xs={12}>
                  <ResultsSummary interpretation={interpretation} />
                </Grid>
                {interpretation.positive.length > 0 && (
                  <Grid item xs={12}>
                    <Divider sx={{ my: 2 }} />
                    <AvoidanceList
                      items={interpretation.positive.map((a) => ({
                        allergen: a.allergenName,
                        sources: a.commonSources,
                        instructions: a.avoidanceInstructions,
                        crossReactors: a.crossReactors,
                      }))}
                      patientName={selectedSession?.patient_name}
                    />
                  </Grid>
                )}
              </Grid>
            ) : (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography color="text.secondary">
                  No interpretation available. Complete readings first.
                </Typography>
              </Box>
            )}
          </TabPanel>

          {/* Report Tab */}
          <TabPanel value={tabValue} index={4}>
            {reportData ? (
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                  <Button variant="contained" startIcon={<PrintIcon />} onClick={() => handlePrint()}>
                    Print Report
                  </Button>
                </Box>
                <Paper sx={{ p: 2 }}>
                  <PatchTestReport ref={printRef} data={reportData} />
                </Paper>
              </Box>
            ) : (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography color="text.secondary">
                  No report available. Generate a report first.
                </Typography>
              </Box>
            )}
          </TabPanel>
        </Paper>

        {/* New Session Dialog */}
        <Dialog
          open={showNewSessionDialog}
          onClose={() => setShowNewSessionDialog(false)}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle>New Patch Test Session</DialogTitle>
          <DialogContent dividers>
            <Stepper orientation="vertical" activeStep={-1}>
              <Step active>
                <StepLabel>Select Patient</StepLabel>
                <StepContent>
                  <TextField
                    fullWidth
                    label="Search Patient"
                    placeholder="Enter name or MRN..."
                    value={patientSearch}
                    onChange={(e) => {
                      setPatientSearch(e.target.value);
                      searchPatients(e.target.value);
                    }}
                    sx={{ mb: 2 }}
                  />
                  {patients.length > 0 && (
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                      {patients.map((p) => (
                        <Chip
                          key={p.id}
                          label={`${p.name} (${p.mrn})`}
                          onClick={() => {
                            setNewSessionData({
                              ...newSessionData,
                              patientId: p.id,
                              patientName: p.name,
                            });
                            setPatients([]);
                            setPatientSearch('');
                          }}
                          color={newSessionData.patientId === p.id ? 'primary' : 'default'}
                          variant={newSessionData.patientId === p.id ? 'filled' : 'outlined'}
                        />
                      ))}
                    </Box>
                  )}
                  {newSessionData.patientName && (
                    <Alert severity="info" icon={<PersonIcon />}>
                      Selected: {newSessionData.patientName}
                    </Alert>
                  )}
                </StepContent>
              </Step>

              <Step active>
                <StepLabel>Select Panels</StepLabel>
                <StepContent>
                  <PanelSelector
                    panels={panels}
                    selectedPanelIds={newSessionData.panelIds}
                    onSelectionChange={(ids) =>
                      setNewSessionData({ ...newSessionData, panelIds: ids })
                    }
                  />
                </StepContent>
              </Step>

              <Step active>
                <StepLabel>Application Details</StepLabel>
                <StepContent>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <DateTimePicker
                        label="Application Date/Time"
                        value={newSessionData.applicationDate}
                        onChange={(date) =>
                          date && setNewSessionData({ ...newSessionData, applicationDate: date })
                        }
                        slotProps={{ textField: { fullWidth: true } }}
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <Alert severity="info" sx={{ height: '100%' }}>
                        48hr reading: {format(addHours(newSessionData.applicationDate, 48), 'MMM d, h:mm a')}
                        <br />
                        96hr reading: {format(addHours(newSessionData.applicationDate, 96), 'MMM d, h:mm a')}
                      </Alert>
                    </Grid>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        label="Indication / Reason for Testing"
                        multiline
                        rows={2}
                        value={newSessionData.indication}
                        onChange={(e) =>
                          setNewSessionData({ ...newSessionData, indication: e.target.value })
                        }
                        placeholder="E.g., Chronic hand dermatitis, suspected occupational exposure..."
                      />
                    </Grid>
                  </Grid>
                </StepContent>
              </Step>
            </Stepper>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setShowNewSessionDialog(false)}>Cancel</Button>
            <Button
              variant="contained"
              onClick={createSession}
              disabled={!newSessionData.patientId || newSessionData.panelIds.length === 0}
            >
              Create Session
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </LocalizationProvider>
  );
};

export default PatchTestPage;
