/**
 * ResultsSummary Component
 * Displays summary of patch test results with positive findings
 */

import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  CheckCircle as NegativeIcon,
  Warning as WarningIcon,
  Error as PositiveIcon,
  Help as DoubtfulIcon,
  ExpandMore as ExpandMoreIcon,
  LocalHospital as AllergenIcon,
} from '@mui/icons-material';
import { ReadingValue, READING_DEFINITIONS, ReadingBadge } from './ReadingScale';

export interface AllergenResultSummary {
  id: string;
  allergenId: string;
  allergenName: string;
  position: number;
  reading48hr: ReadingValue;
  reading96hr: ReadingValue;
  interpretation: string;
  crossReactors: string[];
  commonSources: string[];
  avoidanceInstructions: string;
}

export interface InterpretationSummary {
  sessionId: string;
  positive: AllergenResultSummary[];
  negative: AllergenResultSummary[];
  irritant: AllergenResultSummary[];
  doubtful: AllergenResultSummary[];
  summary: {
    totalTested: number;
    positiveCount: number;
    negativeCount: number;
    irritantCount: number;
    doubtfulCount: number;
  };
}

interface ResultsSummaryProps {
  interpretation: InterpretationSummary;
  showDetails?: boolean;
}

const ResultsSummary: React.FC<ResultsSummaryProps> = ({
  interpretation,
  showDetails = true,
}) => {
  const { summary, positive, negative, irritant, doubtful } = interpretation;

  const getFinalReading = (result: AllergenResultSummary): ReadingValue => {
    return result.reading96hr !== 'not_read' ? result.reading96hr : result.reading48hr;
  };

  return (
    <Box>
      {/* Overview Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <Card sx={{ bgcolor: 'error.50', borderLeft: '4px solid', borderColor: 'error.main' }}>
            <CardContent>
              <Typography variant="h3" color="error.main" fontWeight="bold">
                {summary.positiveCount}
              </Typography>
              <Typography variant="body2" color="error.dark">
                Positive
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={6} sm={3}>
          <Card sx={{ bgcolor: 'success.50', borderLeft: '4px solid', borderColor: 'success.main' }}>
            <CardContent>
              <Typography variant="h3" color="success.main" fontWeight="bold">
                {summary.negativeCount}
              </Typography>
              <Typography variant="body2" color="success.dark">
                Negative
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={6} sm={3}>
          <Card sx={{ bgcolor: 'warning.50', borderLeft: '4px solid', borderColor: 'warning.main' }}>
            <CardContent>
              <Typography variant="h3" color="warning.main" fontWeight="bold">
                {summary.irritantCount}
              </Typography>
              <Typography variant="body2" color="warning.dark">
                Irritant
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={6} sm={3}>
          <Card sx={{ bgcolor: 'grey.100', borderLeft: '4px solid', borderColor: 'grey.500' }}>
            <CardContent>
              <Typography variant="h3" color="grey.700" fontWeight="bold">
                {summary.doubtfulCount}
              </Typography>
              <Typography variant="body2" color="grey.600">
                Doubtful
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Positive Results (Most Important) */}
      {positive.length > 0 && (
        <Paper sx={{ p: 2, mb: 2, border: '2px solid', borderColor: 'error.main' }}>
          <Typography variant="h6" color="error.main" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PositiveIcon />
            Positive Reactions ({positive.length})
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            These allergens have elicited a true allergic response. Patient should avoid contact.
          </Typography>

          {positive.map((result) => (
            <Accordion key={result.id} defaultExpanded={showDetails}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                  <Typography fontWeight="bold">{result.allergenName}</Typography>
                  <ReadingBadge value={getFinalReading(result)} size="small" />
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Box sx={{ pl: 2 }}>
                  {result.reading48hr !== 'not_read' && (
                    <Typography variant="body2" sx={{ mb: 1 }}>
                      <strong>48hr:</strong> {READING_DEFINITIONS[result.reading48hr].label}
                    </Typography>
                  )}
                  {result.reading96hr !== 'not_read' && (
                    <Typography variant="body2" sx={{ mb: 1 }}>
                      <strong>96hr:</strong> {READING_DEFINITIONS[result.reading96hr].label}
                    </Typography>
                  )}

                  {result.crossReactors.length > 0 && (
                    <Box sx={{ mb: 1 }}>
                      <Typography variant="body2" fontWeight="bold">
                        Cross-Reactors:
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {result.crossReactors.map((cr) => (
                          <Chip key={cr} label={cr} size="small" variant="outlined" color="warning" />
                        ))}
                      </Box>
                    </Box>
                  )}

                  {result.commonSources.length > 0 && (
                    <Box sx={{ mb: 1 }}>
                      <Typography variant="body2" fontWeight="bold">
                        Common Sources:
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {result.commonSources.map((source) => (
                          <Chip key={source} label={source} size="small" variant="outlined" />
                        ))}
                      </Box>
                    </Box>
                  )}

                  {result.avoidanceInstructions && (
                    <Box>
                      <Typography variant="body2" fontWeight="bold">
                        Avoidance Instructions:
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {result.avoidanceInstructions}
                      </Typography>
                    </Box>
                  )}
                </Box>
              </AccordionDetails>
            </Accordion>
          ))}
        </Paper>
      )}

      {/* Irritant Reactions */}
      {irritant.length > 0 && (
        <Paper sx={{ p: 2, mb: 2, border: '1px solid', borderColor: 'warning.main' }}>
          <Typography variant="h6" color="warning.main" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <WarningIcon />
            Irritant Reactions ({irritant.length})
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            These are irritant reactions, not true allergies. May not require strict avoidance.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {irritant.map((result) => (
              <Chip
                key={result.id}
                label={result.allergenName}
                color="warning"
                variant="outlined"
              />
            ))}
          </Box>
        </Paper>
      )}

      {/* Doubtful Reactions */}
      {doubtful.length > 0 && (
        <Paper sx={{ p: 2, mb: 2, border: '1px solid', borderColor: 'grey.400' }}>
          <Typography variant="h6" color="grey.700" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <DoubtfulIcon />
            Doubtful Reactions ({doubtful.length})
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            These reactions are equivocal. Consider repeat testing if clinically relevant.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {doubtful.map((result) => (
              <Chip
                key={result.id}
                label={result.allergenName}
                variant="outlined"
              />
            ))}
          </Box>
        </Paper>
      )}

      {/* Negative Results (Collapsed by default) */}
      {negative.length > 0 && showDetails && (
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6" color="success.main" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <NegativeIcon />
              Negative Reactions ({negative.length})
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {negative.map((result) => (
                <Chip
                  key={result.id}
                  label={result.allergenName}
                  color="success"
                  variant="outlined"
                  size="small"
                />
              ))}
            </Box>
          </AccordionDetails>
        </Accordion>
      )}

      {/* No Positive Results Message */}
      {positive.length === 0 && (
        <Paper sx={{ p: 3, textAlign: 'center', bgcolor: 'success.50' }}>
          <NegativeIcon sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
          <Typography variant="h6" color="success.main">
            No Positive Reactions
          </Typography>
          <Typography variant="body2" color="text.secondary">
            The tested allergens are unlikely to be contributing to this patient's contact dermatitis.
          </Typography>
        </Paper>
      )}
    </Box>
  );
};

export default ResultsSummary;
