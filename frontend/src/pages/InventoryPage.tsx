import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { Panel, Modal } from '../components/ui';
import {
  adjustInventory,
  createInventoryItem,
  fetchAllInventoryUsage,
  fetchInventoryItems,
} from '../api';
import type { InventoryUsage } from '../api';

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type ItemCategory = 'medication' | 'supply' | 'cosmetic' | 'equipment';
type ViewMode = 'inventory' | 'cabinets';
type ReorderDueFilter = 'all' | 'week' | 'month';

type AdjustReason = 'received' | 'expired' | 'damaged' | 'adjustment' | 'correction';

interface InventoryItem {
  id: string;
  name: string;
  category: ItemCategory;
  sku: string;
  description?: string;
  quantity: number;
  reorderLevel: number;
  unitCostCents: number;
  supplier: string;
  expirationDate?: string;
  lotNumber?: string;
  location: string;
  createdAt?: string;
  updatedAt?: string;
}

interface Cabinet {
  id: string;
  name: string;
  facility: string;
  description?: string;
}

interface ReorderForecast {
  avgDailyUsage: number;
  daysToReorder: number;
  reorderDate: string | null;
  recommendedOrderQty: number;
  dueBucket: 'week' | 'month' | 'later';
}

interface AddItemForm {
  name: string;
  sku: string;
  category: ItemCategory;
  supplier: string;
  quantity: string;
  reorderLevel: string;
  unitCostDollars: string;
  location: string;
  expirationDate: string;
  lotNumber: string;
  description: string;
}

const CATEGORY_FALLBACK_DAILY_USAGE: Record<ItemCategory, number> = {
  medication: 0.6,
  supply: 1.2,
  cosmetic: 0.5,
  equipment: 0.08,
};

const DEMO_REORDER_ITEMS: Array<{
  name: string;
  sku: string;
  category: ItemCategory;
  quantity: number;
  reorderLevel: number;
  unitCostCents: number;
  supplier: string;
  location: string;
  description: string;
}> = [
  {
    name: 'Biopsy Punch 4mm',
    sku: 'DEMO-LOW-001',
    category: 'supply',
    quantity: 5,
    reorderLevel: 12,
    unitCostCents: 490,
    supplier: 'DermDirect Medical',
    location: 'East Clinic - Procedure Room A',
    description: 'Single-use biopsy punch tools',
  },
  {
    name: 'Nitrile Gloves (Medium)',
    sku: 'DEMO-LOW-002',
    category: 'supply',
    quantity: 18,
    reorderLevel: 24,
    unitCostCents: 1200,
    supplier: 'Clinic Supply Co.',
    location: 'East Clinic - Supply Cabinet',
    description: 'Powder-free exam gloves',
  },
  {
    name: 'Lidocaine 1% 10mL Vials',
    sku: 'DEMO-MONTH-001',
    category: 'medication',
    quantity: 40,
    reorderLevel: 22,
    unitCostCents: 850,
    supplier: 'Medline Pharma',
    location: 'East Clinic - Med Cabinet',
    description: 'Local anesthetic for procedures',
  },
  {
    name: 'Laser Cooling Gel',
    sku: 'DEMO-MONTH-002',
    category: 'cosmetic',
    quantity: 33,
    reorderLevel: 18,
    unitCostCents: 1499,
    supplier: 'Aesthetic Source',
    location: 'Main Office - Laser Room',
    description: 'Cooling gel used during laser treatments',
  },
];

const EMPTY_ADD_ITEM_FORM: AddItemForm = {
  name: '',
  sku: '',
  category: 'supply',
  supplier: '',
  quantity: '0',
  reorderLevel: '10',
  unitCostDollars: '',
  location: '',
  expirationDate: '',
  lotNumber: '',
  description: '',
};

const EMPTY_CABINETS: Cabinet[] = [];

function toFiniteInt(value: string, fallback = 0): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toCurrencyCents(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.round(parsed * 100));
}

export function InventoryPage() {
  const { showSuccess, showError } = useToast();
  const { session } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [viewMode, setViewMode] = useState<ViewMode>('inventory');

  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [usageRecords, setUsageRecords] = useState<InventoryUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<ItemCategory | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showLowStock, setShowLowStock] = useState(false);
  const [reorderDueFilter, setReorderDueFilter] = useState<ReorderDueFilter>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showManualAdjustModal, setShowManualAdjustModal] = useState(false);
  const [manualAdjustItemId, setManualAdjustItemId] = useState('');
  const [manualAdjustQuantity, setManualAdjustQuantity] = useState('0');
  const [manualAdjustReason, setManualAdjustReason] = useState<AdjustReason>('correction');
  const [manualAdjustNotes, setManualAdjustNotes] = useState('');
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [adjustQuantity, setAdjustQuantity] = useState(0);
  const [adjustReason, setAdjustReason] = useState<AdjustReason>('adjustment');
  const [addItemForm, setAddItemForm] = useState<AddItemForm>(EMPTY_ADD_ITEM_FORM);

  const allCabinets = EMPTY_CABINETS;
  const [preferredCabinetIds, setPreferredCabinetIds] = useState<string[]>([]);
  const [cabinetSearchTerm, setCabinetSearchTerm] = useState('');
  const [facilityFilter, setFacilityFilter] = useState<string>('all');

  const expirationThreshold = useMemo(
    () => new Date(Date.now() + NINETY_DAYS_MS),
    []
  );

  const clearQueryParam = (paramName: string) => {
    if (!searchParams.has(paramName)) {
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.delete(paramName);
    setSearchParams(next, { replace: true });
  };

  const fetchInventory = useCallback(async () => {
    if (!session) {
      setInventory([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const response = await fetchInventoryItems(session.tenantId, session.accessToken, {
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
        lowStock: showLowStock || undefined,
      });
      setInventory(response.items || []);
    } catch (error) {
      showError('Failed to load inventory');
      console.error('Failed to fetch inventory:', error);
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, session, showError, showLowStock]);

  const fetchUsageAnalytics = useCallback(async () => {
    if (!session) {
      setUsageRecords([]);
      return;
    }

    try {
      const response = await fetchAllInventoryUsage(session.tenantId, session.accessToken, {
        limit: 1000,
      });
      setUsageRecords(response.usage || []);
    } catch (error) {
      setUsageRecords([]);
      console.error('Failed to fetch inventory usage analytics:', error);
    }
  }, [session]);

  useEffect(() => {
    if (!session) {
      setInventory([]);
      setLoading(false);
      return;
    }
    void fetchInventory();
  }, [fetchInventory, session]);

  useEffect(() => {
    if (!session) {
      setUsageRecords([]);
      return;
    }
    void fetchUsageAnalytics();
  }, [fetchUsageAnalytics, session]);

  useEffect(() => {
    const filter = searchParams.get('filter');
    const action = searchParams.get('action');

    if (filter === 'low-stock') {
      setShowLowStock(true);
      setReorderDueFilter('all');
    } else if (filter === 'order-week') {
      setShowLowStock(false);
      setReorderDueFilter('week');
    } else if (filter === 'order-month') {
      setShowLowStock(false);
      setReorderDueFilter('month');
    } else if (!filter) {
      setShowLowStock(false);
      setReorderDueFilter('all');
    }

    if (action === 'add') {
      setShowAddModal(true);
    }

  }, [searchParams]);

  const isUsageReportView = searchParams.get('tab') === 'usage';

  useEffect(() => {
    const saved = localStorage.getItem('preferredCabinets');
    if (saved) {
      try {
        setPreferredCabinetIds(JSON.parse(saved));
      } catch (error) {
        console.error('Failed to load preferred cabinets', error);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('preferredCabinets', JSON.stringify(preferredCabinetIds));
  }, [preferredCabinetIds]);

  const usageByItemId = useMemo(() => {
    const usageMap = new Map<string, InventoryUsage[]>();
    for (const usage of usageRecords) {
      const existing = usageMap.get(usage.itemId);
      if (existing) {
        existing.push(usage);
      } else {
        usageMap.set(usage.itemId, [usage]);
      }
    }
    return usageMap;
  }, [usageRecords]);

  const reorderForecastByItemId = useMemo<Record<string, ReorderForecast>>(() => {
    const nowMs = Date.now();
    const thirtyDaysAgo = nowMs - THIRTY_DAYS_MS;
    const next: Record<string, ReorderForecast> = {};

    for (const item of inventory) {
      const itemUsage = usageByItemId.get(item.id) || [];
      const recentUsageTotal = itemUsage.reduce((sum, usage) => {
        const usedAtMs = new Date(usage.usedAt).getTime();
        if (Number.isFinite(usedAtMs) && usedAtMs >= thirtyDaysAgo) {
          return sum + Math.max(0, usage.quantityUsed || 0);
        }
        return sum;
      }, 0);

      const avgDailyUsage = recentUsageTotal > 0
        ? recentUsageTotal / 30
        : CATEGORY_FALLBACK_DAILY_USAGE[item.category];

      const daysToReorder = avgDailyUsage > 0
        ? (item.quantity - item.reorderLevel) / avgDailyUsage
        : Number.POSITIVE_INFINITY;

      let dueBucket: 'week' | 'month' | 'later' = 'later';
      if (item.quantity <= item.reorderLevel || daysToReorder <= 7) {
        dueBucket = 'week';
      } else if (daysToReorder <= 30) {
        dueBucket = 'month';
      }

      const safeDaysToReorder = Number.isFinite(daysToReorder) ? Math.max(0, daysToReorder) : Number.POSITIVE_INFINITY;
      const reorderDate = Number.isFinite(safeDaysToReorder)
        ? new Date(nowMs + safeDaysToReorder * DAY_MS).toISOString()
        : null;

      const thirtyDayTargetStock = item.reorderLevel + avgDailyUsage * 30;
      const recommendedOrderQty = Math.max(0, Math.ceil(thirtyDayTargetStock - item.quantity));

      next[item.id] = {
        avgDailyUsage,
        daysToReorder,
        reorderDate,
        recommendedOrderQty,
        dueBucket,
      };
    }

    return next;
  }, [inventory, usageByItemId]);

  const lowStockItems = useMemo(
    () => inventory.filter((item) => item.quantity <= item.reorderLevel),
    [inventory]
  );

  const orderThisWeekItems = useMemo(
    () => inventory.filter((item) => reorderForecastByItemId[item.id]?.dueBucket === 'week'),
    [inventory, reorderForecastByItemId]
  );

  const orderThisMonthItems = useMemo(
    () => inventory.filter((item) => reorderForecastByItemId[item.id]?.dueBucket === 'month'),
    [inventory, reorderForecastByItemId]
  );

  const totalValue = useMemo(
    () => inventory.reduce((sum, item) => sum + item.quantity * item.unitCostCents, 0),
    [inventory]
  );

  const filteredInventory = useMemo(() => {
    return inventory.filter((item) => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) {
        return false;
      }

      if (showLowStock && item.quantity > item.reorderLevel) {
        return false;
      }

      if (reorderDueFilter !== 'all') {
        const dueBucket = reorderForecastByItemId[item.id]?.dueBucket;
        if (reorderDueFilter === 'week' && dueBucket !== 'week') {
          return false;
        }
        if (reorderDueFilter === 'month' && dueBucket !== 'month') {
          return false;
        }
      }

      if (searchTerm.trim()) {
        const search = searchTerm.toLowerCase();
        return (
          item.name.toLowerCase().includes(search) ||
          item.sku.toLowerCase().includes(search)
        );
      }

      return true;
    });
  }, [inventory, categoryFilter, showLowStock, reorderDueFilter, reorderForecastByItemId, searchTerm]);

  const usageSummary = useMemo(() => {
    const grouped = new Map<string, { itemName: string; quantityUsed: number; billableCents: number; events: number; lastUsedAt: string }>();

    for (const usage of usageRecords) {
      const current = grouped.get(usage.itemId);
      const nextQuantity = (current?.quantityUsed || 0) + usage.quantityUsed;
      const nextBillable = (current?.billableCents || 0) + (usage.givenAsSample ? 0 : (usage.sellPriceCents || 0) * usage.quantityUsed);
      const nextEvents = (current?.events || 0) + 1;
      const lastUsedAt = !current || new Date(usage.usedAt) > new Date(current.lastUsedAt)
        ? usage.usedAt
        : current.lastUsedAt;

      grouped.set(usage.itemId, {
        itemName: usage.itemName || 'Unknown Item',
        quantityUsed: nextQuantity,
        billableCents: nextBillable,
        events: nextEvents,
        lastUsedAt,
      });
    }

    const byItem = Array.from(grouped.entries())
      .map(([itemId, value]) => ({ itemId, ...value }))
      .sort((a, b) => b.quantityUsed - a.quantityUsed);

    const totalUnitsUsed = usageRecords.reduce((sum, usage) => sum + usage.quantityUsed, 0);
    const totalBillableCents = usageRecords.reduce(
      (sum, usage) => sum + (usage.givenAsSample ? 0 : (usage.sellPriceCents || 0) * usage.quantityUsed),
      0
    );

    return {
      totalEntries: usageRecords.length,
      totalUnitsUsed,
      totalBillableCents,
      topItems: byItem.slice(0, 8),
    };
  }, [usageRecords]);

  const facilities = useMemo(
    () => Array.from(new Set(allCabinets.map((cabinet) => cabinet.facility))).sort(),
    [allCabinets]
  );

  const filteredAvailableCabinets = useMemo(
    () => allCabinets
      .filter((cabinet) => !preferredCabinetIds.includes(cabinet.id))
      .filter((cabinet) => {
        if (facilityFilter !== 'all' && cabinet.facility !== facilityFilter) {
          return false;
        }

        if (cabinetSearchTerm.trim()) {
          const search = cabinetSearchTerm.toLowerCase();
          return (
            cabinet.name.toLowerCase().includes(search) ||
            cabinet.facility.toLowerCase().includes(search)
          );
        }

        return true;
      }),
    [allCabinets, preferredCabinetIds, facilityFilter, cabinetSearchTerm]
  );

  const preferredCabinets = useMemo(
    () => allCabinets.filter((cabinet) => preferredCabinetIds.includes(cabinet.id)),
    [allCabinets, preferredCabinetIds]
  );

  const addToPreferred = (cabinetId: string) => {
    const cabinet = allCabinets.find((entry) => entry.id === cabinetId);
    if (!cabinet) {
      return;
    }

    setPreferredCabinetIds((prev) => [...prev, cabinetId]);
    showSuccess(`Added ${cabinet.name} to preferred cabinets`);
  };

  const removeFromPreferred = (cabinetId: string) => {
    const cabinet = allCabinets.find((entry) => entry.id === cabinetId);
    if (!cabinet) {
      return;
    }

    setPreferredCabinetIds((prev) => prev.filter((id) => id !== cabinetId));
    showSuccess(`Removed ${cabinet.name} from preferred cabinets`);
  };

  const applyReorderFilter = (nextFilter: ReorderDueFilter) => {
    setReorderDueFilter(nextFilter);
    if (nextFilter !== 'all') {
      setShowLowStock(false);
    }
  };

  const handleAdjustStock = async () => {
    if (!selectedItem || !session) {
      return;
    }

    const newQuantity = selectedItem.quantity + adjustQuantity;
    if (newQuantity < 0) {
      showError('Adjustment would result in negative quantity');
      return;
    }

    try {
      await adjustInventory(session.tenantId, session.accessToken, {
        itemId: selectedItem.id,
        adjustmentQuantity: adjustQuantity,
        reason: adjustReason,
      });

      showSuccess(`Stock adjusted: ${selectedItem.name} now has ${newQuantity} units`);
      setShowAdjustModal(false);
      setSelectedItem(null);
      setAdjustQuantity(0);
      setAdjustReason('adjustment');
      await fetchInventory();
    } catch (error) {
      showError('Failed to adjust stock');
      console.error('Failed to adjust stock:', error);
    }
  };

  const handleSeedDemoReorderData = async () => {
    if (!session) {
      showError('Session expired. Please log in again.');
      return;
    }

    const existingSkus = new Set(
      inventory
        .map((item) => item.sku?.trim())
        .filter((sku): sku is string => Boolean(sku))
    );

    const existingNames = new Set(
      inventory.map((item) => item.name.trim().toLowerCase())
    );

    const pending = DEMO_REORDER_ITEMS.filter((seedItem) => {
      return !existingSkus.has(seedItem.sku) && !existingNames.has(seedItem.name.toLowerCase());
    });

    if (!pending.length) {
      showSuccess('Demo reorder inventory is already loaded.');
      return;
    }

    try {
      for (const item of pending) {
        await createInventoryItem(session.tenantId, session.accessToken, item);
      }

      showSuccess(`Added ${pending.length} demo inventory item(s).`);
      await fetchInventory();
      await fetchUsageAnalytics();
    } catch (error) {
      showError('Failed to seed demo inventory');
      console.error('Failed to seed demo inventory:', error);
    }
  };

  const updateAddItemForm = <K extends keyof AddItemForm>(key: K, value: AddItemForm[K]) => {
    setAddItemForm((prev) => ({ ...prev, [key]: value }));
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setAddItemForm(EMPTY_ADD_ITEM_FORM);
    clearQueryParam('action');
  };

  const openUsageReport = () => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'usage');
    setSearchParams(next, { replace: true });
  };

  const closeUsageReport = () => {
    clearQueryParam('tab');
  };

  const resetManualAdjustForm = () => {
    setManualAdjustItemId('');
    setManualAdjustQuantity('0');
    setManualAdjustReason('correction');
    setManualAdjustNotes('');
  };

  const handleManualAdjustStock = async () => {
    if (!session) {
      showError('Session expired. Please log in again.');
      return;
    }

    if (!manualAdjustItemId) {
      showError('Select an item to adjust.');
      return;
    }

    const adjustmentQuantity = toFiniteInt(manualAdjustQuantity, 0);
    if (adjustmentQuantity === 0) {
      showError('Adjustment quantity cannot be zero.');
      return;
    }

    try {
      await adjustInventory(session.tenantId, session.accessToken, {
        itemId: manualAdjustItemId,
        adjustmentQuantity,
        reason: manualAdjustReason,
        notes: manualAdjustNotes.trim() || undefined,
      });

      showSuccess('Manual stock correction saved.');
      setShowManualAdjustModal(false);
      resetManualAdjustForm();
      await fetchInventory();
      await fetchUsageAnalytics();
    } catch (error) {
      showError('Failed to save manual stock correction');
      console.error('Failed to save manual stock correction:', error);
    }
  };

  const handleAddItem = async () => {
    if (!session) {
      showError('Session expired. Please log in again.');
      return;
    }

    const name = addItemForm.name.trim();
    if (!name) {
      showError('Item name is required');
      return;
    }

    const quantity = Math.max(0, toFiniteInt(addItemForm.quantity, 0));
    const reorderLevel = Math.max(0, toFiniteInt(addItemForm.reorderLevel, 0));
    const unitCostCents = toCurrencyCents(addItemForm.unitCostDollars);

    try {
      await createInventoryItem(session.tenantId, session.accessToken, {
        name,
        sku: addItemForm.sku.trim() || undefined,
        category: addItemForm.category,
        description: addItemForm.description.trim() || undefined,
        quantity,
        reorderLevel,
        unitCostCents,
        supplier: addItemForm.supplier.trim() || undefined,
        location: addItemForm.location.trim() || undefined,
        expirationDate: addItemForm.expirationDate || undefined,
        lotNumber: addItemForm.lotNumber.trim() || undefined,
      });

      showSuccess(`${name} added to inventory.`);
      closeAddModal();
      await fetchInventory();
    } catch (error) {
      showError('Failed to add inventory item');
      console.error('Failed to add inventory item:', error);
    }
  };

  const formatCurrency = (amountCents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amountCents / 100);
  };

  const formatDate = (dateIso: string | null) => {
    if (!dateIso) {
      return '-';
    }
    return new Date(dateIso).toLocaleDateString();
  };

  const getCategoryIcon = (category: ItemCategory) => {
    switch (category) {
      case 'medication':
        return 'RX';
      case 'supply':
        return 'SUP';
      case 'cosmetic':
        return 'COS';
      case 'equipment':
      default:
        return 'EQ';
    }
  };

  const getFilterSummary = () => {
    if (showLowStock) {
      return 'Showing low stock items only';
    }
    if (reorderDueFilter === 'week') {
      return 'Showing items that should be ordered this week';
    }
    if (reorderDueFilter === 'month') {
      return 'Showing items that should be ordered this month';
    }
    return 'Showing all inventory items';
  };

  return (
    <div className="inventory-page">
      <div className="page-header">
        <h1>Inventory Management</h1>
        <div className="header-actions">
          <button type="button" className="btn-secondary" onClick={() => setShowManualAdjustModal(true)}>
            Manual Stock Correction
          </button>
          <button type="button" className="btn-secondary" onClick={openUsageReport}>
            Usage Report
          </button>
          <button type="button" className="btn-secondary" onClick={handleSeedDemoReorderData}>
            Seed Demo Reorders
          </button>
          <button type="button" className="btn-primary" onClick={() => setShowAddModal(true)}>
            + Add Item
          </button>
        </div>
      </div>

      <div className="workflow-note">
        Primary workflow: record used items in the encounter or appointment flow. This page is for stock planning and manual corrections only.
      </div>

      <div className="view-mode-tabs">
        <button
          type="button"
          className={`view-tab ${viewMode === 'inventory' ? 'active' : ''}`}
          onClick={() => setViewMode('inventory')}
        >
          Inventory Items
        </button>
        <button
          type="button"
          className={`view-tab ${viewMode === 'cabinets' ? 'active' : ''}`}
          onClick={() => setViewMode('cabinets')}
        >
          Preferred Cabinets
        </button>
      </div>

      {viewMode === 'inventory' && (
        <>
          <div className="inventory-stats">
            <div className="stat-card">
              <div className="stat-value">{inventory.length}</div>
              <div className="stat-label">Total Items</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{formatCurrency(totalValue)}</div>
              <div className="stat-label">Total Value</div>
            </div>
            <div className={`stat-card ${lowStockItems.length > 0 ? 'warning' : ''}`}>
              <div className="stat-value">{lowStockItems.length}</div>
              <div className="stat-label">Low Stock Items</div>
            </div>
            <div className={`stat-card ${orderThisWeekItems.length > 0 ? 'warning' : ''}`}>
              <div className="stat-value">{orderThisWeekItems.length}</div>
              <div className="stat-label">Order This Week</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{orderThisMonthItems.length}</div>
              <div className="stat-label">Order This Month</div>
            </div>
          </div>

          {lowStockItems.length > 0 && (
            <div className="low-stock-alert">
              <span className="alert-text">{lowStockItems.length} item(s) need immediate reorder review.</span>
              <button
                type="button"
                className="btn-sm btn-secondary"
                onClick={() => {
                  setShowLowStock(true);
                  setReorderDueFilter('all');
                }}
              >
                View Low Stock
              </button>
            </div>
          )}

          <div className="reorder-filters-row">
            <button
              type="button"
              className={`reorder-filter-btn ${reorderDueFilter === 'all' && !showLowStock ? 'active' : ''}`}
              onClick={() => {
                setShowLowStock(false);
                applyReorderFilter('all');
              }}
            >
              All Inventory
            </button>
            <button
              type="button"
              className={`reorder-filter-btn ${showLowStock ? 'active' : ''}`}
              onClick={() => {
                setShowLowStock(true);
                setReorderDueFilter('all');
              }}
            >
              Low Stock
            </button>
            <button
              type="button"
              className={`reorder-filter-btn ${reorderDueFilter === 'week' ? 'active' : ''}`}
              onClick={() => applyReorderFilter('week')}
            >
              Order This Week ({orderThisWeekItems.length})
            </button>
            <button
              type="button"
              className={`reorder-filter-btn ${reorderDueFilter === 'month' ? 'active' : ''}`}
              onClick={() => applyReorderFilter('month')}
            >
              Order This Month ({orderThisMonthItems.length})
            </button>
          </div>

          <div className="filter-summary">{getFilterSummary()}</div>

          {isUsageReportView && (
            <Panel title="Usage Report (Read-Only)">
              <div className="usage-report-grid">
                <div className="usage-stat-card">
                  <div className="usage-stat-label">Usage Entries</div>
                  <div className="usage-stat-value">{usageSummary.totalEntries}</div>
                </div>
                <div className="usage-stat-card">
                  <div className="usage-stat-label">Total Units Used</div>
                  <div className="usage-stat-value">{usageSummary.totalUnitsUsed}</div>
                </div>
                <div className="usage-stat-card">
                  <div className="usage-stat-label">Billable Value</div>
                  <div className="usage-stat-value">{formatCurrency(usageSummary.totalBillableCents)}</div>
                </div>
              </div>

              {usageSummary.topItems.length === 0 ? (
                <div className="usage-empty">No usage records yet.</div>
              ) : (
                <div className="usage-table-wrap">
                  <table className="usage-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Units Used</th>
                        <th>Entries</th>
                        <th>Billable Value</th>
                        <th>Last Used</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usageSummary.topItems.map((item) => (
                        <tr key={item.itemId}>
                          <td>{item.itemName}</td>
                          <td>{item.quantityUsed}</td>
                          <td>{item.events}</td>
                          <td>{formatCurrency(item.billableCents)}</td>
                          <td>{new Date(item.lastUsedAt).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="usage-report-actions">
                <button type="button" className="btn-secondary" onClick={closeUsageReport}>
                  Close Usage Report
                </button>
              </div>
            </Panel>
          )}

          <div className="inventory-filters">
            <div className="search-box">
              <input
                id="inventory-search"
                name="inventory-search"
                type="text"
                placeholder="Search by name or SKU..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>

            <div className="filter-tabs">
              <button
                type="button"
                className={`filter-tab ${categoryFilter === 'all' ? 'active' : ''}`}
                onClick={() => setCategoryFilter('all')}
              >
                All
              </button>
              <button
                type="button"
                className={`filter-tab ${categoryFilter === 'medication' ? 'active' : ''}`}
                onClick={() => setCategoryFilter('medication')}
              >
                Medications
              </button>
              <button
                type="button"
                className={`filter-tab ${categoryFilter === 'supply' ? 'active' : ''}`}
                onClick={() => setCategoryFilter('supply')}
              >
                Supplies
              </button>
              <button
                type="button"
                className={`filter-tab ${categoryFilter === 'cosmetic' ? 'active' : ''}`}
                onClick={() => setCategoryFilter('cosmetic')}
              >
                Cosmetics
              </button>
              <button
                type="button"
                className={`filter-tab ${categoryFilter === 'equipment' ? 'active' : ''}`}
                onClick={() => setCategoryFilter('equipment')}
              >
                Equipment
              </button>
            </div>

            <label className="checkbox-label" htmlFor="low-stock-only">
              <input
                id="low-stock-only"
                name="low-stock-only"
                type="checkbox"
                checked={showLowStock}
                onChange={(event) => {
                  setShowLowStock(event.target.checked);
                  if (event.target.checked) {
                    setReorderDueFilter('all');
                  }
                }}
              />
              Show Low Stock Only
            </label>
          </div>

          <Panel title="">
            {loading ? (
              <div className="inventory-empty">Loading inventory...</div>
            ) : filteredInventory.length === 0 ? (
              <div className="inventory-empty">No inventory items found for the selected filters.</div>
            ) : (
              <div className="inventory-table">
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>SKU</th>
                      <th>Category</th>
                      <th>Qty</th>
                      <th>Reorder Level</th>
                      <th>Avg Daily Use</th>
                      <th>Reorder Date</th>
                      <th>Suggested Qty</th>
                      <th>Unit Cost</th>
                      <th>Location</th>
                      <th>Lot #</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInventory.map((item) => {
                      const forecast = reorderForecastByItemId[item.id];
                      const isLow = item.quantity <= item.reorderLevel;
                      const isExpiringSoon = item.expirationDate
                        ? new Date(item.expirationDate) < expirationThreshold
                        : false;

                      return (
                        <tr key={item.id} className={isLow ? 'low-stock-row' : ''}>
                          <td>
                            <div className="item-name">
                              <span className="item-icon">{getCategoryIcon(item.category)}</span>
                              <div>
                                <div className="strong">{item.name}</div>
                                {item.expirationDate && (
                                  <div className={`tiny ${isExpiringSoon ? 'warning-text' : 'muted'}`}>
                                    Exp: {new Date(item.expirationDate).toLocaleDateString()}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="muted tiny">{item.sku || '-'}</td>
                          <td>
                            <span className={`pill ${item.category}`}>{item.category}</span>
                          </td>
                          <td>
                            <span className={isLow ? 'low-qty' : ''}>{item.quantity}</span>
                          </td>
                          <td className="muted">{item.reorderLevel}</td>
                          <td>{forecast ? forecast.avgDailyUsage.toFixed(2) : '-'}</td>
                          <td>{forecast ? formatDate(forecast.reorderDate) : '-'}</td>
                          <td>{forecast ? forecast.recommendedOrderQty : '-'}</td>
                          <td>{formatCurrency(item.unitCostCents)}</td>
                          <td className="muted tiny">{item.location || '-'}</td>
                          <td className="muted tiny">{item.lotNumber || '-'}</td>
                          <td>
                            <div className="action-buttons">
                              <button
                                type="button"
                                className="btn-sm btn-secondary"
                                onClick={() => {
                                  setSelectedItem(item);
                                  setAdjustQuantity(0);
                                  setAdjustReason('adjustment');
                                  setShowAdjustModal(true);
                                }}
                              >
                                Correct Stock
                              </button>
                              {(forecast?.dueBucket === 'week' || isLow) && (
                                <button
                                  type="button"
                                  className="btn-sm btn-primary"
                                  onClick={() => {
                                    showSuccess(`Reorder reminder created for ${item.name}.`);
                                  }}
                                >
                                  Reorder
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}

      {viewMode === 'cabinets' && (
        <>
          {allCabinets.length > 0 && (
            <div className="cabinet-filters">
              <div className="search-box">
                <input
                  id="cabinet-search"
                  name="cabinet-search"
                  type="text"
                  placeholder="Search cabinets..."
                  value={cabinetSearchTerm}
                  onChange={(event) => setCabinetSearchTerm(event.target.value)}
                />
              </div>

              <div className="filter-tabs">
                <button
                  type="button"
                  className={`filter-tab ${facilityFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setFacilityFilter('all')}
                >
                  All Facilities
                </button>
                {facilities.map((facility) => (
                  <button
                    key={facility}
                    type="button"
                    className={`filter-tab ${facilityFilter === facility ? 'active' : ''}`}
                    onClick={() => setFacilityFilter(facility)}
                  >
                    {facility}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Panel title="Preferred Cabinets">
            {preferredCabinets.length === 0 ? (
              <div className="inventory-empty">No preferred cabinets selected.</div>
            ) : (
              <div className="cabinets-table">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Facility</th>
                      <th>Description</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preferredCabinets.map((cabinet) => (
                      <tr key={cabinet.id}>
                        <td className="strong">{cabinet.name}</td>
                        <td className="muted">{cabinet.facility}</td>
                        <td className="muted tiny">{cabinet.description}</td>
                        <td>
                          <button
                            type="button"
                            className="btn-sm btn-remove"
                            onClick={() => removeFromPreferred(cabinet.id)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Available Cabinets">
            {filteredAvailableCabinets.length === 0 ? (
              <div className="inventory-empty">No cabinets configured yet.</div>
            ) : (
              <div className="cabinets-table">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Facility</th>
                      <th>Description</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAvailableCabinets.map((cabinet) => (
                      <tr key={cabinet.id}>
                        <td className="strong">{cabinet.name}</td>
                        <td className="muted">{cabinet.facility}</td>
                        <td className="muted tiny">{cabinet.description}</td>
                        <td>
                          <button
                            type="button"
                            className="btn-sm btn-add"
                            onClick={() => addToPreferred(cabinet.id)}
                          >
                            Add
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}

      <Modal
        isOpen={showAdjustModal}
        title="Adjust Stock"
        onClose={() => {
          setShowAdjustModal(false);
          setSelectedItem(null);
        }}
      >
        {selectedItem && (
          <div className="modal-form">
            <div className="adjust-item-info">
              <span className="item-icon">{getCategoryIcon(selectedItem.category)}</span>
              <div>
                <div className="strong">{selectedItem.name}</div>
                <div className="muted">Current: {selectedItem.quantity} units</div>
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="adjust-quantity">Adjustment</label>
              <div className="adjust-controls">
                <button
                  type="button"
                  className="adjust-btn"
                  onClick={() => setAdjustQuantity((prev) => prev - 1)}
                >
                  -
                </button>
                <input
                  id="adjust-quantity"
                  name="adjust-quantity"
                  type="number"
                  value={adjustQuantity}
                  onChange={(event) => setAdjustQuantity(Number.parseInt(event.target.value, 10) || 0)}
                  className="adjust-input"
                />
                <button
                  type="button"
                  className="adjust-btn"
                  onClick={() => setAdjustQuantity((prev) => prev + 1)}
                >
                  +
                </button>
              </div>
              <div className="adjust-preview muted">New quantity: {selectedItem.quantity + adjustQuantity}</div>
            </div>

            <div className="form-field">
              <label htmlFor="adjust-reason">Reason</label>
              <select
                id="adjust-reason"
                name="adjust-reason"
                value={adjustReason}
                onChange={(event) => setAdjustReason(event.target.value as AdjustReason)}
              >
                <option value="received">Received shipment</option>
                <option value="expired">Expired/disposed</option>
                <option value="damaged">Damaged</option>
                <option value="adjustment">Inventory adjustment</option>
                <option value="correction">Inventory correction</option>
              </select>
            </div>
          </div>
        )}

        <div className="modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setShowAdjustModal(false);
              setSelectedItem(null);
            }}
          >
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleAdjustStock}>
            Save Adjustment
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={showManualAdjustModal}
        title="Manual Stock Correction"
        onClose={() => {
          setShowManualAdjustModal(false);
          resetManualAdjustForm();
        }}
      >
        <div className="modal-form">
          <div className="form-field">
            <label htmlFor="manual-adjust-item">Item</label>
            <select
              id="manual-adjust-item"
              name="manual-adjust-item"
              value={manualAdjustItemId}
              onChange={(event) => setManualAdjustItemId(event.target.value)}
            >
              <option value="">Select item...</option>
              {inventory.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.quantity} on hand)
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="manual-adjust-qty">Adjustment Quantity</label>
              <input
                id="manual-adjust-qty"
                name="manual-adjust-qty"
                type="number"
                value={manualAdjustQuantity}
                onChange={(event) => setManualAdjustQuantity(event.target.value)}
                placeholder="Use negative values to reduce stock"
              />
            </div>
            <div className="form-field">
              <label htmlFor="manual-adjust-reason">Reason</label>
              <select
                id="manual-adjust-reason"
                name="manual-adjust-reason"
                value={manualAdjustReason}
                onChange={(event) => setManualAdjustReason(event.target.value as AdjustReason)}
              >
                <option value="received">Received shipment</option>
                <option value="expired">Expired/disposed</option>
                <option value="damaged">Damaged</option>
                <option value="adjustment">Inventory adjustment</option>
                <option value="correction">Inventory correction</option>
              </select>
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="manual-adjust-notes">Notes (optional)</label>
            <input
              id="manual-adjust-notes"
              name="manual-adjust-notes"
              type="text"
              value={manualAdjustNotes}
              onChange={(event) => setManualAdjustNotes(event.target.value)}
              placeholder="Why this correction was needed"
            />
          </div>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setShowManualAdjustModal(false);
              resetManualAdjustForm();
            }}
          >
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleManualAdjustStock}>
            Save Correction
          </button>
        </div>
      </Modal>

      <Modal isOpen={showAddModal} title="Add Inventory Item" onClose={closeAddModal} size="lg">
        <div className="modal-form">
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="add-item-name">Item Name *</label>
              <input
                id="add-item-name"
                name="add-item-name"
                type="text"
                value={addItemForm.name}
                onChange={(event) => updateAddItemForm('name', event.target.value)}
                placeholder="Item name"
              />
            </div>
            <div className="form-field">
              <label htmlFor="add-item-sku">SKU</label>
              <input
                id="add-item-sku"
                name="add-item-sku"
                type="text"
                value={addItemForm.sku}
                onChange={(event) => updateAddItemForm('sku', event.target.value)}
                placeholder="SKU-XXX"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="add-item-category">Category</label>
              <select
                id="add-item-category"
                name="add-item-category"
                value={addItemForm.category}
                onChange={(event) => updateAddItemForm('category', event.target.value as ItemCategory)}
              >
                <option value="medication">Medication</option>
                <option value="supply">Supply</option>
                <option value="cosmetic">Cosmetic</option>
                <option value="equipment">Equipment</option>
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="add-item-supplier">Supplier</label>
              <input
                id="add-item-supplier"
                name="add-item-supplier"
                type="text"
                value={addItemForm.supplier}
                onChange={(event) => updateAddItemForm('supplier', event.target.value)}
                placeholder="Supplier name"
              />
            </div>
            <div className="form-field">
              <label htmlFor="add-item-location">Location</label>
              <input
                id="add-item-location"
                name="add-item-location"
                type="text"
                value={addItemForm.location}
                onChange={(event) => updateAddItemForm('location', event.target.value)}
                placeholder="Storage location"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="add-item-quantity">Initial Quantity</label>
              <input
                id="add-item-quantity"
                name="add-item-quantity"
                type="number"
                value={addItemForm.quantity}
                onChange={(event) => updateAddItemForm('quantity', event.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="add-item-reorder-level">Reorder Level</label>
              <input
                id="add-item-reorder-level"
                name="add-item-reorder-level"
                type="number"
                value={addItemForm.reorderLevel}
                onChange={(event) => updateAddItemForm('reorderLevel', event.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="add-item-unit-cost">Unit Cost (USD)</label>
              <input
                id="add-item-unit-cost"
                name="add-item-unit-cost"
                type="number"
                step="0.01"
                value={addItemForm.unitCostDollars}
                onChange={(event) => updateAddItemForm('unitCostDollars', event.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="add-item-lot-number">Lot Number</label>
              <input
                id="add-item-lot-number"
                name="add-item-lot-number"
                type="text"
                value={addItemForm.lotNumber}
                onChange={(event) => updateAddItemForm('lotNumber', event.target.value)}
                placeholder="Optional lot number"
              />
            </div>
            <div className="form-field">
              <label htmlFor="add-item-expiration">Expiration Date</label>
              <input
                id="add-item-expiration"
                name="add-item-expiration"
                type="date"
                value={addItemForm.expirationDate}
                onChange={(event) => updateAddItemForm('expirationDate', event.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="add-item-description">Description</label>
              <input
                id="add-item-description"
                name="add-item-description"
                type="text"
                value={addItemForm.description}
                onChange={(event) => updateAddItemForm('description', event.target.value)}
                placeholder="Optional details"
              />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={closeAddModal}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleAddItem}>
            Add Item
          </button>
        </div>
      </Modal>

      <style>{`
        .inventory-page {
          padding: 1.5rem;
          background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
          min-height: 100vh;
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1.25rem;
        }

        .page-header h1 {
          margin: 0;
          color: #78350f;
        }

        .header-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
        }

        .view-mode-tabs {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1.25rem;
          background: white;
          border-radius: 12px;
          padding: 0.5rem;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
        }

        .view-tab {
          flex: 1;
          padding: 0.875rem 1rem;
          background: transparent;
          border: 2px solid transparent;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
          color: #92400e;
        }

        .view-tab.active {
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          border-color: #f59e0b;
          color: #ffffff;
        }

        .inventory-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .stat-card {
          background: white;
          border: 2px solid #fbbf24;
          border-radius: 12px;
          padding: 1rem;
          text-align: center;
        }

        .stat-card.warning {
          border-color: #ef4444;
        }

        .stat-value {
          font-size: 1.7rem;
          font-weight: 700;
          color: #92400e;
        }

        .stat-label {
          font-size: 0.825rem;
          color: #b45309;
          margin-top: 0.25rem;
        }

        .low-stock-alert {
          background: #fee2e2;
          border: 1px solid #f87171;
          border-radius: 10px;
          padding: 0.85rem 1rem;
          margin-bottom: 1rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
        }

        .alert-text {
          color: #991b1b;
          font-weight: 600;
        }

        .reorder-filters-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.6rem;
          margin-bottom: 0.65rem;
        }

        .reorder-filter-btn {
          border: 1px solid #d1d5db;
          border-radius: 999px;
          background: white;
          color: #374151;
          padding: 0.45rem 0.85rem;
          cursor: pointer;
          font-weight: 600;
        }

        .reorder-filter-btn.active {
          background: #2563eb;
          border-color: #2563eb;
          color: #ffffff;
        }

        .filter-summary {
          margin-bottom: 0.9rem;
          color: #6b7280;
          font-size: 0.9rem;
        }

        .workflow-note {
          margin-bottom: 1rem;
          border: 1px solid #bfdbfe;
          background: #eff6ff;
          border-radius: 10px;
          padding: 0.75rem 1rem;
          color: #1e3a8a;
          font-size: 0.9rem;
          font-weight: 500;
        }

        .usage-report-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 0.75rem;
          margin-bottom: 1rem;
        }

        .usage-stat-card {
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          padding: 0.75rem;
          background: #f9fafb;
        }

        .usage-stat-label {
          font-size: 0.75rem;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-bottom: 0.2rem;
        }

        .usage-stat-value {
          font-size: 1.2rem;
          font-weight: 700;
          color: #111827;
        }

        .usage-empty {
          border: 1px dashed #d1d5db;
          border-radius: 8px;
          padding: 1rem;
          text-align: center;
          color: #6b7280;
          margin-bottom: 0.75rem;
        }

        .usage-table-wrap {
          overflow-x: auto;
        }

        .usage-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 0.75rem;
        }

        .usage-table th,
        .usage-table td {
          border-bottom: 1px solid #e5e7eb;
          padding: 0.6rem;
          text-align: left;
          font-size: 0.85rem;
        }

        .usage-table th {
          color: #374151;
          background: #f9fafb;
          font-size: 0.78rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .usage-report-actions {
          display: flex;
          justify-content: flex-end;
        }

        .inventory-filters,
        .cabinet-filters {
          background: white;
          border-radius: 12px;
          padding: 1rem;
          margin-bottom: 1rem;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.04);
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
          align-items: center;
        }

        .search-box {
          min-width: 240px;
          flex: 1;
        }

        .search-box input {
          width: 100%;
          padding: 0.625rem;
          border: 1px solid #d1d5db;
          border-radius: 8px;
        }

        .filter-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .filter-tab {
          padding: 0.45rem 0.8rem;
          border: 1px solid #d1d5db;
          border-radius: 999px;
          background: white;
          color: #374151;
          cursor: pointer;
        }

        .filter-tab.active {
          background: #f59e0b;
          border-color: #f59e0b;
          color: white;
        }

        .checkbox-label {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          font-size: 0.9rem;
        }

        .inventory-empty {
          padding: 2.2rem;
          text-align: center;
          color: #6b7280;
        }

        .inventory-table,
        .cabinets-table {
          overflow-x: auto;
        }

        .inventory-table table,
        .cabinets-table table {
          width: 100%;
          border-collapse: collapse;
        }

        .inventory-table th,
        .cabinets-table th {
          text-align: left;
          padding: 0.75rem;
          background: #fffbeb;
          border-bottom: 1px solid #f3f4f6;
          font-size: 0.83rem;
          color: #92400e;
        }

        .inventory-table td,
        .cabinets-table td {
          padding: 0.75rem;
          border-bottom: 1px solid #f3f4f6;
          background: #fff;
        }

        .low-stock-row td {
          background: #fff7ed;
        }

        .item-name {
          display: flex;
          align-items: center;
          gap: 0.6rem;
        }

        .item-icon {
          min-width: 42px;
          min-height: 24px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 0.72rem;
          font-weight: 700;
          border: 1px solid #d1d5db;
          border-radius: 999px;
          background: #f9fafb;
          color: #374151;
        }

        .pill {
          padding: 0.2rem 0.5rem;
          border-radius: 999px;
          font-size: 0.72rem;
          text-transform: capitalize;
        }

        .pill.medication {
          background: #dbeafe;
          color: #1d4ed8;
        }

        .pill.supply {
          background: #dcfce7;
          color: #166534;
        }

        .pill.cosmetic {
          background: #fee2e2;
          color: #991b1b;
        }

        .pill.equipment {
          background: #ede9fe;
          color: #6d28d9;
        }

        .low-qty,
        .warning-text {
          color: #dc2626;
          font-weight: 700;
        }

        .action-buttons {
          display: flex;
          gap: 0.5rem;
        }

        .adjust-item-info {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          padding: 0.85rem;
          border-radius: 8px;
          background: #fef3c7;
        }

        .adjust-controls {
          display: flex;
          align-items: center;
          gap: 0.65rem;
        }

        .adjust-btn {
          width: 36px;
          height: 36px;
          border: none;
          border-radius: 6px;
          background: #f59e0b;
          color: white;
          font-size: 1.15rem;
          cursor: pointer;
        }

        .adjust-input {
          width: 88px;
          padding: 0.5rem;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          text-align: center;
        }

        .adjust-preview {
          margin-top: 0.5rem;
        }

        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
          margin-top: 1rem;
        }

        .form-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 0.85rem;
        }

        .modal-form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .form-field {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }

        .form-field input,
        .form-field select {
          padding: 0.6rem;
          border: 1px solid #d1d5db;
          border-radius: 8px;
        }

        .strong {
          font-weight: 600;
        }

        .muted {
          color: #6b7280;
        }

        .tiny {
          font-size: 0.78rem;
        }

        .btn-add {
          background: #16a34a;
          border: none;
          color: white;
          border-radius: 8px;
          padding: 0.45rem 0.7rem;
          cursor: pointer;
        }

        .btn-remove {
          background: #dc2626;
          border: none;
          color: white;
          border-radius: 8px;
          padding: 0.45rem 0.7rem;
          cursor: pointer;
        }

        @media (max-width: 720px) {
          .inventory-page {
            padding: 1rem;
          }

          .header-actions {
            width: 100%;
          }

          .header-actions button {
            flex: 1;
            min-width: 150px;
          }
        }
      `}</style>
    </div>
  );
}
