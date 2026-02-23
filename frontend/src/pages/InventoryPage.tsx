import { useState, useEffect } from 'react';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { Panel, Modal } from '../components/ui';
import { fetchInventoryItems, adjustInventory } from '../api';
import { InventoryUsageModal } from '../components/InventoryUsageModal';

// 90 days in milliseconds - computed once at module load
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

type ItemCategory = 'medication' | 'supply' | 'cosmetic' | 'equipment';
type ViewMode = 'inventory' | 'cabinets';

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

const MOCK_CABINETS: Cabinet[] = [
  { id: 'c1', name: 'Sample Closet', facility: 'Main Office', description: 'Medical samples and supplies' },
  { id: 'c2', name: 'Meridian Lab Fridge', facility: 'Meridian Clinic', description: 'Temperature-controlled medications' },
  { id: 'c3', name: 'Med Cabinet', facility: 'Main Office', description: 'General medications' },
  { id: 'c4', name: 'Cosmetic Fridge', facility: 'Main Office', description: 'Cosmetic injectables' },
  { id: 'c5', name: 'Supply Closet', facility: 'Main Office', description: 'General medical supplies' },
  { id: 'c6', name: 'Procedure Room Cabinet', facility: 'Main Office', description: 'Procedure-specific equipment' },
  { id: 'c7', name: 'Cryo Storage Tank', facility: 'Main Office', description: 'Liquid nitrogen storage' },
  { id: 'c8', name: 'Laser Room Cabinet', facility: 'Main Office', description: 'Laser supplies and accessories' },
];

export function InventoryPage() {
  const { showSuccess, showError } = useToast();
  const { session } = useAuth();

  // View mode state
  const [viewMode, setViewMode] = useState<ViewMode>('inventory');

  // Inventory state
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<ItemCategory | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showLowStock, setShowLowStock] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showUsageModal, setShowUsageModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [adjustQuantity, setAdjustQuantity] = useState(0);
  const [adjustReason, setAdjustReason] = useState<'received' | 'expired' | 'damaged' | 'adjustment' | 'correction'>('adjustment');

  // Cabinet state
  const [allCabinets] = useState<Cabinet[]>(MOCK_CABINETS);
  const [preferredCabinetIds, setPreferredCabinetIds] = useState<string[]>([]);
  const [cabinetSearchTerm, setCabinetSearchTerm] = useState('');
  const [facilityFilter, setFacilityFilter] = useState<string>('all');

  // Load inventory from API
  useEffect(() => {
    if (!session) {
      setInventory([]);
      setLoading(false);
      return;
    }
    fetchInventory();
  }, [session, categoryFilter, showLowStock]);

  const fetchInventory = async () => {
    if (!session) return;
    try {
      setLoading(true);
      const response = await fetchInventoryItems(
        session.tenantId,
        session.accessToken,
        {
          category: categoryFilter !== 'all' ? categoryFilter : undefined,
          lowStock: showLowStock || undefined,
        },
      );
      setInventory(response.items || []);
    } catch (error) {
      showError('Failed to load inventory');
      console.error('Failed to fetch inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load preferred cabinets from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('preferredCabinets');
    if (saved) {
      try {
        setPreferredCabinetIds(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load preferred cabinets', e);
      }
    }
  }, []);

  // Save preferred cabinets to localStorage when changed
  useEffect(() => {
    localStorage.setItem('preferredCabinets', JSON.stringify(preferredCabinetIds));
  }, [preferredCabinetIds]);

  const lowStockItems = inventory.filter((item) => item.quantity <= item.reorderLevel);

  // Use lazy initializer so Date.now() is only called once on mount
  const [expirationThreshold] = useState(() => new Date(Date.now() + NINETY_DAYS_MS));

  const filteredInventory = inventory.filter((item) => {
    if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
    if (showLowStock && item.quantity > item.reorderLevel) return false;
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      if (
        !item.name.toLowerCase().includes(search) &&
        !item.sku.toLowerCase().includes(search)
      ) {
        return false;
      }
    }
    return true;
  });

  // Cabinet management functions
  const addToPreferred = (cabinetId: string) => {
    const cabinet = allCabinets.find((c) => c.id === cabinetId);
    if (cabinet) {
      setPreferredCabinetIds((prev) => [...prev, cabinetId]);
      showSuccess(`Added ${cabinet.name} to preferred cabinets`);
    }
  };

  const removeFromPreferred = (cabinetId: string) => {
    const cabinet = allCabinets.find((c) => c.id === cabinetId);
    if (cabinet) {
      setPreferredCabinetIds((prev) => prev.filter((id) => id !== cabinetId));
      showSuccess(`Removed ${cabinet.name} from preferred cabinets`);
    }
  };

  // Get unique facilities
  const facilities = Array.from(new Set(allCabinets.map((c) => c.facility))).sort();

  // Filter cabinets
  const filteredAvailableCabinets = allCabinets
    .filter((cabinet) => !preferredCabinetIds.includes(cabinet.id))
    .filter((cabinet) => {
      if (facilityFilter !== 'all' && cabinet.facility !== facilityFilter) return false;
      if (cabinetSearchTerm) {
        const search = cabinetSearchTerm.toLowerCase();
        return (
          cabinet.name.toLowerCase().includes(search) ||
          cabinet.facility.toLowerCase().includes(search)
        );
      }
      return true;
    });

  const preferredCabinets = allCabinets.filter((cabinet) =>
    preferredCabinetIds.includes(cabinet.id)
  );

  const handleAdjustStock = async () => {
    if (!selectedItem) return;
    if (!session) {
      showError('Session expired. Please log in again.');
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

      // Refresh inventory
      fetchInventory();
    } catch (error) {
      showError('Failed to adjust stock');
      console.error('Failed to adjust stock:', error);
    }
  };

  const formatCurrency = (amountCents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amountCents / 100);
  };

  const getCategoryIcon = (category: ItemCategory) => {
    switch (category) {
      case 'medication':
        return '💊';
      case 'supply':
        return '🩹';
      case 'cosmetic':
        return '💉';
      case 'equipment':
        return '🔬';
    }
  };

  const totalValue = inventory.reduce((sum, item) => sum + item.quantity * item.unitCostCents, 0);

  return (
    <div className="inventory-page">
      <div className="page-header">
        <h1>Inventory Management</h1>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowUsageModal(true)}
          >
            Record Usage
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowAddModal(true)}
          >
            + Add Item
          </button>
        </div>
      </div>

      {/* View Mode Tabs */}
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

      {/* Stats - Only show for inventory view */}
      {viewMode === 'inventory' && (
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
        </div>
      )}

      {/* Inventory View */}
      {viewMode === 'inventory' && (
        <>
          {/* Low Stock Alert */}
          {lowStockItems.length > 0 && (
            <div className="low-stock-alert">
              <span className="alert-icon"></span>
              <span className="alert-text">
                {lowStockItems.length} item(s) need reordering
              </span>
              <button
                type="button"
                className="btn-sm btn-secondary"
                onClick={() => setShowLowStock(true)}
              >
                View All
              </button>
            </div>
          )}

          {/* Filters */}
          <div className="inventory-filters">
            <div className="search-box">
              <input
                type="text"
                placeholder="Search by name or SKU..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="filter-tabs">
              <button
                type="button"
                className={`filter-tab ${categoryFilter === 'all' ? 'active' : ''}`}
                onClick={() => { setCategoryFilter('all'); setShowLowStock(false); }}
              >
                All
              </button>
              <button
                type="button"
                className={`filter-tab ${categoryFilter === 'medication' ? 'active' : ''}`}
                onClick={() => { setCategoryFilter('medication'); setShowLowStock(false); }}
              >
                Medications
              </button>
              <button
                type="button"
                className={`filter-tab ${categoryFilter === 'supply' ? 'active' : ''}`}
                onClick={() => { setCategoryFilter('supply'); setShowLowStock(false); }}
              >
                Supplies
              </button>
              <button
                type="button"
                className={`filter-tab ${categoryFilter === 'cosmetic' ? 'active' : ''}`}
                onClick={() => { setCategoryFilter('cosmetic'); setShowLowStock(false); }}
              >
                Cosmetics
              </button>
              <button
                type="button"
                className={`filter-tab ${categoryFilter === 'equipment' ? 'active' : ''}`}
                onClick={() => { setCategoryFilter('equipment'); setShowLowStock(false); }}
              >
                Equipment
              </button>
            </div>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={showLowStock}
                onChange={(e) => setShowLowStock(e.target.checked)}
              />
              Show Low Stock Only
            </label>
          </div>

          {/* Inventory Table */}
          <Panel title="">
            {loading ? (
              <div style={{ padding: '3rem', textAlign: 'center' }}>
                <div className="muted">Loading inventory...</div>
              </div>
            ) : filteredInventory.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center' }}>
                <div className="muted">No inventory items found</div>
              </div>
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
                      <th>Unit Cost</th>
                      <th>Location</th>
                      <th>Lot #</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInventory.map((item) => {
                      const isLow = item.quantity <= item.reorderLevel;
                      const isExpiringSoon = item.expirationDate &&
                        new Date(item.expirationDate) < expirationThreshold;

                      return (
                        <tr key={item.id} className={isLow ? 'low-stock-row' : ''}>
                          <td>
                            <div className="item-name">
                              <span className="item-icon">{getCategoryIcon(item.category)}</span>
                              <div>
                                <div className="strong">{item.name}</div>
                                {item.expirationDate && (
                                  <div className={`expiration tiny ${isExpiringSoon ? 'warning' : 'muted'}`}>
                                    Exp: {new Date(item.expirationDate).toLocaleDateString()}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="muted tiny">{item.sku}</td>
                          <td>
                            <span className={`pill ${item.category}`}>
                              {item.category}
                            </span>
                          </td>
                          <td>
                            <span className={isLow ? 'low-qty' : ''}>
                              {item.quantity}
                            </span>
                          </td>
                          <td className="muted">{item.reorderLevel}</td>
                          <td>{formatCurrency(item.unitCostCents)}</td>
                          <td className="muted tiny">{item.location}</td>
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
                                Adjust
                              </button>
                              {isLow && (
                                <button type="button" className="btn-sm btn-primary">
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

      {/* Cabinets View */}
      {viewMode === 'cabinets' && (
        <>
          {/* Cabinet Filters */}
          <div className="cabinet-filters">
            <div className="search-box">
              <input
                type="text"
                placeholder="Search cabinets..."
                value={cabinetSearchTerm}
                onChange={(e) => setCabinetSearchTerm(e.target.value)}
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

          {/* Preferred Cabinets Section */}
          <Panel title="Preferred Cabinets">
            {preferredCabinets.length === 0 ? (
              <div className="empty-cabinets">
                <p className="muted">No preferred cabinets selected. Add cabinets from the list below.</p>
              </div>
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
                        <td>
                          <div className="strong">{cabinet.name}</div>
                        </td>
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

          {/* Available Cabinets Section */}
          <Panel title="Available Cabinets">
            {filteredAvailableCabinets.length === 0 ? (
              <div className="empty-cabinets">
                <p className="muted">No available cabinets found.</p>
              </div>
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
                        <td>
                          <div className="strong">{cabinet.name}</div>
                        </td>
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

      {/* Adjust Stock Modal */}
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
              <label>Adjustment</label>
              <div className="adjust-controls">
                <button
                  type="button"
                  className="adjust-btn"
                  onClick={() => setAdjustQuantity((prev) => prev - 1)}
                >
                  -
                </button>
                <input
                  type="number"
                  value={adjustQuantity}
                  onChange={(e) => setAdjustQuantity(parseInt(e.target.value) || 0)}
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
              <div className="adjust-preview muted">
                New quantity: {selectedItem.quantity + adjustQuantity}
              </div>
            </div>

            <div className="form-field">
              <label>Reason</label>
              <select value={adjustReason} onChange={(e) => setAdjustReason(e.target.value as any)}>
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
            onClick={() => setShowAdjustModal(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleAdjustStock}
          >
            Save Adjustment
          </button>
        </div>
      </Modal>

      {/* Inventory Usage Modal */}
      <InventoryUsageModal
        isOpen={showUsageModal}
        onClose={() => {
          setShowUsageModal(false);
          fetchInventory(); // Refresh inventory after recording usage
        }}
      />

      {/* Add Item Modal */}
      <Modal
        isOpen={showAddModal}
        title="Add Inventory Item"
        onClose={() => setShowAddModal(false)}
        size="lg"
      >
        <div className="modal-form">
          <div className="form-row">
            <div className="form-field">
              <label>Item Name *</label>
              <input type="text" placeholder="Item name" />
            </div>
            <div className="form-field">
              <label>SKU</label>
              <input type="text" placeholder="SKU-XXX" />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Category</label>
              <select>
                <option value="medication">Medication</option>
                <option value="supply">Supply</option>
                <option value="cosmetic">Cosmetic</option>
                <option value="equipment">Equipment</option>
              </select>
            </div>
            <div className="form-field">
              <label>Supplier</label>
              <input type="text" placeholder="Supplier name" />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Initial Quantity</label>
              <input type="number" defaultValue={0} />
            </div>
            <div className="form-field">
              <label>Reorder Level</label>
              <input type="number" defaultValue={10} />
            </div>
            <div className="form-field">
              <label>Unit Cost</label>
              <input type="number" step="0.01" placeholder="0.00" />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Location</label>
              <input type="text" placeholder="Storage location" />
            </div>
            <div className="form-field">
              <label>Expiration Date</label>
              <input type="date" />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowAddModal(false)}
          >
            Cancel
          </button>
          <button type="button" className="btn-primary">
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
          margin-bottom: 1.5rem;
          animation: slideDown 0.4s ease-out;
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .page-header h1 {
          margin: 0;
          color: #78350f;
        }

        /* View Mode Tabs */
        .view-mode-tabs {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1.5rem;
          background: white;
          border-radius: 12px;
          padding: 0.5rem;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
        }

        .view-tab {
          flex: 1;
          padding: 0.875rem 1.5rem;
          background: transparent;
          border: 2px solid transparent;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
          color: #92400e;
          transition: all 0.2s ease;
          font-size: 1rem;
        }

        .view-tab:hover {
          background: #fef3c7;
        }

        .view-tab.active {
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          border-color: #f59e0b;
          color: white;
          box-shadow: 0 4px 6px rgba(245, 158, 11, 0.3);
        }

        .inventory-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1.25rem;
          margin-bottom: 2rem;
          animation: fadeIn 0.5s ease-out 0.1s both;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        .stat-card {
          background: white;
          border: 2px solid #fbbf24;
          border-radius: 12px;
          padding: 1.5rem;
          text-align: center;
          box-shadow: 0 4px 6px rgba(251, 191, 36, 0.15);
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }

        .stat-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          background: linear-gradient(90deg, #f59e0b, #fbbf24);
        }

        .stat-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 16px rgba(251, 191, 36, 0.25);
          border-color: #f59e0b;
        }

        .stat-card.warning {
          border-color: #ef4444;
        }

        .stat-card.warning::before {
          background: linear-gradient(90deg, #dc2626, #ef4444);
        }

        .stat-value {
          font-size: 2rem;
          font-weight: bold;
          color: #92400e;
        }

        .stat-label {
          font-size: 0.875rem;
          color: #b45309;
          margin-top: 0.5rem;
          font-weight: 500;
        }

        .low-stock-alert {
          background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
          border: 2px solid #f87171;
          border-radius: 12px;
          padding: 1rem 1.5rem;
          margin-bottom: 1.5rem;
          display: flex;
          align-items: center;
          gap: 1rem;
          box-shadow: 0 4px 6px rgba(239, 68, 68, 0.15);
        }

        .alert-icon {
          font-size: 1.5rem;
        }

        .alert-text {
          flex: 1;
          color: #991b1b;
          font-weight: 600;
        }

        .inventory-filters {
          background: white;
          border-radius: 12px;
          padding: 1.5rem;
          margin-bottom: 1.5rem;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
          align-items: center;
        }

        .search-box {
          flex: 1;
          min-width: 250px;
        }

        .search-box input {
          width: 100%;
          padding: 0.75rem 1rem;
          border: 2px solid #fde68a;
          border-radius: 8px;
          font-size: 1rem;
          transition: all 0.2s ease;
        }

        .search-box input:focus {
          outline: none;
          border-color: #f59e0b;
          box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.1);
        }

        .filter-tabs {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .filter-tab {
          padding: 0.625rem 1.25rem;
          background: white;
          border: 2px solid #fde68a;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 500;
          color: #b45309;
          transition: all 0.2s ease;
        }

        .filter-tab:hover {
          background: #fef3c7;
          border-color: #fbbf24;
        }

        .filter-tab.active {
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          border-color: #f59e0b;
          color: white;
          box-shadow: 0 4px 6px rgba(245, 158, 11, 0.3);
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          color: #92400e;
          font-weight: 500;
        }

        .inventory-table {
          overflow-x: auto;
        }

        .inventory-table table {
          width: 100%;
          border-collapse: collapse;
        }

        .inventory-table th {
          text-align: left;
          padding: 1rem;
          background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
          color: white;
          font-weight: 600;
          border-bottom: 2px solid #d97706;
        }

        .inventory-table th:first-child {
          border-top-left-radius: 8px;
        }

        .inventory-table th:last-child {
          border-top-right-radius: 8px;
        }

        .inventory-table td {
          padding: 1rem;
          border-bottom: 1px solid #fef3c7;
        }

        .inventory-table tbody tr {
          background: white;
          transition: background 0.2s ease;
        }

        .inventory-table tbody tr:hover {
          background: #fffbeb;
        }

        .low-stock-row {
          background: #fef2f2 !important;
        }

        .low-stock-row:hover {
          background: #fee2e2 !important;
        }

        .item-name {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .item-icon {
          font-size: 1.5rem;
        }

        .strong {
          font-weight: 600;
          color: #1f2937;
        }

        .expiration {
          font-size: 0.75rem;
        }

        .expiration.warning {
          color: #dc2626;
          font-weight: 600;
        }

        .pill {
          display: inline-block;
          padding: 0.375rem 0.875rem;
          border-radius: 12px;
          font-size: 0.875rem;
          font-weight: 500;
          text-transform: capitalize;
        }

        .pill.medication {
          background: #dbeafe;
          color: #1e40af;
        }

        .pill.supply {
          background: #d1fae5;
          color: #065f46;
        }

        .pill.cosmetic {
          background: #fce7f3;
          color: #9f1239;
        }

        .pill.equipment {
          background: #f3e8ff;
          color: #6b21a8;
        }

        .low-qty {
          color: #dc2626;
          font-weight: bold;
        }

        .action-buttons {
          display: flex;
          gap: 0.5rem;
        }

        .adjust-item-info {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem;
          background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
          border-radius: 8px;
          margin-bottom: 1.5rem;
        }

        .adjust-controls {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .adjust-btn {
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          border: none;
          border-radius: 8px;
          color: white;
          font-size: 1.25rem;
          font-weight: bold;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .adjust-btn:hover {
          transform: scale(1.1);
          box-shadow: 0 4px 8px rgba(245, 158, 11, 0.3);
        }

        .adjust-input {
          width: 100px;
          padding: 0.75rem;
          border: 2px solid #fbbf24;
          border-radius: 8px;
          text-align: center;
          font-size: 1.25rem;
          font-weight: bold;
        }

        .adjust-preview {
          margin-top: 0.5rem;
          font-style: italic;
        }

        .muted {
          color: #6b7280;
        }

        .tiny {
          font-size: 0.75rem;
        }

        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
          margin-top: 1.5rem;
        }

        .form-field {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .form-field label {
          font-weight: 500;
          color: #374151;
        }

        .form-field input,
        .form-field select {
          padding: 0.625rem;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 1rem;
        }

        .form-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
        }

        .modal-form {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        /* Cabinet Filters */
        .cabinet-filters {
          background: white;
          border-radius: 12px;
          padding: 1.5rem;
          margin-bottom: 1.5rem;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
          align-items: center;
        }

        /* Cabinet Tables */
        .cabinets-table {
          overflow-x: auto;
        }

        .cabinets-table table {
          width: 100%;
          border-collapse: collapse;
        }

        .cabinets-table th {
          text-align: left;
          padding: 1rem;
          background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
          color: white;
          font-weight: 600;
          border-bottom: 2px solid #d97706;
        }

        .cabinets-table th:first-child {
          border-top-left-radius: 8px;
        }

        .cabinets-table th:last-child {
          border-top-right-radius: 8px;
        }

        .cabinets-table td {
          padding: 1rem;
          border-bottom: 1px solid #fef3c7;
        }

        .cabinets-table tbody tr {
          background: white;
          transition: background 0.2s ease;
        }

        .cabinets-table tbody tr:hover {
          background: #fffbeb;
        }

        /* Empty State */
        .empty-cabinets {
          padding: 3rem;
          text-align: center;
        }

        .empty-cabinets p {
          font-size: 1rem;
          margin: 0;
        }

        /* Cabinet Action Buttons */
        .btn-add {
          padding: 0.5rem 1rem;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 2px 4px rgba(16, 185, 129, 0.2);
        }

        .btn-add:hover {
          background: linear-gradient(135deg, #059669 0%, #047857 100%);
          box-shadow: 0 4px 8px rgba(16, 185, 129, 0.3);
          transform: translateY(-1px);
        }

        .btn-remove {
          padding: 0.5rem 1rem;
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 2px 4px rgba(239, 68, 68, 0.2);
        }

        .btn-remove:hover {
          background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
          box-shadow: 0 4px 8px rgba(239, 68, 68, 0.3);
          transform: translateY(-1px);
        }
      `}</style>
    </div>
  );
}
