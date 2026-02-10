/**
 * SurveyForm Component
 * Complete survey form with NPS, satisfaction ratings, and comments
 */

import { useState, useEffect } from 'react';
import { NPSWidget } from './NPSWidget';
import { StarRating } from './StarRating';
import { ReviewPrompt } from './ReviewPrompt';
import { Button } from '../ui';

interface SurveyQuestion {
  id: string;
  type: 'nps' | 'stars' | 'rating' | 'text' | 'multiple_choice' | 'checkbox';
  text: string;
  required: boolean;
  options?: string[];
  category?: string;
  order: number;
}

interface SurveyTemplate {
  name: string;
  description: string;
  questions: SurveyQuestion[];
  thank_you_message: string;
  enable_review_prompt: boolean;
}

interface SurveyFormProps {
  template: SurveyTemplate;
  patientName?: string;
  providerName?: string | null;
  onSubmit: (responses: SurveyResponses) => Promise<SubmitResult>;
}

interface SurveyResponses {
  question_responses: QuestionResponse[];
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

interface QuestionResponse {
  question_id: string;
  question_text: string;
  answer: string | number | string[];
  answer_type: string;
}

interface SubmitResult {
  success: boolean;
  thank_you_message: string;
  show_review_prompt: boolean;
  review_urls?: Record<string, string>;
}

export function SurveyForm({
  template,
  patientName,
  providerName,
  onSubmit,
}: SurveyFormProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [responses, setResponses] = useState<Record<string, number | string | string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);
  const [startTime] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);

  const sortedQuestions = [...template.questions].sort((a, b) => a.order - b.order);

  // Group questions by step (NPS first, then satisfaction, then comments)
  const npsQuestions = sortedQuestions.filter(q => q.type === 'nps');
  const ratingQuestions = sortedQuestions.filter(q => q.type === 'stars' || q.type === 'rating');
  const textQuestions = sortedQuestions.filter(q => q.type === 'text');
  const otherQuestions = sortedQuestions.filter(
    q => !['nps', 'stars', 'rating', 'text'].includes(q.type)
  );

  const steps = [
    ...(npsQuestions.length > 0 ? [{ type: 'nps' as const, questions: npsQuestions }] : []),
    ...(ratingQuestions.length > 0 ? [{ type: 'ratings' as const, questions: ratingQuestions }] : []),
    ...(textQuestions.length > 0 || otherQuestions.length > 0
      ? [{ type: 'comments' as const, questions: [...textQuestions, ...otherQuestions] }]
      : []),
  ];

  const currentStepData = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;

  const handleResponseChange = (questionId: string, value: number | string | string[]) => {
    setResponses(prev => ({ ...prev, [questionId]: value }));
  };

  const isStepComplete = () => {
    if (!currentStepData) return false;

    const requiredQuestions = currentStepData.questions.filter(q => q.required);
    return requiredQuestions.every(q => responses[q.id] !== undefined && responses[q.id] !== '');
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const responseTimeSeconds = Math.floor((Date.now() - startTime) / 1000);

      const questionResponses: QuestionResponse[] = sortedQuestions.map(q => ({
        question_id: q.id,
        question_text: q.text,
        answer: responses[q.id] ?? '',
        answer_type: q.type,
      }));

      const surveyResponses: SurveyResponses = {
        question_responses: questionResponses,
        nps_score: responses['nps'] as number | undefined,
        wait_time_rating: responses['wait_time'] as number | undefined,
        staff_friendliness_rating: responses['staff_friendliness'] as number | undefined,
        provider_communication_rating: responses['provider_communication'] as number | undefined,
        facility_cleanliness_rating: responses['facility_cleanliness'] as number | undefined,
        overall_satisfaction_rating: responses['overall_satisfaction'] as number | undefined,
        comments: responses['comments'] as string | undefined,
        improvement_suggestions: responses['improvement_suggestions'] as string | undefined,
        response_time_seconds: responseTimeSeconds,
      };

      const result = await onSubmit(surveyResponses);
      setSubmitResult(result);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit survey');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted && submitResult) {
    return (
      <div className="survey-complete">
        <div className="survey-thank-you">
          <div className="thank-you-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h2>Thank You!</h2>
          <p>{submitResult.thank_you_message}</p>
        </div>

        {submitResult.show_review_prompt && submitResult.review_urls && (
          <ReviewPrompt
            reviewUrls={submitResult.review_urls}
            onClose={() => {}}
          />
        )}

        <style>{`
          .survey-complete {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 2rem;
            padding: 2rem;
            text-align: center;
          }

          .survey-thank-you {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1rem;
          }

          .thank-you-icon {
            width: 4rem;
            height: 4rem;
            color: #10b981;
          }

          .thank-you-icon svg {
            width: 100%;
            height: 100%;
          }

          .survey-thank-you h2 {
            font-size: 1.5rem;
            font-weight: 600;
            color: #1f2937;
            margin: 0;
          }

          .survey-thank-you p {
            font-size: 1rem;
            color: #6b7280;
            margin: 0;
            max-width: 400px;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="survey-form">
      <div className="survey-header">
        <h1>{template.name}</h1>
        {patientName && <p className="survey-greeting">Hi {patientName},</p>}
        {template.description && <p className="survey-description">{template.description}</p>}
        {providerName && (
          <p className="survey-provider">Your visit with {providerName}</p>
        )}
      </div>

      <div className="survey-progress">
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
          />
        </div>
        <span className="progress-text">
          Step {currentStep + 1} of {steps.length}
        </span>
      </div>

      <div className="survey-content">
        {currentStepData?.type === 'nps' && (
          <div className="survey-step nps-step">
            {currentStepData.questions.map(question => (
              <NPSWidget
                key={question.id}
                value={responses[question.id] as number | null ?? null}
                onChange={(value) => handleResponseChange(question.id, value)}
                disabled={submitting}
              />
            ))}
          </div>
        )}

        {currentStepData?.type === 'ratings' && (
          <div className="survey-step ratings-step">
            <h3>How would you rate the following?</h3>
            <div className="ratings-grid">
              {currentStepData.questions.map(question => (
                <div key={question.id} className="rating-item">
                  <StarRating
                    label={question.text}
                    value={responses[question.id] as number | null ?? null}
                    onChange={(value) => handleResponseChange(question.id, value)}
                    disabled={submitting}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {currentStepData?.type === 'comments' && (
          <div className="survey-step comments-step">
            <h3>Any additional feedback?</h3>
            {currentStepData.questions.map(question => (
              <div key={question.id} className="comment-field">
                <label htmlFor={question.id}>{question.text}</label>
                <textarea
                  id={question.id}
                  value={(responses[question.id] as string) || ''}
                  onChange={(e) => handleResponseChange(question.id, e.target.value)}
                  placeholder="Share your thoughts..."
                  rows={4}
                  disabled={submitting}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="survey-error">
          {error}
        </div>
      )}

      <div className="survey-actions">
        {currentStep > 0 && (
          <Button
            variant="ghost"
            onClick={handleBack}
            disabled={submitting}
          >
            Back
          </Button>
        )}

        {!isLastStep ? (
          <Button
            onClick={handleNext}
            disabled={!isStepComplete() || submitting}
          >
            Continue
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            loading={submitting}
            disabled={submitting}
          >
            Submit Feedback
          </Button>
        )}
      </div>

      <style>{`
        .survey-form {
          max-width: 600px;
          margin: 0 auto;
          padding: 1.5rem;
        }

        .survey-header {
          text-align: center;
          margin-bottom: 1.5rem;
        }

        .survey-header h1 {
          font-size: 1.5rem;
          font-weight: 600;
          color: #1f2937;
          margin: 0 0 0.5rem;
        }

        .survey-greeting {
          font-size: 1.125rem;
          color: #4b5563;
          margin: 0 0 0.25rem;
        }

        .survey-description {
          font-size: 0.875rem;
          color: #6b7280;
          margin: 0;
        }

        .survey-provider {
          font-size: 0.875rem;
          color: #8b5cf6;
          font-weight: 500;
          margin: 0.5rem 0 0;
        }

        .survey-progress {
          margin-bottom: 2rem;
        }

        .progress-bar {
          height: 4px;
          background: #e5e7eb;
          border-radius: 2px;
          overflow: hidden;
          margin-bottom: 0.5rem;
        }

        .progress-fill {
          height: 100%;
          background: #8b5cf6;
          transition: width 0.3s ease;
        }

        .progress-text {
          font-size: 0.75rem;
          color: #6b7280;
        }

        .survey-content {
          min-height: 300px;
        }

        .survey-step {
          animation: fadeIn 0.3s ease;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .ratings-step h3,
        .comments-step h3 {
          font-size: 1.125rem;
          font-weight: 500;
          color: #1f2937;
          margin: 0 0 1.5rem;
          text-align: center;
        }

        .ratings-grid {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .rating-item {
          padding: 1rem;
          background: #f9fafb;
          border-radius: 0.5rem;
        }

        .comment-field {
          margin-bottom: 1rem;
        }

        .comment-field label {
          display: block;
          font-size: 0.875rem;
          font-weight: 500;
          color: #374151;
          margin-bottom: 0.5rem;
        }

        .comment-field textarea {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid #d1d5db;
          border-radius: 0.5rem;
          font-size: 0.875rem;
          resize: vertical;
          min-height: 100px;
        }

        .comment-field textarea:focus {
          outline: none;
          border-color: #8b5cf6;
          box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
        }

        .survey-error {
          padding: 0.75rem;
          background: #fee2e2;
          color: #991b1b;
          border-radius: 0.5rem;
          font-size: 0.875rem;
          margin-bottom: 1rem;
        }

        .survey-actions {
          display: flex;
          justify-content: center;
          gap: 1rem;
          margin-top: 2rem;
        }
      `}</style>
    </div>
  );
}
