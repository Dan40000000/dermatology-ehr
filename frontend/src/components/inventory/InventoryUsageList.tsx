import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { fetchAllInventoryUsage, type InventoryUsage } from '../../api';

interface InventoryUsageListProps {
  encounterId?: string;
  appointmentId?: string;
  onOpenUsageModal?: () => void;
}

export function InventoryUsageList({ encounterId, appointmentId, onOpenUsageModal }: InventoryUsageListProps) {
  const { session } = useAuth();
  const { showError } = useToast();

  const [loading, setLoading] = useState(false);
  const [usageRecords, setUsageRecords] = useState<InventoryUsage[]>([]);

  useEffect(() => {
    if (session && (encounterId || appointmentId)) {
      loadUsageRecords();
    }
  }, [session, encounterId, appointmentId]);

  const loadUsageRecords = async () => {
    if (!session) return;
    try {
      setLoading(true);
      const { usage } = await fetchAllInventoryUsage(
        session.tenantId,
        session.accessToken,
        {
          encounterId,
          appointmentId,
        }
      );
      setUsageRecords(usage);
    } catch (error: any) {
      showError(error.message || 'Failed to load inventory usage');
    } finally {
      setLoading(false);
    }
  };

  const getCategoryBadgeClass = (category?: string) => {
    const classes: Record<string, string> = {
      medication: 'bg-blue-100 text-blue-800',
      supply: 'bg-green-100 text-green-800',
      cosmetic: 'bg-pink-100 text-pink-800',
      equipment: 'bg-purple-100 text-purple-800',
    };
    return classes[category || ''] || 'bg-gray-100 text-gray-800';
  };

  const totalCost = usageRecords.reduce(
    (sum, record) => sum + record.quantityUsed * record.unitCostCents,
    0
  );

  // Expose refresh function to parent
  useEffect(() => {
    if (onOpenUsageModal) {
      // Store refresh function for parent to call
      (window as any).__refreshInventoryUsage = loadUsageRecords;
    }
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">Inventory Used</h3>
        {onOpenUsageModal && (
          <button
            type="button"
            onClick={onOpenUsageModal}
            className="px-3 py-1.5 text-sm text-purple-700 bg-purple-100 rounded-lg hover:bg-purple-200 transition-colors"
          >
            + Use Items
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-8 text-center text-gray-500">Loading...</div>
      ) : usageRecords.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-gray-500 mb-3">No inventory items used yet</p>
          {onOpenUsageModal && (
            <button
              type="button"
              onClick={onOpenUsageModal}
              className="px-4 py-2 text-purple-700 bg-purple-100 rounded-lg hover:bg-purple-200 transition-colors"
            >
              Record Inventory Usage
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200">
            {usageRecords.map((record) => (
              <div key={record.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-gray-900">{record.itemName}</h4>
                      {record.itemCategory && (
                        <span
                          className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${getCategoryBadgeClass(
                            record.itemCategory
                          )}`}
                        >
                          {record.itemCategory}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 space-y-1">
                      <p className="text-sm text-gray-600">
                        Quantity: <span className="font-medium">{record.quantityUsed}</span>
                      </p>
                      {record.notes && (
                        <p className="text-sm text-gray-600">
                          Notes: <span className="italic">{record.notes}</span>
                        </p>
                      )}
                      <p className="text-xs text-gray-500">
                        {new Date(record.usedAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">
                      ${((record.quantityUsed * record.unitCostCents) / 100).toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-500">
                      @ ${(record.unitCostCents / 100).toFixed(2)} ea
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Total Cost Summary */}
          <div className="flex justify-end p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="text-right">
              <p className="text-sm text-gray-600">Total Inventory Cost</p>
              <p className="text-xl font-bold text-gray-900">
                ${(totalCost / 100).toFixed(2)}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
