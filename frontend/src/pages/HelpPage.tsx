import { EmptyState } from '../components/ui/EmptyState';

const actionStyle = { minHeight: '44px', minWidth: '140px' };

export function HelpPage() {
  return (
    <div className="content-card">
      <div className="section-header">
        <div>
          <div className="eyebrow">Help</div>
          <h1>Help</h1>
          <p className="muted">Find guides, training, and support resources.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button type="button" className="ghost" style={actionStyle}>
            View Guides
          </button>
          <button type="button" style={actionStyle}>
            Contact Support
          </button>
        </div>
      </div>
      <div style={{ padding: '1.5rem' }}>
        <EmptyState
          title="Help resources coming soon"
          description="Training materials and support links will appear here."
        />
      </div>
    </div>
  );
}
