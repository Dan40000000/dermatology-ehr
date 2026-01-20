import { pool } from './pool';
import crypto from 'crypto';

interface ProtocolData {
  name: string;
  category: 'medical' | 'procedure' | 'cosmetic' | 'administrative';
  type: string;
  description: string;
  indication: string;
  contraindications?: string;
  steps: {
    step_number: number;
    title: string;
    description?: string;
    action_type: string;
    medication_name?: string;
    medication_dosage?: string;
    medication_frequency?: string;
    medication_duration?: string;
    procedure_code?: string;
    procedure_instructions?: string;
    order_codes?: string[];
    timing?: string;
    duration_days?: number;
    monitoring_required?: string;
    side_effects?: string;
    warnings?: string;
    decision_criteria?: string;
    follow_up?: string;
  }[];
}

const dermatologyProtocols: ProtocolData[] = [
  // ==================== MEDICAL DERMATOLOGY ====================
  {
    name: 'Acne Treatment Ladder',
    category: 'medical',
    type: 'acne_treatment',
    description: 'Step-wise approach to acne treatment from mild to severe',
    indication: 'Patients with acne vulgaris of any severity',
    contraindications: 'Pregnancy (for isotretinoin), severe depression history',
    steps: [
      {
        step_number: 1,
        title: 'Initial Assessment',
        description: 'Assess acne severity, type, and patient factors',
        action_type: 'assessment',
        timing: 'Week 0',
      },
      {
        step_number: 2,
        title: 'Mild Acne: Topical Retinoid',
        description: 'Start topical retinoid for comedonal and mild inflammatory acne',
        action_type: 'medication',
        medication_name: 'Tretinoin 0.025% gel',
        medication_dosage: 'Apply pea-sized amount',
        medication_frequency: 'Once daily at bedtime',
        medication_duration: '12 weeks',
        timing: 'Week 0-12',
        side_effects: 'Dryness, irritation, photosensitivity',
        warnings: 'Avoid in pregnancy. Use sunscreen daily.',
      },
      {
        step_number: 3,
        title: 'Add Benzoyl Peroxide',
        description: 'If inflammatory lesions present, add benzoyl peroxide',
        action_type: 'medication',
        medication_name: 'Benzoyl Peroxide 5% gel',
        medication_dosage: 'Apply to affected areas',
        medication_frequency: 'Once daily in morning',
        medication_duration: '12 weeks',
        timing: 'Week 0-12',
        side_effects: 'Bleaching of fabrics, dryness',
      },
      {
        step_number: 4,
        title: 'Moderate Acne: Oral Antibiotic',
        description: 'If no improvement after 12 weeks, add oral antibiotic',
        action_type: 'medication',
        medication_name: 'Doxycycline',
        medication_dosage: '100mg',
        medication_frequency: 'Twice daily',
        medication_duration: '12-16 weeks',
        timing: 'Week 12-28',
        side_effects: 'Photosensitivity, GI upset, yeast infections',
        warnings: 'Avoid in pregnancy. Use sunscreen. Limit to 3-4 months.',
      },
      {
        step_number: 5,
        title: 'Severe Acne: Consider Isotretinoin',
        description: 'For severe nodular/cystic acne or treatment-resistant moderate acne',
        action_type: 'decision_point',
        timing: 'Week 28+',
        decision_criteria: 'If failed oral antibiotics, severe scarring, or nodular acne',
      },
      {
        step_number: 6,
        title: 'Pre-Isotretinoin Workup',
        description: 'Required labs and counseling before starting isotretinoin',
        action_type: 'lab_order',
        order_codes: ['CBC', 'CMP', 'Lipid Panel', 'Pregnancy Test (females)'],
        timing: 'Before isotretinoin',
        monitoring_required: 'Monthly pregnancy tests, lipids every 2-3 months',
      },
      {
        step_number: 7,
        title: 'Isotretinoin Therapy',
        description: 'Start isotretinoin per iPLEDGE protocol',
        action_type: 'medication',
        medication_name: 'Isotretinoin (Accutane)',
        medication_dosage: '0.5-1 mg/kg/day',
        medication_frequency: 'Daily with food',
        medication_duration: '20 weeks (cumulative 120-150 mg/kg)',
        timing: 'Week 28-48',
        side_effects: 'Dry skin, lips, eyes; elevated lipids; mood changes',
        warnings: 'ABSOLUTE CONTRAINDICATION IN PREGNANCY. Requires iPLEDGE enrollment. Monitor for depression.',
      },
    ],
  },
  {
    name: 'Psoriasis Treatment Algorithm',
    category: 'medical',
    type: 'psoriasis_algorithm',
    description: 'Step-wise management of plaque psoriasis from topicals to biologics',
    indication: 'Patients with plaque psoriasis',
    contraindications: 'Active infection, live vaccines (for biologics), untreated TB',
    steps: [
      {
        step_number: 1,
        title: 'Assess Disease Severity',
        description: 'Calculate BSA, PASI score, evaluate impact on quality of life',
        action_type: 'assessment',
        timing: 'Week 0',
      },
      {
        step_number: 2,
        title: 'Mild Psoriasis: Topical Steroids',
        description: 'For BSA <3%, start with topical corticosteroids',
        action_type: 'medication',
        medication_name: 'Triamcinolone 0.1% ointment',
        medication_dosage: 'Apply thin layer',
        medication_frequency: 'Twice daily',
        medication_duration: '2-4 weeks',
        timing: 'Week 0-4',
        side_effects: 'Skin atrophy, striae, tachyphylaxis',
        warnings: 'Limit high-potency steroids to 2-4 weeks. Use mid-potency for maintenance.',
      },
      {
        step_number: 3,
        title: 'Add Vitamin D Analog',
        description: 'Combine with calcipotriene for improved efficacy',
        action_type: 'medication',
        medication_name: 'Calcipotriene 0.005% ointment',
        medication_dosage: 'Apply to plaques',
        medication_frequency: 'Once or twice daily',
        medication_duration: 'Ongoing',
        timing: 'Week 0+',
        side_effects: 'Irritation, hypercalcemia (rare)',
      },
      {
        step_number: 4,
        title: 'Moderate Psoriasis: Phototherapy',
        description: 'For BSA 3-10% or failed topicals',
        action_type: 'procedure',
        procedure_code: '96912',
        procedure_instructions: 'NB-UVB phototherapy 3x/week, starting dose based on skin type',
        timing: 'Week 4-16',
        duration_days: 84,
        monitoring_required: 'Skin exams for skin cancer risk',
      },
      {
        step_number: 5,
        title: 'Severe Psoriasis: Systemic Therapy',
        description: 'For BSA >10% or significant QOL impact',
        action_type: 'decision_point',
        decision_criteria: 'Failed phototherapy or extensive disease',
        timing: 'Week 16+',
      },
      {
        step_number: 6,
        title: 'Pre-Biologic Screening',
        description: 'Required screening before starting biologic therapy',
        action_type: 'lab_order',
        order_codes: ['CBC', 'CMP', 'Hepatitis Panel', 'Quantiferon-TB Gold', 'HIV'],
        monitoring_required: 'TB test, hepatitis screening, pregnancy test',
      },
      {
        step_number: 7,
        title: 'Start TNF Inhibitor',
        description: 'First-line biologic for moderate-severe psoriasis',
        action_type: 'medication',
        medication_name: 'Adalimumab (Humira)',
        medication_dosage: '80mg initial, then 40mg',
        medication_frequency: 'Every 2 weeks',
        medication_duration: 'Ongoing',
        timing: 'Week 16+',
        side_effects: 'Injection site reactions, infection risk, malignancy risk',
        warnings: 'Screen for TB. Monitor for infections. Avoid live vaccines.',
      },
      {
        step_number: 8,
        title: 'Consider IL-17 or IL-23 Inhibitor',
        description: 'If inadequate response to TNF inhibitor after 12-16 weeks',
        action_type: 'medication',
        medication_name: 'Secukinumab (Cosentyx) or Guselkumab (Tremfya)',
        medication_dosage: 'Per package insert',
        medication_frequency: 'Per package insert',
        medication_duration: 'Ongoing',
        timing: 'If needed',
        monitoring_required: 'PASI score every 3 months',
      },
    ],
  },
  {
    name: 'Atopic Dermatitis Management',
    category: 'medical',
    type: 'atopic_dermatitis',
    description: 'Step-wise treatment of atopic dermatitis from moisturizers to dupilumab',
    indication: 'Patients with atopic dermatitis (eczema)',
    contraindications: 'None for topicals; infection concerns for immunosuppressants',
    steps: [
      {
        step_number: 1,
        title: 'Baseline Assessment',
        description: 'Assess severity using EASI or SCORAD, identify triggers',
        action_type: 'assessment',
        timing: 'Week 0',
      },
      {
        step_number: 2,
        title: 'Foundation: Moisturizers',
        description: 'Daily emollients are the foundation of all eczema treatment. Apply thick moisturizer (Vanicream, CeraVe) at least twice daily, especially after bathing.',
        action_type: 'patient_instruction',
        timing: 'Ongoing',
      },
      {
        step_number: 3,
        title: 'Mild-Moderate: Topical Steroids',
        description: 'Use appropriate potency based on location and severity',
        action_type: 'medication',
        medication_name: 'Triamcinolone 0.1% cream (body) or Hydrocortisone 2.5% (face)',
        medication_dosage: 'Apply thin layer',
        medication_frequency: 'Twice daily to active areas',
        medication_duration: '2 weeks, then taper',
        timing: 'Week 0-2',
        side_effects: 'Skin atrophy, telangiectasia',
        warnings: 'Use low-potency on face. Avoid prolonged use.',
      },
      {
        step_number: 4,
        title: 'Steroid-Sparing: Topical Calcineurin Inhibitors',
        description: 'For maintenance and steroid-sensitive areas',
        action_type: 'medication',
        medication_name: 'Tacrolimus 0.1% ointment',
        medication_dosage: 'Apply to affected areas',
        medication_frequency: 'Twice daily',
        medication_duration: 'Ongoing as needed',
        timing: 'Week 2+',
        side_effects: 'Burning, stinging (usually improves)',
        warnings: 'FDA black box warning (theoretical cancer risk not proven in practice)',
      },
      {
        step_number: 5,
        title: 'Moderate-Severe: Phototherapy',
        description: 'Consider for widespread disease',
        action_type: 'procedure',
        procedure_code: '96912',
        procedure_instructions: 'NB-UVB phototherapy 2-3x/week',
        timing: 'Week 4-12',
      },
      {
        step_number: 6,
        title: 'Severe AD: Dupilumab',
        description: 'IL-4/IL-13 inhibitor for moderate-severe atopic dermatitis',
        action_type: 'medication',
        medication_name: 'Dupilumab (Dupixent)',
        medication_dosage: '600mg loading, then 300mg',
        medication_frequency: 'Every 2 weeks',
        medication_duration: 'Ongoing',
        timing: 'If failed conventional therapy',
        side_effects: 'Injection site reactions, conjunctivitis, herpes infections',
        monitoring_required: 'Monitor for conjunctivitis, herpes outbreaks',
      },
    ],
  },
  {
    name: 'Melanoma Surveillance Schedule',
    category: 'medical',
    type: 'melanoma_surveillance',
    description: 'Follow-up schedule for melanoma patients based on stage',
    indication: 'Post-treatment melanoma patients',
    contraindications: 'None',
    steps: [
      {
        step_number: 1,
        title: 'Stage 0 (In Situ): Annual Exams',
        description: 'Low-risk patients need annual full-body skin exams',
        action_type: 'observation',
        timing: 'Annually',
        monitoring_required: 'Full-body skin exam, lymph node exam',
      },
      {
        step_number: 2,
        title: 'Stage I-II: Every 6 Months',
        description: 'Moderate-risk patients need closer surveillance',
        action_type: 'observation',
        timing: 'Every 6 months for 5 years, then annually',
        monitoring_required: 'Full-body skin exam, lymph node exam, patient education on self-exams',
      },
      {
        step_number: 3,
        title: 'Stage III-IV: Every 3-4 Months',
        description: 'High-risk patients need intensive surveillance',
        action_type: 'observation',
        timing: 'Every 3-4 months for 2 years, then every 6 months',
        monitoring_required: 'Full-body exam, lymph node exam, imaging per NCCN guidelines',
      },
      {
        step_number: 4,
        title: 'Imaging for High-Risk',
        description: 'PET/CT or CT scans for stage III-IV',
        action_type: 'imaging',
        timing: 'Every 6-12 months based on stage',
        order_codes: ['PET/CT', 'CT Chest/Abd/Pelvis', 'Brain MRI if indicated'],
      },
    ],
  },
  {
    name: 'Pre-Biologic Workup Protocol',
    category: 'medical',
    type: 'pre_biologic_workup',
    description: 'Required screening before starting biologic therapy',
    indication: 'Patients being considered for biologic therapy (psoriasis, eczema, etc.)',
    contraindications: 'Active infection, untreated latent TB',
    steps: [
      {
        step_number: 1,
        title: 'Tuberculosis Screening',
        description: 'Screen for latent and active TB',
        action_type: 'lab_order',
        order_codes: ['Quantiferon-TB Gold', 'Chest X-ray'],
        timing: 'Before starting biologic',
      },
      {
        step_number: 2,
        title: 'Hepatitis Panel',
        description: 'Check hepatitis B and C status',
        action_type: 'lab_order',
        order_codes: ['Hepatitis B surface antigen', 'Hepatitis B core antibody', 'Hepatitis C antibody'],
        timing: 'Before starting biologic',
      },
      {
        step_number: 3,
        title: 'Complete Blood Count',
        description: 'Baseline CBC',
        action_type: 'lab_order',
        order_codes: ['CBC with differential'],
        timing: 'Before starting biologic',
      },
      {
        step_number: 4,
        title: 'Comprehensive Metabolic Panel',
        description: 'Baseline kidney and liver function',
        action_type: 'lab_order',
        order_codes: ['CMP'],
        timing: 'Before starting biologic',
      },
      {
        step_number: 5,
        title: 'Pregnancy Test',
        description: 'For females of childbearing potential',
        action_type: 'lab_order',
        order_codes: ['Urine or serum hCG'],
        timing: 'Before starting biologic',
      },
      {
        step_number: 6,
        title: 'Update Vaccinations',
        description: 'Complete all vaccinations before starting immunosuppression',
        action_type: 'patient_instruction',
        timing: 'Before starting biologic',
        warnings: 'NO LIVE VACCINES after starting biologic. Complete flu, pneumonia, shingles vaccines beforehand.',
      },
    ],
  },
  {
    name: 'Isotretinoin (Accutane) Protocol',
    category: 'medical',
    type: 'isotretinoin_protocol',
    description: 'Complete iPLEDGE-compliant isotretinoin management',
    indication: 'Severe nodular acne, treatment-resistant moderate acne',
    contraindications: 'PREGNANCY (Category X), severe depression/suicidal ideation',
    steps: [
      {
        step_number: 1,
        title: 'iPLEDGE Enrollment',
        description: 'Enroll patient, prescriber, and pharmacy in iPLEDGE program',
        action_type: 'patient_instruction',
        timing: 'Before prescribing',
        warnings: 'MANDATORY for all isotretinoin prescriptions in USA',
      },
      {
        step_number: 2,
        title: 'Baseline Labs',
        description: 'Required baseline laboratory tests',
        action_type: 'lab_order',
        order_codes: ['CBC', 'CMP', 'Lipid Panel', 'Pregnancy Test (2 negative tests required for females)'],
        timing: 'Week 0',
      },
      {
        step_number: 3,
        title: 'Contraception Counseling',
        description: 'For females: TWO forms of contraception required',
        action_type: 'patient_instruction',
        timing: 'Before starting',
        warnings: 'Must use 2 forms of contraception starting 1 month before, during, and 1 month after treatment',
      },
      {
        step_number: 4,
        title: 'Depression Screening',
        description: 'Screen for depression, suicidal ideation',
        action_type: 'assessment',
        timing: 'Before starting and monthly',
        warnings: 'Monitor closely for mood changes, depression, suicidal thoughts',
      },
      {
        step_number: 5,
        title: 'Start Isotretinoin',
        description: 'Begin isotretinoin therapy',
        action_type: 'medication',
        medication_name: 'Isotretinoin (Claravis, Absorica, etc.)',
        medication_dosage: '0.5-1 mg/kg/day (typically 40-80mg/day)',
        medication_frequency: 'Once or twice daily with food',
        medication_duration: '5-6 months (cumulative 120-150 mg/kg)',
        timing: 'Month 1-6',
        side_effects: 'Dry skin/lips/eyes, photosensitivity, elevated lipids, elevated LFTs, mood changes',
        warnings: 'Absolute contraindication in pregnancy. Monitor lipids and LFTs monthly.',
      },
      {
        step_number: 6,
        title: 'Monthly Pregnancy Tests',
        description: 'Required monthly pregnancy test for females',
        action_type: 'lab_order',
        order_codes: ['Urine hCG'],
        timing: 'Monthly during treatment',
      },
      {
        step_number: 7,
        title: 'Monthly Lab Monitoring',
        description: 'Monitor for side effects',
        action_type: 'lab_order',
        order_codes: ['CBC', 'CMP', 'Lipid Panel'],
        timing: 'Every 4-8 weeks',
        monitoring_required: 'Watch for elevated triglycerides, LFTs, or low WBC',
      },
      {
        step_number: 8,
        title: 'iPLEDGE Monthly Attestation',
        description: 'Patient must answer questions monthly in iPLEDGE system',
        action_type: 'patient_instruction',
        timing: 'Monthly',
        warnings: 'Failure to complete monthly attestation will block prescription',
      },
    ],
  },
  {
    name: 'Methotrexate Monitoring Protocol',
    category: 'medical',
    type: 'methotrexate_monitoring',
    description: 'Lab monitoring schedule for patients on methotrexate',
    indication: 'Patients on methotrexate for psoriasis or other dermatologic conditions',
    contraindications: 'Pregnancy, breastfeeding, severe liver/kidney disease, immunodeficiency',
    steps: [
      {
        step_number: 1,
        title: 'Baseline Labs',
        description: 'Complete baseline testing before starting',
        action_type: 'lab_order',
        order_codes: ['CBC', 'CMP', 'Hepatitis Panel', 'Pregnancy Test'],
        timing: 'Before starting',
      },
      {
        step_number: 2,
        title: 'Start Methotrexate',
        description: 'Begin low-dose methotrexate with folic acid',
        action_type: 'medication',
        medication_name: 'Methotrexate 7.5-25mg + Folic Acid 1mg',
        medication_dosage: 'Start 7.5-15mg methotrexate',
        medication_frequency: 'Weekly (methotrexate), Daily (folic acid)',
        medication_duration: 'Ongoing',
        timing: 'Week 1+',
        side_effects: 'Nausea, fatigue, elevated LFTs, bone marrow suppression',
        warnings: 'AVOID ALCOHOL. Take folic acid daily to reduce side effects. Contraindicated in pregnancy.',
      },
      {
        step_number: 3,
        title: 'Weekly Monitoring (First Month)',
        description: 'Monitor closely during first month',
        action_type: 'lab_order',
        order_codes: ['CBC', 'CMP'],
        timing: 'Weekly x 4 weeks',
      },
      {
        step_number: 4,
        title: 'Monthly Monitoring (Months 2-3)',
        description: 'Continue frequent monitoring',
        action_type: 'lab_order',
        order_codes: ['CBC', 'CMP'],
        timing: 'Monthly for 2 months',
      },
      {
        step_number: 5,
        title: 'Every 3 Month Monitoring (Stable)',
        description: 'Once stable, monitor every 3 months',
        action_type: 'lab_order',
        order_codes: ['CBC', 'CMP'],
        timing: 'Every 3 months once stable',
        monitoring_required: 'Watch for elevated AST/ALT, low WBC/platelets',
      },
    ],
  },

  // ==================== PROCEDURE PROTOCOLS ====================
  {
    name: 'Skin Biopsy Protocol',
    category: 'procedure',
    type: 'biopsy_protocol',
    description: 'Standard approach to skin biopsies including technique selection',
    indication: 'Any suspicious or diagnostic skin lesion',
    contraindications: 'Bleeding disorder, anticoagulation (relative)',
    steps: [
      {
        step_number: 1,
        title: 'Consent and Site Preparation',
        description: 'Obtain informed consent, prep site with alcohol or chlorhexidine',
        action_type: 'procedure',
        timing: 'Before biopsy',
      },
      {
        step_number: 2,
        title: 'Select Biopsy Technique',
        description: 'Choose technique based on lesion type',
        action_type: 'decision_point',
        decision_criteria: 'Punch: small lesions, inflammatory. Shave: raised lesions. Excisional: large or melanoma concern',
      },
      {
        step_number: 3,
        title: 'Anesthesia',
        description: 'Infiltrate with 1% lidocaine with epinephrine',
        action_type: 'procedure',
        warnings: 'Avoid epinephrine on digits, ears, nose, penis',
      },
      {
        step_number: 4,
        title: 'Perform Biopsy',
        description: 'Execute chosen biopsy technique',
        action_type: 'procedure',
        procedure_code: '11102-11107',
        procedure_instructions: 'Punch: twist and cut. Shave: horizontal blade angle. Excisional: fusiform excision',
      },
      {
        step_number: 5,
        title: 'Hemostasis',
        description: 'Achieve hemostasis',
        action_type: 'procedure',
        procedure_instructions: 'Aluminum chloride, cautery, or sutures as needed',
      },
      {
        step_number: 6,
        title: 'Specimen Handling',
        description: 'Place specimen in formalin, label correctly',
        action_type: 'procedure',
        warnings: 'Melanoma specimens: orient with suture or mark diagram',
      },
      {
        step_number: 7,
        title: 'Post-Procedure Instructions',
        description: 'Wound care and follow-up. Keep clean and dry for 24 hours. Apply petrolatum and bandage. Suture removal in 7-14 days.',
        action_type: 'patient_instruction',
        timing: 'After biopsy',
      },
    ],
  },
  {
    name: 'Cryotherapy Protocol',
    category: 'procedure',
    type: 'cryotherapy_protocol',
    description: 'Liquid nitrogen freeze times by lesion type',
    indication: 'Benign and pre-malignant lesions',
    contraindications: 'Melanoma, lesions requiring pathology, cold urticaria',
    steps: [
      {
        step_number: 1,
        title: 'Actinic Keratosis',
        description: 'Freeze time for AKs',
        action_type: 'procedure',
        procedure_code: '17000',
        procedure_instructions: '5-10 seconds freeze, 1mm halo. May repeat after thaw.',
        side_effects: 'Hypopigmentation, blistering',
      },
      {
        step_number: 2,
        title: 'Seborrheic Keratosis',
        description: 'Freeze time for SKs',
        action_type: 'procedure',
        procedure_code: '17110',
        procedure_instructions: '10-15 seconds freeze, allow full thaw, repeat freeze',
      },
      {
        step_number: 3,
        title: 'Warts (Common/Plantar)',
        description: 'Aggressive freeze for warts',
        action_type: 'procedure',
        procedure_code: '17110',
        procedure_instructions: '20-30 seconds freeze, 2mm halo. Plantar warts may need longer.',
        side_effects: 'Pain, blistering (expected)',
      },
      {
        step_number: 4,
        title: 'Post-Cryo Instructions',
        description: 'Patient education. Blister may form (normal). Keep clean. May take 2-4 weeks to fall off. May need repeat treatment.',
        action_type: 'patient_instruction',
      },
    ],
  },
  {
    name: 'Intralesional Injection Protocol',
    category: 'procedure',
    type: 'intralesional_injection',
    description: 'Steroid concentrations and volumes for intralesional injections',
    indication: 'Hypertrophic scars, keloids, alopecia areata, acne cysts',
    contraindications: 'Infection at site, allergy to corticosteroids',
    steps: [
      {
        step_number: 1,
        title: 'Keloid/Hypertrophic Scar',
        description: 'Injection technique for scars',
        action_type: 'procedure',
        procedure_code: '11900',
        medication_name: 'Triamcinolone acetonide',
        medication_dosage: '10-40 mg/mL',
        procedure_instructions: 'Inject until scar blanches. May repeat every 4-6 weeks.',
        side_effects: 'Atrophy, hypopigmentation, telangiectasia',
      },
      {
        step_number: 2,
        title: 'Alopecia Areata',
        description: 'Injection for hair loss patches',
        action_type: 'procedure',
        procedure_code: '11900',
        medication_name: 'Triamcinolone acetonide',
        medication_dosage: '5 mg/mL',
        procedure_instructions: 'Multiple 0.1mL injections spaced 1cm apart. Repeat every 4-6 weeks.',
      },
      {
        step_number: 3,
        title: 'Acne Cyst',
        description: 'Injection for large inflamed acne cysts',
        action_type: 'procedure',
        procedure_code: '11900',
        medication_name: 'Triamcinolone acetonide',
        medication_dosage: '2.5-5 mg/mL',
        procedure_instructions: '0.1-0.2mL per cyst. Use lowest effective concentration.',
        side_effects: 'Atrophy (usually temporary), hypopigmentation',
      },
    ],
  },

  // ==================== COSMETIC PROTOCOLS ====================
  {
    name: 'Botox Injection Guide - Upper Face',
    category: 'cosmetic',
    type: 'botox_upper_face',
    description: 'Standard botox injection sites and units for upper face',
    indication: 'Dynamic wrinkles of upper face',
    contraindications: 'Pregnancy, breastfeeding, neuromuscular disorders (myasthenia gravis, ALS)',
    steps: [
      {
        step_number: 1,
        title: 'Glabellar Lines (Frown Lines)',
        description: 'Injection pattern for glabella',
        action_type: 'procedure',
        procedure_code: '64612',
        medication_name: 'OnabotulinumtoxinA (Botox)',
        medication_dosage: '20-25 units total',
        procedure_instructions: '5 injection points: 2 in corrugator (lateral), 3 in procerus (midline). Inject into muscle belly.',
        side_effects: 'Bruising, ptosis (rare if proper technique)',
        warnings: 'Avoid injecting too low (causes lid ptosis). Stay at least 1cm above orbital rim.',
      },
      {
        step_number: 2,
        title: 'Forehead Lines',
        description: 'Horizontal forehead rhytids',
        action_type: 'procedure',
        procedure_code: '64612',
        medication_name: 'OnabotulinumtoxinA (Botox)',
        medication_dosage: '10-20 units total',
        procedure_instructions: '4-8 injection points across forehead, 2cm above brow. Keep lateral injections high to avoid brow ptosis.',
        warnings: 'Inject too low or too much → brow ptosis. Men typically need 20 units, women 10-15 units.',
      },
      {
        step_number: 3,
        title: 'Lateral Canthal Lines (Crows Feet)',
        description: 'Periorbital lines with smiling',
        action_type: 'procedure',
        procedure_code: '64612',
        medication_name: 'OnabotulinumtoxinA (Botox)',
        medication_dosage: '12-15 units per side (24-30 total)',
        procedure_instructions: '3 injection points lateral to orbital rim, 1cm from bony margin',
        warnings: 'Stay lateral to orbital rim to avoid diplopia from inferior spread',
      },
      {
        step_number: 4,
        title: 'Post-Injection Instructions',
        description: 'Patient education. Avoid lying down for 4 hours. No exercise or massage for 24 hours. Onset 3-5 days, peak 2 weeks, lasts 3-4 months.',
        action_type: 'patient_instruction',
      },
    ],
  },
  {
    name: 'Dermal Filler - Nasolabial Folds',
    category: 'cosmetic',
    type: 'filler_nasolabial',
    description: 'Hyaluronic acid filler injection technique for nasolabial folds',
    indication: 'Volume loss, nasolabial fold deepening',
    contraindications: 'Active infection, bleeding disorders, pregnancy',
    steps: [
      {
        step_number: 1,
        title: 'Preparation and Anesthesia',
        description: 'Prep and numb area',
        action_type: 'procedure',
        procedure_instructions: 'Cleanse with alcohol. Apply topical anesthetic for 20 minutes OR dental block',
        warnings: 'DANGER ZONE: Facial artery runs along nasolabial fold. Aspirate before injection. Be alert for vascular occlusion.',
      },
      {
        step_number: 2,
        title: 'Filler Injection',
        description: 'Inject hyaluronic acid filler',
        action_type: 'procedure',
        procedure_code: '11950',
        medication_name: 'Juvederm Ultra Plus or Restylane',
        medication_dosage: '0.5-1.0 mL per side',
        procedure_instructions: 'Linear threading or serial puncture technique. Deep dermal or supraperiosteal. Massage gently.',
        side_effects: 'Bruising, swelling, Tyndall effect',
        warnings: 'VASCULAR OCCLUSION EMERGENCY: severe pain, blanching, mottling → stop immediately, hyaluronidase',
      },
      {
        step_number: 3,
        title: 'Post-Procedure Instructions',
        description: 'Aftercare. Ice for swelling. Avoid exercise 24 hours. Massage gently if asymmetric. Swelling peaks 24-48 hours. Results last 9-12 months.',
        action_type: 'patient_instruction',
        warnings: 'Call immediately if severe pain, vision changes, or skin color changes (signs of vascular occlusion)',
      },
    ],
  },
  {
    name: 'Chemical Peel Selection Guide',
    category: 'cosmetic',
    type: 'chemical_peel_selection',
    description: 'Choose appropriate chemical peel based on indication and skin type',
    indication: 'Acne, photoaging, hyperpigmentation, fine lines',
    contraindications: 'Active HSV, recent isotretinoin (<6 months), Fitzpatrick V-VI for medium/deep peels',
    steps: [
      {
        step_number: 1,
        title: 'Superficial Peel: Glycolic Acid',
        description: 'For mild photoaging, fine lines, acne',
        action_type: 'procedure',
        procedure_code: '15788',
        medication_name: 'Glycolic Acid 30-70%',
        procedure_instructions: 'Apply for 3-5 minutes, neutralize. Minimal downtime. Safe for all skin types.',
        timing: 'Can repeat every 2-4 weeks',
      },
      {
        step_number: 2,
        title: 'Superficial Peel: Salicylic Acid',
        description: 'Best for acne, oily skin',
        action_type: 'procedure',
        procedure_code: '15788',
        medication_name: 'Salicylic Acid 20-30%',
        procedure_instructions: 'Apply for 3-5 minutes, neutralize. Lipophilic, good for acne. Safe for darker skin.',
      },
      {
        step_number: 3,
        title: 'Medium Peel: TCA 20-35%',
        description: 'For moderate photoaging, actinic keratoses',
        action_type: 'procedure',
        procedure_code: '15789',
        medication_name: 'Trichloroacetic Acid 20-35%',
        procedure_instructions: 'Apply until frost. 3-7 days downtime. Risk of hyperpigmentation in darker skin.',
        warnings: 'Higher risk in Fitzpatrick IV-VI. Pre-treat with hydroquinone.',
      },
      {
        step_number: 4,
        title: 'Pre-Peel HSV Prophylaxis',
        description: 'Prevent herpes outbreaks',
        action_type: 'medication',
        medication_name: 'Valacyclovir 500mg',
        medication_frequency: 'Twice daily',
        timing: 'Start 2 days before peel, continue 7 days',
      },
    ],
  },
  {
    name: 'Laser Settings by Fitzpatrick Skin Type',
    category: 'cosmetic',
    type: 'laser_settings_fitzpatrick',
    description: 'Safe laser parameters based on skin type',
    indication: 'Hair removal, photorejuvenation, vascular lesions',
    contraindications: 'Tan or recent sun exposure, photosensitizing medications',
    steps: [
      {
        step_number: 1,
        title: 'Fitzpatrick I-II: High Energy Laser',
        description: 'Very light skin - can use higher energies',
        action_type: 'procedure',
        procedure_instructions: 'Alexandrite 755nm or Diode 810nm. Start 15-20 J/cm². Low risk of PIH.',
      },
      {
        step_number: 2,
        title: 'Fitzpatrick III-IV: Moderate Energy',
        description: 'Olive to light brown skin - moderate settings',
        action_type: 'procedure',
        procedure_instructions: 'Diode 810nm or Nd:YAG 1064nm. Start 12-15 J/cm². Higher risk of PIH.',
        warnings: 'Test spot first. Pre-treat with hydroquinone if concerned about PIH.',
      },
      {
        step_number: 3,
        title: 'Fitzpatrick V-VI: Low Energy Nd:YAG Only',
        description: 'Dark brown to black skin - high PIH risk',
        action_type: 'procedure',
        procedure_instructions: 'Nd:YAG 1064nm ONLY. Start 10-12 J/cm². Pre-cool. Longer pulse width.',
        warnings: 'HIGH RISK OF PIH. Consider test spot and wait 2 weeks. Pre-treat with hydroquinone.',
      },
    ],
  },

  // ==================== ADMINISTRATIVE PROTOCOLS ====================
  {
    name: 'Wound Care Post-Mohs Surgery',
    category: 'procedure',
    type: 'wound_care_mohs',
    description: 'Standard wound care instructions after Mohs surgery',
    indication: 'All post-Mohs surgery patients',
    contraindications: 'None',
    steps: [
      {
        step_number: 1,
        title: 'Keep Bandage Dry for 24 Hours',
        description: 'Initial wound protection. Keep pressure dressing dry and intact for 24 hours. Elevate if on extremity.',
        action_type: 'patient_instruction',
        timing: 'Day 0-1',
      },
      {
        step_number: 2,
        title: 'Start Gentle Cleaning',
        description: 'Begin wound care routine. Gently clean with soap and water twice daily. Pat dry. Apply petrolatum. Cover with bandage.',
        action_type: 'patient_instruction',
        timing: 'Day 1 onwards',
      },
      {
        step_number: 3,
        title: 'Watch for Infection Signs',
        description: 'Monitor for complications',
        action_type: 'observation',
        timing: 'Daily',
        warnings: 'Call if: increasing pain, redness spreading, pus, fever, or bleeding that won\'t stop',
      },
      {
        step_number: 4,
        title: 'Suture Removal',
        description: 'Remove sutures based on location',
        action_type: 'procedure',
        timing: 'Face: 7 days. Body: 10-14 days. Legs: 14 days',
      },
    ],
  },
];

export async function seedProtocols(tenantId: string, userId: string) {
  console.log('🔬 Seeding dermatology protocols...');

  for (const protocolData of dermatologyProtocols) {
    const protocolId = crypto.randomBytes(16).toString('hex');

    // Insert protocol
    await pool.query(
      `insert into protocols (
        id, tenant_id, name, category, type, description, indication,
        contraindications, version, status, created_by
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        protocolId,
        tenantId,
        protocolData.name,
        protocolData.category,
        protocolData.type,
        protocolData.description,
        protocolData.indication,
        protocolData.contraindications || null,
        '1.0',
        'active',
        userId,
      ]
    );

    console.log(`  ✓ Created protocol: ${protocolData.name}`);

    // Insert steps
    for (const step of protocolData.steps) {
      const stepId = crypto.randomBytes(16).toString('hex');

      await pool.query(
        `insert into protocol_steps (
          id, tenant_id, protocol_id, step_number, title, description,
          action_type, medication_name, medication_dosage, medication_frequency,
          medication_duration, procedure_code, procedure_instructions, order_codes,
          timing, duration_days, monitoring_required, side_effects, warnings
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
        [
          stepId,
          tenantId,
          protocolId,
          step.step_number,
          step.title,
          step.description || null,
          step.action_type,
          step.medication_name || null,
          step.medication_dosage || null,
          step.medication_frequency || null,
          step.medication_duration || null,
          step.procedure_code || null,
          step.procedure_instructions || null,
          step.order_codes || null,
          step.timing || null,
          step.duration_days || null,
          step.monitoring_required || null,
          step.side_effects || null,
          step.warnings || null,
        ]
      );
    }

    console.log(`    Added ${protocolData.steps.length} steps`);
  }

  console.log(`✅ Seeded ${dermatologyProtocols.length} clinical protocols\n`);
}

// Allow running directly
if (require.main === module) {
  const tenantId = process.argv[2] || 'tenant-demo';
  const userId = process.argv[3] || 'u-admin';

  seedProtocols(tenantId, userId)
    .then(() => {
      console.log('Protocol seeding complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error seeding protocols:', error);
      process.exit(1);
    });
}
