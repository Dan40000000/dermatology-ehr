import React, { useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControlLabel,
  Switch,
  Rating,
  Typography,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Alert,
  Divider,
} from '@mui/material';
import {
  Feedback as FeedbackIcon,
  ThumbUp as AccurateIcon,
  ThumbDown as InaccurateIcon,
} from '@mui/icons-material';
import toast from 'react-hot-toast';
import { API_BASE_URL, TENANT_HEADER_NAME } from '../../api';

interface FeedbackFormProps {
  analysisId: string;
  primaryClassification: string;
  riskLevel: string;
  onFeedbackSubmitted?: () => void;
}

interface FeedbackData {
  wasAccurate: boolean;
  accuracyRating: number;
  actualDiagnosis: string;
  actualIcd10Code: string;
  classificationWasCorrect: boolean;
  correctClassification: string;
  riskAssessmentWasCorrect: boolean;
  correctRiskLevel: string;
  abcdeScoringAccuracy: number;
  feedbackNotes: string;
  missedFeatures: string[];
  falsePositiveFeatures: string[];
  biopsyPerformed: boolean;
  biopsyResult: string;
  finalPathology: string;
}

const FeedbackForm: React.FC<FeedbackFormProps> = ({
  analysisId,
  primaryClassification,
  riskLevel,
  onFeedbackSubmitted,
}) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackData>({
    wasAccurate: true,
    accuracyRating: 4,
    actualDiagnosis: '',
    actualIcd10Code: '',
    classificationWasCorrect: true,
    correctClassification: '',
    riskAssessmentWasCorrect: true,
    correctRiskLevel: '',
    abcdeScoringAccuracy: 4,
    feedbackNotes: '',
    missedFeatures: [],
    falsePositiveFeatures: [],
    biopsyPerformed: false,
    biopsyResult: '',
    finalPathology: '',
  });

  const [newMissedFeature, setNewMissedFeature] = useState('');
  const [newFalsePositive, setNewFalsePositive] = useState('');

  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  const handleSubmit = async () => {
    setLoading(true);

    try {
      const tenantId = localStorage.getItem('tenantId') || '';
      const token = localStorage.getItem('accessToken') || '';

      const response = await fetch(
        `${API_BASE_URL}/api/ai-lesion-analysis/${analysisId}/feedback`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            [TENANT_HEADER_NAME]: tenantId,
          },
          body: JSON.stringify(feedback),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to submit feedback');
      }

      toast.success('Feedback submitted successfully');
      handleClose();

      if (onFeedbackSubmitted) {
        onFeedbackSubmitted();
      }
    } catch (error) {
      console.error('Submit Feedback Error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to submit feedback');
    } finally {
      setLoading(false);
    }
  };

  const addMissedFeature = () => {
    if (newMissedFeature.trim()) {
      setFeedback((prev) => ({
        ...prev,
        missedFeatures: [...prev.missedFeatures, newMissedFeature.trim()],
      }));
      setNewMissedFeature('');
    }
  };

  const addFalsePositive = () => {
    if (newFalsePositive.trim()) {
      setFeedback((prev) => ({
        ...prev,
        falsePositiveFeatures: [...prev.falsePositiveFeatures, newFalsePositive.trim()],
      }));
      setNewFalsePositive('');
    }
  };

  const removeMissedFeature = (index: number) => {
    setFeedback((prev) => ({
      ...prev,
      missedFeatures: prev.missedFeatures.filter((_, i) => i !== index),
    }));
  };

  const removeFalsePositive = (index: number) => {
    setFeedback((prev) => ({
      ...prev,
      falsePositiveFeatures: prev.falsePositiveFeatures.filter((_, i) => i !== index),
    }));
  };

  return (
    <>
      <Button
        variant="outlined"
        color="primary"
        startIcon={<FeedbackIcon />}
        onClick={handleOpen}
        size="small"
      >
        Provide Feedback
      </Button>

      <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <FeedbackIcon color="primary" />
          AI Analysis Feedback
        </DialogTitle>

        <DialogContent dividers>
          <Alert severity="info" sx={{ mb: 3 }}>
            Your feedback helps improve AI accuracy. All feedback is recorded for model training
            and quality improvement.
          </Alert>

          {/* Overall Accuracy */}
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
            Overall Accuracy Assessment
          </Typography>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography>Was the AI analysis accurate?</Typography>
                <Button
                  variant={feedback.wasAccurate ? 'contained' : 'outlined'}
                  color="success"
                  startIcon={<AccurateIcon />}
                  onClick={() => setFeedback((prev) => ({ ...prev, wasAccurate: true }))}
                  size="small"
                >
                  Accurate
                </Button>
                <Button
                  variant={!feedback.wasAccurate ? 'contained' : 'outlined'}
                  color="error"
                  startIcon={<InaccurateIcon />}
                  onClick={() => setFeedback((prev) => ({ ...prev, wasAccurate: false }))}
                  size="small"
                >
                  Inaccurate
                </Button>
              </Box>
            </Grid>

            <Grid item xs={12} sm={6}>
              <Typography component="legend">Overall Accuracy Rating</Typography>
              <Rating
                value={feedback.accuracyRating}
                onChange={(_, value) =>
                  setFeedback((prev) => ({ ...prev, accuracyRating: value || 3 }))
                }
                size="large"
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <Typography component="legend">ABCDE Scoring Accuracy</Typography>
              <Rating
                value={feedback.abcdeScoringAccuracy}
                onChange={(_, value) =>
                  setFeedback((prev) => ({ ...prev, abcdeScoringAccuracy: value || 3 }))
                }
                size="large"
              />
            </Grid>
          </Grid>

          <Divider sx={{ my: 2 }} />

          {/* Classification Accuracy */}
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
            Classification Assessment
          </Typography>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={feedback.classificationWasCorrect}
                    onChange={(e) =>
                      setFeedback((prev) => ({
                        ...prev,
                        classificationWasCorrect: e.target.checked,
                      }))
                    }
                  />
                }
                label={`Classification "${primaryClassification}" was correct`}
              />
            </Grid>

            {!feedback.classificationWasCorrect && (
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Correct Classification</InputLabel>
                  <Select
                    value={feedback.correctClassification}
                    label="Correct Classification"
                    onChange={(e) =>
                      setFeedback((prev) => ({
                        ...prev,
                        correctClassification: e.target.value,
                      }))
                    }
                  >
                    <MenuItem value="benign">Benign</MenuItem>
                    <MenuItem value="suspicious">Suspicious</MenuItem>
                    <MenuItem value="likely_malignant">Likely Malignant</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            )}

            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={feedback.riskAssessmentWasCorrect}
                    onChange={(e) =>
                      setFeedback((prev) => ({
                        ...prev,
                        riskAssessmentWasCorrect: e.target.checked,
                      }))
                    }
                  />
                }
                label={`Risk level "${riskLevel}" was correct`}
              />
            </Grid>

            {!feedback.riskAssessmentWasCorrect && (
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Correct Risk Level</InputLabel>
                  <Select
                    value={feedback.correctRiskLevel}
                    label="Correct Risk Level"
                    onChange={(e) =>
                      setFeedback((prev) => ({
                        ...prev,
                        correctRiskLevel: e.target.value,
                      }))
                    }
                  >
                    <MenuItem value="low">Low</MenuItem>
                    <MenuItem value="moderate">Moderate</MenuItem>
                    <MenuItem value="high">High</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            )}
          </Grid>

          <Divider sx={{ my: 2 }} />

          {/* Actual Diagnosis */}
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
            Actual Diagnosis (if known)
          </Typography>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Actual Diagnosis"
                value={feedback.actualDiagnosis}
                onChange={(e) =>
                  setFeedback((prev) => ({ ...prev, actualDiagnosis: e.target.value }))
                }
                size="small"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="ICD-10 Code"
                value={feedback.actualIcd10Code}
                onChange={(e) =>
                  setFeedback((prev) => ({ ...prev, actualIcd10Code: e.target.value }))
                }
                size="small"
              />
            </Grid>
          </Grid>

          <Divider sx={{ my: 2 }} />

          {/* Biopsy Results */}
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
            Biopsy Information
          </Typography>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={feedback.biopsyPerformed}
                    onChange={(e) =>
                      setFeedback((prev) => ({
                        ...prev,
                        biopsyPerformed: e.target.checked,
                      }))
                    }
                  />
                }
                label="Biopsy was performed"
              />
            </Grid>

            {feedback.biopsyPerformed && (
              <>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Biopsy Result Summary"
                    value={feedback.biopsyResult}
                    onChange={(e) =>
                      setFeedback((prev) => ({ ...prev, biopsyResult: e.target.value }))
                    }
                    size="small"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Final Pathology Diagnosis"
                    value={feedback.finalPathology}
                    onChange={(e) =>
                      setFeedback((prev) => ({ ...prev, finalPathology: e.target.value }))
                    }
                    size="small"
                  />
                </Grid>
              </>
            )}
          </Grid>

          <Divider sx={{ my: 2 }} />

          {/* Feature Feedback */}
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
            Feature Detection Feedback
          </Typography>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6}>
              <Typography variant="body2" gutterBottom>
                Missed Features (AI should have detected)
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="Enter feature..."
                  value={newMissedFeature}
                  onChange={(e) => setNewMissedFeature(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addMissedFeature()}
                />
                <Button variant="outlined" onClick={addMissedFeature}>
                  Add
                </Button>
              </Box>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {feedback.missedFeatures.map((feature, index) => (
                  <Chip
                    key={index}
                    label={feature}
                    size="small"
                    onDelete={() => removeMissedFeature(index)}
                  />
                ))}
              </Box>
            </Grid>

            <Grid item xs={12} sm={6}>
              <Typography variant="body2" gutterBottom>
                False Positives (AI incorrectly identified)
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="Enter feature..."
                  value={newFalsePositive}
                  onChange={(e) => setNewFalsePositive(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addFalsePositive()}
                />
                <Button variant="outlined" onClick={addFalsePositive}>
                  Add
                </Button>
              </Box>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {feedback.falsePositiveFeatures.map((feature, index) => (
                  <Chip
                    key={index}
                    label={feature}
                    size="small"
                    onDelete={() => removeFalsePositive(index)}
                  />
                ))}
              </Box>
            </Grid>
          </Grid>

          {/* Additional Notes */}
          <TextField
            fullWidth
            multiline
            rows={3}
            label="Additional Feedback Notes"
            value={feedback.feedbackNotes}
            onChange={(e) => setFeedback((prev) => ({ ...prev, feedbackNotes: e.target.value }))}
            placeholder="Any additional observations or suggestions for improving AI accuracy..."
          />
        </DialogContent>

        <DialogActions>
          <Button onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleSubmit}
            disabled={loading}
            startIcon={<FeedbackIcon />}
          >
            {loading ? 'Submitting...' : 'Submit Feedback'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default FeedbackForm;
