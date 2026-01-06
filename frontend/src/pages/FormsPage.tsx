import { EmptyState } from '../components/ui/EmptyState';

const actionStyle = { minHeight: '44px', minWidth: '140px' };

export function FormsPage() {
  return (
    <div className="content-card">
      <div className="section-header">
        <div>
          <div className="eyebrow">Forms</div>
          <h1>Forms</h1>
          <p className="muted">Create, assign, and track clinical and intake forms.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button type="button" className="ghost" style={actionStyle}>
            Import Forms
          </button>
          <button type="button" style={actionStyle}>
            New Form
          </button>
        </div>
      </div>
      <div style={{ padding: '1.5rem' }}>
        <EmptyState
          title="No forms configured"
          description="Build templates for intake, consent, and clinical questionnaires."
        />
      </div>
    </div>
  );
}
