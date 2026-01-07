import { EmptyState } from '../components/ui/EmptyState';

const actionStyle = { minHeight: '44px', minWidth: '140px' };

export function RecallsPage() {
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
      <div style={{ padding: '1.5rem' }}>
        <EmptyState
          title="No recall campaigns"
          description="Create a campaign to notify patients and track responses."
        />
      </div>
    </div>
  );
}
