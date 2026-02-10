/**
 * PanelSelector Component
 * Allows selection of patch test panels for a testing session
 */

import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Checkbox,
  Chip,
  FormControlLabel,
  Grid,
  Typography,
  Tooltip,
} from '@mui/material';
import {
  Science as ScienceIcon,
  LocalOffer as TagIcon,
} from '@mui/icons-material';

export interface Panel {
  id: string;
  name: string;
  description: string;
  panel_type: string;
  is_standard: boolean;
  allergen_count: number;
  allergens: Array<{
    position: number;
    allergen_id: string;
    name: string;
  }>;
}

interface PanelSelectorProps {
  panels: Panel[];
  selectedPanelIds: string[];
  onSelectionChange: (panelIds: string[]) => void;
  disabled?: boolean;
}

const PANEL_TYPE_LABELS: Record<string, string> = {
  true_test: 'Standard Screening',
  na_standard: 'North American Standard',
  cosmetic: 'Cosmetic Series',
  metal: 'Metal Series',
  rubber: 'Rubber/Adhesive Series',
  preservative: 'Preservative Series',
  custom: 'Custom Panel',
};

const PANEL_TYPE_COLORS: Record<string, 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info'> = {
  true_test: 'primary',
  na_standard: 'info',
  cosmetic: 'secondary',
  metal: 'warning',
  rubber: 'error',
  preservative: 'success',
  custom: 'info',
};

const PanelSelector: React.FC<PanelSelectorProps> = ({
  panels,
  selectedPanelIds,
  onSelectionChange,
  disabled = false,
}) => {
  const handlePanelToggle = (panelId: string) => {
    if (selectedPanelIds.includes(panelId)) {
      onSelectionChange(selectedPanelIds.filter((id) => id !== panelId));
    } else {
      onSelectionChange([...selectedPanelIds, panelId]);
    }
  };

  const getTotalAllergenCount = (): number => {
    const selectedPanels = panels.filter((p) => selectedPanelIds.includes(p.id));
    const uniqueAllergens = new Set<string>();
    selectedPanels.forEach((panel) => {
      panel.allergens?.forEach((a) => uniqueAllergens.add(a.allergen_id));
    });
    return uniqueAllergens.size;
  };

  return (
    <Box>
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ScienceIcon />
          Select Test Panels
        </Typography>
        {selectedPanelIds.length > 0 && (
          <Chip
            icon={<TagIcon />}
            label={`${selectedPanelIds.length} panel(s), ${getTotalAllergenCount()} unique allergens`}
            color="primary"
            variant="outlined"
          />
        )}
      </Box>

      <Grid container spacing={2}>
        {panels.map((panel) => {
          const isSelected = selectedPanelIds.includes(panel.id);
          const panelType = panel.panel_type || 'custom';

          return (
            <Grid item xs={12} md={6} key={panel.id}>
              <Card
                variant={isSelected ? 'elevation' : 'outlined'}
                sx={{
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.6 : 1,
                  borderColor: isSelected ? 'primary.main' : 'divider',
                  borderWidth: isSelected ? 2 : 1,
                  transition: 'all 0.2s',
                  '&:hover': {
                    borderColor: disabled ? undefined : 'primary.main',
                    boxShadow: disabled ? undefined : 2,
                  },
                }}
                onClick={() => !disabled && handlePanelToggle(panel.id)}
              >
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={isSelected}
                          disabled={disabled}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => handlePanelToggle(panel.id)}
                        />
                      }
                      label=""
                      sx={{ mr: 0 }}
                    />
                    <Box sx={{ flex: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <Typography variant="subtitle1" fontWeight="bold">
                          {panel.name}
                        </Typography>
                        {panel.is_standard && (
                          <Chip label="Standard" size="small" color="success" variant="outlined" />
                        )}
                      </Box>

                      <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                        <Chip
                          label={PANEL_TYPE_LABELS[panelType] || panelType}
                          size="small"
                          color={PANEL_TYPE_COLORS[panelType] || 'info'}
                          variant="outlined"
                        />
                        <Chip
                          label={`${panel.allergen_count} allergens`}
                          size="small"
                          variant="outlined"
                        />
                      </Box>

                      {panel.description && (
                        <Typography variant="body2" color="text.secondary">
                          {panel.description}
                        </Typography>
                      )}

                      {panel.allergens && panel.allergens.length > 0 && (
                        <Tooltip
                          title={
                            <Box>
                              {panel.allergens.slice(0, 10).map((a) => (
                                <Typography key={a.allergen_id} variant="body2">
                                  {a.position}. {a.name}
                                </Typography>
                              ))}
                              {panel.allergens.length > 10 && (
                                <Typography variant="body2" fontStyle="italic">
                                  ...and {panel.allergens.length - 10} more
                                </Typography>
                              )}
                            </Box>
                          }
                          placement="right"
                        >
                          <Typography
                            variant="caption"
                            color="primary"
                            sx={{ cursor: 'help', textDecoration: 'underline' }}
                          >
                            View allergen list
                          </Typography>
                        </Tooltip>
                      )}
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {panels.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="body1" color="text.secondary">
            No panels available. Contact your administrator to set up test panels.
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default PanelSelector;
