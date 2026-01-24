import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchProtocols, applyProtocol } from '../../api';
import type { Protocol } from '../../types/protocol';

interface ApplyProtocolModalProps {
  patientId: string;
  encounterId?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ApplyProtocolModal({
  patientId,
  encounterId,
  onClose,
  onSuccess,
}: ApplyProtocolModalProps) {
  const { tenantId, accessToken } = useAuth();
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProtocol, setSelectedProtocol] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  useEffect(() => {
    loadProtocols();
  }, [categoryFilter]);

  async function loadProtocols() {
    if (!tenantId || !accessToken) return;
    setLoading(true);
    try {
      const params: any = { status: 'active' };
      if (categoryFilter !== 'all') params.category = categoryFilter;

      const response = await fetchProtocols(tenantId, accessToken, params);
      setProtocols(response.data || []);
    } catch (error) {
      console.error('Failed to load protocols:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleApply(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantId || !accessToken || !selectedProtocol) return;

    setApplying(true);
    setError('');

    try {
      await applyProtocol(tenantId, accessToken, {
        protocol_id: selectedProtocol,
        patient_id: patientId,
        encounter_id: encounterId,
        notes,
      });
      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error('Failed to apply protocol:', err);
      setError(err.message || 'Failed to apply protocol');
    } finally {
      setApplying(false);
    }
  }

  const selectedProtocolData = protocols.find((p) => p.id === selectedProtocol);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'var(--bg)',
          borderRadius: '12px',
          padding: '0',
          maxWidth: '90vw',
          width: '600px',
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ margin: 0 }}>Apply Clinical Protocol</h2>
        </div>

        <form onSubmit={handleApply} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }}>
            {error && (
              <div
                style={{
                  padding: '1rem',
                  backgroundColor: '#fef2f2',
                  color: '#dc2626',
                  borderRadius: '8px',
                  marginBottom: '1rem',
                }}
              >
                {error}
              </div>
            )}

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                Category Filter
              </label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="all">All Categories</option>
                <option value="medical">Medical Dermatology</option>
                <option value="procedure">Procedures</option>
                <option value="cosmetic">Cosmetic</option>
                <option value="administrative">Administrative</option>
              </select>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                Select Protocol *
              </label>
              {loading ? (
                <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Loading protocols...
                </div>
              ) : protocols.length === 0 ? (
                <div
                  style={{
                    padding: '1rem',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                  }}
                >
                  No active protocols available
                </div>
              ) : (
                <div
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    maxHeight: '300px',
                    overflow: 'auto',
                  }}
                >
                  {protocols.map((protocol) => (
                    <label
                      key={protocol.id}
                      style={{
                        display: 'block',
                        padding: '1rem',
                        borderBottom: '1px solid var(--border)',
                        cursor: 'pointer',
                        backgroundColor:
                          selectedProtocol === protocol.id ? 'var(--primary-light)' : 'transparent',
                      }}
                    >
                      <input
                        type="radio"
                        name="protocol"
                        value={protocol.id}
                        checked={selectedProtocol === protocol.id}
                        onChange={(e) => setSelectedProtocol(e.target.value)}
                        style={{ marginRight: '0.75rem' }}
                      />
                      <div style={{ display: 'inline-block' }}>
                        <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                          {protocol.name}
                        </div>
                        {protocol.description && (
                          <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                            {protocol.description}
                          </div>
                        )}
                        <div
                          style={{
                            fontSize: '0.75rem',
                            color: 'var(--text-muted)',
                            marginTop: '0.25rem',
                          }}
                        >
                          {protocol.step_count || 0} steps
                          {protocol.category && ` • ${protocol.category}`}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {selectedProtocolData && (
              <div
                style={{
                  padding: '1rem',
                  backgroundColor: '#f0f9ff',
                  borderRadius: '8px',
                  marginBottom: '1rem',
                }}
              >
                <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                  Protocol Details
                </div>
                {selectedProtocolData.indication && (
                  <div style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                    <strong>Indications:</strong> {selectedProtocolData.indication}
                  </div>
                )}
                {selectedProtocolData.contraindications && (
                  <div
                    style={{
                      fontSize: '0.875rem',
                      marginTop: '0.5rem',
                      padding: '0.5rem',
                      backgroundColor: '#fef2f2',
                      borderRadius: '4px',
                    }}
                  >
                    <strong style={{ color: '#dc2626' }}>Contraindications:</strong>{' '}
                    {selectedProtocolData.contraindications}
                  </div>
                )}
              </div>
            )}

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                Notes (Optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any notes about applying this protocol..."
                rows={3}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div
            style={{
              padding: '1.5rem',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.75rem',
            }}
          >
            <button type="button" onClick={onClose} className="ghost" disabled={applying}>
              Cancel
            </button>
            <button type="submit" disabled={applying || !selectedProtocol}>
              {applying ? 'Applying...' : 'Apply Protocol'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
