/**
 * Lab Order Form Component
 * Create new lab orders with test selection and clinical information
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
  TextField,
  MenuItem,
  Grid,
  Typography,
  Alert,
  Autocomplete,
  FormControlLabel,
  Checkbox,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Chip,
  Divider,
  CircularProgress
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Add as AddIcon,
  Science as ScienceIcon
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE_URL } from '../../utils/apiBase';

interface LabOrderFormProps {
  patientId: string;
  encounterId?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

interface Provider {
  id: string;
  first_name: string;
  last_name: string;
  npi?: string;
}

interface LabInterface {
  id: string;
  lab_name: string;
  interface_type: string;
  supported_test_types: string[];
}

interface LabTest {
  id: string;
  test_code: string;
  test_name: string;
  test_category: string;
  specimen_type?: string;
  is_common: boolean;
  cpt_code?: string;
  fasting_required?: boolean;
}

interface SelectedTest {
  testCode: string;
  testName: string;
  specimenType?: string;
}

const PRIORITY_OPTIONS = [
  { value: 'routine', label: 'Routine' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'stat', label: 'STAT' }
];

const TEST_CATEGORIES = [
  { value: 'all', label: 'All Tests' },
  { value: 'pathology', label: 'Pathology/Biopsy' },
  { value: 'microbiology', label: 'Microbiology (Fungal/Bacterial)' },
  { value: 'autoimmune', label: 'Autoimmune Workup' },
  { value: 'hematology', label: 'Hematology' },
  { value: 'chemistry', label: 'Chemistry Panel' },
  { value: 'allergy', label: 'Allergy Testing' },
  { value: 'infectious', label: 'Infectious Disease' }
];

export const LabOrderForm: React.FC<LabOrderFormProps> = ({
  patientId,
  encounterId,
  onSuccess,
  onCancel
}) => {
  const { session } = useAuth();

  const [formData, setFormData] = useState({
    orderingProviderId: '',
    labId: '',
    priority: 'routine',
    clinicalIndication: '',
    clinicalNotes: '',
    isFasting: false,
    icd10Codes: [] as string[]
  });

  const [providers, setProviders] = useState<Provider[]>([]);
  const [labInterfaces, setLabInterfaces] = useState<LabInterface[]>([]);
  const [availableTests, setAvailableTests] = useState<LabTest[]>([]);
  const [filteredTests, setFilteredTests] = useState<LabTest[]>([]);
  const [selectedTests, setSelectedTests] = useState<SelectedTest[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProviders = useCallback(async () => {
    if (!session) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/providers`, {
        headers: {
          'Authorization': `Bearer ${session.accessToken}`,
          'x-tenant-id': session.tenantId
        }
      });
      if (response.ok) {
        const data = await response.json();
        setProviders(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching providers:', err);
    }
  }, [session]);

  const fetchLabInterfaces = useCallback(async () => {
    if (!session) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/labs/interfaces`, {
        headers: {
          'Authorization': `Bearer ${session.accessToken}`,
          'x-tenant-id': session.tenantId
        }
      });
      if (response.ok) {
        const data = await response.json();
        setLabInterfaces(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching lab interfaces:', err);
    }
  }, [session]);

  const fetchLabCatalog = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/labs/catalog`, {
        headers: {
          'Authorization': `Bearer ${session.accessToken}`,
          'x-tenant-id': session.tenantId
        }
      });
      if (response.ok) {
        const data = await response.json();
        setAvailableTests(Array.isArray(data) ? data : []);
        setFilteredTests(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching lab catalog:', err);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    fetchProviders();
    fetchLabInterfaces();
    fetchLabCatalog();
  }, [fetchProviders, fetchLabInterfaces, fetchLabCatalog]);

  useEffect(() => {
    let filtered = availableTests;

    if (selectedCategory !== 'all') {
      filtered = filtered.filter(test => test.test_category === selectedCategory);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(test =>
        test.test_name.toLowerCase().includes(term) ||
        test.test_code.toLowerCase().includes(term)
      );
    }

    setFilteredTests(filtered);
  }, [availableTests, selectedCategory, searchTerm]);

  const handleAddTest = (test: LabTest) => {
    if (!selectedTests.find(t => t.testCode === test.test_code)) {
      setSelectedTests([...selectedTests, {
        testCode: test.test_code,
        testName: test.test_name,
        specimenType: test.specimen_type
      }]);

      // Auto-set fasting if test requires it
      if (test.fasting_required) {
        setFormData(prev => ({ ...prev, isFasting: true }));
      }
    }
  };

  const handleRemoveTest = (testCode: string) => {
    setSelectedTests(selectedTests.filter(t => t.testCode !== testCode));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.orderingProviderId) {
      setError('Please select an ordering provider');
      return;
    }

    if (selectedTests.length === 0) {
      setError('Please select at least one test');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/labs/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.accessToken}`,
          'x-tenant-id': session?.tenantId || ''
        },
        body: JSON.stringify({
          patientId,
          encounterId,
          orderingProviderId: formData.orderingProviderId,
          labId: formData.labId || undefined,
          tests: selectedTests,
          priority: formData.priority,
          clinicalIndication: formData.clinicalIndication,
          clinicalNotes: formData.clinicalNotes,
          isFasting: formData.isFasting,
          icd10Codes: formData.icd10Codes.length > 0 ? formData.icd10Codes : undefined
        })
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

  // Common dermatology test panels for quick selection
  const quickPanels = [
    {
      name: 'Autoimmune Workup',
      tests: ['ANA', 'RF', 'ANTI-dsDNA', 'SSA-SSB']
    },
    {
      name: 'Pre-Systemic Therapy',
      tests: ['CBC', 'CMP', 'LFT', 'TB-QUANT', 'HEP-PANEL']
    },
    {
      name: 'Fungal Studies',
      tests: ['FUNGAL-KOH', 'FUNGAL-CULTURE']
    }
  ];

  const handleQuickPanel = (panelTestCodes: string[]) => {
    const testsToAdd = availableTests.filter(
      test => panelTestCodes.includes(test.test_code) &&
        !selectedTests.find(st => st.testCode === test.test_code)
    );

    const newSelectedTests = testsToAdd.map(test => ({
      testCode: test.test_code,
      testName: test.test_name,
      specimenType: test.specimen_type
    }));

    setSelectedTests([...selectedTests, ...newSelectedTests]);
  };

  return (
    <Box component="form" onSubmit={handleSubmit}>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Provider Selection */}
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            required
            select
            label="Ordering Provider"
            value={formData.orderingProviderId}
            onChange={(e) => setFormData({ ...formData, orderingProviderId: e.target.value })}
          >
            {providers.map((provider) => (
              <MenuItem key={provider.id} value={provider.id}>
                Dr. {provider.first_name} {provider.last_name}
              </MenuItem>
            ))}
          </TextField>
        </Grid>

        {/* Lab Selection */}
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            select
            label="Send to Lab"
            value={formData.labId}
            onChange={(e) => setFormData({ ...formData, labId: e.target.value })}
            helperText="Optional - select for electronic ordering"
          >
            <MenuItem value="">Select later</MenuItem>
            {labInterfaces.map((lab) => (
              <MenuItem key={lab.id} value={lab.id}>
                {lab.lab_name} ({lab.interface_type})
              </MenuItem>
            ))}
          </TextField>
        </Grid>

        {/* Priority */}
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            select
            label="Priority"
            value={formData.priority}
            onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
          >
            {PRIORITY_OPTIONS.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
        </Grid>

        {/* Fasting */}
        <Grid item xs={12} md={6}>
          <FormControlLabel
            control={
              <Checkbox
                checked={formData.isFasting}
                onChange={(e) => setFormData({ ...formData, isFasting: e.target.checked })}
              />
            }
            label="Fasting Required"
          />
        </Grid>

        <Grid item xs={12}>
          <Divider sx={{ my: 1 }} />
        </Grid>

        {/* Quick Panels */}
        <Grid item xs={12}>
          <Typography variant="subtitle2" gutterBottom>
            Quick Panels
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {quickPanels.map((panel) => (
              <Chip
                key={panel.name}
                label={panel.name}
                icon={<ScienceIcon />}
                onClick={() => handleQuickPanel(panel.tests)}
                variant="outlined"
                clickable
              />
            ))}
          </Box>
        </Grid>

        {/* Test Selection */}
        <Grid item xs={12}>
          <Typography variant="subtitle2" gutterBottom>
            Select Tests
          </Typography>

          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                select
                size="small"
                label="Category"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                {TEST_CATEGORIES.map((cat) => (
                  <MenuItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={8}>
              <Autocomplete
                options={filteredTests}
                getOptionLabel={(option) => `${option.test_name} (${option.test_code})`}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Search Tests"
                    size="small"
                    placeholder="Type to search..."
                    InputProps={{
                      ...params.InputProps,
                      endAdornment: (
                        <>
                          {loading && <CircularProgress size={20} />}
                          {params.InputProps.endAdornment}
                        </>
                      )
                    }}
                  />
                )}
                onChange={(_, value) => {
                  if (value) {
                    handleAddTest(value);
                  }
                }}
                renderOption={(props, option) => (
                  <li {...props}>
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                      <Typography variant="body2">
                        {option.test_name}
                        {option.is_common && (
                          <Chip size="small" label="Common" sx={{ ml: 1 }} />
                        )}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {option.test_code} | {option.test_category} | {option.specimen_type}
                      </Typography>
                    </Box>
                  </li>
                )}
              />
            </Grid>
          </Grid>
        </Grid>

        {/* Selected Tests */}
        {selectedTests.length > 0 && (
          <Grid item xs={12}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle2" gutterBottom>
                  Selected Tests ({selectedTests.length})
                </Typography>
                <List dense>
                  {selectedTests.map((test) => (
                    <ListItem
                      key={test.testCode}
                      secondaryAction={
                        <IconButton
                          edge="end"
                          onClick={() => handleRemoveTest(test.testCode)}
                          size="small"
                        >
                          <DeleteIcon />
                        </IconButton>
                      }
                    >
                      <ListItemText
                        primary={test.testName}
                        secondary={`${test.testCode}${test.specimenType ? ` | ${test.specimenType}` : ''}`}
                      />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Grid>
        )}

        <Grid item xs={12}>
          <Divider sx={{ my: 1 }} />
        </Grid>

        {/* Clinical Information */}
        <Grid item xs={12}>
          <TextField
            fullWidth
            label="Clinical Indication"
            multiline
            rows={2}
            value={formData.clinicalIndication}
            onChange={(e) => setFormData({ ...formData, clinicalIndication: e.target.value })}
            placeholder="Reason for testing (e.g., suspected lupus, monitoring methotrexate therapy)"
          />
        </Grid>

        <Grid item xs={12}>
          <TextField
            fullWidth
            label="Additional Notes"
            multiline
            rows={2}
            value={formData.clinicalNotes}
            onChange={(e) => setFormData({ ...formData, clinicalNotes: e.target.value })}
            placeholder="Special instructions for the lab..."
          />
        </Grid>
      </Grid>

      {/* Actions */}
      <Box sx={{ mt: 3, display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
        <Button onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="contained"
          disabled={submitting || selectedTests.length === 0}
          startIcon={submitting ? <CircularProgress size={20} /> : <AddIcon />}
        >
          {submitting ? 'Creating...' : 'Create Lab Order'}
        </Button>
      </Box>
    </Box>
  );
};

export default LabOrderForm;
