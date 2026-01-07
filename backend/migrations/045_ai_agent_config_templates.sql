-- Default AI Agent Configuration Templates
-- These are system-provided templates that get seeded for new tenants
-- Includes: Medical Dermatology (default), Cosmetic Consult, Mohs Surgery, Pediatric Derm

-- Note: This is a template migration. The actual seeding happens per-tenant
-- when they first access the AI agent system, using the agentConfigService.

-- Create a system templates table for storing the base templates
CREATE TABLE IF NOT EXISTS ai_agent_config_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  specialty_focus TEXT NOT NULL,

  -- AI Model settings
  ai_model TEXT DEFAULT 'claude-3-5-sonnet-20241022',
  temperature DECIMAL(3,2) DEFAULT 0.30,
  max_tokens INTEGER DEFAULT 4000,

  -- Prompts
  system_prompt TEXT NOT NULL,
  prompt_template TEXT NOT NULL,

  -- Note structure
  note_sections JSONB NOT NULL,
  section_prompts JSONB DEFAULT '{}'::jsonb,

  -- Output formatting
  output_format TEXT DEFAULT 'soap',
  verbosity_level TEXT DEFAULT 'standard',
  include_codes BOOLEAN DEFAULT true,

  -- Terminology
  terminology_set JSONB DEFAULT '{}'::jsonb,
  focus_areas JSONB DEFAULT '[]'::jsonb,

  -- Code suggestions
  default_cpt_codes JSONB DEFAULT '[]'::jsonb,
  default_icd10_codes JSONB DEFAULT '[]'::jsonb,

  -- Follow-up
  default_follow_up_interval TEXT,
  task_templates JSONB DEFAULT '[]'::jsonb,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert Medical Dermatology Template (DEFAULT)
INSERT INTO ai_agent_config_templates (
  id, name, description, specialty_focus,
  system_prompt, prompt_template,
  note_sections, section_prompts,
  output_format, verbosity_level, include_codes,
  terminology_set, focus_areas,
  default_cpt_codes, default_icd10_codes,
  default_follow_up_interval, task_templates
) VALUES (
  'template-medical-derm',
  'Medical Dermatology',
  'Comprehensive medical dermatology documentation for routine and complex skin conditions',
  'medical_derm',
  'You are an expert medical dermatology clinical documentation assistant. Your role is to generate accurate, comprehensive SOAP notes from patient-provider conversations. Focus on:
- Precise dermatologic terminology and morphology descriptions
- Complete differential diagnoses with supporting evidence
- Evidence-based treatment recommendations
- Appropriate ICD-10 and CPT code suggestions
- Clear follow-up plans and patient education points

Use standardized dermatologic descriptors for lesion characteristics including size, shape, color, texture, distribution, and arrangement.',

  'Generate a comprehensive SOAP clinical note from the following patient-provider conversation.

REQUIREMENTS:
1. Use precise dermatologic terminology (e.g., papule, plaque, macule, patch, vesicle)
2. Document lesion characteristics using standard morphologic descriptors
3. Include anatomic location with laterality when applicable
4. Provide differential diagnosis ranked by likelihood
5. Document treatment rationale and alternatives discussed
6. Include patient-specific precautions and contraindications
7. Generate appropriate ICD-10 codes with specificity
8. Suggest E/M level based on complexity and time

Return the note as a structured JSON object with these sections:
chiefComplaint, hpi, ros, physicalExam, assessment, plan

Include also: suggestedIcd10, suggestedCpt, medications, allergies, followUpTasks, sectionConfidence',

  '["chiefComplaint", "hpi", "ros", "physicalExam", "assessment", "plan"]'::jsonb,

  '{
    "hpi": "Document using OLDCARTS format: Onset, Location, Duration, Character, Aggravating factors, Relieving factors, Timing, Severity. Include relevant skin history and previous treatments.",
    "physicalExam": "Document detailed skin examination including: location, size (in cm or mm), morphology (primary and secondary lesions), color, texture, distribution pattern, arrangement. Note any dermoscopic findings if applicable.",
    "assessment": "Provide primary diagnosis with differential diagnoses listed in order of likelihood. Include supporting evidence from history and exam for each.",
    "plan": "Include specific treatment regimen, patient education points, warning signs to watch for, and clear follow-up timeline."
  }'::jsonb,

  'soap',
  'detailed',
  true,

  '{
    "primary_lesions": ["macule", "patch", "papule", "plaque", "nodule", "tumor", "vesicle", "bulla", "pustule", "cyst", "wheal"],
    "secondary_lesions": ["scale", "crust", "erosion", "ulcer", "fissure", "excoriation", "lichenification", "atrophy", "scar"],
    "descriptors": ["erythematous", "hyperpigmented", "hypopigmented", "violaceous", "flesh-colored", "pearly", "translucent"],
    "patterns": ["annular", "linear", "grouped", "dermatomal", "photodistributed", "symmetric", "unilateral"],
    "textures": ["smooth", "verrucous", "scaly", "crusted", "keratotic"]
  }'::jsonb,

  '["accurate_diagnosis", "complete_documentation", "appropriate_coding", "treatment_efficacy"]'::jsonb,

  '[
    {"code": "99213", "description": "Office visit, established patient, low complexity"},
    {"code": "99214", "description": "Office visit, established patient, moderate complexity"},
    {"code": "99215", "description": "Office visit, established patient, high complexity"},
    {"code": "11102", "description": "Tangential biopsy of skin, single lesion"},
    {"code": "11104", "description": "Punch biopsy of skin, single lesion"},
    {"code": "17000", "description": "Destruction of premalignant lesion, first lesion"},
    {"code": "17110", "description": "Destruction of flat warts, up to 14 lesions"}
  ]'::jsonb,

  '[
    {"code": "L30.9", "description": "Dermatitis, unspecified"},
    {"code": "L20.9", "description": "Atopic dermatitis, unspecified"},
    {"code": "L40.9", "description": "Psoriasis, unspecified"},
    {"code": "L57.0", "description": "Actinic keratosis"},
    {"code": "L82.1", "description": "Other seborrheic keratosis"},
    {"code": "L70.0", "description": "Acne vulgaris"},
    {"code": "L71.9", "description": "Rosacea, unspecified"},
    {"code": "B35.4", "description": "Tinea corporis"}
  ]'::jsonb,

  '4-6 weeks',

  '[
    {"task": "Schedule follow-up appointment", "priority": "medium", "daysFromVisit": 28},
    {"task": "Review biopsy results when available", "priority": "high", "daysFromVisit": 7}
  ]'::jsonb
) ON CONFLICT (name) DO NOTHING;

-- Insert Cosmetic Consultation Template
INSERT INTO ai_agent_config_templates (
  id, name, description, specialty_focus,
  system_prompt, prompt_template,
  note_sections, section_prompts,
  output_format, verbosity_level, include_codes,
  terminology_set, focus_areas,
  default_cpt_codes, default_icd10_codes,
  default_follow_up_interval, task_templates
) VALUES (
  'template-cosmetic',
  'Cosmetic Consultation',
  'Aesthetic dermatology consultations focusing on patient goals, treatment options, and expectations',
  'cosmetic',
  'You are an expert cosmetic dermatology documentation assistant specializing in aesthetic consultations. Focus on:
- Documenting patient aesthetic goals and expectations clearly
- Objective assessment of facial aging, skin quality, and anatomic concerns
- Treatment options with realistic outcome expectations
- Informed consent elements including risks and alternatives
- Pre-treatment photography and baseline documentation

Use standardized aesthetic assessment terminology and validated grading scales when appropriate.',

  'Generate a comprehensive cosmetic consultation note from the following patient-provider conversation.

REQUIREMENTS:
1. Document patient''s aesthetic concerns in their own words
2. Include objective assessment of:
   - Facial aging indicators (rhytids, volume loss, skin laxity)
   - Skin quality (texture, tone, pigmentation)
   - Anatomic proportions and asymmetries
3. Document all treatment options discussed with pros/cons
4. Include informed consent discussion elements
5. Note realistic expectations set with patient
6. Document contraindications screening

Return as structured JSON with these sections:
chiefComplaint, aestheticConcerns, medicalHistory, cosmeticExam, treatmentDiscussion, informedConsent, plan',

  '["chiefComplaint", "aestheticConcerns", "medicalHistory", "cosmeticExam", "treatmentDiscussion", "informedConsent", "plan"]'::jsonb,

  '{
    "aestheticConcerns": "Document patient goals using their own words. Note specific areas of concern, timeline of concerns, and previous cosmetic treatments tried.",
    "cosmeticExam": "Assess and document: facial zones affected, severity of concerns using standardized scales when available (e.g., Glogau photoaging classification, Fitzpatrick skin type), skin quality assessment, anatomic observations.",
    "treatmentDiscussion": "Document all treatment options presented including: mechanism of action, expected outcomes, number of treatments needed, downtime, cost estimate range, duration of results.",
    "informedConsent": "Document: risks discussed (bruising, swelling, asymmetry, infection, allergic reaction), alternatives presented, patient questions and answers given, patient demonstrated understanding."
  }'::jsonb,

  'narrative',
  'detailed',
  false,

  '{
    "aging_signs": ["rhytids", "dynamic lines", "static lines", "volume loss", "hollowing", "skin laxity", "jowling", "photoaging"],
    "skin_quality": ["texture irregularity", "dyschromia", "telangiectasia", "pore size", "acne scarring", "melasma"],
    "anatomic_areas": ["glabella", "forehead", "periorbital", "crow''s feet", "nasolabial folds", "marionette lines", "perioral", "jawline", "neck"],
    "treatments": ["neurotoxin", "dermal filler", "chemical peel", "laser resurfacing", "microneedling", "PRP", "IPL", "radiofrequency"]
  }'::jsonb,

  '["patient_satisfaction", "realistic_expectations", "treatment_planning", "safety"]'::jsonb,

  '[
    {"code": "99213", "description": "Office visit, established patient"},
    {"code": "99214", "description": "Office visit, moderate complexity"},
    {"code": "64612", "description": "Chemodenervation of muscle(s); muscle(s) innervated by facial nerve"}
  ]'::jsonb,

  '[]'::jsonb,

  '2-4 weeks post-procedure',

  '[
    {"task": "Schedule treatment appointment", "priority": "medium", "daysFromVisit": 14},
    {"task": "Send pre-treatment instructions", "priority": "high", "daysFromVisit": 1},
    {"task": "Confirm patient for procedure", "priority": "medium", "daysFromVisit": 12}
  ]'::jsonb
) ON CONFLICT (name) DO NOTHING;

-- Insert Mohs Surgery Template
INSERT INTO ai_agent_config_templates (
  id, name, description, specialty_focus,
  system_prompt, prompt_template,
  note_sections, section_prompts,
  output_format, verbosity_level, include_codes,
  terminology_set, focus_areas,
  default_cpt_codes, default_icd10_codes,
  default_follow_up_interval, task_templates
) VALUES (
  'template-mohs',
  'Mohs Surgery',
  'Mohs micrographic surgery documentation with layer tracking, defect measurement, and reconstruction details',
  'mohs',
  'You are an expert Mohs micrographic surgery documentation assistant. Focus on:
- Precise pre-operative tumor documentation
- Detailed layer-by-layer surgical documentation
- Accurate defect size and location using anatomic landmarks
- Complete reconstruction documentation
- Appropriate CPT coding for Mohs stages and repair

Use clock-face orientation for margin documentation. Include all measurements in millimeters.',

  'Generate a comprehensive Mohs surgery note from the following operative conversation/documentation.

REQUIREMENTS:
1. Document pre-operative assessment including:
   - Prior biopsy results and pathology
   - Clinical appearance and measurements
   - Indication for Mohs over standard excision
2. For each Mohs layer document:
   - Layer number
   - Size of excision
   - Location of positive margins (clock-face)
   - Time to clear margins
3. Document final defect:
   - Size in mm (length x width x depth)
   - Anatomic structures involved
   - Reconstruction method
4. Include appropriate Mohs and repair codes

Return as structured JSON with procedure-specific sections.',

  '["preOperativeAssessment", "indication", "anesthesia", "mohsLayers", "finalDefect", "reconstruction", "specimens", "postOpInstructions", "plan"]'::jsonb,

  '{
    "preOperativeAssessment": "Document: lesion location using anatomic landmarks, clinical size (mm), appearance, prior biopsy date and pathology result, high-risk features.",
    "mohsLayers": "For each layer: layer number, dimensions of tissue removed, processing method, margin status, location of residual tumor using clock orientation.",
    "finalDefect": "Precise measurements: length x width x depth in mm, anatomic location, structures exposed or involved, wound bed characteristics.",
    "reconstruction": "Document: repair method selected, rationale for method, layers closed, suture types and sizes, estimated cosmetic outcome."
  }'::jsonb,

  'procedure_note',
  'detailed',
  true,

  '{
    "tumor_types": ["BCC", "SCC", "MIS", "melanoma", "DFSP", "MCC", "AFX"],
    "histologic_subtypes": ["nodular", "superficial", "morpheaform", "infiltrative", "micronodular", "basosquamous"],
    "anatomic_zones": ["H-zone", "M-zone", "L-zone", "trunk", "extremity"],
    "margin_terms": ["positive", "negative", "close", "peripheral", "deep"],
    "repair_types": ["primary closure", "adjacent tissue transfer", "rotation flap", "advancement flap", "full-thickness skin graft", "split-thickness skin graft", "healing by secondary intention"]
  }'::jsonb,

  '["complete_excision", "optimal_reconstruction", "accurate_coding", "pathology_correlation"]'::jsonb,

  '[
    {"code": "17311", "description": "Mohs, 1st stage, head/neck/hands/feet/genitalia"},
    {"code": "17312", "description": "Mohs, each additional stage"},
    {"code": "17313", "description": "Mohs, 1st stage, trunk/arms/legs"},
    {"code": "17314", "description": "Mohs, each additional stage, trunk/arms/legs"},
    {"code": "12051", "description": "Intermediate repair, face, 2.5cm or less"},
    {"code": "14060", "description": "Adjacent tissue transfer, eyelids/nose/ears/lips, 10 sq cm or less"},
    {"code": "15240", "description": "Full thickness skin graft, free, face"}
  ]'::jsonb,

  '[
    {"code": "C44.319", "description": "Basal cell carcinoma of skin of other parts of face"},
    {"code": "C44.329", "description": "Squamous cell carcinoma of skin of other parts of face"},
    {"code": "D03.39", "description": "Melanoma in situ of other parts of face"},
    {"code": "C44.91", "description": "Basal cell carcinoma of skin, unspecified"},
    {"code": "C44.92", "description": "Squamous cell carcinoma of skin, unspecified"}
  ]'::jsonb,

  '1 week suture removal',

  '[
    {"task": "Suture removal appointment", "priority": "high", "daysFromVisit": 7},
    {"task": "Final pathology review", "priority": "high", "daysFromVisit": 3},
    {"task": "Post-op wound check", "priority": "medium", "daysFromVisit": 14},
    {"task": "3-month skin check", "priority": "medium", "daysFromVisit": 90}
  ]'::jsonb
) ON CONFLICT (name) DO NOTHING;

-- Insert Pediatric Dermatology Template
INSERT INTO ai_agent_config_templates (
  id, name, description, specialty_focus,
  system_prompt, prompt_template,
  note_sections, section_prompts,
  output_format, verbosity_level, include_codes,
  terminology_set, focus_areas,
  default_cpt_codes, default_icd10_codes,
  default_follow_up_interval, task_templates
) VALUES (
  'template-pediatric',
  'Pediatric Dermatology',
  'Pediatric-focused dermatology documentation with age-appropriate considerations and family-centered care',
  'pediatric_derm',
  'You are an expert pediatric dermatology documentation assistant. Focus on:
- Age-appropriate assessment and developmental considerations
- Family history and genetic factors relevant to pediatric skin conditions
- Child-friendly treatment options with safety considerations
- Parent/caregiver education and school/daycare implications
- Growth and development monitoring when relevant

Consider the child''s age when documenting and recommending treatments. Include safety considerations for pediatric formulations.',

  'Generate a comprehensive pediatric dermatology note from the following patient-provider conversation.

REQUIREMENTS:
1. Document age-specific history including:
   - Birth history if relevant
   - Developmental milestones if applicable
   - Family history of skin conditions
   - School/daycare exposure history
2. Physical exam appropriate for age
3. Treatment recommendations with:
   - Age-appropriate formulations
   - Weight-based dosing when applicable
   - Safety considerations for pediatric use
4. Parent education points
5. School/activity restrictions if needed

Return as structured JSON with pediatric-specific considerations.',

  '["chiefComplaint", "hpi", "birthAndDevelopment", "familyHistory", "ros", "physicalExam", "assessment", "plan", "parentEducation"]'::jsonb,

  '{
    "hpi": "Include: age of onset relative to developmental stage, duration, triggers identified by parents, home treatments tried, impact on sleep/feeding/school, any infectious exposures.",
    "birthAndDevelopment": "Document when relevant: gestational age, birth weight, NICU stay, developmental milestones, immunization status.",
    "familyHistory": "Document: atopy history in parents/siblings, genetic skin conditions, autoimmune diseases, similar skin conditions in family.",
    "parentEducation": "Include: condition explanation in parent-friendly terms, treatment demonstration provided, written instructions given, return precautions, school/daycare guidance."
  }'::jsonb,

  'soap',
  'standard',
  true,

  '{
    "pediatric_conditions": ["atopic dermatitis", "diaper dermatitis", "infantile hemangioma", "port wine stain", "molluscum contagiosum", "impetigo", "tinea capitis", "cradle cap"],
    "age_groups": ["neonate", "infant", "toddler", "school-age", "adolescent"],
    "considerations": ["age-appropriate", "weight-based dosing", "vehicle selection", "compliance strategies", "school implications"]
  }'::jsonb,

  '["diagnostic_accuracy", "age_appropriate_treatment", "family_education", "safety"]'::jsonb,

  '[
    {"code": "99213", "description": "Office visit, established patient, low complexity"},
    {"code": "99214", "description": "Office visit, established patient, moderate complexity"},
    {"code": "99381", "description": "Preventive visit, infant (age younger than 1 year)"},
    {"code": "99382", "description": "Preventive visit, early childhood (age 1-4 years)"}
  ]'::jsonb,

  '[
    {"code": "L20.9", "description": "Atopic dermatitis, unspecified"},
    {"code": "L22", "description": "Diaper dermatitis"},
    {"code": "D18.01", "description": "Hemangioma of skin and subcutaneous tissue"},
    {"code": "B08.1", "description": "Molluscum contagiosum"},
    {"code": "L01.0", "description": "Impetigo"},
    {"code": "B35.0", "description": "Tinea barbae and tinea capitis"}
  ]'::jsonb,

  '2-4 weeks',

  '[
    {"task": "Follow-up appointment", "priority": "medium", "daysFromVisit": 21},
    {"task": "Check treatment response", "priority": "medium", "daysFromVisit": 14}
  ]'::jsonb
) ON CONFLICT (name) DO NOTHING;

-- Function to seed templates for a new tenant
CREATE OR REPLACE FUNCTION seed_ai_agent_configs_for_tenant(p_tenant_id TEXT, p_created_by TEXT DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_template RECORD;
  v_id TEXT;
  v_is_first BOOLEAN := true;
BEGIN
  -- Check if tenant already has configurations
  IF EXISTS (SELECT 1 FROM ai_agent_configurations WHERE tenant_id = p_tenant_id) THEN
    RETURN 0;
  END IF;

  -- Copy each template to the tenant
  FOR v_template IN SELECT * FROM ai_agent_config_templates LOOP
    v_id := gen_random_uuid()::text;

    INSERT INTO ai_agent_configurations (
      id, tenant_id, name, description, is_default, is_active,
      specialty_focus, ai_model, temperature, max_tokens,
      system_prompt, prompt_template,
      note_sections, section_prompts,
      output_format, verbosity_level, include_codes,
      terminology_set, focus_areas,
      default_cpt_codes, default_icd10_codes,
      default_follow_up_interval, task_templates,
      created_by
    ) VALUES (
      v_id,
      p_tenant_id,
      v_template.name,
      v_template.description,
      v_is_first, -- First template becomes default
      true,
      v_template.specialty_focus,
      v_template.ai_model,
      v_template.temperature,
      v_template.max_tokens,
      v_template.system_prompt,
      v_template.prompt_template,
      v_template.note_sections,
      v_template.section_prompts,
      v_template.output_format,
      v_template.verbosity_level,
      v_template.include_codes,
      v_template.terminology_set,
      v_template.focus_areas,
      v_template.default_cpt_codes,
      v_template.default_icd10_codes,
      v_template.default_follow_up_interval,
      v_template.task_templates,
      p_created_by
    );

    v_count := v_count + 1;
    v_is_first := false;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Seed configurations for the demo tenant
SELECT seed_ai_agent_configs_for_tenant('tenant-demo', 'system');
