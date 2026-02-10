/**
 * BSA (Body Surface Area) Calculator Component
 * Interactive body diagram for calculating affected body surface area
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
  ToggleButton,
  ToggleButtonGroup,
  FormControlLabel,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Divider
} from '@mui/material';

export interface BSARegion {
  region_id: string;
  affected_percent: number;
}

export interface BSAComponents {
  method: 'palm' | 'rule_of_9s';
  is_child: boolean;
  affected_areas: BSARegion[];
  palm_count?: number;
}

export interface BSAScoreResult {
  score: number;
  interpretation: string;
  severity_level: string;
  component_breakdown?: {
    method: string;
    is_child: boolean;
    affected_areas: BSARegion[];
    palm_count?: number;
  };
}

interface BSACalculatorProps {
  value?: BSAComponents;
  onChange?: (value: BSAComponents) => void;
  onCalculate?: (result: BSAScoreResult) => void;
  readOnly?: boolean;
}

interface BodyRegion {
  id: string;
  name: string;
  adult_percent: number;
  child_percent: number;
}

const BODY_REGIONS: BodyRegion[] = [
  { id: 'head_neck', name: 'Head & Neck', adult_percent: 9, child_percent: 18 },
  { id: 'anterior_trunk', name: 'Anterior Trunk (Chest/Abdomen)', adult_percent: 18, child_percent: 18 },
  { id: 'posterior_trunk', name: 'Posterior Trunk (Back)', adult_percent: 18, child_percent: 18 },
  { id: 'right_arm', name: 'Right Arm', adult_percent: 9, child_percent: 9 },
  { id: 'left_arm', name: 'Left Arm', adult_percent: 9, child_percent: 9 },
  { id: 'right_leg', name: 'Right Leg', adult_percent: 18, child_percent: 14 },
  { id: 'left_leg', name: 'Left Leg', adult_percent: 18, child_percent: 14 },
  { id: 'perineum', name: 'Perineum/Genitalia', adult_percent: 1, child_percent: 1 }
];

const getSeverityColor = (percent: number): string => {
  if (percent === 0) return '#4caf50';
  if (percent < 3) return '#8bc34a';
  if (percent < 10) return '#ffeb3b';
  return '#f44336';
};

const getDefaultComponents = (): BSAComponents => ({
  method: 'rule_of_9s',
  is_child: false,
  affected_areas: BODY_REGIONS.map(r => ({ region_id: r.id, affected_percent: 0 })),
  palm_count: 0
});

export const BSACalculator: React.FC<BSACalculatorProps> = ({
  value,
  onChange,
  onCalculate,
  readOnly = false
}) => {
  const [components, setComponents] = useState<BSAComponents>(value || getDefaultComponents());
  const [calculatedResult, setCalculatedResult] = useState<BSAScoreResult | null>(null);
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    if (value) {
      setComponents(value);
    }
  }, [value]);

  const calculateBSA = useCallback((): BSAScoreResult => {
    let totalBSA = 0;

    if (components.method === 'palm') {
      totalBSA = components.palm_count || 0;
    } else {
      for (const area of components.affected_areas) {
        const region = BODY_REGIONS.find(r => r.id === area.region_id);
        if (region) {
          const maxPercent = components.is_child ? region.child_percent : region.adult_percent;
          totalBSA += (area.affected_percent / 100) * maxPercent;
        }
      }
    }

    totalBSA = Math.min(100, Math.max(0, totalBSA));
    const roundedScore = Math.round(totalBSA * 10) / 10;

    let interpretation: string;
    let severity_level: string;

    if (roundedScore === 0) {
      interpretation = 'Clear';
      severity_level = 'none';
    } else if (roundedScore < 3) {
      interpretation = 'Mild';
      severity_level = 'mild';
    } else if (roundedScore < 10) {
      interpretation = 'Moderate';
      severity_level = 'moderate';
    } else {
      interpretation = 'Severe';
      severity_level = 'severe';
    }

    return {
      score: roundedScore,
      interpretation,
      severity_level,
      component_breakdown: {
        method: components.method,
        is_child: components.is_child,
        affected_areas: components.affected_areas,
        palm_count: components.palm_count
      }
    };
  }, [components]);

  useEffect(() => {
    const result = calculateBSA();
    setCalculatedResult(result);
  }, [calculateBSA]);

  const handleMethodChange = (_: React.MouseEvent<HTMLElement>, newMethod: 'palm' | 'rule_of_9s' | null): void => {
    if (newMethod !== null) {
      const newComponents = { ...components, method: newMethod };
      setComponents(newComponents);
      onChange?.(newComponents);
    }
  };

  const handleChildToggle = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const newComponents = { ...components, is_child: event.target.checked };
    setComponents(newComponents);
    onChange?.(newComponents);
  };

  const handlePalmCountChange = (_: Event, newValue: number | number[]): void => {
    const newComponents = { ...components, palm_count: newValue as number };
    setComponents(newComponents);
    onChange?.(newComponents);
  };

  const handleRegionChange = (regionId: string, percent: number): void => {
    const newAreas = components.affected_areas.map(area =>
      area.region_id === regionId ? { ...area, affected_percent: percent } : area
    );
    const newComponents = { ...components, affected_areas: newAreas };
    setComponents(newComponents);
    onChange?.(newComponents);
  };

  const handleCalculate = (): void => {
    const result = calculateBSA();
    onCalculate?.(result);
  };

  const renderBodyDiagram = (): React.ReactNode => {
    return (
      <Box sx={{ position: 'relative', width: '100%', maxWidth: 300, mx: 'auto', my: 2 }}>
        <svg viewBox="0 0 200 350" style={{ width: '100%', height: 'auto' }}>
          {/* Head */}
          <circle
            cx="100"
            cy="30"
            r="25"
            fill={getRegionFillColor('head_neck')}
            stroke="#333"
            strokeWidth="1"
            style={{ cursor: 'pointer' }}
            onClick={() => handleRegionClick('head_neck')}
          />
          {/* Neck */}
          <rect
            x="90"
            y="55"
            width="20"
            height="15"
            fill={getRegionFillColor('head_neck')}
            stroke="#333"
            strokeWidth="1"
          />
          {/* Torso (anterior) */}
          <rect
            x="60"
            y="70"
            width="80"
            height="90"
            fill={getRegionFillColor('anterior_trunk')}
            stroke="#333"
            strokeWidth="1"
            style={{ cursor: 'pointer' }}
            onClick={() => handleRegionClick('anterior_trunk')}
          />
          {/* Left arm */}
          <rect
            x="20"
            y="75"
            width="35"
            height="80"
            rx="5"
            fill={getRegionFillColor('left_arm')}
            stroke="#333"
            strokeWidth="1"
            style={{ cursor: 'pointer' }}
            onClick={() => handleRegionClick('left_arm')}
          />
          {/* Right arm */}
          <rect
            x="145"
            y="75"
            width="35"
            height="80"
            rx="5"
            fill={getRegionFillColor('right_arm')}
            stroke="#333"
            strokeWidth="1"
            style={{ cursor: 'pointer' }}
            onClick={() => handleRegionClick('right_arm')}
          />
          {/* Left leg */}
          <rect
            x="60"
            y="165"
            width="35"
            height="120"
            rx="5"
            fill={getRegionFillColor('left_leg')}
            stroke="#333"
            strokeWidth="1"
            style={{ cursor: 'pointer' }}
            onClick={() => handleRegionClick('left_leg')}
          />
          {/* Right leg */}
          <rect
            x="105"
            y="165"
            width="35"
            height="120"
            rx="5"
            fill={getRegionFillColor('right_leg')}
            stroke="#333"
            strokeWidth="1"
            style={{ cursor: 'pointer' }}
            onClick={() => handleRegionClick('right_leg')}
          />
          {/* Perineum indicator */}
          <circle
            cx="100"
            cy="165"
            r="8"
            fill={getRegionFillColor('perineum')}
            stroke="#333"
            strokeWidth="1"
            style={{ cursor: 'pointer' }}
            onClick={() => handleRegionClick('perineum')}
          />
        </svg>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center' }}>
          Click regions to toggle or use sliders below
        </Typography>
      </Box>
    );
  };

  const getRegionFillColor = (regionId: string): string => {
    const area = components.affected_areas.find(a => a.region_id === regionId);
    const percent = area?.affected_percent || 0;
    if (percent === 0) return '#e8f5e9';
    if (percent < 25) return '#c8e6c9';
    if (percent < 50) return '#fff9c4';
    if (percent < 75) return '#ffcc80';
    return '#ef9a9a';
  };

  const handleRegionClick = (regionId: string): void => {
    if (readOnly) return;
    const area = components.affected_areas.find(a => a.region_id === regionId);
    const currentPercent = area?.affected_percent || 0;
    // Cycle through: 0 -> 25 -> 50 -> 75 -> 100 -> 0
    const newPercent = currentPercent >= 100 ? 0 : currentPercent + 25;
    handleRegionChange(regionId, newPercent);
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          BSA - Body Surface Area
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Calculate the percentage of body surface area affected by the condition
        </Typography>

        <Box sx={{ mb: 3 }}>
          <ToggleButtonGroup
            value={components.method}
            exclusive
            onChange={handleMethodChange}
            disabled={readOnly}
            sx={{ mb: 2 }}
          >
            <ToggleButton value="rule_of_9s">
              Rule of 9s
            </ToggleButton>
            <ToggleButton value="palm">
              Palm Method
            </ToggleButton>
          </ToggleButtonGroup>

          <FormControlLabel
            control={
              <Switch
                checked={components.is_child}
                onChange={handleChildToggle}
                disabled={readOnly}
              />
            }
            label="Pediatric patient (adjusted percentages)"
            sx={{ ml: 2 }}
          />
        </Box>

        {components.method === 'palm' ? (
          <Box sx={{ mb: 3 }}>
            <Alert severity="info" sx={{ mb: 2 }}>
              The palm method uses the patient&apos;s palm (including fingers) as approximately 1% of BSA.
              Count how many palm-sized areas are affected.
            </Alert>
            <Typography gutterBottom>
              Number of palm-sized areas affected: {components.palm_count}
            </Typography>
            <Slider
              value={components.palm_count || 0}
              onChange={handlePalmCountChange}
              min={0}
              max={100}
              step={1}
              marks={[
                { value: 0, label: '0' },
                { value: 25, label: '25' },
                { value: 50, label: '50' },
                { value: 75, label: '75' },
                { value: 100, label: '100' }
              ]}
              disabled={readOnly}
              valueLabelDisplay="auto"
            />
          </Box>
        ) : (
          <>
            {renderBodyDiagram()}

            <Divider sx={{ my: 2 }} />

            <Typography variant="subtitle1" gutterBottom>
              Body Region Involvement
            </Typography>

            <Grid container spacing={2}>
              {BODY_REGIONS.map(region => {
                const area = components.affected_areas.find(a => a.region_id === region.id);
                const percent = area?.affected_percent || 0;
                const maxBSA = components.is_child ? region.child_percent : region.adult_percent;

                return (
                  <Grid item xs={12} sm={6} key={region.id}>
                    <Box sx={{ p: 1, borderRadius: 1, border: '1px solid', borderColor: 'grey.300' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Typography variant="body2" fontWeight="medium">
                          {region.name}
                        </Typography>
                        <Chip
                          size="small"
                          label={`${maxBSA}% BSA`}
                          variant="outlined"
                        />
                      </Box>
                      <Slider
                        value={percent}
                        onChange={(_, newValue) => handleRegionChange(region.id, newValue as number)}
                        min={0}
                        max={100}
                        step={5}
                        disabled={readOnly}
                        valueLabelDisplay="auto"
                        valueLabelFormat={(v) => `${v}%`}
                        sx={{
                          color: getSeverityColor((percent / 100) * maxBSA)
                        }}
                      />
                      <Typography variant="caption" color="text.secondary">
                        {percent}% of region = {((percent / 100) * maxBSA).toFixed(1)}% BSA
                      </Typography>
                    </Box>
                  </Grid>
                );
              })}
            </Grid>
          </>
        )}

        {calculatedResult && (
          <>
            <Divider sx={{ my: 3 }} />

            <Alert
              severity={
                calculatedResult.score === 0 ? 'success' :
                calculatedResult.score < 3 ? 'info' :
                calculatedResult.score < 10 ? 'warning' : 'error'
              }
              sx={{ mb: 2 }}
            >
              <Typography variant="h5" component="div" sx={{ fontWeight: 'bold' }}>
                Total BSA: {calculatedResult.score}%
              </Typography>
              <Typography variant="body1">
                Interpretation: {calculatedResult.interpretation}
              </Typography>
            </Alert>

            {components.method === 'rule_of_9s' && (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Region</TableCell>
                    <TableCell align="center">Max BSA %</TableCell>
                    <TableCell align="center">Affected %</TableCell>
                    <TableCell align="center">Contribution</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {BODY_REGIONS.map(region => {
                    const area = components.affected_areas.find(a => a.region_id === region.id);
                    const percent = area?.affected_percent || 0;
                    const maxBSA = components.is_child ? region.child_percent : region.adult_percent;
                    const contribution = (percent / 100) * maxBSA;
                    return (
                      <TableRow key={region.id}>
                        <TableCell>{region.name}</TableCell>
                        <TableCell align="center">{maxBSA}%</TableCell>
                        <TableCell align="center">{percent}%</TableCell>
                        <TableCell align="center">{contribution.toFixed(1)}%</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
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

export default BSACalculator;
