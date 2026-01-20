-- Migration: Procedure Inventory Templates
-- Description: Templates for automatic inventory deduction based on procedures

-- PROCEDURE INVENTORY TEMPLATES TABLE
CREATE TABLE IF NOT EXISTS procedure_inventory_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Procedure identification
  procedure_name VARCHAR(255) NOT NULL,
  procedure_code VARCHAR(50), -- CPT code if applicable
  category VARCHAR(100) NOT NULL, -- biopsy, injection, cryotherapy, laser, etc.

  -- Metadata
  description TEXT,
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(255),

  CONSTRAINT unique_proc_template UNIQUE(tenant_id, procedure_name)
);

-- TEMPLATE ITEMS (many-to-many between templates and inventory items)
CREATE TABLE IF NOT EXISTS procedure_inventory_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  template_id UUID NOT NULL REFERENCES procedure_inventory_templates(id) ON DELETE CASCADE,
  item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,

  -- Item specifications (for when item_id is null, match by SKU or name pattern)
  item_sku VARCHAR(100),
  item_name_pattern VARCHAR(255),

  -- Quantity specifications
  default_quantity INTEGER NOT NULL DEFAULT 1,
  quantity_unit VARCHAR(50), -- units, mL, vials, etc.

  -- Optional/Required
  is_optional BOOLEAN DEFAULT false,

  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT template_item_ref CHECK (item_id IS NOT NULL OR item_sku IS NOT NULL OR item_name_pattern IS NOT NULL)
);

-- Indexes
CREATE INDEX idx_proc_inv_templates_tenant ON procedure_inventory_templates(tenant_id);
CREATE INDEX idx_proc_inv_templates_category ON procedure_inventory_templates(category);
CREATE INDEX idx_proc_inv_templates_code ON procedure_inventory_templates(procedure_code);

CREATE INDEX idx_proc_inv_template_items_tenant ON procedure_inventory_template_items(tenant_id);
CREATE INDEX idx_proc_inv_template_items_template ON procedure_inventory_template_items(template_id);
CREATE INDEX idx_proc_inv_template_items_item ON procedure_inventory_template_items(item_id);
CREATE INDEX idx_proc_inv_template_items_sku ON procedure_inventory_template_items(item_sku);

-- Comments
COMMENT ON TABLE procedure_inventory_templates IS 'Templates for automatic inventory deduction based on common procedures';
COMMENT ON TABLE procedure_inventory_template_items IS 'Items included in each procedure template';

-- Function to get inventory items for a procedure
CREATE OR REPLACE FUNCTION get_procedure_inventory_items(
  p_tenant_id VARCHAR(255),
  p_procedure_name VARCHAR(255)
)
RETURNS TABLE (
  item_id UUID,
  item_name VARCHAR(255),
  item_sku VARCHAR(100),
  default_quantity INTEGER,
  current_stock INTEGER,
  is_optional BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id as item_id,
    i.name as item_name,
    i.sku as item_sku,
    ti.default_quantity,
    i.quantity as current_stock,
    ti.is_optional
  FROM procedure_inventory_template_items ti
  JOIN procedure_inventory_templates t ON ti.template_id = t.id
  LEFT JOIN inventory_items i ON ti.item_id = i.id OR ti.item_sku = i.sku
  WHERE t.tenant_id = p_tenant_id
    AND t.procedure_name = p_procedure_name
    AND t.is_active = true
    AND i.id IS NOT NULL
  ORDER BY ti.is_optional ASC, i.name ASC;
END;
$$ LANGUAGE plpgsql;

-- Seed common dermatology procedure templates
DO $$
DECLARE
  v_tenant_id VARCHAR(255);
  v_admin_id VARCHAR(255);
  v_template_id UUID;
  v_item_id UUID;
BEGIN
  -- Get the first tenant (demo tenant)
  SELECT id INTO v_tenant_id FROM tenants LIMIT 1;
  SELECT id INTO v_admin_id FROM users WHERE tenant_id = v_tenant_id AND role = 'admin' LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE NOTICE 'No tenant found, skipping procedure template seed';
    RETURN;
  END IF;

  -- ====================================
  -- SHAVE BIOPSY TEMPLATES
  -- ====================================

  INSERT INTO procedure_inventory_templates (tenant_id, procedure_name, procedure_code, category, description, created_by)
  VALUES (v_tenant_id, 'Shave Biopsy', '11300', 'biopsy', 'Standard shave biopsy supplies', v_admin_id)
  RETURNING id INTO v_template_id;

  -- Add template items
  INSERT INTO procedure_inventory_template_items (tenant_id, template_id, item_sku, default_quantity)
  SELECT v_tenant_id, v_template_id, 'SCAL-15', 1 WHERE EXISTS (SELECT 1 FROM inventory_items WHERE sku = 'SCAL-15' AND tenant_id = v_tenant_id);

  INSERT INTO procedure_inventory_template_items (tenant_id, template_id, item_sku, default_quantity)
  SELECT v_tenant_id, v_template_id, 'LIDO-1-EPI', 3 WHERE EXISTS (SELECT 1 FROM inventory_items WHERE sku = 'LIDO-1-EPI' AND tenant_id = v_tenant_id);

  INSERT INTO procedure_inventory_template_items (tenant_id, template_id, item_sku, default_quantity)
  SELECT v_tenant_id, v_template_id, 'ALCL-35', 1 WHERE EXISTS (SELECT 1 FROM inventory_items WHERE sku = 'ALCL-35' AND tenant_id = v_tenant_id);

  INSERT INTO procedure_inventory_template_items (tenant_id, template_id, item_sku, default_quantity)
  SELECT v_tenant_id, v_template_id, 'SPEC-CONT', 1 WHERE EXISTS (SELECT 1 FROM inventory_items WHERE sku = 'SPEC-CONT' AND tenant_id = v_tenant_id);

  INSERT INTO procedure_inventory_template_items (tenant_id, template_id, item_sku, default_quantity)
  SELECT v_tenant_id, v_template_id, 'GAUZE-2X2', 4 WHERE EXISTS (SELECT 1 FROM inventory_items WHERE sku = 'GAUZE-2X2' AND tenant_id = v_tenant_id);

  -- ====================================
  -- PUNCH BIOPSY TEMPLATES
  -- ====================================

  INSERT INTO procedure_inventory_templates (tenant_id, procedure_name, procedure_code, category, description, created_by)
  VALUES (v_tenant_id, 'Punch Biopsy 4mm', '11104', 'biopsy', '4mm punch biopsy with suture', v_admin_id)
  RETURNING id INTO v_template_id;

  INSERT INTO procedure_inventory_template_items (tenant_id, template_id, item_sku, default_quantity)
  SELECT v_tenant_id, v_template_id, 'PB-4MM', 1 WHERE EXISTS (SELECT 1 FROM inventory_items WHERE sku = 'PB-4MM' AND tenant_id = v_tenant_id);

  INSERT INTO procedure_inventory_template_items (tenant_id, template_id, item_sku, default_quantity)
  SELECT v_tenant_id, v_template_id, 'LIDO-1-EPI', 2 WHERE EXISTS (SELECT 1 FROM inventory_items WHERE sku = 'LIDO-1-EPI' AND tenant_id = v_tenant_id);

  INSERT INTO procedure_inventory_template_items (tenant_id, template_id, item_sku, default_quantity)
  SELECT v_tenant_id, v_template_id, 'SUT-4-0-NYL', 1 WHERE EXISTS (SELECT 1 FROM inventory_items WHERE sku = 'SUT-4-0-NYL' AND tenant_id = v_tenant_id);

  INSERT INTO procedure_inventory_template_items (tenant_id, template_id, item_sku, default_quantity)
  SELECT v_tenant_id, v_template_id, 'SPEC-CONT', 1 WHERE EXISTS (SELECT 1 FROM inventory_items WHERE sku = 'SPEC-CONT' AND tenant_id = v_tenant_id);

  INSERT INTO procedure_inventory_template_items (tenant_id, template_id, item_sku, default_quantity)
  SELECT v_tenant_id, v_template_id, 'GAUZE-2X2', 4 WHERE EXISTS (SELECT 1 FROM inventory_items WHERE sku = 'GAUZE-2X2' AND tenant_id = v_tenant_id);

  -- ====================================
  -- CRYOTHERAPY TEMPLATES
  -- ====================================

  INSERT INTO procedure_inventory_templates (tenant_id, procedure_name, procedure_code, category, description, created_by)
  VALUES (v_tenant_id, 'Cryotherapy Single Lesion', '17000', 'cryotherapy', 'Liquid nitrogen cryotherapy - single lesion', v_admin_id)
  RETURNING id INTO v_template_id;

  INSERT INTO procedure_inventory_template_items (tenant_id, template_id, item_sku, default_quantity)
  SELECT v_tenant_id, v_template_id, 'LN2-LITER', 1 WHERE EXISTS (SELECT 1 FROM inventory_items WHERE sku = 'LN2-LITER' AND tenant_id = v_tenant_id);

  INSERT INTO procedure_inventory_template_items (tenant_id, template_id, item_sku, default_quantity)
  SELECT v_tenant_id, v_template_id, 'CRYO-TIP-S', 1 WHERE EXISTS (SELECT 1 FROM inventory_items WHERE sku = 'CRYO-TIP-S' AND tenant_id = v_tenant_id);

  -- Multiple lesions
  INSERT INTO procedure_inventory_templates (tenant_id, procedure_name, procedure_code, category, description, created_by)
  VALUES (v_tenant_id, 'Cryotherapy Multiple Lesions', '17003', 'cryotherapy', 'Liquid nitrogen cryotherapy - 2-14 lesions', v_admin_id)
  RETURNING id INTO v_template_id;

  INSERT INTO procedure_inventory_template_items (tenant_id, template_id, item_sku, default_quantity)
  SELECT v_tenant_id, v_template_id, 'LN2-LITER', 2 WHERE EXISTS (SELECT 1 FROM inventory_items WHERE sku = 'LN2-LITER' AND tenant_id = v_tenant_id);

  INSERT INTO procedure_inventory_template_items (tenant_id, template_id, item_sku, default_quantity)
  SELECT v_tenant_id, v_template_id, 'CRYO-TIP-M', 2 WHERE EXISTS (SELECT 1 FROM inventory_items WHERE sku = 'CRYO-TIP-M' AND tenant_id = v_tenant_id);

  -- ====================================
  -- INTRALESIONAL INJECTION TEMPLATES
  -- ====================================

  INSERT INTO procedure_inventory_templates (tenant_id, procedure_name, procedure_code, category, description, created_by)
  VALUES (v_tenant_id, 'Intralesional Steroid Injection', '11900', 'injection', 'Triamcinolone intralesional injection', v_admin_id)
  RETURNING id INTO v_template_id;

  INSERT INTO procedure_inventory_template_items (tenant_id, template_id, item_sku, default_quantity)
  SELECT v_tenant_id, v_template_id, 'TRIAM-10', 1 WHERE EXISTS (SELECT 1 FROM inventory_items WHERE sku = 'TRIAM-10' AND tenant_id = v_tenant_id);

  INSERT INTO procedure_inventory_template_items (tenant_id, template_id, item_sku, default_quantity)
  SELECT v_tenant_id, v_template_id, 'SYR-3ML-25G', 1 WHERE EXISTS (SELECT 1 FROM inventory_items WHERE sku = 'SYR-3ML-25G' AND tenant_id = v_tenant_id);

  INSERT INTO procedure_inventory_template_items (tenant_id, template_id, item_sku, default_quantity)
  SELECT v_tenant_id, v_template_id, 'ALC-PREP', 1 WHERE EXISTS (SELECT 1 FROM inventory_items WHERE sku = 'ALC-PREP' AND tenant_id = v_tenant_id);

  -- ====================================
  -- BOTOX INJECTION TEMPLATES
  -- ====================================

  INSERT INTO procedure_inventory_templates (tenant_id, procedure_name, procedure_code, category, description, created_by)
  VALUES (v_tenant_id, 'Botox - Glabella (20 units)', '64612', 'cosmetic_injection', 'Botox injection for glabellar lines - typical 20 units', v_admin_id)
  RETURNING id INTO v_template_id;

  INSERT INTO procedure_inventory_template_items (tenant_id, template_id, item_sku, default_quantity)
  SELECT v_tenant_id, v_template_id, 'BOTOX-100', 20 WHERE EXISTS (SELECT 1 FROM inventory_items WHERE sku = 'BOTOX-100' AND tenant_id = v_tenant_id);

  INSERT INTO procedure_inventory_template_items (tenant_id, template_id, item_sku, default_quantity)
  SELECT v_tenant_id, v_template_id, 'NDL-30G-05', 5 WHERE EXISTS (SELECT 1 FROM inventory_items WHERE sku = 'NDL-30G-05' AND tenant_id = v_tenant_id);

  INSERT INTO procedure_inventory_template_items (tenant_id, template_id, item_sku, default_quantity)
  SELECT v_tenant_id, v_template_id, 'SYR-1ML-27G', 1 WHERE EXISTS (SELECT 1 FROM inventory_items WHERE sku = 'SYR-1ML-27G' AND tenant_id = v_tenant_id);

  INSERT INTO procedure_inventory_template_items (tenant_id, template_id, item_sku, default_quantity)
  SELECT v_tenant_id, v_template_id, 'ALC-PREP', 3 WHERE EXISTS (SELECT 1 FROM inventory_items WHERE sku = 'ALC-PREP' AND tenant_id = v_tenant_id);

  -- Full face botox
  INSERT INTO procedure_inventory_templates (tenant_id, procedure_name, procedure_code, category, description, created_by)
  VALUES (v_tenant_id, 'Botox - Full Face (50 units)', '64612', 'cosmetic_injection', 'Botox injection for full face - typical 50 units', v_admin_id)
  RETURNING id INTO v_template_id;

  INSERT INTO procedure_inventory_template_items (tenant_id, template_id, item_sku, default_quantity)
  SELECT v_tenant_id, v_template_id, 'BOTOX-100', 50 WHERE EXISTS (SELECT 1 FROM inventory_items WHERE sku = 'BOTOX-100' AND tenant_id = v_tenant_id);

  INSERT INTO procedure_inventory_template_items (tenant_id, template_id, item_sku, default_quantity)
  SELECT v_tenant_id, v_template_id, 'NDL-30G-05', 10 WHERE EXISTS (SELECT 1 FROM inventory_items WHERE sku = 'NDL-30G-05' AND tenant_id = v_tenant_id);

  INSERT INTO procedure_inventory_template_items (tenant_id, template_id, item_sku, default_quantity)
  SELECT v_tenant_id, v_template_id, 'SYR-1ML-27G', 2 WHERE EXISTS (SELECT 1 FROM inventory_items WHERE sku = 'SYR-1ML-27G' AND tenant_id = v_tenant_id);

  -- ====================================
  -- FILLER INJECTION TEMPLATES
  -- ====================================

  INSERT INTO procedure_inventory_templates (tenant_id, procedure_name, procedure_code, category, description, created_by)
  VALUES (v_tenant_id, 'Dermal Filler - 1 Syringe', '15777', 'cosmetic_injection', 'Dermal filler injection - 1 syringe', v_admin_id)
  RETURNING id INTO v_template_id;

  INSERT INTO procedure_inventory_template_items (tenant_id, template_id, item_sku, default_quantity, is_optional)
  SELECT v_tenant_id, v_template_id, 'JUV-UXCL', 1, false WHERE EXISTS (SELECT 1 FROM inventory_items WHERE sku = 'JUV-UXCL' AND tenant_id = v_tenant_id);

  INSERT INTO procedure_inventory_template_items (tenant_id, template_id, item_sku, default_quantity)
  SELECT v_tenant_id, v_template_id, 'NDL-27G-05', 2 WHERE EXISTS (SELECT 1 FROM inventory_items WHERE sku = 'NDL-27G-05' AND tenant_id = v_tenant_id);

  INSERT INTO procedure_inventory_template_items (tenant_id, template_id, item_sku, default_quantity)
  SELECT v_tenant_id, v_template_id, 'ALC-PREP', 2 WHERE EXISTS (SELECT 1 FROM inventory_items WHERE sku = 'ALC-PREP' AND tenant_id = v_tenant_id);

  INSERT INTO procedure_inventory_template_items (tenant_id, template_id, item_sku, default_quantity)
  SELECT v_tenant_id, v_template_id, 'GAUZE-2X2', 2 WHERE EXISTS (SELECT 1 FROM inventory_items WHERE sku = 'GAUZE-2X2' AND tenant_id = v_tenant_id);

  RAISE NOTICE 'Successfully seeded % procedure templates', (SELECT COUNT(*) FROM procedure_inventory_templates WHERE tenant_id = v_tenant_id);

END $$;
