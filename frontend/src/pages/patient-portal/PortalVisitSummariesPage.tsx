import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { PatientPortalLayout } from '../../components/patient-portal/PatientPortalLayout';
import { patientPortalFetch } from '../../contexts/PatientPortalAuthContext';

interface VisitSummary {
  id: string;
  visitDate: string;
  providerName: string;
  summaryText: string;
  symptomsDiscussed: string[];
  diagnosisShared?: string;
  treatmentPlan?: string;
  nextSteps?: string;
  followUpDate?: string;
  createdAt: string;
}

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value?: string | null, format: 'long' | 'short' = 'long'): string {
  const date = parseDate(value);
  if (!date) return value || 'Date unavailable';

  if (format === 'short') {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatCalendarDate(value?: string | null): { month: string; day: string; year: string } {
  const date = parseDate(value);
  if (!date) return { month: 'TBD', day: '--', year: '----' };

  return {
    month: date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    day: String(date.getDate()),
    year: String(date.getFullYear()),
  };
}

function getProviderInitials(providerName?: string | null): string {
  if (!providerName) return 'DR';
  const words = providerName.replace(/^Dr\.?\s+/i, '').trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join('') || 'DR';
}

function getPreview(summaryText?: string): string {
  const trimmed = (summaryText || '').replace(/\s+/g, ' ').trim();
  if (!trimmed) return 'Open this visit summary to review what was discussed and what comes next.';
  return trimmed.length > 190 ? `${trimmed.slice(0, 190).trim()}...` : trimmed;
}

function splitText(value?: string): string[] {
  return (value || '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function SummaryIcon({ type }: { type: 'clipboard' | 'search' | 'empty' | 'calendar' | 'check' | 'refresh' }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  if (type === 'search') {
    return (
      <svg {...common}>
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.35-4.35" />
      </svg>
    );
  }

  if (type === 'empty') {
    return (
      <svg {...common}>
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M9 13h6" />
        <path d="M9 17h3" />
      </svg>
    );
  }

  if (type === 'calendar') {
    return (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4" />
        <path d="M8 2v4" />
        <path d="M3 10h18" />
      </svg>
    );
  }

  if (type === 'check') {
    return (
      <svg {...common}>
        <path d="M20 6L9 17l-5-5" />
      </svg>
    );
  }

  if (type === 'refresh') {
    return (
      <svg {...common}>
        <path d="M21 12a9 9 0 11-2.64-6.36" />
        <path d="M21 3v6h-6" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M9 12h6" />
      <path d="M9 16h6" />
    </svg>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="visit-summary-detail">
      <h4>{title}</h4>
      {children}
    </section>
  );
}

export function PortalVisitSummariesPage() {
  const [summaries, setSummaries] = useState<VisitSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadVisitSummaries();
  }, []);

  const loadVisitSummaries = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await patientPortalFetch('/api/patient-portal-data/visit-summaries');
      setSummaries(data.summaries || []);
      window.dispatchEvent(new Event('portalNotificationsChanged'));
    } catch (err) {
      console.error('Failed to load visit summaries:', err);
      setError('Unable to load visit summaries. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const toggleCard = (id: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sortedSummaries = useMemo(() => {
    return [...summaries].sort((a, b) => {
      const aDate = parseDate(a.visitDate)?.getTime() || 0;
      const bDate = parseDate(b.visitDate)?.getTime() || 0;
      return bDate - aDate;
    });
  }, [summaries]);

  const filteredSummaries = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return sortedSummaries;

    return sortedSummaries.filter((summary) => {
      const searchable = [
        summary.providerName,
        summary.summaryText,
        summary.diagnosisShared,
        summary.treatmentPlan,
        summary.nextSteps,
        ...(summary.symptomsDiscussed || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchable.includes(term);
    });
  }, [searchTerm, sortedSummaries]);

  const latestSummary = sortedSummaries[0];
  const summariesWithFollowUp = summaries.filter((summary) => summary.followUpDate).length;

  return (
    <PatientPortalLayout>
      <div className="visit-summaries-page">
        <section className="visit-summaries-hero">
          <div className="visit-summaries-hero__main">
            <div className="visit-summaries-hero__icon">
              <SummaryIcon type="clipboard" />
            </div>
            <div>
              <p className="visit-summaries-eyebrow">Visit Summaries</p>
              <h1>Your Visit Summaries</h1>
              <p>
                Review what was discussed, your treatment plan, and the next steps your care team shared after each appointment.
              </p>
            </div>
          </div>

          <div className="visit-summaries-stats" aria-label="Visit summary statistics">
            <div className="visit-summary-stat">
              <span className="visit-summary-stat__value">{summaries.length}</span>
              <span className="visit-summary-stat__label">Shared summaries</span>
            </div>
            <div className="visit-summary-stat">
              <span className="visit-summary-stat__value">{summariesWithFollowUp}</span>
              <span className="visit-summary-stat__label">With follow-up</span>
            </div>
            <div className="visit-summary-stat visit-summary-stat--wide">
              <span className="visit-summary-stat__value">{latestSummary ? formatDate(latestSummary.visitDate, 'short') : 'None yet'}</span>
              <span className="visit-summary-stat__label">Most recent visit</span>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="visit-summary-state">
            <div className="visit-summary-spinner" />
            <div>
              <h2>Loading visit summaries</h2>
              <p>Gathering your shared appointment notes.</p>
            </div>
          </div>
        ) : error ? (
          <div className="visit-summary-state visit-summary-state--error">
            <div className="visit-summary-state__icon">
              <span>!</span>
            </div>
            <div>
              <h2>We could not load your summaries</h2>
              <p>{error}</p>
              <button type="button" onClick={loadVisitSummaries} className="visit-summary-action">
                <SummaryIcon type="refresh" />
                Try Again
              </button>
            </div>
          </div>
        ) : summaries.length === 0 ? (
          <div className="visit-summary-state visit-summary-state--empty">
            <div className="visit-summary-state__icon">
              <SummaryIcon type="empty" />
            </div>
            <div>
              <h2>No visit summaries yet</h2>
              <p>After your appointments, your provider may share a summary here with your diagnosis, plan, and next steps.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="visit-summaries-toolbar">
              <label className="visit-summary-search">
                <span>
                  <SummaryIcon type="search" />
                </span>
                <input
                  type="search"
                  aria-label="Search visit summaries"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search by provider, diagnosis, treatment, or symptom"
                />
              </label>
              <button type="button" className="visit-summary-action" onClick={loadVisitSummaries}>
                <SummaryIcon type="refresh" />
                Refresh
              </button>
            </div>

            {filteredSummaries.length === 0 ? (
              <div className="visit-summary-state visit-summary-state--empty">
                <div className="visit-summary-state__icon">
                  <SummaryIcon type="search" />
                </div>
                <div>
                  <h2>No matching summaries</h2>
                  <p>Try searching for a provider, diagnosis, symptom, or treatment from a different visit.</p>
                </div>
              </div>
            ) : (
              <div className="visit-summary-list">
                {filteredSummaries.map((summary) => {
                  const isExpanded = expandedCards.has(summary.id);
                  const calendar = formatCalendarDate(summary.visitDate);
                  const summaryParagraphs = splitText(summary.summaryText);
                  const quickFacts = [
                    summary.diagnosisShared ? { label: 'Diagnosis', value: summary.diagnosisShared } : null,
                    summary.treatmentPlan ? { label: 'Plan', value: summary.treatmentPlan } : null,
                    summary.followUpDate ? { label: 'Follow-up', value: formatDate(summary.followUpDate, 'short') } : null,
                  ].filter(Boolean) as { label: string; value: string }[];

                  return (
                    <article key={summary.id} className={`visit-summary-card ${isExpanded ? 'is-expanded' : ''}`}>
                      <button type="button" className="visit-summary-card__header" onClick={() => toggleCard(summary.id)}>
                        <div className="visit-summary-date">
                          <span className="visit-summary-date__month">{calendar.month}</span>
                          <span className="visit-summary-date__day">{calendar.day}</span>
                          <span className="visit-summary-date__year">{calendar.year}</span>
                        </div>

                        <div className="visit-summary-card__main">
                          <div className="visit-summary-card__topline">
                            <span className="visit-summary-provider-avatar">{getProviderInitials(summary.providerName)}</span>
                            <span className="visit-summary-provider">{summary.providerName || 'Your provider'}</span>
                            <span className="visit-summary-status">
                              <SummaryIcon type="check" />
                              Shared
                            </span>
                          </div>
                          <h2>{formatDate(summary.visitDate)}</h2>
                          <p>{getPreview(summary.summaryText)}</p>

                          {quickFacts.length > 0 && (
                            <div className="visit-summary-facts">
                              {quickFacts.slice(0, 3).map((fact) => (
                                <span key={`${summary.id}-${fact.label}`} className="visit-summary-fact">
                                  <strong>{fact.label}</strong>
                                  {fact.value}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <span className="visit-summary-chevron" aria-hidden="true">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 18l6-6-6-6" />
                          </svg>
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="visit-summary-card__details">
                          {summaryParagraphs.length > 0 && (
                            <DetailSection title="Summary of Appointment">
                              <div className="visit-summary-copy">
                                {summaryParagraphs.map((paragraph, index) => (
                                  <p key={`${summary.id}-paragraph-${index}`}>{paragraph}</p>
                                ))}
                              </div>
                            </DetailSection>
                          )}

                          {summary.symptomsDiscussed && summary.symptomsDiscussed.length > 0 && (
                            <DetailSection title="What We Discussed">
                              <ul className="visit-summary-chip-list">
                                {summary.symptomsDiscussed.map((symptom, index) => (
                                  <li key={`${summary.id}-symptom-${index}`}>{symptom}</li>
                                ))}
                              </ul>
                            </DetailSection>
                          )}

                          <div className="visit-summary-detail-grid">
                            {summary.diagnosisShared && (
                              <DetailSection title="Diagnosis">
                                <p>{summary.diagnosisShared}</p>
                              </DetailSection>
                            )}

                            {summary.treatmentPlan && (
                              <DetailSection title="Treatment Plan">
                                <p>{summary.treatmentPlan}</p>
                              </DetailSection>
                            )}

                            {summary.nextSteps && (
                              <DetailSection title="Next Steps">
                                <p>{summary.nextSteps}</p>
                              </DetailSection>
                            )}

                            {summary.followUpDate && (
                              <DetailSection title="Follow-up Appointment">
                                <div className="visit-summary-followup">
                                  <SummaryIcon type="calendar" />
                                  <span>{formatDate(summary.followUpDate)}</span>
                                </div>
                              </DetailSection>
                            )}
                          </div>

                          <div className="visit-summary-footer">
                            <span>Summary created {formatDate(summary.createdAt, 'short')}</span>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        .visit-summaries-page {
          max-width: 980px;
          margin: 0 auto;
          color: #0f172a;
          font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .visit-summaries-hero {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 1.25rem;
          align-items: stretch;
          margin-bottom: 1.5rem;
          padding: 1.5rem;
          border: 1px solid #dbe4ef;
          border-radius: 14px;
          background:
            linear-gradient(135deg, rgba(236, 253, 245, 0.9), rgba(239, 246, 255, 0.95)),
            #ffffff;
        }

        .visit-summaries-hero__main {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
          min-width: 0;
        }

        .visit-summaries-hero__icon,
        .visit-summary-state__icon {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          background: linear-gradient(135deg, #0f766e, #2563eb);
          color: #ffffff;
          box-shadow: 0 10px 22px rgba(37, 99, 235, 0.18);
        }

        .visit-summaries-eyebrow {
          margin: 0 0 0.25rem;
          font-size: 0.74rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #0f766e;
        }

        .visit-summaries-hero h1 {
          margin: 0;
          font-size: 1.65rem;
          line-height: 1.15;
          font-weight: 800;
          color: #0f172a;
        }

        .visit-summaries-hero p {
          margin: 0.45rem 0 0;
          color: #475569;
          font-size: 0.94rem;
          line-height: 1.6;
          max-width: 650px;
        }

        .visit-summaries-stats {
          display: grid;
          grid-template-columns: repeat(3, minmax(112px, 1fr));
          gap: 0.75rem;
          align-content: stretch;
          min-width: 360px;
        }

        .visit-summary-stat {
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 0.2rem;
          padding: 0.85rem 0.9rem;
          border: 1px solid #dbe4ef;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.78);
        }

        .visit-summary-stat__value {
          font-size: 1rem;
          font-weight: 800;
          color: #0f172a;
          white-space: nowrap;
        }

        .visit-summary-stat__label {
          font-size: 0.72rem;
          color: #64748b;
          font-weight: 600;
        }

        .visit-summaries-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          margin-bottom: 1rem;
        }

        .visit-summary-search {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 0.65rem;
          min-height: 44px;
          padding: 0 0.85rem;
          border: 1px solid #dbe4ef;
          border-radius: 10px;
          background: #ffffff;
          color: #64748b;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
        }

        .visit-summary-search svg {
          width: 17px;
          height: 17px;
        }

        .visit-summary-search input {
          width: 100%;
          min-width: 0;
          border: 0;
          outline: 0;
          background: transparent;
          color: #0f172a;
          font: inherit;
          font-size: 0.9rem;
        }

        .visit-summary-search input::placeholder {
          color: #94a3b8;
        }

        .visit-summary-action {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.45rem;
          min-height: 42px;
          padding: 0 0.9rem;
          border-radius: 10px;
          border: 1px solid #cbd5e1;
          background: #ffffff;
          color: #334155;
          font-size: 0.84rem;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
          transition: border-color 0.15s, color 0.15s, box-shadow 0.15s;
        }

        .visit-summary-action svg {
          width: 16px;
          height: 16px;
        }

        .visit-summary-action:hover {
          border-color: #2563eb;
          color: #1d4ed8;
          box-shadow: 0 8px 20px rgba(37, 99, 235, 0.1);
        }

        .visit-summary-list {
          display: flex;
          flex-direction: column;
          gap: 0.9rem;
        }

        .visit-summary-card {
          overflow: hidden;
          border: 1px solid #dbe4ef;
          border-radius: 12px;
          background: #ffffff;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
          transition: border-color 0.18s, box-shadow 0.18s, transform 0.18s;
        }

        .visit-summary-card:hover,
        .visit-summary-card.is-expanded {
          border-color: #93c5fd;
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08);
        }

        .visit-summary-card:hover {
          transform: translateY(-1px);
        }

        .visit-summary-card__header {
          width: 100%;
          display: grid;
          grid-template-columns: 78px minmax(0, 1fr) 34px;
          gap: 1rem;
          align-items: stretch;
          padding: 0;
          border: 0;
          background: transparent;
          text-align: left;
          cursor: pointer;
          color: inherit;
          font: inherit;
        }

        .visit-summary-date {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.12rem;
          padding: 1rem 0.45rem;
          color: #ffffff;
          background: linear-gradient(160deg, #0f766e, #2563eb);
        }

        .visit-summary-date__month {
          font-size: 0.66rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          color: rgba(255, 255, 255, 0.82);
        }

        .visit-summary-date__day {
          font-size: 2rem;
          line-height: 1;
          font-weight: 800;
        }

        .visit-summary-date__year {
          font-size: 0.68rem;
          color: rgba(255, 255, 255, 0.78);
          font-weight: 600;
        }

        .visit-summary-card__main {
          min-width: 0;
          padding: 1rem 0 1rem 0;
        }

        .visit-summary-card__topline {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.55rem;
          margin-bottom: 0.45rem;
        }

        .visit-summary-provider-avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          background: #e0f2fe;
          color: #0369a1;
          font-size: 0.68rem;
          font-weight: 800;
        }

        .visit-summary-provider {
          font-size: 0.82rem;
          font-weight: 700;
          color: #334155;
        }

        .visit-summary-status {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.18rem 0.52rem;
          border-radius: 999px;
          background: #dcfce7;
          color: #15803d;
          font-size: 0.7rem;
          font-weight: 800;
        }

        .visit-summary-status svg {
          width: 12px;
          height: 12px;
        }

        .visit-summary-card h2 {
          margin: 0;
          color: #0f172a;
          font-size: 1rem;
          font-weight: 800;
          line-height: 1.3;
        }

        .visit-summary-card p {
          margin: 0.45rem 0 0;
          color: #475569;
          font-size: 0.9rem;
          line-height: 1.55;
        }

        .visit-summary-facts {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-top: 0.8rem;
        }

        .visit-summary-fact {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          max-width: 100%;
          padding: 0.28rem 0.56rem;
          border-radius: 8px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          color: #475569;
          font-size: 0.76rem;
          line-height: 1.25;
        }

        .visit-summary-fact strong {
          color: #0f766e;
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .visit-summary-chevron {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          align-self: center;
          width: 30px;
          height: 30px;
          margin-right: 0.7rem;
          border-radius: 8px;
          color: #64748b;
          background: #f8fafc;
          transition: transform 0.18s, color 0.18s, background 0.18s;
        }

        .visit-summary-chevron svg {
          width: 18px;
          height: 18px;
        }

        .visit-summary-card.is-expanded .visit-summary-chevron {
          transform: rotate(90deg);
          color: #ffffff;
          background: #2563eb;
        }

        .visit-summary-card__details {
          padding: 0 1.25rem 1.25rem calc(78px + 1rem);
          border-top: 1px solid #e2e8f0;
          animation: visitSummaryIn 0.18s ease-out;
        }

        @keyframes visitSummaryIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .visit-summary-detail {
          padding-top: 1rem;
        }

        .visit-summary-detail h4 {
          margin: 0 0 0.45rem;
          color: #0f766e;
          font-size: 0.73rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .visit-summary-detail p,
        .visit-summary-copy p {
          margin: 0;
          color: #334155;
          font-size: 0.9rem;
          line-height: 1.65;
        }

        .visit-summary-copy {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }

        .visit-summary-chip-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .visit-summary-chip-list li {
          padding: 0.32rem 0.62rem;
          border-radius: 999px;
          background: #ecfeff;
          color: #0e7490;
          font-size: 0.8rem;
          font-weight: 700;
        }

        .visit-summary-detail-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          column-gap: 1.25rem;
          row-gap: 0.2rem;
        }

        .visit-summary-followup {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          color: #1d4ed8;
          font-weight: 800;
          font-size: 0.9rem;
        }

        .visit-summary-followup svg {
          width: 17px;
          height: 17px;
        }

        .visit-summary-footer {
          margin-top: 1rem;
          padding-top: 0.85rem;
          border-top: 1px solid #e2e8f0;
          color: #94a3b8;
          font-size: 0.78rem;
          font-weight: 600;
          text-align: right;
        }

        .visit-summary-state {
          min-height: 260px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          padding: 2rem;
          border: 1px dashed #cbd5e1;
          border-radius: 14px;
          background: #ffffff;
          text-align: left;
        }

        .visit-summary-state h2 {
          margin: 0;
          font-size: 1.12rem;
          color: #0f172a;
          font-weight: 800;
        }

        .visit-summary-state p {
          margin: 0.35rem 0 0;
          color: #64748b;
          font-size: 0.92rem;
          line-height: 1.55;
          max-width: 520px;
        }

        .visit-summary-state--error {
          border-style: solid;
          border-color: #fecaca;
          background: #fff7f7;
        }

        .visit-summary-state--error .visit-summary-state__icon {
          background: #dc2626;
          box-shadow: none;
          font-weight: 900;
        }

        .visit-summary-state--error .visit-summary-action {
          margin-top: 0.9rem;
        }

        .visit-summary-state--empty .visit-summary-state__icon {
          background: #f1f5f9;
          color: #64748b;
          box-shadow: none;
        }

        .visit-summary-spinner {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          border: 3px solid #dbeafe;
          border-top-color: #2563eb;
          animation: visitSummarySpin 0.9s linear infinite;
          flex-shrink: 0;
        }

        @keyframes visitSummarySpin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 900px) {
          .visit-summaries-hero {
            grid-template-columns: 1fr;
          }

          .visit-summaries-stats {
            min-width: 0;
          }
        }

        @media (max-width: 720px) {
          .visit-summaries-page {
            max-width: none;
          }

          .visit-summaries-hero {
            padding: 1.15rem;
            border-radius: 12px;
          }

          .visit-summaries-hero__main,
          .visit-summary-state {
            align-items: flex-start;
          }

          .visit-summaries-hero h1 {
            font-size: 1.35rem;
          }

          .visit-summaries-stats {
            grid-template-columns: 1fr;
          }

          .visit-summaries-toolbar {
            flex-direction: column;
            align-items: stretch;
          }

          .visit-summary-card__header {
            grid-template-columns: 64px minmax(0, 1fr) 28px;
            gap: 0.75rem;
          }

          .visit-summary-date {
            padding: 0.85rem 0.3rem;
          }

          .visit-summary-date__day {
            font-size: 1.55rem;
          }

          .visit-summary-card__main {
            padding: 0.85rem 0;
          }

          .visit-summary-card h2 {
            font-size: 0.92rem;
          }

          .visit-summary-card p {
            font-size: 0.84rem;
          }

          .visit-summary-facts {
            display: none;
          }

          .visit-summary-chevron {
            margin-right: 0.45rem;
          }

          .visit-summary-card__details {
            padding: 0 1rem 1rem;
          }

          .visit-summary-detail-grid {
            grid-template-columns: 1fr;
          }

          .visit-summary-state {
            min-height: 220px;
            padding: 1.25rem;
            flex-direction: column;
          }
        }
      `}</style>
    </PatientPortalLayout>
  );
}
