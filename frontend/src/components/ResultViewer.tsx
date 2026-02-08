import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Grid,
  Paper,
  Chip,
  Divider,
  Alert,
  CircularProgress
} from '@mui/material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import {
  TrendingUp as TrendUpIcon,
  TrendingDown as TrendDownIcon,
  TrendingFlat as TrendFlatIcon
} from '@mui/icons-material';
import { API_BASE_URL } from '../utils/apiBase';

interface ResultViewerProps {
  result: {
    id: string;
    patient_id?: string;
    test_code: string;
    test_name: string;
    result_value: string;
    result_value_numeric?: number;
    result_unit?: string;
    reference_range_low?: number;
    reference_range_high?: number;
    reference_range_text?: string;
    is_abnormal: boolean;
    is_critical: boolean;
    abnormal_flag?: string;
    result_status: string;
    result_date: string;
    result_notes?: string;
    interpretation?: string;
  };
}

interface TrendData {
  test_code: string;
  test_name: string;
  unit: string;
  reference_range: {
    low?: number;
    high?: number;
    text?: string;
  };
  results: Array<{
    id: string;
    result_date: string;
    result_value: string;
    result_value_numeric?: number;
    is_abnormal: boolean;
  }>;
  statistics?: {
    count: number;
    mean: string;
    min: number;
    max: number;
    latest: number;
  };
}

const ResultViewer: React.FC<ResultViewerProps> = ({ result }) => {
  const [trendData, setTrendData] = useState<TrendData | null>(null);
  const [loadingTrends, setLoadingTrends] = useState(false);

  useEffect(() => {
    if (result.patient_id && result.test_code) {
      fetchTrendData();
    }
  }, [result.patient_id, result.test_code]);

  const fetchTrendData = async () => {
    try {
      setLoadingTrends(true);
      const response = await fetch(
        `${API_BASE_URL}/api/lab-results/trends/${result.patient_id}/${result.test_code}`,
        { credentials: 'include' }
      );

      if (response.ok) {
        const data = await response.json();
        setTrendData(data);
      }
    } catch (err) {
      console.error('Error fetching trend data:', err);
    } finally {
      setLoadingTrends(false);
    }
  };

  const getStatusColor = () => {
    if (result.is_critical) return 'error';
    if (result.is_abnormal) return 'warning';
    return 'success';
  };

  const getStatusText = () => {
    if (result.is_critical) return 'CRITICAL';
    if (result.is_abnormal) {
      if (result.abnormal_flag === 'H') return 'HIGH';
      if (result.abnormal_flag === 'L') return 'LOW';
      return 'ABNORMAL';
    }
    return 'NORMAL';
  };

  const getTrendDirection = () => {
    if (!trendData || !trendData.statistics || trendData.results.length < 2) return null;

    const results = trendData.results.filter(r => r.result_value_numeric !== null);
    if (results.length < 2) return null;

    const latest = results[results.length - 1].result_value_numeric!;
    const previous = results[results.length - 2].result_value_numeric!;

    const change = ((latest - previous) / previous) * 100;

    if (Math.abs(change) < 5) {
      return { icon: <TrendFlatIcon />, text: 'Stable', color: 'default' };
    } else if (change > 0) {
      return { icon: <TrendUpIcon />, text: `+${change.toFixed(1)}%`, color: 'error' };
    } else {
      return { icon: <TrendDownIcon />, text: `${change.toFixed(1)}%`, color: 'success' };
    }
  };

  const formatChartData = () => {
    if (!trendData) return [];

    return trendData.results.map(r => ({
      date: new Date(r.result_date).toLocaleDateString(),
      value: r.result_value_numeric,
      abnormal: r.is_abnormal
    }));
  };

  const trend = getTrendDirection();

  return (
    <Box>
      {/* Current Result */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <Typography variant="h6" gutterBottom>
              {result.test_name}
            </Typography>
            <Typography variant="caption" color="textSecondary">
              Test Code: {result.test_code}
            </Typography>
          </Grid>

          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2" color="textSecondary">
              Result
            </Typography>
            <Typography variant="h4">
              {result.result_value} {result.result_unit}
            </Typography>
          </Grid>

          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2" color="textSecondary">
              Reference Range
            </Typography>
            <Typography variant="body1">
              {result.reference_range_text ||
               (result.reference_range_low && result.reference_range_high
                 ? `${result.reference_range_low} - ${result.reference_range_high} ${result.result_unit}`
                 : 'Not specified')}
            </Typography>
          </Grid>

          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2" color="textSecondary">
              Status
            </Typography>
            <Chip
              label={getStatusText()}
              color={getStatusColor()}
              sx={{ mt: 1 }}
            />
            {trend && (
              <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                {trend.icon}
                <Typography variant="body2" sx={{ ml: 1 }}>
                  {trend.text}
                </Typography>
              </Box>
            )}
          </Grid>

          <Grid item xs={12}>
            <Typography variant="subtitle2" color="textSecondary">
              Result Date
            </Typography>
            <Typography variant="body2">
              {new Date(result.result_date).toLocaleString()}
            </Typography>
          </Grid>

          {result.result_notes && (
            <Grid item xs={12}>
              <Alert severity="info">
                <Typography variant="subtitle2">Notes</Typography>
                <Typography variant="body2">{result.result_notes}</Typography>
              </Alert>
            </Grid>
          )}

          {result.interpretation && (
            <Grid item xs={12}>
              <Alert severity="warning">
                <Typography variant="subtitle2">Interpretation</Typography>
                <Typography variant="body2">{result.interpretation}</Typography>
              </Alert>
            </Grid>
          )}
        </Grid>
      </Paper>

      {/* Trend Chart */}
      {loadingTrends ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : trendData && trendData.results.length > 1 ? (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Historical Trend
          </Typography>

          {trendData.statistics && (
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={6} md={3}>
                <Typography variant="caption" color="textSecondary">
                  Latest
                </Typography>
                <Typography variant="h6">
                  {trendData.statistics.latest}
                </Typography>
              </Grid>
              <Grid item xs={6} md={3}>
                <Typography variant="caption" color="textSecondary">
                  Average
                </Typography>
                <Typography variant="h6">
                  {trendData.statistics.mean}
                </Typography>
              </Grid>
              <Grid item xs={6} md={3}>
                <Typography variant="caption" color="textSecondary">
                  Min
                </Typography>
                <Typography variant="h6">
                  {trendData.statistics.min}
                </Typography>
              </Grid>
              <Grid item xs={6} md={3}>
                <Typography variant="caption" color="textSecondary">
                  Max
                </Typography>
                <Typography variant="h6">
                  {trendData.statistics.max}
                </Typography>
              </Grid>
            </Grid>
          )}

          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={formatChartData()}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />

              {trendData.reference_range.low && (
                <ReferenceLine
                  y={trendData.reference_range.low}
                  stroke="green"
                  strokeDasharray="3 3"
                  label="Low"
                />
              )}

              {trendData.reference_range.high && (
                <ReferenceLine
                  y={trendData.reference_range.high}
                  stroke="green"
                  strokeDasharray="3 3"
                  label="High"
                />
              )}

              <Line
                type="monotone"
                dataKey="value"
                stroke="#8884d8"
                strokeWidth={2}
                dot={{ fill: '#8884d8', r: 5 }}
                activeDot={{ r: 8 }}
              />
            </LineChart>
          </ResponsiveContainer>

          <Typography variant="caption" color="textSecondary" sx={{ mt: 2, display: 'block' }}>
            Showing {trendData.results.length} results over the last 12 months
          </Typography>
        </Paper>
      ) : (
        <Alert severity="info">
          No historical data available for trend analysis
        </Alert>
      )}
    </Box>
  );
};

export default ResultViewer;
