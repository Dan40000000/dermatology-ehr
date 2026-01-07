-- Seed Laboratory Data
-- Realistic dermatology lab catalog and vendors

-- Insert Lab Vendors
insert into lab_vendors (tenant_id, name, vendor_type, lab_id, clia_number, phone, fax, street, city, state, zip, hl7_enabled, fhir_enabled, accepts_electronic_orders, supports_dermpath, supports_immunofluorescence, supports_molecular, supports_cultures, tat_hours, is_preferred, is_active)
values
  ('default', 'Quest Diagnostics', 'quest', 'QUEST-001', '11D0987654', '800-222-0446', '800-222-0447', '500 Plaza Drive', 'Secaucus', 'NJ', '07094', true, true, true, false, false, true, true, 24, true, true),
  ('default', 'LabCorp', 'labcorp', 'LABCORP-001', '34D1234567', '800-845-6167', '800-222-0447', '531 South Spring Street', 'Burlington', 'NC', '27215', true, true, true, false, false, true, true, 24, true, true),
  ('default', 'Dermatopathology Associates', 'local_pathology', 'DERMPATH-001', '05D0456789', '212-555-0199', '212-555-0198', '123 Medical Plaza', 'New York', 'NY', '10016', true, false, true, true, true, false, false, 72, true, true),
  ('default', 'Advanced Dermpath Laboratory', 'local_pathology', 'ADVDERM-001', '22D0654321', '617-555-0142', '617-555-0143', '789 Healthcare Blvd', 'Boston', 'MA', '02115', true, false, true, true, true, true, false, 96, false, true),
  ('default', 'National Reference Laboratory', 'reference_lab', 'NATREF-001', '45D9876543', '888-555-0100', '888-555-0101', '456 Lab Drive', 'San Diego', 'CA', '92121', true, true, true, false, false, true, true, 72, false, true);

-- Insert Lab Test Catalog - Chemistry/Blood Tests
insert into lab_test_catalog (tenant_id, vendor_id, test_code, loinc_code, cpt_code, test_name, short_name, category, subcategory, specimen_type, specimen_volume, specimen_container, collection_instructions, description, methodology, turnaround_time, reference_range_text, is_active, order_priority)
select
  'default',
  (select id from lab_vendors where name = 'Quest Diagnostics' limit 1),
  'CBC', '58410-2', '85025', 'Complete Blood Count with Differential', 'CBC w/Diff', 'hematology', 'routine', 'whole_blood', '3 mL', 'lavender_top', 'EDTA tube, gently invert 8-10 times', 'Complete blood count with automated differential', 'Automated cell counter', '24 hours', 'Age and gender specific', true, 10
union all select 'default', (select id from lab_vendors where name = 'Quest Diagnostics' limit 1), 'CMP', '24323-8', '80053', 'Comprehensive Metabolic Panel', 'CMP', 'chemistry', 'metabolic', 'serum', '3 mL', 'red_top', 'Fasting preferred but not required', 'Glucose, electrolytes, kidney and liver function', 'Chemistry analyzer', '24 hours', 'See individual components', true, 20
union all select 'default', (select id from lab_vendors where name = 'Quest Diagnostics' limit 1), 'LFT', '24325-3', '80076', 'Hepatic Function Panel', 'Liver Panel', 'chemistry', 'metabolic', 'serum', '3 mL', 'red_top', null, 'AST, ALT, Alk Phos, Total Bilirubin, Albumin, Total Protein', 'Chemistry analyzer', '24 hours', 'See individual components', true, 30
union all select 'default', (select id from lab_vendors where name = 'Quest Diagnostics' limit 1), 'LIPID', '57698-3', '80061', 'Lipid Panel', 'Lipids', 'chemistry', 'metabolic', 'serum', '3 mL', 'red_top', 'Fasting 12-14 hours required', 'Total cholesterol, LDL, HDL, Triglycerides', 'Chemistry analyzer', '24 hours', 'Total Chol <200 mg/dL', true, 40
union all select 'default', (select id from lab_vendors where name = 'Quest Diagnostics' limit 1), 'HBA1C', '4548-4', '83036', 'Hemoglobin A1C', 'A1C', 'chemistry', 'diabetes', 'whole_blood', '3 mL', 'lavender_top', 'No fasting required', 'Average blood glucose over 2-3 months', 'HPLC', '24 hours', '<5.7% normal, 5.7-6.4% prediabetes, >=6.5% diabetes', true, 50
union all select 'default', (select id from lab_vendors where name = 'Quest Diagnostics' limit 1), 'TSH', '3016-3', '84443', 'Thyroid Stimulating Hormone', 'TSH', 'chemistry', 'endocrine', 'serum', '2 mL', 'red_top', null, 'Screen for thyroid dysfunction', 'Immunoassay', '24 hours', '0.4-4.0 mIU/L', true, 60;

-- Insert Lab Test Catalog - Immunology/Autoimmune
insert into lab_test_catalog (tenant_id, vendor_id, test_code, loinc_code, cpt_code, test_name, short_name, category, subcategory, specimen_type, specimen_volume, specimen_container, description, methodology, turnaround_time, reference_range_text, is_active, order_priority)
select
  'default',
  (select id from lab_vendors where name = 'Quest Diagnostics' limit 1),
  'ANA', '5048-9', '86038', 'Antinuclear Antibody Screen', 'ANA Screen', 'immunology', 'autoimmune', 'serum', '2 mL', 'red_top', 'Screen for systemic autoimmune disease', 'Indirect immunofluorescence', '2-3 days', 'Negative or titer <1:40', true, 100
union all select 'default', (select id from lab_vendors where name = 'Quest Diagnostics' limit 1), 'ANA-IFA', '14611-4', '86039', 'ANA with Reflex to Titer and Pattern', 'ANA Reflex', 'immunology', 'autoimmune', 'serum', '2 mL', 'red_top', 'Comprehensive ANA testing with pattern identification', 'IFA with reflex', '2-3 days', 'Negative', true, 110
union all select 'default', (select id from lab_vendors where name = 'Quest Diagnostics' limit 1), 'ENA', '29374-6', '86235', 'Extractable Nuclear Antigen Panel', 'ENA Panel', 'immunology', 'autoimmune', 'serum', '2 mL', 'red_top', 'Specific antibodies for lupus, Sjogren, scleroderma, myositis', 'Multiplex immunoassay', '3-5 days', 'All components negative', true, 120
union all select 'default', (select id from lab_vendors where name = 'Quest Diagnostics' limit 1), 'DSDNA', '31348-8', '86225', 'Anti-Double Stranded DNA', 'Anti-dsDNA', 'immunology', 'autoimmune', 'serum', '2 mL', 'red_top', 'Highly specific for SLE', 'ELISA', '3-5 days', '<30 IU/mL negative', true, 130
union all select 'default', (select id from lab_vendors where name = 'Quest Diagnostics' limit 1), 'C3', '4485-9', '86160', 'Complement C3', 'C3', 'immunology', 'complement', 'serum', '2 mL', 'red_top', 'Complement system activity', 'Nephelometry', '2-3 days', '90-180 mg/dL', true, 140
union all select 'default', (select id from lab_vendors where name = 'Quest Diagnostics' limit 1), 'C4', '4498-2', '86161', 'Complement C4', 'C4', 'immunology', 'complement', 'serum', '2 mL', 'red_top', 'Complement system activity', 'Nephelometry', '2-3 days', '10-40 mg/dL', true, 150;

-- Insert Lab Test Catalog - Dermatopathology
insert into lab_test_catalog (tenant_id, vendor_id, test_code, loinc_code, cpt_code, test_name, short_name, category, subcategory, specimen_type, specimen_volume, specimen_container, collection_instructions, description, methodology, turnaround_time, is_dermpath, is_active, order_priority)
select
  'default',
  (select id from lab_vendors where name = 'Dermatopathology Associates' limit 1),
  'SKINBX', '11526-1', '88305', 'Skin Biopsy - Routine', 'Skin Biopsy', 'pathology', 'dermpath', 'skin_biopsy', 'tissue', 'formalin', 'Place specimen in 10% formalin immediately', 'Routine H&E staining and microscopic examination', 'Light microscopy', '3-5 days', true, true, 200
union all select 'default', (select id from lab_vendors where name = 'Dermatopathology Associates' limit 1), 'SKINBX-COMPLEX', '11526-1', '88307', 'Skin Biopsy - Complex', 'Skin Bx Complex', 'pathology', 'dermpath', 'skin_biopsy', 'tissue', 'formalin', 'Submit entire specimen in formalin', 'Complex specimen requiring extensive examination', 'Light microscopy', '5-7 days', true, true, 210
union all select 'default', (select id from lab_vendors where name = 'Dermatopathology Associates' limit 1), 'SKINBX-MARGINS', '11526-1', '88309', 'Skin Excision with Margins', 'Excision Margins', 'pathology', 'dermpath', 'skin_biopsy', 'tissue', 'formalin', 'Orient specimen with sutures as indicated', 'Evaluation of surgical margins', 'Light microscopy', '5-7 days', true, true, 220;

-- Insert Lab Test Catalog - Immunofluorescence
insert into lab_test_catalog (tenant_id, vendor_id, test_code, loinc_code, cpt_code, test_name, short_name, category, subcategory, specimen_type, specimen_volume, specimen_container, collection_instructions, description, methodology, turnaround_time, is_immunofluorescence, is_active, order_priority)
select
  'default',
  (select id from lab_vendors where name = 'Dermatopathology Associates' limit 1),
  'DIF', '11529-5', '88346', 'Direct Immunofluorescence', 'DIF', 'pathology', 'immunofluorescence', 'skin_biopsy', 'tissue', 'michel_transport', 'Use Michel transport medium, NOT formalin', 'Detect immune deposits in skin (IgG, IgA, IgM, C3, Fibrinogen)', 'Direct immunofluorescence', '5-7 days', true, true, 300
union all select 'default', (select id from lab_vendors where name = 'Dermatopathology Associates' limit 1), 'IIF-PEM', '11530-3', '86225', 'Indirect IF - Pemphigus', 'IIF Pemphigus', 'immunology', 'immunofluorescence', 'serum', '2 mL', 'red_top', null, 'Circulating pemphigus antibodies', 'Indirect immunofluorescence', '5-7 days', true, true, 310
union all select 'default', (select id from lab_vendors where name = 'Dermatopathology Associates' limit 1), 'IIF-BP', '11531-1', '86225', 'Indirect IF - Bullous Pemphigoid', 'IIF BP', 'immunology', 'immunofluorescence', 'serum', '2 mL', 'red_top', null, 'Circulating BP180/BP230 antibodies', 'Indirect immunofluorescence', '5-7 days', true, true, 320;

-- Insert Lab Test Catalog - Microbiology/Cultures
insert into lab_test_catalog (tenant_id, vendor_id, test_code, loinc_code, cpt_code, test_name, short_name, category, subcategory, specimen_type, specimen_volume, specimen_container, collection_instructions, description, methodology, turnaround_time, is_culture, is_active, order_priority)
select
  'default',
  (select id from lab_vendors where name = 'Quest Diagnostics' limit 1),
  'FUNGAL', '6462-1', '87102', 'Fungal Culture', 'Fungal Cx', 'microbiology', 'culture', 'swab', null, 'culture_swab', 'Collect specimen before antifungal treatment', 'Culture for dermatophytes and yeast', 'Culture with identification', '7-14 days', true, true, 400
union all select 'default', (select id from lab_vendors where name = 'Quest Diagnostics' limit 1), 'KOH', '6464-7', '87220', 'KOH Preparation', 'KOH Prep', 'microbiology', 'microscopy', 'skin_scraping', null, 'sterile_container', 'Scrape leading edge of lesion', 'Direct microscopy for fungal elements', 'KOH microscopy', '24 hours', false, true, 410
union all select 'default', (select id from lab_vendors where name = 'Quest Diagnostics' limit 1), 'BACT-CX', '600-7', '87070', 'Bacterial Culture, Skin', 'Skin Culture', 'microbiology', 'culture', 'swab', null, 'culture_swab', 'Clean area gently, collect from active lesion', 'Bacterial identification and sensitivity', 'Culture with susceptibility', '3-5 days', true, true, 420
union all select 'default', (select id from lab_vendors where name = 'Quest Diagnostics' limit 1), 'GRAMSTAIN', '664-3', '87205', 'Gram Stain', 'Gram Stain', 'microbiology', 'microscopy', 'swab', null, 'culture_swab', null, 'Rapid bacterial identification', 'Gram stain microscopy', '24 hours', false, true, 430
union all select 'default', (select id from lab_vendors where name = 'Quest Diagnostics' limit 1), 'VIRAL-CX', '43414-0', '87252', 'Viral Culture - HSV/VZV', 'Viral Culture', 'microbiology', 'culture', 'swab', null, 'viral_transport', 'Collect from fresh vesicle, use viral transport media', 'Culture for herpes simplex and varicella-zoster', 'Viral culture', '5-7 days', true, true, 440
union all select 'default', (select id from lab_vendors where name = 'Quest Diagnostics' limit 1), 'TZANCK', '11534-5', '88160', 'Tzanck Preparation', 'Tzanck', 'microbiology', 'microscopy', 'vesicle_fluid', null, 'glass_slide', 'Unroof fresh vesicle, scrape base', 'Cytology for viral changes', 'Cytology', '24 hours', false, true, 450;

-- Insert Lab Test Catalog - Molecular/Genetic Testing
insert into lab_test_catalog (tenant_id, vendor_id, test_code, loinc_code, cpt_code, test_name, short_name, category, subcategory, specimen_type, specimen_container, description, methodology, turnaround_time, requires_prior_auth, is_molecular, is_active, order_priority)
select
  'default',
  (select id from lab_vendors where name = 'National Reference Laboratory' limit 1),
  'BRAF-V600E', '81210-1', '81210', 'BRAF V600E Mutation Analysis', 'BRAF Mutation', 'molecular', 'oncology', 'tissue', 'formalin', 'Melanoma mutation testing for targeted therapy', 'PCR/Sequencing', '7-10 days', true, true, true, 500
union all select 'default', (select id from lab_vendors where name = 'National Reference Laboratory' limit 1), 'NRAS', '81311-7', '81311', 'NRAS Gene Analysis', 'NRAS', 'molecular', 'oncology', 'tissue', 'formalin', 'Melanoma mutation analysis', 'PCR/Sequencing', '7-10 days', true, true, true, 510
union all select 'default', (select id from lab_vendors where name = 'National Reference Laboratory' limit 1), 'SCABIES-PCR', '92820-5', '87999', 'Scabies PCR', 'Scabies PCR', 'molecular', 'parasitology', 'skin_scraping', 'sterile_container', 'Molecular detection of Sarcoptes scabiei', 'Real-time PCR', '3-5 days', false, true, true, 520;

-- Insert Common Lab Order Sets
insert into lab_order_sets (tenant_id, name, description, category, indication, frequency_recommendation, is_active, is_default)
values
  ('default', 'Baseline Labs - Healthy Adult', 'Standard baseline laboratory evaluation', 'baseline_screening', 'Annual physical examination or new patient workup', 'Annually', true, true),
  ('default', 'Biologic Therapy Baseline', 'Pre-treatment labs for biologic therapy', 'biologics_monitoring', 'Before starting TNF inhibitors, IL inhibitors, or other biologics', 'Before starting therapy', true, false),
  ('default', 'Biologic Therapy Monitoring', 'Routine monitoring during biologic therapy', 'biologics_monitoring', 'Ongoing monitoring of patients on biologic therapy', 'Every 3 months', true, false),
  ('default', 'Isotretinoin Baseline', 'Pre-treatment labs for isotretinoin (Accutane)', 'medication_monitoring', 'Before starting isotretinoin for acne', 'Before starting therapy', true, false),
  ('default', 'Isotretinoin Monthly Monitoring', 'Monthly monitoring during isotretinoin therapy', 'medication_monitoring', 'Monthly labs while on isotretinoin', 'Monthly', true, false),
  ('default', 'Methotrexate Baseline', 'Pre-treatment labs for methotrexate', 'medication_monitoring', 'Before starting methotrexate', 'Before starting therapy', true, false),
  ('default', 'Methotrexate Monitoring', 'Routine monitoring for methotrexate therapy', 'medication_monitoring', 'Monitoring during methotrexate therapy', 'Every 4-8 weeks', true, false),
  ('default', 'Lupus Workup', 'Comprehensive autoimmune evaluation for suspected lupus', 'autoimmune_workup', 'Suspected systemic lupus erythematosus', 'As needed', true, false),
  ('default', 'Dermatomyositis Workup', 'Labs for suspected dermatomyositis', 'autoimmune_workup', 'Suspected inflammatory myopathy', 'As needed', true, false),
  ('default', 'Blistering Disease Workup', 'Evaluation for autoimmune blistering disorders', 'autoimmune_workup', 'Suspected pemphigus or pemphigoid', 'As needed', true, false);

-- Link tests to order sets
-- Baseline Labs - Healthy Adult
insert into lab_order_set_tests (order_set_id, test_id, is_required, display_order)
select
  (select id from lab_order_sets where name = 'Baseline Labs - Healthy Adult'),
  (select id from lab_test_catalog where test_code = 'CBC'),
  true, 1
union all select (select id from lab_order_sets where name = 'Baseline Labs - Healthy Adult'), (select id from lab_test_catalog where test_code = 'CMP'), true, 2
union all select (select id from lab_order_sets where name = 'Baseline Labs - Healthy Adult'), (select id from lab_test_catalog where test_code = 'LIPID'), true, 3
union all select (select id from lab_order_sets where name = 'Baseline Labs - Healthy Adult'), (select id from lab_test_catalog where test_code = 'TSH'), false, 4;

-- Biologic Therapy Baseline
insert into lab_order_set_tests (order_set_id, test_id, is_required, display_order)
select
  (select id from lab_order_sets where name = 'Biologic Therapy Baseline'),
  (select id from lab_test_catalog where test_code = 'CBC'),
  true, 1
union all select (select id from lab_order_sets where name = 'Biologic Therapy Baseline'), (select id from lab_test_catalog where test_code = 'CMP'), true, 2
union all select (select id from lab_order_sets where name = 'Biologic Therapy Baseline'), (select id from lab_test_catalog where test_code = 'LFT'), true, 3;

-- Biologic Therapy Monitoring
insert into lab_order_set_tests (order_set_id, test_id, is_required, display_order)
select
  (select id from lab_order_sets where name = 'Biologic Therapy Monitoring'),
  (select id from lab_test_catalog where test_code = 'CBC'),
  true, 1
union all select (select id from lab_order_sets where name = 'Biologic Therapy Monitoring'), (select id from lab_test_catalog where test_code = 'LFT'), true, 2;

-- Isotretinoin Baseline
insert into lab_order_set_tests (order_set_id, test_id, is_required, display_order)
select
  (select id from lab_order_sets where name = 'Isotretinoin Baseline'),
  (select id from lab_test_catalog where test_code = 'CBC'),
  true, 1
union all select (select id from lab_order_sets where name = 'Isotretinoin Baseline'), (select id from lab_test_catalog where test_code = 'LFT'), true, 2
union all select (select id from lab_order_sets where name = 'Isotretinoin Baseline'), (select id from lab_test_catalog where test_code = 'LIPID'), true, 3;

-- Isotretinoin Monthly Monitoring
insert into lab_order_set_tests (order_set_id, test_id, is_required, display_order)
select
  (select id from lab_order_sets where name = 'Isotretinoin Monthly Monitoring'),
  (select id from lab_test_catalog where test_code = 'LFT'),
  true, 1
union all select (select id from lab_order_sets where name = 'Isotretinoin Monthly Monitoring'), (select id from lab_test_catalog where test_code = 'LIPID'), true, 2;

-- Methotrexate Baseline
insert into lab_order_set_tests (order_set_id, test_id, is_required, display_order)
select
  (select id from lab_order_sets where name = 'Methotrexate Baseline'),
  (select id from lab_test_catalog where test_code = 'CBC'),
  true, 1
union all select (select id from lab_order_sets where name = 'Methotrexate Baseline'), (select id from lab_test_catalog where test_code = 'CMP'), true, 2
union all select (select id from lab_order_sets where name = 'Methotrexate Baseline'), (select id from lab_test_catalog where test_code = 'LFT'), true, 3;

-- Methotrexate Monitoring
insert into lab_order_set_tests (order_set_id, test_id, is_required, display_order)
select
  (select id from lab_order_sets where name = 'Methotrexate Monitoring'),
  (select id from lab_test_catalog where test_code = 'CBC'),
  true, 1
union all select (select id from lab_order_sets where name = 'Methotrexate Monitoring'), (select id from lab_test_catalog where test_code = 'LFT'), true, 2;

-- Lupus Workup
insert into lab_order_set_tests (order_set_id, test_id, is_required, display_order)
select
  (select id from lab_order_sets where name = 'Lupus Workup'),
  (select id from lab_test_catalog where test_code = 'CBC'),
  true, 1
union all select (select id from lab_order_sets where name = 'Lupus Workup'), (select id from lab_test_catalog where test_code = 'CMP'), true, 2
union all select (select id from lab_order_sets where name = 'Lupus Workup'), (select id from lab_test_catalog where test_code = 'ANA-IFA'), true, 3
union all select (select id from lab_order_sets where name = 'Lupus Workup'), (select id from lab_test_catalog where test_code = 'ENA'), true, 4
union all select (select id from lab_order_sets where name = 'Lupus Workup'), (select id from lab_test_catalog where test_code = 'DSDNA'), true, 5
union all select (select id from lab_order_sets where name = 'Lupus Workup'), (select id from lab_test_catalog where test_code = 'C3'), true, 6
union all select (select id from lab_order_sets where name = 'Lupus Workup'), (select id from lab_test_catalog where test_code = 'C4'), true, 7;

-- Blistering Disease Workup
insert into lab_order_set_tests (order_set_id, test_id, is_required, display_order)
select
  (select id from lab_order_sets where name = 'Blistering Disease Workup'),
  (select id from lab_test_catalog where test_code = 'DIF'),
  true, 1
union all select (select id from lab_order_sets where name = 'Blistering Disease Workup'), (select id from lab_test_catalog where test_code = 'IIF-PEM'), false, 2
union all select (select id from lab_order_sets where name = 'Blistering Disease Workup'), (select id from lab_test_catalog where test_code = 'IIF-BP'), false, 3;
