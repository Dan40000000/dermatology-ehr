-- Contact Dermatitis Patch Testing Module
-- Comprehensive patch testing system for contact dermatitis diagnosis
-- Migration 109

-- Create allergen_database table - comprehensive allergen reference
CREATE TABLE IF NOT EXISTS allergen_database (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  concentration TEXT NOT NULL,
  vehicle TEXT NOT NULL, -- petrolatum, water, alcohol, etc.
  category TEXT NOT NULL, -- fragrance, preservative, metal, rubber, adhesive, cosmetic, etc.
  cas_number TEXT, -- Chemical Abstracts Service number
  synonyms TEXT[], -- Alternative names
  cross_reactors TEXT[] DEFAULT '{}', -- Related allergens that may cross-react
  common_sources TEXT[] DEFAULT '{}', -- Products/materials containing this allergen
  avoidance_instructions TEXT, -- Patient instructions for avoiding allergen
  is_standard BOOLEAN DEFAULT false, -- Part of standard screening panels
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create patch_test_panels table - predefined allergen groupings
CREATE TABLE IF NOT EXISTS patch_test_panels (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  allergens JSONB NOT NULL DEFAULT '[]', -- Array of allergen objects with id, name, position
  is_standard BOOLEAN DEFAULT false, -- Standard panel (T.R.U.E., NA Standard, etc.)
  panel_type TEXT, -- 'true_test', 'na_standard', 'cosmetic', 'metal', 'rubber', 'custom'
  allergen_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create patch_test_sessions table - individual testing sessions
CREATE TABLE IF NOT EXISTS patch_test_sessions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id TEXT NOT NULL,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  encounter_id TEXT REFERENCES encounters(id) ON DELETE SET NULL,
  panel_ids TEXT[] NOT NULL DEFAULT '{}', -- Multiple panels can be used

  -- Session dates
  application_date TIMESTAMPTZ NOT NULL,
  read_48hr_date TIMESTAMPTZ, -- Expected: application_date + 48 hours
  read_96hr_date TIMESTAMPTZ, -- Expected: application_date + 96 hours
  actual_48hr_read_date TIMESTAMPTZ,
  actual_96hr_read_date TIMESTAMPTZ,

  -- Session status
  status TEXT NOT NULL DEFAULT 'applied' CHECK (status IN (
    'scheduled', 'applied', 'awaiting_48hr', 'read_48hr', 'awaiting_96hr',
    'read_96hr', 'completed', 'cancelled', 'no_show'
  )),

  -- Clinical information
  indication TEXT, -- Reason for testing
  relevant_history TEXT, -- Prior reactions, exposures
  current_medications TEXT[],
  skin_condition_notes TEXT,

  -- Provider information
  applying_provider_id TEXT,
  reading_provider_id TEXT,

  -- Session notes
  application_notes TEXT,
  general_notes TEXT,

  -- Metadata
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create patch_test_results table - individual allergen results
CREATE TABLE IF NOT EXISTS patch_test_results (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id TEXT NOT NULL,
  session_id TEXT NOT NULL REFERENCES patch_test_sessions(id) ON DELETE CASCADE,
  allergen_id TEXT REFERENCES allergen_database(id) ON DELETE SET NULL,
  allergen_name TEXT NOT NULL, -- Denormalized for historical record
  position_number INTEGER NOT NULL, -- Position on test grid

  -- 48-hour reading
  reading_48hr TEXT CHECK (reading_48hr IN (
    'not_read', 'negative', 'irritant', 'doubtful', 'weak_positive',
    'strong_positive', 'extreme_positive'
  )) DEFAULT 'not_read',
  reading_48hr_notes TEXT,
  reading_48hr_by TEXT,
  reading_48hr_at TIMESTAMPTZ,

  -- 96-hour reading
  reading_96hr TEXT CHECK (reading_96hr IN (
    'not_read', 'negative', 'irritant', 'doubtful', 'weak_positive',
    'strong_positive', 'extreme_positive'
  )) DEFAULT 'not_read',
  reading_96hr_notes TEXT,
  reading_96hr_by TEXT,
  reading_96hr_at TIMESTAMPTZ,

  -- Interpretation
  interpretation TEXT CHECK (interpretation IN (
    'pending', 'not_relevant', 'past_relevance', 'current_relevance', 'unknown_relevance'
  )) DEFAULT 'pending',
  relevance_notes TEXT,

  -- Additional observations
  morphology_notes TEXT, -- Describe reaction appearance
  photo_ids TEXT[], -- Links to clinical photos

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create patch_test_reports table - generated reports with recommendations
CREATE TABLE IF NOT EXISTS patch_test_reports (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id TEXT NOT NULL,
  session_id TEXT NOT NULL REFERENCES patch_test_sessions(id) ON DELETE CASCADE,

  -- Report generation
  report_generated_at TIMESTAMPTZ DEFAULT NOW(),
  generated_by TEXT,

  -- Results summary
  positive_allergens JSONB DEFAULT '[]', -- Array of positive allergen objects
  negative_allergens JSONB DEFAULT '[]',
  irritant_reactions JSONB DEFAULT '[]',

  -- Recommendations
  recommendations TEXT,
  avoidance_list JSONB DEFAULT '[]', -- Structured avoidance recommendations
  safe_alternatives JSONB DEFAULT '[]', -- Safe product alternatives

  -- Report content
  clinical_summary TEXT,
  patient_education_notes TEXT,
  follow_up_recommendations TEXT,

  -- Document storage
  pdf_url TEXT,
  pdf_generated_at TIMESTAMPTZ,

  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'finalized', 'sent_to_patient')),
  finalized_at TIMESTAMPTZ,
  finalized_by TEXT,
  sent_to_patient_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_allergen_database_tenant ON allergen_database(tenant_id);
CREATE INDEX IF NOT EXISTS idx_allergen_database_category ON allergen_database(category);
CREATE INDEX IF NOT EXISTS idx_allergen_database_name ON allergen_database(name);
CREATE INDEX IF NOT EXISTS idx_allergen_database_is_standard ON allergen_database(is_standard);

CREATE INDEX IF NOT EXISTS idx_patch_test_panels_tenant ON patch_test_panels(tenant_id);
CREATE INDEX IF NOT EXISTS idx_patch_test_panels_type ON patch_test_panels(panel_type);
CREATE INDEX IF NOT EXISTS idx_patch_test_panels_is_standard ON patch_test_panels(is_standard);

CREATE INDEX IF NOT EXISTS idx_patch_test_sessions_tenant ON patch_test_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_patch_test_sessions_patient ON patch_test_sessions(patient_id);
CREATE INDEX IF NOT EXISTS idx_patch_test_sessions_encounter ON patch_test_sessions(encounter_id);
CREATE INDEX IF NOT EXISTS idx_patch_test_sessions_status ON patch_test_sessions(status);
CREATE INDEX IF NOT EXISTS idx_patch_test_sessions_application_date ON patch_test_sessions(application_date);
CREATE INDEX IF NOT EXISTS idx_patch_test_sessions_read_dates ON patch_test_sessions(read_48hr_date, read_96hr_date);

CREATE INDEX IF NOT EXISTS idx_patch_test_results_session ON patch_test_results(session_id);
CREATE INDEX IF NOT EXISTS idx_patch_test_results_allergen ON patch_test_results(allergen_id);
CREATE INDEX IF NOT EXISTS idx_patch_test_results_readings ON patch_test_results(reading_48hr, reading_96hr);

CREATE INDEX IF NOT EXISTS idx_patch_test_reports_session ON patch_test_reports(session_id);
CREATE INDEX IF NOT EXISTS idx_patch_test_reports_status ON patch_test_reports(status);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_patch_test_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_allergen_database_updated_at
  BEFORE UPDATE ON allergen_database
  FOR EACH ROW EXECUTE FUNCTION update_patch_test_updated_at();

CREATE TRIGGER trigger_patch_test_panels_updated_at
  BEFORE UPDATE ON patch_test_panels
  FOR EACH ROW EXECUTE FUNCTION update_patch_test_updated_at();

CREATE TRIGGER trigger_patch_test_sessions_updated_at
  BEFORE UPDATE ON patch_test_sessions
  FOR EACH ROW EXECUTE FUNCTION update_patch_test_updated_at();

CREATE TRIGGER trigger_patch_test_results_updated_at
  BEFORE UPDATE ON patch_test_results
  FOR EACH ROW EXECUTE FUNCTION update_patch_test_updated_at();

CREATE TRIGGER trigger_patch_test_reports_updated_at
  BEFORE UPDATE ON patch_test_reports
  FOR EACH ROW EXECUTE FUNCTION update_patch_test_updated_at();

-- Seed standard allergen data (T.R.U.E. Test 36 allergens)
INSERT INTO allergen_database (id, tenant_id, name, concentration, vehicle, category, cross_reactors, common_sources, avoidance_instructions, is_standard) VALUES
-- Metals
('allergen-nickel', 'system', 'Nickel sulfate', '2.5%', 'petrolatum', 'metal',
  ARRAY['cobalt', 'palladium'],
  ARRAY['jewelry', 'belt buckles', 'zippers', 'coins', 'keys', 'eyeglass frames', 'cell phones', 'laptops'],
  'Avoid nickel-containing jewelry and metal objects. Use nickel-free alternatives. Coat metal surfaces with clear nail polish. Look for "nickel-free" labels.', true),

('allergen-cobalt', 'system', 'Cobalt chloride', '1%', 'petrolatum', 'metal',
  ARRAY['nickel', 'chromium'],
  ARRAY['jewelry', 'metal alloys', 'hair dyes', 'vitamin B12 supplements', 'cement', 'pottery glazes'],
  'Avoid cobalt-containing metals and products. Check ingredient lists for cobalt compounds. Use alternative vitamin sources.', true),

('allergen-chromium', 'system', 'Potassium dichromate', '0.5%', 'petrolatum', 'metal',
  ARRAY['cobalt', 'nickel'],
  ARRAY['cement', 'leather goods', 'matches', 'anticorrosives', 'paints', 'tattoo pigments'],
  'Avoid leather products, cement contact, and chromium-containing materials. Wear protective gloves when handling.', true),

('allergen-gold', 'system', 'Gold sodium thiosulfate', '0.5%', 'petrolatum', 'metal',
  ARRAY[]::TEXT[],
  ARRAY['jewelry', 'dental work', 'electronics'],
  'Avoid gold jewelry and dental restorations. Consider alternative metals like platinum or titanium.', true),

-- Fragrances
('allergen-fragrance-mix', 'system', 'Fragrance mix I', '8%', 'petrolatum', 'fragrance',
  ARRAY['balsam of peru', 'cinnamic aldehyde', 'eugenol'],
  ARRAY['perfumes', 'cosmetics', 'soaps', 'detergents', 'shampoos', 'lotions', 'air fresheners'],
  'Use fragrance-free products. Look for "unscented" or "fragrance-free" labels. Avoid essential oils and natural fragrances.', true),

('allergen-fragrance-mix-ii', 'system', 'Fragrance mix II', '14%', 'petrolatum', 'fragrance',
  ARRAY['fragrance mix I', 'balsam of peru'],
  ARRAY['perfumes', 'cosmetics', 'household products', 'candles', 'air fresheners'],
  'Use fragrance-free products exclusively. Check all personal care and household products for fragrances.', true),

('allergen-balsam-peru', 'system', 'Balsam of Peru', '25%', 'petrolatum', 'fragrance',
  ARRAY['fragrance mix', 'cinnamon', 'vanilla', 'benzoin'],
  ARRAY['cosmetics', 'perfumes', 'flavored foods', 'cough medicine', 'dental products', 'topical medications'],
  'Avoid products containing balsam of Peru, peru balsam, or myroxylon pereirae. Also avoid cinnamon, vanilla, and cloves in foods and products.', true),

('allergen-cinnamic-aldehyde', 'system', 'Cinnamic aldehyde', '1%', 'petrolatum', 'fragrance',
  ARRAY['balsam of peru', 'fragrance mix'],
  ARRAY['cinnamon flavoring', 'toothpaste', 'mouthwash', 'candies', 'cosmetics', 'perfumes'],
  'Avoid cinnamon-flavored products. Check toothpaste, gum, and candies for cinnamon. Use unflavored oral care products.', true),

-- Preservatives
('allergen-formaldehyde', 'system', 'Formaldehyde', '1%', 'water', 'preservative',
  ARRAY['quaternium-15', 'imidazolidinyl urea', 'diazolidinyl urea', 'DMDM hydantoin'],
  ARRAY['cosmetics', 'shampoos', 'nail polish', 'fabric finishes', 'paper products', 'building materials'],
  'Avoid formaldehyde and formaldehyde-releasing preservatives. Look for formaldehyde-free labels. Check building materials and fabrics.', true),

('allergen-quaternium-15', 'system', 'Quaternium-15', '1%', 'petrolatum', 'preservative',
  ARRAY['formaldehyde', 'imidazolidinyl urea'],
  ARRAY['cosmetics', 'shampoos', 'lotions', 'cleaning products'],
  'Avoid products containing quaternium-15. Check cosmetics and personal care products for this preservative.', true),

('allergen-methylisothiazolinone', 'system', 'Methylisothiazolinone (MI)', '0.2%', 'water', 'preservative',
  ARRAY['methylchloroisothiazolinone'],
  ARRAY['cosmetics', 'wet wipes', 'shampoos', 'household cleaners', 'paints', 'industrial coolants'],
  'Avoid MI and related isothiazolinones. Check all cosmetics, wipes, and household products. Common in "natural" products.', true),

('allergen-mci-mi', 'system', 'MCI/MI (Kathon CG)', '0.01%', 'water', 'preservative',
  ARRAY['methylisothiazolinone'],
  ARRAY['cosmetics', 'shampoos', 'soaps', 'household cleaners', 'industrial products'],
  'Avoid products containing Kathon CG, MCI/MI, or isothiazolinones. Very common preservative system.', true),

('allergen-paraben-mix', 'system', 'Paraben mix', '16%', 'petrolatum', 'preservative',
  ARRAY[]::TEXT[],
  ARRAY['cosmetics', 'lotions', 'shampoos', 'medications', 'foods'],
  'Avoid products containing parabens (methylparaben, propylparaben, butylparaben). Look for paraben-free labels.', true),

-- Rubber and adhesives
('allergen-thiuram-mix', 'system', 'Thiuram mix', '1%', 'petrolatum', 'rubber',
  ARRAY['carba mix', 'mercapto mix'],
  ARRAY['rubber gloves', 'elastic bands', 'rubber handles', 'adhesives', 'fungicides'],
  'Use vinyl or nitrile gloves instead of rubber. Avoid rubber-containing products. Check elastic waistbands and bands.', true),

('allergen-carba-mix', 'system', 'Carba mix', '3%', 'petrolatum', 'rubber',
  ARRAY['thiuram mix', 'mercapto mix'],
  ARRAY['rubber gloves', 'rubber bands', 'rubber shoes', 'wetsuit materials'],
  'Avoid rubber products. Use synthetic alternatives. Check footwear and sporting equipment.', true),

('allergen-mercapto-mix', 'system', 'Mercapto mix', '2%', 'petrolatum', 'rubber',
  ARRAY['thiuram mix', 'carba mix'],
  ARRAY['rubber gloves', 'rubber shoes', 'elastic materials', 'adhesives'],
  'Avoid rubber products containing mercaptobenzothiazole compounds. Use vinyl or nitrile alternatives.', true),

('allergen-black-rubber-mix', 'system', 'Black rubber mix', '0.6%', 'petrolatum', 'rubber',
  ARRAY[]::TEXT[],
  ARRAY['black rubber products', 'tires', 'shoe soles', 'rubber mats', 'handles'],
  'Avoid black rubber products. Choose products made with synthetic materials or colored rubber alternatives.', true),

('allergen-colophony', 'system', 'Colophony (Rosin)', '20%', 'petrolatum', 'adhesive',
  ARRAY['balsam of peru'],
  ARRAY['adhesive bandages', 'tape', 'cosmetics', 'varnishes', 'soldering flux', 'sports grip aids'],
  'Avoid rosin-containing adhesives and products. Use hypoallergenic medical tapes. Check cosmetics and polishes.', true),

('allergen-epoxy-resin', 'system', 'Epoxy resin', '1%', 'petrolatum', 'adhesive',
  ARRAY[]::TEXT[],
  ARRAY['adhesives', 'coatings', 'electronics', 'dental materials', 'boat building'],
  'Wear protective gloves when handling epoxy. Ensure proper ventilation. Use alternative adhesive systems when possible.', true),

-- Topical medications
('allergen-neomycin', 'system', 'Neomycin sulfate', '20%', 'petrolatum', 'medication',
  ARRAY['bacitracin', 'gentamicin'],
  ARRAY['antibiotic ointments', 'ear drops', 'eye drops', 'first aid creams'],
  'Avoid neomycin-containing products. Use alternative antibiotics. Check OTC first aid products.', true),

('allergen-bacitracin', 'system', 'Bacitracin', '20%', 'petrolatum', 'medication',
  ARRAY['neomycin'],
  ARRAY['antibiotic ointments', 'first aid products', 'triple antibiotic cream'],
  'Avoid bacitracin-containing products. Use alternative wound care products. Consider mupirocin as alternative.', true),

('allergen-benzocaine', 'system', 'Benzocaine', '5%', 'petrolatum', 'medication',
  ARRAY['procaine', 'tetracaine'],
  ARRAY['topical anesthetics', 'sunburn products', 'hemorrhoid creams', 'oral pain relievers'],
  'Avoid benzocaine and related -caine anesthetics. Use lidocaine alternatives (different chemical class).', true),

('allergen-corticosteroid-mix', 'system', 'Corticosteroid mix', '1%', 'petrolatum', 'medication',
  ARRAY[]::TEXT[],
  ARRAY['topical steroids', 'anti-itch creams', 'eczema treatments'],
  'May need to avoid certain topical steroids. Consult with physician for safe steroid alternatives.', true),

-- Cosmetic ingredients
('allergen-lanolin', 'system', 'Lanolin (Wool alcohols)', '30%', 'petrolatum', 'cosmetic',
  ARRAY[]::TEXT[],
  ARRAY['moisturizers', 'lip balms', 'cosmetics', 'nipple creams', 'leather conditioners'],
  'Avoid lanolin and wool alcohol-containing products. Look for lanolin-free alternatives.', true),

('allergen-propylene-glycol', 'system', 'Propylene glycol', '10%', 'water', 'cosmetic',
  ARRAY[]::TEXT[],
  ARRAY['moisturizers', 'medications', 'cosmetics', 'foods', 'antifreeze'],
  'Avoid products containing propylene glycol. Check medications and cosmetics. Common in many products.', true),

('allergen-cocamidopropyl-betaine', 'system', 'Cocamidopropyl betaine', '1%', 'water', 'cosmetic',
  ARRAY[]::TEXT[],
  ARRAY['shampoos', 'body washes', 'facial cleansers', 'bubble baths'],
  'Avoid sulfate-free and gentle cleansers containing this ingredient. Check "natural" and baby products.', true),

('allergen-ppd', 'system', 'p-Phenylenediamine (PPD)', '1%', 'petrolatum', 'dye',
  ARRAY['textile dyes', 'rubber chemicals'],
  ARRAY['permanent hair dyes', 'henna tattoos', 'black rubber', 'printer ink', 'photographic developer'],
  'Avoid permanent hair dyes containing PPD. Use PPD-free or semi-permanent dyes. Avoid black henna tattoos.', true),

('allergen-disperse-blue', 'system', 'Disperse Blue 106/124', '1%', 'petrolatum', 'dye',
  ARRAY['textile dyes'],
  ARRAY['synthetic fabrics', 'polyester clothing', 'spandex', 'nylon'],
  'Avoid dark-colored synthetic fabrics. Choose natural fibers or light-colored synthetics. Wash new clothing before wearing.', true),

-- Additional common allergens
('allergen-ethylenediamine', 'system', 'Ethylenediamine dihydrochloride', '1%', 'petrolatum', 'preservative',
  ARRAY['aminophylline'],
  ARRAY['medications', 'antifreeze', 'fungicides', 'some rubber products'],
  'Avoid products containing ethylenediamine. Check medications especially aminophylline preparations.', true),

('allergen-dmdm-hydantoin', 'system', 'DMDM Hydantoin', '1%', 'water', 'preservative',
  ARRAY['formaldehyde', 'quaternium-15'],
  ARRAY['shampoos', 'conditioners', 'cosmetics', 'baby products'],
  'Avoid DMDM hydantoin as it releases formaldehyde. Check hair care and cosmetic products.', true),

('allergen-iodopropynyl', 'system', 'Iodopropynyl butylcarbamate', '0.1%', 'petrolatum', 'preservative',
  ARRAY[]::TEXT[],
  ARRAY['cosmetics', 'sunscreens', 'wet wipes', 'paints'],
  'Avoid products containing IPBC. Check cosmetics and sunscreens for this preservative.', true),

('allergen-textile-resin', 'system', 'Textile resin mix', '6.6%', 'petrolatum', 'textile',
  ARRAY['formaldehyde'],
  ARRAY['permanent press fabrics', 'wrinkle-free clothing', 'bed linens'],
  'Wash new clothing multiple times before wearing. Avoid permanent press and wrinkle-free fabrics. Choose untreated natural fibers.', true)

ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  concentration = EXCLUDED.concentration,
  cross_reactors = EXCLUDED.cross_reactors,
  common_sources = EXCLUDED.common_sources,
  avoidance_instructions = EXCLUDED.avoidance_instructions,
  updated_at = NOW();

-- Seed standard panels
INSERT INTO patch_test_panels (id, tenant_id, name, description, panel_type, is_standard, allergen_count, allergens) VALUES
('panel-true-test', 'system', 'T.R.U.E. Test', 'Standard 36-allergen screening panel for contact dermatitis', 'true_test', true, 36,
  '[
    {"position": 1, "allergen_id": "allergen-nickel", "name": "Nickel sulfate"},
    {"position": 2, "allergen_id": "allergen-lanolin", "name": "Lanolin"},
    {"position": 3, "allergen_id": "allergen-neomycin", "name": "Neomycin sulfate"},
    {"position": 4, "allergen_id": "allergen-chromium", "name": "Potassium dichromate"},
    {"position": 5, "allergen_id": "allergen-benzocaine", "name": "Benzocaine"},
    {"position": 6, "allergen_id": "allergen-fragrance-mix", "name": "Fragrance mix I"},
    {"position": 7, "allergen_id": "allergen-colophony", "name": "Colophony"},
    {"position": 8, "allergen_id": "allergen-paraben-mix", "name": "Paraben mix"},
    {"position": 9, "allergen_id": "allergen-balsam-peru", "name": "Balsam of Peru"},
    {"position": 10, "allergen_id": "allergen-ethylenediamine", "name": "Ethylenediamine"},
    {"position": 11, "allergen_id": "allergen-cobalt", "name": "Cobalt chloride"},
    {"position": 12, "allergen_id": "allergen-mci-mi", "name": "MCI/MI"},
    {"position": 13, "allergen_id": "allergen-epoxy-resin", "name": "Epoxy resin"},
    {"position": 14, "allergen_id": "allergen-quaternium-15", "name": "Quaternium-15"},
    {"position": 15, "allergen_id": "allergen-ppd", "name": "p-Phenylenediamine"},
    {"position": 16, "allergen_id": "allergen-formaldehyde", "name": "Formaldehyde"},
    {"position": 17, "allergen_id": "allergen-mercapto-mix", "name": "Mercapto mix"},
    {"position": 18, "allergen_id": "allergen-thiuram-mix", "name": "Thiuram mix"},
    {"position": 19, "allergen_id": "allergen-dmdm-hydantoin", "name": "DMDM Hydantoin"},
    {"position": 20, "allergen_id": "allergen-carba-mix", "name": "Carba mix"}
  ]'::JSONB),

('panel-metal-series', 'system', 'Metal Series', 'Comprehensive metal allergen panel', 'metal', true, 8,
  '[
    {"position": 1, "allergen_id": "allergen-nickel", "name": "Nickel sulfate"},
    {"position": 2, "allergen_id": "allergen-cobalt", "name": "Cobalt chloride"},
    {"position": 3, "allergen_id": "allergen-chromium", "name": "Potassium dichromate"},
    {"position": 4, "allergen_id": "allergen-gold", "name": "Gold sodium thiosulfate"}
  ]'::JSONB),

('panel-cosmetic-series', 'system', 'Cosmetic Series', 'Fragrances, preservatives, and cosmetic ingredients', 'cosmetic', true, 15,
  '[
    {"position": 1, "allergen_id": "allergen-fragrance-mix", "name": "Fragrance mix I"},
    {"position": 2, "allergen_id": "allergen-fragrance-mix-ii", "name": "Fragrance mix II"},
    {"position": 3, "allergen_id": "allergen-balsam-peru", "name": "Balsam of Peru"},
    {"position": 4, "allergen_id": "allergen-cinnamic-aldehyde", "name": "Cinnamic aldehyde"},
    {"position": 5, "allergen_id": "allergen-lanolin", "name": "Lanolin"},
    {"position": 6, "allergen_id": "allergen-propylene-glycol", "name": "Propylene glycol"},
    {"position": 7, "allergen_id": "allergen-cocamidopropyl-betaine", "name": "Cocamidopropyl betaine"},
    {"position": 8, "allergen_id": "allergen-paraben-mix", "name": "Paraben mix"},
    {"position": 9, "allergen_id": "allergen-formaldehyde", "name": "Formaldehyde"},
    {"position": 10, "allergen_id": "allergen-quaternium-15", "name": "Quaternium-15"},
    {"position": 11, "allergen_id": "allergen-methylisothiazolinone", "name": "Methylisothiazolinone"},
    {"position": 12, "allergen_id": "allergen-mci-mi", "name": "MCI/MI"}
  ]'::JSONB),

('panel-rubber-adhesive', 'system', 'Rubber/Adhesive Series', 'Rubber chemicals and adhesives', 'rubber', true, 8,
  '[
    {"position": 1, "allergen_id": "allergen-thiuram-mix", "name": "Thiuram mix"},
    {"position": 2, "allergen_id": "allergen-carba-mix", "name": "Carba mix"},
    {"position": 3, "allergen_id": "allergen-mercapto-mix", "name": "Mercapto mix"},
    {"position": 4, "allergen_id": "allergen-black-rubber-mix", "name": "Black rubber mix"},
    {"position": 5, "allergen_id": "allergen-colophony", "name": "Colophony"},
    {"position": 6, "allergen_id": "allergen-epoxy-resin", "name": "Epoxy resin"}
  ]'::JSONB),

('panel-preservative-series', 'system', 'Preservative Series', 'Common preservatives in cosmetics and products', 'preservative', true, 10,
  '[
    {"position": 1, "allergen_id": "allergen-formaldehyde", "name": "Formaldehyde"},
    {"position": 2, "allergen_id": "allergen-quaternium-15", "name": "Quaternium-15"},
    {"position": 3, "allergen_id": "allergen-methylisothiazolinone", "name": "Methylisothiazolinone"},
    {"position": 4, "allergen_id": "allergen-mci-mi", "name": "MCI/MI"},
    {"position": 5, "allergen_id": "allergen-paraben-mix", "name": "Paraben mix"},
    {"position": 6, "allergen_id": "allergen-dmdm-hydantoin", "name": "DMDM Hydantoin"},
    {"position": 7, "allergen_id": "allergen-iodopropynyl", "name": "Iodopropynyl butylcarbamate"}
  ]'::JSONB)

ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  allergens = EXCLUDED.allergens,
  allergen_count = EXCLUDED.allergen_count,
  updated_at = NOW();

-- Comments for documentation
COMMENT ON TABLE allergen_database IS 'Comprehensive database of contact allergens with cross-reactivity and avoidance information';
COMMENT ON TABLE patch_test_panels IS 'Predefined allergen panels for patch testing (T.R.U.E. Test, series panels, custom)';
COMMENT ON TABLE patch_test_sessions IS 'Individual patch testing sessions tracking application and reading dates';
COMMENT ON TABLE patch_test_results IS 'Individual allergen results with 48hr and 96hr readings';
COMMENT ON TABLE patch_test_reports IS 'Generated reports with positive findings and avoidance recommendations';

COMMENT ON COLUMN patch_test_results.reading_48hr IS 'ICDRG reading scale: negative (-), irritant (IR), doubtful (?+), weak (+), strong (++), extreme (+++)';
COMMENT ON COLUMN patch_test_results.interpretation IS 'Clinical relevance assessment of positive reactions';
