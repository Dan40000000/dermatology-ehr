import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Divider,
  Grid,
  Alert,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Paper,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  Psychology as AIIcon,
  ExpandMore as ExpandMoreIcon,
  CheckCircle as CheckIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Lightbulb as RecommendationIcon,
  Timeline as TimelineIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import type { AIAnalysisResult } from './AIAnalysisButton';
import RiskBadge from './RiskBadge';
import DifferentialList from './DifferentialList';
import ABCDEAutoScore from './ABCDEAutoScore';

interface AIAnalysisResultsProps {
  analysis: AIAnalysisResult;
  showFullDetails?: boolean;
}

const AIAnalysisResults: React.FC<AIAnalysisResultsProps> = ({
  analysis,
  showFullDetails = true,
}) => {
  const getClassificationIcon = () => {
    switch (analysis.primaryClassification) {
      case 'benign':
        return <CheckIcon color="success" />;
      case 'suspicious':
        return <WarningIcon color="warning" />;
      case 'likely_malignant':
        return <ErrorIcon color="error" />;
      default:
        return <AIIcon color="primary" />;
    }
  };

  const getClassificationColor = (): 'success' | 'warning' | 'error' => {
    switch (analysis.primaryClassification) {
      case 'benign':
        return 'success';
      case 'suspicious':
        return 'warning';
      case 'likely_malignant':
        return 'error';
      default:
        return 'warning';
    }
  };

  const formatClassification = (classification: string): string => {
    return classification
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <Card>
      <CardContent>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <AIIcon color="primary" />
          <Typography variant="h6">AI Lesion Analysis</Typography>
          <Box sx={{ flexGrow: 1 }} />
          <RiskBadge riskLevel={analysis.riskLevel} size="medium" />
        </Box>

        {/* Disclaimer */}
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="body2">
            <strong>AI Assistance Only:</strong> {analysis.disclaimer}
          </Typography>
        </Alert>

        {/* Summary Section */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} md={6}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                {getClassificationIcon()}
                <Typography variant="subtitle1" fontWeight="bold">
                  Primary Classification
                </Typography>
              </Box>
              <Chip
                label={formatClassification(analysis.primaryClassification)}
                color={getClassificationColor()}
                sx={{ mb: 1 }}
              />
              <Typography variant="body2" color="text.secondary">
                Confidence: {(analysis.classificationConfidence * 100).toFixed(1)}%
              </Typography>
            </Paper>
          </Grid>

          <Grid item xs={12} md={6}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <TimelineIcon color="primary" />
                <Typography variant="subtitle1" fontWeight="bold">
                  Recommended Action
                </Typography>
              </Box>
              <Chip
                label={formatClassification(analysis.recommendedAction)}
                color={
                  analysis.recommendedAction === 'urgent_referral'
                    ? 'error'
                    : analysis.recommendedAction === 'biopsy'
                    ? 'warning'
                    : 'default'
                }
                sx={{ mb: 1 }}
              />
              {analysis.followUpInterval && (
                <Typography variant="body2" color="text.secondary">
                  Follow-up: {analysis.followUpInterval.replace('_', ' ')}
                </Typography>
              )}
            </Paper>
          </Grid>
        </Grid>

        {/* AI Summary */}
        <Paper variant="outlined" sx={{ p: 2, mb: 3, bgcolor: 'action.hover' }}>
          <Typography variant="subtitle2" color="primary" gutterBottom>
            AI Summary
          </Typography>
          <Typography variant="body2">{analysis.aiSummary}</Typography>
        </Paper>

        {/* Risk Factors */}
        {analysis.riskFactors.length > 0 && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" color="error" gutterBottom>
              Identified Risk Factors
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {analysis.riskFactors.map((factor, index) => (
                <Chip
                  key={index}
                  label={factor}
                  size="small"
                  color="error"
                  variant="outlined"
                  icon={<WarningIcon />}
                />
              ))}
            </Box>
          </Box>
        )}

        <Divider sx={{ my: 2 }} />

        {showFullDetails && (
          <>
            {/* ABCDE Scores */}
            <Accordion defaultExpanded>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle1" fontWeight="bold">
                  ABCDE Feature Scores
                </Typography>
                <Chip
                  label={`Total: ${analysis.featureScores.total_score}/15`}
                  size="small"
                  color={
                    analysis.featureScores.total_score >= 10
                      ? 'error'
                      : analysis.featureScores.total_score >= 5
                      ? 'warning'
                      : 'success'
                  }
                  sx={{ ml: 2 }}
                />
              </AccordionSummary>
              <AccordionDetails>
                <ABCDEAutoScore scores={analysis.featureScores} />
              </AccordionDetails>
            </Accordion>

            {/* Differential Diagnoses */}
            <Accordion defaultExpanded>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle1" fontWeight="bold">
                  Differential Diagnoses
                </Typography>
                <Chip
                  label={`${analysis.differentialDiagnoses.length} possibilities`}
                  size="small"
                  sx={{ ml: 2 }}
                />
              </AccordionSummary>
              <AccordionDetails>
                <DifferentialList diagnoses={analysis.differentialDiagnoses} />
              </AccordionDetails>
            </Accordion>

            {/* Dermoscopy Patterns (if applicable) */}
            {analysis.dermoscopyPatterns.is_dermoscopic && (
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="subtitle1" fontWeight="bold">
                    Dermoscopy Patterns
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2}>
                    {analysis.dermoscopyPatterns.global_pattern && (
                      <Grid item xs={6}>
                        <Typography variant="body2" color="text.secondary">
                          Global Pattern
                        </Typography>
                        <Typography variant="body1">
                          {analysis.dermoscopyPatterns.global_pattern}
                        </Typography>
                      </Grid>
                    )}
                    {analysis.dermoscopyPatterns.pigment_network && (
                      <Grid item xs={6}>
                        <Typography variant="body2" color="text.secondary">
                          Pigment Network
                        </Typography>
                        <Typography variant="body1">
                          {analysis.dermoscopyPatterns.pigment_network}
                        </Typography>
                      </Grid>
                    )}
                    {analysis.dermoscopyPatterns.local_features.length > 0 && (
                      <Grid item xs={12}>
                        <Typography variant="body2" color="text.secondary">
                          Local Features
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                          {analysis.dermoscopyPatterns.local_features.map((feature, index) => (
                            <Chip key={index} label={feature} size="small" />
                          ))}
                        </Box>
                      </Grid>
                    )}
                    {analysis.dermoscopyPatterns.blue_white_veil && (
                      <Grid item xs={6}>
                        <Chip label="Blue-White Veil Present" color="warning" size="small" />
                      </Grid>
                    )}
                    {analysis.dermoscopyPatterns.regression_structures && (
                      <Grid item xs={6}>
                        <Chip label="Regression Structures" color="warning" size="small" />
                      </Grid>
                    )}
                  </Grid>
                </AccordionDetails>
              </Accordion>
            )}

            {/* Recommendations */}
            <Accordion defaultExpanded>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle1" fontWeight="bold">
                  Recommendations
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <List dense>
                  {analysis.recommendations.map((rec, index) => (
                    <ListItem key={index}>
                      <ListItemIcon>
                        <RecommendationIcon color="primary" fontSize="small" />
                      </ListItemIcon>
                      <ListItemText primary={rec} />
                    </ListItem>
                  ))}
                </List>
              </AccordionDetails>
            </Accordion>
          </>
        )}

        {/* Metadata */}
        <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary">
            Analysis ID: {analysis.id} | Model: {analysis.modelVersion} |
            Analyzed: {format(new Date(analysis.analysisDate), 'MMM d, yyyy h:mm a')} |
            Overall Confidence: {(analysis.confidenceScore * 100).toFixed(1)}%
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

export default AIAnalysisResults;
