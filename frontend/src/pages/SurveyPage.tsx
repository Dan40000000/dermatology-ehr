/**
 * SurveyPage
 * Public page for patients to complete post-visit surveys
 * Accessed via unique token link - no authentication required
 */

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { SurveyForm } from '../components/surveys/SurveyForm';
import { LoadingSpinner } from '../components/ui';
import { API_BASE_URL } from '../utils/apiBase';

interface SurveyTemplate {
  name: string;
  description: string;
  questions: SurveyQuestion[];
  thank_you_message: string;
  enable_review_prompt: boolean;
}

interface SurveyQuestion {
  id: string;
  type: 'nps' | 'stars' | 'rating' | 'text' | 'multiple_choice' | 'checkbox';
  text: string;
  required: boolean;
  options?: string[];
  category?: string;
  order: number;
}

interface SurveyData {
  invitation: {
    id: string;
    status: string;
    expires_at: string;
  };
  template: SurveyTemplate;
  patient: {
    first_name: string;
  };
  provider: {
    name: string;
  } | null;
}

interface SurveyResponses {
  question_responses: {
    question_id: string;
    question_text: string;
    answer: string | number | string[];
    answer_type: string;
  }[];
  nps_score?: number;
  wait_time_rating?: number;
  staff_friendliness_rating?: number;
  provider_communication_rating?: number;
  facility_cleanliness_rating?: number;
  overall_satisfaction_rating?: number;
  comments?: string;
  improvement_suggestions?: string;
  response_time_seconds?: number;
}

interface SubmitResult {
  success: boolean;
  thank_you_message: string;
  show_review_prompt: boolean;
  review_urls?: Record<string, string>;
}

export function SurveyPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [surveyData, setSurveyData] = useState<SurveyData | null>(null);

  useEffect(() => {
    const fetchSurvey = async () => {
      if (!token) {
        setError('Invalid survey link');
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/api/surveys/${token}`);

        if (!response.ok) {
          if (response.status === 404) {
            setError('This survey has expired or is no longer available.');
          } else {
            setError('Failed to load survey. Please try again later.');
          }
          setLoading(false);
          return;
        }

        const data = await response.json();
        setSurveyData(data);
      } catch (err) {
        setError('Failed to load survey. Please check your internet connection.');
      } finally {
        setLoading(false);
      }
    };

    fetchSurvey();
  }, [token]);

  const handleSubmit = async (responses: SurveyResponses): Promise<SubmitResult> => {
    const response = await fetch(`${API_BASE_URL}/api/surveys/${token}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(responses),
    });

    if (!response.ok) {
      throw new Error('Failed to submit survey');
    }

    return response.json();
  };

  if (loading) {
    return (
      <div className="survey-page loading">
        <LoadingSpinner />
        <p>Loading your survey...</p>

        <style>{`
          .survey-page.loading {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            gap: 1rem;
            color: #6b7280;
          }
        `}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div className="survey-page error">
        <div className="error-content">
          <div className="error-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2>Oops!</h2>
          <p>{error}</p>
          <p className="contact-info">
            If you believe this is an error, please contact our office.
          </p>
        </div>

        <style>{`
          .survey-page.error {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 1rem;
            background: #f9fafb;
          }

          .error-content {
            text-align: center;
            max-width: 400px;
            padding: 2rem;
            background: white;
            border-radius: 1rem;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          }

          .error-icon {
            width: 4rem;
            height: 4rem;
            margin: 0 auto 1rem;
            color: #ef4444;
          }

          .error-icon svg {
            width: 100%;
            height: 100%;
          }

          .error-content h2 {
            font-size: 1.5rem;
            font-weight: 600;
            color: #1f2937;
            margin: 0 0 0.5rem;
          }

          .error-content p {
            color: #6b7280;
            margin: 0 0 0.5rem;
          }

          .contact-info {
            font-size: 0.875rem;
            color: #9ca3af;
          }
        `}</style>
      </div>
    );
  }

  if (!surveyData) {
    return null;
  }

  return (
    <div className="survey-page">
      <div className="survey-container">
        <SurveyForm
          template={surveyData.template}
          patientName={surveyData.patient.first_name}
          providerName={surveyData.provider?.name}
          onSubmit={handleSubmit}
        />
      </div>

      <footer className="survey-footer">
        <p>Your feedback helps us improve our care.</p>
        <p className="privacy-note">
          Your responses are confidential and will be used to enhance patient experience.
        </p>
      </footer>

      <style>{`
        .survey-page {
          min-height: 100vh;
          background: linear-gradient(180deg, #f5f3ff 0%, #ede9fe 100%);
          display: flex;
          flex-direction: column;
        }

        .survey-container {
          flex: 1;
          max-width: 700px;
          margin: 0 auto;
          width: 100%;
          padding: 2rem 1rem;
        }

        .survey-container > * {
          background: white;
          border-radius: 1rem;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        }

        .survey-footer {
          text-align: center;
          padding: 1.5rem;
          background: rgba(255, 255, 255, 0.8);
          border-top: 1px solid #e5e7eb;
        }

        .survey-footer p {
          margin: 0;
          color: #6b7280;
          font-size: 0.875rem;
        }

        .survey-footer .privacy-note {
          font-size: 0.75rem;
          color: #9ca3af;
          margin-top: 0.25rem;
        }

        @media (max-width: 640px) {
          .survey-container {
            padding: 1rem 0.5rem;
          }

          .survey-container > * {
            border-radius: 0.75rem;
          }
        }
      `}</style>
    </div>
  );
}
