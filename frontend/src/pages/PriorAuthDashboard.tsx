import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Grid,
  Card,
  CardContent,
  Alert,
  Tabs,
  Tab,
  CircularProgress,
} from '@mui/material';
import {
  Add as AddIcon,
  Warning as WarningIcon,
  CheckCircle as ApprovedIcon,
  Cancel as DeniedIcon,
  Schedule as PendingIcon,
  Event as ExpiringIcon,
} from '@mui/icons-material';
import toast from 'react-hot-toast';
import { api } from '../api';
import PriorAuthList from '../components/PriorAuth/PriorAuthList';
import PriorAuthForm from '../components/PriorAuth/PriorAuthForm';
import PriorAuthDetail from '../components/PriorAuth/PriorAuthDetail';
import ExpirationAlerts from '../components/PriorAuth/ExpirationAlerts';

interface DashboardStats {
  total: number;
  pending: number;
  approved: number;
  denied: number;
  expiring_soon: number;
  expiring_urgent: number;
  avg_days_pending: number;
  success_rate: number;
  total_resubmissions: number;
}

const PriorAuthDashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTab, setCurrentTab] = useState(0);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedPAId, setSelectedPAId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  useEffect(() => {
    loadDashboardStats();
  }, []);

  const loadDashboardStats = async () => {
    try {
      const response = await api.get('/api/prior-auth/dashboard');
      setStats(response.data);
    } catch (error) {
      console.error('Error loading dashboard stats:', error);
      toast.error('Failed to load dashboard statistics');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePA = () => {
    setSelectedPAId(null);
    setShowCreateDialog(true);
  };

  const handlePACreated = () => {
    setShowCreateDialog(false);
    loadDashboardStats();
    toast.success('Prior authorization created successfully');
  };

  const handlePAClick = (paId: string) => {
    setSelectedPAId(paId);
  };

  const handleCloseDetail = () => {
    setSelectedPAId(null);
    loadDashboardStats();
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Prior Authorization Tracking
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Save 3.5 hours/day with streamlined PA management
          </Typography>
        </Box>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={handleCreatePA}
          size="large"
        >
          New PA Request
        </Button>
      </Box>

      {/* Urgent Expiration Alert */}
      {stats && stats.expiring_urgent > 0 && (
        <Alert
          severity="error"
          icon={<WarningIcon />}
          sx={{ mb: 3 }}
          action={
            <Button color="inherit" size="small" onClick={() => setCurrentTab(2)}>
              View
            </Button>
          }
        >
          <strong>URGENT:</strong> {stats.expiring_urgent} biologics expiring within 7 days!
          Renewal required immediately.
        </Alert>
      )}

      {/* Summary Cards */}
      <Grid container spacing={3} mb={4}>
        <Grid item xs={12} sm={6} md={3}>
          <Card
            sx={{
              cursor: 'pointer',
              transition: 'transform 0.2s',
              '&:hover': { transform: 'translateY(-4px)' },
            }}
            onClick={() => {
              setFilterStatus('pending');
              setCurrentTab(0);
            }}
          >
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography color="text.secondary" gutterBottom variant="body2">
                    PENDING
                  </Typography>
                  <Typography variant="h3" color="primary">
                    {stats?.pending || 0}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Avg {stats?.avg_days_pending || 0} days
                  </Typography>
                </Box>
                <PendingIcon sx={{ fontSize: 48, color: 'primary.main', opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card
            sx={{
              cursor: 'pointer',
              transition: 'transform 0.2s',
              '&:hover': { transform: 'translateY(-4px)' },
            }}
            onClick={() => {
              setFilterStatus('approved');
              setCurrentTab(0);
            }}
          >
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography color="text.secondary" gutterBottom variant="body2">
                    APPROVED
                  </Typography>
                  <Typography variant="h3" color="success.main">
                    {stats?.approved || 0}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {stats?.success_rate || 0}% success rate
                  </Typography>
                </Box>
                <ApprovedIcon sx={{ fontSize: 48, color: 'success.main', opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card
            sx={{
              cursor: 'pointer',
              transition: 'transform 0.2s',
              '&:hover': { transform: 'translateY(-4px)' },
            }}
            onClick={() => {
              setFilterStatus('denied');
              setCurrentTab(0);
            }}
          >
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography color="text.secondary" gutterBottom variant="body2">
                    DENIED
                  </Typography>
                  <Typography variant="h3" color="error.main">
                    {stats?.denied || 0}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Needs appeal
                  </Typography>
                </Box>
                <DeniedIcon sx={{ fontSize: 48, color: 'error.main', opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card
            sx={{
              cursor: 'pointer',
              transition: 'transform 0.2s',
              '&:hover': { transform: 'translateY(-4px)' },
              bgcolor: stats && stats.expiring_urgent > 0 ? 'error.light' : 'background.paper',
            }}
            onClick={() => setCurrentTab(2)}
          >
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography color="text.secondary" gutterBottom variant="body2">
                    EXPIRING SOON
                  </Typography>
                  <Typography
                    variant="h3"
                    color={stats && stats.expiring_urgent > 0 ? 'error.dark' : 'warning.main'}
                  >
                    {stats?.expiring_soon || 0}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Within 30 days
                  </Typography>
                </Box>
                <ExpiringIcon
                  sx={{
                    fontSize: 48,
                    color: stats && stats.expiring_urgent > 0 ? 'error.dark' : 'warning.main',
                    opacity: 0.3,
                  }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Main Content Tabs */}
      <Paper sx={{ width: '100%' }}>
        <Tabs
          value={currentTab}
          onChange={(_, newValue) => {
            setCurrentTab(newValue);
            setFilterStatus('all');
          }}
          indicatorColor="primary"
          textColor="primary"
        >
          <Tab label="All Prior Authorizations" />
          <Tab label="Pending Action" />
          <Tab label="Expiring Soon" />
        </Tabs>

        <Box sx={{ p: 3 }}>
          {currentTab === 0 && (
            <PriorAuthList
              filterStatus={filterStatus}
              onPAClick={handlePAClick}
              onRefresh={loadDashboardStats}
            />
          )}

          {currentTab === 1 && (
            <PriorAuthList
              filterStatus="pending"
              onPAClick={handlePAClick}
              onRefresh={loadDashboardStats}
            />
          )}

          {currentTab === 2 && (
            <ExpirationAlerts
              onPAClick={handlePAClick}
              onRefresh={loadDashboardStats}
            />
          )}
        </Box>
      </Paper>

      {/* Create PA Dialog */}
      {showCreateDialog && (
        <PriorAuthForm
          open={showCreateDialog}
          onClose={() => setShowCreateDialog(false)}
          onSuccess={handlePACreated}
        />
      )}

      {/* PA Detail Dialog */}
      {selectedPAId && (
        <PriorAuthDetail
          priorAuthId={selectedPAId}
          open={!!selectedPAId}
          onClose={handleCloseDetail}
          onUpdate={loadDashboardStats}
        />
      )}
    </Box>
  );
};

export default PriorAuthDashboard;
