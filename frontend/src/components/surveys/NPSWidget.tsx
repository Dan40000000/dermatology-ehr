/**
 * NPSWidget Component
 * Interactive 0-10 NPS score selector
 */

import { useState } from 'react';

interface NPSWidgetProps {
  value: number | null;
  onChange: (value: number) => void;
  disabled?: boolean;
  showLabels?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function NPSWidget({
  value,
  onChange,
  disabled = false,
  showLabels = true,
  size = 'md',
}: NPSWidgetProps) {
  const [hoveredValue, setHoveredValue] = useState<number | null>(null);

  const scores = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  const getScoreColor = (score: number) => {
    if (score <= 6) return 'nps-detractor';
    if (score <= 8) return 'nps-passive';
    return 'nps-promoter';
  };

  const getScoreLabel = (score: number) => {
    if (score === 0) return 'Not at all likely';
    if (score === 5) return 'Neutral';
    if (score === 10) return 'Extremely likely';
    return '';
  };

  const sizeClasses = {
    sm: 'nps-widget-sm',
    md: 'nps-widget-md',
    lg: 'nps-widget-lg',
  };

  return (
    <div className={`nps-widget ${sizeClasses[size]}`}>
      <div className="nps-question">
        How likely are you to recommend our practice to friends and family?
      </div>

      <div className="nps-scores">
        {scores.map((score) => (
          <button
            key={score}
            type="button"
            className={`nps-score-btn ${getScoreColor(score)} ${
              value === score ? 'selected' : ''
            } ${hoveredValue === score ? 'hovered' : ''}`}
            onClick={() => !disabled && onChange(score)}
            onMouseEnter={() => !disabled && setHoveredValue(score)}
            onMouseLeave={() => setHoveredValue(null)}
            disabled={disabled}
            aria-label={`Score ${score}`}
            aria-pressed={value === score}
          >
            {score}
          </button>
        ))}
      </div>

      {showLabels && (
        <div className="nps-labels">
          <span className="nps-label-left">Not at all likely</span>
          <span className="nps-label-right">Extremely likely</span>
        </div>
      )}

      {value !== null && (
        <div className={`nps-feedback ${getScoreColor(value)}`}>
          {value >= 9 && "We're thrilled to hear that! Thank you for your support."}
          {value >= 7 && value <= 8 && "Thank you for your feedback!"}
          {value <= 6 && "We're sorry to hear that. We'd love to know how we can improve."}
        </div>
      )}

      <style>{`
        .nps-widget {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .nps-question {
          font-size: 1.125rem;
          font-weight: 500;
          color: var(--text-primary, #1f2937);
          text-align: center;
        }

        .nps-scores {
          display: flex;
          justify-content: center;
          gap: 0.25rem;
          flex-wrap: wrap;
        }

        .nps-score-btn {
          width: 2.5rem;
          height: 2.5rem;
          border: 2px solid #e5e7eb;
          border-radius: 0.5rem;
          font-weight: 600;
          font-size: 1rem;
          cursor: pointer;
          transition: all 0.2s ease;
          background: white;
          color: #374151;
        }

        .nps-widget-sm .nps-score-btn {
          width: 2rem;
          height: 2rem;
          font-size: 0.875rem;
        }

        .nps-widget-lg .nps-score-btn {
          width: 3rem;
          height: 3rem;
          font-size: 1.125rem;
        }

        .nps-score-btn:hover:not(:disabled) {
          transform: scale(1.1);
        }

        .nps-score-btn.nps-detractor:hover,
        .nps-score-btn.nps-detractor.selected {
          background: #ef4444;
          border-color: #dc2626;
          color: white;
        }

        .nps-score-btn.nps-passive:hover,
        .nps-score-btn.nps-passive.selected {
          background: #f59e0b;
          border-color: #d97706;
          color: white;
        }

        .nps-score-btn.nps-promoter:hover,
        .nps-score-btn.nps-promoter.selected {
          background: #10b981;
          border-color: #059669;
          color: white;
        }

        .nps-score-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .nps-labels {
          display: flex;
          justify-content: space-between;
          font-size: 0.75rem;
          color: #6b7280;
          padding: 0 0.5rem;
        }

        .nps-feedback {
          text-align: center;
          padding: 0.75rem;
          border-radius: 0.5rem;
          font-size: 0.875rem;
          font-weight: 500;
        }

        .nps-feedback.nps-promoter {
          background: #d1fae5;
          color: #065f46;
        }

        .nps-feedback.nps-passive {
          background: #fef3c7;
          color: #92400e;
        }

        .nps-feedback.nps-detractor {
          background: #fee2e2;
          color: #991b1b;
        }

        @media (max-width: 480px) {
          .nps-score-btn {
            width: 2rem;
            height: 2rem;
            font-size: 0.875rem;
          }
        }
      `}</style>
    </div>
  );
}
