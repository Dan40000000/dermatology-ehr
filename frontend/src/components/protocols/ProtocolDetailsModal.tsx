import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchProtocol } from '../../api';
import { ProtocolWithDetails } from '../../types/protocol';

interface ProtocolDetailsModalProps {
  protocolId: string;
  onClose: () => void;
}

export function ProtocolDetailsModal({ protocolId, onClose }: ProtocolDetailsModalProps) {
  const { tenantId, accessToken } = useAuth();
  const [protocol, setProtocol] = useState<ProtocolWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'steps' | 'orders' | 'handouts'>('steps');

  useEffect(() => {
    loadProtocol();
  }, [protocolId]);

  async function loadProtocol() {
    if (!tenantId || !accessToken) return;
    setLoading(true);
    try {
      const data = await fetchProtocol(tenantId, accessToken, protocolId);
      setProtocol(data);
    } catch (error) {
      console.error('Failed to load protocol:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading || !protocol) {
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
      >
        <div
          style={{
            backgroundColor: 'var(--bg)',
            borderRadius: '12px',
            padding: '2rem',
            maxWidth: '90vw',
            maxHeight: '90vh',
            overflow: 'auto',
          }}
        >
          <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading protocol details...
          </div>
        </div>
      </div>
    );
  }

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
          width: '1000px',
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.5rem',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'start',
          }}
        >
          <div>
            <h2 style={{ margin: '0 0 0.5rem 0' }}>{protocol.name}</h2>
            {protocol.description && (
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                {protocol.description}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} style={{ padding: '0.5rem' }}>
            Close
          </button>
        </div>

        {/* Info Cards */}
        <div
          style={{
            padding: '1.5rem',
            borderBottom: '1px solid var(--border)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
              Category
            </div>
            <div style={{ fontWeight: 600 }}>{protocol.category}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
              Status
            </div>
            <div style={{ fontWeight: 600 }}>{protocol.status}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
              Version
            </div>
            <div style={{ fontWeight: 600 }}>{protocol.version}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
              Steps
            </div>
            <div style={{ fontWeight: 600 }}>{protocol.steps.length}</div>
          </div>
        </div>

        {protocol.indication && (
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Indications
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              {protocol.indication}
            </div>
          </div>
        )}

        {protocol.contraindications && (
          <div
            style={{
              padding: '1.5rem',
              borderBottom: '1px solid var(--border)',
              backgroundColor: '#fef2f2',
            }}
          >
            <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: '#dc2626' }}>
              Contraindications
            </div>
            <div style={{ fontSize: '0.875rem', color: '#7f1d1d' }}>
              {protocol.contraindications}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{ borderBottom: '1px solid var(--border)', display: 'flex', padding: '0 1.5rem' }}>
          <button
            type="button"
            onClick={() => setActiveTab('steps')}
            style={{
              padding: '1rem 1.5rem',
              border: 'none',
              background: 'none',
              borderBottom: activeTab === 'steps' ? '2px solid var(--primary)' : '2px solid transparent',
              fontWeight: activeTab === 'steps' ? 600 : 400,
              color: activeTab === 'steps' ? 'var(--primary)' : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            Steps ({protocol.steps.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            style={{
              padding: '1rem 1.5rem',
              border: 'none',
              background: 'none',
              borderBottom: activeTab === 'orders' ? '2px solid var(--primary)' : '2px solid transparent',
              fontWeight: activeTab === 'orders' ? 600 : 400,
              color: activeTab === 'orders' ? 'var(--primary)' : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            Order Sets ({protocol.order_sets.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('handouts')}
            style={{
              padding: '1rem 1.5rem',
              border: 'none',
              background: 'none',
              borderBottom: activeTab === 'handouts' ? '2px solid var(--primary)' : '2px solid transparent',
              fontWeight: activeTab === 'handouts' ? 600 : 400,
              color: activeTab === 'handouts' ? 'var(--primary)' : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            Handouts ({protocol.handouts.length})
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }}>
          {activeTab === 'steps' && (
            <div style={{ display: 'grid', gap: '1rem' }}>
              {protocol.steps.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No steps defined for this protocol
                </div>
              ) : (
                protocol.steps.map((step, index) => (
                  <div
                    key={step.id}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '1rem',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem' }}>
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          backgroundColor: 'var(--primary)',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 600,
                          flexShrink: 0,
                        }}
                      >
                        {step.step_number}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{step.title}</div>
                        <div
                          style={{
                            fontSize: '0.75rem',
                            padding: '0.25rem 0.5rem',
                            backgroundColor: 'var(--border)',
                            borderRadius: '4px',
                            display: 'inline-block',
                          }}
                        >
                          {step.action_type.replace(/_/g, ' ')}
                        </div>
                      </div>
                    </div>
                    {step.description && (
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                        {step.description}
                      </div>
                    )}
                    {step.medication_name && (
                      <div style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                        <strong>Medication:</strong> {step.medication_name}
                        {step.medication_dosage && ` - ${step.medication_dosage}`}
                        {step.medication_frequency && ` ${step.medication_frequency}`}
                        {step.medication_duration && ` for ${step.medication_duration}`}
                      </div>
                    )}
                    {step.procedure_code && (
                      <div style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                        <strong>Procedure:</strong> {step.procedure_code}
                      </div>
                    )}
                    {step.timing && (
                      <div style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                        <strong>Timing:</strong> {step.timing}
                      </div>
                    )}
                    {step.warnings && (
                      <div
                        style={{
                          fontSize: '0.875rem',
                          marginTop: '0.75rem',
                          padding: '0.75rem',
                          backgroundColor: '#fef2f2',
                          borderLeft: '3px solid #dc2626',
                          borderRadius: '4px',
                        }}
                      >
                        <strong style={{ color: '#dc2626' }}>Warning:</strong> {step.warnings}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'orders' && (
            <div style={{ display: 'grid', gap: '1rem' }}>
              {protocol.order_sets.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No order sets defined for this protocol
                </div>
              ) : (
                protocol.order_sets.map((orderSet) => (
                  <div
                    key={orderSet.id}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '1rem',
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{orderSet.name}</div>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        padding: '0.25rem 0.5rem',
                        backgroundColor: 'var(--border)',
                        borderRadius: '4px',
                        display: 'inline-block',
                        marginBottom: '0.75rem',
                      }}
                    >
                      {orderSet.order_type}
                    </div>
                    {orderSet.description && (
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                        {orderSet.description}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'handouts' && (
            <div style={{ display: 'grid', gap: '1rem' }}>
              {protocol.handouts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No handouts defined for this protocol
                </div>
              ) : (
                protocol.handouts.map((handout) => (
                  <div
                    key={handout.id}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '1rem',
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{handout.title}</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                      {handout.content.substring(0, 200)}
                      {handout.content.length > 200 && '...'}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
