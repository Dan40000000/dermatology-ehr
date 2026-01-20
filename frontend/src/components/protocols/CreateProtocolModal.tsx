import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { createProtocol } from '../../api';
import { ProtocolCategory } from '../../types/protocol';

interface CreateProtocolModalProps {
  onClose: () => void;
}

export function CreateProtocolModal({ onClose }: CreateProtocolModalProps) {
  const { tenantId, accessToken } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    category: 'medical' as ProtocolCategory,
    type: '',
    description: '',
    indication: '',
    contraindications: '',
    version: '1.0',
    status: 'draft' as 'draft' | 'active' | 'archived',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantId || !accessToken) return;

    setSaving(true);
    setError('');

    try {
      await createProtocol(tenantId, accessToken, formData);
      onClose();
    } catch (err: any) {
      console.error('Failed to create protocol:', err);
      setError(err.message || 'Failed to create protocol');
    } finally {
      setSaving(false);
    }
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
          width: '600px',
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ margin: 0 }}>Create New Protocol</h2>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
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
                Protocol Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Acne Treatment Ladder"
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                  Category *
                </label>
                <select
                  required
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value as ProtocolCategory })
                  }
                  style={{ width: '100%' }}
                >
                  <option value="medical">Medical Dermatology</option>
                  <option value="procedure">Procedures</option>
                  <option value="cosmetic">Cosmetic</option>
                  <option value="administrative">Administrative</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                  Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) =>
                    setFormData({ ...formData, status: e.target.value as 'draft' | 'active' | 'archived' })
                  }
                  style={{ width: '100%' }}
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                Type/Code
              </label>
              <input
                type="text"
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                placeholder="e.g., acne_treatment, psoriasis_algorithm"
                style={{ width: '100%' }}
              />
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Internal identifier for the protocol type
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of the protocol..."
                rows={3}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                Indications
              </label>
              <textarea
                value={formData.indication}
                onChange={(e) => setFormData({ ...formData, indication: e.target.value })}
                placeholder="When to use this protocol..."
                rows={2}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                Contraindications
              </label>
              <textarea
                value={formData.contraindications}
                onChange={(e) => setFormData({ ...formData, contraindications: e.target.value })}
                placeholder="When NOT to use this protocol..."
                rows={2}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                Version
              </label>
              <input
                type="text"
                value={formData.version}
                onChange={(e) => setFormData({ ...formData, version: e.target.value })}
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
            <button type="button" onClick={onClose} className="ghost" disabled={saving}>
              Cancel
            </button>
            <button type="submit" disabled={saving}>
              {saving ? 'Creating...' : 'Create Protocol'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
