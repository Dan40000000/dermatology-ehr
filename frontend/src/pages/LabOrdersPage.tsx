import React, { useState, useEffect } from 'react';
import {
  Container,
  Paper,
  Typography,
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Grid,
  Alert,
  Tooltip,
  CircularProgress
} from '@mui/material';
import {
  Add as AddIcon,
  Visibility as ViewIcon,
  Send as SendIcon,
  Science as ScienceIcon,
  LocalShipping as ShipIcon,
  CheckCircle as CheckIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import LabOrderForm from '../components/LabOrderForm';

interface LabOrder {
  id: string;
  patient_name: string;
  mrn: string;
  ordering_provider_name: string;
  vendor_name: string;
  vendor_type: string;
  order_date: string;
  status: string;
  priority: string;
  tests: any[];
  result_count: number;
  specimen_id?: string;
  has_critical_values?: boolean;
  is_abnormal?: boolean;
}

const LabOrdersPage: React.FC = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [vendorFilter, setVendorFilter] = useState<string>('');

  useEffect(() => {
    fetchOrders();
  }, [statusFilter, vendorFilter]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();

      if (statusFilter) params.append('status', statusFilter);
      if (vendorFilter) params.append('vendor_id', vendorFilter);

      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'}/api/lab-orders?${params}`, {
        credentials: 'include'
      });

      if (!response.ok) throw new Error('Failed to fetch lab orders');

      const data = await response.json();
      setOrders(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error'> = {
      pending: 'warning',
      collected: 'info',
      sent: 'primary',
      received: 'secondary',
      processing: 'secondary',
      partial_results: 'info',
      completed: 'success',
      cancelled: 'error'
    };
    return colors[status] || 'default';
  };

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, 'default' | 'error' | 'warning' | 'info'> = {
      stat: 'error',
      urgent: 'warning',
      routine: 'default',
      timed: 'info'
    };
    return colors[priority] || 'default';
  };

  const handleSubmitOrder = async (orderId: string) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'}/api/lab-orders/${orderId}/submit`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) throw new Error('Failed to submit order');

      await fetchOrders();
      alert('Order submitted successfully');
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleOrderCreated = () => {
    setCreateDialogOpen(false);
    fetchOrders();
  };

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          <ScienceIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Laboratory Orders
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateDialogOpen(true)}
        >
          New Lab Order
        </Button>
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              select
              label="Status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              size="small"
            >
              <MenuItem value="">All Statuses</MenuItem>
              <MenuItem value="pending">Pending</MenuItem>
              <MenuItem value="collected">Collected</MenuItem>
              <MenuItem value="sent">Sent</MenuItem>
              <MenuItem value="received">Received</MenuItem>
              <MenuItem value="processing">Processing</MenuItem>
              <MenuItem value="completed">Completed</MenuItem>
            </TextField>
          </Grid>
        </Grid>
      </Paper>

      {/* Orders Table */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : error ? (
        <Alert severity="error">{error}</Alert>
      ) : orders.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="textSecondary">No lab orders found</Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Order Date</TableCell>
                <TableCell>Patient</TableCell>
                <TableCell>Provider</TableCell>
                <TableCell>Lab Vendor</TableCell>
                <TableCell>Tests</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Priority</TableCell>
                <TableCell>Results</TableCell>
                <TableCell>Specimen ID</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id} hover>
                  <TableCell>
                    {new Date(order.order_date).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div>
                      <strong>{order.patient_name}</strong>
                      <div style={{ fontSize: '0.85em', color: '#666' }}>
                        MRN: {order.mrn}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{order.ordering_provider_name}</TableCell>
                  <TableCell>
                    <div>
                      {order.vendor_name}
                      <Chip
                        label={order.vendor_type}
                        size="small"
                        sx={{ ml: 1 }}
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={`${order.tests?.length || 0} tests`}
                      size="small"
                      color="primary"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={order.status}
                      color={getStatusColor(order.status)}
                      size="small"
                    />
                    {order.has_critical_values && (
                      <Tooltip title="Contains critical values">
                        <Chip
                          label="CRITICAL"
                          color="error"
                          size="small"
                          sx={{ ml: 1 }}
                        />
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={order.priority}
                      color={getPriorityColor(order.priority)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {order.result_count > 0 ? (
                      <Chip
                        label={`${order.result_count} results`}
                        color={order.is_abnormal ? 'warning' : 'success'}
                        size="small"
                        icon={<CheckIcon />}
                      />
                    ) : (
                      <Typography variant="body2" color="textSecondary">
                        Pending
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {order.specimen_id ? (
                      <Typography variant="body2" fontFamily="monospace">
                        {order.specimen_id}
                      </Typography>
                    ) : (
                      <Typography variant="body2" color="textSecondary">
                        -
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Tooltip title="View Details">
                      <IconButton
                        size="small"
                        onClick={() => navigate(`/lab-orders/${order.id}`)}
                      >
                        <ViewIcon />
                      </IconButton>
                    </Tooltip>
                    {order.status === 'pending' && (
                      <Tooltip title="Submit Order">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => handleSubmitOrder(order.id)}
                        >
                          <SendIcon />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Create Order Dialog */}
      <Dialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Create Lab Order</DialogTitle>
        <DialogContent>
          <LabOrderForm
            patientId={selectedPatientId}
            onSuccess={handleOrderCreated}
            onCancel={() => setCreateDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </Container>
  );
};

export default LabOrdersPage;
