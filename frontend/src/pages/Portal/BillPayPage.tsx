import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  TextField,
  Alert,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  FormControlLabel,
  Checkbox,
  Radio,
  RadioGroup,
} from '@mui/material';
import {
  CreditCard as CreditCardIcon,
  Delete as DeleteIcon,
  Receipt as ReceiptIcon,
  AccountBalance as BankIcon,
  Add as AddIcon,
  Star as StarIcon,
  Check as CheckIcon,
} from '@mui/icons-material';
import {
  fetchPortalBalance,
  fetchPortalCharges,
  fetchPortalPaymentMethods,
  addPortalPaymentMethod,
  deletePortalPaymentMethod,
  makePortalPayment,
  fetchPortalPaymentHistory,
  fetchPortalAutoPay,
  enrollPortalAutoPay,
  cancelPortalAutoPay,
  type PatientBalance,
  type Charge,
  type PaymentMethod,
  type PaymentTransaction,
  type AutoPayEnrollment,
} from '../../portalApi';

interface BillPayPageProps {
  tenantId: string;
  portalToken: string;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div hidden={value !== index} {...other}>
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

export default function BillPayPage({ tenantId, portalToken }: BillPayPageProps) {
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Balance & Charges
  const [balance, setBalance] = useState<PatientBalance | null>(null);
  const [charges, setCharges] = useState<Charge[]>([]);

  // Payment Methods
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [showAddPaymentMethod, setShowAddPaymentMethod] = useState(false);

  // Payment History
  const [paymentHistory, setPaymentHistory] = useState<PaymentTransaction[]>([]);

  // Auto-Pay
  const [autoPay, setAutoPay] = useState<AutoPayEnrollment | null>(null);
  const [showAutoPayDialog, setShowAutoPayDialog] = useState(false);

  // Make Payment Dialog
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState('');

  // Add Payment Method Form
  const [newPaymentMethod, setNewPaymentMethod] = useState({
    cardNumber: '',
    cardholderName: '',
    expiryMonth: '',
    expiryYear: '',
    cvv: '',
    street: '',
    city: '',
    state: '',
    zip: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [balanceData, chargesData, methodsData, historyData, autoPayData] = await Promise.all([
        fetchPortalBalance(tenantId, portalToken),
        fetchPortalCharges(tenantId, portalToken),
        fetchPortalPaymentMethods(tenantId, portalToken),
        fetchPortalPaymentHistory(tenantId, portalToken),
        fetchPortalAutoPay(tenantId, portalToken),
      ]);

      setBalance(balanceData);
      setCharges(chargesData.charges);
      setPaymentMethods(methodsData.paymentMethods);
      setPaymentHistory(historyData.payments);
      setAutoPay(autoPayData);
    } catch (err) {
      setError('Failed to load billing information');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleMakePayment = async () => {
    if (!paymentAmount || !selectedPaymentMethodId) {
      setError('Please select a payment method and enter an amount');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      await makePortalPayment(tenantId, portalToken, {
        amount: parseFloat(paymentAmount),
        paymentMethodId: selectedPaymentMethodId,
        description: 'Patient portal payment',
      });

      setSuccess('Payment processed successfully!');
      setShowPaymentDialog(false);
      setPaymentAmount('');
      loadData();
    } catch (err) {
      setError('Payment failed. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddPaymentMethod = async () => {
    try {
      setLoading(true);
      setError(null);

      await addPortalPaymentMethod(tenantId, portalToken, {
        paymentType: 'credit_card',
        cardNumber: newPaymentMethod.cardNumber,
        cardBrand: 'visa', // Detect from card number in real implementation
        expiryMonth: parseInt(newPaymentMethod.expiryMonth),
        expiryYear: parseInt(newPaymentMethod.expiryYear),
        cardholderName: newPaymentMethod.cardholderName,
        billingAddress: {
          street: newPaymentMethod.street,
          city: newPaymentMethod.city,
          state: newPaymentMethod.state,
          zip: newPaymentMethod.zip,
          country: 'US',
        },
      });

      setSuccess('Payment method added successfully!');
      setShowAddPaymentMethod(false);
      setNewPaymentMethod({
        cardNumber: '',
        cardholderName: '',
        expiryMonth: '',
        expiryYear: '',
        cvv: '',
        street: '',
        city: '',
        state: '',
        zip: '',
      });
      loadData();
    } catch (err) {
      setError('Failed to add payment method');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePaymentMethod = async (methodId: string) => {
    if (!confirm('Are you sure you want to remove this payment method?')) return;

    try {
      setLoading(true);
      await deletePortalPaymentMethod(tenantId, portalToken, methodId);
      setSuccess('Payment method removed');
      loadData();
    } catch (err) {
      setError('Failed to remove payment method');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getCardIcon = (brand?: string) => {
    return <CreditCardIcon />;
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>
        Billing & Payments
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {/* Current Balance Card */}
      <Card sx={{ mb: 3, bgcolor: 'primary.main', color: 'white' }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={6}>
              <Typography variant="h6">Current Balance</Typography>
              <Typography variant="h3">
                {balance ? formatCurrency(balance.currentBalance) : '--'}
              </Typography>
              {balance?.lastPaymentDate && (
                <Typography variant="body2" sx={{ mt: 1, opacity: 0.9 }}>
                  Last payment: {formatCurrency(balance.lastPaymentAmount || 0)} on{' '}
                  {formatDate(balance.lastPaymentDate)}
                </Typography>
              )}
            </Grid>
            <Grid item xs={12} md={6} sx={{ textAlign: { md: 'right' } }}>
              <Button
                variant="contained"
                size="large"
                sx={{ bgcolor: 'white', color: 'primary.main', '&:hover': { bgcolor: 'grey.100' } }}
                onClick={() => setShowPaymentDialog(true)}
                disabled={!balance || balance.currentBalance <= 0}
              >
                Make a Payment
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)}>
          <Tab label="Account Activity" />
          <Tab label="Payment Methods" />
          <Tab label="Payment History" />
          <Tab label="Auto-Pay" />
        </Tabs>
      </Paper>

      {/* Tab 1: Account Activity */}
      <TabPanel value={tabValue} index={0}>
        <Typography variant="h6" gutterBottom>
          Recent Charges
        </Typography>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : charges.length === 0 ? (
          <Alert severity="info">No charges found</Alert>
        ) : (
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell align="right">Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {charges.map((charge) => (
                  <TableRow key={charge.id}>
                    <TableCell>{formatDate(charge.serviceDate)}</TableCell>
                    <TableCell>{charge.description || charge.chiefComplaint || 'Medical service'}</TableCell>
                    <TableCell>
                      <Chip
                        label={charge.transactionType}
                        size="small"
                        color={charge.transactionType === 'payment' ? 'success' : 'default'}
                      />
                    </TableCell>
                    <TableCell align="right">{formatCurrency(charge.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </TabPanel>

      {/* Tab 2: Payment Methods */}
      <TabPanel value={tabValue} index={1}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">Saved Payment Methods</Typography>
          <Button
            startIcon={<AddIcon />}
            variant="contained"
            onClick={() => setShowAddPaymentMethod(true)}
          >
            Add Payment Method
          </Button>
        </Box>

        {paymentMethods.length === 0 ? (
          <Alert severity="info">No saved payment methods</Alert>
        ) : (
          <List>
            {paymentMethods.map((method) => (
              <React.Fragment key={method.id}>
                <ListItem>
                  <Box sx={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                    {getCardIcon(method.cardBrand)}
                    <Box sx={{ ml: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Typography variant="body1" component="span">
                          {method.cardBrand?.toUpperCase()} ending in {method.lastFour}
                        </Typography>
                        {method.isDefault && <Chip label="Default" size="small" />}
                      </Box>
                      <Typography variant="body2" color="text.secondary">
                        {method.cardholderName}
                        {method.expiryMonth && method.expiryYear && (
                          <> • Expires {method.expiryMonth}/{method.expiryYear}</>
                        )}
                      </Typography>
                    </Box>
                  </Box>
                  <ListItemSecondaryAction>
                    <IconButton edge="end" onClick={() => handleDeletePaymentMethod(method.id)}>
                      <DeleteIcon />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
                <Divider />
              </React.Fragment>
            ))}
          </List>
        )}
      </TabPanel>

      {/* Tab 3: Payment History */}
      <TabPanel value={tabValue} index={2}>
        <Typography variant="h6" gutterBottom>
          Payment History
        </Typography>
        {paymentHistory.length === 0 ? (
          <Alert severity="info">No payment history</Alert>
        ) : (
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Receipt #</TableCell>
                  <TableCell>Method</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paymentHistory.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{formatDate(payment.createdAt)}</TableCell>
                    <TableCell>{payment.receiptNumber}</TableCell>
                    <TableCell>{payment.paymentMethodType.replace('_', ' ')}</TableCell>
                    <TableCell>
                      <Chip
                        label={payment.status}
                        size="small"
                        color={payment.status === 'completed' ? 'success' : 'default'}
                      />
                    </TableCell>
                    <TableCell align="right">{formatCurrency(payment.amount)}</TableCell>
                    <TableCell>
                      {payment.receiptUrl && (
                        <Button
                          size="small"
                          startIcon={<ReceiptIcon />}
                          href={payment.receiptUrl}
                          target="_blank"
                        >
                          Receipt
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </TabPanel>

      {/* Tab 4: Auto-Pay */}
      <TabPanel value={tabValue} index={3}>
        <Typography variant="h6" gutterBottom>
          Automatic Payments
        </Typography>
        {autoPay?.enrolled ? (
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <Box>
                  <Typography variant="h6" gutterBottom>
                    Auto-Pay Enabled
                  </Typography>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Your account balance will be automatically charged on the {autoPay.chargeDay}th of each month.
                  </Typography>
                  {autoPay.paymentType && (
                    <Typography variant="body2" sx={{ mt: 2 }}>
                      Payment method: {autoPay.cardBrand?.toUpperCase()} ending in {autoPay.lastFour}
                    </Typography>
                  )}
                </Box>
                <Button variant="outlined" color="error" onClick={() => cancelPortalAutoPay(tenantId, portalToken).then(loadData)}>
                  Cancel Auto-Pay
                </Button>
              </Box>
            </CardContent>
          </Card>
        ) : (
          <Box>
            <Alert severity="info" sx={{ mb: 2 }}>
              Set up automatic payments to ensure your account is always paid on time.
            </Alert>
            <Button variant="contained" onClick={() => setShowAutoPayDialog(true)}>
              Set Up Auto-Pay
            </Button>
          </Box>
        )}
      </TabPanel>

      {/* Make Payment Dialog */}
      <Dialog open={showPaymentDialog} onClose={() => setShowPaymentDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Make a Payment</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Payment Amount"
            type="number"
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
            sx={{ mt: 2, mb: 2 }}
            InputProps={{ startAdornment: '$' }}
          />
          <Typography variant="subtitle2" gutterBottom>
            Select Payment Method
          </Typography>
          <RadioGroup value={selectedPaymentMethodId} onChange={(e) => setSelectedPaymentMethodId(e.target.value)}>
            {paymentMethods.map((method) => (
              <FormControlLabel
                key={method.id}
                value={method.id}
                control={<Radio />}
                label={`${method.cardBrand?.toUpperCase()} ending in ${method.lastFour}`}
              />
            ))}
          </RadioGroup>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowPaymentDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleMakePayment} disabled={loading}>
            {loading ? <CircularProgress size={24} /> : 'Pay Now'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Payment Method Dialog */}
      <Dialog open={showAddPaymentMethod} onClose={() => setShowAddPaymentMethod(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Payment Method</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Card Number"
            value={newPaymentMethod.cardNumber}
            onChange={(e) => setNewPaymentMethod({ ...newPaymentMethod, cardNumber: e.target.value })}
            sx={{ mt: 2 }}
          />
          <TextField
            fullWidth
            label="Cardholder Name"
            value={newPaymentMethod.cardholderName}
            onChange={(e) => setNewPaymentMethod({ ...newPaymentMethod, cardholderName: e.target.value })}
            sx={{ mt: 2 }}
          />
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={4}>
              <TextField
                fullWidth
                label="Exp Month"
                placeholder="MM"
                value={newPaymentMethod.expiryMonth}
                onChange={(e) => setNewPaymentMethod({ ...newPaymentMethod, expiryMonth: e.target.value })}
              />
            </Grid>
            <Grid item xs={4}>
              <TextField
                fullWidth
                label="Exp Year"
                placeholder="YYYY"
                value={newPaymentMethod.expiryYear}
                onChange={(e) => setNewPaymentMethod({ ...newPaymentMethod, expiryYear: e.target.value })}
              />
            </Grid>
            <Grid item xs={4}>
              <TextField
                fullWidth
                label="CVV"
                value={newPaymentMethod.cvv}
                onChange={(e) => setNewPaymentMethod({ ...newPaymentMethod, cvv: e.target.value })}
              />
            </Grid>
          </Grid>
          <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>
            Billing Address
          </Typography>
          <TextField
            fullWidth
            label="Street Address"
            value={newPaymentMethod.street}
            onChange={(e) => setNewPaymentMethod({ ...newPaymentMethod, street: e.target.value })}
            sx={{ mb: 2 }}
          />
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="City"
                value={newPaymentMethod.city}
                onChange={(e) => setNewPaymentMethod({ ...newPaymentMethod, city: e.target.value })}
              />
            </Grid>
            <Grid item xs={3}>
              <TextField
                fullWidth
                label="State"
                value={newPaymentMethod.state}
                onChange={(e) => setNewPaymentMethod({ ...newPaymentMethod, state: e.target.value })}
              />
            </Grid>
            <Grid item xs={3}>
              <TextField
                fullWidth
                label="ZIP"
                value={newPaymentMethod.zip}
                onChange={(e) => setNewPaymentMethod({ ...newPaymentMethod, zip: e.target.value })}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowAddPaymentMethod(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAddPaymentMethod} disabled={loading}>
            Add Card
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
