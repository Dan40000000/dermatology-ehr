/**
 * MohsReport Component
 * Displays and prints the operative report for a Mohs case
 */

import React, { useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Grid,
  Chip,
  Stack
} from '@mui/material';
import {
  Print as PrintIcon,
  Download as DownloadIcon,
  ContentCopy as CopyIcon
} from '@mui/icons-material';
import { format } from 'date-fns';

interface MohsReportData {
  case_number: string;
  case_date: string;
  patient_name: string;
  mrn: string;
  patient_dob: string;
  surgeon_name: string;
  assistant_name?: string;
  tumor_location: string;
  tumor_laterality?: string;
  tumor_type: string;
  tumor_subtype?: string;
  prior_pathology_diagnosis?: string;
  pre_op_size_mm?: number;
  final_defect_size_mm?: number;
  final_defect_width_mm?: number;
  final_defect_length_mm?: number;
  anesthesia_type?: string;
  anesthesia_agent?: string;
  total_stages: number;
  stages: Array<{
    stage_number: number;
    margin_status: string;
    block_count: number;
    blocks?: Array<{
      block_label: string;
      margin_status: string;
      position?: string;
    }>;
  }>;
  closures?: Array<{
    closure_type: string;
    closure_subtype?: string;
    repair_length_cm?: number;
    repair_width_cm?: number;
    closure_notes?: string;
  }>;
  mohs_cpt_codes?: string[];
  repair_cpt_codes?: string[];
  post_op_notes?: string;
  complications?: string;
}

interface MohsReportProps {
  reportData: MohsReportData;
  onPrint?: () => void;
  onDownload?: () => void;
}

const MohsReport: React.FC<MohsReportProps> = ({
  reportData,
  onPrint,
  onDownload
}) => {
  const reportRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    if (onPrint) {
      onPrint();
    } else {
      window.print();
    }
  };

  const handleCopyToClipboard = () => {
    if (reportRef.current) {
      const text = reportRef.current.innerText;
      navigator.clipboard.writeText(text);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMMM d, yyyy');
    } catch {
      return dateStr;
    }
  };

  const allCodes = [
    ...(reportData.mohs_cpt_codes || []),
    ...(reportData.repair_cpt_codes || [])
  ];

  return (
    <Box>
      {/* Toolbar */}
      <Box display="flex" justifyContent="flex-end" gap={1} mb={2} className="no-print">
        <Button startIcon={<CopyIcon />} onClick={handleCopyToClipboard}>
          Copy
        </Button>
        {onDownload && (
          <Button startIcon={<DownloadIcon />} onClick={onDownload}>
            Download
          </Button>
        )}
        <Button
          variant="contained"
          startIcon={<PrintIcon />}
          onClick={handlePrint}
        >
          Print
        </Button>
      </Box>

      {/* Report Content */}
      <Paper ref={reportRef} sx={{ p: 4 }} id="mohs-report">
        {/* Header */}
        <Box textAlign="center" mb={4}>
          <Typography variant="h5" gutterBottom fontWeight="bold">
            MOHS MICROGRAPHIC SURGERY
          </Typography>
          <Typography variant="h6">
            OPERATIVE REPORT
          </Typography>
        </Box>

        <Divider sx={{ mb: 3 }} />

        {/* Patient Information */}
        <Box mb={4}>
          <Typography variant="h6" gutterBottom sx={{ backgroundColor: '#f5f5f5', p: 1 }}>
            PATIENT INFORMATION
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <Table size="small">
                <TableBody>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 'bold', border: 'none' }}>Patient:</TableCell>
                    <TableCell sx={{ border: 'none' }}>{reportData.patient_name}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 'bold', border: 'none' }}>MRN:</TableCell>
                    <TableCell sx={{ border: 'none' }}>{reportData.mrn}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 'bold', border: 'none' }}>DOB:</TableCell>
                    <TableCell sx={{ border: 'none' }}>{formatDate(reportData.patient_dob)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Table size="small">
                <TableBody>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 'bold', border: 'none' }}>Case #:</TableCell>
                    <TableCell sx={{ border: 'none' }}>{reportData.case_number}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 'bold', border: 'none' }}>Date:</TableCell>
                    <TableCell sx={{ border: 'none' }}>{formatDate(reportData.case_date)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 'bold', border: 'none' }}>Surgeon:</TableCell>
                    <TableCell sx={{ border: 'none' }}>{reportData.surgeon_name}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </Grid>
          </Grid>
        </Box>

        {/* Preoperative Diagnosis */}
        <Box mb={4}>
          <Typography variant="h6" gutterBottom sx={{ backgroundColor: '#f5f5f5', p: 1 }}>
            PREOPERATIVE DIAGNOSIS
          </Typography>
          <Typography paragraph>
            <strong>{reportData.tumor_type}</strong>
            {reportData.tumor_subtype && ` (${reportData.tumor_subtype})`}
          </Typography>
          <Typography paragraph>
            Location: {reportData.tumor_location}
            {reportData.tumor_laterality && `, ${reportData.tumor_laterality}`}
          </Typography>
          {reportData.prior_pathology_diagnosis && (
            <Typography paragraph>
              Prior Pathology: {reportData.prior_pathology_diagnosis}
            </Typography>
          )}
          {reportData.pre_op_size_mm && (
            <Typography paragraph>
              Pre-operative Clinical Size: {reportData.pre_op_size_mm}mm
            </Typography>
          )}
        </Box>

        {/* Anesthesia */}
        <Box mb={4}>
          <Typography variant="h6" gutterBottom sx={{ backgroundColor: '#f5f5f5', p: 1 }}>
            ANESTHESIA
          </Typography>
          <Typography>
            {reportData.anesthesia_type || 'Local anesthesia'}
            {reportData.anesthesia_agent && ` - ${reportData.anesthesia_agent}`}
          </Typography>
        </Box>

        {/* Mohs Stages */}
        <Box mb={4}>
          <Typography variant="h6" gutterBottom sx={{ backgroundColor: '#f5f5f5', p: 1 }}>
            MOHS STAGES
          </Typography>
          {reportData.stages.map((stage) => (
            <Box key={stage.stage_number} mb={2} pl={2}>
              <Typography variant="subtitle1" fontWeight="bold">
                Stage {stage.stage_number}:
                <Chip
                  size="small"
                  label={stage.margin_status.toUpperCase()}
                  color={
                    stage.margin_status === 'negative' ? 'success' :
                    stage.margin_status === 'positive' ? 'error' : 'warning'
                  }
                  sx={{ ml: 1 }}
                />
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {stage.block_count} tissue block{stage.block_count !== 1 ? 's' : ''} examined
              </Typography>
              {stage.blocks && stage.blocks.length > 0 && (
                <Box mt={1}>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {stage.blocks.map((block) => (
                      <Chip
                        key={block.block_label}
                        size="small"
                        label={`${block.block_label}: ${block.margin_status === 'positive' ? '+' : '-'}${block.position ? ` (${block.position})` : ''}`}
                        variant="outlined"
                        color={block.margin_status === 'positive' ? 'error' : 'success'}
                      />
                    ))}
                  </Stack>
                </Box>
              )}
            </Box>
          ))}
          <Typography variant="body1" mt={2}>
            <strong>Total Stages: {reportData.total_stages}</strong>
          </Typography>
        </Box>

        {/* Final Defect */}
        <Box mb={4}>
          <Typography variant="h6" gutterBottom sx={{ backgroundColor: '#f5f5f5', p: 1 }}>
            FINAL DEFECT
          </Typography>
          {reportData.final_defect_size_mm && (
            <Typography>Size: {reportData.final_defect_size_mm}mm</Typography>
          )}
          {reportData.final_defect_width_mm && reportData.final_defect_length_mm && (
            <Typography>
              Dimensions: {reportData.final_defect_width_mm}mm x {reportData.final_defect_length_mm}mm
            </Typography>
          )}
        </Box>

        {/* Closure */}
        <Box mb={4}>
          <Typography variant="h6" gutterBottom sx={{ backgroundColor: '#f5f5f5', p: 1 }}>
            CLOSURE / REPAIR
          </Typography>
          {reportData.closures && reportData.closures.length > 0 ? (
            reportData.closures.map((closure, index) => (
              <Box key={index} mb={1}>
                <Typography>
                  <strong>Type:</strong> {closure.closure_type.replace(/_/g, ' ')}
                  {closure.closure_subtype && ` - ${closure.closure_subtype}`}
                </Typography>
                {closure.repair_length_cm && (
                  <Typography>
                    Size: {closure.repair_length_cm}cm
                    {closure.repair_width_cm && ` x ${closure.repair_width_cm}cm`}
                  </Typography>
                )}
                {closure.closure_notes && (
                  <Typography color="text.secondary">{closure.closure_notes}</Typography>
                )}
              </Box>
            ))
          ) : (
            <Typography>Closure not yet documented</Typography>
          )}
        </Box>

        {/* CPT Codes */}
        <Box mb={4}>
          <Typography variant="h6" gutterBottom sx={{ backgroundColor: '#f5f5f5', p: 1 }}>
            CPT CODES
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {allCodes.map((code, index) => (
              <Chip key={index} label={code} variant="outlined" />
            ))}
          </Stack>
        </Box>

        {/* Post-operative Notes */}
        {reportData.post_op_notes && (
          <Box mb={4}>
            <Typography variant="h6" gutterBottom sx={{ backgroundColor: '#f5f5f5', p: 1 }}>
              POST-OPERATIVE NOTES
            </Typography>
            <Typography sx={{ whiteSpace: 'pre-wrap' }}>
              {reportData.post_op_notes}
            </Typography>
          </Box>
        )}

        {/* Complications */}
        {reportData.complications && (
          <Box mb={4}>
            <Typography variant="h6" gutterBottom sx={{ backgroundColor: '#f5f5f5', p: 1 }}>
              COMPLICATIONS
            </Typography>
            <Typography>{reportData.complications}</Typography>
          </Box>
        )}

        {/* Signature */}
        <Box mt={6}>
          <Divider sx={{ mb: 4 }} />
          <Box>
            <Typography sx={{ borderBottom: '1px solid black', width: 300, mb: 1 }}>
              &nbsp;
            </Typography>
            <Typography>{reportData.surgeon_name}, MD</Typography>
            <Typography variant="body2" color="text.secondary">
              Date: {format(new Date(), 'MMMM d, yyyy')}
            </Typography>
          </Box>
        </Box>
      </Paper>

      <style>{`
        @media print {
          .no-print {
            display: none !important;
          }
          #mohs-report {
            box-shadow: none !important;
            border: none !important;
          }
        }
      `}</style>
    </Box>
  );
};

export default MohsReport;
