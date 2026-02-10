/**
 * DLQI (Dermatology Life Quality Index) Questionnaire Component
 * Patient-reported quality of life assessment
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  RadioGroup,
  FormControlLabel,
  Radio,
  Alert,
  Button,
  TextField,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Chip,
  Divider,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow
} from '@mui/material';

export interface DLQIResponses {
  q1: number;
  q2: number;
  q3: number;
  q4: number;
  q5: number;
  q6: number;
  q7: number;
  q8: number;
  q9: number;
  q10: number;
}

export interface DLQIScoreResult {
  score: number;
  interpretation: string;
  severity_level: string;
  component_breakdown?: {
    responses: DLQIResponses;
    domain_scores: {
      symptoms_feelings: number;
      daily_activities: number;
      leisure: number;
      work_school: number;
      personal_relationships: number;
      treatment: number;
    };
  };
}

interface DLQIQuestionnaireProps {
  value?: DLQIResponses;
  onChange?: (value: DLQIResponses) => void;
  onCalculate?: (result: DLQIScoreResult) => void;
  readOnly?: boolean;
  stepperMode?: boolean;
}

interface Question {
  id: keyof DLQIResponses;
  number: number;
  text: string;
  domain: string;
}

const QUESTIONS: Question[] = [
  { id: 'q1', number: 1, text: 'How itchy, sore, painful or stinging has your skin been?', domain: 'Symptoms & Feelings' },
  { id: 'q2', number: 2, text: 'How embarrassed or self conscious have you been because of your skin?', domain: 'Symptoms & Feelings' },
  { id: 'q3', number: 3, text: 'How much has your skin interfered with you going shopping or looking after your home or garden?', domain: 'Daily Activities' },
  { id: 'q4', number: 4, text: 'How much has your skin influenced the clothes you wear?', domain: 'Daily Activities' },
  { id: 'q5', number: 5, text: 'How much has your skin affected any social or leisure activities?', domain: 'Leisure' },
  { id: 'q6', number: 6, text: 'How much has your skin made it difficult for you to do any sport?', domain: 'Leisure' },
  { id: 'q7', number: 7, text: 'Has your skin prevented you from working or studying? If "No", how much has your skin been a problem at work or studying?', domain: 'Work & School' },
  { id: 'q8', number: 8, text: 'How much has your skin created problems with your partner or any of your close friends or relatives?', domain: 'Personal Relationships' },
  { id: 'q9', number: 9, text: 'How much has your skin caused any sexual difficulties?', domain: 'Personal Relationships' },
  { id: 'q10', number: 10, text: 'How much of a problem has the treatment for your skin been, for example by making your home messy, or by taking up time?', domain: 'Treatment' }
];

const RESPONSE_OPTIONS = [
  { value: 3, label: 'Very much' },
  { value: 2, label: 'A lot' },
  { value: 1, label: 'A little' },
  { value: 0, label: 'Not at all' },
  { value: 0, label: 'Not relevant', isNotRelevant: true }
];

const getDefaultResponses = (): DLQIResponses => ({
  q1: -1,
  q2: -1,
  q3: -1,
  q4: -1,
  q5: -1,
  q6: -1,
  q7: -1,
  q8: -1,
  q9: -1,
  q10: -1
});

const getSeverityColor = (score: number): string => {
  if (score <= 1) return '#4caf50';
  if (score <= 5) return '#8bc34a';
  if (score <= 10) return '#ffeb3b';
  if (score <= 20) return '#ff9800';
  return '#f44336';
};

export const DLQIQuestionnaire: React.FC<DLQIQuestionnaireProps> = ({
  value,
  onChange,
  onCalculate,
  readOnly = false,
  stepperMode = false
}) => {
  const [responses, setResponses] = useState<DLQIResponses>(value || getDefaultResponses());
  const [activeStep, setActiveStep] = useState(0);
  const [calculatedResult, setCalculatedResult] = useState<DLQIScoreResult | null>(null);
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    if (value) {
      setResponses(value);
    }
  }, [value]);

  const calculateDLQI = useCallback((): DLQIScoreResult | null => {
    const questionKeys = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10'] as const;

    // Check if all questions are answered
    const unanswered = questionKeys.some(key => responses[key] === -1);
    if (unanswered) return null;

    // Calculate total with proper handling of scores
    const total = questionKeys.reduce((sum, key) => {
      const val = responses[key];
      return sum + (val >= 0 ? val : 0);
    }, 0);

    // Calculate domain scores
    const domains = {
      symptoms_feelings: Math.max(0, responses.q1) + Math.max(0, responses.q2),
      daily_activities: Math.max(0, responses.q3) + Math.max(0, responses.q4),
      leisure: Math.max(0, responses.q5) + Math.max(0, responses.q6),
      work_school: Math.max(0, responses.q7),
      personal_relationships: Math.max(0, responses.q8) + Math.max(0, responses.q9),
      treatment: Math.max(0, responses.q10)
    };

    // Determine interpretation
    let interpretation: string;
    let severity_level: string;

    if (total <= 1) {
      interpretation = 'No Effect';
      severity_level = 'none';
    } else if (total <= 5) {
      interpretation = 'Small Effect';
      severity_level = 'mild';
    } else if (total <= 10) {
      interpretation = 'Moderate Effect';
      severity_level = 'moderate';
    } else if (total <= 20) {
      interpretation = 'Large Effect';
      severity_level = 'severe';
    } else {
      interpretation = 'Extremely Large Effect';
      severity_level = 'very_severe';
    }

    return {
      score: total,
      interpretation,
      severity_level,
      component_breakdown: {
        responses: responses,
        domain_scores: domains
      }
    };
  }, [responses]);

  useEffect(() => {
    const result = calculateDLQI();
    setCalculatedResult(result);
  }, [calculateDLQI]);

  const handleResponseChange = (questionId: keyof DLQIResponses, value: number): void => {
    const newResponses = { ...responses, [questionId]: value };
    setResponses(newResponses);
    onChange?.(newResponses);
  };

  const handleNext = (): void => {
    setActiveStep(prev => Math.min(prev + 1, QUESTIONS.length - 1));
  };

  const handleBack = (): void => {
    setActiveStep(prev => Math.max(prev - 1, 0));
  };

  const handleCalculate = (): void => {
    const result = calculateDLQI();
    if (result) {
      onCalculate?.(result);
    }
  };

  const getAnsweredCount = (): number => {
    return Object.values(responses).filter(v => v !== -1).length;
  };

  const renderQuestion = (question: Question, showDomain: boolean = true): React.ReactNode => {
    const currentValue = responses[question.id];

    return (
      <Box key={question.id} sx={{ mb: 3 }}>
        {showDomain && (
          <Chip
            size="small"
            label={question.domain}
            variant="outlined"
            sx={{ mb: 1 }}
          />
        )}
        <Typography variant="body1" sx={{ mb: 2 }}>
          <strong>Q{question.number}.</strong> {question.text}
        </Typography>
        <RadioGroup
          value={currentValue}
          onChange={(e) => handleResponseChange(question.id, parseInt(e.target.value, 10))}
        >
          {RESPONSE_OPTIONS.map((option, index) => (
            <FormControlLabel
              key={index}
              value={option.value}
              disabled={readOnly || (option.isNotRelevant && currentValue !== 0)}
              control={<Radio />}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography>{option.label}</Typography>
                  {!option.isNotRelevant && (
                    <Chip
                      size="small"
                      label={option.value}
                      sx={{
                        backgroundColor: getSeverityColor(option.value * 10),
                        color: option.value <= 1 ? 'text.primary' : 'white',
                        fontSize: '0.7rem',
                        height: 20
                      }}
                    />
                  )}
                </Box>
              }
              sx={{
                mb: 1,
                p: 1,
                borderRadius: 1,
                border: '1px solid',
                borderColor: currentValue === option.value ? 'primary.main' : 'grey.200',
                backgroundColor: currentValue === option.value ? 'primary.50' : 'transparent',
                '&:hover': readOnly ? {} : { backgroundColor: 'grey.50' }
              }}
            />
          ))}
        </RadioGroup>
      </Box>
    );
  };

  const renderStepperMode = (): React.ReactNode => {
    return (
      <Stepper activeStep={activeStep} orientation="vertical">
        {QUESTIONS.map((question, index) => (
          <Step key={question.id}>
            <StepLabel
              optional={
                responses[question.id] !== -1 ? (
                  <Chip
                    size="small"
                    label={`Score: ${responses[question.id]}`}
                    sx={{ backgroundColor: getSeverityColor(responses[question.id] * 10) }}
                  />
                ) : null
              }
            >
              {question.domain}
            </StepLabel>
            <StepContent>
              {renderQuestion(question, false)}
              <Box sx={{ mt: 2 }}>
                <Button
                  variant="contained"
                  onClick={handleNext}
                  disabled={responses[question.id] === -1}
                  sx={{ mr: 1 }}
                >
                  {index === QUESTIONS.length - 1 ? 'Finish' : 'Continue'}
                </Button>
                <Button
                  disabled={index === 0}
                  onClick={handleBack}
                >
                  Back
                </Button>
              </Box>
            </StepContent>
          </Step>
        ))}
      </Stepper>
    );
  };

  const renderAllQuestionsMode = (): React.ReactNode => {
    return (
      <Box>
        {QUESTIONS.map(question => renderQuestion(question))}
      </Box>
    );
  };

  const progress = (getAnsweredCount() / QUESTIONS.length) * 100;

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          DLQI - Dermatology Life Quality Index
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Over the last week, how much has your skin condition affected your quality of life?
        </Typography>

        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Progress: {getAnsweredCount()} of {QUESTIONS.length} questions
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {Math.round(progress)}%
            </Typography>
          </Box>
          <LinearProgress variant="determinate" value={progress} />
        </Box>

        {stepperMode ? renderStepperMode() : renderAllQuestionsMode()}

        {calculatedResult && (
          <>
            <Divider sx={{ my: 3 }} />

            <Alert
              severity={
                calculatedResult.score <= 1 ? 'success' :
                calculatedResult.score <= 5 ? 'info' :
                calculatedResult.score <= 10 ? 'warning' : 'error'
              }
              sx={{ mb: 2 }}
            >
              <Typography variant="h5" component="div" sx={{ fontWeight: 'bold' }}>
                DLQI Score: {calculatedResult.score}/30
              </Typography>
              <Typography variant="body1">
                Interpretation: {calculatedResult.interpretation} on patient&apos;s life
              </Typography>
            </Alert>

            <Typography variant="subtitle2" gutterBottom>
              Domain Scores
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Domain</TableCell>
                  <TableCell align="center">Questions</TableCell>
                  <TableCell align="center">Score</TableCell>
                  <TableCell align="center">Max</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>Symptoms & Feelings</TableCell>
                  <TableCell align="center">1-2</TableCell>
                  <TableCell align="center">{calculatedResult.component_breakdown?.domain_scores.symptoms_feelings}</TableCell>
                  <TableCell align="center">6</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Daily Activities</TableCell>
                  <TableCell align="center">3-4</TableCell>
                  <TableCell align="center">{calculatedResult.component_breakdown?.domain_scores.daily_activities}</TableCell>
                  <TableCell align="center">6</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Leisure</TableCell>
                  <TableCell align="center">5-6</TableCell>
                  <TableCell align="center">{calculatedResult.component_breakdown?.domain_scores.leisure}</TableCell>
                  <TableCell align="center">6</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Work & School</TableCell>
                  <TableCell align="center">7</TableCell>
                  <TableCell align="center">{calculatedResult.component_breakdown?.domain_scores.work_school}</TableCell>
                  <TableCell align="center">3</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Personal Relationships</TableCell>
                  <TableCell align="center">8-9</TableCell>
                  <TableCell align="center">{calculatedResult.component_breakdown?.domain_scores.personal_relationships}</TableCell>
                  <TableCell align="center">6</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Treatment</TableCell>
                  <TableCell align="center">10</TableCell>
                  <TableCell align="center">{calculatedResult.component_breakdown?.domain_scores.treatment}</TableCell>
                  <TableCell align="center">3</TableCell>
                </TableRow>
              </TableBody>
            </Table>

            <Box sx={{ mt: 2, p: 2, backgroundColor: 'grey.100', borderRadius: 1 }}>
              <Typography variant="caption" display="block" gutterBottom>
                <strong>Score Interpretation:</strong>
              </Typography>
              <Typography variant="caption" color="text.secondary">
                0-1: No effect | 2-5: Small effect | 6-10: Moderate effect | 11-20: Large effect | 21-30: Extremely large effect
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
              label="Additional Notes (Optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional observations or context..."
              sx={{ mt: 2 }}
            />

            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="contained"
                onClick={handleCalculate}
                disabled={getAnsweredCount() < QUESTIONS.length}
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

export default DLQIQuestionnaire;
