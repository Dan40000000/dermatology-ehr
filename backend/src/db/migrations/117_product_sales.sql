-- Migration: Product Sales / Retail Integration
-- Description: Tables for product catalog, sales, and recommendations

-- PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Product identification
  sku VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Categorization
  category VARCHAR(50) NOT NULL,
  -- Categories: skincare, sunscreen, cosmetic, prescription, post_procedure
  brand VARCHAR(255),

  -- Pricing (in cents)
  price INTEGER NOT NULL DEFAULT 0,
  cost INTEGER NOT NULL DEFAULT 0,

  -- Inventory
  inventory_count INTEGER NOT NULL DEFAULT 0,
  reorder_point INTEGER NOT NULL DEFAULT 10,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Metadata
  image_url TEXT,
  barcode VARCHAR(100),

  -- Audit fields
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(255),

  CONSTRAINT valid_product_category CHECK (category IN ('skincare', 'sunscreen', 'cosmetic', 'prescription', 'post_procedure')),
  CONSTRAINT valid_product_price CHECK (price >= 0),
  CONSTRAINT valid_product_cost CHECK (cost >= 0),
  CONSTRAINT valid_product_inventory CHECK (inventory_count >= 0),
  UNIQUE(tenant_id, sku)
);

-- PRODUCT SALES TABLE
CREATE TABLE IF NOT EXISTS product_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- References
  patient_id VARCHAR(255) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  encounter_id VARCHAR(255) REFERENCES encounters(id) ON DELETE SET NULL,
  sold_by VARCHAR(255) NOT NULL,

  -- Sale details
  sale_date TIMESTAMP NOT NULL DEFAULT NOW(),
  subtotal INTEGER NOT NULL DEFAULT 0,
  tax INTEGER NOT NULL DEFAULT 0,
  discount INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,

  -- Payment
  payment_method VARCHAR(50) NOT NULL DEFAULT 'credit',
  payment_reference VARCHAR(255),

  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'completed',

  -- Audit fields
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT valid_sale_payment_method CHECK (payment_method IN ('cash', 'credit', 'debit', 'check', 'insurance', 'gift_card')),
  CONSTRAINT valid_sale_status CHECK (status IN ('pending', 'completed', 'refunded', 'cancelled')),
  CONSTRAINT valid_sale_amounts CHECK (subtotal >= 0 AND tax >= 0 AND discount >= 0 AND total >= 0)
);

-- PRODUCT SALE ITEMS TABLE
CREATE TABLE IF NOT EXISTS product_sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES product_sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,

  -- Item details
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price INTEGER NOT NULL DEFAULT 0,
  discount_amount INTEGER NOT NULL DEFAULT 0,
  line_total INTEGER NOT NULL DEFAULT 0,

  -- Snapshot of product info at time of sale
  product_name VARCHAR(255) NOT NULL,
  product_sku VARCHAR(100) NOT NULL,

  -- Audit fields
  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT valid_item_quantity CHECK (quantity > 0),
  CONSTRAINT valid_item_amounts CHECK (unit_price >= 0 AND discount_amount >= 0 AND line_total >= 0)
);

-- PRODUCT RECOMMENDATIONS TABLE
CREATE TABLE IF NOT EXISTS product_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Condition/diagnosis code (ICD-10)
  condition_code VARCHAR(20) NOT NULL,
  condition_description TEXT,

  -- Recommended products (array of product IDs)
  product_ids UUID[] NOT NULL DEFAULT '{}',

  -- Recommendation details
  recommendation_text TEXT,
  priority INTEGER NOT NULL DEFAULT 0,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Audit fields
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(255),

  UNIQUE(tenant_id, condition_code)
);

-- INVENTORY TRANSACTIONS TABLE (for product sales)
CREATE TABLE IF NOT EXISTS product_inventory_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,

  -- Transaction details
  transaction_type VARCHAR(50) NOT NULL,
  quantity INTEGER NOT NULL,
  reference_id UUID,
  notes TEXT,

  -- Audit fields
  created_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(255),

  CONSTRAINT valid_transaction_type CHECK (transaction_type IN ('received', 'sold', 'adjustment', 'return', 'damaged', 'expired'))
);

-- Indexes for performance
CREATE INDEX idx_products_tenant ON products(tenant_id);
CREATE INDEX idx_products_sku ON products(tenant_id, sku);
CREATE INDEX idx_products_category ON products(tenant_id, category);
CREATE INDEX idx_products_active ON products(tenant_id) WHERE is_active = true;
CREATE INDEX idx_products_low_stock ON products(tenant_id, inventory_count, reorder_point) WHERE inventory_count <= reorder_point;

CREATE INDEX idx_product_sales_tenant ON product_sales(tenant_id);
CREATE INDEX idx_product_sales_patient ON product_sales(patient_id);
CREATE INDEX idx_product_sales_encounter ON product_sales(encounter_id);
CREATE INDEX idx_product_sales_date ON product_sales(tenant_id, sale_date DESC);
CREATE INDEX idx_product_sales_status ON product_sales(tenant_id, status);

CREATE INDEX idx_product_sale_items_sale ON product_sale_items(sale_id);
CREATE INDEX idx_product_sale_items_product ON product_sale_items(product_id);

CREATE INDEX idx_product_recommendations_tenant ON product_recommendations(tenant_id);
CREATE INDEX idx_product_recommendations_condition ON product_recommendations(tenant_id, condition_code);

CREATE INDEX idx_product_inventory_transactions_product ON product_inventory_transactions(product_id);
CREATE INDEX idx_product_inventory_transactions_tenant ON product_inventory_transactions(tenant_id);
CREATE INDEX idx_product_inventory_transactions_date ON product_inventory_transactions(created_at DESC);

-- Comments
COMMENT ON TABLE products IS 'Retail products available for sale in the dermatology practice';
COMMENT ON TABLE product_sales IS 'Sales transactions for retail products';
COMMENT ON TABLE product_sale_items IS 'Individual line items within a product sale';
COMMENT ON TABLE product_recommendations IS 'Product recommendations based on diagnosis/condition codes';
COMMENT ON TABLE product_inventory_transactions IS 'Audit trail of inventory changes for products';

COMMENT ON COLUMN products.category IS 'Product category: skincare, sunscreen, cosmetic, prescription, post_procedure';
COMMENT ON COLUMN products.price IS 'Retail price in cents';
COMMENT ON COLUMN products.cost IS 'Product cost in cents';
COMMENT ON COLUMN product_sales.subtotal IS 'Subtotal before tax and discount in cents';
COMMENT ON COLUMN product_sales.total IS 'Final total in cents';
COMMENT ON COLUMN product_recommendations.product_ids IS 'Array of product UUIDs recommended for this condition';

-- Function to automatically update inventory when a sale item is inserted
CREATE OR REPLACE FUNCTION decrease_product_inventory_on_sale()
RETURNS TRIGGER AS $$
BEGIN
  -- Decrease inventory
  UPDATE products
  SET
    inventory_count = inventory_count - NEW.quantity,
    updated_at = NOW()
  WHERE id = NEW.product_id;

  -- Check if update was successful
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  -- Verify we didn't go negative
  IF (SELECT inventory_count FROM products WHERE id = NEW.product_id) < 0 THEN
    RAISE EXCEPTION 'Insufficient inventory: not enough units available';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to decrease inventory on sale
CREATE TRIGGER trigger_decrease_product_inventory
  AFTER INSERT ON product_sale_items
  FOR EACH ROW
  EXECUTE FUNCTION decrease_product_inventory_on_sale();

-- Function to log inventory transactions
CREATE OR REPLACE FUNCTION log_product_inventory_transaction()
RETURNS TRIGGER AS $$
DECLARE
  v_tenant_id VARCHAR(255);
  v_sale_id UUID;
BEGIN
  -- Get tenant_id from the sale
  SELECT ps.tenant_id, ps.id INTO v_tenant_id, v_sale_id
  FROM product_sales ps
  WHERE ps.id = NEW.sale_id;

  -- Insert inventory transaction record
  INSERT INTO product_inventory_transactions (
    tenant_id,
    product_id,
    transaction_type,
    quantity,
    reference_id,
    notes,
    created_at
  ) VALUES (
    v_tenant_id,
    NEW.product_id,
    'sold',
    -NEW.quantity,
    v_sale_id,
    'Sold to patient',
    NOW()
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to log inventory transaction on sale
CREATE TRIGGER trigger_log_product_inventory_on_sale
  AFTER INSERT ON product_sale_items
  FOR EACH ROW
  EXECUTE FUNCTION log_product_inventory_transaction();

-- View for products with low stock
CREATE OR REPLACE VIEW products_low_stock AS
SELECT
  p.*,
  (p.reorder_point - p.inventory_count) as units_needed
FROM products p
WHERE p.inventory_count <= p.reorder_point
  AND p.is_active = true
ORDER BY p.inventory_count ASC;

COMMENT ON VIEW products_low_stock IS 'Products that need to be reordered';

-- View for sales summary
CREATE OR REPLACE VIEW product_sales_summary AS
SELECT
  ps.tenant_id,
  DATE(ps.sale_date) as sale_date,
  COUNT(DISTINCT ps.id) as total_sales,
  SUM(ps.total) as total_revenue,
  SUM(ps.discount) as total_discounts,
  SUM(ps.tax) as total_tax,
  COUNT(DISTINCT ps.patient_id) as unique_customers
FROM product_sales ps
WHERE ps.status = 'completed'
GROUP BY ps.tenant_id, DATE(ps.sale_date)
ORDER BY DATE(ps.sale_date) DESC;

COMMENT ON VIEW product_sales_summary IS 'Daily summary of product sales';

-- Seed some sample products for dermatology practices
INSERT INTO products (tenant_id, sku, name, description, category, brand, price, cost, inventory_count, reorder_point, is_active)
SELECT
  'tenant-demo',
  sku,
  name,
  description,
  category,
  brand,
  price,
  cost,
  inventory_count,
  reorder_point,
  true
FROM (VALUES
  -- Prescription skincare
  ('RX-TRET-025', 'Tretinoin 0.025% Cream', 'Prescription retinoid for acne and anti-aging', 'prescription', 'Generic', 4500, 2000, 25, 10),
  ('RX-TRET-050', 'Tretinoin 0.05% Cream', 'Prescription retinoid for acne and anti-aging', 'prescription', 'Generic', 4800, 2200, 20, 10),
  ('RX-HQ-4', 'Hydroquinone 4% Cream', 'Prescription skin lightening agent', 'prescription', 'Generic', 5500, 2500, 15, 8),

  -- OTC Skincare - Cleansers
  ('SK-CLN-GEL', 'Gentle Foaming Cleanser', 'Daily gentle foaming cleanser for all skin types', 'skincare', 'CeraVe', 1599, 800, 40, 15),
  ('SK-CLN-OIL', 'Oil-Free Cleanser', 'Oil-free cleanser for oily and acne-prone skin', 'skincare', 'Neutrogena', 1299, 650, 35, 12),
  ('SK-CLN-HYD', 'Hydrating Cleanser', 'Creamy hydrating cleanser for dry skin', 'skincare', 'CeraVe', 1699, 850, 30, 12),

  -- OTC Skincare - Moisturizers
  ('SK-MOIST-DAY', 'Daily Moisturizing Lotion', 'Lightweight daily moisturizer with SPF', 'skincare', 'CeraVe', 1899, 950, 45, 15),
  ('SK-MOIST-PM', 'PM Facial Moisturizing Lotion', 'Night moisturizer with niacinamide', 'skincare', 'CeraVe', 1799, 900, 38, 15),
  ('SK-MOIST-RICH', 'Rich Hydrating Cream', 'Intensive moisturizer for very dry skin', 'skincare', 'La Roche-Posay', 2499, 1250, 25, 10),

  -- OTC Skincare - Serums
  ('SK-SER-HA', 'Hyaluronic Acid Serum', 'Hydrating serum with hyaluronic acid', 'skincare', 'The Ordinary', 899, 450, 50, 20),
  ('SK-SER-NIA', 'Niacinamide 10% Serum', 'Pore-minimizing serum with niacinamide', 'skincare', 'The Ordinary', 799, 400, 45, 18),

  -- Sunscreens
  ('SUN-SPF50-FACE', 'Anthelios SPF 50 Face', 'Ultra-light facial sunscreen SPF 50', 'sunscreen', 'La Roche-Posay', 3599, 1800, 30, 12),
  ('SUN-SPF30-TINT', 'Tinted Sunscreen SPF 30', 'Tinted mineral sunscreen', 'sunscreen', 'EltaMD', 3899, 1950, 25, 10),
  ('SUN-SPF50-BODY', 'Body Sunscreen SPF 50', 'Water-resistant body sunscreen', 'sunscreen', 'Neutrogena', 1499, 750, 40, 15),
  ('SUN-SPF70-SPORT', 'Sport Sunscreen SPF 70', 'High-protection sport sunscreen', 'sunscreen', 'Coppertone', 1299, 650, 35, 15),

  -- Cosmeceuticals
  ('COS-VITC-SER', 'Vitamin C 15% Serum', 'Brightening antioxidant serum', 'cosmetic', 'SkinCeuticals', 16600, 8300, 15, 8),
  ('COS-RET-SER', 'Retinol 0.5% Serum', 'Anti-aging retinol treatment', 'cosmetic', 'Paula''s Choice', 4200, 2100, 20, 10),
  ('COS-GLYC-PEEL', 'Glycolic Acid 10% Peel', 'At-home glycolic acid treatment', 'cosmetic', 'The Ordinary', 999, 500, 30, 12),
  ('COS-AZE-SER', 'Azelaic Acid 10% Serum', 'Brightening treatment for rosacea', 'cosmetic', 'The Ordinary', 899, 450, 28, 12),

  -- Post-procedure
  ('POST-AQUA', 'Aquaphor Healing Ointment', 'Post-procedure healing ointment', 'post_procedure', 'Aquaphor', 1299, 650, 50, 20),
  ('POST-WOUND', 'Wound Healing Gel', 'Silicone-based wound healing gel', 'post_procedure', 'ScarAway', 2499, 1250, 25, 10),
  ('POST-COOL', 'Cooling Aloe Gel', 'Soothing aloe vera gel post-procedure', 'post_procedure', 'Fruit of the Earth', 699, 350, 40, 15),
  ('POST-COVERS', 'Hydrocolloid Bandages', 'Wound cover bandages pack of 10', 'post_procedure', 'Band-Aid', 999, 500, 35, 15),
  ('POST-SPF-STICK', 'SPF Stick for Scars', 'Targeted SPF protection for healing skin', 'post_procedure', 'La Roche-Posay', 1999, 1000, 20, 8)
) AS t(sku, name, description, category, brand, price, cost, inventory_count, reorder_point)
WHERE NOT EXISTS (SELECT 1 FROM products WHERE tenant_id = 'tenant-demo' AND sku = t.sku);

-- Seed product recommendations for common dermatology conditions
INSERT INTO product_recommendations (tenant_id, condition_code, condition_description, product_ids, recommendation_text, priority, is_active)
SELECT
  'tenant-demo',
  condition_code,
  condition_description,
  ARRAY(SELECT id FROM products WHERE tenant_id = 'tenant-demo' AND sku = ANY(product_skus)),
  recommendation_text,
  priority,
  true
FROM (VALUES
  ('L70.0', 'Acne vulgaris', ARRAY['SK-CLN-OIL', 'SK-SER-NIA', 'RX-TRET-025'], 'For acne-prone skin, we recommend oil-free cleansing and niacinamide. Prescription tretinoin may help with stubborn acne.', 1),
  ('L81.1', 'Chloasma (Melasma)', ARRAY['RX-HQ-4', 'COS-VITC-SER', 'SUN-SPF50-FACE'], 'For melasma, hydroquinone and vitamin C can help with pigmentation. Daily high SPF is essential.', 1),
  ('L30.9', 'Dermatitis, unspecified', ARRAY['SK-CLN-HYD', 'SK-MOIST-RICH', 'POST-AQUA'], 'For dermatitis, gentle hydrating products help restore the skin barrier.', 1),
  ('L57.0', 'Actinic keratosis', ARRAY['SUN-SPF50-FACE', 'POST-AQUA', 'POST-WOUND'], 'After treatment for actinic keratosis, wound care and sun protection are critical.', 1),
  ('L82.1', 'Seborrheic keratosis', ARRAY['POST-AQUA', 'POST-COVERS', 'SUN-SPF50-FACE'], 'After seborrheic keratosis removal, proper wound care supports healing.', 2),
  ('L90.5', 'Scar conditions', ARRAY['POST-WOUND', 'POST-SPF-STICK', 'COS-RET-SER'], 'For scar management, silicone gel and retinol can improve appearance over time.', 1),
  ('L71.9', 'Rosacea', ARRAY['SK-CLN-GEL', 'COS-AZE-SER', 'SUN-SPF30-TINT'], 'For rosacea, gentle cleansing, azelaic acid, and mineral sunscreen help manage symptoms.', 1),
  ('L40.0', 'Psoriasis vulgaris', ARRAY['SK-MOIST-RICH', 'POST-AQUA', 'SK-CLN-HYD'], 'For psoriasis, intensive moisturization helps manage dry, scaly patches.', 2)
) AS t(condition_code, condition_description, product_skus, recommendation_text, priority)
WHERE NOT EXISTS (SELECT 1 FROM product_recommendations WHERE tenant_id = 'tenant-demo' AND condition_code = t.condition_code);
