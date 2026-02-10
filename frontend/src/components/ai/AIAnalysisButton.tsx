import React, { useState } from 'react';
import {
  Button,
  CircularProgress,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Alert,
} from '@mui/material';
import { Psychology as AIIcon } from '@mui/icons-material';
import toast from 'react-hot-toast';
import { API_BASE_URL, TENANT_HEADER_NAME } from '../../api';

interface AIAnalysisButtonProps {
  imageId: string;
  onAnalysisComplete?: (analysis: AIAnalysisResult) => void;
  variant?: 'text' | 'outlined' | 'contained';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  analysisType?: 'standard' | 'dermoscopy';
}

export interface AIAnalysisResult {
  id: string;
  lesionImageId: string;
  patientId: string;
  analysisDate: string;
  modelVersion: string;
  confidenceScore: number;
  primaryClassification: 'benign' | 'suspicious' | 'likely_malignant';
  classificationConfidence: number;
  differentialDiagnoses: DifferentialDiagnosis[];
  featureScores: ABCDEScores;
  dermoscopyPatterns: DermoscopyPatterns;
  riskLevel: 'low' | 'moderate' | 'high';
  riskFactors: string[];
  recommendations: string[];
  recommendedAction: string;
  followUpInterval: string | null;
  aiSummary: string;
  disclaimer: string;
}

export interface DifferentialDiagnosis {
  diagnosis: string;
  confidence: number;
  description: string;
  icd10_code?: string;
}

export interface ABCDEFeatureScore {
  score: number;
  confidence: number;
  description: string;
}

export interface ABCDEScores {
  asymmetry: ABCDEFeatureScore;
  border: ABCDEFeatureScore;
  color: ABCDEFeatureScore;
  diameter: ABCDEFeatureScore;
  evolution: ABCDEFeatureScore;
  total_score: number;
}

export interface DermoscopyPatterns {
  is_dermoscopic: boolean;
  global_pattern: string | null;
  local_features: string[];
  pigment_network: string | null;
  dots_globules: string | null;
  streaks: string | null;
  blue_white_veil: boolean;
  regression_structures: boolean;
  vascular_patterns: string[];
}

const AIAnalysisButton: React.FC<AIAnalysisButtonProps> = ({
  imageId,
  onAnalysisComplete,
  variant = 'contained',
  size = 'medium',
  disabled = false,
  analysisType = 'standard',
}) => {
  const [loading, setLoading] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  const handleClick = () => {
    setShowDisclaimer(true);
  };

  const handleConfirm = async () => {
    setShowDisclaimer(false);
    setLoading(true);

    try {
      const tenantId = localStorage.getItem('tenantId') || '';
      const token = localStorage.getItem('accessToken') || '';

      const response = await fetch(`${API_BASE_URL}/api/ai-lesion-analysis/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          [TENANT_HEADER_NAME]: tenantId,
        },
        body: JSON.stringify({ imageId, analysisType }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Analysis failed');
      }

      const data = await response.json();

      toast.success('AI analysis complete');

      if (onAnalysisComplete && data.analysis) {
        onAnalysisComplete(data.analysis);
      }
    } catch (error) {
      console.error('AI Analysis Error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to analyze image');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Tooltip title="Run AI-powered lesion analysis">
        <span>
          <Button
            variant={variant}
            size={size}
            color="primary"
            onClick={handleClick}
            disabled={disabled || loading}
            startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <AIIcon />}
          >
            {loading ? 'Analyzing...' : 'AI Analysis'}
          </Button>
        </span>
      </Tooltip>

      <Dialog
        open={showDisclaimer}
        onClose={() => setShowDisclaimer(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AIIcon color="primary" />
          AI Lesion Analysis
        </DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            <strong>Provider-Only Feature</strong>
          </Alert>
          <DialogContentText>
            This AI-powered analysis will evaluate the lesion image and provide:
          </DialogContentText>
          <ul style={{ marginTop: '8px', marginBottom: '16px' }}>
            <li>Primary classification (benign/suspicious/likely malignant)</li>
            <li>Top 5 differential diagnoses with confidence scores</li>
            <li>Automated ABCDE feature scoring</li>
            <li>Risk stratification (low/moderate/high)</li>
            <li>Clinical recommendations</li>
          </ul>
          <Alert severity="warning">
            <strong>Important Disclaimer:</strong> AI analysis is for clinical decision support only.
            It is NOT a diagnosis. All findings require clinical correlation and professional evaluation.
            The provider must independently verify all AI-generated assessments.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDisclaimer(false)} color="inherit">
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            variant="contained"
            color="primary"
            startIcon={<AIIcon />}
          >
            Proceed with Analysis
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default AIAnalysisButton;
