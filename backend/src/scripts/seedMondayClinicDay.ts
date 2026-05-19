import { Pool } from "pg";
import crypto from "crypto";

const TENANT_ID = process.env.MONDAY_SEED_TENANT_ID || "tenant-demo";
const CLINIC_DATE = process.env.MONDAY_SEED_DATE || "2026-05-18";
const TIME_ZONE_OFFSET = process.env.MONDAY_SEED_TZ_OFFSET || "-06:00";
const SNAPSHOT_THROUGH_TIME = process.env.MONDAY_SEED_THROUGH_TIME || "";
const SNAPSHOT_WAITING_CASE_ID = process.env.MONDAY_SEED_WAITING_CASE_ID || "";
const SNAPSHOT_WAITING_CHECKIN_TIME = process.env.MONDAY_SEED_WAITING_CHECKIN_TIME || "";
const PREFIX = `monday-${CLINIC_DATE}`;
const CREATED_BY = "monday-clinic-day-seed";

type ProviderKey = "medicalOne" | "medicalTwo" | "cosmetic" | "clinicalPa";
type AppointmentStatus =
  | "scheduled"
  | "checked_in"
  | "in_room"
  | "with_provider"
  | "checkout"
  | "completed"
  | "cancelled"
  | "no_show";

type Diagnosis = {
  code: string;
  description: string;
  primary?: boolean;
};

type Charge = {
  cpt: string;
  description: string;
  amountCents: number;
  quantity?: number;
  billingRoute?: "insurance" | "self_pay" | "cosmetic" | "patient";
};

type Prescription = {
  medicationName: string;
  sig: string;
  quantity: number;
  quantityUnit: string;
  refills: number;
  strength?: string;
  indication?: string;
};

type ClinicalOrder = {
  type: string;
  details: string;
  priority?: "routine" | "urgent";
  status?: string;
};

type MondayCase = {
  id: string;
  patientIndex: number;
  provider: ProviderKey;
  time: string;
  duration: number;
  typeId: string;
  status: AppointmentStatus;
  chiefComplaint: string;
  hpi: string;
  ros: string;
  exam: string;
  plan: string;
  diagnoses: Diagnosis[];
  charges: Charge[];
  prescriptions?: Prescription[];
  orders?: ClinicalOrder[];
  pathology?: {
    specimenType: string;
    specimenSite: string;
    clinicalDiagnosis: string;
  };
  lab?: {
    indication: string;
    tests: string[];
  };
  documentTitle?: string;
  taskTitle?: string;
  payer?: string;
  insurancePayerId?: string;
  patientResponsibilityCents?: number;
  paidAtCheckoutCents?: number;
  claimStatus?: string;
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL_ENABLED === "true"
    ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false" }
    : undefined,
  max: 4,
  connectionTimeoutMillis: 15_000,
});

const appointmentTypes = [
  { id: `${PREFIX}-type-fbse`, name: "Full Body Skin Exam", duration: 30, color: "#0f766e", category: "medical", priorAuth: false },
  { id: `${PREFIX}-type-biopsy`, name: "Biopsy / Procedure", duration: 45, color: "#b45309", category: "procedure", priorAuth: false },
  { id: `${PREFIX}-type-acne`, name: "Acne Follow-up", duration: 20, color: "#2563eb", category: "medical", priorAuth: false },
  { id: `${PREFIX}-type-psoriasis`, name: "Psoriasis Follow-up", duration: 30, color: "#7c3aed", category: "medical", priorAuth: true },
  { id: `${PREFIX}-type-rash`, name: "Rash / Eczema Visit", duration: 30, color: "#059669", category: "medical", priorAuth: false },
  { id: `${PREFIX}-type-mohs`, name: "Mohs Follow-up", duration: 30, color: "#dc2626", category: "surgery", priorAuth: false },
  { id: `${PREFIX}-type-cosmetic-consult`, name: "Cosmetic Consultation", duration: 30, color: "#db2777", category: "cosmetic", priorAuth: false },
  { id: `${PREFIX}-type-botox`, name: "Botox Treatment", duration: 30, color: "#a855f7", category: "cosmetic", priorAuth: false },
  { id: `${PREFIX}-type-filler`, name: "Filler Treatment", duration: 45, color: "#ec4899", category: "cosmetic", priorAuth: false },
  { id: `${PREFIX}-type-laser`, name: "Laser / IPL", duration: 45, color: "#ea580c", category: "cosmetic", priorAuth: false },
  { id: `${PREFIX}-type-microneedling`, name: "Microneedling", duration: 45, color: "#0891b2", category: "cosmetic", priorAuth: false },
  { id: `${PREFIX}-type-post-procedure`, name: "Post Procedure Check", duration: 20, color: "#475569", category: "procedure", priorAuth: false },
];

const patients: Array<[string, string, string, string, string, string, string]> = [
  ["Maya", "Brooks", "1984-03-12", "F", "Aetna PPO", "AETNA", "Dermatitis follow-up"],
  ["Ethan", "Collins", "1971-09-05", "M", "Blue Cross Blue Shield", "BCBS", "Changing lesion"],
  ["Sofia", "Chen", "1992-11-19", "F", "UnitedHealthcare", "UHC", "Acne care"],
  ["Marcus", "Williams", "1966-04-22", "M", "Medicare", "MEDICARE", "Skin cancer surveillance"],
  ["Nora", "Patel", "1978-07-30", "F", "Cigna", "CIGNA", "Psoriasis biologic monitoring"],
  ["Liam", "Garcia", "2009-02-16", "M", "UnitedHealthcare", "UHC", "Pediatric eczema"],
  ["Ava", "Johnson", "1989-12-02", "F", "Self-Pay", "SELF", "Cosmetic consult"],
  ["Henry", "Miller", "1958-06-17", "M", "Medicare Advantage", "HUMANA", "Actinic keratoses"],
  ["Isabella", "Davis", "1996-08-25", "F", "Aetna PPO", "AETNA", "Hair loss evaluation"],
  ["Caleb", "Thompson", "1981-01-09", "M", "Blue Cross Blue Shield", "BCBS", "Rosacea follow-up"],
  ["Grace", "Nguyen", "1975-05-14", "F", "UnitedHealthcare", "UHC", "Patch testing"],
  ["Owen", "Reed", "1963-10-21", "M", "Medicare", "MEDICARE", "Mohs follow-up"],
  ["Elena", "Rivera", "1990-03-28", "F", "Self-Pay", "SELF", "Botox treatment"],
  ["Jack", "Anderson", "1986-12-11", "M", "Cigna", "CIGNA", "Wart treatment"],
  ["Priya", "Shah", "1998-04-04", "F", "Blue Cross Blue Shield", "BCBS", "Isotretinoin monitoring"],
  ["Daniel", "Morgan", "1970-07-07", "M", "Aetna PPO", "AETNA", "Hidradenitis"],
  ["Camila", "Torres", "1987-09-18", "F", "Self-Pay", "SELF", "Filler treatment"],
  ["Wyatt", "King", "2012-01-25", "M", "UnitedHealthcare", "UHC", "Pediatric rash"],
  ["Amelia", "Scott", "1969-11-03", "F", "Medicare", "MEDICARE", "Melanoma surveillance"],
  ["Julian", "Bennett", "1983-06-09", "M", "Blue Cross Blue Shield", "BCBS", "Nail fungus"],
  ["Chloe", "Parker", "1994-02-27", "F", "Self-Pay", "SELF", "Microneedling"],
  ["Nathan", "Carter", "1979-10-01", "M", "Aetna PPO", "AETNA", "Urticaria"],
  ["Hannah", "Lewis", "1988-08-08", "F", "Self-Pay", "SELF", "IPL treatment"],
  ["Leo", "Roberts", "1955-05-29", "M", "Medicare", "MEDICARE", "Suture removal"],
  ["Zoey", "Hall", "1999-09-15", "F", "Cigna", "CIGNA", "Acne follow-up"],
  ["Miles", "Young", "1973-03-03", "M", "Blue Cross Blue Shield", "BCBS", "Seborrheic dermatitis"],
  ["Layla", "Allen", "1985-07-19", "F", "Self-Pay", "SELF", "Chemical peel"],
  ["Ryan", "Price", "1961-12-24", "M", "Medicare Advantage", "HUMANA", "Skin check"],
];

const cases: MondayCase[] = [
  {
    id: "001",
    patientIndex: 0,
    provider: "medicalOne",
    time: "08:00",
    duration: 30,
    typeId: "type-fbse",
    status: "completed",
    chiefComplaint: "Annual full body skin exam",
    hpi: "Patient presents for annual skin cancer screening. No bleeding lesions. Uses SPF intermittently.",
    ros: "No fevers, chills, unintentional weight loss, or painful changing lesions.",
    exam: "Full body skin exam completed. Scattered benign nevi and lentigines. No lesions concerning for melanoma.",
    plan: "Reassurance. Reviewed ABCDE warning signs and daily broad-spectrum SPF. Return in 12 months.",
    diagnoses: [{ code: "Z12.83", description: "Encounter for screening for malignant neoplasm of skin", primary: true }, { code: "D22.5", description: "Melanocytic nevi of trunk" }],
    charges: [{ cpt: "99213", description: "Established patient dermatology visit", amountCents: 15000 }],
    documentTitle: "Skin cancer screening after-visit summary",
    taskTitle: "Send SPF and self-skin exam handout",
    payer: "Aetna PPO",
    insurancePayerId: "AETNA",
    patientResponsibilityCents: 3500,
    paidAtCheckoutCents: 3500,
    claimStatus: "accepted",
  },
  {
    id: "002",
    patientIndex: 1,
    provider: "medicalOne",
    time: "08:35",
    duration: 35,
    typeId: "type-biopsy",
    status: "completed",
    chiefComplaint: "Changing pigmented lesion on upper back",
    hpi: "Lesion has enlarged and darkened over four months. No prior biopsy at this site.",
    ros: "Denies systemic symptoms. Reports mild itching at lesion.",
    exam: "Left upper back with 6 mm irregular brown macule with asymmetric pigment network on dermoscopy.",
    plan: "Tangential biopsy performed. Wound care reviewed. Pathology follow-up in 7 days.",
    diagnoses: [{ code: "D48.5", description: "Neoplasm of uncertain behavior of skin", primary: true }],
    charges: [{ cpt: "99213", description: "Problem-focused lesion evaluation", amountCents: 15000 }, { cpt: "11102", description: "Tangential biopsy of skin, single lesion", amountCents: 17500 }],
    pathology: { specimenType: "Shave biopsy", specimenSite: "Left upper back", clinicalDiagnosis: "Rule out dysplastic nevus versus melanoma in situ" },
    documentTitle: "Biopsy wound care instructions",
    taskTitle: "Call patient when pathology returns",
    payer: "Blue Cross Blue Shield",
    insurancePayerId: "BCBS",
    patientResponsibilityCents: 5000,
    paidAtCheckoutCents: 5000,
    claimStatus: "submitted",
  },
  {
    id: "003",
    patientIndex: 2,
    provider: "medicalOne",
    time: "09:20",
    duration: 20,
    typeId: "type-acne",
    status: "completed",
    chiefComplaint: "Acne follow-up",
    hpi: "Patient arrived for acne follow-up and reports fewer inflammatory lesions but persistent chin flares.",
    ros: "No headaches, vision changes, mood changes, or medication intolerance.",
    exam: "Mild inflammatory acne on chin and jawline with scattered closed comedones. No nodulocystic lesions.",
    plan: "Continue benzoyl peroxide wash. Start topical clindamycin in the morning and tretinoin at night as tolerated.",
    diagnoses: [{ code: "L70.0", description: "Acne vulgaris", primary: true }],
    charges: [{ cpt: "99213", description: "Acne follow-up visit", amountCents: 15000 }],
    prescriptions: [{ medicationName: "Clindamycin 1% lotion", strength: "1%", sig: "Apply a thin layer to acne-prone areas every morning.", quantity: 60, quantityUnit: "mL", refills: 2, indication: "Acne vulgaris" }],
    documentTitle: "Acne maintenance plan",
    taskTitle: "Send acne regimen through portal",
    payer: "UnitedHealthcare",
    insurancePayerId: "UHC",
    patientResponsibilityCents: 3000,
    paidAtCheckoutCents: 3000,
    claimStatus: "accepted",
  },
  {
    id: "004",
    patientIndex: 4,
    provider: "medicalOne",
    time: "09:45",
    duration: 30,
    typeId: "type-psoriasis",
    status: "completed",
    chiefComplaint: "Psoriasis flare and biologic monitoring",
    hpi: "Plaques flaring on elbows and scalp after missed dose. Joint stiffness improved on current biologic.",
    ros: "No fever, infection symptoms, cough, or injection-site reaction.",
    exam: "Erythematous plaques with silvery scale on elbows, knees, and scalp. BSA about 6%.",
    plan: "Continue biologic. Add clobetasol solution for scalp. CBC/CMP ordered for monitoring.",
    diagnoses: [{ code: "L40.0", description: "Psoriasis vulgaris", primary: true }, { code: "Z79.899", description: "Other long term drug therapy" }],
    charges: [{ cpt: "99214", description: "Moderate complexity dermatology follow-up", amountCents: 20000 }],
    prescriptions: [{ medicationName: "Clobetasol 0.05% topical solution", strength: "0.05%", sig: "Apply thin layer to scalp plaques twice daily for up to 2 weeks, then weekends only.", quantity: 50, quantityUnit: "mL", refills: 1, indication: "Psoriasis flare" }],
    lab: { indication: "Biologic monitoring", tests: ["CBC with differential", "Comprehensive metabolic panel"] },
    taskTitle: "Review biologic monitoring labs",
    payer: "Cigna",
    insurancePayerId: "CIGNA",
    patientResponsibilityCents: 4000,
    paidAtCheckoutCents: 4000,
    claimStatus: "accepted",
  },
  {
    id: "005",
    patientIndex: 5,
    provider: "medicalTwo",
    time: "08:15",
    duration: 30,
    typeId: "type-rash",
    status: "completed",
    chiefComplaint: "Pediatric eczema flare",
    hpi: "Parent reports itchy flexural rash worsening over two weeks despite moisturizer.",
    ros: "No fever, drainage, or suspected food-triggered anaphylaxis.",
    exam: "Eczematous patches on antecubital fossae and popliteal areas. Mild excoriations, no impetigo.",
    plan: "Start triamcinolone ointment for body flares. Wet wrap education and fragrance-free skin care reviewed.",
    diagnoses: [{ code: "L20.9", description: "Atopic dermatitis, unspecified", primary: true }],
    charges: [{ cpt: "99213", description: "Established patient eczema visit", amountCents: 15000 }],
    prescriptions: [{ medicationName: "Triamcinolone 0.1% ointment", strength: "0.1%", sig: "Apply to eczema patches twice daily for 7 days during flares. Avoid face and groin.", quantity: 80, quantityUnit: "grams", refills: 2, indication: "Atopic dermatitis" }],
    documentTitle: "Eczema wet wrap and skin care plan",
    taskTitle: "Send eczema school note through portal",
    payer: "UnitedHealthcare",
    insurancePayerId: "UHC",
    patientResponsibilityCents: 3000,
    paidAtCheckoutCents: 3000,
    claimStatus: "accepted",
  },
  {
    id: "006",
    patientIndex: 7,
    provider: "medicalTwo",
    time: "09:00",
    duration: 30,
    typeId: "type-biopsy",
    status: "completed",
    chiefComplaint: "Rough spots on scalp and temples",
    hpi: "History of extensive sun exposure. Several rough scaling spots persist despite sunscreen.",
    ros: "No bleeding or painful nodules.",
    exam: "Six gritty erythematous papules on scalp, forehead, and temples.",
    plan: "Cryotherapy performed to six actinic keratoses. Field therapy options discussed if recurrence continues.",
    diagnoses: [{ code: "L57.0", description: "Actinic keratosis", primary: true }],
    charges: [{ cpt: "99213", description: "Actinic keratosis evaluation", amountCents: 15000 }, { cpt: "17000", description: "Destruction premalignant lesion, first lesion", amountCents: 8500 }, { cpt: "17003", description: "Destruction premalignant lesions, 2-14 lesions", amountCents: 7000 }],
    documentTitle: "Cryotherapy aftercare",
    taskTitle: "Schedule 6-month field therapy discussion",
    payer: "Medicare",
    insurancePayerId: "MEDICARE",
    patientResponsibilityCents: 4200,
    paidAtCheckoutCents: 4200,
    claimStatus: "submitted",
  },
  {
    id: "007",
    patientIndex: 12,
    provider: "cosmetic",
    time: "09:00",
    duration: 30,
    typeId: "type-botox",
    status: "completed",
    chiefComplaint: "Cosmetic neurotoxin treatment",
    hpi: "Patient requests repeat treatment for glabella and forehead rhytids. Prior response lasted about three months.",
    ros: "No neuromuscular disorder symptoms. Not pregnant or nursing.",
    exam: "Dynamic glabellar and forehead rhytids. Facial symmetry intact.",
    plan: "Botox 34 units administered to glabella and forehead. Post-treatment instructions reviewed.",
    diagnoses: [{ code: "Z41.1", description: "Encounter for cosmetic procedure", primary: true }],
    charges: [{ cpt: "J0585", description: "Cosmetic neurotoxin treatment", amountCents: 48000, billingRoute: "cosmetic" }],
    documentTitle: "Botox post-treatment instructions",
    taskTitle: "Send 2-week cosmetic satisfaction check",
    patientResponsibilityCents: 48000,
    paidAtCheckoutCents: 48000,
  },
  {
    id: "008",
    patientIndex: 16,
    provider: "cosmetic",
    time: "09:45",
    duration: 45,
    typeId: "type-filler",
    status: "completed",
    chiefComplaint: "Dermal filler for nasolabial folds",
    hpi: "Patient desires softening of nasolabial folds and mild cheek support.",
    ros: "No active infection, recent dental procedure, or filler complication history.",
    exam: "Moderate nasolabial folds with mild midface volume loss.",
    plan: "Hyaluronic acid filler placed conservatively. Ice and aftercare reviewed.",
    diagnoses: [{ code: "Z41.1", description: "Encounter for cosmetic procedure", primary: true }],
    charges: [{ cpt: "A4580", description: "Dermal filler treatment", amountCents: 72000, billingRoute: "cosmetic" }],
    documentTitle: "Filler aftercare instructions",
    taskTitle: "Cosmetic nurse call in 48 hours",
    patientResponsibilityCents: 72000,
    paidAtCheckoutCents: 72000,
  },
  {
    id: "009",
    patientIndex: 14,
    provider: "clinicalPa",
    time: "10:00",
    duration: 30,
    typeId: "type-acne",
    status: "completed",
    chiefComplaint: "Isotretinoin monitoring",
    hpi: "Month three isotretinoin. Acne improving. Reports dry lips but no mood changes or headaches.",
    ros: "No depression, headaches, vision changes, abdominal pain, or joint pain.",
    exam: "Few inflammatory papules on cheeks, xerosis of lips. No nodulocystic lesions today.",
    plan: "Continue isotretinoin 40 mg daily pending monthly labs. Pregnancy prevention counseling documented.",
    diagnoses: [{ code: "L70.0", description: "Acne vulgaris", primary: true }, { code: "Z79.899", description: "Other long term drug therapy" }],
    charges: [{ cpt: "99214", description: "Isotretinoin monitoring visit", amountCents: 20000 }],
    prescriptions: [{ medicationName: "Isotretinoin", strength: "40 mg", sig: "Take 1 capsule by mouth daily with fatty meal.", quantity: 30, quantityUnit: "capsules", refills: 0, indication: "Nodulocystic acne" }],
    lab: { indication: "Isotretinoin monthly monitoring", tests: ["ALT", "Triglycerides", "Pregnancy test when applicable"] },
    taskTitle: "Confirm iPLEDGE counseling and lab result before release",
    payer: "Blue Cross Blue Shield",
    insurancePayerId: "BCBS",
    patientResponsibilityCents: 4500,
    paidAtCheckoutCents: 4500,
    claimStatus: "coding_review",
  },
  {
    id: "010",
    patientIndex: 15,
    provider: "medicalTwo",
    time: "10:20",
    duration: 30,
    typeId: "type-rash",
    status: "completed",
    chiefComplaint: "Hidradenitis suppurativa follow-up",
    hpi: "Recurrent painful nodules in axillae, currently one draining lesion. Patient wants non-surgical options.",
    ros: "No fever. Reports pain with arm movement.",
    exam: "Left axilla with inflammatory nodule and sinus tract scarring. Hurley stage II pattern.",
    plan: "Start doxycycline. Hibiclens wash. Discuss biologic if recurrent flares continue.",
    diagnoses: [{ code: "L73.2", description: "Hidradenitis suppurativa", primary: true }],
    charges: [{ cpt: "99214", description: "Moderate complexity inflammatory derm visit", amountCents: 20000 }],
    prescriptions: [{ medicationName: "Doxycycline hyclate", strength: "100 mg", sig: "Take 1 capsule by mouth twice daily with food and water.", quantity: 60, quantityUnit: "capsules", refills: 1, indication: "Hidradenitis suppurativa" }],
    taskTitle: "Check prior authorization criteria for biologic therapy",
    payer: "Aetna PPO",
    insurancePayerId: "AETNA",
    patientResponsibilityCents: 3500,
    paidAtCheckoutCents: 3500,
    claimStatus: "accepted",
  },
  {
    id: "011",
    patientIndex: 22,
    provider: "cosmetic",
    time: "10:45",
    duration: 45,
    typeId: "type-laser",
    status: "completed",
    chiefComplaint: "IPL for facial photodamage and redness",
    hpi: "Patient presents for planned IPL series treatment two of three. No tan or photosensitizing medication.",
    ros: "No active cold sore or skin infection.",
    exam: "Mottled facial erythema and lentigines over cheeks and nose.",
    plan: "IPL performed with eye protection. Strict sun avoidance and SPF reviewed.",
    diagnoses: [{ code: "Z41.1", description: "Encounter for cosmetic procedure", primary: true }, { code: "L81.4", description: "Other melanin hyperpigmentation" }],
    charges: [{ cpt: "A9999", description: "IPL cosmetic treatment", amountCents: 32500, billingRoute: "cosmetic" }],
    documentTitle: "Laser and IPL aftercare instructions",
    taskTitle: "Book IPL treatment 3 of 3",
    patientResponsibilityCents: 32500,
    paidAtCheckoutCents: 32500,
  },
  {
    id: "012",
    patientIndex: 11,
    provider: "medicalOne",
    time: "11:15",
    duration: 30,
    typeId: "type-mohs",
    status: "completed",
    chiefComplaint: "Post-Mohs wound check",
    hpi: "One week after Mohs on right nasal sidewall. Mild tenderness, no drainage.",
    ros: "No fever, chills, or increasing redness.",
    exam: "Surgical site clean, sutures intact, no dehiscence or infection.",
    plan: "Sutures removed. Silicone scar gel and SPF reviewed. Return in 3 months.",
    diagnoses: [{ code: "C44.311", description: "Basal cell carcinoma of skin of nose", primary: true }, { code: "Z48.02", description: "Encounter for removal of sutures" }],
    charges: [{ cpt: "99213", description: "Postoperative wound evaluation", amountCents: 15000 }],
    documentTitle: "Post-Mohs scar care instructions",
    taskTitle: "Schedule 3-month post-Mohs scar check",
    payer: "Medicare",
    insurancePayerId: "MEDICARE",
    patientResponsibilityCents: 3000,
    paidAtCheckoutCents: 3000,
    claimStatus: "submitted",
  },
  {
    id: "013",
    patientIndex: 26,
    provider: "cosmetic",
    time: "11:45",
    duration: 30,
    typeId: "type-post-procedure",
    status: "completed",
    chiefComplaint: "Chemical peel for acne scarring",
    hpi: "Patient here for planned salicylic peel. No isotretinoin use in past six months.",
    ros: "No active dermatitis or infection.",
    exam: "Post-inflammatory hyperpigmentation and shallow acne scarring on cheeks.",
    plan: "Salicylic peel performed. Post-peel kit recommended. Follow-up in four weeks.",
    diagnoses: [{ code: "Z41.1", description: "Encounter for cosmetic procedure", primary: true }, { code: "L73.0", description: "Acne keloid" }],
    charges: [{ cpt: "15788", description: "Chemical peel cosmetic session", amountCents: 19500, billingRoute: "cosmetic" }],
    documentTitle: "Chemical peel aftercare instructions",
    taskTitle: "Confirm patient purchased post-peel kit",
    patientResponsibilityCents: 19500,
    paidAtCheckoutCents: 19500,
  },
  {
    id: "014",
    patientIndex: 13,
    provider: "medicalOne",
    time: "12:10",
    duration: 20,
    typeId: "type-biopsy",
    status: "completed",
    chiefComplaint: "Wart treatment on right hand",
    hpi: "Persistent wart on index finger despite OTC salicylic acid.",
    ros: "No immunosuppression symptoms.",
    exam: "Verrucous papule on right index finger with thrombosed capillaries.",
    plan: "Cryotherapy performed. Return in four weeks if persistent.",
    diagnoses: [{ code: "B07.9", description: "Viral wart, unspecified", primary: true }],
    charges: [{ cpt: "17110", description: "Destruction benign lesions up to 14", amountCents: 12000 }],
    documentTitle: "Wart cryotherapy aftercare",
    taskTitle: "Queue wart follow-up reminder",
    payer: "Cigna",
    insurancePayerId: "CIGNA",
    patientResponsibilityCents: 4000,
    paidAtCheckoutCents: 4000,
    claimStatus: "draft",
  },
  {
    id: "015",
    patientIndex: 9,
    provider: "medicalTwo",
    time: "11:40",
    duration: 30,
    typeId: "type-rash",
    status: "completed",
    chiefComplaint: "Rosacea medication follow-up",
    hpi: "Redness and papules improved but still flares with heat and alcohol.",
    ros: "No ocular pain or vision changes.",
    exam: "Central facial erythema with scattered inflammatory papules, no rhinophyma.",
    plan: "Start topical metronidazole. Trigger avoidance and mineral SPF reviewed.",
    diagnoses: [{ code: "L71.9", description: "Rosacea, unspecified", primary: true }],
    charges: [{ cpt: "99213", description: "Rosacea follow-up", amountCents: 15000 }],
    prescriptions: [{ medicationName: "Metronidazole 0.75% cream", strength: "0.75%", sig: "Apply thin layer to affected facial areas twice daily.", quantity: 45, quantityUnit: "grams", refills: 3, indication: "Rosacea" }],
    documentTitle: "Rosacea trigger and skin care plan",
    taskTitle: "Send rosacea trigger handout",
    payer: "Blue Cross Blue Shield",
    insurancePayerId: "BCBS",
    patientResponsibilityCents: 3500,
    paidAtCheckoutCents: 3500,
    claimStatus: "submitted",
  },
  {
    id: "016",
    patientIndex: 20,
    provider: "cosmetic",
    time: "13:00",
    duration: 45,
    typeId: "type-microneedling",
    status: "completed",
    chiefComplaint: "Microneedling for acne scars",
    hpi: "Patient here for microneedling session one for atrophic acne scarring.",
    ros: "No active acne flare or cold sores.",
    exam: "Atrophic rolling scars on bilateral cheeks with mild background erythema.",
    plan: "Microneedling performed. Recovery serum and SPF recommended.",
    diagnoses: [{ code: "Z41.1", description: "Encounter for cosmetic procedure", primary: true }, { code: "L73.0", description: "Acne scarring" }],
    charges: [{ cpt: "96999", description: "Microneedling cosmetic session", amountCents: 32500, billingRoute: "cosmetic" }],
    documentTitle: "Microneedling aftercare instructions",
    taskTitle: "Send post-procedure skincare bundle recommendation",
    patientResponsibilityCents: 32500,
    paidAtCheckoutCents: 32500,
  },
  {
    id: "017",
    patientIndex: 8,
    provider: "medicalOne",
    time: "13:00",
    duration: 30,
    typeId: "type-rash",
    status: "completed",
    chiefComplaint: "Hair shedding evaluation",
    hpi: "Diffuse shedding for three months after recent illness and work stress.",
    ros: "No scalp pain, scarring, or patchy loss. Reports fatigue.",
    exam: "Diffuse decreased density without scarring. Positive hair pull test. No scale.",
    plan: "Labs ordered for ferritin, TSH, vitamin D. Discussed telogen effluvium timeline.",
    diagnoses: [{ code: "L65.0", description: "Telogen effluvium", primary: true }, { code: "R53.83", description: "Other fatigue" }],
    charges: [{ cpt: "99214", description: "Hair loss evaluation", amountCents: 20000 }],
    lab: { indication: "Diffuse hair shedding", tests: ["Ferritin", "TSH", "Vitamin D"] },
    taskTitle: "Review hair loss lab panel",
    payer: "Aetna PPO",
    insurancePayerId: "AETNA",
    patientResponsibilityCents: 3500,
    paidAtCheckoutCents: 3500,
    claimStatus: "accepted",
  },
  {
    id: "018",
    patientIndex: 17,
    provider: "medicalTwo",
    time: "13:00",
    duration: 30,
    typeId: "type-rash",
    status: "completed",
    chiefComplaint: "Pediatric rash on trunk",
    hpi: "Parent reports itchy trunk rash for one week after new detergent exposure.",
    ros: "No fever, oral lesions, or breathing symptoms.",
    exam: "Eczematous papules and plaques on trunk, no vesicles or purpura.",
    plan: "Suspected allergic contact dermatitis. Stop new detergent. Low potency topical steroid prescribed.",
    diagnoses: [{ code: "L23.9", description: "Allergic contact dermatitis, unspecified cause", primary: true }],
    charges: [{ cpt: "99213", description: "Pediatric rash visit", amountCents: 15000 }],
    prescriptions: [{ medicationName: "Hydrocortisone 2.5% ointment", strength: "2.5%", sig: "Apply to itchy rash twice daily for up to 7 days.", quantity: 30, quantityUnit: "grams", refills: 1, indication: "Contact dermatitis" }],
    documentTitle: "Pediatric contact dermatitis plan",
    taskTitle: "Portal message with detergent avoidance instructions",
    payer: "UnitedHealthcare",
    insurancePayerId: "UHC",
    patientResponsibilityCents: 3000,
    paidAtCheckoutCents: 3000,
    claimStatus: "accepted",
  },
  {
    id: "019",
    patientIndex: 19,
    provider: "medicalTwo",
    time: "13:40",
    duration: 30,
    typeId: "type-rash",
    status: "completed",
    chiefComplaint: "Toenail discoloration",
    hpi: "Thick yellow toenails for one year. Patient wants treatment options.",
    ros: "No liver disease history. No foot ulcer.",
    exam: "Several toenails thickened with subungual debris. Plantar scaling present.",
    plan: "Nail clipping and fungal culture ordered. Discuss terbinafine pending confirmation and LFTs.",
    diagnoses: [{ code: "B35.1", description: "Tinea unguium", primary: true }, { code: "B35.3", description: "Tinea pedis" }],
    charges: [{ cpt: "99213", description: "Onychomycosis evaluation", amountCents: 15000 }],
    lab: { indication: "Onychomycosis treatment planning", tests: ["Fungal culture", "Hepatic function panel"] },
    taskTitle: "Follow nail culture result",
    payer: "Blue Cross Blue Shield",
    insurancePayerId: "BCBS",
    patientResponsibilityCents: 3500,
    paidAtCheckoutCents: 3500,
    claimStatus: "submitted",
  },
  {
    id: "020",
    patientIndex: 18,
    provider: "medicalOne",
    time: "15:00",
    duration: 30,
    typeId: "type-fbse",
    status: "completed",
    chiefComplaint: "Melanoma surveillance skin exam",
    hpi: "History of melanoma in situ, left calf, excised 2021. Patient reports no bleeding lesions and no lymph node symptoms.",
    ros: "No fevers, night sweats, weight loss, headaches, or painful changing lesions.",
    exam: "Total body skin exam completed with well-healed left calf scar and no repigmentation. No cervical, axillary, or inguinal lymphadenopathy.",
    plan: "No evidence of recurrence. Continue quarterly self-skin checks, sun protection, and return in six months.",
    diagnoses: [{ code: "Z85.820", description: "Personal history of malignant melanoma of skin", primary: true }],
    charges: [{ cpt: "99214", description: "Melanoma surveillance visit", amountCents: 20000 }],
    documentTitle: "Melanoma surveillance after-visit summary",
    taskTitle: "Confirm prior melanoma pathology is attached",
    payer: "Medicare",
    insurancePayerId: "MEDICARE",
    patientResponsibilityCents: 3000,
    paidAtCheckoutCents: 3000,
    claimStatus: "submitted",
  },
  {
    id: "021",
    patientIndex: 10,
    provider: "medicalOne",
    time: "15:45",
    duration: 20,
    typeId: "type-rash",
    status: "completed",
    chiefComplaint: "Patch test reading",
    hpi: "Patient returns for final patch test reading and reports itching under two test chambers.",
    ros: "No facial swelling, dyspnea, fever, or widespread blistering.",
    exam: "Patch test reading positive to nickel sulfate and fragrance mix. Mild eczematous plaques on wrists.",
    plan: "Reviewed allergen avoidance list and safe product resources. Start low-potency topical steroid for wrist dermatitis.",
    diagnoses: [{ code: "L23.9", description: "Allergic contact dermatitis, unspecified cause", primary: true }],
    charges: [{ cpt: "99213", description: "Patch test reading and counseling", amountCents: 15000 }],
    documentTitle: "Patch test allergen avoidance plan",
    taskTitle: "Send safe product list through portal",
    payer: "UnitedHealthcare",
    insurancePayerId: "UHC",
    patientResponsibilityCents: 3000,
    paidAtCheckoutCents: 3000,
    claimStatus: "accepted",
  },
  {
    id: "022",
    patientIndex: 27,
    provider: "medicalTwo",
    time: "15:40",
    duration: 20,
    typeId: "type-post-procedure",
    status: "completed",
    chiefComplaint: "Suture removal after excision",
    hpi: "Patient presents for right shoulder excision suture removal. No drainage or increasing tenderness.",
    ros: "No fever, chills, spreading redness, or wound separation.",
    exam: "Right shoulder incision well approximated with mild expected erythema. Sutures removed without complication.",
    plan: "Reviewed scar care, silicone gel, and sun protection. Pathology already reviewed with patient.",
    diagnoses: [{ code: "Z48.02", description: "Encounter for removal of sutures", primary: true }],
    charges: [{ cpt: "99212", description: "Suture removal wound check", amountCents: 9500 }],
    documentTitle: "Suture removal and scar care instructions",
    taskTitle: "Verify excision pathology reviewed before visit",
    payer: "Medicare Advantage",
    insurancePayerId: "HUMANA",
    patientResponsibilityCents: 2500,
    paidAtCheckoutCents: 2500,
    claimStatus: "submitted",
  },
  {
    id: "023",
    patientIndex: 21,
    provider: "medicalTwo",
    time: "14:20",
    duration: 30,
    typeId: "type-rash",
    status: "completed",
    chiefComplaint: "Chronic urticaria follow-up",
    hpi: "Hives improved on high-dose antihistamine but still flare twice weekly without clear trigger.",
    ros: "No angioedema, wheezing, throat tightness, fever, or joint swelling.",
    exam: "No active urticaria today. Dermatographism mildly positive on forearm.",
    plan: "Continue cetirizine twice daily and add famotidine. Discussed omalizumab if symptoms remain uncontrolled.",
    diagnoses: [{ code: "L50.1", description: "Idiopathic urticaria", primary: true }],
    charges: [{ cpt: "99214", description: "Chronic urticaria follow-up", amountCents: 20000 }],
    prescriptions: [{ medicationName: "Famotidine", strength: "20 mg", sig: "Take 1 tablet by mouth twice daily for chronic urticaria adjunct therapy.", quantity: 60, quantityUnit: "tablets", refills: 2, indication: "Chronic urticaria" }],
    documentTitle: "Chronic urticaria action plan",
    taskTitle: "Check biologic PA criteria for chronic urticaria",
    payer: "Aetna PPO",
    insurancePayerId: "AETNA",
    patientResponsibilityCents: 3500,
    paidAtCheckoutCents: 3500,
    claimStatus: "accepted",
  },
  {
    id: "024",
    patientIndex: 24,
    provider: "clinicalPa",
    time: "08:30",
    duration: 30,
    typeId: "type-acne",
    status: "completed",
    chiefComplaint: "Acne follow-up",
    hpi: "Inflammatory acne improved on topical regimen but still has jawline flares.",
    ros: "No medication irritation beyond mild dryness.",
    exam: "Few inflammatory papules along jawline, closed comedones on forehead.",
    plan: "Continue benzoyl peroxide wash. Add tretinoin 0.025% cream nightly as tolerated.",
    diagnoses: [{ code: "L70.0", description: "Acne vulgaris", primary: true }],
    charges: [{ cpt: "99213", description: "Acne follow-up", amountCents: 15000 }],
    prescriptions: [{ medicationName: "Tretinoin 0.025% cream", strength: "0.025%", sig: "Apply pea-sized amount to face nightly as tolerated.", quantity: 45, quantityUnit: "grams", refills: 3, indication: "Acne vulgaris" }],
    documentTitle: "Acne topical routine",
    taskTitle: "Send acne routine through portal",
    payer: "Cigna",
    insurancePayerId: "CIGNA",
    patientResponsibilityCents: 3500,
    paidAtCheckoutCents: 3500,
    claimStatus: "accepted",
  },
  {
    id: "025",
    patientIndex: 3,
    provider: "clinicalPa",
    time: "11:30",
    duration: 20,
    typeId: "type-fbse",
    status: "completed",
    chiefComplaint: "Quarterly melanoma surveillance",
    hpi: "Quarterly melanoma surveillance visit. Patient notes one itchy brown spot on left flank without bleeding.",
    ros: "No weight loss, fevers, night sweats, headaches, or lymph node swelling.",
    exam: "Full skin exam completed. Left flank lesion consistent with inflamed seborrheic keratosis. Prior melanoma scar without recurrence.",
    plan: "Reassurance for seborrheic keratosis. Continue quarterly surveillance and strict sun protection.",
    diagnoses: [{ code: "Z85.820", description: "Personal history of malignant melanoma of skin", primary: true }],
    charges: [{ cpt: "99214", description: "Quarterly melanoma surveillance visit", amountCents: 20000 }],
    documentTitle: "Quarterly melanoma surveillance summary",
    taskTitle: "Schedule next melanoma surveillance visit",
    payer: "Medicare",
    insurancePayerId: "MEDICARE",
    patientResponsibilityCents: 3000,
    paidAtCheckoutCents: 3000,
    claimStatus: "submitted",
  },
  {
    id: "026",
    patientIndex: 6,
    provider: "cosmetic",
    time: "14:00",
    duration: 30,
    typeId: "type-cosmetic-consult",
    status: "completed",
    chiefComplaint: "Comprehensive anti-aging consult",
    hpi: "Patient is interested in a gradual plan for pigment, texture, and dynamic lines.",
    ros: "No active infection, recent isotretinoin, pregnancy, or history of poor wound healing.",
    exam: "Baseline cosmetic photos obtained. Dynamic rhytids, facial lentigines, and mild texture change noted.",
    plan: "Created staged treatment plan for skincare, neurotoxin, IPL, and microneedling. Quote reviewed.",
    diagnoses: [{ code: "Z41.1", description: "Encounter for cosmetic procedure", primary: true }],
    charges: [{ cpt: "COS-CONSULT", description: "Cosmetic consultation", amountCents: 7500, billingRoute: "cosmetic" }],
    documentTitle: "Cosmetic treatment roadmap",
    taskTitle: "Prepare cosmetic quote templates",
    patientResponsibilityCents: 7500,
    paidAtCheckoutCents: 7500,
  },
  {
    id: "027",
    patientIndex: 23,
    provider: "cosmetic",
    time: "15:00",
    duration: 45,
    typeId: "type-laser",
    status: "completed",
    chiefComplaint: "Laser hair removal",
    hpi: "Patient requests facial laser hair removal. No recent tanning or photosensitizing medication.",
    ros: "No active cold sore, infection, or open skin in treatment area.",
    exam: "Fitzpatrick skin type III. Coarse terminal hairs on upper lip and chin. Skin intact.",
    plan: "Laser hair removal performed to small facial area after consent. Cooling and sun avoidance reviewed.",
    diagnoses: [{ code: "Z41.1", description: "Encounter for cosmetic procedure", primary: true }],
    charges: [{ cpt: "LASER-HAIR-S", description: "Laser hair removal small area", amountCents: 17500, billingRoute: "cosmetic" }],
    documentTitle: "Laser hair removal aftercare",
    taskTitle: "Confirm laser consent completed before treatment",
    patientResponsibilityCents: 17500,
    paidAtCheckoutCents: 17500,
  },
  {
    id: "028",
    patientIndex: 25,
    provider: "medicalTwo",
    time: "15:00",
    duration: 30,
    typeId: "type-rash",
    status: "completed",
    chiefComplaint: "Seborrheic dermatitis",
    hpi: "Recurrent scalp flaking and eyebrow scale despite OTC dandruff shampoo.",
    ros: "No joint pain, nail pitting, fever, or painful pustules.",
    exam: "Greasy scale on scalp and eyebrows with mild erythema. No thick plaques or scarring alopecia.",
    plan: "Start ketoconazole shampoo and hydrocortisone cream briefly for eyebrow flare. Maintenance plan reviewed.",
    diagnoses: [{ code: "L21.9", description: "Seborrheic dermatitis, unspecified", primary: true }],
    charges: [{ cpt: "99213", description: "Seborrheic dermatitis visit", amountCents: 15000 }],
    prescriptions: [{ medicationName: "Ketoconazole 2% shampoo", strength: "2%", sig: "Use as shampoo three times weekly. Leave on scalp for 5 minutes before rinsing.", quantity: 120, quantityUnit: "mL", refills: 3, indication: "Seborrheic dermatitis" }],
    documentTitle: "Seborrheic dermatitis maintenance plan",
    taskTitle: "Queue seborrheic dermatitis handout",
    payer: "Blue Cross Blue Shield",
    insurancePayerId: "BCBS",
    patientResponsibilityCents: 3500,
    paidAtCheckoutCents: 3500,
    claimStatus: "accepted",
  },
];

function atLocal(time: string): Date {
  return new Date(`${CLINIC_DATE}T${time}:00${TIME_ZONE_OFFSET}`);
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function snapshotAt(): Date | null {
  return SNAPSHOT_THROUGH_TIME ? atLocal(SNAPSHOT_THROUGH_TIME) : null;
}

function moneyDollars(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

async function query<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

async function resetStaleClinicDateAppointments(): Promise<void> {
  const staleRows = await query<{ id: string }>(
    `select id
       from appointments
      where tenant_id = $1
        and coalesce(appointment_date, scheduled_start::date, start_time::date) = $2::date
        and id not like $3`,
    [TENANT_ID, CLINIC_DATE, `${PREFIX}%`],
  );
  const staleAppointmentIds = staleRows.map((row) => row.id).filter(Boolean);
  if (staleAppointmentIds.length === 0) return;

  const referenceRows = await query<{ table_name: string; column_name: string }>(
    `select distinct tc.table_name, kcu.column_name
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu
         on tc.constraint_name = kcu.constraint_name
        and tc.table_schema = kcu.table_schema
       join information_schema.constraint_column_usage ccu
         on ccu.constraint_name = tc.constraint_name
        and ccu.table_schema = tc.table_schema
      where tc.constraint_type = 'FOREIGN KEY'
        and tc.table_schema = 'public'
        and ccu.table_name = 'appointments'
        and ccu.column_name = 'id'
      order by tc.table_name, kcu.column_name`,
  );

  for (const reference of referenceRows) {
    await pool.query(
      `delete from ${quoteIdentifier(reference.table_name)}
        where ${quoteIdentifier(reference.column_name)}::text = any($1::text[])`,
      [staleAppointmentIds],
    );
  }

  await pool.query(
    `delete from appointments
      where tenant_id = $1
        and id = any($2::text[])`,
    [TENANT_ID, staleAppointmentIds],
  );

  console.log(`Removed ${staleAppointmentIds.length} stale appointments from ${CLINIC_DATE} before reseeding.`);
}

async function resetPreviousSeed(): Promise<void> {
  const deletes = [
    "delete from bill_activity where id like $1",
    "delete from bill_line_items where id like $1",
    "delete from patient_payments where id like $1",
    "delete from claims where id like $1",
    "delete from bills where id like $1",
    "delete from charges where id like $1",
    "delete from prescriptions where id like $1",
    "delete from lab_orders_v2 where id like $1",
    "delete from pathology_orders where id like $1",
    "delete from orders where id like $1",
    "delete from documents where id like $1",
    "delete from tasks where id like $1",
    "delete from encounter_diagnoses where id like $1",
    "delete from encounters where id like $1",
    "delete from appointment_status_history where id like $1",
    "delete from appointments where id like $1",
    "delete from patients where id like $1",
    "delete from appointment_types where id like $1",
    "delete from providers where id like $1",
  ];

  for (const sql of deletes) {
    await pool.query(sql, [`${PREFIX}%`]);
  }
}

async function ensureAppointmentTypes(): Promise<Record<string, string>> {
  for (const type of appointmentTypes) {
    await pool.query(
      `insert into appointment_types (
        id, tenant_id, name, duration_minutes, color, category, description, is_active, prior_auth_required
       ) values ($1,$2,$3,$4,$5,$6,$7,true,$8)
       on conflict (id) do update set
         name = excluded.name,
         duration_minutes = excluded.duration_minutes,
         color = excluded.color,
         category = excluded.category,
         description = excluded.description,
         is_active = true,
         prior_auth_required = excluded.prior_auth_required`,
      [type.id, TENANT_ID, type.name, type.duration, type.color, type.category, `${CLINIC_DATE} simulated Monday clinic appointment type`, type.priorAuth],
    );
  }

  return Object.fromEntries(appointmentTypes.map((type) => [type.id.replace(`${PREFIX}-`, ""), type.id]));
}

async function ensureFallbackProvider(id: string, fullName: string, specialty: string): Promise<string> {
  await pool.query(
    `insert into providers (id, tenant_id, full_name, specialty, npi, is_active)
     values ($1,$2,$3,$4,$5,true)
     on conflict (id) do update set
       full_name = excluded.full_name,
       specialty = excluded.specialty,
       is_active = true`,
    [id, TENANT_ID, fullName, specialty, `199${Math.floor(1000000 + Math.random() * 8999999)}`],
  );
  return id;
}

async function getProviders(): Promise<Record<ProviderKey, string>> {
  const providers = await query<{ id: string; full_name: string; specialty: string }>(
    `select id, full_name, specialty from providers where tenant_id = $1 and coalesce(is_active, true) = true order by full_name`,
    [TENANT_ID],
  );

  const byText = (needles: string[]) =>
    providers.find((provider) => needles.some((needle) => `${provider.full_name} ${provider.specialty || ""}`.toLowerCase().includes(needle)));

  const medicalOne = byText(["david", "skin", "dermatologist", "md"])?.id
    || providers[0]?.id
    || await ensureFallbackProvider(`${PREFIX}-provider-medical-1`, "Dr. David Skin", "Dermatology");
  const medicalTwo = byText(["maria", "martinez"])?.id
    || providers.find((provider) => provider.id !== medicalOne)?.id
    || await ensureFallbackProvider(`${PREFIX}-provider-medical-2`, "Dr. Maria Martinez", "Dermatology");
  const cosmetic = byText(["sarah", "cosmetic"])?.id
    || providers.find((provider) => ![medicalOne, medicalTwo].includes(provider.id))?.id
    || await ensureFallbackProvider(`${PREFIX}-provider-cosmetic`, "Sarah Mitchell, PA-C", "Cosmetic Dermatology");
  const clinicalPa = byText(["riley", "pa-c", "physician assistant"])?.id
    || providers.find((provider) => ![medicalOne, medicalTwo, cosmetic].includes(provider.id))?.id
    || await ensureFallbackProvider(`${PREFIX}-provider-clinical-pa`, "Riley Johnson, PA-C", "Dermatology PA");

  return { medicalOne, medicalTwo, cosmetic, clinicalPa };
}

async function getLocationId(): Promise<string> {
  const existing = await query<{ id: string }>(
    `select id from locations where tenant_id = $1 and coalesce(is_active, true) = true order by created_at limit 1`,
    [TENANT_ID],
  );
  if (existing[0]?.id) return existing[0].id;

  const id = `${PREFIX}-location-main`;
  await pool.query(
    `insert into locations (id, tenant_id, name, address, phone, is_active)
     values ($1,$2,'Main Dermatology Clinic','100 Demo Medical Plaza, Denver, CO','303-555-0100',true)
     on conflict (id) do update set name = excluded.name, address = excluded.address, phone = excluded.phone, is_active = true`,
    [id, TENANT_ID],
  );
  return id;
}

async function getActorId(): Promise<string> {
  const users = await query<{ id: string }>(
    `select id from users where tenant_id = $1 and role in ('admin','provider','manager','billing') order by role limit 1`,
    [TENANT_ID],
  );
  return users[0]?.id || CREATED_BY;
}

async function insertPatients(): Promise<string[]> {
  const ids: string[] = [];
  for (let index = 0; index < patients.length; index++) {
    const [firstName, lastName, dob, sex, insurance, payerId, note] = patients[index]!;
    const id = `${PREFIX}-patient-${String(index + 1).padStart(2, "0")}`;
    ids.push(id);
    await pool.query(
      `insert into patients (
        id, tenant_id, first_name, last_name, dob, sex, phone, email,
        address, city, state, zip, insurance, insurance_plan_name,
        insurance_payer_id, insurance_member_id, insurance_group_number,
        allergies, medications, pharmacy_name, pharmacy_phone,
        past_medical_history, family_history, social_history, current_symptoms,
        account_number, mrn, created_at, updated_at
      ) values (
        $1,$2,$3,$4,$5,$6,$7,$8,
        $9,'Denver','CO','80202',$10,$10,
        $11,$12,'MONDAY-DEMO',
        $13,$14,'DemoCare Pharmacy','303-555-0199',
        $15,$16,$17,$18,
        $19,$20,now(),now()
      )
      on conflict (id) do update set
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        dob = excluded.dob,
        sex = excluded.sex,
        phone = excluded.phone,
        email = excluded.email,
        address = excluded.address,
        insurance = excluded.insurance,
        insurance_plan_name = excluded.insurance_plan_name,
        insurance_payer_id = excluded.insurance_payer_id,
        current_symptoms = excluded.current_symptoms,
        updated_at = now()`,
      [
        id,
        TENANT_ID,
        firstName,
        lastName,
        dob,
        sex,
        `303-555-${String(2100 + index).slice(-4)}`,
        `${firstName.toLowerCase()}.${lastName.toLowerCase()}.monday${index + 1}@demo.portal`,
        `${100 + index} Monday Clinic Way`,
        insurance,
        payerId,
        `${payerId}-MON-${String(100000 + index)}`,
        index % 5 === 0 ? "Penicillin rash" : index % 7 === 0 ? "Latex sensitivity" : "No known drug allergies",
        index % 4 === 0 ? "Cetirizine PRN" : index % 3 === 0 ? "Vitamin D daily" : "None reported",
        note,
        index % 3 === 0 ? "Family history of non-melanoma skin cancer" : "No family history of melanoma reported",
        index % 2 === 0 ? "Works indoors; sunscreen use inconsistent" : "Outdoor recreation on weekends; uses hats",
        note,
        `MON-${String(index + 1).padStart(4, "0")}`,
        `MONMRN-${String(index + 1).padStart(4, "0")}`,
      ],
    );
  }
  return ids;
}

function appointmentTimings(caseItem: MondayCase, options: { applySnapshotAdjustments?: boolean } = {}) {
  const snapshot = options.applySnapshotAdjustments === false ? null : snapshotAt();
  const start = atLocal(caseItem.time);
  const scheduledEnd = addMinutes(start, caseItem.duration);
  const seed = Number(caseItem.id);
  const arrivalDelay = [0, 2, 4, 5, 7, 9, 11, 13, 16, 19][seed % 10]!;
  const roomWait = [5, 7, 8, 10, 11, 13, 15, 17, 20, 22][seed % 10]!;
  const providerDelay = [2, 3, 4, 5, 6][seed % 5]!;
  const checkoutDelay = [4, 5, 6, 7][seed % 4]!;
  let arrived = addMinutes(start, arrivalDelay);
  let roomed = addMinutes(arrived, roomWait);
  let provider = addMinutes(roomed, providerDelay);
  let checkout = addMinutes(provider, Math.max(10, caseItem.duration - 8));
  let end = addMinutes(checkout, checkoutDelay);

  if (snapshot && caseItem.id === SNAPSHOT_WAITING_CASE_ID && caseItem.status === "checked_in") {
    arrived = SNAPSHOT_WAITING_CHECKIN_TIME
      ? atLocal(SNAPSHOT_WAITING_CHECKIN_TIME)
      : addMinutes(snapshot, -5);
    roomed = addMinutes(snapshot, 12);
    provider = addMinutes(roomed, providerDelay);
    checkout = addMinutes(provider, Math.max(10, caseItem.duration - 8));
    end = addMinutes(checkout, checkoutDelay);
  }

  if (snapshot && ["in_room", "with_provider", "checkout", "completed"].includes(caseItem.status) && roomed > snapshot) {
    roomed = addMinutes(snapshot, -1);
    arrived = addMinutes(roomed, -Math.max(4, Math.min(12, roomWait)));
    provider = addMinutes(roomed, providerDelay);
    checkout = addMinutes(provider, Math.max(10, caseItem.duration - 8));
    end = addMinutes(checkout, checkoutDelay);
  }

  if (snapshot && ["with_provider", "checkout", "completed"].includes(caseItem.status) && provider > snapshot) {
    provider = addMinutes(snapshot, -1);
    roomed = addMinutes(provider, -Math.max(2, providerDelay));
    arrived = addMinutes(roomed, -Math.max(4, Math.min(12, roomWait)));
    checkout = addMinutes(provider, Math.max(10, caseItem.duration - 8));
    end = addMinutes(checkout, checkoutDelay);
  }

  if (snapshot && ["checkout", "completed"].includes(caseItem.status) && checkout > snapshot) {
    checkout = addMinutes(snapshot, -1);
    provider = addMinutes(checkout, -Math.max(10, Math.min(20, caseItem.duration - 8)));
    roomed = addMinutes(provider, -Math.max(2, providerDelay));
    arrived = addMinutes(roomed, -Math.max(4, Math.min(12, roomWait)));
    end = addMinutes(checkout, checkoutDelay);
  }

  if (snapshot && caseItem.status === "completed" && end > snapshot) {
    end = addMinutes(snapshot, -1);
    checkout = addMinutes(end, -Math.max(3, checkoutDelay));
    provider = addMinutes(checkout, -Math.max(10, Math.min(20, caseItem.duration - 8)));
    roomed = addMinutes(provider, -Math.max(2, providerDelay));
    arrived = addMinutes(roomed, -Math.max(4, Math.min(12, roomWait)));
  }

  const checkedInAt = ["checked_in", "in_room", "with_provider", "checkout", "completed"].includes(caseItem.status) ? arrived : null;
  const roomedAt = ["in_room", "with_provider", "checkout", "completed"].includes(caseItem.status) ? roomed : null;
  const completedAt = caseItem.status === "completed" ? end : caseItem.status === "checkout" ? checkout : null;

  return { start, scheduledEnd, end, arrived, roomed, provider, checkout, checkedInAt, roomedAt, completedAt };
}

function statusAtSnapshot(caseItem: MondayCase): AppointmentStatus {
  const snapshot = snapshotAt();
  if (!snapshot) return caseItem.status;

  const baseline = appointmentTimings({ ...caseItem, status: "completed" }, { applySnapshotAdjustments: false });
  const isWaitingCase = caseItem.id === SNAPSHOT_WAITING_CASE_ID;
  if (isWaitingCase && snapshot >= addMinutes(baseline.start, -15) && snapshot < baseline.scheduledEnd) {
    return "checked_in";
  }

  if (snapshot < baseline.start) return "scheduled";
  if (snapshot >= baseline.end) return "completed";
  if (snapshot >= baseline.checkout) return "checkout";
  if (snapshot >= baseline.provider) return "with_provider";
  if (snapshot >= baseline.roomed) return "in_room";
  if (snapshot >= baseline.arrived || snapshot >= baseline.start) return "in_room";
  return "scheduled";
}

function caseForSnapshot(caseItem: MondayCase): MondayCase {
  return { ...caseItem, status: statusAtSnapshot(caseItem) };
}

async function insertAppointment(
  caseItem: MondayCase,
  patientId: string,
  providers: Record<ProviderKey, string>,
  locationId: string,
  typeIds: Record<string, string>,
): Promise<string> {
  const appointmentId = `${PREFIX}-appt-${caseItem.id}`;
  const timings = appointmentTimings(caseItem);
  const typeId = typeIds[caseItem.typeId] || `${PREFIX}-${caseItem.typeId}`;

  await pool.query(
    `insert into appointments (
      id, tenant_id, patient_id, provider_id, location_id, appointment_type_id,
      scheduled_start, scheduled_end, status, reason, notes,
      arrived_at, checked_in_at, roomed_at, completed_at,
      start_time, end_time, scheduled_time, appointment_date, type_id, created_at, updated_at
    ) values (
      $1,$2,$3,$4,$5,$6,
      $7,$8,$9,$10,$11,
      $12,$12,$13,$14,
      $7,$8,$7,$15,$6,now(),now()
    )
    on conflict (id) do update set
      patient_id = excluded.patient_id,
      provider_id = excluded.provider_id,
      location_id = excluded.location_id,
      appointment_type_id = excluded.appointment_type_id,
      scheduled_start = excluded.scheduled_start,
      scheduled_end = excluded.scheduled_end,
      status = excluded.status,
      reason = excluded.reason,
      notes = excluded.notes,
      arrived_at = excluded.arrived_at,
      checked_in_at = excluded.checked_in_at,
      roomed_at = excluded.roomed_at,
      completed_at = excluded.completed_at,
      start_time = excluded.start_time,
      end_time = excluded.end_time,
      scheduled_time = excluded.scheduled_time,
      appointment_date = excluded.appointment_date,
      type_id = excluded.type_id,
      updated_at = now()`,
    [
      appointmentId,
      TENANT_ID,
      patientId,
      providers[caseItem.provider],
      locationId,
      typeId,
      timings.start.toISOString(),
      timings.scheduledEnd.toISOString(),
      caseItem.status,
      caseItem.chiefComplaint,
      `Simulated Monday live-day case ${caseItem.id}. ${caseItem.plan}`,
      timings.checkedInAt?.toISOString() || null,
      timings.roomedAt?.toISOString() || null,
      timings.completedAt?.toISOString() || null,
      CLINIC_DATE,
    ],
  );

  const historySteps: Array<{ status: AppointmentStatus; at: Date }> = [
    { status: "scheduled", at: addMinutes(timings.start, -720) },
  ];
  if (caseItem.status === "cancelled") historySteps.push({ status: "cancelled", at: addMinutes(timings.start, -120) });
  if (caseItem.status === "no_show") historySteps.push({ status: "no_show", at: addMinutes(timings.start, 15) });
  if (["checked_in", "in_room", "with_provider", "checkout", "completed"].includes(caseItem.status)) {
    historySteps.push({ status: "checked_in", at: timings.arrived });
  }
  if (["in_room", "with_provider", "checkout", "completed"].includes(caseItem.status)) {
    historySteps.push({ status: "in_room", at: timings.roomed });
  }
  if (["with_provider", "checkout", "completed"].includes(caseItem.status)) {
    historySteps.push({ status: "with_provider", at: timings.provider });
  }
  if (["checkout", "completed"].includes(caseItem.status)) {
    historySteps.push({ status: "checkout", at: timings.checkout });
  }
  if (caseItem.status === "completed") historySteps.push({ status: "completed", at: timings.end });

  for (let index = 0; index < historySteps.length; index++) {
    const step = historySteps[index]!;
    await pool.query(
      `insert into appointment_status_history (id, tenant_id, appointment_id, status, changed_by, changed_at)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (id) do update set status = excluded.status, changed_by = excluded.changed_by, changed_at = excluded.changed_at`,
      [`${PREFIX}-appt-status-${caseItem.id}-${index}`, TENANT_ID, appointmentId, step.status, CREATED_BY, step.at.toISOString()],
    );
  }

  return appointmentId;
}

function encounterStatusFor(status: AppointmentStatus): string {
  if (status === "completed" || status === "checkout") return "signed";
  if (status === "with_provider" || status === "in_room") return "in_progress";
  if (status === "cancelled" || status === "no_show") return "cancelled";
  return "draft";
}

async function insertEncounter(caseItem: MondayCase, appointmentId: string, patientId: string, providerId: string): Promise<string> {
  const encounterId = `${PREFIX}-enc-${caseItem.id}`;
  const status = encounterStatusFor(caseItem.status);
  const signedAt = ["signed", "locked", "completed"].includes(status) ? appointmentTimings(caseItem).end.toISOString() : null;

  await pool.query(
    `insert into encounters (
      id, tenant_id, appointment_id, patient_id, provider_id, status,
      chief_complaint, hpi, ros, exam, assessment_plan,
      ai_draft_generated, voice_dictated, requires_follow_up_scheduling,
      signed_at, signed_by, created_at, updated_at
    ) values (
      $1,$2,$3,$4,$5,$6,
      $7,$8,$9,$10,$11,
      true,false,$12,
      $13,$14,now(),now()
    )
    on conflict (id) do update set
      appointment_id = excluded.appointment_id,
      patient_id = excluded.patient_id,
      provider_id = excluded.provider_id,
      status = excluded.status,
      chief_complaint = excluded.chief_complaint,
      hpi = excluded.hpi,
      ros = excluded.ros,
      exam = excluded.exam,
      assessment_plan = excluded.assessment_plan,
      ai_draft_generated = true,
      requires_follow_up_scheduling = excluded.requires_follow_up_scheduling,
      signed_at = excluded.signed_at,
      signed_by = excluded.signed_by,
      updated_at = now()`,
    [
      encounterId,
      TENANT_ID,
      appointmentId,
      patientId,
      providerId,
      status,
      caseItem.chiefComplaint,
      caseItem.hpi,
      caseItem.ros,
      caseItem.exam,
      caseItem.plan,
      Boolean(caseItem.taskTitle && caseItem.status !== "cancelled" && caseItem.status !== "no_show"),
      signedAt,
      signedAt ? providerId : null,
    ],
  );

  for (let index = 0; index < caseItem.diagnoses.length; index++) {
    const diagnosis = caseItem.diagnoses[index]!;
    await pool.query(
      `insert into encounter_diagnoses (id, tenant_id, encounter_id, icd10_code, icd_code, description, is_primary, created_at)
       values ($1,$2,$3,$4,$4,$5,$6,now())
       on conflict (id) do update set
         icd10_code = excluded.icd10_code,
         icd_code = excluded.icd_code,
         description = excluded.description,
         is_primary = excluded.is_primary`,
      [`${PREFIX}-dx-${caseItem.id}-${index + 1}`, TENANT_ID, encounterId, diagnosis.code, diagnosis.description, diagnosis.primary || index === 0],
    );
  }

  return encounterId;
}

async function insertClinicalArtifacts(caseItem: MondayCase, appointmentId: string, encounterId: string, patientId: string, providerId: string, actorId: string): Promise<{
  chargeIds: string[];
  totalCents: number;
}> {
  const serviceDate = CLINIC_DATE;
  const icdCodes = caseItem.diagnoses.map((diagnosis) => diagnosis.code);
  const chargeIds: string[] = [];
  let totalCents = 0;

  for (let index = 0; index < caseItem.charges.length; index++) {
    const charge = caseItem.charges[index]!;
    const quantity = charge.quantity || 1;
    const amount = charge.amountCents * quantity;
    totalCents += amount;
    const id = `${PREFIX}-charge-${caseItem.id}-${index + 1}`;
    chargeIds.push(id);
    const chargeStatus = ["completed", "checkout"].includes(caseItem.status)
      ? "ready"
      : ["cancelled", "no_show"].includes(caseItem.status)
        ? "self_pay"
        : "draft";

    await pool.query(
      `insert into charges (
        id, tenant_id, encounter_id, cpt_code, icd_codes, amount_cents, status,
        description, quantity, fee_cents, linked_diagnosis_ids, patient_id,
        service_date, amount, transaction_type, code_type, billing_route, source, charge_group, line_note
      ) values (
        $1,$2,$3,$4,$5,$6,$7,
        $8,$9,$10,$11,$12,
        $13,$14,'charge','CPT',$15,'monday_clinic_day','clinical',$16
      )
      on conflict (id) do update set
        encounter_id = excluded.encounter_id,
        cpt_code = excluded.cpt_code,
        icd_codes = excluded.icd_codes,
        amount_cents = excluded.amount_cents,
        status = excluded.status,
        description = excluded.description,
        quantity = excluded.quantity,
        fee_cents = excluded.fee_cents,
        linked_diagnosis_ids = excluded.linked_diagnosis_ids,
        patient_id = excluded.patient_id,
        service_date = excluded.service_date,
        amount = excluded.amount,
        billing_route = excluded.billing_route,
        line_note = excluded.line_note`,
      [
        id,
        TENANT_ID,
        encounterId,
        charge.cpt,
        icdCodes,
        amount,
        chargeStatus,
        charge.description,
        quantity,
        charge.amountCents,
        caseItem.diagnoses.map((_, dxIndex) => `${PREFIX}-dx-${caseItem.id}-${dxIndex + 1}`),
        patientId,
        serviceDate,
        moneyDollars(amount),
        charge.billingRoute || (caseItem.payer === "Self-Pay" ? "self_pay" : "insurance"),
        `Simulated ${CLINIC_DATE} ${caseItem.chiefComplaint}`,
      ],
    );
  }

  for (let index = 0; index < (caseItem.prescriptions || []).length; index++) {
    const rx = caseItem.prescriptions![index]!;
    const id = `${PREFIX}-rx-${caseItem.id}-${index + 1}`;
    const transmitted = ["completed", "checkout", "with_provider"].includes(caseItem.status);
    await pool.query(
      `insert into prescriptions (
        id, tenant_id, patient_id, provider_id, encounter_id,
        medication_name, strength, sig, quantity, quantity_unit, refills,
        refills_remaining, days_supply, status, erx_status, pharmacy_name,
        pharmacy_phone, indication, notes, created_by, written_date, prescribed_date,
        sent_at, transmitted_at, created_at, updated_at
      ) values (
        $1,$2,$3,$4,$5,
        $6,$7,$8,$9,$10,$11,
        $11,30,$12,$13,'DemoCare Pharmacy',
        '303-555-0199',$14,'Seeded for Monday live-day simulation',$15,$16,$16,
        $17,$17,now(),now()
      )
      on conflict (id) do update set
        patient_id = excluded.patient_id,
        provider_id = excluded.provider_id,
        encounter_id = excluded.encounter_id,
        medication_name = excluded.medication_name,
        strength = excluded.strength,
        sig = excluded.sig,
        quantity = excluded.quantity,
        quantity_unit = excluded.quantity_unit,
        refills = excluded.refills,
        status = excluded.status,
        erx_status = excluded.erx_status,
        sent_at = excluded.sent_at,
        transmitted_at = excluded.transmitted_at,
        updated_at = now()`,
      [
        id,
        TENANT_ID,
        patientId,
        actorId,
        encounterId,
        rx.medicationName,
        rx.strength || null,
        rx.sig,
        rx.quantity,
        rx.quantityUnit,
        rx.refills,
        transmitted ? "transmitted" : "pending",
        transmitted ? "transmitted" : "pending",
        rx.indication || caseItem.chiefComplaint,
        actorId,
        appointmentTimings(caseItem).end.toISOString(),
        transmitted ? appointmentTimings(caseItem).end.toISOString() : null,
      ],
    );
  }

  for (let index = 0; index < (caseItem.orders || []).length; index++) {
    const order = caseItem.orders![index]!;
    await insertOrder(`${PREFIX}-order-${caseItem.id}-${index + 1}`, encounterId, patientId, providerId, order);
  }

  if (caseItem.lab) {
    await insertOrder(`${PREFIX}-order-${caseItem.id}-lab`, encounterId, patientId, providerId, {
      type: "Lab",
      details: `${caseItem.lab.indication}: ${caseItem.lab.tests.join(", ")}`,
      priority: "routine",
      status: ["completed", "checkout"].includes(caseItem.status) ? "ordered" : "draft",
    });

    await pool.query(
      `insert into lab_orders_v2 (
        id, tenant_id, patient_id, encounter_id, ordering_provider_id,
        order_number, order_date, status, priority, clinical_indication,
        clinical_notes, icd10_codes, specimens, created_by, created_at, updated_at
      ) values (
        $1,$2,$3,$4,$5,
        $6,$7,$8,'routine',$9,
        $10,$11,$12,$13,now(),now()
      )
      on conflict (id) do update set
        encounter_id = excluded.encounter_id,
        status = excluded.status,
        clinical_indication = excluded.clinical_indication,
        clinical_notes = excluded.clinical_notes,
        icd10_codes = excluded.icd10_codes,
        specimens = excluded.specimens,
        updated_at = now()`,
      [
        `${PREFIX}-lab-${caseItem.id}`,
        TENANT_ID,
        patientId,
        encounterId,
        providerId,
        `MON-LAB-${caseItem.id}`,
        appointmentTimings(caseItem).end.toISOString(),
        ["completed", "checkout"].includes(caseItem.status) ? "sent" : "draft",
        caseItem.lab.indication,
        caseItem.lab.tests.join("; "),
        icdCodes,
        JSON.stringify([{ type: "blood", tests: caseItem.lab.tests }]),
        CREATED_BY,
      ],
    );
  }

  if (caseItem.pathology) {
    await insertOrder(`${PREFIX}-order-${caseItem.id}-path`, encounterId, patientId, providerId, {
      type: "Pathology",
      details: `${caseItem.pathology.specimenType} - ${caseItem.pathology.specimenSite}`,
      priority: "routine",
      status: ["completed", "checkout"].includes(caseItem.status) ? "sent" : "draft",
    });

    await pool.query(
      `insert into pathology_orders (
        id, tenant_id, patient_id, encounter_id, ordering_provider_id,
        order_number, order_date, specimen_type, specimen_site, clinical_history,
        clinical_diagnosis, specimen_count, status, priority, icd10_codes,
        cpt_codes, collection_date, collected_by, created_by, created_at, updated_at
      ) values (
        $1,$2,$3,$4,$5,
        $6,$7,$8,$9,$10,
        $11,1,$12,'routine',$13,
        $14,$7,$15,$15,now(),now()
      )
      on conflict (id) do update set
        encounter_id = excluded.encounter_id,
        specimen_type = excluded.specimen_type,
        specimen_site = excluded.specimen_site,
        clinical_history = excluded.clinical_history,
        clinical_diagnosis = excluded.clinical_diagnosis,
        status = excluded.status,
        icd10_codes = excluded.icd10_codes,
        cpt_codes = excluded.cpt_codes,
        updated_at = now()`,
      [
        `${PREFIX}-path-${caseItem.id}`,
        TENANT_ID,
        patientId,
        encounterId,
        providerId,
        `MON-PATH-${caseItem.id}`,
        appointmentTimings(caseItem).end.toISOString(),
        caseItem.pathology.specimenType,
        caseItem.pathology.specimenSite,
        caseItem.hpi,
        caseItem.pathology.clinicalDiagnosis,
        ["completed", "checkout"].includes(caseItem.status) ? "sent" : "draft",
        icdCodes,
        caseItem.charges.map((charge) => charge.cpt),
        CREATED_BY,
      ],
    );
  }

  if (caseItem.documentTitle) {
    await pool.query(
      `insert into documents (
        id, tenant_id, patient_id, encounter_id, title, type, url,
        storage, object_key, category, subcategory, description, mime_type,
        uploaded_by, is_signed, created_at, uploaded_at
      ) values (
        $1,$2,$3,$4,$5,'pdf',$6,
        'local',$7,'Clinical','Aftercare',$8,'application/pdf',
        null,true,now(),now()
      )
      on conflict (id) do update set
        patient_id = excluded.patient_id,
        encounter_id = excluded.encounter_id,
        title = excluded.title,
        description = excluded.description,
        uploaded_at = now()`,
      [
        `${PREFIX}-doc-${caseItem.id}`,
        TENANT_ID,
        patientId,
        encounterId,
        caseItem.documentTitle,
        `/demo-documents/${caseItem.id}-${caseItem.documentTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`,
        `monday/${caseItem.id}.pdf`,
        `${caseItem.documentTitle} generated for simulated Monday clinic day.`,
      ],
    );
  }

  if (caseItem.taskTitle) {
    const due = addMinutes(appointmentTimings(caseItem).end, caseItem.status === "no_show" ? 30 : 240);
    await pool.query(
      `insert into tasks (
        id, tenant_id, patient_id, encounter_id, title, description, category,
        priority, status, due_at, due_date, assigned_to, created_by, created_at
      ) values (
        $1,$2,$3,$4,$5,$6,'clinical_follow_up',
        $7,$8,$9,$9,$10,$11,now()
      )
      on conflict (id) do update set
        patient_id = excluded.patient_id,
        encounter_id = excluded.encounter_id,
        title = excluded.title,
        description = excluded.description,
        priority = excluded.priority,
        status = excluded.status,
        due_at = excluded.due_at,
        due_date = excluded.due_date,
        assigned_to = excluded.assigned_to,
        created_by = excluded.created_by`,
      [
        `${PREFIX}-task-${caseItem.id}`,
        TENANT_ID,
        patientId,
        encounterId,
        caseItem.taskTitle,
        `${caseItem.taskTitle} for ${caseItem.chiefComplaint}.`,
        caseItem.status === "no_show" || caseItem.chiefComplaint.toLowerCase().includes("melanoma") ? "high" : "normal",
        caseItem.status === "completed" && caseItem.documentTitle ? "completed" : "open",
        due.toISOString(),
        actorId,
        actorId,
      ],
    );
  }

  return { chargeIds, totalCents };
}

async function insertOrder(id: string, encounterId: string, patientId: string, providerId: string, order: ClinicalOrder): Promise<void> {
  const providerRows = await query<{ full_name: string }>(`select full_name from providers where id = $1 and tenant_id = $2`, [providerId, TENANT_ID]);
  await pool.query(
    `insert into orders (
      id, tenant_id, encounter_id, patient_id, provider_id, type, status,
      details, priority, notes, provider_name, created_at
    ) values (
      $1,$2,$3,$4,$5,$6,$7,
      $8,$9,$10,$11,now()
    )
    on conflict (id) do update set
      encounter_id = excluded.encounter_id,
      patient_id = excluded.patient_id,
      provider_id = excluded.provider_id,
      type = excluded.type,
      status = excluded.status,
      details = excluded.details,
      priority = excluded.priority,
      notes = excluded.notes,
      provider_name = excluded.provider_name`,
    [
      id,
      TENANT_ID,
      encounterId,
      patientId,
      providerId,
      order.type,
      order.status || "ordered",
      order.details,
      order.priority || "routine",
      `Simulated Monday order: ${order.details}`,
      providerRows[0]?.full_name || "Provider",
    ],
  );
}

async function insertFinancials(
  caseItem: MondayCase,
  encounterId: string,
  patientId: string,
  chargeIds: string[],
  totalCents: number,
  actorId: string,
): Promise<void> {
  if (totalCents <= 0) return;

  const billable = ["completed", "checkout", "no_show", "cancelled"].includes(caseItem.status);
  if (!billable) return;

  const cosmeticOrSelfPay = !caseItem.payer || caseItem.payer === "Self-Pay" || caseItem.charges.some((charge) => charge.billingRoute === "cosmetic" || charge.billingRoute === "self_pay");
  const paidCents = Math.min(caseItem.paidAtCheckoutCents || 0, totalCents);
  const patientResponsibility = Math.min(caseItem.patientResponsibilityCents ?? (cosmeticOrSelfPay ? totalCents : 3500), totalCents);
  const insuranceResponsibility = cosmeticOrSelfPay ? 0 : Math.max(0, totalCents - patientResponsibility);
  const balance = Math.max(0, patientResponsibility - paidCents);
  const billStatus = paidCents >= patientResponsibility
    ? "paid"
    : ["no_show", "cancelled"].includes(caseItem.status)
      ? "overdue"
      : "pending_payment";
  const billId = `${PREFIX}-bill-${caseItem.id}`;

  await pool.query(
    `insert into bills (
      id, tenant_id, patient_id, encounter_id, bill_number, bill_date, due_date,
      total_charges_cents, insurance_responsibility_cents, patient_responsibility_cents,
      paid_amount_cents, adjustment_amount_cents, balance_cents, status,
      service_date_start, service_date_end, notes, created_by, bill_pay_code,
      follow_up_status, collections_status, payment_plan_status, billing_internal_note,
      created_at, updated_at
    ) values (
      $1,$2,$3,$4,$5,$6,$7,
      $8,$9,$10,
      $11,0,$12,$13,
      $6,$6,$14,$15,$16,
      $17,$18,'none',$19,
      now(),now()
    )
    on conflict (id) do update set
      encounter_id = excluded.encounter_id,
      total_charges_cents = excluded.total_charges_cents,
      insurance_responsibility_cents = excluded.insurance_responsibility_cents,
      patient_responsibility_cents = excluded.patient_responsibility_cents,
      paid_amount_cents = excluded.paid_amount_cents,
      balance_cents = excluded.balance_cents,
      status = excluded.status,
      notes = excluded.notes,
      follow_up_status = excluded.follow_up_status,
      collections_status = excluded.collections_status,
      billing_internal_note = excluded.billing_internal_note,
      updated_at = now()`,
    [
      billId,
      TENANT_ID,
      patientId,
      encounterId,
      `MON-${CLINIC_DATE.replace(/-/g, "")}-${caseItem.id}`,
      CLINIC_DATE,
      "2026-06-17",
      totalCents,
      insuranceResponsibility,
      patientResponsibility,
      paidCents,
      balance,
      billStatus,
      `${caseItem.chiefComplaint} - simulated Monday clinic day.`,
      actorId,
      String(5180000 + Number(caseItem.id)),
      balance > 0 ? "statement_needed" : "complete",
      ["no_show", "cancelled"].includes(caseItem.status) ? "flagged" : "none",
      ["no_show", "cancelled"].includes(caseItem.status) ? "Administrative fee from Monday live-day simulation." : "Monday live-day simulated bill.",
    ],
  );

  for (let index = 0; index < caseItem.charges.length; index++) {
    const charge = caseItem.charges[index]!;
    const amount = charge.amountCents * (charge.quantity || 1);
    await pool.query(
      `insert into bill_line_items (
        id, tenant_id, bill_id, charge_id, service_date, cpt_code, description,
        quantity, unit_price_cents, total_cents, icd_codes, code_type, billing_route, modifier_codes
      ) values (
        $1,$2,$3,$4,$5,$6,$7,
        $8,$9,$10,$11,'CPT',$12,$13
      )
      on conflict (id) do update set
        charge_id = excluded.charge_id,
        cpt_code = excluded.cpt_code,
        description = excluded.description,
        quantity = excluded.quantity,
        unit_price_cents = excluded.unit_price_cents,
        total_cents = excluded.total_cents,
        icd_codes = excluded.icd_codes,
        billing_route = excluded.billing_route`,
      [
        `${PREFIX}-bill-line-${caseItem.id}-${index + 1}`,
        TENANT_ID,
        billId,
        chargeIds[index] || null,
        CLINIC_DATE,
        charge.cpt,
        charge.description,
        charge.quantity || 1,
        charge.amountCents,
        amount,
        caseItem.diagnoses.map((diagnosis) => diagnosis.code),
        charge.billingRoute || (cosmeticOrSelfPay ? "self_pay" : "insurance"),
        [],
      ],
    );
  }

  await pool.query(
    `insert into bill_activity (id, tenant_id, bill_id, action, note, amount_cents, created_by, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,now())
     on conflict (id) do update set action = excluded.action, note = excluded.note, amount_cents = excluded.amount_cents, created_by = excluded.created_by`,
    [
      `${PREFIX}-bill-activity-${caseItem.id}`,
      TENANT_ID,
      billId,
      billStatus === "paid" ? "paid_at_checkout" : "bill_created",
      billStatus === "paid" ? "Patient paid responsibility at checkout during simulated Monday clinic day." : "Bill created during simulated Monday clinic day.",
      paidCents,
      actorId,
    ],
  );

  if (paidCents > 0) {
    await pool.query(
      `insert into patient_payments (
        id, tenant_id, patient_id, payment_date, amount_cents, payment_method,
        card_last_four, reference_number, receipt_number, applied_to_invoice_id,
        status, notes, processed_by, created_at, updated_at
      ) values (
        $1,$2,$3,$4,$5,'credit',
        $6,$7,$8,$9,
        'posted',$10,$11,now(),now()
      )
      on conflict (id) do update set
        amount_cents = excluded.amount_cents,
        status = excluded.status,
        notes = excluded.notes,
        updated_at = now()`,
      [
        `${PREFIX}-payment-${caseItem.id}`,
        TENANT_ID,
        patientId,
        CLINIC_DATE,
        paidCents,
        String(4000 + Number(caseItem.id)).slice(-4),
        `MONDAY-${caseItem.id}`,
        `MON-RECEIPT-${caseItem.id}`,
        billId,
        `Checkout payment for ${caseItem.chiefComplaint}.`,
        actorId,
      ],
    );
  }

  if (!cosmeticOrSelfPay && caseItem.claimStatus && !["no_show", "cancelled"].includes(caseItem.status)) {
    const claimId = `${PREFIX}-claim-${caseItem.id}`;
    await pool.query(
      `insert into claims (
        id, tenant_id, encounter_id, patient_id, claim_number, total_cents, status,
        payer, payer_id, service_date, submitted_at, line_items, created_by,
        payment_status, coding_review_status, scrub_status, paid_cents,
        created_at, updated_at
      ) values (
        $1,$2,$3,$4,$5,$6,$7,
        $8,$9,$10,$11,$12,$13,
        $14,$15,$16,$17,
        now(),now()
      )
      on conflict (id) do update set
        encounter_id = excluded.encounter_id,
        total_cents = excluded.total_cents,
        status = excluded.status,
        payer = excluded.payer,
        payer_id = excluded.payer_id,
        line_items = excluded.line_items,
        payment_status = excluded.payment_status,
        coding_review_status = excluded.coding_review_status,
        scrub_status = excluded.scrub_status,
        paid_cents = excluded.paid_cents,
        updated_at = now()`,
      [
        claimId,
        TENANT_ID,
        encounterId,
        patientId,
        `MON-CLM-${CLINIC_DATE.replace(/-/g, "")}-${caseItem.id}`,
        totalCents,
        caseItem.claimStatus,
        caseItem.payer || "Commercial",
        caseItem.insurancePayerId || "COMM",
        CLINIC_DATE,
        ["accepted", "submitted", "paid"].includes(caseItem.claimStatus) ? appointmentTimings(caseItem).end.toISOString() : null,
        JSON.stringify(caseItem.charges.map((charge) => ({
          cptCode: charge.cpt,
          description: charge.description,
          amountCents: charge.amountCents * (charge.quantity || 1),
          icd10Codes: caseItem.diagnoses.map((diagnosis) => diagnosis.code),
        }))),
        actorId,
        caseItem.claimStatus === "paid" ? "paid" : "pending",
        caseItem.claimStatus === "coding_review" ? "needs_review" : "approved",
        caseItem.claimStatus === "draft" ? "pending" : "passed",
        caseItem.claimStatus === "paid" ? insuranceResponsibility : 0,
      ],
    );
  }
}

async function seedMondayClinicDay(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  console.log(`Seeding simulated Monday clinic day ${CLINIC_DATE} for tenant ${TENANT_ID}`);
  if (SNAPSHOT_THROUGH_TIME) {
    console.log(
      `Applying live-day snapshot through ${SNAPSHOT_THROUGH_TIME}`
      + (SNAPSHOT_WAITING_CASE_ID ? ` with case ${SNAPSHOT_WAITING_CASE_ID} held in waiting` : ""),
    );
  }
  await resetStaleClinicDateAppointments();
  await resetPreviousSeed();

  const [providers, typeIds, locationId, patientIds, actorId] = await Promise.all([
    getProviders(),
    ensureAppointmentTypes(),
    getLocationId(),
    insertPatients(),
    getActorId(),
  ]);

  for (const rawCaseItem of cases) {
    const caseItem = caseForSnapshot(rawCaseItem);
    const patientId = patientIds[caseItem.patientIndex] || patientIds[0]!;
    const providerId = providers[caseItem.provider];
    const appointmentId = await insertAppointment(caseItem, patientId, providers, locationId, typeIds);
    const encounterId = await insertEncounter(caseItem, appointmentId, patientId, providerId);
    const { chargeIds, totalCents } = await insertClinicalArtifacts(caseItem, appointmentId, encounterId, patientId, providerId, actorId);
    await insertFinancials(caseItem, encounterId, patientId, chargeIds, totalCents, actorId);
  }

  const statusRows = await query<{ status: string; count: string }>(
    `select status, count(*)::text as count
     from appointments
     where tenant_id = $1 and id like $2
     group by status
     order by status`,
    [TENANT_ID, `${PREFIX}%`],
  );
  const providerRows = await query<{ provider_name: string; count: string }>(
    `select pr.full_name as provider_name, count(*)::text as count
     from appointments a
     join providers pr on pr.id = a.provider_id and pr.tenant_id = a.tenant_id
     where a.tenant_id = $1 and a.id like $2
     group by pr.full_name
     order by pr.full_name`,
    [TENANT_ID, `${PREFIX}%`],
  );
  const artifactRows = await query<{
    appointments: string;
    encounters: string;
    diagnoses: string;
    prescriptions: string;
    orders: string;
    labs: string;
    pathology: string;
    charges: string;
    bills: string;
    billLines: string;
    payments: string;
    claims: string;
    tasks: string;
    documents: string;
  }>(
    `select
       (select count(*)::text from appointments where tenant_id = $1 and id like $2) as appointments,
       (select count(*)::text from encounters where tenant_id = $1 and id like $3) as encounters,
       (select count(*)::text from encounter_diagnoses where encounter_id like $3) as diagnoses,
       (select count(*)::text from prescriptions where tenant_id = $1 and id like $4) as prescriptions,
       (select count(*)::text from orders where tenant_id = $1 and id like $5) as orders,
       (select count(*)::text from lab_orders_v2 where tenant_id = $1 and id like $6) as labs,
       (select count(*)::text from pathology_orders where tenant_id = $1 and id like $7) as pathology,
       (select count(*)::text from charges where tenant_id = $1 and id like $8) as charges,
       (select count(*)::text from bills where tenant_id = $1 and id like $9) as bills,
       (select count(*)::text from bill_line_items where bill_id like $9) as "billLines",
       (select count(*)::text from patient_payments where tenant_id = $1 and id like $10) as payments,
       (select count(*)::text from claims where tenant_id = $1 and id like $11) as claims,
       (select count(*)::text from tasks where tenant_id = $1 and id like $12) as tasks,
       (select count(*)::text from documents where tenant_id = $1 and id like $13) as documents`,
    [
      TENANT_ID,
      `${PREFIX}-appt-%`,
      `${PREFIX}-enc-%`,
      `${PREFIX}-rx-%`,
      `${PREFIX}-order-%`,
      `${PREFIX}-lab-%`,
      `${PREFIX}-path-%`,
      `${PREFIX}-charge-%`,
      `${PREFIX}-bill-%`,
      `${PREFIX}-payment-%`,
      `${PREFIX}-claim-%`,
      `${PREFIX}-task-%`,
      `${PREFIX}-doc-%`,
    ],
  );
  const flowRows = await query<{
    completedAppointments: string;
    avgCheckinDelayMinutes: string;
    avgWaitMinutes: string;
    medianWaitMinutes: string;
    maxWaitMinutes: string;
    avgCycleMinutes: string;
  }>(
    `select
       count(*)::text as "completedAppointments",
       round(avg(extract(epoch from (checked_in_at - scheduled_start)) / 60)::numeric, 1)::text as "avgCheckinDelayMinutes",
       round(avg(extract(epoch from (roomed_at - arrived_at)) / 60)::numeric, 1)::text as "avgWaitMinutes",
       round((percentile_cont(0.5) within group (order by extract(epoch from (roomed_at - arrived_at)) / 60))::numeric, 1)::text as "medianWaitMinutes",
       round(max(extract(epoch from (roomed_at - arrived_at)) / 60)::numeric, 1)::text as "maxWaitMinutes",
       round(avg(extract(epoch from (completed_at - checked_in_at)) / 60)::numeric, 1)::text as "avgCycleMinutes"
     from appointments
     where tenant_id = $1
       and id like $2
       and status = 'completed'
       and checked_in_at is not null
       and roomed_at is not null
       and completed_at is not null`,
    [TENANT_ID, `${PREFIX}-appt-%`],
  );

  console.log("Seed complete.");
  console.log(`Status breakdown: ${statusRows.map((row) => `${row.status}=${row.count}`).join(", ")}`);
  console.log(`Provider load: ${providerRows.map((row) => `${row.provider_name}=${row.count}`).join(", ")}`);
  console.log(`Artifacts: ${JSON.stringify(artifactRows[0])}`);
  console.log(`Flow metrics: ${JSON.stringify(flowRows[0])}`);
  console.log(`Open the deployed schedule for ${CLINIC_DATE} in Railway to review the simulated day.`);
}

seedMondayClinicDay()
  .catch((error) => {
    console.error("Failed to seed Monday clinic day:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => undefined);
  });
