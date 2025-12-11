import { useState } from 'react';
import { useToast } from '../contexts/ToastContext';
import { Panel, Modal } from '../components/ui';

// 90 days in milliseconds - computed once at module load
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

type ItemCategory = 'medication' | 'supply' | 'cosmetic' | 'equipment';

interface InventoryItem {
  id: string;
  name: string;
  category: ItemCategory;
  sku: string;
  quantity: number;
  reorderLevel: number;
  unitCost: number;
  supplier: string;
  expirationDate?: string;
  location: string;
}

const MOCK_INVENTORY: InventoryItem[] = [
  { id: '1', name: 'Lidocaine 1%', category: 'medication', sku: 'MED-001', quantity: 50, reorderLevel: 20, unitCost: 12.50, supplier: 'McKesson', expirationDate: '2025-06-15', location: 'Med Cabinet A' },
  { id: '2', name: 'Triamcinolone 40mg/mL', category: 'medication', sku: 'MED-002', quantity: 30, reorderLevel: 15, unitCost: 8.75, supplier: 'McKesson', expirationDate: '2025-08-20', location: 'Med Cabinet A' },
  { id: '3', name: 'Liquid Nitrogen (L)', category: 'supply', sku: 'SUP-001', quantity: 5, reorderLevel: 2, unitCost: 45.00, supplier: 'Airgas', location: 'Procedure Room' },
  { id: '4', name: 'Biopsy Punch 4mm', category: 'supply', sku: 'SUP-002', quantity: 100, reorderLevel: 50, unitCost: 2.50, supplier: 'Henry Schein', location: 'Supply Closet' },
  { id: '5', name: 'Biopsy Punch 6mm', category: 'supply', sku: 'SUP-003', quantity: 75, reorderLevel: 40, unitCost: 2.75, supplier: 'Henry Schein', location: 'Supply Closet' },
  { id: '6', name: 'Suture 4-0 Nylon', category: 'supply', sku: 'SUP-004', quantity: 200, reorderLevel: 100, unitCost: 3.25, supplier: 'Henry Schein', location: 'Supply Closet' },
  { id: '7', name: 'Botox (100 units)', category: 'cosmetic', sku: 'COS-001', quantity: 10, reorderLevel: 5, unitCost: 425.00, supplier: 'Allergan', expirationDate: '2025-04-10', location: 'Cosmetic Fridge' },
  { id: '8', name: 'Juvederm Ultra XC', category: 'cosmetic', sku: 'COS-002', quantity: 8, reorderLevel: 4, unitCost: 285.00, supplier: 'Allergan', expirationDate: '2025-09-30', location: 'Cosmetic Fridge' },
  { id: '9', name: 'Dermoscope (Heine)', category: 'equipment', sku: 'EQP-001', quantity: 3, reorderLevel: 1, unitCost: 1200.00, supplier: 'Heine USA', location: 'Exam Room 1' },
  { id: '10', name: 'Cryotherapy Gun', category: 'equipment', sku: 'EQP-002', quantity: 2, reorderLevel: 1, unitCost: 450.00, supplier: 'Brymill', location: 'Procedure Room' },
];

export function InventoryPage() {
  const { showSuccess, showError } = useToast();

  const [inventory, setInventory] = useState<InventoryItem[]>(MOCK_INVENTORY);
  const [categoryFilter, setCategoryFilter] = useState<ItemCategory | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showLowStock, setShowLowStock] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [adjustQuantity, setAdjustQuantity] = useState(0);

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

  const handleAdjustStock = () => {
    if (!selectedItem) return;

    const newQuantity = selectedItem.quantity + adjustQuantity;
    if (newQuantity < 0) {
      showError('Quantity cannot be negative');
      return;
    }

    setInventory((prev) =>
      prev.map((item) =>
        item.id === selectedItem.id ? { ...item, quantity: newQuantity } : item
      )
    );

    showSuccess(`Stock adjusted: ${selectedItem.name} now has ${newQuantity} units`);
    setShowAdjustModal(false);
    setSelectedItem(null);
    setAdjustQuantity(0);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const getCategoryIcon = (category: ItemCategory) => {
    switch (category) {
      case 'medication':
        return '💊';
      case 'supply':
        return '🩹';
      case 'cosmetic':
        return '✨';
      case 'equipment':
        return '🔧';
    }
  };

  const totalValue = inventory.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);

  return (
    <div className="inventory-page">
      <div className="page-header">
        <h1>Inventory Management</h1>
        <button
          type="button"
          className="btn-primary"
          onClick={() => setShowAddModal(true)}
        >
          + Add Item
        </button>
      </div>

      {/* Stats */}
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

      {/* Low Stock Alert */}
      {lowStockItems.length > 0 && (
        <div className="low-stock-alert">
          <span className="alert-icon">⚠️</span>
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
            💊 Medications
          </button>
          <button
            type="button"
            className={`filter-tab ${categoryFilter === 'supply' ? 'active' : ''}`}
            onClick={() => { setCategoryFilter('supply'); setShowLowStock(false); }}
          >
            🩹 Supplies
          </button>
          <button
            type="button"
            className={`filter-tab ${categoryFilter === 'cosmetic' ? 'active' : ''}`}
            onClick={() => { setCategoryFilter('cosmetic'); setShowLowStock(false); }}
          >
            ✨ Cosmetics
          </button>
          <button
            type="button"
            className={`filter-tab ${categoryFilter === 'equipment' ? 'active' : ''}`}
            onClick={() => { setCategoryFilter('equipment'); setShowLowStock(false); }}
          >
            🔧 Equipment
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
                    <td className="muted">{item.sku}</td>
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
                    <td>{formatCurrency(item.unitCost)}</td>
                    <td className="muted tiny">{item.location}</td>
                    <td>
                      <div className="action-buttons">
                        <button
                          type="button"
                          className="btn-sm btn-secondary"
                          onClick={() => {
                            setSelectedItem(item);
                            setAdjustQuantity(0);
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
      </Panel>

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
              <select>
                <option value="received">Received shipment</option>
                <option value="used">Used in procedure</option>
                <option value="expired">Expired/disposed</option>
                <option value="damaged">Damaged</option>
                <option value="adjustment">Inventory adjustment</option>
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
    </div>
  );
}
