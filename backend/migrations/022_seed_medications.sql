-- Seed Common Dermatology Medications
-- This provides a curated list of medications commonly prescribed in dermatology practices
-- In production, this would be replaced/supplemented with RxNorm/FirstDataBank integration

insert into medications (name, generic_name, brand_name, strength, dosage_form, route, dea_schedule, is_controlled, category, typical_sig) values

-- Topical Retinoids
('Tretinoin 0.025% Cream', 'Tretinoin', 'Retin-A', '0.025%', 'cream', 'topical', null, false, 'topical-retinoid', 'Apply thin layer to affected area once daily at bedtime'),
('Tretinoin 0.05% Cream', 'Tretinoin', 'Retin-A', '0.05%', 'cream', 'topical', null, false, 'topical-retinoid', 'Apply thin layer to affected area once daily at bedtime'),
('Tretinoin 0.1% Cream', 'Tretinoin', 'Retin-A', '0.1%', 'cream', 'topical', null, false, 'topical-retinoid', 'Apply thin layer to affected area once daily at bedtime'),
('Adapalene 0.1% Gel', 'Adapalene', 'Differin', '0.1%', 'gel', 'topical', null, false, 'topical-retinoid', 'Apply thin layer once daily at bedtime'),
('Tazarotene 0.1% Cream', 'Tazarotene', 'Tazorac', '0.1%', 'cream', 'topical', null, false, 'topical-retinoid', 'Apply thin layer once daily at bedtime'),

-- Topical Corticosteroids (High Potency)
('Clobetasol 0.05% Cream', 'Clobetasol propionate', 'Temovate', '0.05%', 'cream', 'topical', null, false, 'topical-steroid-high', 'Apply thin layer to affected area twice daily'),
('Clobetasol 0.05% Ointment', 'Clobetasol propionate', 'Temovate', '0.05%', 'ointment', 'topical', null, false, 'topical-steroid-high', 'Apply thin layer to affected area twice daily'),
('Betamethasone Dipropionate 0.05% Cream', 'Betamethasone dipropionate', 'Diprolene', '0.05%', 'cream', 'topical', null, false, 'topical-steroid-high', 'Apply thin layer to affected area once or twice daily'),

-- Topical Corticosteroids (Medium Potency)
('Triamcinolone 0.1% Cream', 'Triamcinolone acetonide', 'Kenalog', '0.1%', 'cream', 'topical', null, false, 'topical-steroid-medium', 'Apply thin layer to affected area 2-3 times daily'),
('Triamcinolone 0.1% Ointment', 'Triamcinolone acetonide', 'Kenalog', '0.1%', 'ointment', 'topical', null, false, 'topical-steroid-medium', 'Apply thin layer to affected area 2-3 times daily'),
('Fluocinonide 0.05% Cream', 'Fluocinonide', 'Lidex', '0.05%', 'cream', 'topical', null, false, 'topical-steroid-medium', 'Apply thin layer to affected area twice daily'),

-- Topical Corticosteroids (Low Potency)
('Hydrocortisone 1% Cream', 'Hydrocortisone', 'Cortaid', '1%', 'cream', 'topical', null, false, 'topical-steroid-low', 'Apply to affected area 2-4 times daily'),
('Hydrocortisone 2.5% Cream', 'Hydrocortisone', 'Cortaid', '2.5%', 'cream', 'topical', null, false, 'topical-steroid-low', 'Apply to affected area 2-4 times daily'),
('Desonide 0.05% Cream', 'Desonide', 'Desowen', '0.05%', 'cream', 'topical', null, false, 'topical-steroid-low', 'Apply thin layer twice daily'),

-- Topical Antibiotics
('Mupirocin 2% Ointment', 'Mupirocin', 'Bactroban', '2%', 'ointment', 'topical', null, false, 'topical-antibiotic', 'Apply to affected area 3 times daily'),
('Clindamycin 1% Gel', 'Clindamycin phosphate', 'Cleocin', '1%', 'gel', 'topical', null, false, 'topical-antibiotic', 'Apply thin layer twice daily'),
('Erythromycin 2% Gel', 'Erythromycin', 'Erygel', '2%', 'gel', 'topical', null, false, 'topical-antibiotic', 'Apply thin layer twice daily'),

-- Topical Antifungals
('Ketoconazole 2% Cream', 'Ketoconazole', 'Nizoral', '2%', 'cream', 'topical', null, false, 'topical-antifungal', 'Apply to affected area once or twice daily'),
('Terbinafine 1% Cream', 'Terbinafine HCl', 'Lamisil', '1%', 'cream', 'topical', null, false, 'topical-antifungal', 'Apply twice daily for 1-2 weeks'),
('Clotrimazole 1% Cream', 'Clotrimazole', 'Lotrimin', '1%', 'cream', 'topical', null, false, 'topical-antifungal', 'Apply to affected area twice daily'),
('Ciclopirox 0.77% Cream', 'Ciclopirox olamine', 'Loprox', '0.77%', 'cream', 'topical', null, false, 'topical-antifungal', 'Apply twice daily'),

-- Topical Immunomodulators
('Tacrolimus 0.1% Ointment', 'Tacrolimus', 'Protopic', '0.1%', 'ointment', 'topical', null, false, 'topical-immunomodulator', 'Apply thin layer twice daily'),
('Tacrolimus 0.03% Ointment', 'Tacrolimus', 'Protopic', '0.03%', 'ointment', 'topical', null, false, 'topical-immunomodulator', 'Apply thin layer twice daily'),
('Pimecrolimus 1% Cream', 'Pimecrolimus', 'Elidel', '1%', 'cream', 'topical', null, false, 'topical-immunomodulator', 'Apply thin layer twice daily'),

-- Topical Chemotherapy/Immunotherapy
('Fluorouracil 5% Cream', 'Fluorouracil', 'Efudex', '5%', 'cream', 'topical', null, false, 'topical-chemotherapy', 'Apply to lesions twice daily for 2-4 weeks as directed'),
('Imiquimod 5% Cream', 'Imiquimod', 'Aldara', '5%', 'cream', 'topical', null, false, 'topical-immunotherapy', 'Apply to lesions at bedtime 3-5 times per week as directed'),

-- Oral Antibiotics
('Doxycycline 100mg Capsule', 'Doxycycline hyclate', 'Vibramycin', '100mg', 'capsule', 'oral', null, false, 'oral-antibiotic', 'Take 1 capsule by mouth twice daily'),
('Doxycycline 50mg Capsule', 'Doxycycline hyclate', 'Vibramycin', '50mg', 'capsule', 'oral', null, false, 'oral-antibiotic', 'Take 1 capsule by mouth once or twice daily'),
('Minocycline 100mg Capsule', 'Minocycline HCl', 'Minocin', '100mg', 'capsule', 'oral', null, false, 'oral-antibiotic', 'Take 1 capsule by mouth twice daily'),
('Cephalexin 500mg Capsule', 'Cephalexin', 'Keflex', '500mg', 'capsule', 'oral', null, false, 'oral-antibiotic', 'Take 1 capsule by mouth 3-4 times daily'),

-- Oral Antifungals
('Terbinafine 250mg Tablet', 'Terbinafine HCl', 'Lamisil', '250mg', 'tablet', 'oral', null, false, 'oral-antifungal', 'Take 1 tablet by mouth once daily'),
('Fluconazole 150mg Tablet', 'Fluconazole', 'Diflucan', '150mg', 'tablet', 'oral', null, false, 'oral-antifungal', 'Take 1 tablet by mouth as a single dose'),
('Itraconazole 100mg Capsule', 'Itraconazole', 'Sporanox', '100mg', 'capsule', 'oral', null, false, 'oral-antifungal', 'Take 2 capsules by mouth twice daily'),

-- Oral Corticosteroids
('Prednisone 10mg Tablet', 'Prednisone', null, '10mg', 'tablet', 'oral', null, false, 'oral-steroid', 'Take as directed'),
('Prednisone 20mg Tablet', 'Prednisone', null, '20mg', 'tablet', 'oral', null, false, 'oral-steroid', 'Take as directed'),
('Methylprednisolone 4mg Tablet', 'Methylprednisolone', 'Medrol', '4mg', 'tablet', 'oral', null, false, 'oral-steroid', 'Take as directed in dose pack'),

-- Oral Retinoids (Controlled - iPLEDGE required)
('Isotretinoin 40mg Capsule', 'Isotretinoin', 'Accutane', '40mg', 'capsule', 'oral', null, false, 'oral-retinoid', 'Take 1 capsule by mouth twice daily with food'),
('Isotretinoin 20mg Capsule', 'Isotretinoin', 'Accutane', '20mg', 'capsule', 'oral', null, false, 'oral-retinoid', 'Take 1 capsule by mouth once or twice daily with food'),
('Acitretin 25mg Capsule', 'Acitretin', 'Soriatane', '25mg', 'capsule', 'oral', null, false, 'oral-retinoid', 'Take 1 capsule by mouth once daily with food'),

-- Immunosuppressants
('Methotrexate 2.5mg Tablet', 'Methotrexate', null, '2.5mg', 'tablet', 'oral', null, false, 'immunosuppressant', 'Take as directed once weekly'),
('Hydroxychloroquine 200mg Tablet', 'Hydroxychloroquine sulfate', 'Plaquenil', '200mg', 'tablet', 'oral', null, false, 'immunosuppressant', 'Take 1-2 tablets by mouth once or twice daily'),
('Cyclosporine 100mg Capsule', 'Cyclosporine', 'Neoral', '100mg', 'capsule', 'oral', null, false, 'immunosuppressant', 'Take as directed twice daily'),

-- Biologics (require special handling - typically administered in clinic or self-inject)
('Dupilumab 300mg Injection', 'Dupilumab', 'Dupixent', '300mg/2ml', 'injection', 'subcutaneous', null, false, 'biologic', 'Inject 300mg subcutaneously every 2 weeks'),
('Adalimumab 40mg Injection', 'Adalimumab', 'Humira', '40mg/0.8ml', 'injection', 'subcutaneous', null, false, 'biologic', 'Inject 40mg subcutaneously every 2 weeks'),
('Ustekinumab 45mg Injection', 'Ustekinumab', 'Stelara', '45mg/0.5ml', 'injection', 'subcutaneous', null, false, 'biologic', 'Inject as directed by provider');

-- Update timestamp for all inserted records
update medications set created_at = current_timestamp where created_at is null;
