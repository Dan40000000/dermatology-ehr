import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchProtocols, fetchProtocolStats, deleteProtocol } from '../api';
import { Protocol, ProtocolStats, ProtocolCategory } from '../types/protocol';
import { EmptyState } from '../components/ui/EmptyState';
import { ProtocolDetailsModal } from '../components/protocols/ProtocolDetailsModal';
import { CreateProtocolModal } from '../components/protocols/CreateProtocolModal';

const actionStyle = { minHeight: '44px', minWidth: '140px' };

const categoryColors: Record<ProtocolCategory, string> = {
  medical: '#3b82f6',
  procedure: '#8b5cf6',
  cosmetic: '#ec4899',
  administrative: '#64748b',
};

const categoryLabels: Record<ProtocolCategory, string> = {
  medical: 'Medical Dermatology',
  procedure: 'Procedures',
  cosmetic: 'Cosmetic',
  administrative: 'Administrative',
};

export function ProtocolsPage() {
  const { tenantId, accessToken } = useAuth();
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [stats, setStats] = useState<ProtocolStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProtocol, setSelectedProtocol] = useState<Protocol | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadProtocols();
    loadStats();
  }, [selectedCategory, selectedStatus, searchQuery]);

  async function loadProtocols() {
    if (!tenantId || !accessToken) return;
    setLoading(true);
    try {
      const params: any = { status: selectedStatus };
      if (selectedCategory !== 'all') params.category = selectedCategory;
      if (searchQuery) params.search = searchQuery;

      const response = await fetchProtocols(tenantId, accessToken, params);
      setProtocols(response.data || []);
    } catch (error) {
      console.error('Failed to load protocols:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadStats() {
    if (!tenantId || !accessToken) return;
    try {
      const response = await fetchProtocolStats(tenantId, accessToken);
      setStats(response);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }

  async function handleDelete(protocolId: string) {
    if (!tenantId || !accessToken) return;
    if (!confirm('Are you sure you want to delete this protocol?')) return;

    try {
      await deleteProtocol(tenantId, accessToken, protocolId);
      loadProtocols();
      loadStats();
    } catch (error) {
      console.error('Failed to delete protocol:', error);
      alert('Failed to delete protocol');
    }
  }

  const filteredProtocols = protocols;

  return (
    <div className="content-card">
      <div className="section-header">
        <div>
          <div className="eyebrow">Clinical Protocols</div>
          <h1>Treatment Protocols</h1>
          <p className="muted">
            Evidence-based treatment algorithms and clinical pathways for dermatology care
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="ghost"
            style={actionStyle}
            onClick={() => setShowCreateModal(true)}
          >
            Import Protocols
          </button>
          <button
            type="button"
            style={actionStyle}
            onClick={() => setShowCreateModal(true)}
          >
            New Protocol
          </button>
        </div>
      </div>

      {stats && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            padding: '1.5rem',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              Active Protocols
            </div>
            <div style={{ fontSize: '1.875rem', fontWeight: 600, marginTop: '0.25rem' }}>
              {stats.active_protocols}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              Total Applications
            </div>
            <div style={{ fontSize: '1.875rem', fontWeight: 600, marginTop: '0.25rem' }}>
              {stats.total_applications}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              Currently Active
            </div>
            <div style={{ fontSize: '1.875rem', fontWeight: 600, marginTop: '0.25rem' }}>
              {stats.active_applications}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              Completed
            </div>
            <div style={{ fontSize: '1.875rem', fontWeight: 600, marginTop: '0.25rem' }}>
              {stats.completed_applications}
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)' }}>
        <div
          style={{
            display: 'flex',
            gap: '1rem',
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <input
            type="text"
            placeholder="Search protocols..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ flex: '1 1 300px', minWidth: '200px' }}
          />
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{ minWidth: '180px' }}
          >
            <option value="all">All Categories</option>
            <option value="medical">Medical Dermatology</option>
            <option value="procedure">Procedures</option>
            <option value="cosmetic">Cosmetic</option>
            <option value="administrative">Administrative</option>
          </select>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            style={{ minWidth: '150px' }}
          >
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      <div style={{ padding: '1.5rem' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            Loading protocols...
          </div>
        ) : filteredProtocols.length === 0 ? (
          <EmptyState
            title="No protocols found"
            description={
              searchQuery || selectedCategory !== 'all'
                ? 'Try adjusting your filters'
                : 'Create protocols to standardize care and improve outcomes'
            }
          />
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {filteredProtocols.map((protocol) => (
              <ProtocolCard
                key={protocol.id}
                protocol={protocol}
                onView={() => setSelectedProtocol(protocol)}
                onDelete={() => handleDelete(protocol.id)}
              />
            ))}
          </div>
        )}
      </div>

      {selectedProtocol && (
        <ProtocolDetailsModal
          protocolId={selectedProtocol.id}
          onClose={() => {
            setSelectedProtocol(null);
            loadProtocols();
            loadStats();
          }}
        />
      )}

      {showCreateModal && (
        <CreateProtocolModal
          onClose={() => {
            setShowCreateModal(false);
            loadProtocols();
            loadStats();
          }}
        />
      )}
    </div>
  );
}

interface ProtocolCardProps {
  protocol: Protocol;
  onView: () => void;
  onDelete: () => void;
}

function ProtocolCard({ protocol, onView, onDelete }: ProtocolCardProps) {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '1.25rem',
        backgroundColor: 'var(--bg)',
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
      onClick={onView}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = categoryColors[protocol.category];
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.125rem' }}>{protocol.name}</h3>
            <span
              style={{
                padding: '0.25rem 0.75rem',
                borderRadius: '12px',
                fontSize: '0.75rem',
                fontWeight: 600,
                backgroundColor: categoryColors[protocol.category] + '20',
                color: categoryColors[protocol.category],
              }}
            >
              {categoryLabels[protocol.category]}
            </span>
            {protocol.status !== 'active' && (
              <span
                style={{
                  padding: '0.25rem 0.75rem',
                  borderRadius: '12px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  backgroundColor: 'var(--border)',
                  color: 'var(--text-muted)',
                }}
              >
                {protocol.status}
              </span>
            )}
          </div>
          {protocol.description && (
            <p
              style={{
                margin: '0.5rem 0',
                color: 'var(--text-muted)',
                fontSize: '0.875rem',
                lineHeight: 1.5,
              }}
            >
              {protocol.description}
            </p>
          )}
          <div
            style={{
              display: 'flex',
              gap: '1.5rem',
              marginTop: '0.75rem',
              fontSize: '0.875rem',
              color: 'var(--text-muted)',
            }}
          >
            <div>
              <strong>{protocol.step_count || 0}</strong> steps
            </div>
            <div>
              <strong>{protocol.active_applications || 0}</strong> active applications
            </div>
            {protocol.version && (
              <div>
                Version <strong>{protocol.version}</strong>
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          className="ghost"
          style={{ padding: '0.5rem' }}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
