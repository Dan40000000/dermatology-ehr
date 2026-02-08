-- Migration: Enhanced Inventory & Supply Chain Management
-- Description: Comprehensive inventory system with lot tracking, vendors, purchase orders, samples, and equipment management

-- ============================================
-- EXTEND INVENTORY ITEMS TABLE
-- ============================================

-- Add new columns to existing inventory_items table if not exists
DO $$
BEGIN
  -- Add reorder_quantity column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_items' AND column_name = 'reorder_quantity') THEN
    ALTER TABLE inventory_items ADD COLUMN reorder_quantity INTEGER DEFAULT 0;
  END IF;
END $$;

-- ============================================
-- INVENTORY LOTS TABLE (for batch/lot tracking)
-- ============================================

CREATE TABLE IF NOT EXISTS inventory_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  lot_number VARCHAR(100) NOT NULL,
  expiration_date DATE,
  quantity INTEGER NOT NULL DEFAULT 0,
  received_date DATE DEFAULT CURRENT_DATE,
  status VARCHAR(50) DEFAULT 'active',

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT valid_lot_status CHECK (status IN ('active', 'expired', 'recalled', 'depleted', 'quarantine')),
  CONSTRAINT valid_lot_quantity CHECK (quantity >= 0),
  CONSTRAINT unique_lot_per_item UNIQUE(item_id, lot_number)
);

-- ============================================
-- INVENTORY TRANSACTIONS TABLE (comprehensive audit trail)
-- ============================================

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  lot_id UUID REFERENCES inventory_lots(id) ON DELETE SET NULL,

  transaction_type VARCHAR(50) NOT NULL,
  quantity INTEGER NOT NULL,
  reference_id VARCHAR(255), -- PO ID, encounter ID, adjustment reason, etc.
  reference_type VARCHAR(50), -- purchase_order, encounter, adjustment, sample_dispense, etc.

  performed_by VARCHAR(255) NOT NULL,
  notes TEXT,

  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT valid_transaction_type CHECK (transaction_type IN (
    'received', 'used', 'adjusted', 'returned', 'expired', 'damaged',
    'transferred', 'sample_dispensed', 'correction', 'waste'
  ))
);

-- ============================================
-- VENDORS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  address JSONB, -- {street, city, state, zip, country}

  lead_time_days INTEGER DEFAULT 7,
  rating DECIMAL(3, 2) CHECK (rating >= 0 AND rating <= 5),
  payment_terms VARCHAR(100),
  account_number VARCHAR(100),

  is_active BOOLEAN DEFAULT true,
  notes TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT unique_vendor_name UNIQUE(tenant_id, name)
);

-- ============================================
-- PURCHASE ORDERS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,

  po_number VARCHAR(50) NOT NULL,
  status VARCHAR(50) DEFAULT 'draft',

  order_date DATE,
  expected_date DATE,
  received_date DATE,

  subtotal_cents INTEGER DEFAULT 0,
  tax_cents INTEGER DEFAULT 0,
  shipping_cents INTEGER DEFAULT 0,
  total_amount_cents INTEGER DEFAULT 0,

  shipping_address JSONB,
  notes TEXT,

  created_by VARCHAR(255) NOT NULL,
  approved_by VARCHAR(255),
  received_by VARCHAR(255),

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT valid_po_status CHECK (status IN (
    'draft', 'pending_approval', 'approved', 'submitted', 'partial', 'received', 'cancelled'
  )),
  CONSTRAINT unique_po_number UNIQUE(tenant_id, po_number)
);

-- ============================================
-- PURCHASE ORDER ITEMS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,

  quantity INTEGER NOT NULL,
  unit_cost_cents INTEGER NOT NULL,
  total_cents INTEGER GENERATED ALWAYS AS (quantity * unit_cost_cents) STORED,

  received_quantity INTEGER DEFAULT 0,
  lot_number VARCHAR(100),
  expiration_date DATE,

  notes TEXT,

  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT valid_po_item_quantity CHECK (quantity > 0),
  CONSTRAINT valid_received_quantity CHECK (received_quantity >= 0)
);

-- ============================================
-- MEDICATION SAMPLES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS medication_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  drug_name VARCHAR(255) NOT NULL,
  manufacturer VARCHAR(255),
  ndc_code VARCHAR(50), -- National Drug Code

  lot_number VARCHAR(100),
  quantity INTEGER NOT NULL DEFAULT 0,
  unit_size VARCHAR(50), -- e.g., "15g tube", "30mL bottle"

  expiration_date DATE,
  received_date DATE DEFAULT CURRENT_DATE,
  received_by VARCHAR(255) NOT NULL,

  category VARCHAR(100), -- topical, oral, injectable, etc.
  storage_requirements TEXT,

  is_active BOOLEAN DEFAULT true,
  notes TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- SAMPLE DISPENSING LOG TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS sample_dispensing_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sample_id UUID NOT NULL REFERENCES medication_samples(id) ON DELETE RESTRICT,
  patient_id VARCHAR(255) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  quantity INTEGER NOT NULL,

  dispensed_by VARCHAR(255) NOT NULL,
  dispensed_at TIMESTAMP DEFAULT NOW(),

  consent_obtained BOOLEAN DEFAULT false,
  consent_date TIMESTAMP,

  encounter_id VARCHAR(255) REFERENCES encounters(id) ON DELETE SET NULL,
  diagnosis_code VARCHAR(20),

  notes TEXT,

  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT valid_dispense_quantity CHECK (quantity > 0)
);

-- ============================================
-- EQUIPMENT TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  name VARCHAR(255) NOT NULL,
  serial_number VARCHAR(100),
  model VARCHAR(255),
  manufacturer VARCHAR(255),
  category VARCHAR(100) NOT NULL,

  purchase_date DATE,
  purchase_price_cents INTEGER,
  warranty_expiration DATE,

  last_maintenance DATE,
  next_maintenance DATE,
  maintenance_interval_days INTEGER DEFAULT 365,

  status VARCHAR(50) DEFAULT 'operational',
  location VARCHAR(255),

  notes TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT valid_equipment_status CHECK (status IN (
    'operational', 'maintenance', 'repair', 'out_of_service', 'retired'
  )),
  CONSTRAINT valid_equipment_category CHECK (category IN (
    'diagnostic', 'treatment', 'surgical', 'laser', 'imaging', 'sterilization', 'other'
  ))
);

-- ============================================
-- EQUIPMENT MAINTENANCE LOG TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS equipment_maintenance_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,

  maintenance_type VARCHAR(100) NOT NULL,
  performed_by VARCHAR(255) NOT NULL,
  performed_at TIMESTAMP DEFAULT NOW(),

  external_technician VARCHAR(255),
  service_company VARCHAR(255),

  cost_cents INTEGER DEFAULT 0,

  findings TEXT,
  actions_taken TEXT,
  parts_replaced TEXT,

  next_scheduled DATE,

  notes TEXT,

  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT valid_maintenance_type CHECK (maintenance_type IN (
    'preventive', 'corrective', 'calibration', 'inspection', 'cleaning', 'repair', 'upgrade'
  ))
);

-- ============================================
-- INDEXES
-- ============================================

-- Inventory Lots Indexes
CREATE INDEX IF NOT EXISTS idx_inventory_lots_item ON inventory_lots(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_lots_status ON inventory_lots(status);
CREATE INDEX IF NOT EXISTS idx_inventory_lots_expiration ON inventory_lots(expiration_date) WHERE expiration_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_lots_lot_number ON inventory_lots(lot_number);

-- Inventory Transactions Indexes
CREATE INDEX IF NOT EXISTS idx_inv_trans_tenant ON inventory_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inv_trans_item ON inventory_transactions(item_id);
CREATE INDEX IF NOT EXISTS idx_inv_trans_lot ON inventory_transactions(lot_id);
CREATE INDEX IF NOT EXISTS idx_inv_trans_type ON inventory_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_inv_trans_created ON inventory_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_trans_reference ON inventory_transactions(reference_type, reference_id);

-- Vendors Indexes
CREATE INDEX IF NOT EXISTS idx_vendors_tenant ON vendors(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vendors_active ON vendors(tenant_id, is_active) WHERE is_active = true;

-- Purchase Orders Indexes
CREATE INDEX IF NOT EXISTS idx_po_tenant ON purchase_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_po_vendor ON purchase_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_order_date ON purchase_orders(order_date DESC);
CREATE INDEX IF NOT EXISTS idx_po_number ON purchase_orders(po_number);

-- Purchase Order Items Indexes
CREATE INDEX IF NOT EXISTS idx_po_items_po ON purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS idx_po_items_item ON purchase_order_items(item_id);

-- Medication Samples Indexes
CREATE INDEX IF NOT EXISTS idx_samples_tenant ON medication_samples(tenant_id);
CREATE INDEX IF NOT EXISTS idx_samples_drug ON medication_samples(drug_name);
CREATE INDEX IF NOT EXISTS idx_samples_ndc ON medication_samples(ndc_code) WHERE ndc_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_samples_expiration ON medication_samples(expiration_date) WHERE expiration_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_samples_active ON medication_samples(tenant_id, is_active) WHERE is_active = true;

-- Sample Dispensing Indexes
CREATE INDEX IF NOT EXISTS idx_sample_dispense_tenant ON sample_dispensing_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sample_dispense_sample ON sample_dispensing_log(sample_id);
CREATE INDEX IF NOT EXISTS idx_sample_dispense_patient ON sample_dispensing_log(patient_id);
CREATE INDEX IF NOT EXISTS idx_sample_dispense_date ON sample_dispensing_log(dispensed_at DESC);

-- Equipment Indexes
CREATE INDEX IF NOT EXISTS idx_equipment_tenant ON equipment(tenant_id);
CREATE INDEX IF NOT EXISTS idx_equipment_category ON equipment(category);
CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment(status);
CREATE INDEX IF NOT EXISTS idx_equipment_next_maint ON equipment(next_maintenance) WHERE next_maintenance IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_equipment_serial ON equipment(serial_number) WHERE serial_number IS NOT NULL;

-- Equipment Maintenance Indexes
CREATE INDEX IF NOT EXISTS idx_equip_maint_equipment ON equipment_maintenance_log(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equip_maint_type ON equipment_maintenance_log(maintenance_type);
CREATE INDEX IF NOT EXISTS idx_equip_maint_date ON equipment_maintenance_log(performed_at DESC);

-- ============================================
-- INVENTORY CATEGORIES EXTENSION (add new categories)
-- ============================================

-- Update the existing constraint to include new categories
DO $$
BEGIN
  -- Drop the old constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'valid_category' AND table_name = 'inventory_items'
  ) THEN
    ALTER TABLE inventory_items DROP CONSTRAINT valid_category;
  END IF;

  -- Add the new constraint with expanded categories
  ALTER TABLE inventory_items ADD CONSTRAINT valid_category CHECK (
    category IN ('medication', 'supply', 'cosmetic', 'equipment', 'injectable', 'skincare_retail')
  );
END $$;

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to generate PO number
CREATE OR REPLACE FUNCTION generate_po_number(p_tenant_id VARCHAR(255))
RETURNS VARCHAR(50) AS $$
DECLARE
  v_count INTEGER;
  v_year VARCHAR(4);
BEGIN
  v_year := TO_CHAR(NOW(), 'YYYY');

  SELECT COUNT(*) + 1 INTO v_count
  FROM purchase_orders
  WHERE tenant_id = p_tenant_id
    AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());

  RETURN 'PO-' || v_year || '-' || LPAD(v_count::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- Function to get items at or below reorder point
CREATE OR REPLACE FUNCTION get_reorder_items(p_tenant_id VARCHAR(255))
RETURNS TABLE (
  id UUID,
  name VARCHAR(255),
  sku VARCHAR(100),
  category VARCHAR(50),
  quantity INTEGER,
  reorder_level INTEGER,
  reorder_quantity INTEGER,
  unit_cost_cents INTEGER,
  supplier VARCHAR(255)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.name,
    i.sku,
    i.category,
    i.quantity,
    i.reorder_level,
    i.reorder_quantity,
    i.unit_cost_cents,
    i.supplier
  FROM inventory_items i
  WHERE i.tenant_id = p_tenant_id
    AND i.quantity <= i.reorder_level
  ORDER BY i.quantity - i.reorder_level ASC;
END;
$$ LANGUAGE plpgsql;

-- Function to check lot expiration (returns lots expiring within N days)
CREATE OR REPLACE FUNCTION get_expiring_lots(p_tenant_id VARCHAR(255), p_days INTEGER DEFAULT 90)
RETURNS TABLE (
  lot_id UUID,
  item_id UUID,
  item_name VARCHAR(255),
  lot_number VARCHAR(100),
  expiration_date DATE,
  days_until_expiration INTEGER,
  quantity INTEGER,
  status VARCHAR(50)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.id as lot_id,
    l.item_id,
    i.name as item_name,
    l.lot_number,
    l.expiration_date,
    (l.expiration_date - CURRENT_DATE)::INTEGER as days_until_expiration,
    l.quantity,
    l.status
  FROM inventory_lots l
  JOIN inventory_items i ON l.item_id = i.id
  WHERE i.tenant_id = p_tenant_id
    AND l.expiration_date IS NOT NULL
    AND l.expiration_date <= CURRENT_DATE + (p_days || ' days')::INTERVAL
    AND l.status = 'active'
    AND l.quantity > 0
  ORDER BY l.expiration_date ASC;
END;
$$ LANGUAGE plpgsql;

-- Function to get equipment due for maintenance
CREATE OR REPLACE FUNCTION get_equipment_due_maintenance(p_tenant_id VARCHAR(255), p_days INTEGER DEFAULT 30)
RETURNS TABLE (
  id UUID,
  name VARCHAR(255),
  serial_number VARCHAR(100),
  category VARCHAR(100),
  last_maintenance DATE,
  next_maintenance DATE,
  days_until_due INTEGER,
  status VARCHAR(50)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.name,
    e.serial_number,
    e.category,
    e.last_maintenance,
    e.next_maintenance,
    (e.next_maintenance - CURRENT_DATE)::INTEGER as days_until_due,
    e.status
  FROM equipment e
  WHERE e.tenant_id = p_tenant_id
    AND e.next_maintenance IS NOT NULL
    AND e.next_maintenance <= CURRENT_DATE + (p_days || ' days')::INTERVAL
    AND e.status != 'retired'
  ORDER BY e.next_maintenance ASC;
END;
$$ LANGUAGE plpgsql;

-- Function to get inventory dashboard summary
CREATE OR REPLACE FUNCTION get_inventory_dashboard(p_tenant_id VARCHAR(255))
RETURNS TABLE (
  total_items BIGINT,
  total_value_cents BIGINT,
  low_stock_count BIGINT,
  expiring_count BIGINT,
  pending_orders BIGINT,
  equipment_maintenance_due BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM inventory_items WHERE tenant_id = p_tenant_id) as total_items,
    (SELECT COALESCE(SUM(quantity * unit_cost_cents), 0) FROM inventory_items WHERE tenant_id = p_tenant_id) as total_value_cents,
    (SELECT COUNT(*) FROM inventory_items WHERE tenant_id = p_tenant_id AND quantity <= reorder_level) as low_stock_count,
    (SELECT COUNT(*) FROM inventory_items WHERE tenant_id = p_tenant_id AND expiration_date IS NOT NULL AND expiration_date <= CURRENT_DATE + INTERVAL '90 days') as expiring_count,
    (SELECT COUNT(*) FROM purchase_orders WHERE tenant_id = p_tenant_id AND status IN ('submitted', 'partial')) as pending_orders,
    (SELECT COUNT(*) FROM equipment WHERE tenant_id = p_tenant_id AND next_maintenance IS NOT NULL AND next_maintenance <= CURRENT_DATE + INTERVAL '30 days' AND status != 'retired') as equipment_maintenance_due;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGERS
-- ============================================

-- Trigger to update lot status when expired
CREATE OR REPLACE FUNCTION update_expired_lots()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE inventory_lots
  SET status = 'expired', updated_at = NOW()
  WHERE status = 'active'
    AND expiration_date IS NOT NULL
    AND expiration_date < CURRENT_DATE;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_update_expired_lots ON inventory_lots;
CREATE TRIGGER trigger_update_expired_lots
  AFTER INSERT ON inventory_lots
  FOR EACH STATEMENT
  EXECUTE FUNCTION update_expired_lots();

-- Trigger to update equipment last_maintenance when maintenance is logged
CREATE OR REPLACE FUNCTION update_equipment_maintenance()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE equipment
  SET
    last_maintenance = NEW.performed_at::DATE,
    next_maintenance = COALESCE(NEW.next_scheduled, NEW.performed_at::DATE + maintenance_interval_days),
    updated_at = NOW()
  WHERE id = NEW.equipment_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_equipment_maintenance ON equipment_maintenance_log;
CREATE TRIGGER trigger_update_equipment_maintenance
  AFTER INSERT ON equipment_maintenance_log
  FOR EACH ROW
  EXECUTE FUNCTION update_equipment_maintenance();

-- Trigger to update PO totals
CREATE OR REPLACE FUNCTION update_po_totals()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE purchase_orders
  SET
    subtotal_cents = (
      SELECT COALESCE(SUM(quantity * unit_cost_cents), 0)
      FROM purchase_order_items
      WHERE po_id = COALESCE(NEW.po_id, OLD.po_id)
    ),
    total_amount_cents = subtotal_cents + tax_cents + shipping_cents,
    updated_at = NOW()
  WHERE id = COALESCE(NEW.po_id, OLD.po_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_po_totals ON purchase_order_items;
CREATE TRIGGER trigger_update_po_totals
  AFTER INSERT OR UPDATE OR DELETE ON purchase_order_items
  FOR EACH ROW
  EXECUTE FUNCTION update_po_totals();

-- Trigger to decrement sample quantity when dispensed
CREATE OR REPLACE FUNCTION decrement_sample_on_dispense()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE medication_samples
  SET
    quantity = quantity - NEW.quantity,
    updated_at = NOW()
  WHERE id = NEW.sample_id;

  -- Check for negative quantity
  IF (SELECT quantity FROM medication_samples WHERE id = NEW.sample_id) < 0 THEN
    RAISE EXCEPTION 'Insufficient sample quantity';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_decrement_sample ON sample_dispensing_log;
CREATE TRIGGER trigger_decrement_sample
  AFTER INSERT ON sample_dispensing_log
  FOR EACH ROW
  EXECUTE FUNCTION decrement_sample_on_dispense();

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE inventory_lots IS 'Batch/lot tracking for inventory items with expiration management';
COMMENT ON TABLE inventory_transactions IS 'Comprehensive audit trail of all inventory movements';
COMMENT ON TABLE vendors IS 'Supplier/vendor management for procurement';
COMMENT ON TABLE purchase_orders IS 'Purchase order management for inventory replenishment';
COMMENT ON TABLE purchase_order_items IS 'Line items for purchase orders';
COMMENT ON TABLE medication_samples IS 'Medication sample inventory from pharmaceutical representatives';
COMMENT ON TABLE sample_dispensing_log IS 'Log of medication samples dispensed to patients with consent tracking';
COMMENT ON TABLE equipment IS 'Medical equipment asset management';
COMMENT ON TABLE equipment_maintenance_log IS 'Equipment maintenance history and scheduling';

COMMENT ON COLUMN inventory_lots.status IS 'Lot status: active, expired, recalled, depleted, quarantine';
COMMENT ON COLUMN inventory_transactions.transaction_type IS 'Type of inventory movement';
COMMENT ON COLUMN purchase_orders.status IS 'PO workflow status: draft, pending_approval, approved, submitted, partial, received, cancelled';
COMMENT ON COLUMN equipment.status IS 'Equipment operational status';
COMMENT ON COLUMN equipment_maintenance_log.maintenance_type IS 'Type of maintenance performed';
