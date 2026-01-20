-- Migration: Cosmetic Dermatology Fee Schedules
-- Description: Add comprehensive cosmetic procedure categories and pricing structures

-- Add category support to fee_schedule_items
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'fee_schedule_items'
        AND column_name = 'category'
    ) THEN
        ALTER TABLE fee_schedule_items ADD COLUMN category VARCHAR(100);
        ALTER TABLE fee_schedule_items ADD COLUMN subcategory VARCHAR(100);
        ALTER TABLE fee_schedule_items ADD COLUMN units VARCHAR(50);
        ALTER TABLE fee_schedule_items ADD COLUMN min_price_cents INTEGER;
        ALTER TABLE fee_schedule_items ADD COLUMN max_price_cents INTEGER;
        ALTER TABLE fee_schedule_items ADD COLUMN typical_units NUMERIC(10, 2);
        ALTER TABLE fee_schedule_items ADD COLUMN is_cosmetic BOOLEAN DEFAULT false;
        ALTER TABLE fee_schedule_items ADD COLUMN package_sessions INTEGER;
        ALTER TABLE fee_schedule_items ADD COLUMN notes TEXT;
    END IF;
END $$;

-- Create index for cosmetic procedures
CREATE INDEX IF NOT EXISTS idx_fee_schedule_items_category ON fee_schedule_items(category);
CREATE INDEX IF NOT EXISTS idx_fee_schedule_items_cosmetic ON fee_schedule_items(is_cosmetic) WHERE is_cosmetic = true;

-- Create cosmetic pricing view for easy querying
CREATE OR REPLACE VIEW v_cosmetic_pricing AS
SELECT
    fsi.id,
    fsi.fee_schedule_id,
    fs.name as schedule_name,
    fs.is_default,
    fsi.cpt_code,
    fsi.cpt_description,
    fsi.category,
    fsi.subcategory,
    fsi.units,
    fsi.fee_cents as base_fee_cents,
    fsi.min_price_cents,
    fsi.max_price_cents,
    fsi.typical_units,
    fsi.package_sessions,
    fsi.notes,
    fsi.created_at,
    fsi.updated_at
FROM fee_schedule_items fsi
JOIN fee_schedules fs ON fsi.fee_schedule_id = fs.id
WHERE fsi.is_cosmetic = true
ORDER BY fsi.category, fsi.subcategory, fsi.cpt_description;

COMMENT ON VIEW v_cosmetic_pricing IS 'View of all cosmetic procedures with pricing ranges and package information';

-- Function to get cosmetic fee schedule by category
CREATE OR REPLACE FUNCTION get_cosmetic_fees_by_category(
    p_tenant_id VARCHAR(255),
    p_category VARCHAR(100) DEFAULT NULL,
    p_fee_schedule_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    cpt_code VARCHAR(10),
    description TEXT,
    category VARCHAR(100),
    subcategory VARCHAR(100),
    units VARCHAR(50),
    base_fee_cents INTEGER,
    min_price_cents INTEGER,
    max_price_cents INTEGER,
    typical_units NUMERIC(10, 2),
    package_sessions INTEGER,
    notes TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        fsi.id,
        fsi.cpt_code,
        fsi.cpt_description,
        fsi.category,
        fsi.subcategory,
        fsi.units,
        fsi.fee_cents,
        fsi.min_price_cents,
        fsi.max_price_cents,
        fsi.typical_units,
        fsi.package_sessions,
        fsi.notes
    FROM fee_schedule_items fsi
    JOIN fee_schedules fs ON fsi.fee_schedule_id = fs.id
    WHERE fs.tenant_id = p_tenant_id
        AND fsi.is_cosmetic = true
        AND (p_category IS NULL OR fsi.category = p_category)
        AND (p_fee_schedule_id IS NULL OR fs.id = p_fee_schedule_id)
        AND (fs.is_default = true OR p_fee_schedule_id IS NOT NULL)
    ORDER BY fsi.category, fsi.subcategory, fsi.cpt_description;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_cosmetic_fees_by_category IS 'Retrieve cosmetic procedures by category with pricing information';

-- Create cosmetic procedure categories lookup table
CREATE TABLE IF NOT EXISTS cosmetic_procedure_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_name VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(200) NOT NULL,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert cosmetic categories
INSERT INTO cosmetic_procedure_categories (category_name, display_name, description, sort_order) VALUES
    ('neurotoxins', 'Neurotoxins (Botox/Dysport/Xeomin)', 'Injectable neuromodulators for wrinkle reduction and muscle relaxation', 1),
    ('dermal_fillers', 'Dermal Fillers', 'Hyaluronic acid and other injectable fillers for volume restoration', 2),
    ('body_contouring', 'Body Contouring', 'Non-surgical fat reduction and body sculpting procedures', 3),
    ('laser_hair_removal', 'Laser Hair Removal', 'Permanent hair reduction treatments', 4),
    ('laser_skin', 'Laser Skin Treatments', 'Laser resurfacing, rejuvenation, and pigmentation treatments', 5),
    ('chemical_peels', 'Chemical Peels', 'Chemical exfoliation treatments for skin rejuvenation', 6),
    ('microneedling', 'Microneedling & RF Treatments', 'Collagen induction and radiofrequency skin tightening', 7),
    ('other_cosmetic', 'Other Cosmetic Services', 'Additional aesthetic treatments and services', 8)
ON CONFLICT (category_name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    updated_at = CURRENT_TIMESTAMP;

-- Create index for category lookup
CREATE INDEX IF NOT EXISTS idx_cosmetic_categories_active ON cosmetic_procedure_categories(is_active, sort_order);

-- Add comments
COMMENT ON TABLE cosmetic_procedure_categories IS 'Lookup table for cosmetic procedure categories used in fee schedules';
COMMENT ON COLUMN fee_schedule_items.category IS 'Primary category for grouping procedures (e.g., neurotoxins, dermal_fillers)';
COMMENT ON COLUMN fee_schedule_items.subcategory IS 'Secondary category for more specific grouping (e.g., lips, cheeks)';
COMMENT ON COLUMN fee_schedule_items.units IS 'Unit type for procedure (e.g., per unit, per syringe, per session, per area)';
COMMENT ON COLUMN fee_schedule_items.min_price_cents IS 'Minimum price in cents for price range display';
COMMENT ON COLUMN fee_schedule_items.max_price_cents IS 'Maximum price in cents for price range display';
COMMENT ON COLUMN fee_schedule_items.typical_units IS 'Typical number of units/syringes used for the procedure';
COMMENT ON COLUMN fee_schedule_items.is_cosmetic IS 'Flag indicating if this is a cosmetic/aesthetic procedure';
COMMENT ON COLUMN fee_schedule_items.package_sessions IS 'Number of sessions included if this is a package deal';
