import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Modal } from '../ui';
import {
  fetchInventoryItems,
  recordInventoryUsage,
  type InventoryItem,
} from '../../api';

interface InventoryUsageModalProps {
  isOpen: boolean;
  onClose: () => void;
  encounterId?: string;
  appointmentId?: string;
  patientId: string;
  providerId: string;
  onSuccess?: () => void;
}

interface UsageItem {
  itemId: string;
  quantityUsed: number;
  sellPriceCents: number;
  givenAsSample: boolean;
  notes: string;
}

export function InventoryUsageModal({
  isOpen,
  onClose,
  encounterId,
  appointmentId,
  patientId,
  providerId,
  onSuccess,
}: InventoryUsageModalProps) {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Map<string, UsageItem>>(new Map());
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const parseDollarInputToCents = (value: string) => {
    const parsed = Number.parseFloat(value);
    if (Number.isNaN(parsed) || parsed < 0) {
      return 0;
    }
    return Math.round(parsed * 100);
  };

  useEffect(() => {
    if (isOpen && session) {
      loadInventoryItems();
    }
  }, [isOpen, session]);

  const loadInventoryItems = async () => {
    if (!session) return;
    try {
      setLoading(true);
      const { items } = await fetchInventoryItems(session.tenantId, session.accessToken);
      setInventoryItems(items);
    } catch (error: any) {
      showError(error.message || 'Failed to load inventory items');
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = inventoryItems.filter((item) => {
    if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      if (
        !item.name.toLowerCase().includes(search) &&
        !(item.sku || '').toLowerCase().includes(search)
      ) {
        return false;
      }
    }
    return true;
  });

  const toggleItem = (item: InventoryItem) => {
    const newSelected = new Map(selectedItems);
    if (newSelected.has(item.id)) {
      newSelected.delete(item.id);
    } else {
      newSelected.set(item.id, {
        itemId: item.id,
        quantityUsed: 1,
        sellPriceCents: item.unitCostCents,
        givenAsSample: false,
        notes: '',
      });
    }
    setSelectedItems(newSelected);
  };

  const updateQuantity = (itemId: string, quantity: number) => {
    const newSelected = new Map(selectedItems);
    const usageItem = newSelected.get(itemId);
    if (usageItem) {
      newSelected.set(itemId, {
        ...usageItem,
        quantityUsed: Math.max(1, quantity),
      });
      setSelectedItems(newSelected);
    }
  };

  const updateNotes = (itemId: string, notes: string) => {
    const newSelected = new Map(selectedItems);
    const usageItem = newSelected.get(itemId);
    if (usageItem) {
      newSelected.set(itemId, {
        ...usageItem,
        notes,
      });
      setSelectedItems(newSelected);
    }
  };

  const updateSellPrice = (itemId: string, sellPriceCents: number) => {
    const newSelected = new Map(selectedItems);
    const usageItem = newSelected.get(itemId);
    if (usageItem) {
      newSelected.set(itemId, {
        ...usageItem,
        sellPriceCents: Math.max(0, sellPriceCents),
      });
      setSelectedItems(newSelected);
    }
  };

  const updateGivenAsSample = (itemId: string, givenAsSample: boolean) => {
    const newSelected = new Map(selectedItems);
    const usageItem = newSelected.get(itemId);
    if (usageItem) {
      newSelected.set(itemId, {
        ...usageItem,
        givenAsSample,
        sellPriceCents: givenAsSample ? 0 : usageItem.sellPriceCents,
      });
      setSelectedItems(newSelected);
    }
  };

  const handleSave = async () => {
    if (!session || selectedItems.size === 0) return;

    try {
      setSaving(true);
      const items = Array.from(selectedItems.values());

      // Record each item individually
      const results = await Promise.allSettled(
        items.map((item) =>
          recordInventoryUsage(session.tenantId, session.accessToken, {
            itemId: item.itemId,
            quantityUsed: item.quantityUsed,
            patientId,
            providerId,
            encounterId,
            appointmentId,
            sellPriceCents: item.givenAsSample ? 0 : item.sellPriceCents,
            givenAsSample: item.givenAsSample,
            notes: item.notes || undefined,
          })
        )
      );

      // Check for any failures
      const failures = results.filter((r) => r.status === 'rejected');
      const successes = results.filter((r) => r.status === 'fulfilled');

      if (failures.length > 0) {
        if (successes.length > 0) {
          showError(`Recorded ${successes.length} item(s), but ${failures.length} failed`);
        } else {
          showError('Failed to record inventory usage');
        }
      } else {
        showSuccess(`Successfully recorded usage for ${items.length} item(s)`);
      }

      setSelectedItems(new Map());
      onSuccess?.();
      onClose();
    } catch (error: any) {
      showError(error.message || 'Failed to record inventory usage');
    } finally {
      setSaving(false);
    }
  };

  const getCategoryBadgeClass = (category: string) => {
    const classes: Record<string, string> = {
      medication: 'bg-blue-100 text-blue-800',
      supply: 'bg-green-100 text-green-800',
      cosmetic: 'bg-pink-100 text-pink-800',
      equipment: 'bg-purple-100 text-purple-800',
    };
    return classes[category] || 'bg-gray-100 text-gray-800';
  };

  const selectedEstimatedRevenue = Array.from(selectedItems.values()).reduce((sum, usageItem) => {
    if (usageItem.givenAsSample) return sum;
    return sum + usageItem.sellPriceCents * usageItem.quantityUsed;
  }, 0);

  return (
    <Modal
      isOpen={isOpen}
      title="Use Inventory Items"
      onClose={onClose}
      size="lg"
    >
      <div className="space-y-4">
        {/* Search and Filter */}
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Search items..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="all">All Categories</option>
            <option value="medication">Medications</option>
            <option value="supply">Supplies</option>
            <option value="cosmetic">Cosmetics</option>
            <option value="equipment">Equipment</option>
          </select>
        </div>

        {/* Selected Items Summary */}
        {selectedItems.size > 0 && (
          <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
            <p className="text-sm font-medium text-purple-900">
              {selectedItems.size} item(s) selected
            </p>
            <p className="text-xs text-purple-700 mt-1">
              Estimated charge: ${(selectedEstimatedRevenue / 100).toFixed(2)}
            </p>
          </div>
        )}

        {/* Available Items List */}
        <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading items...</div>
          ) : filteredItems.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No items found</div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredItems.map((item) => {
                const isSelected = selectedItems.has(item.id);
                const usageItem = selectedItems.get(item.id);

                return (
                  <div
                    key={item.id}
                    className={`p-4 hover:bg-gray-50 transition-colors ${
                      isSelected ? 'bg-purple-50' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleItem(item)}
                        className="mt-1 h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                      />
                      <div className="flex-1">
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-medium text-gray-900">{item.name}</h4>
                            <div className="flex items-center gap-2 mt-1">
                              <span
                                className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${getCategoryBadgeClass(
                                  item.category
                                )}`}
                              >
                                {item.category}
                              </span>
                              {item.sku && (
                                <span className="text-xs text-gray-500">SKU: {item.sku}</span>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-gray-600">
                              Available: <span className="font-medium">{item.quantity}</span>
                            </p>
                            <p className="text-xs text-gray-500">
                              ${(item.unitCostCents / 100).toFixed(2)} each
                            </p>
                          </div>
                        </div>

                        {isSelected && usageItem && (
                          <div className="mt-3 pl-2 border-l-2 border-purple-300 space-y-2">
                            <div className="flex items-center gap-3">
                              <label className="text-sm font-medium text-gray-700 w-20">
                                Quantity:
                              </label>
                              <input
                                type="number"
                                min="1"
                                max={item.quantity}
                                value={usageItem.quantityUsed}
                                onChange={(e) =>
                                  updateQuantity(item.id, parseInt(e.target.value) || 1)
                                }
                                className="w-24 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
                              />
                            </div>
                            <div className="flex items-center gap-3">
                              <label className="text-sm font-medium text-gray-700 w-20">
                                Type:
                              </label>
                              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                                <input
                                  type="checkbox"
                                  checked={usageItem.givenAsSample}
                                  onChange={(e) => updateGivenAsSample(item.id, e.target.checked)}
                                  className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                                />
                                Given as sample (no charge)
                              </label>
                            </div>
                            <div className="flex items-center gap-3">
                              <label className="text-sm font-medium text-gray-700 w-20">
                                Sell price:
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={(usageItem.sellPriceCents / 100).toFixed(2)}
                                disabled={usageItem.givenAsSample}
                                onChange={(e) =>
                                  updateSellPrice(item.id, parseDollarInputToCents(e.target.value))
                                }
                                className="w-32 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-100 disabled:text-gray-500"
                              />
                              <span className="text-xs text-gray-500">
                                Total: $
                                {(
                                  (usageItem.givenAsSample ? 0 : usageItem.sellPriceCents) *
                                  usageItem.quantityUsed /
                                  100
                                ).toFixed(2)}
                              </span>
                            </div>
                            <div className="flex items-start gap-3">
                              <label className="text-sm font-medium text-gray-700 w-20 pt-1">
                                Notes:
                              </label>
                              <input
                                type="text"
                                value={usageItem.notes}
                                onChange={(e) => updateNotes(item.id, e.target.value)}
                                placeholder="Optional notes..."
                                className="flex-1 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || selectedItems.size === 0}
            className="px-4 py-2 text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Recording...' : `Record Usage (${selectedItems.size})`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
