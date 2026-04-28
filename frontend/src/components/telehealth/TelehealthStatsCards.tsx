import React from 'react';
import type { TelehealthStats } from '../../api';

interface TelehealthStatsCardsProps {
  stats: TelehealthStats;
  onCardClick: (filter: string) => void;
  activeFilter: string | null;
}

const TelehealthStatsCards: React.FC<TelehealthStatsCardsProps> = ({
  stats,
  onCardClick,
  activeFilter,
}) => {
  const cards = [
    {
      id: 'today',
      label: "Today's Visits",
      value: stats.todayVisits,
      className: 'today',
    },
    {
      id: 'waiting',
      label: 'Waiting Room',
      value: stats.waitingNow,
      className: 'waiting',
    },
    {
      id: 'live',
      label: 'Live Now',
      value: stats.liveNow,
      className: 'live',
    },
    {
      id: 'upcoming_week',
      label: 'Upcoming 7 Days',
      value: stats.upcomingWeek,
      className: 'upcoming',
    },
    {
      id: 'completed_today',
      label: 'Completed Today',
      value: stats.completedToday,
      className: 'completed',
    },
    {
      id: 'cancelled',
      label: 'Cancelled / No-show',
      value: stats.cancelledThisWeek,
      className: 'cancelled',
    },
  ];

  return (
    <div className="telehealth-stats-section">
      <h2>Telehealth Overview</h2>
      <div className="telehealth-stats">
        {cards.map((card) => (
          <button
            key={card.id}
            className={`telehealth-stat-card ${card.className} ${
              activeFilter === card.id ? 'active' : ''
            }`}
            onClick={() => onCardClick(card.id)}
            type="button"
          >
            <div className="stat-value">{card.value}</div>
            <div className="stat-label">{card.label}</div>
          </button>
        ))}
      </div>

      <div className="telehealth-stats-summary">
        <div className="telehealth-summary-pill">
          <span className="summary-label">Avg completed visit</span>
          <span className="summary-value">
            {stats.averageCompletedDurationMinutes > 0
              ? `${stats.averageCompletedDurationMinutes} min`
              : 'n/a'}
          </span>
        </div>
        <div className="telehealth-summary-pill">
          <span className="summary-label">Unique patients in range</span>
          <span className="summary-value">{stats.uniquePatientsInRange}</span>
        </div>
        <div className="telehealth-summary-pill">
          <span className="summary-label">Providers scheduled</span>
          <span className="summary-value">{stats.providersWithTelehealth}</span>
        </div>
      </div>

      <style>{`
        .telehealth-stats-section {
          margin-bottom: 2rem;
        }

        .telehealth-stats-section h2 {
          margin: 0 0 1rem 0;
          padding: 0.75rem 1rem;
          background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%);
          color: white;
          border-radius: 8px;
          font-size: 1.125rem;
          font-weight: 600;
        }

        .telehealth-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.25rem;
          animation: fadeIn 0.5s ease-out 0.1s both;
        }

        @media (max-width: 1200px) {
          .telehealth-stats {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 640px) {
          .telehealth-stats {
            grid-template-columns: 1fr;
          }
        }

        .telehealth-stats-summary {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.875rem;
          margin-top: 1rem;
        }

        @media (max-width: 900px) {
          .telehealth-stats-summary {
            grid-template-columns: 1fr;
          }
        }

        .telehealth-summary-pill {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
          padding: 0.9rem 1rem;
          border-radius: 10px;
          background: #f8fafc;
          border: 1px solid #dbeafe;
        }

        .summary-label {
          font-size: 0.8rem;
          font-weight: 600;
          color: #475569;
        }

        .summary-value {
          font-size: 0.95rem;
          font-weight: 700;
          color: #0f172a;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        .telehealth-stat-card {
          background: white;
          border-radius: 12px;
          padding: 2rem 1.5rem;
          text-align: center;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
          transition: all 0.3s ease;
          border: 2px solid transparent;
          position: relative;
          overflow: hidden;
          cursor: pointer;
          width: 100%;
        }

        .telehealth-stat-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
        }

        .telehealth-stat-card.today {
          border-color: #0ea5e9;
        }

        .telehealth-stat-card.today::before {
          background: linear-gradient(90deg, #0ea5e9, #38bdf8);
        }

        .telehealth-stat-card.waiting {
          border-color: #f59e0b;
        }

        .telehealth-stat-card.waiting::before {
          background: linear-gradient(90deg, #f59e0b, #fbbf24);
        }

        .telehealth-stat-card.live {
          border-color: #0891b2;
        }

        .telehealth-stat-card.live::before {
          background: linear-gradient(90deg, #0891b2, #06b6d4);
        }

        .telehealth-stat-card.upcoming {
          border-color: #6366f1;
        }

        .telehealth-stat-card.upcoming::before {
          background: linear-gradient(90deg, #6366f1, #818cf8);
        }

        .telehealth-stat-card.completed {
          border-color: #16a34a;
        }

        .telehealth-stat-card.completed::before {
          background: linear-gradient(90deg, #16a34a, #4ade80);
        }

        .telehealth-stat-card.cancelled {
          border-color: #ef4444;
        }

        .telehealth-stat-card.cancelled::before {
          background: linear-gradient(90deg, #ef4444, #fb7185);
        }

        .telehealth-stat-card:hover,
        .telehealth-stat-card.active {
          transform: translateY(-4px);
          box-shadow: 0 8px 16px rgba(8, 145, 178, 0.2);
        }

        .telehealth-stat-card.active {
          border-color: #0e7490;
          background: linear-gradient(135deg, #ecfeff 0%, #cffafe 100%);
        }

        .telehealth-stat-card .stat-value {
          font-size: 3rem;
          font-weight: bold;
          color: #0e7490;
          line-height: 1;
          margin-bottom: 0.5rem;
        }

        .telehealth-stat-card .stat-label {
          font-size: 0.875rem;
          color: #0891b2;
          font-weight: 500;
        }
      `}</style>
    </div>
  );
};

export default TelehealthStatsCards;
