import { useState, useEffect } from 'react';
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

export function PortalVisitSummariesPage() {
  const [summaries, setSummaries] = useState<VisitSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadVisitSummaries();
  }, []);

  const loadVisitSummaries = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await patientPortalFetch('/api/patient-portal-data/visit-summaries');
      setSummaries(data.summaries || []);
    } catch (err) {
      console.error('Failed to load visit summaries:', err);
      setError('Unable to load visit summaries. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const toggleCard = (id: string) => {
    setExpandedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <PatientPortalLayout>
      <div className="portal-visit-summaries">
        <header className="portal-page-header">
          <h1>Your Visit Summaries</h1>
          <p>Review summaries from your past appointments with your healthcare providers</p>
        </header>

        {loading ? (
          <div className="portal-loading">
            <div className="loading-spinner"></div>
            <p>Loading your visit summaries...</p>
          </div>
        ) : error ? (
          <div className="portal-error-message">
            <div className="error-icon">!</div>
            <p>{error}</p>
            <button onClick={loadVisitSummaries} className="retry-btn">Try Again</button>
          </div>
        ) : summaries.length === 0 ? (
          <div className="portal-empty-state">
            <div className="empty-icon"></div>
            <h2>No visit summaries yet</h2>
            <p>After your appointments, your provider may share a summary here.</p>
            <p className="empty-hint">Visit summaries typically include information about your visit, diagnosis, treatment plan, and next steps.</p>
          </div>
        ) : (
          <div className="summaries-list">
            {summaries.map((summary) => {
              const isExpanded = expandedCards.has(summary.id);

              return (
                <div key={summary.id} className={`summary-card ${isExpanded ? 'expanded' : ''}`}>
                  <div className="summary-header" onClick={() => toggleCard(summary.id)}>
                    <div className="summary-main-info">
                      <div className="visit-date-badge">
                        {formatDate(summary.visitDate)}
                      </div>
                      <h3 className="provider-name">{summary.providerName}</h3>
                      {summary.summaryText && (
                        <p className="summary-preview">{summary.summaryText}</p>
                      )}
                    </div>
                    <button className="expand-btn" aria-label={isExpanded ? 'Collapse' : 'Expand'}>
                      <span className={`expand-icon ${isExpanded ? 'expanded' : ''}`}>›</span>
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="summary-details">
                      {summary.symptomsDiscussed && summary.symptomsDiscussed.length > 0 && (
                        <div className="detail-section">
                          <h4>What We Discussed</h4>
                          <ul className="symptoms-list">
                            {summary.symptomsDiscussed.map((symptom, idx) => (
                              <li key={idx}>{symptom}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {summary.diagnosisShared && (
                        <div className="detail-section">
                          <h4>Diagnosis</h4>
                          <p>{summary.diagnosisShared}</p>
                        </div>
                      )}

                      {summary.treatmentPlan && (
                        <div className="detail-section">
                          <h4>Treatment Plan</h4>
                          <p>{summary.treatmentPlan}</p>
                        </div>
                      )}

                      {summary.nextSteps && (
                        <div className="detail-section">
                          <h4>Next Steps</h4>
                          <p>{summary.nextSteps}</p>
                        </div>
                      )}

                      {summary.followUpDate && (
                        <div className="detail-section follow-up">
                          <h4>Follow-up Appointment</h4>
                          <p className="follow-up-date">
                            {formatDate(summary.followUpDate)}
                          </p>
                        </div>
                      )}

                      <div className="summary-footer">
                        <p className="summary-timestamp">
                          Summary created: {new Date(summary.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        .portal-visit-summaries {
          max-width: 900px;
        }

        .portal-page-header {
          margin-bottom: 2rem;
        }

        .portal-page-header h1 {
          font-size: 2rem;
          color: #1f2937;
          margin: 0 0 0.5rem 0;
          font-weight: 700;
        }

        .portal-page-header p {
          color: #6b7280;
          margin: 0;
          font-size: 1rem;
        }

        .portal-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 4rem 2rem;
          gap: 1rem;
        }

        .loading-spinner {
          width: 48px;
          height: 48px;
          border: 4px solid #e5e7eb;
          border-top-color: #7c3aed;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .portal-loading p {
          color: #6b7280;
          font-size: 1rem;
        }

        .portal-error-message {
          background: #fee2e2;
          border: 1px solid #fecaca;
          border-radius: 12px;
          padding: 2rem;
          text-align: center;
        }

        .error-icon {
          width: 48px;
          height: 48px;
          background: #dc2626;
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
          font-weight: 700;
          margin: 0 auto 1rem;
        }

        .portal-error-message p {
          color: #991b1b;
          margin: 0 0 1rem 0;
        }

        .retry-btn {
          background: #7c3aed;
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }

        .retry-btn:hover {
          background: #6B46C1;
        }

        .portal-empty-state {
          background: white;
          border-radius: 12px;
          padding: 4rem 2rem;
          text-align: center;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }

        .empty-icon {
          width: 80px;
          height: 80px;
          background: #f3f4f6;
          border-radius: 50%;
          margin: 0 auto 1.5rem;
        }

        .portal-empty-state h2 {
          font-size: 1.5rem;
          color: #1f2937;
          margin: 0 0 0.75rem 0;
          font-weight: 600;
        }

        .portal-empty-state p {
          color: #6b7280;
          margin: 0 0 0.5rem 0;
          font-size: 1rem;
        }

        .empty-hint {
          font-size: 0.875rem !important;
          color: #9ca3af !important;
          max-width: 500px;
          margin: 1rem auto 0 !important;
        }

        .summaries-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .summary-card {
          background: white;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          overflow: hidden;
          transition: all 0.3s;
          border: 2px solid transparent;
        }

        .summary-card:hover {
          box-shadow: 0 4px 12px rgba(124, 58, 237, 0.1);
          border-color: #e9d5ff;
        }

        .summary-card.expanded {
          box-shadow: 0 8px 24px rgba(124, 58, 237, 0.15);
          border-color: #7c3aed;
        }

        .summary-header {
          padding: 1.5rem;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          cursor: pointer;
          transition: background 0.2s;
        }

        .summary-header:hover {
          background: #fafafa;
        }

        .summary-main-info {
          flex: 1;
        }

        .visit-date-badge {
          display: inline-block;
          background: linear-gradient(135deg, #7c3aed 0%, #6B46C1 100%);
          color: white;
          padding: 0.375rem 0.875rem;
          border-radius: 6px;
          font-size: 0.875rem;
          font-weight: 600;
          margin-bottom: 0.75rem;
        }

        .provider-name {
          font-size: 1.125rem;
          color: #1f2937;
          margin: 0 0 0.5rem 0;
          font-weight: 600;
        }

        .summary-preview {
          color: #6b7280;
          margin: 0;
          font-size: 0.9375rem;
          line-height: 1.5;
        }

        .expand-btn {
          background: none;
          border: none;
          padding: 0.5rem;
          cursor: pointer;
          transition: transform 0.2s;
        }

        .expand-icon {
          display: inline-block;
          font-size: 1.5rem;
          color: #7c3aed;
          transition: transform 0.2s;
          font-weight: 700;
        }

        .expand-icon.expanded {
          transform: rotate(90deg);
        }

        .summary-details {
          padding: 0 1.5rem 1.5rem;
          animation: slideDown 0.3s ease-out;
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .detail-section {
          margin-bottom: 1.5rem;
          padding-bottom: 1.5rem;
          border-bottom: 1px solid #e5e7eb;
        }

        .detail-section:last-of-type {
          border-bottom: none;
        }

        .detail-section h4 {
          font-size: 0.9375rem;
          color: #7c3aed;
          margin: 0 0 0.75rem 0;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.025em;
        }

        .detail-section p {
          color: #374151;
          margin: 0;
          font-size: 0.9375rem;
          line-height: 1.6;
        }

        .symptoms-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .symptoms-list li {
          padding: 0.5rem 0 0.5rem 1.5rem;
          position: relative;
          color: #374151;
          font-size: 0.9375rem;
        }

        .symptoms-list li::before {
          content: '•';
          position: absolute;
          left: 0.5rem;
          color: #7c3aed;
          font-size: 1.25rem;
          line-height: 1;
        }

        .detail-section.follow-up {
          background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%);
          padding: 1rem;
          border-radius: 8px;
          border: none;
        }

        .follow-up-date {
          font-weight: 600;
          color: #7c3aed;
          font-size: 1rem !important;
        }

        .summary-footer {
          padding-top: 1rem;
          border-top: 1px solid #e5e7eb;
        }

        .summary-timestamp {
          color: #9ca3af;
          font-size: 0.8125rem;
          margin: 0;
          text-align: right;
        }

        @media (max-width: 768px) {
          .portal-page-header h1 {
            font-size: 1.5rem;
          }

          .summary-card {
            margin: 0 -0.5rem;
          }

          .summary-header {
            padding: 1rem;
          }

          .summary-details {
            padding: 0 1rem 1rem;
          }

          .visit-date-badge {
            font-size: 0.8125rem;
            padding: 0.25rem 0.625rem;
          }

          .provider-name {
            font-size: 1rem;
          }

          .summary-preview {
            font-size: 0.875rem;
          }
        }
      `}</style>
    </PatientPortalLayout>
  );
}
