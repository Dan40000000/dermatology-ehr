/**
 * AvoidanceList Component
 * Patient-friendly avoidance instructions for positive allergens
 */

import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Paper,
  Typography,
  Alert,
  AlertTitle,
} from '@mui/material';
import {
  Block as BlockIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  CheckCircle as SafeIcon,
  LocalOffer as ProductIcon,
  SwapHoriz as CrossReactorIcon,
} from '@mui/icons-material';

export interface AvoidanceItem {
  allergen: string;
  sources: string[];
  instructions: string;
  crossReactors?: string[];
}

interface AvoidanceListProps {
  items: AvoidanceItem[];
  patientName?: string;
  showPatientInstructions?: boolean;
}

const AvoidanceList: React.FC<AvoidanceListProps> = ({
  items,
  patientName,
  showPatientInstructions = true,
}) => {
  if (items.length === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center', bgcolor: 'success.50' }}>
        <SafeIcon sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
        <Typography variant="h6" color="success.main">
          No Allergens to Avoid
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Based on the test results, no specific avoidance instructions are needed.
        </Typography>
      </Paper>
    );
  }

  return (
    <Box>
      {showPatientInstructions && (
        <Alert severity="info" sx={{ mb: 3 }}>
          <AlertTitle>
            Allergen Avoidance Guide{patientName ? ` for ${patientName}` : ''}
          </AlertTitle>
          <Typography variant="body2">
            Based on your patch test results, please avoid the following allergens to prevent
            allergic contact dermatitis reactions. Always read product labels carefully and ask
            manufacturers about ingredients if unsure.
          </Typography>
        </Alert>
      )}

      <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <BlockIcon color="error" />
        Allergens to Avoid ({items.length})
      </Typography>

      {items.map((item, index) => (
        <Card key={item.allergen} sx={{ mb: 2, border: '1px solid', borderColor: 'error.200' }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <WarningIcon color="error" />
              <Typography variant="h6" color="error.main">
                {item.allergen}
              </Typography>
            </Box>

            {/* Common Sources */}
            {item.sources.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography
                  variant="subtitle2"
                  gutterBottom
                  sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                >
                  <ProductIcon fontSize="small" color="action" />
                  Common Sources - Check These Products:
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', pl: 3 }}>
                  {item.sources.map((source) => (
                    <Chip
                      key={source}
                      label={source}
                      size="small"
                      variant="outlined"
                      color="error"
                    />
                  ))}
                </Box>
              </Box>
            )}

            {/* Cross-Reactors */}
            {item.crossReactors && item.crossReactors.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography
                  variant="subtitle2"
                  gutterBottom
                  sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                >
                  <CrossReactorIcon fontSize="small" color="action" />
                  May Also React To:
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', pl: 3 }}>
                  {item.crossReactors.map((cr) => (
                    <Chip key={cr} label={cr} size="small" variant="outlined" color="warning" />
                  ))}
                </Box>
              </Box>
            )}

            {/* Avoidance Instructions */}
            {item.instructions && (
              <Box sx={{ bgcolor: 'grey.50', p: 2, borderRadius: 1 }}>
                <Typography
                  variant="subtitle2"
                  gutterBottom
                  sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                >
                  <InfoIcon fontSize="small" color="primary" />
                  How to Avoid:
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ pl: 3 }}>
                  {item.instructions}
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>
      ))}

      {/* General Tips */}
      {showPatientInstructions && (
        <Paper sx={{ p: 2, bgcolor: 'info.50', mt: 3 }}>
          <Typography variant="subtitle1" gutterBottom fontWeight="bold">
            General Tips for Allergen Avoidance:
          </Typography>
          <List dense>
            <ListItem>
              <ListItemIcon>
                <SafeIcon color="success" fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary="Always read ingredient labels before using any new product"
                secondary="Allergens may be listed under different names"
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <SafeIcon color="success" fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary="Keep a list of your allergens in your wallet or phone"
                secondary="Share this information with healthcare providers and pharmacists"
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <SafeIcon color="success" fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary="Contact manufacturers if ingredient information is unclear"
                secondary="Most companies have customer service lines to answer product questions"
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <SafeIcon color="success" fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary="Consider patch testing personal products before full use"
                secondary="Apply a small amount to inner arm and wait 48-72 hours"
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <SafeIcon color="success" fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary="Follow up with your dermatologist as recommended"
                secondary="New sensitivities can develop over time"
              />
            </ListItem>
          </List>
        </Paper>
      )}
    </Box>
  );
};

export default AvoidanceList;
