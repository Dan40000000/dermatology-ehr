/**
 * Pathology Results Component
 * Displays detailed pathology/biopsy reports for dermatology
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  Divider,
  Alert,
  Skeleton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Button,
  IconButton,
  Tooltip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Warning as WarningIcon,
  Print as PrintIcon,
  Download as DownloadIcon,
  CheckCircle as CheckCircleIcon,
  LocalHospital as LocalHospitalIcon,
  Science as ScienceIcon
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE_URL } from '../../utils/apiBase';

interface PathologyResultsProps {
  orderId: string;
  onReviewComplete?: () => void;
}

interface PathologyOrder {
  id: string;
  order_number: string;
  order_date: string;
  specimen_type: string;
  specimen_site?: string;
  clinical_history?: string;
  clinical_diagnosis?: string;
  gross_description?: string;
  status: string;
  priority: string;
  patient_name?: string;
  mrn?: string;
  ordering_provider_name?: string;
  accession_number?: string;
}

interface PathologyResult {
  id: string;
  order_id: string;
  received_date?: string;
  report_date?: string;
  result_status: string;
  diagnosis: string;
  diagnosis_codes?: string[];
  microscopic_description?: string;
  gross_description?: string;
  clinical_correlation?: string;
  special_stains?: Record<string, string>;
  immunohistochemistry?: Record<string, string>;
  molecular_results?: Record<string, any>;
  synoptic_report?: Record<string, any>;
  margins_status?: string;
  margin_distance_mm?: number;
  tumor_size_mm?: number;
  tumor_depth_mm?: number;
  mitotic_rate?: string;
  breslow_depth_mm?: number;
  clark_level?: string;
  ulceration?: boolean;
  perineural_invasion?: boolean;
  lymphovascular_invasion?: boolean;
  tumor_grade?: string;
  pathologist_name?: string;
  signed_at?: string;
  is_malignant?: boolean;
  is_precancerous?: boolean;
  follow_up_recommended?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  review_notes?: string;
}

const getMalignancyChip = (result: PathologyResult) => {
  if (result.is_malignant) {
    return <Chip icon={<WarningIcon />} label="MALIGNANT" color="error" size="small" />;
  }
  if (result.is_precancerous) {
    return <Chip icon={<WarningIcon />} label="Pre-cancerous" color="warning" size="small" />;
  }
  return <Chip icon={<CheckCircleIcon />} label="Benign" color="success" size="small" />;
};

const getMarginsChip = (status?: string) => {
  if (!status) return null;

  switch (status) {
    case 'clear':
      return <Chip label="Margins Clear" color="success" size="small" />;
    case 'positive':
      return <Chip label="Margins Positive" color="error" size="small" />;
    case 'close':
      return <Chip label="Margins Close" color="warning" size="small" />;
    default:
      return <Chip label={status} size="small" variant="outlined" />;
  }
};

export const PathologyResults: React.FC<PathologyResultsProps> = ({
  orderId,
  onReviewComplete
}) => {
  const { session } = useAuth();

  const [order, setOrder] = useState<PathologyOrder | null>(null);
  const [result, setResult] = useState<PathologyResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPathologyResult = useCallback(async () => {
    if (!session) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch pathology order and result
      const response = await fetch(`${API_BASE_URL}/api/dermpath/orders/${orderId}`, {
        headers: {
          'Authorization': `Bearer ${session.accessToken}`,
          'x-tenant-id': session.tenantId
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch pathology result');
      }

      const data = await response.json();
      setOrder(data.order || data);
      setResult(data.result || null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [session, orderId]);

  useEffect(() => {
    fetchPathologyResult();
  }, [fetchPathologyResult]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <Box>
        <Skeleton variant="rectangular" height={150} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" height={400} />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error">
        {error}
      </Alert>
    );
  }

  if (!order) {
    return (
      <Alert severity="info">
        Pathology order not found
      </Alert>
    );
  }

  return (
    <Box>
      {/* Order Header */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} md={8}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <LocalHospitalIcon color="primary" />
                <Typography variant="h6">
                  Pathology Report
                </Typography>
                {result && getMalignancyChip(result)}
              </Box>
              <Typography variant="body2" color="text.secondary">
                Accession #: {order.accession_number || order.order_number}
              </Typography>
              {order.patient_name && (
                <Typography variant="body2" color="text.secondary">
                  Patient: {order.patient_name} | MRN: {order.mrn}
                </Typography>
              )}
              <Typography variant="body2" color="text.secondary">
                Ordered: {new Date(order.order_date).toLocaleDateString()} by {order.ordering_provider_name}
              </Typography>
            </Grid>
            <Grid item xs={12} md={4}>
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <Chip
                  label={order.status}
                  color={order.status === 'completed' ? 'success' : 'default'}
                  size="small"
                />
                <Chip
                  label={order.specimen_type}
                  variant="outlined"
                  size="small"
                />
                <IconButton onClick={handlePrint} size="small">
                  <PrintIcon />
                </IconButton>
              </Box>
            </Grid>
          </Grid>

          <Divider sx={{ my: 2 }} />

          {/* Specimen Information */}
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" color="primary" gutterBottom>
                Specimen Information
              </Typography>
              <Typography variant="body2">
                <strong>Type:</strong> {order.specimen_type}
              </Typography>
              {order.specimen_site && (
                <Typography variant="body2">
                  <strong>Site:</strong> {order.specimen_site}
                </Typography>
              )}
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" color="primary" gutterBottom>
                Clinical Information
              </Typography>
              {order.clinical_history && (
                <Typography variant="body2">
                  <strong>History:</strong> {order.clinical_history}
                </Typography>
              )}
              {order.clinical_diagnosis && (
                <Typography variant="body2">
                  <strong>Clinical Dx:</strong> {order.clinical_diagnosis}
                </Typography>
              )}
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Results Not Available */}
      {!result && (
        <Alert severity="info" icon={<ScienceIcon />}>
          Pathology results are pending. Check back for updates.
        </Alert>
      )}

      {/* Pathology Report */}
      {result && (
        <Box>
          {/* Diagnosis Section */}
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" color="primary">
                  Diagnosis
                </Typography>
                {getMarginsChip(result.margins_status)}
              </Box>

              <Paper
                variant="outlined"
                sx={{
                  p: 2,
                  backgroundColor: result.is_malignant ? 'error.light' : 'background.paper'
                }}
              >
                <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                  {result.diagnosis}
                </Typography>
              </Paper>

              {result.diagnosis_codes && result.diagnosis_codes.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="caption" color="text.secondary">
                    Diagnosis Codes:
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                    {result.diagnosis_codes.map((code, idx) => (
                      <Chip key={idx} label={code} size="small" variant="outlined" />
                    ))}
                  </Box>
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Synoptic Report (if available - for malignancies) */}
          {result.synoptic_report && Object.keys(result.synoptic_report).length > 0 && (
            <Accordion defaultExpanded={result.is_malignant}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle1" fontWeight="medium">
                  Synoptic Report
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <TableContainer>
                  <Table size="small">
                    <TableBody>
                      {result.tumor_size_mm && (
                        <TableRow>
                          <TableCell><strong>Tumor Size</strong></TableCell>
                          <TableCell>{result.tumor_size_mm} mm</TableCell>
                        </TableRow>
                      )}
                      {result.breslow_depth_mm && (
                        <TableRow>
                          <TableCell><strong>Breslow Depth</strong></TableCell>
                          <TableCell>{result.breslow_depth_mm} mm</TableCell>
                        </TableRow>
                      )}
                      {result.clark_level && (
                        <TableRow>
                          <TableCell><strong>Clark Level</strong></TableCell>
                          <TableCell>{result.clark_level}</TableCell>
                        </TableRow>
                      )}
                      {result.tumor_grade && (
                        <TableRow>
                          <TableCell><strong>Tumor Grade</strong></TableCell>
                          <TableCell>{result.tumor_grade}</TableCell>
                        </TableRow>
                      )}
                      {result.mitotic_rate && (
                        <TableRow>
                          <TableCell><strong>Mitotic Rate</strong></TableCell>
                          <TableCell>{result.mitotic_rate}</TableCell>
                        </TableRow>
                      )}
                      {result.margin_distance_mm !== undefined && (
                        <TableRow>
                          <TableCell><strong>Margin Distance</strong></TableCell>
                          <TableCell>{result.margin_distance_mm} mm</TableCell>
                        </TableRow>
                      )}
                      <TableRow>
                        <TableCell><strong>Ulceration</strong></TableCell>
                        <TableCell>{result.ulceration ? 'Present' : 'Absent'}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell><strong>Perineural Invasion</strong></TableCell>
                        <TableCell>{result.perineural_invasion ? 'Present' : 'Not Identified'}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell><strong>Lymphovascular Invasion</strong></TableCell>
                        <TableCell>{result.lymphovascular_invasion ? 'Present' : 'Not Identified'}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>
              </AccordionDetails>
            </Accordion>
          )}

          {/* Microscopic Description */}
          {result.microscopic_description && (
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle1" fontWeight="medium">
                  Microscopic Description
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {result.microscopic_description}
                </Typography>
              </AccordionDetails>
            </Accordion>
          )}

          {/* Special Stains */}
          {result.special_stains && Object.keys(result.special_stains).length > 0 && (
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle1" fontWeight="medium">
                  Special Stains
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <List dense>
                  {Object.entries(result.special_stains).map(([stain, result]) => (
                    <ListItem key={stain}>
                      <ListItemText
                        primary={stain}
                        secondary={result}
                      />
                    </ListItem>
                  ))}
                </List>
              </AccordionDetails>
            </Accordion>
          )}

          {/* Immunohistochemistry */}
          {result.immunohistochemistry && Object.keys(result.immunohistochemistry).length > 0 && (
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle1" fontWeight="medium">
                  Immunohistochemistry
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <TableContainer>
                  <Table size="small">
                    <TableBody>
                      {Object.entries(result.immunohistochemistry).map(([marker, ihcResult]) => (
                        <TableRow key={marker}>
                          <TableCell><strong>{marker}</strong></TableCell>
                          <TableCell>{ihcResult}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </AccordionDetails>
            </Accordion>
          )}

          {/* Clinical Correlation & Follow-up */}
          {(result.clinical_correlation || result.follow_up_recommended) && (
            <Card sx={{ mt: 2 }}>
              <CardContent>
                {result.clinical_correlation && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" color="primary" gutterBottom>
                      Clinical Correlation
                    </Typography>
                    <Typography variant="body2">
                      {result.clinical_correlation}
                    </Typography>
                  </Box>
                )}
                {result.follow_up_recommended && (
                  <Box>
                    <Typography variant="subtitle2" color="warning.main" gutterBottom>
                      Recommended Follow-up
                    </Typography>
                    <Alert severity="warning" icon={<WarningIcon />}>
                      {result.follow_up_recommended}
                    </Alert>
                  </Box>
                )}
              </CardContent>
            </Card>
          )}

          {/* Pathologist Signature */}
          <Card sx={{ mt: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Pathologist:
                  </Typography>
                  <Typography variant="body1" fontWeight="medium">
                    {result.pathologist_name || 'Pending Signature'}
                  </Typography>
                </Box>
                <Box textAlign="right">
                  <Typography variant="body2" color="text.secondary">
                    Signed:
                  </Typography>
                  <Typography variant="body1">
                    {result.signed_at
                      ? new Date(result.signed_at).toLocaleString()
                      : 'Pending'}
                  </Typography>
                </Box>
              </Box>
              <Chip
                label={result.result_status === 'final' ? 'Final Report' : result.result_status}
                color={result.result_status === 'final' ? 'success' : 'warning'}
                size="small"
                sx={{ mt: 1 }}
              />
            </CardContent>
          </Card>

          {/* Review Status */}
          {result.reviewed_at && (
            <Alert severity="success" sx={{ mt: 2 }} icon={<CheckCircleIcon />}>
              Reviewed on {new Date(result.reviewed_at).toLocaleString()}
              {result.review_notes && ` - ${result.review_notes}`}
            </Alert>
          )}
        </Box>
      )}
    </Box>
  );
};

export default PathologyResults;
