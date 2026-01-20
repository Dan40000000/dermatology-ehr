-- Migration: Seed Dermatology Inventory Items
-- Description: Comprehensive dermatology office inventory with all categories

-- Get the demo tenant ID for seeding
DO $$
DECLARE
  v_tenant_id VARCHAR(255);
  v_admin_id VARCHAR(255);
BEGIN
  -- Get the first tenant (demo tenant)
  SELECT id INTO v_tenant_id FROM tenants LIMIT 1;

  -- Get an admin user for created_by
  SELECT id INTO v_admin_id FROM users WHERE tenant_id = v_tenant_id AND role = 'admin' LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE NOTICE 'No tenant found, skipping inventory seed';
    RETURN;
  END IF;

  -- Clear existing inventory items for clean seed
  DELETE FROM inventory_items WHERE tenant_id = v_tenant_id;

  -- ====================================
  -- INJECTABLE PRODUCTS
  -- ====================================

  -- Botulinum Toxins
  INSERT INTO inventory_items (tenant_id, name, category, sku, description, quantity, reorder_level, unit_cost_cents, supplier, location, expiration_date, lot_number, created_by) VALUES
  (v_tenant_id, 'Botox 100 Units', 'cosmetic', 'BOTOX-100', 'Botulinum Toxin Type A - 100 unit vial', 15, 5, 42500, 'Allergan', 'Cosmetic Fridge', CURRENT_DATE + INTERVAL '6 months', 'C123456', v_admin_id),
  (v_tenant_id, 'Dysport 300 Units', 'cosmetic', 'DYSP-300', 'AbobotulinumtoxinA - 300 unit vial', 10, 4, 38000, 'Galderma', 'Cosmetic Fridge', CURRENT_DATE + INTERVAL '5 months', 'D789012', v_admin_id),
  (v_tenant_id, 'Xeomin 100 Units', 'cosmetic', 'XEO-100', 'IncobotulinumtoxinA - 100 unit vial', 8, 3, 39500, 'Merz', 'Cosmetic Fridge', CURRENT_DATE + INTERVAL '7 months', 'X345678', v_admin_id),
  (v_tenant_id, 'Jeuveau 100 Units', 'cosmetic', 'JEU-100', 'PrabotulinumtoxinA - 100 unit vial', 5, 2, 35000, 'Evolus', 'Cosmetic Fridge', CURRENT_DATE + INTERVAL '8 months', 'J901234', v_admin_id);

  -- Dermal Fillers - Hyaluronic Acid
  INSERT INTO inventory_items (tenant_id, name, category, sku, description, quantity, reorder_level, unit_cost_cents, supplier, location, expiration_date, lot_number, created_by) VALUES
  (v_tenant_id, 'Juvederm Ultra XC 1mL', 'cosmetic', 'JUV-UXCL', 'Hyaluronic acid filler with lidocaine', 20, 8, 28500, 'Allergan', 'Cosmetic Fridge', CURRENT_DATE + INTERVAL '18 months', 'JU567890', v_admin_id),
  (v_tenant_id, 'Juvederm Ultra Plus XC 1mL', 'cosmetic', 'JUV-UPXC', 'Hyaluronic acid filler - deeper injection', 18, 7, 29500, 'Allergan', 'Cosmetic Fridge', CURRENT_DATE + INTERVAL '18 months', 'JP123456', v_admin_id),
  (v_tenant_id, 'Juvederm Voluma XC 1mL', 'cosmetic', 'JUV-VOLXC', 'Volumizing hyaluronic acid filler', 15, 6, 32500, 'Allergan', 'Cosmetic Fridge', CURRENT_DATE + INTERVAL '17 months', 'JV789012', v_admin_id),
  (v_tenant_id, 'Juvederm Volbella XC 1mL', 'cosmetic', 'JUV-VBXC', 'Fine line and lip filler', 12, 5, 30000, 'Allergan', 'Cosmetic Fridge', CURRENT_DATE + INTERVAL '16 months', 'JB345678', v_admin_id),
  (v_tenant_id, 'Restylane 1mL', 'cosmetic', 'REST-1ML', 'Hyaluronic acid dermal filler', 16, 6, 27500, 'Galderma', 'Cosmetic Fridge', CURRENT_DATE + INTERVAL '18 months', 'R901234', v_admin_id),
  (v_tenant_id, 'Restylane Lyft 1mL', 'cosmetic', 'REST-LYFT', 'Volumizing hyaluronic acid filler', 14, 5, 29000, 'Galderma', 'Cosmetic Fridge', CURRENT_DATE + INTERVAL '17 months', 'RL567890', v_admin_id),
  (v_tenant_id, 'Restylane Refyne 1mL', 'cosmetic', 'REST-REF', 'Flexible hyaluronic acid filler', 10, 4, 28500, 'Galderma', 'Cosmetic Fridge', CURRENT_DATE + INTERVAL '16 months', 'RR123456', v_admin_id),
  (v_tenant_id, 'Restylane Kysse 1mL', 'cosmetic', 'REST-KYSSE', 'Lip enhancement filler', 12, 5, 29500, 'Galderma', 'Cosmetic Fridge', CURRENT_DATE + INTERVAL '15 months', 'RK789012', v_admin_id),
  (v_tenant_id, 'RHA 2 1.5mL', 'cosmetic', 'RHA-2', 'Resilient hyaluronic acid - dynamic areas', 8, 3, 32000, 'Revance', 'Cosmetic Fridge', CURRENT_DATE + INTERVAL '18 months', 'RH345678', v_admin_id),
  (v_tenant_id, 'Belotero Balance 1mL', 'cosmetic', 'BELO-BAL', 'Fine line hyaluronic acid filler', 10, 4, 26500, 'Merz', 'Cosmetic Fridge', CURRENT_DATE + INTERVAL '16 months', 'BB901234', v_admin_id);

  -- Biostimulatory Fillers
  INSERT INTO inventory_items (tenant_id, name, category, sku, description, quantity, reorder_level, unit_cost_cents, supplier, location, expiration_date, lot_number, created_by) VALUES
  (v_tenant_id, 'Sculptra Aesthetic', 'cosmetic', 'SCUL-AESTH', 'Poly-L-lactic acid collagen stimulator', 6, 2, 85000, 'Galderma', 'Cosmetic Cabinet', CURRENT_DATE + INTERVAL '24 months', 'SA567890', v_admin_id),
  (v_tenant_id, 'Radiesse 1.5mL', 'cosmetic', 'RAD-1.5', 'Calcium hydroxylapatite filler', 10, 4, 34500, 'Merz', 'Cosmetic Fridge', CURRENT_DATE + INTERVAL '36 months', 'RA123456', v_admin_id);

  -- ====================================
  -- TOPICAL SAMPLES & MEDICATIONS
  -- ====================================

  -- Prescription Topical Samples
  INSERT INTO inventory_items (tenant_id, name, category, sku, description, quantity, reorder_level, unit_cost_cents, supplier, location, created_by) VALUES
  (v_tenant_id, 'Clobetasol 0.05% Cream (Sample)', 'medication', 'CLOB-005-S', 'High-potency corticosteroid cream samples', 50, 20, 0, 'Various Reps', 'Sample Closet', v_admin_id),
  (v_tenant_id, 'Triamcinolone 0.1% Ointment (Sample)', 'medication', 'TRIAM-01-S', 'Mid-potency corticosteroid ointment samples', 60, 25, 0, 'Various Reps', 'Sample Closet', v_admin_id),
  (v_tenant_id, 'Halobetasol 0.05% Cream (Sample)', 'medication', 'HALO-005-S', 'Super-potent corticosteroid cream samples', 40, 15, 0, 'Various Reps', 'Sample Closet', v_admin_id),
  (v_tenant_id, 'Desonide 0.05% Cream (Sample)', 'medication', 'DESON-S', 'Low-potency corticosteroid for sensitive areas', 45, 20, 0, 'Various Reps', 'Sample Closet', v_admin_id),
  (v_tenant_id, 'Tretinoin 0.025% Cream (Sample)', 'medication', 'TRET-025-S', 'Topical retinoid cream samples', 35, 15, 0, 'Various Reps', 'Sample Closet', v_admin_id),
  (v_tenant_id, 'Tretinoin 0.05% Cream (Sample)', 'medication', 'TRET-05-S', 'Topical retinoid cream samples', 30, 15, 0, 'Various Reps', 'Sample Closet', v_admin_id),
  (v_tenant_id, 'Adapalene 0.3% Gel (Sample)', 'medication', 'ADAP-03-S', 'Topical retinoid gel samples', 40, 15, 0, 'Galderma Rep', 'Sample Closet', v_admin_id),
  (v_tenant_id, 'Tazarotene 0.1% Cream (Sample)', 'medication', 'TAZA-01-S', 'Topical retinoid cream samples', 25, 10, 0, 'Various Reps', 'Sample Closet', v_admin_id),
  (v_tenant_id, 'Clindamycin 1% Gel (Sample)', 'medication', 'CLIND-1-S', 'Topical antibiotic gel samples', 50, 20, 0, 'Various Reps', 'Sample Closet', v_admin_id),
  (v_tenant_id, 'Metronidazole 0.75% Gel (Sample)', 'medication', 'METRO-075-S', 'Topical antibiotic/anti-inflammatory gel', 40, 15, 0, 'Galderma Rep', 'Sample Closet', v_admin_id),
  (v_tenant_id, 'Benzoyl Peroxide 5% Wash (Sample)', 'medication', 'BP-5-S', 'Antibacterial acne wash samples', 60, 25, 0, 'Various Reps', 'Sample Closet', v_admin_id),
  (v_tenant_id, 'Tacrolimus 0.1% Ointment (Sample)', 'medication', 'TACRO-01-S', 'Non-steroidal immunomodulator ointment', 30, 12, 0, 'Various Reps', 'Sample Closet', v_admin_id),
  (v_tenant_id, 'Pimecrolimus 1% Cream (Sample)', 'medication', 'PIMEC-1-S', 'Non-steroidal immunomodulator cream', 35, 15, 0, 'Various Reps', 'Sample Closet', v_admin_id),
  (v_tenant_id, 'Ketoconazole 2% Cream (Sample)', 'medication', 'KETO-2-S', 'Antifungal cream samples', 45, 20, 0, 'Various Reps', 'Sample Closet', v_admin_id),
  (v_tenant_id, 'Ciclopirox 0.77% Gel (Sample)', 'medication', 'CICLO-S', 'Antifungal gel samples', 30, 12, 0, 'Various Reps', 'Sample Closet', v_admin_id);

  -- Moisturizers & Barrier Repair (Samples)
  INSERT INTO inventory_items (tenant_id, name, category, sku, description, quantity, reorder_level, unit_cost_cents, supplier, location, created_by) VALUES
  (v_tenant_id, 'CeraVe Moisturizing Cream (Sample)', 'supply', 'CERAVE-S', 'Ceramide-containing moisturizer samples', 100, 40, 0, 'L''Oreal Rep', 'Sample Closet', v_admin_id),
  (v_tenant_id, 'Cetaphil Cream (Sample)', 'supply', 'CETAPH-S', 'Gentle moisturizing cream samples', 80, 30, 0, 'Galderma Rep', 'Sample Closet', v_admin_id),
  (v_tenant_id, 'Vanicream Moisturizer (Sample)', 'supply', 'VANICR-S', 'Hypoallergenic moisturizer samples', 70, 30, 0, 'Pharmaceutical Specialties', 'Sample Closet', v_admin_id),
  (v_tenant_id, 'EltaMD UV Clear SPF 46 (Sample)', 'supply', 'ELTA-UV-S', 'Medical-grade sunscreen samples', 60, 25, 0, 'EltaMD Rep', 'Sample Closet', v_admin_id);

  -- ====================================
  -- BIOPSY SUPPLIES
  -- ====================================

  -- Punch Biopsy Tools
  INSERT INTO inventory_items (tenant_id, name, category, sku, description, quantity, reorder_level, unit_cost_cents, supplier, location, created_by) VALUES
  (v_tenant_id, 'Punch Biopsy 2mm', 'supply', 'PB-2MM', 'Disposable 2mm punch biopsy tool', 100, 50, 250, 'Henry Schein', 'Procedure Room Cabinet', v_admin_id),
  (v_tenant_id, 'Punch Biopsy 3mm', 'supply', 'PB-3MM', 'Disposable 3mm punch biopsy tool', 150, 75, 250, 'Henry Schein', 'Procedure Room Cabinet', v_admin_id),
  (v_tenant_id, 'Punch Biopsy 4mm', 'supply', 'PB-4MM', 'Disposable 4mm punch biopsy tool', 200, 100, 275, 'Henry Schein', 'Procedure Room Cabinet', v_admin_id),
  (v_tenant_id, 'Punch Biopsy 5mm', 'supply', 'PB-5MM', 'Disposable 5mm punch biopsy tool', 150, 75, 300, 'Henry Schein', 'Procedure Room Cabinet', v_admin_id),
  (v_tenant_id, 'Punch Biopsy 6mm', 'supply', 'PB-6MM', 'Disposable 6mm punch biopsy tool', 100, 50, 325, 'Henry Schein', 'Procedure Room Cabinet', v_admin_id),
  (v_tenant_id, 'Punch Biopsy 8mm', 'supply', 'PB-8MM', 'Disposable 8mm punch biopsy tool', 50, 25, 400, 'Henry Schein', 'Procedure Room Cabinet', v_admin_id);

  -- Biopsy Collection
  INSERT INTO inventory_items (tenant_id, name, category, sku, description, quantity, reorder_level, unit_cost_cents, supplier, location, created_by) VALUES
  (v_tenant_id, 'Biopsy Specimen Containers', 'supply', 'SPEC-CONT', '20mL specimen containers with lid', 500, 200, 45, 'Henry Schein', 'Procedure Room Cabinet', v_admin_id),
  (v_tenant_id, 'Formalin 10% (Buffered)', 'supply', 'FORMAL-10', '10% buffered formalin solution - 1 gallon', 8, 3, 2500, 'Fisher Scientific', 'Procedure Room Storage', v_admin_id),
  (v_tenant_id, 'Biopsy Requisition Forms', 'supply', 'BX-REQ-FORM', 'Pre-printed pathology requisition forms', 1000, 200, 15, 'Office Supply', 'Front Desk', v_admin_id),
  (v_tenant_id, 'Biohazard Specimen Bags', 'supply', 'BIOHAZ-BAG', 'Zip-lock biohazard specimen transport bags', 500, 150, 35, 'Henry Schein', 'Procedure Room Cabinet', v_admin_id);

  -- ====================================
  -- SURGICAL SUPPLIES
  -- ====================================

  -- Sutures
  INSERT INTO inventory_items (tenant_id, name, category, sku, description, quantity, reorder_level, unit_cost_cents, supplier, location, created_by) VALUES
  (v_tenant_id, 'Suture 3-0 Nylon (Cutting)', 'supply', 'SUT-3-0-NYL', '3-0 nylon suture with cutting needle', 200, 100, 425, 'Ethicon', 'Procedure Room Cabinet', v_admin_id),
  (v_tenant_id, 'Suture 4-0 Nylon (Cutting)', 'supply', 'SUT-4-0-NYL', '4-0 nylon suture with cutting needle', 300, 150, 425, 'Ethicon', 'Procedure Room Cabinet', v_admin_id),
  (v_tenant_id, 'Suture 5-0 Nylon (Cutting)', 'supply', 'SUT-5-0-NYL', '5-0 nylon suture with cutting needle', 250, 125, 475, 'Ethicon', 'Procedure Room Cabinet', v_admin_id),
  (v_tenant_id, 'Suture 6-0 Nylon (Cutting)', 'supply', 'SUT-6-0-NYL', '6-0 nylon suture for face/delicate areas', 150, 75, 550, 'Ethicon', 'Procedure Room Cabinet', v_admin_id),
  (v_tenant_id, 'Suture 3-0 Vicryl (Absorbable)', 'supply', 'SUT-3-0-VIC', '3-0 absorbable Vicryl suture', 150, 75, 575, 'Ethicon', 'Procedure Room Cabinet', v_admin_id),
  (v_tenant_id, 'Suture 4-0 Vicryl (Absorbable)', 'supply', 'SUT-4-0-VIC', '4-0 absorbable Vicryl suture', 200, 100, 575, 'Ethicon', 'Procedure Room Cabinet', v_admin_id),
  (v_tenant_id, 'Suture 5-0 Prolene (Non-Absorbable)', 'supply', 'SUT-5-0-PRO', '5-0 Prolene suture for precise closure', 100, 50, 625, 'Ethicon', 'Procedure Room Cabinet', v_admin_id);

  -- Surgical Instruments & Supplies
  INSERT INTO inventory_items (tenant_id, name, category, sku, description, quantity, reorder_level, unit_cost_cents, supplier, location, created_by) VALUES
  (v_tenant_id, 'Scalpel Blades #15', 'supply', 'SCAL-15', 'Disposable #15 scalpel blades', 200, 100, 85, 'Henry Schein', 'Procedure Room Cabinet', v_admin_id),
  (v_tenant_id, 'Scalpel Blades #11', 'supply', 'SCAL-11', 'Disposable #11 scalpel blades', 150, 75, 85, 'Henry Schein', 'Procedure Room Cabinet', v_admin_id),
  (v_tenant_id, 'Scalpel Handles #3', 'equipment', 'SCAL-H3', 'Reusable #3 scalpel handle', 10, 3, 1250, 'Henry Schein', 'Procedure Room Cabinet', v_admin_id),
  (v_tenant_id, 'Iris Scissors (Curved)', 'equipment', 'IRIS-CURVE', 'Surgical iris scissors - curved', 8, 2, 2500, 'Henry Schein', 'Procedure Room Cabinet', v_admin_id),
  (v_tenant_id, 'Adson Forceps (Toothed)', 'equipment', 'ADSON-TOOTH', 'Adson tissue forceps with teeth', 10, 3, 1800, 'Henry Schein', 'Procedure Room Cabinet', v_admin_id),
  (v_tenant_id, 'Needle Holder (Mayo-Hegar)', 'equipment', 'NEEDLE-HOLD', 'Mayo-Hegar needle holder 6"', 8, 2, 3200, 'Henry Schein', 'Procedure Room Cabinet', v_admin_id);

  -- Hemostatic Agents
  INSERT INTO inventory_items (tenant_id, name, category, sku, description, quantity, reorder_level, unit_cost_cents, supplier, location, created_by) VALUES
  (v_tenant_id, 'Aluminum Chloride 35%', 'supply', 'ALCL-35', 'Hemostatic solution for minor bleeding', 12, 5, 850, 'Henry Schein', 'Procedure Room Cabinet', v_admin_id),
  (v_tenant_id, 'Monsel''s Solution', 'supply', 'MONSEL', 'Ferric subsulfate hemostatic solution', 10, 4, 1200, 'Delasco', 'Procedure Room Cabinet', v_admin_id),
  (v_tenant_id, 'Silver Nitrate Sticks', 'supply', 'AG-NIT-STICK', 'Silver nitrate applicator sticks', 100, 40, 150, 'Henry Schein', 'Procedure Room Cabinet', v_admin_id),
  (v_tenant_id, 'Gelfoam Absorbable Sponge', 'supply', 'GELFOAM', 'Absorbable gelatin hemostatic sponge', 50, 20, 450, 'Pfizer', 'Procedure Room Cabinet', v_admin_id);

  -- Wound Care & Dressings
  INSERT INTO inventory_items (tenant_id, name, category, sku, description, quantity, reorder_level, unit_cost_cents, supplier, location, created_by) VALUES
  (v_tenant_id, 'Gauze Pads 2x2 (Sterile)', 'supply', 'GAUZE-2X2', 'Sterile gauze pads 2"x2"', 1000, 400, 15, 'McKesson', 'Supply Closet', v_admin_id),
  (v_tenant_id, 'Gauze Pads 4x4 (Sterile)', 'supply', 'GAUZE-4X4', 'Sterile gauze pads 4"x4"', 800, 300, 25, 'McKesson', 'Supply Closet', v_admin_id),
  (v_tenant_id, 'Petroleum Gauze (Xeroform)', 'supply', 'XEROFORM', 'Petrolatum-impregnated gauze dressing', 200, 80, 125, 'Covidien', 'Procedure Room Cabinet', v_admin_id),
  (v_tenant_id, 'Tegaderm Transparent Dressing', 'supply', 'TEGADERM', 'Transparent adhesive wound dressing', 300, 120, 175, '3M', 'Procedure Room Cabinet', v_admin_id),
  (v_tenant_id, 'Band-Aids (Assorted)', 'supply', 'BANDAID-AST', 'Assorted adhesive bandages', 500, 200, 10, 'Johnson & Johnson', 'Supply Closet', v_admin_id),
  (v_tenant_id, 'Steri-Strips 1/4"', 'supply', 'STERI-025', 'Adhesive wound closure strips 1/4"', 200, 80, 85, '3M', 'Procedure Room Cabinet', v_admin_id),
  (v_tenant_id, 'Steri-Strips 1/2"', 'supply', 'STERI-050', 'Adhesive wound closure strips 1/2"', 150, 60, 95, '3M', 'Procedure Room Cabinet', v_admin_id),
  (v_tenant_id, 'Coban Self-Adherent Wrap', 'supply', 'COBAN-WRAP', 'Self-adherent elastic bandage wrap', 100, 40, 225, '3M', 'Supply Closet', v_admin_id),
  (v_tenant_id, 'Surgical Tape 1" (Paper)', 'supply', 'TAPE-PAPER', 'Hypoallergenic paper surgical tape', 150, 60, 175, '3M', 'Supply Closet', v_admin_id),
  (v_tenant_id, 'Surgical Tape 1" (Silk)', 'supply', 'TAPE-SILK', 'Silk surgical tape for sensitive skin', 100, 40, 225, '3M', 'Supply Closet', v_admin_id);

  -- ====================================
  -- CRYOTHERAPY SUPPLIES
  -- ====================================

  INSERT INTO inventory_items (tenant_id, name, category, sku, description, quantity, reorder_level, unit_cost_cents, supplier, location, created_by) VALUES
  (v_tenant_id, 'Liquid Nitrogen (Liter)', 'supply', 'LN2-LITER', 'Liquid nitrogen for cryotherapy', 50, 20, 450, 'Airgas', 'Cryo Storage Tank', v_admin_id),
  (v_tenant_id, 'Cryotherapy Spray Tips (Large)', 'supply', 'CRYO-TIP-L', 'Large spray tips for cryotherapy', 100, 40, 125, 'Brymill', 'Procedure Room Cabinet', v_admin_id),
  (v_tenant_id, 'Cryotherapy Spray Tips (Medium)', 'supply', 'CRYO-TIP-M', 'Medium spray tips for cryotherapy', 150, 60, 115, 'Brymill', 'Procedure Room Cabinet', v_admin_id),
  (v_tenant_id, 'Cryotherapy Spray Tips (Small)', 'supply', 'CRYO-TIP-S', 'Small/pinpoint spray tips for cryotherapy', 120, 50, 105, 'Brymill', 'Procedure Room Cabinet', v_admin_id),
  (v_tenant_id, 'CryoGun (Brymill)', 'equipment', 'CRYOGUN-BR', 'Handheld cryotherapy spray device', 3, 1, 45000, 'Brymill', 'Procedure Room Storage', v_admin_id),
  (v_tenant_id, 'Cryo-Tweezers', 'equipment', 'CRYO-TWEEZ', 'Cryotherapy applicator tweezers', 5, 2, 3500, 'Brymill', 'Procedure Room Cabinet', v_admin_id),
  (v_tenant_id, 'Cotton-Tipped Applicators', 'supply', 'Q-TIPS-STER', 'Sterile cotton-tipped applicators', 2000, 800, 5, 'McKesson', 'Supply Closet', v_admin_id);

  -- ====================================
  -- PHOTOTHERAPY SUPPLIES
  -- ====================================

  INSERT INTO inventory_items (tenant_id, name, category, sku, description, quantity, reorder_level, unit_cost_cents, supplier, location, created_by) VALUES
  (v_tenant_id, 'UVB Narrowband Bulbs', 'supply', 'UVB-NB-BULB', 'Narrowband UVB phototherapy bulbs', 12, 4, 8500, 'Daavlin', 'Phototherapy Room Storage', v_admin_id),
  (v_tenant_id, 'UVB Eye Protection Goggles', 'equipment', 'UVB-GOGGLES', 'UV-protective goggles for phototherapy', 20, 8, 1250, 'Daavlin', 'Phototherapy Room', v_admin_id),
  (v_tenant_id, 'Phototherapy Dosimeter', 'equipment', 'PHOTO-DOSIM', 'UV light intensity measuring device', 2, 1, 45000, 'Daavlin', 'Phototherapy Room', v_admin_id);

  -- ====================================
  -- LASER SUPPLIES
  -- ====================================

  INSERT INTO inventory_items (tenant_id, name, category, sku, description, quantity, reorder_level, unit_cost_cents, supplier, location, created_by) VALUES
  (v_tenant_id, 'Laser Handpiece Tips (Disposable)', 'supply', 'LASER-TIP-D', 'Disposable laser handpiece tips', 50, 20, 2500, 'Candela', 'Laser Room Cabinet', v_admin_id),
  (v_tenant_id, 'Laser Cooling Gel', 'supply', 'LASER-GEL', 'Ultrasound/laser transmission gel - 5L', 10, 4, 3500, 'Parker Labs', 'Laser Room Cabinet', v_admin_id),
  (v_tenant_id, 'Laser Safety Eyewear (Provider)', 'equipment', 'LASER-EYE-P', 'Wavelength-specific laser safety glasses', 6, 2, 12500, 'Laser Safety Industries', 'Laser Room', v_admin_id),
  (v_tenant_id, 'Laser Safety Eyewear (Patient)', 'equipment', 'LASER-EYE-PAT', 'Patient laser safety goggles', 15, 5, 4500, 'Laser Safety Industries', 'Laser Room', v_admin_id),
  (v_tenant_id, 'Laser Smoke Evacuator Filters', 'supply', 'LASER-FILTER', 'HEPA filters for laser plume evacuation', 20, 8, 3200, 'Buffalo Filter', 'Laser Room Storage', v_admin_id);

  -- ====================================
  -- OFFICE SUPPLIES (CLINICAL)
  -- ====================================

  INSERT INTO inventory_items (tenant_id, name, category, sku, description, quantity, reorder_level, unit_cost_cents, supplier, location, created_by) VALUES
  (v_tenant_id, 'Nitrile Gloves - Small', 'supply', 'GLOVE-NIT-S', 'Powder-free nitrile exam gloves (Small)', 2000, 800, 12, 'McKesson', 'Supply Closet', v_admin_id),
  (v_tenant_id, 'Nitrile Gloves - Medium', 'supply', 'GLOVE-NIT-M', 'Powder-free nitrile exam gloves (Medium)', 3000, 1200, 12, 'McKesson', 'Supply Closet', v_admin_id),
  (v_tenant_id, 'Nitrile Gloves - Large', 'supply', 'GLOVE-NIT-L', 'Powder-free nitrile exam gloves (Large)', 2500, 1000, 12, 'McKesson', 'Supply Closet', v_admin_id),
  (v_tenant_id, 'Nitrile Gloves - XLarge', 'supply', 'GLOVE-NIT-XL', 'Powder-free nitrile exam gloves (XLarge)', 1500, 600, 12, 'McKesson', 'Supply Closet', v_admin_id),
  (v_tenant_id, 'Sterile Surgical Gloves Size 7', 'supply', 'SURG-GLV-7', 'Sterile surgical gloves size 7', 200, 80, 125, 'Ansell', 'Procedure Room Cabinet', v_admin_id),
  (v_tenant_id, 'Sterile Surgical Gloves Size 7.5', 'supply', 'SURG-GLV-75', 'Sterile surgical gloves size 7.5', 250, 100, 125, 'Ansell', 'Procedure Room Cabinet', v_admin_id),
  (v_tenant_id, 'Sterile Surgical Gloves Size 8', 'supply', 'SURG-GLV-8', 'Sterile surgical gloves size 8', 200, 80, 125, 'Ansell', 'Procedure Room Cabinet', v_admin_id),
  (v_tenant_id, 'Alcohol Prep Pads', 'supply', 'ALC-PREP', 'Isopropyl alcohol prep pads', 2000, 800, 5, 'McKesson', 'Supply Closet', v_admin_id),
  (v_tenant_id, 'Betadine Swabsticks', 'supply', 'BETA-SWAB', 'Povidone-iodine surgical prep swabs', 500, 200, 25, 'Purdue', 'Procedure Room Cabinet', v_admin_id),
  (v_tenant_id, 'Chlorhexidine Swabsticks', 'supply', 'CHLOR-SWAB', 'ChloraPrep surgical prep applicators', 300, 120, 325, 'BD', 'Procedure Room Cabinet', v_admin_id),
  (v_tenant_id, 'Tongue Depressors (Wooden)', 'supply', 'TONGUE-DEP', 'Disposable wooden tongue depressors', 1000, 400, 3, 'McKesson', 'Supply Closet', v_admin_id),
  (v_tenant_id, 'Cotton Balls (Non-Sterile)', 'supply', 'COTTON-BALL', 'Non-sterile cotton balls', 500, 200, 8, 'McKesson', 'Supply Closet', v_admin_id),
  (v_tenant_id, 'Exam Table Paper', 'supply', 'EXAM-PAPER', 'Disposable exam table paper roll', 50, 20, 1250, 'McKesson', 'Supply Closet', v_admin_id),
  (v_tenant_id, 'Drape Sheets (Sterile)', 'supply', 'DRAPE-STER', 'Sterile surgical drape sheets', 200, 80, 225, 'McKesson', 'Procedure Room Cabinet', v_admin_id),
  (v_tenant_id, 'Face Masks (Procedural)', 'supply', 'MASK-PROC', 'Disposable procedural face masks', 1000, 400, 15, 'McKesson', 'Supply Closet', v_admin_id),
  (v_tenant_id, 'Face Shields', 'supply', 'FACE-SHIELD', 'Disposable face shields with elastic band', 200, 80, 125, 'McKesson', 'Supply Closet', v_admin_id),
  (v_tenant_id, 'Sharps Container 1 Quart', 'supply', 'SHARPS-1QT', 'Biohazard sharps disposal container', 50, 20, 250, 'Covidien', 'Multiple Locations', v_admin_id),
  (v_tenant_id, 'Biohazard Waste Bags', 'supply', 'BIOHAZ-BAG-W', 'Red biohazard waste bags', 200, 80, 65, 'Stericycle', 'Supply Closet', v_admin_id);

  -- ====================================
  -- INJECTABLE MEDICATIONS
  -- ====================================

  INSERT INTO inventory_items (tenant_id, name, category, sku, description, quantity, reorder_level, unit_cost_cents, supplier, location, expiration_date, lot_number, created_by) VALUES
  (v_tenant_id, 'Lidocaine 1% (30mL vial)', 'medication', 'LIDO-1-30', 'Local anesthetic - 1% lidocaine 30mL', 40, 15, 1250, 'Hospira', 'Med Cabinet', CURRENT_DATE + INTERVAL '18 months', 'L789456', v_admin_id),
  (v_tenant_id, 'Lidocaine 2% (30mL vial)', 'medication', 'LIDO-2-30', 'Local anesthetic - 2% lidocaine 30mL', 35, 15, 1450, 'Hospira', 'Med Cabinet', CURRENT_DATE + INTERVAL '18 months', 'L123789', v_admin_id),
  (v_tenant_id, 'Lidocaine 1% w/ Epi 1:100K', 'medication', 'LIDO-1-EPI', 'Local anesthetic with epinephrine 30mL', 50, 20, 1550, 'Hospira', 'Med Cabinet', CURRENT_DATE + INTERVAL '16 months', 'LE456123', v_admin_id),
  (v_tenant_id, 'Lidocaine 2% w/ Epi 1:100K', 'medication', 'LIDO-2-EPI', 'Local anesthetic with epinephrine 30mL', 45, 18, 1750, 'Hospira', 'Med Cabinet', CURRENT_DATE + INTERVAL '16 months', 'LE789456', v_admin_id),
  (v_tenant_id, 'Triamcinolone 10mg/mL (5mL)', 'medication', 'TRIAM-10', 'Intralesional corticosteroid injection', 30, 12, 875, 'Bristol-Myers Squibb', 'Med Cabinet', CURRENT_DATE + INTERVAL '24 months', 'T101234', v_admin_id),
  (v_tenant_id, 'Triamcinolone 40mg/mL (10mL)', 'medication', 'TRIAM-40', 'Intralesional corticosteroid injection', 25, 10, 1450, 'Bristol-Myers Squibb', 'Med Cabinet', CURRENT_DATE + INTERVAL '24 months', 'T401234', v_admin_id),
  (v_tenant_id, 'Epinephrine 1:1000 (1mL amp)', 'medication', 'EPI-1-1000', 'Emergency epinephrine injection', 10, 5, 450, 'Hospira', 'Emergency Cart', CURRENT_DATE + INTERVAL '18 months', 'E123456', v_admin_id),
  (v_tenant_id, 'Diphenhydramine 50mg/mL (1mL)', 'medication', 'BENADRYL-INJ', 'Injectable antihistamine', 20, 8, 325, 'Pfizer', 'Emergency Cart', CURRENT_DATE + INTERVAL '24 months', 'D567890', v_admin_id),
  (v_tenant_id, 'Dexamethasone 4mg/mL (1mL)', 'medication', 'DEXA-4', 'Injectable corticosteroid', 15, 6, 275, 'Fresenius Kabi', 'Emergency Cart', CURRENT_DATE + INTERVAL '24 months', 'DX123456', v_admin_id);

  -- ====================================
  -- SYRINGES & NEEDLES
  -- ====================================

  INSERT INTO inventory_items (tenant_id, name, category, sku, description, quantity, reorder_level, unit_cost_cents, supplier, location, created_by) VALUES
  (v_tenant_id, 'Syringe 1mL (TB) w/ 27G needle', 'supply', 'SYR-1ML-27G', 'Tuberculin syringe with 27 gauge needle', 500, 200, 35, 'BD', 'Med Cabinet', v_admin_id),
  (v_tenant_id, 'Syringe 3mL w/ 25G needle', 'supply', 'SYR-3ML-25G', '3mL syringe with 25 gauge needle', 400, 150, 45, 'BD', 'Med Cabinet', v_admin_id),
  (v_tenant_id, 'Syringe 5mL w/ 22G needle', 'supply', 'SYR-5ML-22G', '5mL syringe with 22 gauge needle', 300, 120, 55, 'BD', 'Med Cabinet', v_admin_id),
  (v_tenant_id, 'Syringe 10mL (Luer-Lock)', 'supply', 'SYR-10ML-LL', '10mL luer-lock syringe (no needle)', 250, 100, 65, 'BD', 'Med Cabinet', v_admin_id),
  (v_tenant_id, 'Syringe 30mL (Luer-Lock)', 'supply', 'SYR-30ML-LL', '30mL luer-lock syringe (no needle)', 100, 40, 125, 'BD', 'Procedure Room Cabinet', v_admin_id),
  (v_tenant_id, 'Needle 30G x 1/2"', 'supply', 'NDL-30G-05', '30 gauge x 1/2" needle', 500, 200, 25, 'BD', 'Cosmetic Cabinet', v_admin_id),
  (v_tenant_id, 'Needle 27G x 1/2"', 'supply', 'NDL-27G-05', '27 gauge x 1/2" needle', 600, 250, 25, 'BD', 'Med Cabinet', v_admin_id),
  (v_tenant_id, 'Needle 25G x 1"', 'supply', 'NDL-25G-1', '25 gauge x 1" needle', 500, 200, 28, 'BD', 'Med Cabinet', v_admin_id),
  (v_tenant_id, 'Needle 22G x 1.5"', 'supply', 'NDL-22G-15', '22 gauge x 1.5" needle', 300, 120, 32, 'BD', 'Med Cabinet', v_admin_id),
  (v_tenant_id, 'Needle 18G x 1.5" (Drawing)', 'supply', 'NDL-18G-15', '18 gauge drawing needle', 200, 80, 35, 'BD', 'Med Cabinet', v_admin_id);

  -- ====================================
  -- DIAGNOSTIC EQUIPMENT
  -- ====================================

  INSERT INTO inventory_items (tenant_id, name, category, sku, description, quantity, reorder_level, unit_cost_cents, supplier, location, created_by) VALUES
  (v_tenant_id, 'Dermoscope (Heine Delta 20)', 'equipment', 'DERMO-H20', 'Handheld dermatoscope with LED', 4, 1, 125000, 'Heine USA', 'Exam Rooms', v_admin_id),
  (v_tenant_id, 'Wood''s Lamp', 'equipment', 'WOODS-LAMP', 'UV Wood''s lamp for fluorescence exam', 3, 1, 8500, 'Burton Medical', 'Exam Rooms', v_admin_id),
  (v_tenant_id, 'Wood''s Lamp Replacement Bulb', 'supply', 'WOODS-BULB', 'Replacement UV bulb for Wood''s lamp', 10, 4, 2500, 'Burton Medical', 'Supply Closet', v_admin_id),
  (v_tenant_id, 'Digital Photography Camera', 'equipment', 'CAM-DIGI', 'Medical-grade photography camera', 2, 1, 185000, 'Canon Medical', 'Photo Documentation Room', v_admin_id),
  (v_tenant_id, 'Skin Biopsy Marker (Surgical)', 'supply', 'BX-MARKER', 'Sterile surgical skin markers', 100, 40, 125, 'Medline', 'Procedure Room Cabinet', v_admin_id);

  RAISE NOTICE 'Successfully seeded % inventory items for tenant %', (SELECT COUNT(*) FROM inventory_items WHERE tenant_id = v_tenant_id), v_tenant_id;

END $$;
