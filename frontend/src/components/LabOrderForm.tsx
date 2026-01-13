import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  TextField,
  MenuItem,
  Grid,
  FormControl,
  InputLabel,
  Select,
  Chip,
  OutlinedInput,
  SelectChangeEvent,
  Typography,
  Divider,
  Alert,
  Autocomplete,
  FormControlLabel,
  Checkbox,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  IconButton
} from '@mui/material';
import { Delete as DeleteIcon } from '@mui/icons-material';

interface LabOrderFormProps {
  patientId: string | null;
  encounterId?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  mrn: string;
}

interface Provider {
  id: string;
  first_name: string;
  last_name: string;
  npi: string;
}

interface LabVendor {
  id: string;
  name: string;
  vendor_type: string;
}

interface LabTest {
  id: string;
  test_code: string;
  test_name: string;
  short_name: string;
  category: string;
  specimen_type: string;
}

interface OrderSet {
  id: string;
  name: string;
  description: string;
  category: string;
  tests: LabTest[];
}

const LabOrderForm: React.FC<LabOrderFormProps> = ({
  patientId,
  encounterId,
  onSuccess,
  onCancel
}) => {
  const [formData, setFormData] = useState({
    patient_id: patientId || '',
    encounter_id: encounterId || '',
    ordering_provider_id: '',
    vendor_id: '',
    order_set_id: '',
    tests: [] as string[],
    icd10_codes: [] as string[],
    clinical_indication: '',
    clinical_notes: '',
    priority: 'routine',
    is_fasting: false
  });

  const [patients, setPatients] = useState<Patient[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [vendors, setVendors] = useState<LabVendor[]>([]);
  const [orderSets, setOrderSets] = useState<OrderSet[]>([]);
  const [availableTests, setAvailableTests] = useState<LabTest[]>([]);
  const [selectedTests, setSelectedTests] = useState<LabTest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchPatients();
    fetchProviders();
    fetchVendors();
    fetchOrderSets();
  }, []);

  useEffect(() => {
    if (formData.vendor_id) {
      fetchTestCatalog(formData.vendor_id);
    }
  }, [formData.vendor_id]);

  useEffect(() => {
    if (formData.order_set_id && Array.isArray(orderSets)) {
      const selectedSet = orderSets.find(set => set.id === formData.order_set_id);
      if (selectedSet && Array.isArray(selectedSet.tests)) {
        setSelectedTests(selectedSet.tests);
        setFormData(prev => ({
          ...prev,
          tests: selectedSet.tests.map(t => t.id)
        }));
      }
    }
  }, [formData.order_set_id, orderSets]);

  const fetchPatients = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'}/api/patients?limit=100`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        const patientData = data.patients || data;
        setPatients(Array.isArray(patientData) ? patientData : []);
      }
    } catch (err) {
      console.error('Error fetching patients:', err);
    }
  };

  const fetchProviders = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'}/api/providers`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setProviders(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching providers:', err);
    }
  };

  const fetchVendors = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'}/api/lab-vendors`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setVendors(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching vendors:', err);
    }
  };

  const fetchOrderSets = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'}/api/lab-vendors/order-sets`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setOrderSets(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching order sets:', err);
    }
  };

  const fetchTestCatalog = async (vendorId: string) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'}/api/lab-vendors/catalog?vendor_id=${vendorId}`,
        { credentials: 'include' }
      );
      if (response.ok) {
        const data = await response.json();
        setAvailableTests(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching test catalog:', err);
    }
  };

  const handleAddTest = (test: LabTest) => {
    if (Array.isArray(selectedTests) && !selectedTests.find(t => t.id === test.id)) {
      setSelectedTests([...selectedTests, test]);
      setFormData(prev => ({
        ...prev,
        tests: Array.isArray(prev.tests) ? [...prev.tests, test.id] : [test.id]
      }));
    }
  };

  const handleRemoveTest = (testId: string) => {
    if (Array.isArray(selectedTests)) {
      setSelectedTests(selectedTests.filter(t => t.id !== testId));
    }
    setFormData(prev => ({
      ...prev,
      tests: Array.isArray(prev.tests) ? prev.tests.filter(id => id !== testId) : []
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.patient_id || !formData.ordering_provider_id || !formData.vendor_id) {
      setError('Please fill in all required fields');
      return;
    }

    if (!Array.isArray(formData.tests) || formData.tests.length === 0) {
      setError('Please select at least one test');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'}/api/lab-orders`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create lab order');
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Patient Selection */}
        <Grid item xs={12}>
          <TextField
            fullWidth
            required
            select
            label="Patient"
            value={formData.patient_id}
            onChange={(e) => setFormData({ ...formData, patient_id: e.target.value })}
            disabled={!!patientId}
          >
            {patients.map((patient) => (
              <MenuItem key={patient.id} value={patient.id}>
                {patient.first_name} {patient.last_name} (MRN: {patient.mrn})
              </MenuItem>
            ))}
          </TextField>
        </Grid>

        {/* Provider Selection */}
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            required
            select
            label="Ordering Provider"
            value={formData.ordering_provider_id}
            onChange={(e) => setFormData({ ...formData, ordering_provider_id: e.target.value })}
          >
            {providers.map((provider) => (
              <MenuItem key={provider.id} value={provider.id}>
                Dr. {provider.first_name} {provider.last_name}
              </MenuItem>
            ))}
          </TextField>
        </Grid>

        {/* Lab Vendor */}
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            required
            select
            label="Lab Vendor"
            value={formData.vendor_id}
            onChange={(e) => setFormData({ ...formData, vendor_id: e.target.value })}
          >
            {vendors.map((vendor) => (
              <MenuItem key={vendor.id} value={vendor.id}>
                {vendor.name} ({vendor.vendor_type})
              </MenuItem>
            ))}
          </TextField>
        </Grid>

        {/* Order Set Selection */}
        <Grid item xs={12}>
          <TextField
            fullWidth
            select
            label="Order Set (Optional)"
            value={formData.order_set_id}
            onChange={(e) => setFormData({ ...formData, order_set_id: e.target.value })}
          >
            <MenuItem value="">Custom Test Selection</MenuItem>
            {orderSets.map((set) => (
              <MenuItem key={set.id} value={set.id}>
                {set.name} - {set.description}
              </MenuItem>
            ))}
          </TextField>
        </Grid>

        {/* Test Selection */}
        {!formData.order_set_id && formData.vendor_id && (
          <Grid item xs={12}>
            <Autocomplete
              options={availableTests}
              getOptionLabel={(option) => `${option.test_name} (${option.test_code})`}
              renderInput={(params) => (
                <TextField {...params} label="Add Tests" placeholder="Search tests..." />
              )}
              onChange={(_, value) => {
                if (value) {
                  handleAddTest(value);
                }
              }}
            />
          </Grid>
        )}

        {/* Selected Tests */}
        {selectedTests.length > 0 && (
          <Grid item xs={12}>
            <Typography variant="subtitle2" gutterBottom>
              Selected Tests ({selectedTests.length})
            </Typography>
            <Card variant="outlined">
              <CardContent>
                <List dense>
                  {selectedTests.map((test) => (
                    <ListItem
                      key={test.id}
                      secondaryAction={
                        !formData.order_set_id && (
                          <IconButton
                            edge="end"
                            onClick={() => handleRemoveTest(test.id)}
                            size="small"
                          >
                            <DeleteIcon />
                          </IconButton>
                        )
                      }
                    >
                      <ListItemText
                        primary={test.test_name}
                        secondary={`${test.test_code} | ${test.category} | ${test.specimen_type}`}
                      />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Priority */}
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            select
            label="Priority"
            value={formData.priority}
            onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
          >
            <MenuItem value="routine">Routine</MenuItem>
            <MenuItem value="urgent">Urgent</MenuItem>
            <MenuItem value="stat">STAT</MenuItem>
          </TextField>
        </Grid>

        {/* Fasting */}
        <Grid item xs={12} md={6}>
          <FormControlLabel
            control={
              <Checkbox
                checked={formData.is_fasting}
                onChange={(e) => setFormData({ ...formData, is_fasting: e.target.checked })}
              />
            }
            label="Fasting Required"
          />
        </Grid>

        {/* Clinical Indication */}
        <Grid item xs={12}>
          <TextField
            fullWidth
            label="Clinical Indication"
            multiline
            rows={2}
            value={formData.clinical_indication}
            onChange={(e) => setFormData({ ...formData, clinical_indication: e.target.value })}
            placeholder="Reason for testing..."
          />
        </Grid>

        {/* Clinical Notes */}
        <Grid item xs={12}>
          <TextField
            fullWidth
            label="Clinical Notes"
            multiline
            rows={2}
            value={formData.clinical_notes}
            onChange={(e) => setFormData({ ...formData, clinical_notes: e.target.value })}
            placeholder="Additional notes for the laboratory..."
          />
        </Grid>
      </Grid>

      <Box sx={{ mt: 3, display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
        <Button onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" variant="contained" disabled={submitting}>
          {submitting ? 'Creating...' : 'Create Lab Order'}
        </Button>
      </Box>
    </Box>
  );
};

export default LabOrderForm;
