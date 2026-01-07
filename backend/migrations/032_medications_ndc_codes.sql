-- Migration: Add NDC codes to medications
-- National Drug Code (NDC) is the unique identifier for medications in the US
-- Format: 5-4-2 (labeler-product-package)

-- Ensure NDC column exists
ALTER TABLE medications ADD COLUMN IF NOT EXISTS ndc VARCHAR(20);
ALTER TABLE medications ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(255);

-- Create index on NDC for fast lookups
CREATE INDEX IF NOT EXISTS idx_medications_ndc ON medications(ndc);

-- Update existing medications with realistic NDC codes (mocked for demo)
-- In production, these would come from FDA NDC Directory or RxNorm

-- Topical Retinoids
UPDATE medications SET ndc = '00299-3823-01', manufacturer = 'Valeant Pharmaceuticals' WHERE name = 'Tretinoin 0.025% Cream';
UPDATE medications SET ndc = '00299-3824-01', manufacturer = 'Valeant Pharmaceuticals' WHERE name = 'Tretinoin 0.05% Cream';
UPDATE medications SET ndc = '00299-3825-01', manufacturer = 'Valeant Pharmaceuticals' WHERE name = 'Tretinoin 0.1% Cream';
UPDATE medications SET ndc = '00299-4511-45', manufacturer = 'Galderma' WHERE name = 'Adapalene 0.1% Gel';
UPDATE medications SET ndc = '00023-4447-45', manufacturer = 'Allergan' WHERE name = 'Tazarotene 0.1% Cream';

-- Topical Corticosteroids (High Potency)
UPDATE medications SET ndc = '00299-5820-45', manufacturer = 'Pharmaderm' WHERE name = 'Clobetasol 0.05% Cream';
UPDATE medications SET ndc = '00299-5821-45', manufacturer = 'Pharmaderm' WHERE name = 'Clobetasol 0.05% Ointment';
UPDATE medications SET ndc = '00062-0380-46', manufacturer = 'Merck' WHERE name = 'Betamethasone Dipropionate 0.05% Cream';

-- Topical Corticosteroids (Medium Potency)
UPDATE medications SET ndc = '00168-0011-31', manufacturer = 'Fougera' WHERE name = 'Triamcinolone 0.1% Cream';
UPDATE medications SET ndc = '00168-0012-31', manufacturer = 'Fougera' WHERE name = 'Triamcinolone 0.1% Ointment';
UPDATE medications SET ndc = '00472-0325-56', manufacturer = 'Perrigo' WHERE name = 'Fluocinonide 0.05% Cream';

-- Topical Corticosteroids (Low Potency)
UPDATE medications SET ndc = '00168-0003-31', manufacturer = 'Fougera' WHERE name = 'Hydrocortisone 1% Cream';
UPDATE medications SET ndc = '00168-0004-31', manufacturer = 'Fougera' WHERE name = 'Hydrocortisone 2.5% Cream';
UPDATE medications SET ndc = '00299-3850-15', manufacturer = 'Galderma' WHERE name = 'Desonide 0.05% Cream';

-- Topical Antibiotics
UPDATE medications SET ndc = '00029-1525-22', manufacturer = 'GlaxoSmithKline' WHERE name = 'Mupirocin 2% Ointment';
UPDATE medications SET ndc = '00009-3116-01', manufacturer = 'Pharmacia' WHERE name = 'Clindamycin 1% Gel';
UPDATE medications SET ndc = '00168-0242-60', manufacturer = 'Fougera' WHERE name = 'Erythromycin 2% Gel';

-- Topical Antifungals
UPDATE medications SET ndc = '50383-0823-69', manufacturer = 'Janssen' WHERE name = 'Ketoconazole 2% Cream';
UPDATE medications SET ndc = '00067-8100-30', manufacturer = 'Novartis' WHERE name = 'Terbinafine 1% Cream';
UPDATE medications SET ndc = '00085-0875-01', manufacturer = 'Bayer' WHERE name = 'Clotrimazole 1% Cream';
UPDATE medications SET ndc = '00378-0402-77', manufacturer = 'Mylan' WHERE name = 'Ciclopirox 0.77% Cream';

-- Topical Immunomodulators
UPDATE medications SET ndc = '00469-5410-30', manufacturer = 'Astellas' WHERE name = 'Tacrolimus 0.1% Ointment';
UPDATE medications SET ndc = '00469-5411-30', manufacturer = 'Astellas' WHERE name = 'Tacrolimus 0.03% Ointment';
UPDATE medications SET ndc = '00083-5280-30', manufacturer = 'Valeant' WHERE name = 'Pimecrolimus 1% Cream';

-- Topical Chemotherapy/Immunotherapy
UPDATE medications SET ndc = '00187-3025-40', manufacturer = 'Bausch Health' WHERE name = 'Fluorouracil 5% Cream';
UPDATE medications SET ndc = '59923-0200-01', manufacturer = '3M Pharmaceuticals' WHERE name = 'Imiquimod 5% Cream';

-- Oral Antibiotics
UPDATE medications SET ndc = '00093-1043-01', manufacturer = 'Teva' WHERE name = 'Doxycycline 100mg Capsule';
UPDATE medications SET ndc = '00093-1039-01', manufacturer = 'Teva' WHERE name = 'Doxycycline 50mg Capsule';
UPDATE medications SET ndc = '00093-3145-01', manufacturer = 'Teva' WHERE name = 'Minocycline 100mg Capsule';
UPDATE medications SET ndc = '00093-3147-01', manufacturer = 'Teva' WHERE name = 'Cephalexin 500mg Capsule';

-- Oral Antifungals
UPDATE medications SET ndc = '00067-5410-01', manufacturer = 'Novartis' WHERE name = 'Terbinafine 250mg Tablet';
UPDATE medications SET ndc = '00049-3422-41', manufacturer = 'Pfizer' WHERE name = 'Fluconazole 150mg Tablet';
UPDATE medications SET ndc = '50458-0220-01', manufacturer = 'Janssen' WHERE name = 'Itraconazole 100mg Capsule';

-- Oral Corticosteroids
UPDATE medications SET ndc = '00054-8512-25', manufacturer = 'Roxane' WHERE name = 'Prednisone 10mg Tablet';
UPDATE medications SET ndc = '00054-8513-25', manufacturer = 'Roxane' WHERE name = 'Prednisone 20mg Tablet';
UPDATE medications SET ndc = '00009-0049-02', manufacturer = 'Pfizer' WHERE name = 'Methylprednisolone 4mg Tablet';

-- Oral Retinoids
UPDATE medications SET ndc = '00004-0155-49', manufacturer = 'Roche' WHERE name = 'Isotretinoin 40mg Capsule';
UPDATE medications SET ndc = '00004-0156-49', manufacturer = 'Roche' WHERE name = 'Isotretinoin 20mg Capsule';
UPDATE medications SET ndc = '00004-0276-28', manufacturer = 'Stiefel' WHERE name = 'Acitretin 25mg Capsule';

-- Immunosuppressants
UPDATE medications SET ndc = '00143-9570-01', manufacturer = 'West-Ward' WHERE name = 'Methotrexate 2.5mg Tablet';
UPDATE medications SET ndc = '00024-5910-01', manufacturer = 'Concordia' WHERE name = 'Hydroxychloroquine 200mg Tablet';
UPDATE medications SET ndc = '00078-0109-05', manufacturer = 'Novartis' WHERE name = 'Cyclosporine 100mg Capsule';

-- Biologics
UPDATE medications SET ndc = '00024-5958-60', manufacturer = 'Regeneron/Sanofi' WHERE name = 'Dupilumab 300mg Injection';
UPDATE medications SET ndc = '00074-3799-02', manufacturer = 'AbbVie' WHERE name = 'Adalimumab 40mg Injection';
UPDATE medications SET ndc = '57894-0051-02', manufacturer = 'Janssen' WHERE name = 'Ustekinumab 45mg Injection';

COMMENT ON COLUMN medications.ndc IS 'National Drug Code - unique 10-digit identifier for medications';
COMMENT ON COLUMN medications.manufacturer IS 'Pharmaceutical manufacturer name';
