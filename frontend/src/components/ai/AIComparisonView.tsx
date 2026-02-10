import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Button,
  Alert,
  Chip,
  Paper,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  CircularProgress,
  Divider,
} from '@mui/material';
import {
  CompareArrows as CompareIcon,
  TrendingUp as ProgressedIcon,
  TrendingDown as ImprovedIcon,
  TrendingFlat as StableIcon,
  Warning as WarningIcon,
  CheckCircle as CheckIcon,
  Lightbulb as RecommendationIcon,
} from '@mui/icons-material';
import toast from 'react-hot-toast';
import { API_BASE_URL, TENANT_HEADER_NAME } from '../../api';
import RiskBadge from './RiskBadge';

interface AIComparisonViewProps {
  currentImageId: string;
  priorImageId: string;
  currentImageUrl?: string;
  priorImageUrl?: string;
  onComparisonComplete?: (result: ComparisonResult) => void;
}

interface ComparisonResult {
  id: string;
  currentImageId: string;
  priorImageId: string;
  daysBetween: number;
  overallChangeScore: number;
  changeClassification: 'stable' | 'improved' | 'progressed' | 'significantly_changed';
  changesDetected: {
    size_change: { detected: boolean; direction: string | null; magnitude: string | null };
    color_change: { detected: boolean; description: string | null };
    border_change: { detected: boolean; description: string | null };
    symmetry_change: { detected: boolean; description: string | null };
    new_features: string[];
    resolved_features: string[];
  };
  riskLevel: 'low' | 'moderate' | 'high';
  comparisonSummary: string;
  recommendations: string[];
}

const AIComparisonView: React.FC<AIComparisonViewProps> = ({
  currentImageId,
  priorImageId,
  currentImageUrl,
  priorImageUrl,
  onComparisonComplete,
}) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runComparison = async () => {
    setLoading(true);
    setError(null);

    try {
      const tenantId = localStorage.getItem('tenantId') || '';
      const token = localStorage.getItem('accessToken') || '';

      const response = await fetch(`${API_BASE_URL}/api/ai-lesion-analysis/compare`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          [TENANT_HEADER_NAME]: tenantId,
        },
        body: JSON.stringify({ currentImageId, priorImageId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Comparison failed');
      }

      const data = await response.json();
      setResult(data.comparison);
      toast.success('Comparison complete');

      if (onComparisonComplete && data.comparison) {
        onComparisonComplete(data.comparison);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to compare images';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const getChangeIcon = () => {
    if (!result) return <CompareIcon />;
    switch (result.changeClassification) {
      case 'improved':
        return <ImprovedIcon color="success" />;
      case 'progressed':
        return <ProgressedIcon color="error" />;
      case 'significantly_changed':
        return <WarningIcon color="error" />;
      case 'stable':
      default:
        return <StableIcon color="success" />;
    }
  };

  const getChangeColor = (): 'success' | 'warning' | 'error' | 'info' => {
    if (!result) return 'info';
    switch (result.changeClassification) {
      case 'improved':
        return 'success';
      case 'progressed':
        return 'warning';
      case 'significantly_changed':
        return 'error';
      case 'stable':
      default:
        return 'success';
    }
  };

  const formatChangeClassification = (classification: string): string => {
    return classification
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  if (!result) {
    return (
      <Card>
        <CardContent>
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <CompareIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              AI-Powered Change Detection
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Compare two images of the same lesion to detect changes over time.
            </Typography>

            <Alert severity="warning" sx={{ mb: 2, textAlign: 'left' }}>
              <strong>Important:</strong> AI change detection is for clinical decision support only.
              Professional evaluation is required for all findings.
            </Alert>

            {/* Image Preview */}
            {(currentImageUrl || priorImageUrl) && (
              <Grid container spacing={2} sx={{ mb: 2 }}>
                {priorImageUrl && (
                  <Grid item xs={6}>
                    <Paper variant="outlined" sx={{ p: 1 }}>
                      <Typography variant="caption" display="block" gutterBottom>
                        Prior Image
                      </Typography>
                      <Box
                        component="img"
                        src={priorImageUrl}
                        alt="Prior"
                        sx={{ width: '100%', maxHeight: 150, objectFit: 'contain' }}
                      />
                    </Paper>
                  </Grid>
                )}
                {currentImageUrl && (
                  <Grid item xs={6}>
                    <Paper variant="outlined" sx={{ p: 1 }}>
                      <Typography variant="caption" display="block" gutterBottom>
                        Current Image
                      </Typography>
                      <Box
                        component="img"
                        src={currentImageUrl}
                        alt="Current"
                        sx={{ width: '100%', maxHeight: 150, objectFit: 'contain' }}
                      />
                    </Paper>
                  </Grid>
                )}
              </Grid>
            )}

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <Button
              variant="contained"
              color="primary"
              onClick={runComparison}
              disabled={loading}
              startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <CompareIcon />}
            >
              {loading ? 'Comparing...' : 'Run Comparison'}
            </Button>
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          {getChangeIcon()}
          <Typography variant="h6">AI Change Detection Results</Typography>
          <Box sx={{ flexGrow: 1 }} />
          <RiskBadge riskLevel={result.riskLevel} />
        </Box>

        {/* Disclaimer */}
        <Alert severity="info" sx={{ mb: 2 }}>
          AI-powered change detection is for clinical decision support only. Professional
          evaluation required.
        </Alert>

        {/* Summary */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} md={4}>
            <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                Time Between Images
              </Typography>
              <Typography variant="h4">{result.daysBetween}</Typography>
              <Typography variant="caption">days</Typography>
            </Paper>
          </Grid>

          <Grid item xs={12} md={4}>
            <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                Change Classification
              </Typography>
              <Chip
                icon={getChangeIcon()}
                label={formatChangeClassification(result.changeClassification)}
                color={getChangeColor()}
                sx={{ mt: 1 }}
              />
            </Paper>
          </Grid>

          <Grid item xs={12} md={4}>
            <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                Overall Change Score
              </Typography>
              <Typography
                variant="h4"
                color={result.overallChangeScore > 0.5 ? 'error.main' : 'success.main'}
              >
                {(result.overallChangeScore * 100).toFixed(0)}%
              </Typography>
            </Paper>
          </Grid>
        </Grid>

        {/* Comparison Summary */}
        <Paper variant="outlined" sx={{ p: 2, mb: 3, bgcolor: 'action.hover' }}>
          <Typography variant="subtitle2" color="primary" gutterBottom>
            Summary
          </Typography>
          <Typography variant="body2">{result.comparisonSummary}</Typography>
        </Paper>

        {/* Changes Detected */}
        <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
          Changes Detected
        </Typography>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                {result.changesDetected.size_change.detected ? (
                  <WarningIcon color="warning" fontSize="small" />
                ) : (
                  <CheckIcon color="success" fontSize="small" />
                )}
                <Typography variant="body2" fontWeight="bold">
                  Size
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary">
                {result.changesDetected.size_change.detected
                  ? `${result.changesDetected.size_change.direction || 'Changed'} - ${result.changesDetected.size_change.magnitude || 'Detected'}`
                  : 'No change'}
              </Typography>
            </Paper>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                {result.changesDetected.color_change.detected ? (
                  <WarningIcon color="warning" fontSize="small" />
                ) : (
                  <CheckIcon color="success" fontSize="small" />
                )}
                <Typography variant="body2" fontWeight="bold">
                  Color
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary">
                {result.changesDetected.color_change.description || 'No change'}
              </Typography>
            </Paper>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                {result.changesDetected.border_change.detected ? (
                  <WarningIcon color="warning" fontSize="small" />
                ) : (
                  <CheckIcon color="success" fontSize="small" />
                )}
                <Typography variant="body2" fontWeight="bold">
                  Border
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary">
                {result.changesDetected.border_change.description || 'No change'}
              </Typography>
            </Paper>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                {result.changesDetected.symmetry_change.detected ? (
                  <WarningIcon color="warning" fontSize="small" />
                ) : (
                  <CheckIcon color="success" fontSize="small" />
                )}
                <Typography variant="body2" fontWeight="bold">
                  Symmetry
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary">
                {result.changesDetected.symmetry_change.description || 'No change'}
              </Typography>
            </Paper>
          </Grid>
        </Grid>

        {/* New/Resolved Features */}
        {(result.changesDetected.new_features.length > 0 ||
          result.changesDetected.resolved_features.length > 0) && (
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {result.changesDetected.new_features.length > 0 && (
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="error" fontWeight="bold" gutterBottom>
                  New Features Detected
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {result.changesDetected.new_features.map((feature, index) => (
                    <Chip
                      key={index}
                      label={feature}
                      size="small"
                      color="error"
                      variant="outlined"
                    />
                  ))}
                </Box>
              </Grid>
            )}

            {result.changesDetected.resolved_features.length > 0 && (
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="success.main" fontWeight="bold" gutterBottom>
                  Resolved Features
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {result.changesDetected.resolved_features.map((feature, index) => (
                    <Chip
                      key={index}
                      label={feature}
                      size="small"
                      color="success"
                      variant="outlined"
                    />
                  ))}
                </Box>
              </Grid>
            )}
          </Grid>
        )}

        <Divider sx={{ my: 2 }} />

        {/* Recommendations */}
        <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
          Recommendations
        </Typography>
        <List dense>
          {result.recommendations.map((rec, index) => (
            <ListItem key={index}>
              <ListItemIcon>
                <RecommendationIcon color="primary" fontSize="small" />
              </ListItemIcon>
              <ListItemText primary={rec} />
            </ListItem>
          ))}
        </List>

        {/* Run another comparison */}
        <Box sx={{ mt: 2, textAlign: 'center' }}>
          <Button
            variant="outlined"
            onClick={() => setResult(null)}
            startIcon={<CompareIcon />}
          >
            Run New Comparison
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
};

export default AIComparisonView;
