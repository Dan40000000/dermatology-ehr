/**
 * StarRating Component
 * 5-star rating selector for satisfaction questions
 */

import { useState } from 'react';

interface StarRatingProps {
  value: number | null;
  onChange: (value: number) => void;
  maxStars?: number;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showLabels?: boolean;
  label?: string;
}

const labels: Record<number, string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Very Good',
  5: 'Excellent',
};

export function StarRating({
  value,
  onChange,
  maxStars = 5,
  disabled = false,
  size = 'md',
  showLabels = true,
  label,
}: StarRatingProps) {
  const [hoveredValue, setHoveredValue] = useState<number | null>(null);

  const stars = Array.from({ length: maxStars }, (_, i) => i + 1);

  const displayValue = hoveredValue ?? value;

  const sizeStyles = {
    sm: { fontSize: '1.25rem', gap: '0.25rem' },
    md: { fontSize: '1.75rem', gap: '0.375rem' },
    lg: { fontSize: '2.25rem', gap: '0.5rem' },
  };

  return (
    <div className="star-rating-container">
      {label && <div className="star-rating-label">{label}</div>}

      <div
        className="star-rating"
        style={{ gap: sizeStyles[size].gap }}
        role="radiogroup"
        aria-label={label || 'Rating'}
      >
        {stars.map((star) => (
          <button
            key={star}
            type="button"
            className={`star-btn ${displayValue && displayValue >= star ? 'filled' : 'empty'}`}
            onClick={() => !disabled && onChange(star)}
            onMouseEnter={() => !disabled && setHoveredValue(star)}
            onMouseLeave={() => setHoveredValue(null)}
            disabled={disabled}
            aria-label={`${star} star${star > 1 ? 's' : ''}`}
            aria-checked={value === star}
            role="radio"
            style={{ fontSize: sizeStyles[size].fontSize }}
          >
            {displayValue && displayValue >= star ? (
              <svg viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="1em" height="1em">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            )}
          </button>
        ))}
      </div>

      {showLabels && displayValue && (
        <div className="star-rating-text">{labels[displayValue] || ''}</div>
      )}

      <style>{`
        .star-rating-container {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          align-items: center;
        }

        .star-rating-label {
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--text-primary, #374151);
          text-align: center;
        }

        .star-rating {
          display: flex;
          align-items: center;
        }

        .star-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 0.125rem;
          line-height: 1;
          transition: transform 0.15s ease;
        }

        .star-btn:hover:not(:disabled) {
          transform: scale(1.15);
        }

        .star-btn:disabled {
          cursor: not-allowed;
          opacity: 0.6;
        }

        .star-btn.filled {
          color: #fbbf24;
        }

        .star-btn.empty {
          color: #d1d5db;
        }

        .star-btn:focus {
          outline: none;
        }

        .star-btn:focus-visible {
          outline: 2px solid var(--primary-color, #8b5cf6);
          outline-offset: 2px;
          border-radius: 4px;
        }

        .star-rating-text {
          font-size: 0.875rem;
          color: var(--text-secondary, #6b7280);
          font-weight: 500;
          min-height: 1.25rem;
        }
      `}</style>
    </div>
  );
}
