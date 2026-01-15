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
      label: 'My cases in progress',
      value: stats.myInProgress,
      className: 'in-progress',
    },
    {
      id: 'completed',
      label: 'My completed cases',
      value: stats.myCompleted,
      className: 'completed',
    },
    {
      id: 'unread',
      label: 'My unread messages',
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
          background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%);
          color: white;
          border-radius: 8px;
          font-size: 1.125rem;
          font-weight: 600;
        }

        .telehealth-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
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
          border-color: #0891b2;
        }

        .telehealth-stat-card.in-progress::before {
          background: linear-gradient(90deg, #0891b2, #06b6d4);
        }

        .telehealth-stat-card.completed {
          border-color: #0891b2;
        }

        .telehealth-stat-card.completed::before {
          background: linear-gradient(90deg, #0891b2, #06b6d4);
        }

        .telehealth-stat-card.unread {
          border-color: #0891b2;
        }

        .telehealth-stat-card.unread::before {
          background: linear-gradient(90deg, #0891b2, #06b6d4);
        }

        .telehealth-stat-card.unassigned {
          border-color: #0891b2;
        }

        .telehealth-stat-card.unassigned::before {
          background: linear-gradient(90deg, #0891b2, #06b6d4);
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
