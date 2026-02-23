import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { fetchAllInventoryUsage, type InventoryUsage } from '../../api';

interface InventoryUsageListProps {
  encounterId?: string;
  appointmentId?: string;
  onOpenUsageModal?: () => void;
}

const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const formatTimestamp = (isoDate: string) =>
  new Date(isoDate).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

function getCategoryBadgeClass(category?: string) {
  const classes: Record<string, string> = {
    medication: 'bg-blue-100 text-blue-800',
    supply: 'bg-green-100 text-green-800',
    cosmetic: 'bg-pink-100 text-pink-800',
    equipment: 'bg-purple-100 text-purple-800',
  };
  return classes[category || ''] || 'bg-gray-100 text-gray-800';
}

export function InventoryUsageList({ encounterId, appointmentId, onOpenUsageModal }: InventoryUsageListProps) {
  const { session } = useAuth();
  const { showError } = useToast();

  const [loading, setLoading] = useState(false);
  const [usageRecords, setUsageRecords] = useState<InventoryUsage[]>([]);

  const loadUsageRecords = useCallback(async () => {
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
  }, [session, encounterId, appointmentId, showError]);

  useEffect(() => {
    if (session && (encounterId || appointmentId)) {
      void loadUsageRecords();
    }
  }, [session, encounterId, appointmentId, loadUsageRecords]);

  useEffect(() => {
    if (!onOpenUsageModal) return;
    (window as any).__refreshInventoryUsage = loadUsageRecords;
  }, [onOpenUsageModal, loadUsageRecords]);

  const totalCostCents = usageRecords.reduce(
    (sum, record) => sum + record.quantityUsed * record.unitCostCents,
    0
  );
  const totalPatientChargeCents = usageRecords.reduce(
    (sum, record) => sum + (record.givenAsSample ? 0 : (record.sellPriceCents || 0) * record.quantityUsed),
    0
  );
  const sampleCount = usageRecords.filter((record) => record.givenAsSample).length;
  const billableCount = usageRecords.length - sampleCount;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Inventory Used</h3>
          <p className="text-sm text-gray-500">Track supplies, dispensed samples, and patient billables.</p>
        </div>
        {onOpenUsageModal && (
          <button
            type="button"
            onClick={onOpenUsageModal}
            className="rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700"
          >
            + Add Used Items
          </button>
        )}
      </div>

      {loading ? (
        <div className="rounded-lg border border-gray-200 bg-white py-8 text-center text-sm text-gray-500">
          Loading inventory usage...
        </div>
      ) : usageRecords.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 py-10 text-center">
          <p className="mb-3 text-gray-600">No inventory items have been recorded for this visit.</p>
          {onOpenUsageModal && (
            <button
              type="button"
              onClick={onOpenUsageModal}
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
            >
              Record Inventory Usage
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Entries</div>
              <div className="mt-1 text-xl font-semibold text-gray-900">{usageRecords.length}</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Billable</div>
              <div className="mt-1 text-xl font-semibold text-emerald-700">{billableCount}</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Samples</div>
              <div className="mt-1 text-xl font-semibold text-amber-700">{sampleCount}</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Patient Charge</div>
              <div className="mt-1 text-xl font-semibold text-indigo-700">{formatCurrency(totalPatientChargeCents)}</div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Item</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">Qty</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Type</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">Unit Price</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">Line Total</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">Used</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {usageRecords.map((record) => {
                  const unitPrice = record.givenAsSample ? 0 : (record.sellPriceCents || 0);
                  const lineTotal = unitPrice * record.quantityUsed;
                  return (
                    <tr key={record.id} className="align-top">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{record.itemName}</div>
                        <div className="mt-1 flex items-center gap-2">
                          {record.itemCategory && (
                            <span
                              className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${getCategoryBadgeClass(
                                record.itemCategory
                              )}`}
                            >
                              {record.itemCategory}
                            </span>
                          )}
                          {record.notes && <span className="text-xs text-gray-500">{record.notes}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">{record.quantityUsed}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {record.givenAsSample ? (
                          <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">Sample</span>
                        ) : (
                          <span className="rounded-md bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">Billable</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-700">
                        {record.givenAsSample ? '-' : formatCurrency(unitPrice)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                        {record.givenAsSample ? 'Sample' : formatCurrency(lineTotal)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-600">{formatTimestamp(record.usedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <div className="space-y-1 text-right">
              <div className="text-sm text-gray-600">Inventory cost: {formatCurrency(totalCostCents)}</div>
              <div className="text-lg font-semibold text-gray-900">
                Total patient billables: {formatCurrency(totalPatientChargeCents)}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
