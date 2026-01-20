import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

interface ModifierSuggestion {
  modifier: string;
  name: string;
  description: string;
  reason: string;
  required: boolean;
  confidence: string;
}

interface ModifierRule {
  modifier_code: string;
  modifier_name: string;
  description: string;
  when_to_use: string;
  examples: any[];
}

interface ModifierHelperProps {
  claimId: string;
  onClose: () => void;
  onApplyModifier?: (lineIndex: number, modifier: string) => void;
}

export default function ModifierHelper({ claimId, onClose, onApplyModifier }: ModifierHelperProps) {
  const { session } = useAuth();
  const { showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState<ModifierSuggestion[]>([]);
  const [allModifiers, setAllModifiers] = useState<ModifierRule[]>([]);
  const [selectedModifier, setSelectedModifier] = useState<ModifierRule | null>(null);

  useEffect(() => {
    loadData();
  }, [claimId]);

  const loadData = async () => {
    if (!session) return;

    setLoading(true);
    try {
      // Get suggestions for this claim
      const apiBase = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? '' : 'http://localhost:4000');
      const suggestResponse = await fetch(
        `${apiBase}/api/claims/${claimId}/suggest-modifiers`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.accessToken}`,
            'x-tenant-id': session.tenantId,
          },
        }
      );

      if (suggestResponse.ok) {
        const suggestData = await suggestResponse.json();
        setSuggestions(suggestData.suggestions || []);
      }

      // Get all modifier rules
      const modifiersResponse = await fetch(
        `${apiBase}/api/claims/modifiers`,
        {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'x-tenant-id': session.tenantId,
          },
        }
      );

      if (modifiersResponse.ok) {
        const modifiersData = await modifiersResponse.json();
        setAllModifiers(modifiersData.modifiers || []);
      }
    } catch (err: any) {
      showError(err.message || 'Failed to load modifier data');
    } finally {
      setLoading(false);
    }
  };

  const getConfidenceBadge = (confidence: string) => {
    const classes = {
      high: 'bg-green-100 text-green-800',
      medium: 'bg-yellow-100 text-yellow-800',
      low: 'bg-gray-100 text-gray-800',
    };
    return classes[confidence as keyof typeof classes] || classes.low;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full my-8">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Modifier Helper</h2>
              <p className="text-sm text-gray-600 mt-1">Guidance on when to apply modifiers</p>
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
          {loading ? (
            <div className="animate-pulse space-y-4">
              <div className="h-20 bg-gray-200 rounded"></div>
              <div className="h-20 bg-gray-200 rounded"></div>
            </div>
          ) : (
            <>
              {/* Suggestions for this claim */}
              {suggestions.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3">Suggested for This Claim</h3>
                  <div className="space-y-3">
                    {suggestions.map((suggestion, idx) => (
                      <div
                        key={idx}
                        className={`border rounded-lg p-4 ${
                          suggestion.required ? 'border-red-300 bg-red-50' : 'border-blue-300 bg-blue-50'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2">
                              <span className="font-bold text-lg">{suggestion.modifier}</span>
                              <span className="text-sm font-semibold text-gray-700">{suggestion.name}</span>
                              {suggestion.required && (
                                <span className="px-2 py-0.5 bg-red-200 text-red-800 text-xs font-semibold rounded">
                                  REQUIRED
                                </span>
                              )}
                              <span className={`px-2 py-0.5 text-xs font-semibold rounded ${getConfidenceBadge(suggestion.confidence)}`}>
                                {suggestion.confidence} confidence
                              </span>
                            </div>
                            <p className="text-sm text-gray-700 mt-1">{suggestion.description}</p>
                            <p className="text-sm text-gray-600 mt-2">
                              <strong>Reason:</strong> {suggestion.reason}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Common Dermatology Modifiers */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">Common Dermatology Modifiers</h3>
                <div className="space-y-3">
                  {allModifiers.map((modifier) => (
                    <div key={modifier.modifier_code} className="border border-gray-200 rounded-lg">
                      <button
                        onClick={() => setSelectedModifier(
                          selectedModifier?.modifier_code === modifier.modifier_code ? null : modifier
                        )}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
                      >
                        <div className="flex items-center space-x-3">
                          <span className="font-bold text-lg text-gray-900">{modifier.modifier_code}</span>
                          <span className="text-sm font-medium text-gray-700">{modifier.modifier_name}</span>
                        </div>
                        <svg
                          className={`w-5 h-5 text-gray-400 transform transition-transform ${
                            selectedModifier?.modifier_code === modifier.modifier_code ? 'rotate-180' : ''
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {selectedModifier?.modifier_code === modifier.modifier_code && (
                        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 space-y-2">
                          <div>
                            <p className="text-sm font-medium text-gray-700">Description:</p>
                            <p className="text-sm text-gray-600">{modifier.description}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-700">When to Use:</p>
                            <p className="text-sm text-gray-600">{modifier.when_to_use}</p>
                          </div>
                          {modifier.examples && modifier.examples.length > 0 && (
                            <div>
                              <p className="text-sm font-medium text-gray-700">Examples:</p>
                              <ul className="text-sm text-gray-600 space-y-1 mt-1">
                                {modifier.examples.map((example: any, i: number) => (
                                  <li key={i} className="ml-4">
                                    • {example.scenario}
                                    {example.codes && <div className="ml-4 text-xs font-mono">{example.codes}</div>}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick Reference */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-2">Quick Reference</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="font-medium text-gray-700">Modifier 25:</p>
                    <p className="text-gray-600">E/M + procedure same day</p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-700">Modifier 59:</p>
                    <p className="text-gray-600">Distinct procedures</p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-700">Modifier XS:</p>
                    <p className="text-gray-600">Separate structure</p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-700">Modifier 76:</p>
                    <p className="text-gray-600">Repeat by same physician</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
