import type { ReactNode } from 'react';
import type { SummaryItem } from '../utils/scribeSummary';

interface ScribeSummaryCardProps {
  title: string;
  visitDate?: string;
  providerName?: string;
  statusLabel?: string;
  actions?: ReactNode;
  symptoms?: string[];
  concerns?: string[];
  potentialDiagnoses?: SummaryItem[];
  suggestedTests?: SummaryItem[];
  summaryText?: string;
  summaryLabel?: string;
  footerNote?: string;
  showDetails?: boolean;
  compact?: boolean;
}

const formatDate = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const renderTextList = (items?: string[], emptyLabel = 'Not documented') => {
  if (!items || items.length === 0) {
    return <div className="scribe-summary-section__empty">{emptyLabel}</div>;
  }

  return (
    <ul className="scribe-summary-section__list">
      {items.map((item, idx) => (
        <li key={`${item}-${idx}`} className="scribe-summary-section__item">
          {item}
        </li>
      ))}
    </ul>
  );
};

const renderItemList = (items?: SummaryItem[], emptyLabel = 'Not documented') => {
  if (!items || items.length === 0) {
    return <div className="scribe-summary-section__empty">{emptyLabel}</div>;
  }

  return (
    <ul className="scribe-summary-section__list">
      {items.map((item, idx) => (
        <li key={`${item.label}-${idx}`} className="scribe-summary-section__item">
          <span className="scribe-summary-section__item-label">{item.label}</span>
          {item.meta && <span className="scribe-summary-pill">{item.meta}</span>}
        </li>
      ))}
    </ul>
  );
};

export function ScribeSummaryCard({
  title,
  visitDate,
  providerName,
  statusLabel,
  actions,
  symptoms,
  concerns,
  potentialDiagnoses,
  suggestedTests,
  summaryText,
  summaryLabel = 'Summary of Appointment',
  footerNote,
  showDetails = true,
  compact = false,
}: ScribeSummaryCardProps) {
  const summaryParagraphs = (summaryText || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <div className={`scribe-summary-card ${compact ? 'scribe-summary-card--compact' : ''}`}>
      <div className="scribe-summary-card__header">
        <div>
          <div className="scribe-summary-card__title">{title}</div>
          <div className="scribe-summary-card__meta">
            {visitDate && <span>{formatDate(visitDate)}</span>}
            {providerName && <span>{providerName}</span>}
          </div>
        </div>
        <div className="scribe-summary-card__actions">
          {statusLabel && <span className="scribe-summary-badge">{statusLabel}</span>}
          {actions}
        </div>
      </div>

      <div className="scribe-summary-card__body">
        {showDetails && (
          <div className="scribe-summary-grid">
            <div className="scribe-summary-section">
              <div className="scribe-summary-section__label">Symptoms</div>
              {renderTextList(symptoms)}
            </div>
            <div className="scribe-summary-section">
              <div className="scribe-summary-section__label">Concerns</div>
              {renderTextList(concerns)}
            </div>
            <div className="scribe-summary-section">
              <div className="scribe-summary-section__label">Potential Diagnosis</div>
              {renderItemList(potentialDiagnoses)}
            </div>
            <div className="scribe-summary-section">
              <div className="scribe-summary-section__label">Suggested Tests</div>
              {renderItemList(suggestedTests)}
            </div>
          </div>
        )}

        <div className="scribe-summary-divider" />

        <div className="scribe-summary-summary">
          <div className="scribe-summary-summary__label">{summaryLabel}</div>
          {summaryParagraphs.length === 0 ? (
            <div className="scribe-summary-section__empty">No summary available yet.</div>
          ) : (
            <div className={`scribe-summary-summary__text ${!showDetails || compact ? 'is-compact' : ''}`}>
              {summaryParagraphs.map((paragraph, idx) => (
                <p key={`${paragraph.slice(0, 18)}-${idx}`}>{paragraph}</p>
              ))}
            </div>
          )}
        </div>
      </div>

      {footerNote && <div className="scribe-summary-card__footer">{footerNote}</div>}
    </div>
  );
}
