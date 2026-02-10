/**
 * PASI (Psoriasis Area Severity Index) Calculator Component
 * Interactive form for calculating PASI scores
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Slider,
  Chip,
  Alert,
  Button,
  TextField,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Divider
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

export interface PASIRegionScore {
  erythema: number;
  induration: number;
  scaling: number;
  area: number;
}

export interface PASIComponents {
  head: PASIRegionScore;
  trunk: PASIRegionScore;
  upper_extremities: PASIRegionScore;
  lower_extremities: PASIRegionScore;
}

export interface PASIScoreResult {
  score: number;
  interpretation: string;
  severity_level: string;
  component_breakdown?: {
    head: { weight: number; severity_sum: number; area: number; subtotal: number };
    trunk: { weight: number; severity_sum: number; area: number; subtotal: number };
    upper_extremities: { weight: number; severity_sum: number; area: number; subtotal: number };
    lower_extremities: { weight: number; severity_sum: number; area: number; subtotal: number };
  };
}

interface PASICalculatorProps {
  value?: PASIComponents;
  onChange?: (value: PASIComponents) => void;
  onCalculate?: (result: PASIScoreResult) => void;
  readOnly?: boolean;
}

const REGIONS = [
  { id: 'head', name: 'Head', weight: 0.1, bodySurfacePercent: 10 },
  { id: 'trunk', name: 'Trunk', weight: 0.2, bodySurfacePercent: 30 },
  { id: 'upper_extremities', name: 'Upper Extremities', weight: 0.2, bodySurfacePercent: 20 },
  { id: 'lower_extremities', name: 'Lower Extremities', weight: 0.4, bodySurfacePercent: 40 }
] as const;

const SEVERITY_LABELS = ['None', 'Mild', 'Moderate', 'Severe', 'Very Severe'];
const AREA_LABELS = ['0%', '1-9%', '10-29%', '30-49%', '50-69%', '70-89%', '90-100%'];

const getDefaultScores = (): PASIComponents => ({
  head: { erythema: 0, induration: 0, scaling: 0, area: 0 },
  trunk: { erythema: 0, induration: 0, scaling: 0, area: 0 },
  upper_extremities: { erythema: 0, induration: 0, scaling: 0, area: 0 },
  lower_extremities: { erythema: 0, induration: 0, scaling: 0, area: 0 }
});

const getSeverityColor = (score: number): string => {
  if (score === 0) return '#4caf50';
  if (score < 5) return '#8bc34a';
  if (score < 10) return '#ffeb3b';
  if (score < 20) return '#ff9800';
  return '#f44336';
};

export const PASICalculator: React.FC<PASICalculatorProps> = ({
  value,
  onChange,
  onCalculate,
  readOnly = false
}) => {
  const [scores, setScores] = useState<PASIComponents>(value || getDefaultScores());
  const [calculatedResult, setCalculatedResult] = useState<PASIScoreResult | null>(null);
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    if (value) {
      setScores(value);
    }
  }, [value]);

  const calculatePASI = useCallback((): PASIScoreResult => {
    const { head, trunk, upper_extremities, lower_extremities } = scores;

    const headScore = (head.erythema + head.induration + head.scaling) * head.area;
    const trunkScore = (trunk.erythema + trunk.induration + trunk.scaling) * trunk.area;
    const upperScore = (upper_extremities.erythema + upper_extremities.induration + upper_extremities.scaling) * upper_extremities.area;
    const lowerScore = (lower_extremities.erythema + lower_extremities.induration + lower_extremities.scaling) * lower_extremities.area;

    const totalScore = 0.1 * headScore + 0.2 * trunkScore + 0.2 * upperScore + 0.4 * lowerScore;
    const roundedScore = Math.round(totalScore * 10) / 10;

    let interpretation: string;
    let severity_level: string;

    if (roundedScore === 0) {
      interpretation = 'Clear';
      severity_level = 'none';
    } else if (roundedScore < 5) {
      interpretation = 'Mild';
      severity_level = 'mild';
    } else if (roundedScore < 10) {
      interpretation = 'Moderate';
      severity_level = 'moderate';
    } else if (roundedScore < 20) {
      interpretation = 'Severe';
      severity_level = 'severe';
    } else {
      interpretation = 'Very Severe';
      severity_level = 'very_severe';
    }

    return {
      score: roundedScore,
      interpretation,
      severity_level,
      component_breakdown: {
        head: { weight: 0.1, severity_sum: head.erythema + head.induration + head.scaling, area: head.area, subtotal: headScore },
        trunk: { weight: 0.2, severity_sum: trunk.erythema + trunk.induration + trunk.scaling, area: trunk.area, subtotal: trunkScore },
        upper_extremities: { weight: 0.2, severity_sum: upper_extremities.erythema + upper_extremities.induration + upper_extremities.scaling, area: upper_extremities.area, subtotal: upperScore },
        lower_extremities: { weight: 0.4, severity_sum: lower_extremities.erythema + lower_extremities.induration + lower_extremities.scaling, area: lower_extremities.area, subtotal: lowerScore }
      }
    };
  }, [scores]);

  useEffect(() => {
    const result = calculatePASI();
    setCalculatedResult(result);
  }, [calculatePASI]);

  const handleScoreChange = (
    region: keyof PASIComponents,
    factor: keyof PASIRegionScore,
    newValue: number
  ): void => {
    const newScores = {
      ...scores,
      [region]: {
        ...scores[region],
        [factor]: newValue
      }
    };
    setScores(newScores);
    onChange?.(newScores);
  };

  const handleCalculate = (): void => {
    const result = calculatePASI();
    onCalculate?.(result);
  };

  const renderRegionCard = (
    regionId: keyof PASIComponents,
    regionName: string,
    weight: number
  ): React.ReactNode => {
    const regionScores = scores[regionId];
    const severitySum = regionScores.erythema + regionScores.induration + regionScores.scaling;
    const regionTotal = severitySum * regionScores.area * weight;

    return (
      <Accordion key={regionId} defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
            <Typography variant="subtitle1" fontWeight="medium">
              {regionName}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Weight: {(weight * 100).toFixed(0)}%
              </Typography>
              <Chip
                size="small"
                label={`${regionTotal.toFixed(1)}`}
                sx={{ backgroundColor: getSeverityColor(regionTotal), color: regionTotal < 10 ? 'text.primary' : 'white' }}
              />
            </Box>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6} md={3}>
              <Typography gutterBottom>Erythema (Redness): {regionScores.erythema}</Typography>
              <Slider
                value={regionScores.erythema}
                onChange={(_, newValue) => handleScoreChange(regionId, 'erythema', newValue as number)}
                min={0}
                max={4}
                step={1}
                marks
                disabled={readOnly}
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => SEVERITY_LABELS[v] ?? ''}
              />
              <Typography variant="caption" color="text.secondary">
                {SEVERITY_LABELS[regionScores.erythema]}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Typography gutterBottom>Induration (Thickness): {regionScores.induration}</Typography>
              <Slider
                value={regionScores.induration}
                onChange={(_, newValue) => handleScoreChange(regionId, 'induration', newValue as number)}
                min={0}
                max={4}
                step={1}
                marks
                disabled={readOnly}
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => SEVERITY_LABELS[v] ?? ''}
              />
              <Typography variant="caption" color="text.secondary">
                {SEVERITY_LABELS[regionScores.induration]}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Typography gutterBottom>Scaling: {regionScores.scaling}</Typography>
              <Slider
                value={regionScores.scaling}
                onChange={(_, newValue) => handleScoreChange(regionId, 'scaling', newValue as number)}
                min={0}
                max={4}
                step={1}
                marks
                disabled={readOnly}
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => SEVERITY_LABELS[v] ?? ''}
              />
              <Typography variant="caption" color="text.secondary">
                {SEVERITY_LABELS[regionScores.scaling]}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Typography gutterBottom>Area Affected: {regionScores.area}</Typography>
              <Slider
                value={regionScores.area}
                onChange={(_, newValue) => handleScoreChange(regionId, 'area', newValue as number)}
                min={0}
                max={6}
                step={1}
                marks
                disabled={readOnly}
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => AREA_LABELS[v] ?? ''}
              />
              <Typography variant="caption" color="text.secondary">
                {AREA_LABELS[regionScores.area]}
              </Typography>
            </Grid>
          </Grid>
        </AccordionDetails>
      </Accordion>
    );
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          PASI - Psoriasis Area Severity Index
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Assess erythema, induration, and scaling (0-4) plus area involvement (0-6) for each body region
        </Typography>

        <Box sx={{ mb: 3 }}>
          {REGIONS.map(region =>
            renderRegionCard(region.id, region.name, region.weight)
          )}
        </Box>

        {calculatedResult && (
          <>
            <Divider sx={{ my: 2 }} />

            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" gutterBottom>Score Summary</Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Region</TableCell>
                    <TableCell align="center">Weight</TableCell>
                    <TableCell align="center">Severity Sum</TableCell>
                    <TableCell align="center">Area</TableCell>
                    <TableCell align="center">Subtotal</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {REGIONS.map(region => {
                    const breakdown = calculatedResult.component_breakdown?.[region.id];
                    return (
                      <TableRow key={region.id}>
                        <TableCell>{region.name}</TableCell>
                        <TableCell align="center">{breakdown?.weight}</TableCell>
                        <TableCell align="center">{breakdown?.severity_sum}</TableCell>
                        <TableCell align="center">{breakdown?.area}</TableCell>
                        <TableCell align="center">{breakdown?.subtotal.toFixed(1)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>

            <Alert
              severity={
                calculatedResult.score === 0 ? 'success' :
                calculatedResult.score < 5 ? 'info' :
                calculatedResult.score < 10 ? 'warning' : 'error'
              }
              sx={{ mb: 2 }}
            >
              <Typography variant="h5" component="div" sx={{ fontWeight: 'bold' }}>
                PASI Score: {calculatedResult.score}
              </Typography>
              <Typography variant="body1">
                Interpretation: {calculatedResult.interpretation}
              </Typography>
            </Alert>

            <Box sx={{ mb: 2, p: 2, backgroundColor: 'grey.100', borderRadius: 1 }}>
              <Typography variant="caption" display="block" gutterBottom>
                <strong>Formula:</strong> 0.1(Eh+Ih+Sh)Ah + 0.2(Et+It+St)At + 0.2(Eu+Iu+Su)Au + 0.4(El+Il+Sl)Al
              </Typography>
              <Typography variant="caption" color="text.secondary">
                E=Erythema, I=Induration, S=Scaling, A=Area; h=head, t=trunk, u=upper, l=lower
              </Typography>
            </Box>
          </>
        )}

        {!readOnly && (
          <>
            <TextField
              fullWidth
              multiline
              rows={2}
              label="Clinical Notes (Optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any relevant clinical observations..."
              sx={{ mt: 2 }}
            />

            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="contained"
                onClick={handleCalculate}
              >
                Save Assessment
              </Button>
            </Box>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default PASICalculator;
