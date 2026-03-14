export type InstructionType =
  | "general"
  | "aftercare"
  | "lab_results"
  | "prescription_instructions"
  | "rash_care"
  | "cleansing";

export interface DefaultHandoutTemplate {
  templateKey: string;
  instructionType: InstructionType;
  title: string;
  category: string;
  condition: string;
  content: string;
  printDisclaimer: string;
}

export const DEFAULT_HANDOUT_TEMPLATES: DefaultHandoutTemplate[] = [
  {
    templateKey: "lab-results-follow-up-summary-v1",
    instructionType: "lab_results",
    title: "Lab Results Follow-Up Summary",
    category: "Lab Results",
    condition: "Lab Result Counseling",
    content: `Lab Results Summary

Patient: {{patient_name}}
DOB: {{patient_dob}}
Date Reviewed: {{today_date}}
Provider: {{provider_name}}

Summary of Results:
{{lab_summary}}

What this means:
- Your provider reviewed your results and discussed next steps.
- If any value is outside the reference range, clinical context will be considered before treatment changes.

Plan:
- Repeat labs: {{follow_up_date}}
- Medication or treatment change: {{dosage_instructions}}
- Call us right away for urgent symptoms or concerns.`,
    printDisclaimer:
      "For educational use only. This handout does not replace individualized medical advice.",
  },
  {
    templateKey: "prescription-instructions-standard-v1",
    instructionType: "prescription_instructions",
    title: "Prescription Instructions (Patient Copy)",
    category: "Medications",
    condition: "Prescription Counseling",
    content: `Prescription Instructions

Patient: {{patient_name}}
DOB: {{patient_dob}}
Medication: {{medication_name}}
Prescribed by: {{provider_name}}
Date: {{today_date}}

How to use:
{{dosage_instructions}}

Important safety notes:
- Take exactly as prescribed.
- Do not share medication.
- Contact our office if side effects occur or symptoms worsen.
- Seek urgent care for severe allergic reaction symptoms.

Refill / Follow-up:
{{follow_up_date}}`,
    printDisclaimer:
      "Medication counseling document. Follow your prescription label and provider instructions.",
  },
  {
    templateKey: "general-derm-aftercare-v1",
    instructionType: "aftercare",
    title: "General Dermatology Aftercare",
    category: "Post-Procedure Care",
    condition: "Routine Visit Aftercare",
    content: `Aftercare Instructions

Patient: {{patient_name}}
Date: {{today_date}}
Provider: {{provider_name}}

Care plan:
- Clean area gently as directed.
- Apply topical medications exactly as instructed.
- Avoid scratching or friction to affected areas.
- Keep follow-up appointments.

When to call:
- Worsening pain, redness, drainage, fever, or spreading rash.
- Any medication reaction.

Follow-up:
{{follow_up_date}}`,
    printDisclaimer:
      "General guidance only. Contact the clinic for worsening symptoms or urgent concerns.",
  },
  {
    templateKey: "biopsy-aftercare-standard-v1",
    instructionType: "aftercare",
    title: "Skin Biopsy Aftercare",
    category: "Post-Procedure Care",
    condition: "Biopsy Site Care",
    content: `Biopsy Site Aftercare

Patient: {{patient_name}}
Date of Procedure: {{today_date}}
Provider: {{provider_name}}

First 24 hours:
- Keep dressing clean and dry.
- Avoid soaking and vigorous activity.

After 24 hours:
- Clean gently with mild soap and water.
- Pat dry, apply ointment if directed, and re-cover with a clean bandage.
- Continue daily until healed.

Call our office for:
- Fever, increasing pain, pus, worsening redness, or bleeding that does not stop with pressure.

Results and follow-up:
{{follow_up_date}}`,
    printDisclaimer:
      "If severe bleeding, chest pain, shortness of breath, or other emergency symptoms occur, seek emergency care.",
  },
  {
    templateKey: "rash-care-flare-plan-v1",
    instructionType: "rash_care",
    title: "Rash Care Flare Plan",
    category: "Skin Conditions",
    condition: "Rash / Dermatitis",
    content: `Rash Care Plan

Patient: {{patient_name}}
Date: {{today_date}}
Provider: {{provider_name}}

Daily care:
- Use fragrance-free cleanser and moisturizer.
- Avoid known triggers (fragrances, harsh soaps, overheating, friction).
- Use prescribed medication as directed:
  {{dosage_instructions}}

Symptom monitoring:
- Track itch, redness, spread, and possible trigger exposures.

Escalation:
- Contact clinic for worsening rash, severe pain, fever, drainage, or facial/eye involvement.

Follow-up:
{{follow_up_date}}`,
    printDisclaimer:
      "This plan is individualized for current symptoms and may be updated at follow-up.",
  },
  {
    templateKey: "gentle-cleansing-routine-v1",
    instructionType: "cleansing",
    title: "Gentle Cleansing Routine",
    category: "General Information",
    condition: "Sensitive Skin Cleansing",
    content: `Gentle Skin Cleansing Routine

Patient: {{patient_name}}
Date: {{today_date}}

Morning:
- Wash with lukewarm water and a gentle non-fragranced cleanser.
- Pat dry, do not rub.
- Apply moisturizer and sunscreen.

Evening:
- Cleanse gently to remove sunscreen/makeup.
- Apply medications as directed:
  {{dosage_instructions}}
- Moisturize.

Avoid:
- Harsh scrubs, alcohol-based products, and very hot water.

Follow-up questions:
Contact our office if irritation persists or worsens.`,
    printDisclaimer:
      "Skincare recommendations may be adjusted based on diagnosis and response to treatment.",
  },
  {
    templateKey: "acne-topical-start-plan-v1",
    instructionType: "prescription_instructions",
    title: "Acne Topical Start Plan",
    category: "Medications",
    condition: "Acne Topical Therapy",
    content: `Acne Treatment Instructions

Patient: {{patient_name}}
Date: {{today_date}}
Provider: {{provider_name}}

Medication plan:
{{medication_name}}
{{dosage_instructions}}

Expected response:
- Improvement typically takes 6-8 weeks.
- Mild dryness/irritation can occur initially.

Helpful tips:
- Use non-comedogenic moisturizer and sunscreen.
- Do not pick lesions.

Follow-up:
{{follow_up_date}}`,
    printDisclaimer:
      "Stop and contact clinic for severe irritation, swelling, or other unexpected reactions.",
  },
  {
    templateKey: "pathology-result-discussion-v1",
    instructionType: "lab_results",
    title: "Pathology Result Discussion Sheet",
    category: "Pathology Reports",
    condition: "Biopsy Result Follow-Up",
    content: `Pathology Follow-Up

Patient: {{patient_name}}
Date Reviewed: {{today_date}}
Provider: {{provider_name}}

Result summary:
{{lab_summary}}

Recommended next steps:
{{dosage_instructions}}

Follow-up date:
{{follow_up_date}}

Please call us for any new symptoms, bleeding, pain, or rapidly changing lesions.`,
    printDisclaimer:
      "This summary is part of your visit documentation and should be reviewed with your provider.",
  },
];
