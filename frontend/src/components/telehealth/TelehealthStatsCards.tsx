import React from 'react';

export interface TelehealthStats {
  myInProgress: number;
  myCompleted: number;
  myUnreadMessages: number;
  unassignedCases: number;
}

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
      id: 'in_progress',
      label: 'My Cases In Progress',
      value: stats.myInProgress,
      className: 'in-progress',
    },
    {
      id: 'completed',
      label: 'My Completed Cases',
      value: stats.myCompleted,
      className: 'completed',
    },
    {
      id: 'unread',
      label: 'My Unread Messages',
      value: stats.myUnreadMessages,
      className: 'unread',
    },
    {
      id: 'unassigned',
      label: 'Unassigned Cases',
      value: stats.unassignedCases,
      className: 'unassigned',
    },
  ];

  return (
    <div className="telehealth-stats-section">
      <h2>Current Telehealth Stats</h2>
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

      <style>{`
        .telehealth-stats-section {
          margin-bottom: 2rem;
        }

        .telehealth-stats-section h2 {
          margin: 0 0 1rem 0;
          padding: 0.75rem 1rem;
          background: linear-gradient(135deg, #6ee7b7 0%, #34d399 100%);
          color: white;
          border-radius: 8px;
          font-size: 1.125rem;
        }

        .telehealth-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1.25rem;
          animation: fadeIn 0.5s ease-out 0.1s both;
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

        .telehealth-stat-card.in-progress {
          border-color: #059669;
        }

        .telehealth-stat-card.in-progress::before {
          background: linear-gradient(90deg, #059669, #10b981);
        }

        .telehealth-stat-card.completed {
          border-color: #059669;
        }

        .telehealth-stat-card.completed::before {
          background: linear-gradient(90deg, #059669, #10b981);
        }

        .telehealth-stat-card.unread {
          border-color: #059669;
        }

        .telehealth-stat-card.unread::before {
          background: linear-gradient(90deg, #059669, #10b981);
        }

        .telehealth-stat-card.unassigned {
          border-color: #059669;
        }

        .telehealth-stat-card.unassigned::before {
          background: linear-gradient(90deg, #059669, #10b981);
        }

        .telehealth-stat-card:hover,
        .telehealth-stat-card.active {
          transform: translateY(-4px);
          box-shadow: 0 8px 16px rgba(5, 150, 105, 0.2);
        }

        .telehealth-stat-card.active {
          border-color: #047857;
          background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
        }

        .telehealth-stat-card .stat-value {
          font-size: 3rem;
          font-weight: bold;
          color: #065f46;
          line-height: 1;
          margin-bottom: 0.5rem;
        }

        .telehealth-stat-card .stat-label {
          font-size: 0.875rem;
          color: #059669;
          font-weight: 500;
        }
      `}</style>
    </div>
  );
};

export default TelehealthStatsCards;
