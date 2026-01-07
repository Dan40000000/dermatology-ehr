import { EmptyState } from '../components/ui/EmptyState';

const actionStyle = { minHeight: '44px', minWidth: '140px' };

export function ProtocolsPage() {
  return (
    <div className="content-card">
      <div className="section-header">
        <div>
          <div className="eyebrow">Protocols</div>
          <h1>Protocols</h1>
          <p className="muted">Define clinical pathways, order sets, and care plans.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button type="button" className="ghost" style={actionStyle}>
            Import Protocols
          </button>
          <button type="button" style={actionStyle}>
            New Protocol
          </button>
        </div>
      </div>
      <div style={{ padding: '1.5rem' }}>
        <EmptyState
          title="No protocols yet"
          description="Create protocols to standardize care and reduce clicks."
        />
      </div>
    </div>
  );
}
