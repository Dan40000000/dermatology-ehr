import { EmptyState } from '../components/ui/EmptyState';

const actionStyle = { minHeight: '44px', minWidth: '140px' };

export function PreferencesPage() {
  return (
    <div className="content-card">
      <div className="section-header">
        <div>
          <div className="eyebrow">Preferences</div>
          <h1>Preferences</h1>
          <p className="muted">Personalize defaults, notifications, and display settings.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button type="button" className="ghost" style={actionStyle}>
            Reset Defaults
          </button>
          <button type="button" style={actionStyle}>
            Save Preferences
          </button>
        </div>
      </div>
      <div style={{ padding: '1.5rem' }}>
        <EmptyState
          title="No preferences configured"
          description="Configure defaults to speed up documentation and scheduling."
        />
      </div>
    </div>
  );
}
