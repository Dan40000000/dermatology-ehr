import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import ModifierHelper from './ModifierHelper';
import CosmeticClassifier from './CosmeticClassifier';
import { API_BASE_URL } from '../../utils/apiBase';

interface LineItem {
  cpt: string;
  modifiers?: string[];
  dx: string[];
  units: number;
  charge: number;
  description?: string;
}

interface ClaimEditorProps {
  claimId: string;
  onClose: () => void;
}

export default function ClaimEditor({ claimId, onClose }: ClaimEditorProps) {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [claim, setClaim] = useState<any>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [isCosmetic, setIsCosmetic] = useState(false);
  const [cosmeticReason, setCosmeticReason] = useState('');
  const [notes, setNotes] = useState('');
  const [showModifierHelper, setShowModifierHelper] = useState(false);
  const [showCosmeticClassifier, setShowCosmeticClassifier] = useState(false);

  useEffect(() => {
    loadClaim();
  }, [claimId]);

  const loadClaim = async () => {
    if (!session) return;

    setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/claims/${claimId}`,
        {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'x-tenant-id': session.tenantId,
          },
        }
      );

      if (!response.ok) throw new Error('Failed to load claim');

      const data = await response.json();
      setClaim(data.claim);
      setLineItems(data.claim.lineItems || []);
      setIsCosmetic(data.claim.isCosmetic || false);
      setCosmeticReason(data.claim.cosmeticReason || '');
    } catch (err: any) {
      showError(err.message || 'Failed to load claim');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!session) return;

    setSaving(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/claims/${claimId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.accessToken}`,
            'x-tenant-id': session.tenantId,
          },
          body: JSON.stringify({
            lineItems,
            isCosmetic,
            cosmeticReason,
            notes,
          }),
        }
      );

      if (!response.ok) throw new Error('Failed to save claim');

      showSuccess('Claim updated successfully');
      onClose();
    } catch (err: any) {
      showError(err.message || 'Failed to save claim');
    } finally {
      setSaving(false);
    }
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: any) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    setLineItems(updated);
  };

  const addModifier = (index: number, modifier: string) => {
    const updated = [...lineItems];
    if (!updated[index].modifiers) {
      updated[index].modifiers = [];
    }
    if (!updated[index].modifiers!.includes(modifier)) {
      updated[index].modifiers!.push(modifier);
    }
    setLineItems(updated);
  };

  const removeModifier = (index: number, modifier: string) => {
    const updated = [...lineItems];
    updated[index].modifiers = (updated[index].modifiers || []).filter(m => m !== modifier);
    setLineItems(updated);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-5xl w-full mx-4">
          <div className="animate-pulse">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full my-8">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Edit Claim</h2>
              {claim && (
                <div className="mt-1 text-sm text-gray-600">
                  Claim #{claim.claimNumber} • {claim.patientFirstName} {claim.patientLastName}
                </div>
              )}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Cosmetic Classification */}
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">Cosmetic Classification</h3>
              <button
                onClick={() => setShowCosmeticClassifier(true)}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Classification Guide
              </button>
            </div>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={isCosmetic}
                onChange={(e) => setIsCosmetic(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">Mark as Cosmetic (Patient Responsibility)</span>
            </label>
            {isCosmetic && (
              <textarea
                value={cosmeticReason}
                onChange={(e) => setCosmeticReason(e.target.value)}
                placeholder="Reason for cosmetic classification..."
                className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                rows={2}
              />
            )}
          </div>

          {/* Line Items */}
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">Line Items</h3>
              <button
                onClick={() => setShowModifierHelper(true)}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Modifier Helper
              </button>
            </div>
            <div className="space-y-4">
              {lineItems.map((item, index) => (
                <div key={index} className="border border-gray-200 rounded p-3 space-y-2">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">CPT Code</label>
                      <input
                        type="text"
                        value={item.cpt}
                        onChange={(e) => updateLineItem(index, 'cpt', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Units</label>
                      <input
                        type="number"
                        value={item.units}
                        onChange={(e) => updateLineItem(index, 'units', parseInt(e.target.value))}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Charge</label>
                      <input
                        type="number"
                        step="0.01"
                        value={item.charge}
                        onChange={(e) => updateLineItem(index, 'charge', parseFloat(e.target.value))}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Modifiers</label>
                    <div className="flex items-center space-x-2">
                      <div className="flex-1 flex flex-wrap gap-1">
                        {(item.modifiers || []).map((modifier) => (
                          <span
                            key={modifier}
                            className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded"
                          >
                            {modifier}
                            <button
                              onClick={() => removeModifier(index, modifier)}
                              className="ml-1 text-blue-600 hover:text-blue-800"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                      <input
                        type="text"
                        placeholder="Add modifier"
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            const value = (e.target as HTMLInputElement).value.trim();
                            if (value) {
                              addModifier(index, value);
                              (e.target as HTMLInputElement).value = '';
                            }
                          }
                        }}
                        className="w-24 px-2 py-1 border border-gray-300 rounded text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Diagnosis Codes (comma separated)</label>
                    <input
                      type="text"
                      value={(item.dx || []).join(', ')}
                      onChange={(e) => updateLineItem(index, 'dx', e.target.value.split(',').map(d => d.trim()))}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes for Biller
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes for billing staff..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              rows={3}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Modals */}
      {showModifierHelper && (
        <ModifierHelper
          claimId={claimId}
          onClose={() => setShowModifierHelper(false)}
          onApplyModifier={(lineIndex, modifier) => {
            addModifier(lineIndex, modifier);
            setShowModifierHelper(false);
          }}
        />
      )}

      {showCosmeticClassifier && (
        <CosmeticClassifier
          lineItems={lineItems}
          onClose={() => setShowCosmeticClassifier(false)}
        />
      )}
    </div>
  );
}
