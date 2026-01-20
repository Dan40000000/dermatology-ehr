import React, { useState, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Paper,
  Chip,
  IconButton,
  Tooltip,
  TextField,
  Box,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Button,
} from '@mui/material';
import {
  Visibility as ViewIcon,
  Phone as PhoneIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { api } from '../../api';

interface PriorAuth {
  id: string;
  patient_name: string;
  medication_name: string | null;
  procedure_code: string | null;
  payer_name: string;
  status: string;
  days_pending: number | null;
  expiration_date: string | null;
  days_until_expiration: number | null;
  reference_number: string;
  created_at: string;
  urgency: string;
}

interface PriorAuthListProps {
  filterStatus?: string;
  onPAClick: (paId: string) => void;
  onRefresh: () => void;
}

const PriorAuthList: React.FC<PriorAuthListProps> = ({
  filterStatus = 'all',
  onPAClick,
  onRefresh,
}) => {
  const [priorAuths, setPriorAuths] = useState<PriorAuth[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [searchTerm, setSearchTerm] = useState('');
  const [localStatusFilter, setLocalStatusFilter] = useState(filterStatus);
  const [authTypeFilter, setAuthTypeFilter] = useState('all');

  useEffect(() => {
    setLocalStatusFilter(filterStatus);
  }, [filterStatus]);

  useEffect(() => {
    loadPriorAuths();
  }, [page, rowsPerPage, searchTerm, localStatusFilter, authTypeFilter]);

  const loadPriorAuths = async () => {
    try {
      setLoading(true);
      const params: any = {
        page: page + 1,
        limit: rowsPerPage,
      };

      if (searchTerm) params.search = searchTerm;
      if (localStatusFilter && localStatusFilter !== 'all') params.status = localStatusFilter;
      if (authTypeFilter && authTypeFilter !== 'all') params.authType = authTypeFilter;

      const response = await api.get('/api/prior-auth', { params });
      setPriorAuths(response.data.data || response.data);
    } catch (error) {
      console.error('Error loading prior auths:', error);
      toast.error('Failed to load prior authorizations');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string): 'default' | 'primary' | 'success' | 'error' | 'warning' => {
    switch (status) {
      case 'approved':
        return 'success';
      case 'denied':
        return 'error';
      case 'pending':
      case 'submitted':
        return 'primary';
      case 'appealed':
        return 'warning';
      default:
        return 'default';
    }
  };

  const getUrgencyColor = (urgency: string): 'error' | 'warning' | 'default' => {
    switch (urgency) {
      case 'stat':
        return 'error';
      case 'urgent':
        return 'warning';
      default:
        return 'default';
    }
  };

  const getExpirationColor = (days: number | null): string => {
    if (!days) return 'inherit';
    if (days <= 7) return 'error.main';
    if (days <= 30) return 'warning.main';
    return 'inherit';
  };

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  return (
    <Box>
      {/* Filters */}
      <Box display="flex" gap={2} mb={3} flexWrap="wrap">
        <TextField
          label="Search"
          variant="outlined"
          size="small"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Patient, medication, ref #..."
          sx={{ minWidth: 250 }}
        />

        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Status</InputLabel>
          <Select
            value={localStatusFilter}
            label="Status"
            onChange={(e) => setLocalStatusFilter(e.target.value)}
          >
            <MenuItem value="all">All Statuses</MenuItem>
            <MenuItem value="draft">Draft</MenuItem>
            <MenuItem value="submitted">Submitted</MenuItem>
            <MenuItem value="pending">Pending</MenuItem>
            <MenuItem value="approved">Approved</MenuItem>
            <MenuItem value="denied">Denied</MenuItem>
            <MenuItem value="appealed">Appealed</MenuItem>
            <MenuItem value="expired">Expired</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Type</InputLabel>
          <Select
            value={authTypeFilter}
            label="Type"
            onChange={(e) => setAuthTypeFilter(e.target.value)}
          >
            <MenuItem value="all">All Types</MenuItem>
            <MenuItem value="medication">Medication</MenuItem>
            <MenuItem value="procedure">Procedure</MenuItem>
            <MenuItem value="service">Service</MenuItem>
          </Select>
        </FormControl>

        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={() => {
            loadPriorAuths();
            onRefresh();
          }}
        >
          Refresh
        </Button>
      </Box>

      {/* Table */}
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Reference #</TableCell>
              <TableCell>Patient</TableCell>
              <TableCell>Medication/Service</TableCell>
              <TableCell>Payer</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Days Pending</TableCell>
              <TableCell>Expiration</TableCell>
              <TableCell>Urgency</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} align="center">
                  Loading...
                </TableCell>
              </TableRow>
            ) : priorAuths.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} align="center">
                  No prior authorizations found
                </TableCell>
              </TableRow>
            ) : (
              priorAuths.map((pa) => (
                <TableRow
                  key={pa.id}
                  hover
                  sx={{
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                  onClick={() => onPAClick(pa.id)}
                >
                  <TableCell>
                    <strong>{pa.reference_number}</strong>
                  </TableCell>
                  <TableCell>{pa.patient_name}</TableCell>
                  <TableCell>{pa.medication_name || pa.procedure_code || '-'}</TableCell>
                  <TableCell>{pa.payer_name || '-'}</TableCell>
                  <TableCell>
                    <Chip
                      label={pa.status.toUpperCase()}
                      color={getStatusColor(pa.status)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {pa.days_pending !== null ? `${pa.days_pending} days` : '-'}
                  </TableCell>
                  <TableCell>
                    {pa.expiration_date ? (
                      <Box>
                        <div>{format(new Date(pa.expiration_date), 'MM/dd/yyyy')}</div>
                        {pa.days_until_expiration !== null && (
                          <div
                            style={{
                              fontSize: '0.75rem',
                              color: getExpirationColor(pa.days_until_expiration),
                            }}
                          >
                            {pa.days_until_expiration > 0
                              ? `${pa.days_until_expiration} days`
                              : 'EXPIRED'}
                          </div>
                        )}
                      </Box>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell>
                    {pa.urgency !== 'routine' && (
                      <Chip
                        label={pa.urgency.toUpperCase()}
                        color={getUrgencyColor(pa.urgency)}
                        size="small"
                      />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="View Details">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          onPAClick(pa.id);
                        }}
                      >
                        <ViewIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Follow Up Call">
                      <IconButton size="small" onClick={(e) => e.stopPropagation()}>
                        <PhoneIcon />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pagination */}
      <TablePagination
        rowsPerPageOptions={[10, 25, 50, 100]}
        component="div"
        count={-1} // Unknown total - would need backend support
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={handleChangePage}
        onRowsPerPageChange={handleChangeRowsPerPage}
      />
    </Box>
  );
};

export default PriorAuthList;
