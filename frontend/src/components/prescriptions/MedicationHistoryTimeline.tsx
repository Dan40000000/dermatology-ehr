import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  IconButton,
  Tooltip,
  Alert,
  CircularProgress,
  Collapse,
} from '@mui/material';
import {
  Timeline,
  TimelineItem,
  TimelineSeparator,
  TimelineConnector,
  TimelineContent,
  TimelineDot,
  TimelineOppositeContent,
} from '@mui/lab';
import {
  LocalPharmacy as PharmacyIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Send as SendIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import { format, formatDistanceToNow } from 'date-fns';
import api from '../../api';

interface PrescriptionEvent {
  id: string;
  medicationName: string;
  genericName?: string;
  strength?: string;
  sig: string;
  quantity: number;
  refills: number;
  status: string;
  isControlled: boolean;
  deaSchedule?: string;
  providerName?: string;
  pharmacyName?: string;
  encounterDate?: string;
  writtenDate: string;
  sentAt?: string;
  createdAt: string;
  indication?: string;
  notes?: string;
}

interface MedicationHistoryTimelineProps {
  patientId: string;
  maxEvents?: number;
  showControls?: boolean;
}

export const MedicationHistoryTimeline: React.FC<MedicationHistoryTimelineProps> = ({
  patientId,
  maxEvents = 10,
  showControls = true,
}) => {
  const [events, setEvents] = useState<PrescriptionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.get(`/api/patients/${patientId}/prescriptions`, {
          params: { includeInactive: 'true' },
        });
        const prescriptions = response.data.prescriptions || [];
        setEvents(prescriptions.slice(0, maxEvents));
      } catch (err: any) {
        console.error('Error fetching medication history:', err);
        setError(err.response?.data?.error || 'Failed to load medication history');
      } finally {
        setLoading(false);
      }
    };

    if (patientId) {
      fetchHistory();
    }
  }, [patientId, maxEvents]);

  const toggleExpanded = (id: string) => {
    setExpandedItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const getEventIcon = (status: string, isControlled: boolean) => {
    if (status === 'cancelled' || status === 'discontinued') {
      return <CancelIcon />;
    }
    if (status === 'sent' || status === 'transmitted') {
      return <SendIcon />;
    }
    if (isControlled) {
      return <WarningIcon />;
    }
    return <PharmacyIcon />;
  };

  const getEventColor = (status: string, isControlled: boolean): any => {
    if (status === 'cancelled' || status === 'discontinued') {
      return 'error';
    }
    if (status === 'sent' || status === 'transmitted') {
      return 'success';
    }
    if (isControlled) {
      return 'warning';
    }
    return 'primary';
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (events.length === 0) {
    return <Alert severity="info">No medication history available</Alert>;
  }

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Medication History
        </Typography>

        <Timeline position="right">
          {events.map((event, index) => {
            const isExpanded = expandedItems.has(event.id);
            const eventDate = new Date(event.writtenDate || event.createdAt);

            return (
              <TimelineItem key={event.id}>
                <TimelineOppositeContent color="text.secondary" sx={{ flex: 0.3 }}>
                  <Typography variant="body2">{format(eventDate, 'MMM dd, yyyy')}</Typography>
                  <Typography variant="caption">{formatDistanceToNow(eventDate, { addSuffix: true })}</Typography>
                </TimelineOppositeContent>

                <TimelineSeparator>
                  <TimelineDot color={getEventColor(event.status, event.isControlled)}>
                    {getEventIcon(event.status, event.isControlled)}
                  </TimelineDot>
                  {index < events.length - 1 && <TimelineConnector />}
                </TimelineSeparator>

                <TimelineContent>
                  <Card variant="outlined" sx={{ mb: 2 }}>
                    <CardContent sx={{ pb: isExpanded ? 2 : 1, '&:last-child': { pb: isExpanded ? 2 : 1 } }}>
                      <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                        <Box flex={1}>
                          <Box display="flex" alignItems="center" gap={1} flexWrap="wrap" mb={0.5}>
                            <Typography variant="subtitle1" fontWeight="bold">
                              {event.medicationName}
                            </Typography>
                            {event.strength && (
                              <Typography variant="body2" color="text.secondary">
                                {event.strength}
                              </Typography>
                            )}
                            {event.isControlled && (
                              <Chip label={`C-${event.deaSchedule}`} size="small" color="error" />
                            )}
                            <Chip label={event.status} size="small" color={getEventColor(event.status, event.isControlled)} />
                          </Box>

                          {event.genericName && event.genericName !== event.medicationName && (
                            <Typography variant="caption" color="text.secondary" display="block">
                              Generic: {event.genericName}
                            </Typography>
                          )}

                          <Typography variant="body2" color="text.secondary" gutterBottom>
                            {event.sig}
                          </Typography>

                          <Box display="flex" gap={2} flexWrap="wrap">
                            <Typography variant="caption" color="text.secondary">
                              Qty: {event.quantity}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Refills: {event.refills}
                            </Typography>
                            {event.providerName && (
                              <Typography variant="caption" color="text.secondary">
                                By: {event.providerName}
                              </Typography>
                            )}
                          </Box>
                        </Box>

                        {showControls && (
                          <IconButton size="small" onClick={() => toggleExpanded(event.id)}>
                            {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                          </IconButton>
                        )}
                      </Box>

                      <Collapse in={isExpanded}>
                        <Box mt={2} pt={2} borderTop={1} borderColor="divider">
                          {event.indication && (
                            <Box mb={1}>
                              <Typography variant="caption" color="text.secondary" fontWeight="bold">
                                Indication:
                              </Typography>
                              <Typography variant="body2">{event.indication}</Typography>
                            </Box>
                          )}

                          {event.pharmacyName && (
                            <Box mb={1}>
                              <Typography variant="caption" color="text.secondary" fontWeight="bold">
                                Pharmacy:
                              </Typography>
                              <Typography variant="body2">{event.pharmacyName}</Typography>
                            </Box>
                          )}

                          {event.encounterDate && (
                            <Box mb={1}>
                              <Typography variant="caption" color="text.secondary" fontWeight="bold">
                                Encounter Date:
                              </Typography>
                              <Typography variant="body2">
                                {format(new Date(event.encounterDate), 'MMM dd, yyyy')}
                              </Typography>
                            </Box>
                          )}

                          {event.sentAt && (
                            <Box mb={1}>
                              <Typography variant="caption" color="text.secondary" fontWeight="bold">
                                Sent to Pharmacy:
                              </Typography>
                              <Typography variant="body2">
                                {format(new Date(event.sentAt), 'MMM dd, yyyy h:mm a')}
                              </Typography>
                            </Box>
                          )}

                          {event.notes && (
                            <Box mb={1}>
                              <Typography variant="caption" color="text.secondary" fontWeight="bold">
                                Notes:
                              </Typography>
                              <Typography variant="body2">{event.notes}</Typography>
                            </Box>
                          )}
                        </Box>
                      </Collapse>
                    </CardContent>
                  </Card>
                </TimelineContent>
              </TimelineItem>
            );
          })}
        </Timeline>
      </CardContent>
    </Card>
  );
};

export default MedicationHistoryTimeline;
