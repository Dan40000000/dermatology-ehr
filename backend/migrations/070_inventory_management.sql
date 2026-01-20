-- Migration: Inventory Management
-- Description: Inventory tracking and usage during appointments

-- INVENTORY ITEMS TABLE
CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Item details
  name VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL,
  -- Categories: medication, supply, cosmetic, equipment
  sku VARCHAR(100),
  description TEXT,

  -- Stock management
  quantity INTEGER NOT NULL DEFAULT 0,
  reorder_level INTEGER NOT NULL DEFAULT 0,
  unit_cost_cents INTEGER NOT NULL DEFAULT 0,
  -- Cost in cents

  -- Supplier information
  supplier VARCHAR(255),
  location VARCHAR(255),
  -- Storage location

  -- Expiration tracking
  expiration_date DATE,
  lot_number VARCHAR(100),

  -- Audit fields
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(255),

  CONSTRAINT valid_category CHECK (category IN ('medication', 'supply', 'cosmetic', 'equipment')),
  CONSTRAINT valid_quantity CHECK (quantity >= 0)
);

-- INVENTORY USAGE TABLE
CREATE TABLE IF NOT EXISTS inventory_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- References
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  encounter_id VARCHAR(255) REFERENCES encounters(id) ON DELETE SET NULL,
  appointment_id VARCHAR(255) REFERENCES appointments(id) ON DELETE SET NULL,
  patient_id VARCHAR(255) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  provider_id VARCHAR(255) NOT NULL,
  -- Reference to users table (providers)

  -- Usage details
  quantity_used INTEGER NOT NULL,
  unit_cost_cents INTEGER NOT NULL,
  -- Cost at time of use (for historical tracking)

  -- Metadata
  notes TEXT,
  used_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(255),

  CONSTRAINT valid_quantity_used CHECK (quantity_used > 0)
);

-- INVENTORY ADJUSTMENTS TABLE (for audit trail of manual adjustments)
CREATE TABLE IF NOT EXISTS inventory_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  adjustment_quantity INTEGER NOT NULL,
  -- Positive for additions, negative for removals
  reason VARCHAR(50) NOT NULL,
  -- Reasons: received, expired, damaged, adjustment, correction
  notes TEXT,

  -- Audit fields
  created_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(255) NOT NULL,

  CONSTRAINT valid_reason CHECK (reason IN ('received', 'expired', 'damaged', 'adjustment', 'correction', 'used'))
);

-- Indexes for performance
CREATE INDEX idx_inventory_items_tenant ON inventory_items(tenant_id);
CREATE INDEX idx_inventory_items_category ON inventory_items(category);
CREATE INDEX idx_inventory_items_sku ON inventory_items(sku);
CREATE INDEX idx_inventory_items_expiration ON inventory_items(expiration_date) WHERE expiration_date IS NOT NULL;
CREATE INDEX idx_inventory_items_low_stock ON inventory_items(tenant_id, quantity, reorder_level) WHERE quantity <= reorder_level;

CREATE INDEX idx_inventory_usage_tenant ON inventory_usage(tenant_id);
CREATE INDEX idx_inventory_usage_item ON inventory_usage(item_id);
CREATE INDEX idx_inventory_usage_encounter ON inventory_usage(encounter_id);
CREATE INDEX idx_inventory_usage_patient ON inventory_usage(patient_id);
CREATE INDEX idx_inventory_usage_provider ON inventory_usage(provider_id);
CREATE INDEX idx_inventory_usage_used_at ON inventory_usage(used_at DESC);

CREATE INDEX idx_inventory_adjustments_tenant ON inventory_adjustments(tenant_id);
CREATE INDEX idx_inventory_adjustments_item ON inventory_adjustments(item_id);
CREATE INDEX idx_inventory_adjustments_created ON inventory_adjustments(created_at DESC);

-- Comments
COMMENT ON TABLE inventory_items IS 'Inventory items tracked by the practice';
COMMENT ON TABLE inventory_usage IS 'Records of inventory items used during encounters/appointments';
COMMENT ON TABLE inventory_adjustments IS 'Audit trail of manual inventory adjustments';

COMMENT ON COLUMN inventory_items.category IS 'Item category: medication, supply, cosmetic, equipment';
COMMENT ON COLUMN inventory_items.unit_cost_cents IS 'Cost per unit in cents';
COMMENT ON COLUMN inventory_usage.unit_cost_cents IS 'Cost at time of use (for historical accuracy)';
COMMENT ON COLUMN inventory_adjustments.adjustment_quantity IS 'Positive for additions, negative for removals';

-- Function to automatically update inventory quantity when usage is recorded
CREATE OR REPLACE FUNCTION decrease_inventory_on_usage()
RETURNS TRIGGER AS $$
BEGIN
  -- Decrease inventory quantity
  UPDATE inventory_items
  SET
    quantity = quantity - NEW.quantity_used,
    updated_at = NOW()
  WHERE id = NEW.item_id AND tenant_id = NEW.tenant_id;

  -- Check if update was successful
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item not found';
  END IF;

  -- Verify we didn't go negative
  IF (SELECT quantity FROM inventory_items WHERE id = NEW.item_id) < 0 THEN
    RAISE EXCEPTION 'Insufficient inventory: only % units available',
      (SELECT quantity + NEW.quantity_used FROM inventory_items WHERE id = NEW.item_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically decrease inventory on usage
CREATE TRIGGER trigger_decrease_inventory
  AFTER INSERT ON inventory_usage
  FOR EACH ROW
  EXECUTE FUNCTION decrease_inventory_on_usage();

-- Function to update inventory quantity on adjustments
CREATE OR REPLACE FUNCTION adjust_inventory_quantity()
RETURNS TRIGGER AS $$
BEGIN
  -- Adjust inventory quantity
  UPDATE inventory_items
  SET
    quantity = quantity + NEW.adjustment_quantity,
    updated_at = NOW()
  WHERE id = NEW.item_id AND tenant_id = NEW.tenant_id;

  -- Check if update was successful
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item not found';
  END IF;

  -- Verify we didn't go negative
  IF (SELECT quantity FROM inventory_items WHERE id = NEW.item_id) < 0 THEN
    RAISE EXCEPTION 'Adjustment would result in negative inventory';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically adjust inventory on adjustments
CREATE TRIGGER trigger_adjust_inventory
  AFTER INSERT ON inventory_adjustments
  FOR EACH ROW
  EXECUTE FUNCTION adjust_inventory_quantity();

-- View for inventory items with usage statistics
CREATE OR REPLACE VIEW inventory_items_with_stats AS
SELECT
  i.*,
  COALESCE(SUM(u.quantity_used), 0) as total_used,
  COALESCE(COUNT(DISTINCT u.id), 0) as usage_count,
  COALESCE(SUM(u.quantity_used * u.unit_cost_cents), 0) as total_usage_cost_cents,
  MAX(u.used_at) as last_used_at,
  (i.quantity <= i.reorder_level) as needs_reorder,
  (i.expiration_date IS NOT NULL AND i.expiration_date <= CURRENT_DATE + INTERVAL '90 days') as expiring_soon
FROM inventory_items i
LEFT JOIN inventory_usage u ON i.id = u.item_id
GROUP BY i.id;

COMMENT ON VIEW inventory_items_with_stats IS 'Inventory items with usage statistics and alerts';

-- Function to get low stock items
CREATE OR REPLACE FUNCTION get_low_stock_items(p_tenant_id VARCHAR(255))
RETURNS TABLE (
  id UUID,
  name VARCHAR(255),
  category VARCHAR(50),
  quantity INTEGER,
  reorder_level INTEGER,
  unit_cost_cents INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.name,
    i.category,
    i.quantity,
    i.reorder_level,
    i.unit_cost_cents
  FROM inventory_items i
  WHERE i.tenant_id = p_tenant_id
    AND i.quantity <= i.reorder_level
  ORDER BY i.quantity ASC;
END;
$$ LANGUAGE plpgsql;

-- Function to get expiring items
CREATE OR REPLACE FUNCTION get_expiring_items(p_tenant_id VARCHAR(255), p_days_threshold INTEGER DEFAULT 90)
RETURNS TABLE (
  id UUID,
  name VARCHAR(255),
  category VARCHAR(50),
  expiration_date DATE,
  days_until_expiration INTEGER,
  quantity INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.name,
    i.category,
    i.expiration_date,
    (i.expiration_date - CURRENT_DATE)::INTEGER as days_until_expiration,
    i.quantity
  FROM inventory_items i
  WHERE i.tenant_id = p_tenant_id
    AND i.expiration_date IS NOT NULL
    AND i.expiration_date <= CURRENT_DATE + (p_days_threshold || ' days')::INTERVAL
  ORDER BY i.expiration_date ASC;
END;
$$ LANGUAGE plpgsql;
