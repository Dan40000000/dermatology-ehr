import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EmptyState } from '../components/ui/EmptyState';

const actionStyle = { minHeight: '44px', minWidth: '140px' };

type FilterType = 'all' | 'today' | 'overdue' | 'completed';

export function RecallsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');

  // Read filter from URL on page load
  useEffect(() => {
    const filterParam = searchParams.get('filter');
    if (filterParam === 'today' || filterParam === 'overdue' || filterParam === 'completed') {
      setActiveFilter(filterParam);
    } else {
      setActiveFilter('all');
    }
  }, [searchParams]);

  // Update filter and URL
  const handleFilterChange = (filter: FilterType) => {
    setActiveFilter(filter);
    if (filter === 'all') {
      // Remove filter param for 'all'
      searchParams.delete('filter');
      setSearchParams(searchParams);
    } else {
      setSearchParams({ filter });
    }
  };

  const getEmptyStateMessage = () => {
    switch (activeFilter) {
      case 'today':
        return {
          title: 'No recalls due today',
          description: 'There are no recall campaigns scheduled for today.',
        };
      case 'overdue':
        return {
          title: 'No overdue recalls',
          description: 'All recall campaigns are on track.',
        };
      case 'completed':
        return {
          title: 'No completed recalls',
          description: 'No recall campaigns have been completed yet.',
        };
      default:
        return {
          title: 'No recall campaigns',
          description: 'Create a campaign to notify patients and track responses.',
        };
    }
  };

  const emptyState = getEmptyStateMessage();

  return (
    <div className="content-card">
      <div className="section-header">
        <div>
          <div className="eyebrow">Recalls</div>
          <h1>Recalls</h1>
          <p className="muted">Plan and track recall campaigns and follow-ups.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button type="button" className="ghost" style={actionStyle}>
            Import Recalls
          </button>
          <button type="button" style={actionStyle}>
            New Recall Campaign
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{
        padding: '0 1.5rem',
        borderBottom: '1px solid var(--border-color, #e5e7eb)',
        display: 'flex',
        gap: '1rem'
      }}>
        <button
          type="button"
          onClick={() => handleFilterChange('all')}
          style={{
            padding: '0.75rem 1rem',
            background: 'none',
            border: 'none',
            borderBottom: activeFilter === 'all' ? '2px solid var(--primary-color, #3b82f6)' : '2px solid transparent',
            color: activeFilter === 'all' ? 'var(--primary-color, #3b82f6)' : 'var(--text-color, #4b5563)',
            fontWeight: activeFilter === 'all' ? 600 : 400,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          All Recalls
        </button>
        <button
          type="button"
          onClick={() => handleFilterChange('today')}
          style={{
            padding: '0.75rem 1rem',
            background: 'none',
            border: 'none',
            borderBottom: activeFilter === 'today' ? '2px solid var(--primary-color, #3b82f6)' : '2px solid transparent',
            color: activeFilter === 'today' ? 'var(--primary-color, #3b82f6)' : 'var(--text-color, #4b5563)',
            fontWeight: activeFilter === 'today' ? 600 : 400,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          Due Today
        </button>
        <button
          type="button"
          onClick={() => handleFilterChange('overdue')}
          style={{
            padding: '0.75rem 1rem',
            background: 'none',
            border: 'none',
            borderBottom: activeFilter === 'overdue' ? '2px solid var(--primary-color, #3b82f6)' : '2px solid transparent',
            color: activeFilter === 'overdue' ? 'var(--primary-color, #3b82f6)' : 'var(--text-color, #4b5563)',
            fontWeight: activeFilter === 'overdue' ? 600 : 400,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          Overdue
        </button>
        <button
          type="button"
          onClick={() => handleFilterChange('completed')}
          style={{
            padding: '0.75rem 1rem',
            background: 'none',
            border: 'none',
            borderBottom: activeFilter === 'completed' ? '2px solid var(--primary-color, #3b82f6)' : '2px solid transparent',
            color: activeFilter === 'completed' ? 'var(--primary-color, #3b82f6)' : 'var(--text-color, #4b5563)',
            fontWeight: activeFilter === 'completed' ? 600 : 400,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          Completed
        </button>
      </div>

      <div style={{ padding: '1.5rem' }}>
        <EmptyState
          title={emptyState.title}
          description={emptyState.description}
        />
      </div>
    </div>
  );
}
