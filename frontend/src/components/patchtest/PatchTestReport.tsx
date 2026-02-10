/**
 * PatchTestReport Component
 * Printable patient report for patch test results
 */

import React, { forwardRef } from 'react';
import {
  Box,
  Divider,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { format } from 'date-fns';
import { ReadingValue, READING_DEFINITIONS } from './ReadingScale';
import type { AvoidanceItem } from './AvoidanceList';

export interface ReportAllergen {
  allergenName: string;
  reading48hr: ReadingValue;
  reading96hr: ReadingValue;
  interpretation: string;
}

export interface PatchTestReportData {
  patientName: string;
  patientDob?: string;
  mrn?: string;
  applicationDate: string | Date;
  read48hrDate?: string | Date;
  read96hrDate?: string | Date;
  providerName?: string;
  clinicName?: string;
  clinicAddress?: string;
  clinicPhone?: string;
  positiveAllergens: ReportAllergen[];
  negativeAllergens: ReportAllergen[];
  irritantReactions: ReportAllergen[];
  recommendations: string;
  avoidanceList: AvoidanceItem[];
}

interface PatchTestReportProps {
  data: PatchTestReportData;
}

const PatchTestReport = forwardRef<HTMLDivElement, PatchTestReportProps>(
  ({ data }, ref) => {
    const formatDate = (date: string | Date | undefined): string => {
      if (!date) return 'N/A';
      const d = typeof date === 'string' ? new Date(date) : date;
      return format(d, 'MMMM d, yyyy');
    };

    const getReadingDisplay = (reading: ReadingValue): string => {
      const def = READING_DEFINITIONS[reading];
      return `${def.code} (${def.label})`;
    };

    return (
      <Box
        ref={ref}
        sx={{
          bgcolor: 'white',
          color: 'black',
          p: 4,
          maxWidth: 800,
          mx: 'auto',
          '@media print': {
            p: 2,
            maxWidth: '100%',
          },
        }}
      >
        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          {data.clinicName && (
            <Typography variant="h5" fontWeight="bold">
              {data.clinicName}
            </Typography>
          )}
          {data.clinicAddress && (
            <Typography variant="body2" color="text.secondary">
              {data.clinicAddress}
            </Typography>
          )}
          {data.clinicPhone && (
            <Typography variant="body2" color="text.secondary">
              Phone: {data.clinicPhone}
            </Typography>
          )}
          <Divider sx={{ my: 2 }} />
          <Typography variant="h4" fontWeight="bold">
            PATCH TEST RESULTS REPORT
          </Typography>
        </Box>

        {/* Patient Information */}
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Patient Information
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <Box>
              <Typography variant="body2" color="text.secondary">
                Patient Name
              </Typography>
              <Typography variant="body1" fontWeight="bold">
                {data.patientName}
              </Typography>
            </Box>
            {data.patientDob && (
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Date of Birth
                </Typography>
                <Typography variant="body1">{formatDate(data.patientDob)}</Typography>
              </Box>
            )}
            {data.mrn && (
              <Box>
                <Typography variant="body2" color="text.secondary">
                  MRN
                </Typography>
                <Typography variant="body1">{data.mrn}</Typography>
              </Box>
            )}
            {data.providerName && (
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Provider
                </Typography>
                <Typography variant="body1">{data.providerName}</Typography>
              </Box>
            )}
          </Box>
        </Paper>

        {/* Test Dates */}
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Test Dates
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>
            <Box>
              <Typography variant="body2" color="text.secondary">
                Application Date
              </Typography>
              <Typography variant="body1">{formatDate(data.applicationDate)}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary">
                48-Hour Reading
              </Typography>
              <Typography variant="body1">{formatDate(data.read48hrDate)}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary">
                96-Hour Reading
              </Typography>
              <Typography variant="body1">{formatDate(data.read96hrDate)}</Typography>
            </Box>
          </Box>
        </Paper>

        {/* Results Summary */}
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Results Summary
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2, mb: 2 }}>
            <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'error.50', borderRadius: 1 }}>
              <Typography variant="h4" color="error.main" fontWeight="bold">
                {data.positiveAllergens.length}
              </Typography>
              <Typography variant="body2">Positive Reactions</Typography>
            </Box>
            <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'warning.50', borderRadius: 1 }}>
              <Typography variant="h4" color="warning.main" fontWeight="bold">
                {data.irritantReactions.length}
              </Typography>
              <Typography variant="body2">Irritant Reactions</Typography>
            </Box>
            <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'success.50', borderRadius: 1 }}>
              <Typography variant="h4" color="success.main" fontWeight="bold">
                {data.negativeAllergens.length}
              </Typography>
              <Typography variant="body2">Negative Results</Typography>
            </Box>
          </Box>
        </Paper>

        {/* Positive Reactions Detail */}
        {data.positiveAllergens.length > 0 && (
          <Paper variant="outlined" sx={{ p: 2, mb: 3, borderColor: 'error.main', borderWidth: 2 }}>
            <Typography variant="h6" color="error.main" gutterBottom>
              POSITIVE REACTIONS - Allergens to Avoid
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Allergen</TableCell>
                    <TableCell>48hr Reading</TableCell>
                    <TableCell>96hr Reading</TableCell>
                    <TableCell>Relevance</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.positiveAllergens.map((allergen) => (
                    <TableRow key={allergen.allergenName}>
                      <TableCell>
                        <Typography fontWeight="bold">{allergen.allergenName}</Typography>
                      </TableCell>
                      <TableCell>{getReadingDisplay(allergen.reading48hr)}</TableCell>
                      <TableCell>{getReadingDisplay(allergen.reading96hr)}</TableCell>
                      <TableCell sx={{ textTransform: 'capitalize' }}>
                        {allergen.interpretation.replace('_', ' ')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}

        {/* Avoidance Instructions */}
        {data.avoidanceList.length > 0 && (
          <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Avoidance Instructions
            </Typography>
            {data.avoidanceList.map((item) => (
              <Box key={item.allergen} sx={{ mb: 3 }}>
                <Typography variant="subtitle1" fontWeight="bold" color="error.main">
                  {item.allergen}
                </Typography>
                {item.sources.length > 0 && (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="body2" fontWeight="bold">
                      Common Sources:
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {item.sources.join(', ')}
                    </Typography>
                  </Box>
                )}
                {item.crossReactors && item.crossReactors.length > 0 && (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="body2" fontWeight="bold">
                      May Cross-React With:
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {item.crossReactors.join(', ')}
                    </Typography>
                  </Box>
                )}
                {item.instructions && (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="body2" fontWeight="bold">
                      How to Avoid:
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {item.instructions}
                    </Typography>
                  </Box>
                )}
                <Divider sx={{ mt: 2 }} />
              </Box>
            ))}
          </Paper>
        )}

        {/* Recommendations */}
        {data.recommendations && (
          <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Recommendations
            </Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
              {data.recommendations}
            </Typography>
          </Paper>
        )}

        {/* Reading Scale Legend */}
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Reading Scale Reference (ICDRG)
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
            {Object.entries(READING_DEFINITIONS)
              .filter(([key]) => key !== 'not_read')
              .map(([key, def]) => (
                <Box key={key} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Typography variant="body2" fontWeight="bold" sx={{ minWidth: 30 }}>
                    {def.code}
                  </Typography>
                  <Typography variant="body2">
                    {def.label}: {def.description}
                  </Typography>
                </Box>
              ))}
          </Box>
        </Paper>

        {/* Footer */}
        <Box sx={{ textAlign: 'center', mt: 4, pt: 2, borderTop: '1px solid #ddd' }}>
          <Typography variant="caption" color="text.secondary">
            Report generated on {format(new Date(), 'MMMM d, yyyy')} at{' '}
            {format(new Date(), 'h:mm a')}
          </Typography>
          <Typography variant="caption" display="block" color="text.secondary">
            This report is intended for educational purposes and should not replace professional
            medical advice.
          </Typography>
        </Box>
      </Box>
    );
  }
);

PatchTestReport.displayName = 'PatchTestReport';

export default PatchTestReport;
