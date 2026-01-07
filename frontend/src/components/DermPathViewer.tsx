import React from 'react';
import {
  Box,
  Typography,
  Grid,
  Paper,
  Chip,
  Divider,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Card,
  CardContent
} from '@mui/material';
import {
  Science as ScienceIcon,
  Assignment as ReportIcon,
  Check as CheckIcon,
  Warning as WarningIcon
} from '@mui/icons-material';

interface DermPathReport {
  id: string;
  accession_number: string;
  report_date: string;
  pathologist_name: string;
  specimen_site: string;
  specimen_type: string;
  specimen_size?: string;
  clinical_history?: string;
  clinical_diagnosis?: string;
  gross_description?: string;
  microscopic_description: string;
  diagnosis: string;
  diagnosis_code?: string;
  special_stains?: Array<{ name: string; result: string }>;
  immunohistochemistry?: any;
  immunofluorescence_results?: any;
  margins_status?: string;
  margin_measurements?: string;
  additional_findings?: string;
  comment?: string;
  status: string;
  amended_at?: string;
  amendment_reason?: string;
}

interface DermPathViewerProps {
  report: DermPathReport;
}

const DermPathViewer: React.FC<DermPathViewerProps> = ({ report }) => {
  const getMarginsColor = (status?: string) => {
    if (!status) return 'default';
    switch (status) {
      case 'clear':
        return 'success';
      case 'involved':
        return 'error';
      case 'close':
        return 'warning';
      default:
        return 'default';
    }
  };

  const getMarginsIcon = (status?: string) => {
    if (!status) return null;
    switch (status) {
      case 'clear':
        return <CheckIcon />;
      case 'involved':
      case 'close':
        return <WarningIcon />;
      default:
        return null;
    }
  };

  return (
    <Box>
      {/* Header */}
      <Paper sx={{ p: 3, mb: 3, bgcolor: '#f5f5f5' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
              <ReportIcon sx={{ mr: 1 }} />
              Dermatopathology Report
            </Typography>
            <Typography variant="h6" color="primary">
              {report.accession_number}
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'right' }}>
            <Chip
              label={report.status.toUpperCase()}
              color={report.status === 'final' ? 'success' : 'warning'}
              sx={{ mb: 1 }}
            />
            <Typography variant="body2" color="textSecondary">
              {new Date(report.report_date).toLocaleDateString()}
            </Typography>
          </Box>
        </Box>

        {report.amended_at && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            <Typography variant="subtitle2">Amended Report</Typography>
            <Typography variant="body2">
              Amended on {new Date(report.amended_at).toLocaleDateString()}
              {report.amendment_reason && `: ${report.amendment_reason}`}
            </Typography>
          </Alert>
        )}
      </Paper>

      {/* Specimen Information */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Specimen Information
        </Typography>
        <Divider sx={{ mb: 2 }} />
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" color="textSecondary">
              Site
            </Typography>
            <Typography variant="body1">{report.specimen_site}</Typography>
          </Grid>
          <Grid item xs={12} md={3}>
            <Typography variant="subtitle2" color="textSecondary">
              Type
            </Typography>
            <Typography variant="body1">{report.specimen_type}</Typography>
          </Grid>
          {report.specimen_size && (
            <Grid item xs={12} md={3}>
              <Typography variant="subtitle2" color="textSecondary">
                Size
              </Typography>
              <Typography variant="body1">{report.specimen_size}</Typography>
            </Grid>
          )}
        </Grid>
      </Paper>

      {/* Clinical Information */}
      {(report.clinical_history || report.clinical_diagnosis) && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Clinical Information
          </Typography>
          <Divider sx={{ mb: 2 }} />
          {report.clinical_history && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                Clinical History
              </Typography>
              <Typography variant="body1">{report.clinical_history}</Typography>
            </Box>
          )}
          {report.clinical_diagnosis && (
            <Box>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                Clinical Diagnosis
              </Typography>
              <Typography variant="body1">{report.clinical_diagnosis}</Typography>
            </Box>
          )}
        </Paper>
      )}

      {/* Gross Description */}
      {report.gross_description && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Gross Description
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <Typography variant="body1" sx={{ whiteSpace: 'pre-line' }}>
            {report.gross_description}
          </Typography>
        </Paper>
      )}

      {/* Microscopic Description */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Microscopic Description
        </Typography>
        <Divider sx={{ mb: 2 }} />
        <Typography variant="body1" sx={{ whiteSpace: 'pre-line' }}>
          {report.microscopic_description}
        </Typography>
      </Paper>

      {/* Diagnosis - Highlighted */}
      <Paper sx={{ p: 3, mb: 3, bgcolor: '#e3f2fd', border: '2px solid #1976d2' }}>
        <Typography variant="h6" gutterBottom color="primary">
          DIAGNOSIS
        </Typography>
        <Divider sx={{ mb: 2 }} />
        <Typography variant="h6" sx={{ whiteSpace: 'pre-line' }}>
          {report.diagnosis}
        </Typography>
        {report.diagnosis_code && (
          <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
            SNOMED CT: {report.diagnosis_code}
          </Typography>
        )}
      </Paper>

      {/* Margins (if applicable) */}
      {report.margins_status && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Margins
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Chip
              icon={getMarginsIcon(report.margins_status) || undefined}
              label={report.margins_status.replace('_', ' ').toUpperCase()}
              color={getMarginsColor(report.margins_status)}
            />
            {report.margin_measurements && (
              <Typography variant="body1">{report.margin_measurements}</Typography>
            )}
          </Box>
        </Paper>
      )}

      {/* Special Stains */}
      {report.special_stains && report.special_stains.length > 0 && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
            <ScienceIcon sx={{ mr: 1 }} />
            Special Stains
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <TableContainer>
            <Table size="small">
              <TableBody>
                {report.special_stains.map((stain, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <strong>{stain.name}</strong>
                    </TableCell>
                    <TableCell>{stain.result}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Immunofluorescence Results */}
      {report.immunofluorescence_results && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Immunofluorescence
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <Typography variant="body1">
            {JSON.stringify(report.immunofluorescence_results, null, 2)}
          </Typography>
        </Paper>
      )}

      {/* Additional Findings */}
      {report.additional_findings && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Additional Findings
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <Typography variant="body1" sx={{ whiteSpace: 'pre-line' }}>
            {report.additional_findings}
          </Typography>
        </Paper>
      )}

      {/* Comment */}
      {report.comment && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Comment
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <Alert severity="info">
            <Typography variant="body1" sx={{ whiteSpace: 'pre-line' }}>
              {report.comment}
            </Typography>
          </Alert>
        </Paper>
      )}

      {/* Pathologist */}
      <Paper sx={{ p: 2, bgcolor: '#f5f5f5' }}>
        <Typography variant="body2" color="textSecondary">
          Pathologist: <strong>{report.pathologist_name}</strong>
        </Typography>
        <Typography variant="caption" color="textSecondary">
          Report Date: {new Date(report.report_date).toLocaleString()}
        </Typography>
      </Paper>
    </Box>
  );
};

export default DermPathViewer;
