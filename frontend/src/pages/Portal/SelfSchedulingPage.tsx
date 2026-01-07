import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Stepper,
  Step,
  StepLabel,
  Button,
  Card,
  CardContent,
  Grid,
  Avatar,
  Chip,
  TextField,
  MenuItem,
  Alert,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  Paper,
} from '@mui/material';
import {
  CalendarMonth as CalendarIcon,
  Person as PersonIcon,
  AccessTime as TimeIcon,
  Check as CheckIcon,
} from '@mui/icons-material';

// This would come from your existing patient portal routing/auth
interface SelfSchedulingPageProps {
  tenantId: string;
  portalToken: string;
}

interface Provider {
  id: string;
  fullName: string;
  specialty: string;
  bio?: string;
  profileImageUrl?: string;
}

interface AppointmentType {
  id: string;
  name: string;
  durationMinutes: number;
  description?: string;
  color?: string;
}

interface TimeSlot {
  start: string;
  end: string;
  providerId: string;
}

const steps = ['Select Provider', 'Choose Type', 'Pick Date & Time', 'Confirm'];

export default function SelfSchedulingPage({ tenantId, portalToken }: SelfSchedulingPageProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Step 1: Provider selection
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);

  // Step 2: Appointment type
  const [appointmentTypes, setAppointmentTypes] = useState<AppointmentType[]>([]);
  const [selectedType, setSelectedType] = useState<AppointmentType | null>(null);

  // Step 3: Date & time
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);

  // Step 4: Reason/notes
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  // Booking settings
  const [bookingSettings, setBookingSettings] = useState<any>(null);

  // Load initial data
  useEffect(() => {
    loadBookingSettings();
    loadProviders();
    loadAppointmentTypes();
  }, []);

  const loadBookingSettings = async () => {
    try {
      // Mock settings - replace with actual API call
      setBookingSettings({
        isEnabled: true,
        minAdvanceHours: 24,
        maxAdvanceDays: 60,
        customMessage: 'Welcome to our online booking system!',
        requireReason: false,
      });
    } catch (err) {
      console.error('Failed to load booking settings:', err);
    }
  };

  const loadProviders = async () => {
    try {
      setLoading(true);
      // Mock providers - replace with actual API call
      setProviders([
        {
          id: '1',
          fullName: 'Dr. Sarah Johnson',
          specialty: 'Medical Dermatology',
          bio: 'Board-certified dermatologist specializing in skin cancer screening and treatment.',
          profileImageUrl: undefined,
        },
        {
          id: '2',
          fullName: 'Dr. Michael Chen',
          specialty: 'Cosmetic Dermatology',
          bio: 'Expert in cosmetic procedures including Botox, fillers, and laser treatments.',
          profileImageUrl: undefined,
        },
      ]);
    } catch (err) {
      setError('Failed to load providers');
    } finally {
      setLoading(false);
    }
  };

  const loadAppointmentTypes = async () => {
    try {
      // Mock appointment types - replace with actual API call
      setAppointmentTypes([
        { id: '1', name: 'New Patient Visit', durationMinutes: 60, description: 'Comprehensive initial consultation', color: '#4CAF50' },
        { id: '2', name: 'Follow-up Visit', durationMinutes: 30, description: 'Follow-up appointment for existing patients', color: '#2196F3' },
        { id: '3', name: 'Skin Check', durationMinutes: 30, description: 'Full body skin cancer screening', color: '#FF9800' },
        { id: '4', name: 'Cosmetic Consultation', durationMinutes: 45, description: 'Consultation for cosmetic procedures', color: '#9C27B0' },
      ]);
    } catch (err) {
      setError('Failed to load appointment types');
    }
  };

  const loadAvailableSlots = async (date: string) => {
    if (!selectedProvider || !selectedType) return;

    try {
      setLoading(true);
      // Mock available slots - replace with actual API call
      const mockSlots: TimeSlot[] = [
        { start: `${date}T09:00:00`, end: `${date}T10:00:00`, providerId: selectedProvider.id },
        { start: `${date}T10:00:00`, end: `${date}T11:00:00`, providerId: selectedProvider.id },
        { start: `${date}T11:00:00`, end: `${date}T12:00:00`, providerId: selectedProvider.id },
        { start: `${date}T14:00:00`, end: `${date}T15:00:00`, providerId: selectedProvider.id },
        { start: `${date}T15:00:00`, end: `${date}T16:00:00`, providerId: selectedProvider.id },
        { start: `${date}T16:00:00`, end: `${date}T17:00:00`, providerId: selectedProvider.id },
      ];
      setAvailableSlots(mockSlots);
    } catch (err) {
      setError('Failed to load available times');
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (activeStep === 2 && selectedDate) {
      loadAvailableSlots(selectedDate);
    }
    setActiveStep((prev) => prev + 1);
  };

  const handleBack = () => {
    setActiveStep((prev) => prev - 1);
  };

  const handleBookAppointment = async () => {
    try {
      setLoading(true);
      setError(null);

      // Mock booking - replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 1500));

      setSuccess(true);
    } catch (err) {
      setError('Failed to book appointment. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  if (success) {
    return (
      <Container maxWidth="md" sx={{ py: 8 }}>
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <CheckIcon sx={{ fontSize: 80, color: 'success.main', mb: 2 }} />
          <Typography variant="h4" gutterBottom>
            Appointment Confirmed!
          </Typography>
          <Typography variant="body1" color="text.secondary" paragraph>
            Your appointment has been successfully booked.
          </Typography>
          <Box sx={{ mt: 4 }}>
            <Typography variant="h6" gutterBottom>
              Appointment Details
            </Typography>
            <Typography>Provider: {selectedProvider?.fullName}</Typography>
            <Typography>Type: {selectedType?.name}</Typography>
            {selectedSlot && (
              <>
                <Typography>Date: {formatDate(selectedSlot.start)}</Typography>
                <Typography>Time: {formatTime(selectedSlot.start)}</Typography>
              </>
            )}
          </Box>
          <Button variant="contained" sx={{ mt: 4 }} onClick={() => window.location.reload()}>
            Book Another Appointment
          </Button>
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>
        Book an Appointment
      </Typography>

      {bookingSettings?.customMessage && (
        <Alert severity="info" sx={{ mb: 3 }}>
          {bookingSettings.customMessage}
        </Alert>
      )}

      <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
        {steps.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Step 1: Select Provider */}
      {activeStep === 0 && (
        <Box>
          <Typography variant="h6" gutterBottom>
            Choose Your Provider
          </Typography>
          <Grid container spacing={3}>
            {providers.map((provider) => (
              <Grid item xs={12} md={6} key={provider.id}>
                <Card
                  sx={{
                    cursor: 'pointer',
                    border: selectedProvider?.id === provider.id ? 2 : 1,
                    borderColor: selectedProvider?.id === provider.id ? 'primary.main' : 'divider',
                    '&:hover': { borderColor: 'primary.main' },
                  }}
                  onClick={() => setSelectedProvider(provider)}
                >
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                      <Avatar sx={{ mr: 2, width: 60, height: 60 }}>
                        <PersonIcon />
                      </Avatar>
                      <Box>
                        <Typography variant="h6">{provider.fullName}</Typography>
                        <Chip label={provider.specialty} size="small" color="primary" variant="outlined" />
                      </Box>
                    </Box>
                    {provider.bio && (
                      <Typography variant="body2" color="text.secondary">
                        {provider.bio}
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* Step 2: Select Appointment Type */}
      {activeStep === 1 && (
        <Box>
          <Typography variant="h6" gutterBottom>
            What brings you in?
          </Typography>
          <Grid container spacing={2}>
            {appointmentTypes.map((type) => (
              <Grid item xs={12} sm={6} key={type.id}>
                <Card
                  sx={{
                    cursor: 'pointer',
                    border: selectedType?.id === type.id ? 2 : 1,
                    borderColor: selectedType?.id === type.id ? 'primary.main' : 'divider',
                    '&:hover': { borderColor: 'primary.main' },
                  }}
                  onClick={() => setSelectedType(type)}
                >
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 1 }}>
                      <Typography variant="h6">{type.name}</Typography>
                      <Chip
                        label={`${type.durationMinutes} min`}
                        size="small"
                        icon={<TimeIcon />}
                      />
                    </Box>
                    {type.description && (
                      <Typography variant="body2" color="text.secondary">
                        {type.description}
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* Step 3: Select Date & Time */}
      {activeStep === 2 && (
        <Box>
          <Typography variant="h6" gutterBottom>
            Pick a Date and Time
          </Typography>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                type="date"
                label="Select Date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  loadAvailableSlots(e.target.value);
                }}
                InputLabelProps={{ shrink: true }}
                inputProps={{
                  min: new Date().toISOString().split('T')[0],
                }}
              />
            </Grid>
          </Grid>

          {selectedDate && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle1" gutterBottom>
                Available Times
              </Typography>
              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress />
                </Box>
              ) : availableSlots.length === 0 ? (
                <Alert severity="info">No available times for this date. Please select another date.</Alert>
              ) : (
                <Grid container spacing={2}>
                  {availableSlots.map((slot, index) => (
                    <Grid item xs={6} sm={4} md={3} key={index}>
                      <Button
                        fullWidth
                        variant={selectedSlot === slot ? 'contained' : 'outlined'}
                        onClick={() => setSelectedSlot(slot)}
                      >
                        {formatTime(slot.start)}
                      </Button>
                    </Grid>
                  ))}
                </Grid>
              )}
            </Box>
          )}
        </Box>
      )}

      {/* Step 4: Confirm */}
      {activeStep === 3 && (
        <Box>
          <Typography variant="h6" gutterBottom>
            Confirm Your Appointment
          </Typography>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Provider
                  </Typography>
                  <Typography variant="body1">{selectedProvider?.fullName}</Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Appointment Type
                  </Typography>
                  <Typography variant="body1">{selectedType?.name}</Typography>
                </Grid>
                {selectedSlot && (
                  <>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Date
                      </Typography>
                      <Typography variant="body1">{formatDate(selectedSlot.start)}</Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Time
                      </Typography>
                      <Typography variant="body1">{formatTime(selectedSlot.start)}</Typography>
                    </Grid>
                  </>
                )}
              </Grid>
            </CardContent>
          </Card>

          <TextField
            fullWidth
            multiline
            rows={3}
            label="Reason for Visit (Optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            sx={{ mb: 2 }}
          />

          <TextField
            fullWidth
            multiline
            rows={2}
            label="Additional Notes (Optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Box>
      )}

      {/* Navigation Buttons */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4 }}>
        <Button disabled={activeStep === 0} onClick={handleBack}>
          Back
        </Button>
        <Box>
          {activeStep === steps.length - 1 ? (
            <Button
              variant="contained"
              onClick={handleBookAppointment}
              disabled={loading || !selectedSlot}
            >
              {loading ? <CircularProgress size={24} /> : 'Book Appointment'}
            </Button>
          ) : (
            <Button
              variant="contained"
              onClick={handleNext}
              disabled={
                (activeStep === 0 && !selectedProvider) ||
                (activeStep === 1 && !selectedType) ||
                (activeStep === 2 && !selectedSlot)
              }
            >
              Next
            </Button>
          )}
        </Box>
      </Box>
    </Container>
  );
}
