import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  Typography,
  Box,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  LocalPharmacy as PharmacyIcon,
  Warning as WarningIcon,
  Refresh as RefreshIcon,
  Add as AddIcon,
  History as HistoryIcon,
} from '@mui/icons-material';
import { format, differenceInDays } from 'date-fns';
import api from '../../api';

interface ActiveMedication {
  id: string;
  medicationName: string;
  genericName?: string;
  strength?: string;
  dosageForm?: string;
  sig: string;
  refillsRemaining?: number;
  lastFilledDate?: string;
  daysSupply?: number;
  isControlled: boolean;
  deaSchedule?: string;
  providerName?: string;
  status: string;
  writtenDate: string;
}

interface ActiveMedicationsCardProps {
  patientId: string;
  onAddMedication?: () => void;
  onViewAll?: () => void;
  maxDisplay?: number;
  showRefillAlerts?: boolean;
}

export const ActiveMedicationsCard: React.FC<ActiveMedicationsCardProps> = ({
  patientId,
  onAddMedication,
  onViewAll,
  maxDisplay = 5,
  showRefillAlerts = true,
}) => {
  const [medications, setMedications] = useState<ActiveMedication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActiveMedications = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/api/patients/${patientId}/prescriptions`, {
        params: {
          status: 'sent',
          includeInactive: 'false',
        },
      });

      const allPrescriptions = response.data.prescriptions || [];

      // Filter for truly active medications
      const active = allPrescriptions.filter((p: ActiveMedication) => {
        return (
          p.status !== 'cancelled' &&
          p.status !== 'discontinued' &&
          (p.refillsRemaining === null || p.refillsRemaining > 0)
        );
      });

      setMedications(active);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load medications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (patientId) {
      fetchActiveMedications();
    }
  }, [patientId]);

  const needsRefillSoon = (med: ActiveMedication): boolean => {
    if (!showRefillAlerts || !med.lastFilledDate || !med.daysSupply) {
      return false;
    }

    const daysSinceFilled = differenceInDays(new Date(), new Date(med.lastFilledDate));
    const daysRemaining = med.daysSupply - daysSinceFilled;

    return daysRemaining <= 7 && daysRemaining > 0;
  };

  const isOverdue = (med: ActiveMedication): boolean => {
    if (!showRefillAlerts || !med.lastFilledDate || !med.daysSupply) {
      return false;
    }

    const daysSinceFilled = differenceInDays(new Date(), new Date(med.lastFilledDate));
    return daysSinceFilled > med.daysSupply;
  };

  const displayMedications = medications.slice(0, maxDisplay);
  const hasMore = medications.length > maxDisplay;

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Box display="flex" justifyContent="center" alignItems="center" minHeight={150}>
            <CircularProgress />
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent>
          <Alert severity="error">{error}</Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        avatar={<PharmacyIcon color="primary" />}
        title={
          <Box display="flex" alignItems="center" gap={1}>
            <Typography variant="h6">Active Medications</Typography>
            <Chip label={medications.length} size="small" color="primary" />
          </Box>
        }
        action={
          <Box>
            <Tooltip title="Refresh">
              <IconButton onClick={fetchActiveMedications} size="small">
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            {onAddMedication && (
              <Tooltip title="Add Medication">
                <IconButton onClick={onAddMedication} size="small" color="primary">
                  <AddIcon />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        }
      />
      <CardContent sx={{ pt: 0 }}>
        {medications.length === 0 ? (
          <Alert severity="info">No active medications</Alert>
        ) : (
          <>
            <List dense>
              {displayMedications.map((med, index) => {
                const refillSoon = needsRefillSoon(med);
                const overdue = isOverdue(med);

                return (
                  <React.Fragment key={med.id}>
                    {index > 0 && <Divider />}
                    <ListItem
                      sx={{
                        px: 0,
                        backgroundColor: overdue
                          ? 'error.lighter'
                          : refillSoon
                          ? 'warning.lighter'
                          : 'transparent',
                      }}
                    >
                      <ListItemIcon>
                        {med.isControlled ? (
                          <Tooltip title={`Controlled Substance - Schedule ${med.deaSchedule}`}>
                            <WarningIcon color="error" />
                          </Tooltip>
                        ) : (
                          <PharmacyIcon color="action" />
                        )}
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                            <Typography variant="body1" fontWeight="medium">
                              {med.medicationName}
                            </Typography>
                            {med.strength && (
                              <Typography variant="body2" color="text.secondary">
                                {med.strength}
                              </Typography>
                            )}
                            {med.isControlled && (
                              <Chip label={`C-${med.deaSchedule}`} size="small" color="error" />
                            )}
                            {refillSoon && !overdue && (
                              <Chip label="Refill Soon" size="small" color="warning" />
                            )}
                            {overdue && <Chip label="Refill Overdue" size="small" color="error" />}
                          </Box>
                        }
                        secondary={
                          <Box>
                            <Typography variant="body2" color="text.secondary">
                              {med.sig}
                            </Typography>
                            {med.genericName && med.genericName !== med.medicationName && (
                              <Typography variant="caption" color="text.secondary">
                                Generic: {med.genericName}
                              </Typography>
                            )}
                            <Box display="flex" gap={2} mt={0.5}>
                              {med.refillsRemaining !== null && (
                                <Typography variant="caption" color="text.secondary">
                                  Refills: {med.refillsRemaining}
                                </Typography>
                              )}
                              {med.lastFilledDate && (
                                <Typography variant="caption" color="text.secondary">
                                  Last filled: {format(new Date(med.lastFilledDate), 'MM/dd/yyyy')}
                                </Typography>
                              )}
                              {med.providerName && (
                                <Typography variant="caption" color="text.secondary">
                                  By: {med.providerName}
                                </Typography>
                              )}
                            </Box>
                          </Box>
                        }
                      />
                    </ListItem>
                  </React.Fragment>
                );
              })}
            </List>

            {hasMore && onViewAll && (
              <Box mt={2} textAlign="center">
                <Typography
                  variant="body2"
                  color="primary"
                  sx={{ cursor: 'pointer', textDecoration: 'underline' }}
                  onClick={onViewAll}
                >
                  View all {medications.length} medications
                </Typography>
              </Box>
            )}

            {showRefillAlerts && (
              <>
                {medications.filter(isOverdue).length > 0 && (
                  <Alert severity="error" sx={{ mt: 2 }}>
                    <strong>{medications.filter(isOverdue).length}</strong> medication(s) need immediate
                    refill
                  </Alert>
                )}
                {medications.filter(needsRefillSoon).length > 0 && (
                  <Alert severity="warning" sx={{ mt: 2 }}>
                    <strong>{medications.filter(needsRefillSoon).length}</strong> medication(s) need
                    refill within 7 days
                  </Alert>
                )}
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default ActiveMedicationsCard;
