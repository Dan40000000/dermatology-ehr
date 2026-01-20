import React, { useState, useEffect } from 'react';
import {
  Alert,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Button,
  Typography,
  CircularProgress,
} from '@mui/material';
import { Warning as WarningIcon, Autorenew as RenewIcon } from '@mui/icons-material';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { api } from '../../api';

interface ExpiringPA {
  id: string;
  patient_name: string;
  medication_name: string;
  procedure_code: string;
  expiration_date: string;
  days_until_expiration: number;
  auth_number: string;
  payer_name: string;
}

interface ExpirationAlertsProps {
  onPAClick: (paId: string) => void;
  onRefresh: () => void;
}

const ExpirationAlerts: React.FC<ExpirationAlertsProps> = ({ onPAClick, onRefresh }) => {
  const [expiringPAs, setExpiringPAs] = useState<ExpiringPA[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadExpiringPAs();
  }, []);

  const loadExpiringPAs = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/prior-auth/expiring', {
        params: { days: 30 },
      });
      setExpiringPAs(response.data);
    } catch (error) {
      console.error('Error loading expiring PAs:', error);
      toast.error('Failed to load expiring authorizations');
    } finally {
      setLoading(false);
    }
  };

  const urgentCount = expiringPAs.filter((pa) => pa.days_until_expiration <= 7).length;
  const warningCount = expiringPAs.filter(
    (pa) => pa.days_until_expiration > 7 && pa.days_until_expiration <= 30
  ).length;

  const getRowColor = (days: number) => {
    if (days <= 7) return 'error.light';
    if (days <= 14) return 'warning.light';
    return 'transparent';
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Summary Alerts */}
      {urgentCount > 0 && (
        <Alert severity="error" icon={<WarningIcon />} sx={{ mb: 2 }}>
          <Typography variant="body1">
            <strong>CRITICAL: {urgentCount}</strong> authorization
            {urgentCount === 1 ? '' : 's'} expiring within 7 days!
          </Typography>
          <Typography variant="body2">
            Biologics require renewal before expiration. Patient care may be interrupted if not
            renewed immediately.
          </Typography>
        </Alert>
      )}

      {warningCount > 0 && urgentCount === 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography variant="body1">
            <strong>{warningCount}</strong> authorization{warningCount === 1 ? '' : 's'} expiring
            within 30 days
          </Typography>
          <Typography variant="body2">
            Plan renewal now to avoid treatment delays.
          </Typography>
        </Alert>
      )}

      {/* Expiring PAs Table */}
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Priority</TableCell>
              <TableCell>Patient</TableCell>
              <TableCell>Medication/Procedure</TableCell>
              <TableCell>Payer</TableCell>
              <TableCell>Auth Number</TableCell>
              <TableCell>Expiration Date</TableCell>
              <TableCell>Days Remaining</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {expiringPAs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">
                    No authorizations expiring in the next 30 days
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Great job staying on top of renewals!
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              expiringPAs.map((pa) => (
                <TableRow
                  key={pa.id}
                  sx={{
                    bgcolor: getRowColor(pa.days_until_expiration),
                    '&:hover': { bgcolor: 'action.hover' },
                    cursor: 'pointer',
                  }}
                  onClick={() => onPAClick(pa.id)}
                >
                  <TableCell>
                    {pa.days_until_expiration <= 7 ? (
                      <Chip label="URGENT" color="error" size="small" />
                    ) : pa.days_until_expiration <= 14 ? (
                      <Chip label="HIGH" color="warning" size="small" />
                    ) : (
                      <Chip label="MEDIUM" color="default" size="small" />
                    )}
                  </TableCell>

                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {pa.patient_name}
                    </Typography>
                  </TableCell>

                  <TableCell>
                    <Typography variant="body2">
                      {pa.medication_name || pa.procedure_code}
                    </Typography>
                  </TableCell>

                  <TableCell>
                    <Typography variant="body2">{pa.payer_name}</Typography>
                  </TableCell>

                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                      {pa.auth_number}
                    </Typography>
                  </TableCell>

                  <TableCell>
                    <Typography variant="body2">
                      {format(new Date(pa.expiration_date), 'MM/dd/yyyy')}
                    </Typography>
                  </TableCell>

                  <TableCell>
                    <Box display="flex" alignItems="center" gap={1}>
                      <Typography
                        variant="body2"
                        fontWeight="bold"
                        color={
                          pa.days_until_expiration <= 7
                            ? 'error.main'
                            : pa.days_until_expiration <= 14
                            ? 'warning.main'
                            : 'text.primary'
                        }
                      >
                        {pa.days_until_expiration}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        days
                      </Typography>
                    </Box>
                  </TableCell>

                  <TableCell align="right">
                    <Button
                      size="small"
                      variant={pa.days_until_expiration <= 7 ? 'contained' : 'outlined'}
                      color={pa.days_until_expiration <= 7 ? 'error' : 'primary'}
                      startIcon={<RenewIcon />}
                      onClick={(e) => {
                        e.stopPropagation();
                        toast.info('Opening renewal form...');
                        onPAClick(pa.id);
                      }}
                    >
                      {pa.days_until_expiration <= 7 ? 'Renew Now' : 'Renew'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Help Text */}
      {expiringPAs.length > 0 && (
        <Box sx={{ mt: 3, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
          <Typography variant="subtitle2" gutterBottom>
            Renewal Best Practices:
          </Typography>
          <Typography variant="body2" color="text.secondary" component="div">
            <ul style={{ margin: 0, paddingLeft: '20px' }}>
              <li>
                <strong>Biologics:</strong> Start renewal process 45-60 days before expiration
              </li>
              <li>
                <strong>Critical medications:</strong> Never let authorization lapse - patient safety
                risk
              </li>
              <li>
                <strong>Documentation:</strong> Update clinical notes to show ongoing medical
                necessity
              </li>
              <li>
                <strong>Communication:</strong> Notify patient of renewal status to avoid treatment
                interruption
              </li>
              <li>
                <strong>Follow-up:</strong> Check payer status 2-3 times per week for pending renewals
              </li>
            </ul>
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default ExpirationAlerts;
