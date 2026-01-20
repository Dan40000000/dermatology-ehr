import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { pool } from "./pool";
import { seedProtocols } from "./seed-protocols";

async function seed() {
  await pool.query("begin");
  try {
    const tenantId = "tenant-demo";
    await pool.query(
      `insert into tenants(id, name) values ($1, $2) on conflict (id) do nothing`,
      [tenantId, "Demo Dermatology"],
    );

    const users = [
      { id: "u-admin", email: "admin@demo.practice", role: "admin", fullName: "Admin User" },
      { id: "u-provider", email: "provider@demo.practice", role: "provider", fullName: "Derm Provider" },
      { id: "u-ma", email: "ma@demo.practice", role: "ma", fullName: "Medical Assistant" },
      { id: "u-front", email: "frontdesk@demo.practice", role: "front_desk", fullName: "Front Desk" },
    ];

    const passwordHash = bcrypt.hashSync("Password123!", 12); // Dev/test only
    for (const u of users) {
      await pool.query(
        `insert into users(id, tenant_id, email, full_name, role, password_hash)
         values ($1,$2,$3,$4,$5,$6)
         on conflict (id) do nothing`,
        [u.id, tenantId, u.email, u.fullName, u.role, passwordHash],
      );
    }

    const patients = [
      // Original demo patients
      {
        id: "p-demo",
        first_name: "Jamie",
        last_name: "Patient",
        dob: "1990-01-01",
        phone: "555-0101",
        email: "jamie.patient@example.com",
        address: "100 Skin Way",
        city: "Dermaville",
        state: "CO",
        zip: "80000",
        insurance: "Acme Health",
        allergies: "Penicillin",
        medications: "Topical cream",
      },
      {
        id: "p-demo-2",
        first_name: "Alex",
        last_name: "Derm",
        dob: "1985-02-02",
        phone: "555-0202",
        email: "alex.derm@example.com",
        address: "200 Mole Ave",
        city: "Dermaville",
        state: "CO",
        zip: "80001",
        insurance: "Acme Health",
        allergies: null,
        medications: null,
      },
      // Adults with common dermatology conditions
      {
        id: "p-001",
        first_name: "Sarah",
        last_name: "Johnson",
        dob: "1988-05-15",
        phone: "555-1001",
        email: "sarah.johnson@email.com",
        address: "456 Oak Street",
        city: "Denver",
        state: "CO",
        zip: "80202",
        insurance: "United Healthcare",
        allergies: "Sulfa drugs",
        medications: "Accutane, Birth control",
      },
      {
        id: "p-002",
        first_name: "Michael",
        last_name: "Chen",
        dob: "1975-11-22",
        phone: "555-1002",
        email: "michael.chen@email.com",
        address: "789 Maple Drive",
        city: "Boulder",
        state: "CO",
        zip: "80301",
        insurance: "Kaiser Permanente",
        allergies: "None",
        medications: "Enbrel (psoriasis), Metformin",
      },
      {
        id: "p-003",
        first_name: "Emily",
        last_name: "Rodriguez",
        dob: "1992-03-08",
        phone: "555-1003",
        email: "emily.r@email.com",
        address: "321 Pine Lane",
        city: "Aurora",
        state: "CO",
        zip: "80010",
        insurance: "Cigna",
        allergies: "Latex, Adhesive tape",
        medications: "Dupixent (eczema)",
      },
      {
        id: "p-004",
        first_name: "Robert",
        last_name: "Williams",
        dob: "1965-09-30",
        phone: "555-1004",
        email: "bob.williams@email.com",
        address: "654 Elm Street",
        city: "Lakewood",
        state: "CO",
        zip: "80226",
        insurance: "Medicare + AARP",
        allergies: "Penicillin, Codeine",
        medications: "Lisinopril, Aspirin, Efudex cream",
      },
      {
        id: "p-005",
        first_name: "Jennifer",
        last_name: "Martinez",
        dob: "1980-07-12",
        phone: "555-1005",
        email: "jen.martinez@email.com",
        address: "987 Cedar Avenue",
        city: "Englewood",
        state: "CO",
        zip: "80110",
        insurance: "Anthem Blue Cross",
        allergies: "None",
        medications: "Spironolactone (acne), Tretinoin cream",
      },
      // Teenagers with acne
      {
        id: "p-006",
        first_name: "Tyler",
        last_name: "Anderson",
        dob: "2008-01-20",
        phone: "555-1006",
        email: "tyler.a@email.com",
        address: "147 Birch Road",
        city: "Highlands Ranch",
        state: "CO",
        zip: "80129",
        insurance: "UnitedHealthcare",
        allergies: "None",
        medications: "Doxycycline, Benzoyl peroxide gel",
      },
      {
        id: "p-007",
        first_name: "Madison",
        last_name: "Taylor",
        dob: "2007-06-14",
        phone: "555-1007",
        email: "madison.t@email.com",
        address: "258 Willow Street",
        city: "Littleton",
        state: "CO",
        zip: "80120",
        insurance: "Cigna",
        allergies: "None",
        medications: "Tretinoin, Clindamycin gel",
      },
      // Seniors with skin cancer history
      {
        id: "p-008",
        first_name: "Dorothy",
        last_name: "Thompson",
        dob: "1945-04-05",
        phone: "555-1008",
        email: "dorothy.t@email.com",
        address: "369 Aspen Way",
        city: "Denver",
        state: "CO",
        zip: "80203",
        insurance: "Medicare + Medigap",
        allergies: "Morphine",
        medications: "Warfarin, Metoprolol, Fluorouracil cream",
      },
      {
        id: "p-009",
        first_name: "Harold",
        last_name: "Garcia",
        dob: "1952-12-18",
        phone: "555-1009",
        email: "harold.g@email.com",
        address: "741 Spruce Court",
        city: "Westminster",
        state: "CO",
        zip: "80030",
        insurance: "Medicare",
        allergies: "None",
        medications: "Atorvastatin, Amlodipine, Imiquimod cream",
      },
      // Middle-aged patients with various conditions
      {
        id: "p-010",
        first_name: "Lisa",
        last_name: "Brown",
        dob: "1978-08-25",
        phone: "555-1010",
        email: "lisa.brown@email.com",
        address: "852 Cottonwood Lane",
        city: "Arvada",
        state: "CO",
        zip: "80002",
        insurance: "Aetna",
        allergies: "Aspirin",
        medications: "Humira (psoriasis), Levothyroxine",
      },
      {
        id: "p-011",
        first_name: "David",
        last_name: "Lee",
        dob: "1970-02-14",
        phone: "555-1011",
        email: "david.lee@email.com",
        address: "963 Juniper Drive",
        city: "Thornton",
        state: "CO",
        zip: "80229",
        insurance: "Kaiser",
        allergies: "Iodine",
        medications: "Metformin, Rosuvastatin",
      },
      // Young adults
      {
        id: "p-012",
        first_name: "Ashley",
        last_name: "White",
        dob: "1998-10-03",
        phone: "555-1012",
        email: "ashley.w@email.com",
        address: "159 Poplar Street",
        city: "Castle Rock",
        state: "CO",
        zip: "80104",
        insurance: "Parents' Cigna Plan",
        allergies: "None",
        medications: "None",
      },
      {
        id: "p-013",
        first_name: "Joshua",
        last_name: "Harris",
        dob: "1995-05-28",
        phone: "555-1013",
        email: "josh.harris@email.com",
        address: "357 Hickory Avenue",
        city: "Parker",
        state: "CO",
        zip: "80134",
        insurance: "Self-pay (No insurance)",
        allergies: "None",
        medications: "None",
      },
      // Patients with rosacea
      {
        id: "p-014",
        first_name: "Karen",
        last_name: "Wilson",
        dob: "1968-09-07",
        phone: "555-1014",
        email: "karen.w@email.com",
        address: "486 Redwood Court",
        city: "Centennial",
        state: "CO",
        zip: "80015",
        insurance: "United Healthcare",
        allergies: "None",
        medications: "Soolantra, Metronidazole gel",
      },
      {
        id: "p-015",
        first_name: "Brian",
        last_name: "Moore",
        dob: "1973-11-11",
        phone: "555-1015",
        email: "brian.m@email.com",
        address: "597 Sycamore Lane",
        city: "Broomfield",
        state: "CO",
        zip: "80020",
        insurance: "Anthem",
        allergies: "Sulfa",
        medications: "Rhofade, Mirvaso gel",
      },
      // Kids with eczema
      {
        id: "p-016",
        first_name: "Emma",
        last_name: "Clark",
        dob: "2015-03-22",
        phone: "555-1016",
        email: "emma.clark.parent@email.com",
        address: "684 Magnolia Street",
        city: "Louisville",
        state: "CO",
        zip: "80027",
        insurance: "Cigna Family Plan",
        allergies: "Peanuts, Tree nuts",
        medications: "Eucrisa, Cetirizine",
      },
      {
        id: "p-017",
        first_name: "Liam",
        last_name: "Young",
        dob: "2013-07-09",
        phone: "555-1017",
        email: "liam.young.parent@email.com",
        address: "795 Walnut Drive",
        city: "Superior",
        state: "CO",
        zip: "80027",
        insurance: "Kaiser Family",
        allergies: "Eggs",
        medications: "Tacrolimus ointment, Hydroxyzine",
      },
      // Patients with moles/lesions for monitoring
      {
        id: "p-018",
        first_name: "Amanda",
        last_name: "King",
        dob: "1982-04-16",
        phone: "555-1018",
        email: "amanda.king@email.com",
        address: "816 Chestnut Avenue",
        city: "Golden",
        state: "CO",
        zip: "80401",
        insurance: "Aetna",
        allergies: "None",
        medications: "None",
      },
      {
        id: "p-019",
        first_name: "Christopher",
        last_name: "Scott",
        dob: "1987-12-01",
        phone: "555-1019",
        email: "chris.scott@email.com",
        address: "927 Beech Road",
        city: "Lafayette",
        state: "CO",
        zip: "80026",
        insurance: "United Healthcare",
        allergies: "None",
        medications: "None",
      },
      // Patients with fungal infections
      {
        id: "p-020",
        first_name: "Michelle",
        last_name: "Adams",
        dob: "1991-06-19",
        phone: "555-1020",
        email: "michelle.a@email.com",
        address: "138 Cypress Lane",
        city: "Wheat Ridge",
        state: "CO",
        zip: "80033",
        insurance: "Medicaid",
        allergies: "None",
        medications: "Terbinafine (oral), Clotrimazole cream",
      },
      // Additional diverse patients
      {
        id: "p-021",
        first_name: "Daniel",
        last_name: "Baker",
        dob: "1959-08-08",
        phone: "555-1021",
        email: "dan.baker@email.com",
        address: "249 Dogwood Street",
        city: "Greenwood Village",
        state: "CO",
        zip: "80111",
        insurance: "Medicare",
        allergies: "None",
        medications: "Multiple (diabetic)",
      },
      {
        id: "p-022",
        first_name: "Stephanie",
        last_name: "Nelson",
        dob: "1986-01-27",
        phone: "555-1022",
        email: "steph.nelson@email.com",
        address: "360 Laurel Court",
        city: "Lone Tree",
        state: "CO",
        zip: "80124",
        insurance: "Cigna",
        allergies: "Latex",
        medications: "None",
      },
      {
        id: "p-023",
        first_name: "Kevin",
        last_name: "Carter",
        dob: "2005-09-13",
        phone: "555-1023",
        email: "kevin.c@email.com",
        address: "471 Hawthorn Avenue",
        city: "Highlands Ranch",
        state: "CO",
        zip: "80130",
        insurance: "Parents' Anthem",
        allergies: "None",
        medications: "None",
      },
      {
        id: "p-024",
        first_name: "Rebecca",
        last_name: "Mitchell",
        dob: "1977-03-31",
        phone: "555-1024",
        email: "becky.mitchell@email.com",
        address: "582 Elderberry Drive",
        city: "Englewood",
        state: "CO",
        zip: "80113",
        insurance: "Aetna",
        allergies: "Shellfish",
        medications: "Stelara (psoriasis)",
      },
      {
        id: "p-025",
        first_name: "Jason",
        last_name: "Perez",
        dob: "1993-11-05",
        phone: "555-1025",
        email: "jason.p@email.com",
        address: "693 Holly Lane",
        city: "Commerce City",
        state: "CO",
        zip: "80022",
        insurance: "Self-pay",
        allergies: "None",
        medications: "None",
      },
      {
        id: "p-026",
        first_name: "Laura",
        last_name: "Roberts",
        dob: "1969-07-24",
        phone: "555-1026",
        email: "laura.roberts@email.com",
        address: "704 Ivy Street",
        city: "Federal Heights",
        state: "CO",
        zip: "80260",
        insurance: "Kaiser",
        allergies: "Penicillin",
        medications: "Lisinopril, Metformin",
      },
      {
        id: "p-027",
        first_name: "Matthew",
        last_name: "Turner",
        dob: "2010-02-17",
        phone: "555-1027",
        email: "matt.turner.parent@email.com",
        address: "815 Fir Avenue",
        city: "Northglenn",
        state: "CO",
        zip: "80233",
        insurance: "Medicaid",
        allergies: "None",
        medications: "None",
      },
      {
        id: "p-028",
        first_name: "Nicole",
        last_name: "Phillips",
        dob: "1984-05-09",
        phone: "555-1028",
        email: "nicole.p@email.com",
        address: "926 Buckeye Road",
        city: "Morrison",
        state: "CO",
        zip: "80465",
        insurance: "United Healthcare",
        allergies: "None",
        medications: "None",
      },
      {
        id: "p-029",
        first_name: "Andrew",
        last_name: "Campbell",
        dob: "1996-10-21",
        phone: "555-1029",
        email: "andrew.c@email.com",
        address: "137 Hemlock Court",
        city: "Ken Caryl",
        state: "CO",
        zip: "80127",
        insurance: "Cigna",
        allergies: "None",
        medications: "Finasteride (hair loss)",
      },
      {
        id: "p-030",
        first_name: "Samantha",
        last_name: "Parker",
        dob: "1951-12-30",
        phone: "555-1030",
        email: "sam.parker@email.com",
        address: "248 Sequoia Lane",
        city: "Sheridan",
        state: "CO",
        zip: "80110",
        insurance: "Medicare + AARP",
        allergies: "Codeine",
        medications: "Warfarin, Amlodipine",
      },
    ];

    for (const p of patients) {
      await pool.query(
        `insert into patients(id, tenant_id, first_name, last_name, dob, phone, email, address, city, state, zip, insurance, allergies, medications)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         on conflict (id) do nothing`,
        [
          p.id,
          tenantId,
          p.first_name,
          p.last_name,
          p.dob,
          p.phone,
          p.email,
          p.address,
          p.city,
          p.state,
          p.zip,
          p.insurance,
          p.allergies,
          p.medications,
        ],
      );
    }

    const providers = [
      { id: "prov-demo", name: "Dr. Skin", specialty: "Dermatology" },
      { id: "prov-demo-2", name: "PA Riley", specialty: "Dermatology" },
      { id: "prov-demo-3", name: "Dr. Martinez", specialty: "Dermatology" },
      { id: "prov-cosmetic-pa", name: "Sarah Mitchell PA-C", specialty: "Cosmetic Dermatology" },
    ];

    for (const pr of providers) {
      await pool.query(
        `insert into providers(id, tenant_id, full_name, specialty)
         values ($1,$2,$3,$4) on conflict (id) do nothing`,
        [pr.id, tenantId, pr.name, pr.specialty],
      );
    }

    // Facilities (Locations)
    const locations = [
      { id: "loc-demo", name: "Main Clinic", address: "123 Skin St, Denver, CO 80202", phone: "(303) 555-0100" },
      { id: "loc-east", name: "East Office", address: "456 Aurora Ave, Aurora, CO 80010", phone: "(303) 555-0101" },
      { id: "loc-south", name: "South Campus", address: "789 Littleton Blvd, Littleton, CO 80123", phone: "(303) 555-0102" },
    ];

    for (const loc of locations) {
      await pool.query(
        `insert into locations(id, tenant_id, name, address, phone, is_active)
         values ($1,$2,$3,$4,$5,true) on conflict (id) do update set phone = $5, is_active = true`,
        [loc.id, tenantId, loc.name, loc.address, loc.phone],
      );
    }

    const locationId = "loc-demo";

    // Rooms for each facility
    const rooms = [
      // Main Clinic rooms
      { id: "room-main-1", facilityId: "loc-demo", name: "Exam Room 1", roomType: "exam" },
      { id: "room-main-2", facilityId: "loc-demo", name: "Exam Room 2", roomType: "exam" },
      { id: "room-main-3", facilityId: "loc-demo", name: "Exam Room 3", roomType: "exam" },
      { id: "room-main-proc", facilityId: "loc-demo", name: "Procedure Room", roomType: "procedure" },
      { id: "room-main-photo", facilityId: "loc-demo", name: "Photo Room", roomType: "photo" },
      // East Office rooms
      { id: "room-east-1", facilityId: "loc-east", name: "Exam Room A", roomType: "exam" },
      { id: "room-east-2", facilityId: "loc-east", name: "Exam Room B", roomType: "exam" },
      { id: "room-east-proc", facilityId: "loc-east", name: "Minor Procedure", roomType: "procedure" },
      // South Campus rooms
      { id: "room-south-1", facilityId: "loc-south", name: "Suite 101", roomType: "exam" },
      { id: "room-south-2", facilityId: "loc-south", name: "Suite 102", roomType: "exam" },
      { id: "room-south-3", facilityId: "loc-south", name: "Suite 103", roomType: "exam" },
      { id: "room-south-proc", facilityId: "loc-south", name: "Surgical Suite", roomType: "procedure" },
    ];

    for (const room of rooms) {
      await pool.query(
        `insert into rooms(id, tenant_id, facility_id, name, room_type, is_active)
         values ($1,$2,$3,$4,$5,true) on conflict (id) do nothing`,
        [room.id, tenantId, room.facilityId, room.name, room.roomType],
      );
    }

    const apptTypes = [
      // Original basic types (keeping for backward compatibility with existing data)
      {
        id: "appttype-demo",
        name: "Derm Consult",
        duration: 30,
        color: "#3B82F6",
        category: "consultation",
        description: "General dermatology consultation"
      },
      {
        id: "appttype-fu",
        name: "Follow Up",
        duration: 20,
        color: "#10B981",
        category: "follow-up",
        description: "Follow-up visit"
      },
      {
        id: "appttype-proc",
        name: "Procedure",
        duration: 45,
        color: "#F59E0B",
        category: "procedure",
        description: "General procedure"
      },

      // Comprehensive Medical Dermatology Appointment Types

      // Cancer Screening & Evaluation
      {
        id: "appttype-fullbody-screening",
        name: "Full Body Skin Cancer Screening",
        duration: 45,
        color: "#DC2626",
        category: "screening",
        description: "Comprehensive full body examination for skin cancer detection and prevention"
      },
      {
        id: "appttype-melanoma-check",
        name: "Melanoma Check/Follow-up",
        duration: 30,
        color: "#B91C1C",
        category: "screening",
        description: "Focused melanoma surveillance and follow-up examination"
      },
      {
        id: "appttype-atypical-mole",
        name: "Atypical Mole Evaluation",
        duration: 30,
        color: "#EA580C",
        category: "screening",
        description: "Detailed evaluation of dysplastic or atypical nevi"
      },

      // Biopsy & Surgical Procedures
      {
        id: "appttype-lesion-biopsy",
        name: "Suspicious Lesion Biopsy",
        duration: 30,
        color: "#D97706",
        category: "procedure",
        description: "Skin biopsy of suspicious lesion for pathological evaluation"
      },
      {
        id: "appttype-cyst-removal",
        name: "Cyst Removal",
        duration: 30,
        color: "#CA8A04",
        category: "procedure",
        description: "Excision of epidermal or sebaceous cyst"
      },
      {
        id: "appttype-mohs-consult",
        name: "Mohs Surgery Consult",
        duration: 45,
        color: "#B45309",
        category: "consultation",
        description: "Pre-operative consultation for Mohs micrographic surgery"
      },

      // Treatment Procedures
      {
        id: "appttype-ak-treatment",
        name: "Actinic Keratosis Treatment",
        duration: 20,
        color: "#F97316",
        category: "procedure",
        description: "Cryotherapy or other treatment for pre-cancerous lesions"
      },
      {
        id: "appttype-wart-removal",
        name: "Wart Removal",
        duration: 15,
        color: "#FB923C",
        category: "procedure",
        description: "Removal of common, plantar, or flat warts"
      },
      {
        id: "appttype-skin-tag-removal",
        name: "Skin Tag Removal",
        duration: 15,
        color: "#FDBA74",
        category: "procedure",
        description: "Removal of benign skin tags"
      },

      // Chronic Skin Conditions - Follow-up
      {
        id: "appttype-psoriasis-fu",
        name: "Psoriasis Follow-up",
        duration: 20,
        color: "#8B5CF6",
        category: "follow-up",
        description: "Management and monitoring of psoriasis treatment"
      },
      {
        id: "appttype-eczema-visit",
        name: "Eczema/Dermatitis Visit",
        duration: 20,
        color: "#7C3AED",
        category: "follow-up",
        description: "Treatment and management of eczema or dermatitis"
      },
      {
        id: "appttype-rosacea-treatment",
        name: "Rosacea Treatment",
        duration: 20,
        color: "#6D28D9",
        category: "follow-up",
        description: "Management and treatment of rosacea"
      },

      // Acne Management
      {
        id: "appttype-acne-fu",
        name: "Acne Follow-up",
        duration: 15,
        color: "#EC4899",
        category: "follow-up",
        description: "Follow-up visit for acne treatment and management"
      },

      // Specialized Evaluations
      {
        id: "appttype-hair-loss",
        name: "Hair Loss Consultation",
        duration: 30,
        color: "#14B8A6",
        category: "consultation",
        description: "Evaluation and treatment planning for alopecia"
      },
      {
        id: "appttype-nail-disorder",
        name: "Nail Disorder Evaluation",
        duration: 20,
        color: "#0D9488",
        category: "consultation",
        description: "Diagnosis and treatment of nail conditions"
      },

      // Allergy & Testing
      {
        id: "appttype-patch-testing",
        name: "Contact Dermatitis Patch Testing",
        duration: 45,
        color: "#06B6D4",
        category: "testing",
        description: "Patch testing to identify allergens causing contact dermatitis"
      },

      // Phototherapy
      {
        id: "appttype-phototherapy-fu",
        name: "Phototherapy Follow-up",
        duration: 15,
        color: "#0EA5E9",
        category: "follow-up",
        description: "Follow-up visit during phototherapy treatment course"
      },

      // Cosmetic Dermatology Appointment Types (Pink/Purple tones)

      // Botox & Injectable Treatments
      {
        id: "appttype-botox-consult",
        name: "Botox Consultation",
        duration: 30,
        color: "#EC4899",
        category: "cosmetic",
        description: "Consultation for botulinum toxin treatment to reduce wrinkles and fine lines"
      },
      {
        id: "appttype-botox-treatment",
        name: "Botox Treatment",
        duration: 30,
        color: "#DB2777",
        category: "cosmetic",
        description: "Botulinum toxin injection treatment for facial rejuvenation"
      },
      {
        id: "appttype-filler-consult",
        name: "Dermal Filler Consultation",
        duration: 30,
        color: "#F472B6",
        category: "cosmetic",
        description: "Consultation for hyaluronic acid or other dermal filler treatments"
      },
      {
        id: "appttype-filler-treatment",
        name: "Dermal Filler Treatment",
        duration: 45,
        color: "#E879F9",
        category: "cosmetic",
        description: "Injectable dermal filler treatment for volume restoration and facial contouring"
      },
      {
        id: "appttype-kybella",
        name: "Kybella Treatment",
        duration: 30,
        color: "#C084FC",
        category: "cosmetic",
        description: "Kybella injection for reduction of submental fullness (double chin)"
      },

      // Chemical & Facial Treatments
      {
        id: "appttype-chemical-peel",
        name: "Chemical Peel",
        duration: 45,
        color: "#C026D3",
        category: "cosmetic",
        description: "Chemical exfoliation treatment to improve skin texture and appearance"
      },
      {
        id: "appttype-hydrafacial",
        name: "Hydrafacial",
        duration: 45,
        color: "#F0ABFC",
        category: "cosmetic",
        description: "Multi-step facial treatment with cleansing, exfoliation, and hydration"
      },
      {
        id: "appttype-microderm",
        name: "Microdermabrasion",
        duration: 30,
        color: "#FCA5A5",
        category: "cosmetic",
        description: "Mechanical exfoliation treatment to improve skin texture and tone"
      },

      // Laser & Energy-Based Treatments
      {
        id: "appttype-microneedling",
        name: "Microneedling",
        duration: 60,
        color: "#A855F7",
        category: "cosmetic",
        description: "Collagen induction therapy to improve skin texture, scars, and fine lines"
      },
      {
        id: "appttype-laser-hair",
        name: "Laser Hair Removal",
        duration: 30,
        color: "#9333EA",
        category: "cosmetic",
        description: "Laser treatment for permanent hair reduction"
      },
      {
        id: "appttype-ipl",
        name: "IPL Photofacial",
        duration: 45,
        color: "#7C3AED",
        category: "cosmetic",
        description: "Intense pulsed light treatment for sun damage, pigmentation, and redness"
      },
      {
        id: "appttype-laser-resurface",
        name: "Laser Skin Resurfacing",
        duration: 60,
        color: "#8B5CF6",
        category: "cosmetic",
        description: "Ablative or non-ablative laser treatment for skin rejuvenation"
      },
      {
        id: "appttype-tattoo-removal",
        name: "Laser Tattoo Removal",
        duration: 30,
        color: "#F87171",
        category: "cosmetic",
        description: "Q-switched laser treatment for tattoo removal"
      },

      // Specialized Cosmetic Treatments
      {
        id: "appttype-prp-hair",
        name: "PRP Hair Restoration",
        duration: 60,
        color: "#D946EF",
        category: "cosmetic",
        description: "Platelet-rich plasma injections for hair loss and thinning"
      },
      {
        id: "appttype-scar-treatment",
        name: "Scar Treatment",
        duration: 30,
        color: "#FB7185",
        category: "cosmetic",
        description: "Treatment for acne scars, surgical scars, or other scar revision"
      },

      // Cosmetic Consultations & Follow-ups
      {
        id: "appttype-tattoo-consult",
        name: "Tattoo Removal Consultation",
        duration: 20,
        color: "#FDA4AF",
        category: "cosmetic",
        description: "Initial consultation for laser tattoo removal treatment planning"
      },
      {
        id: "appttype-cosmetic-consult",
        name: "Cosmetic Consultation",
        duration: 30,
        color: "#FBB6CE",
        category: "cosmetic",
        description: "Comprehensive consultation for cosmetic dermatology services"
      },
      {
        id: "appttype-cosmetic-fu",
        name: "Follow-up Cosmetic",
        duration: 15,
        color: "#FBCFE8",
        category: "cosmetic",
        description: "Follow-up visit after cosmetic procedure or treatment"
      },
    ];

    for (const at of apptTypes) {
      await pool.query(
        `insert into appointment_types(id, tenant_id, name, duration_minutes, color, category, description)
         values ($1,$2,$3,$4,$5,$6,$7)
         on conflict (id) do update set
           name = EXCLUDED.name,
           duration_minutes = EXCLUDED.duration_minutes,
           color = EXCLUDED.color,
           category = EXCLUDED.category,
           description = EXCLUDED.description`,
        [at.id, tenantId, at.name, at.duration, at.color, at.category, at.description],
      );
    }

    const availability = [
      // Dr. Skin (prov-demo): Monday-Friday, 8am-5pm
      { provider: "prov-demo", day_of_week: 1, start_time: "08:00", end_time: "17:00" },
      { provider: "prov-demo", day_of_week: 2, start_time: "08:00", end_time: "17:00" },
      { provider: "prov-demo", day_of_week: 3, start_time: "08:00", end_time: "17:00" },
      { provider: "prov-demo", day_of_week: 4, start_time: "08:00", end_time: "17:00" },
      { provider: "prov-demo", day_of_week: 5, start_time: "08:00", end_time: "17:00" },
      // PA Riley (prov-demo-2): Monday-Friday, 8am-6pm
      { provider: "prov-demo-2", day_of_week: 1, start_time: "08:00", end_time: "18:00" },
      { provider: "prov-demo-2", day_of_week: 2, start_time: "08:00", end_time: "18:00" },
      { provider: "prov-demo-2", day_of_week: 3, start_time: "08:00", end_time: "18:00" },
      { provider: "prov-demo-2", day_of_week: 4, start_time: "08:00", end_time: "18:00" },
      { provider: "prov-demo-2", day_of_week: 5, start_time: "08:00", end_time: "18:00" },
      // Dr. Martinez (prov-demo-3): Monday-Friday, 8am-5pm
      { provider: "prov-demo-3", day_of_week: 1, start_time: "08:00", end_time: "17:00" },
      { provider: "prov-demo-3", day_of_week: 2, start_time: "08:00", end_time: "17:00" },
      { provider: "prov-demo-3", day_of_week: 3, start_time: "08:00", end_time: "17:00" },
      { provider: "prov-demo-3", day_of_week: 4, start_time: "08:00", end_time: "17:00" },
      { provider: "prov-demo-3", day_of_week: 5, start_time: "08:00", end_time: "17:00" },
      // Sarah Mitchell PA-C (prov-cosmetic-pa): Monday-Friday, 8am-5pm
      { provider: "prov-cosmetic-pa", day_of_week: 1, start_time: "08:00", end_time: "17:00" },
      { provider: "prov-cosmetic-pa", day_of_week: 2, start_time: "08:00", end_time: "17:00" },
      { provider: "prov-cosmetic-pa", day_of_week: 3, start_time: "08:00", end_time: "17:00" },
      { provider: "prov-cosmetic-pa", day_of_week: 4, start_time: "08:00", end_time: "17:00" },
      { provider: "prov-cosmetic-pa", day_of_week: 5, start_time: "08:00", end_time: "17:00" },
    ];

    for (const slot of availability) {
      await pool.query(
        `insert into provider_availability(id, tenant_id, provider_id, day_of_week, start_time, end_time)
         values ($1,$2,$3,$4,$5,$6) on conflict (id) do nothing`,
        [randomUUID(), tenantId, slot.provider, slot.day_of_week, slot.start_time, slot.end_time],
      );
    }

    // Clear existing appointments to regenerate with fresh dates
    // First clear dependent tables
    await pool.query(`DELETE FROM appointment_status_history WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM appointments WHERE tenant_id = $1`, [tenantId]);

    const now = new Date();
    const start = new Date(now.getTime() + 60 * 60 * 1000);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    await pool.query(
      `insert into appointments(id, tenant_id, patient_id, provider_id, location_id, appointment_type_id, scheduled_start, scheduled_end, status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (id) do nothing`,
      [
        randomUUID(),
        tenantId,
        "p-demo",
        "prov-demo",
        locationId,
        "appttype-demo",
        start.toISOString(),
        end.toISOString(),
        "scheduled",
      ],
    );

    await pool.query(
      `insert into appointments(id, tenant_id, patient_id, provider_id, location_id, appointment_type_id, scheduled_start, scheduled_end, status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (id) do nothing`,
      [
        randomUUID(),
        tenantId,
        "p-demo-2",
        "prov-demo-2",
        locationId,
        "appttype-fu",
        new Date(start.getTime() + 2 * 60 * 60 * 1000).toISOString(),
        new Date(end.getTime() + 2 * 60 * 60 * 1000).toISOString(),
        "scheduled",
      ],
    );

    // Generate appointments for Dr. Skin (prov-demo) and PA Riley (prov-demo-2)
    // Using similar logic to Dr. Martinez to ensure they have appointments on the schedule
    const otherProviderPatients = [
      "p-001", "p-002", "p-003", "p-004", "p-005", "p-006", "p-007", "p-008", "p-009", "p-010",
      "p-demo", "p-demo-2",
    ];

    // Dr. Skin appointments - spread across next 60 days
    let skinApptCounter = 1;
    let skinPatientIndex = 0;
    let skinRandomSeed = 67890;
    const skinSeededRandom = () => {
      skinRandomSeed = (skinRandomSeed * 1103515245 + 12345) & 0x7fffffff;
      return skinRandomSeed / 0x7fffffff;
    };

    for (let dayOffset = 0; dayOffset <= 60; dayOffset++) {
      const apptDate = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
      const dayOfWeek = apptDate.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) continue; // Skip weekends
      if (skinSeededRandom() < 0.15) continue; // Skip some days

      const apptsPerDay = Math.floor(skinSeededRandom() * 5) + 4; // 4-8 appointments
      let currentHour = 8;
      let currentMinute = 0;

      for (let apptNum = 0; apptNum < apptsPerDay; apptNum++) {
        const extraGap = Math.floor(skinSeededRandom() * 2) * 15;
        currentMinute += extraGap;
        while (currentMinute >= 60) { currentMinute -= 60; currentHour++; }
        if (currentHour >= 16) break;

        const apptStart = new Date(apptDate);
        apptStart.setHours(currentHour, currentMinute, 0, 0);

        const typeRoll = skinSeededRandom();
        let duration = typeRoll < 0.5 ? 20 : (typeRoll < 0.8 ? 30 : 45);
        let apptTypeId = typeRoll < 0.5 ? "appttype-fu" : (typeRoll < 0.8 ? "appttype-demo" : "appttype-proc");

        const apptEnd = new Date(apptStart.getTime() + duration * 60 * 1000);
        currentMinute += duration;
        while (currentMinute >= 60) { currentMinute -= 60; currentHour++; }

        if (skinSeededRandom() < 0.7) skinPatientIndex++;
        const patientId = otherProviderPatients[skinPatientIndex % otherProviderPatients.length];

        let status = "scheduled";
        if (dayOffset <= 0) status = "completed";
        else if (dayOffset <= 3 && skinSeededRandom() < 0.3) status = "checked_in";
        else if (dayOffset > 14 && skinSeededRandom() < 0.06) status = "cancelled";

        await pool.query(
          `insert into appointments(id, tenant_id, patient_id, provider_id, location_id, appointment_type_id, scheduled_start, scheduled_end, status)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           on conflict (id) do nothing`,
          [
            `appt-skin-${String(skinApptCounter).padStart(4, "0")}`,
            tenantId,
            patientId,
            "prov-demo",
            locationId,
            apptTypeId,
            apptStart.toISOString(),
            apptEnd.toISOString(),
            status,
          ],
        );
        skinApptCounter++;
      }
    }

    // PA Riley appointments - spread across next 60 days
    let rileyApptCounter = 1;
    let rileyPatientIndex = 0;
    let rileyRandomSeed = 54321;
    const rileySeededRandom = () => {
      rileyRandomSeed = (rileyRandomSeed * 1103515245 + 12345) & 0x7fffffff;
      return rileyRandomSeed / 0x7fffffff;
    };

    for (let dayOffset = 0; dayOffset <= 60; dayOffset++) {
      const apptDate = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
      const dayOfWeek = apptDate.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) continue; // Skip weekends
      if (rileySeededRandom() < 0.12) continue; // Skip some days

      const apptsPerDay = Math.floor(rileySeededRandom() * 6) + 5; // 5-10 appointments (PA sees more patients)
      let currentHour = 8;
      let currentMinute = 0;

      for (let apptNum = 0; apptNum < apptsPerDay; apptNum++) {
        const extraGap = Math.floor(rileySeededRandom() * 2) * 15;
        currentMinute += extraGap;
        while (currentMinute >= 60) { currentMinute -= 60; currentHour++; }
        if (currentHour >= 17) break; // PA works until 6pm

        const apptStart = new Date(apptDate);
        apptStart.setHours(currentHour, currentMinute, 0, 0);

        const typeRoll = rileySeededRandom();
        let duration = typeRoll < 0.6 ? 20 : (typeRoll < 0.9 ? 30 : 45);
        let apptTypeId = typeRoll < 0.6 ? "appttype-fu" : (typeRoll < 0.9 ? "appttype-demo" : "appttype-proc");

        const apptEnd = new Date(apptStart.getTime() + duration * 60 * 1000);
        currentMinute += duration;
        while (currentMinute >= 60) { currentMinute -= 60; currentHour++; }

        if (rileySeededRandom() < 0.7) rileyPatientIndex++;
        const patientId = otherProviderPatients[rileyPatientIndex % otherProviderPatients.length];

        let status = "scheduled";
        if (dayOffset <= 0) status = "completed";
        else if (dayOffset <= 3 && rileySeededRandom() < 0.25) status = "checked_in";
        else if (dayOffset > 14 && rileySeededRandom() < 0.05) status = "cancelled";

        await pool.query(
          `insert into appointments(id, tenant_id, patient_id, provider_id, location_id, appointment_type_id, scheduled_start, scheduled_end, status)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           on conflict (id) do nothing`,
          [
            `appt-riley-${String(rileyApptCounter).padStart(4, "0")}`,
            tenantId,
            patientId,
            "prov-demo-2",
            locationId,
            apptTypeId,
            apptStart.toISOString(),
            apptEnd.toISOString(),
            status,
          ],
        );
        rileyApptCounter++;
      }
    }

    // Dr. Martinez appointments - spread across next 3 months (90 days)
    const martinezPatients = [
      // Patient IDs to use (mix of all patients)
      "p-001", "p-002", "p-003", "p-004", "p-005", "p-006", "p-007", "p-008", "p-009", "p-010",
      "p-011", "p-012", "p-013", "p-014", "p-015", "p-016", "p-017", "p-018", "p-019", "p-020",
      "p-021", "p-022", "p-023", "p-024", "p-025", "p-026", "p-027", "p-028", "p-029", "p-030",
    ];

    // Appointment types to rotate through (expanded with new dermatology types)
    const apptTypesForMartinez = [
      { id: "appttype-demo", duration: 30 },                    // Derm Consult
      { id: "appttype-fu", duration: 20 },                      // Follow Up
      { id: "appttype-proc", duration: 45 },                    // Procedure
      { id: "appttype-fullbody-screening", duration: 45 },      // Full Body Screening
      { id: "appttype-melanoma-check", duration: 30 },          // Melanoma Check
      { id: "appttype-lesion-biopsy", duration: 30 },           // Biopsy
      { id: "appttype-psoriasis-fu", duration: 20 },            // Psoriasis
      { id: "appttype-eczema-visit", duration: 20 },            // Eczema
      { id: "appttype-acne-fu", duration: 15 },                 // Acne
      { id: "appttype-ak-treatment", duration: 20 },            // AK Treatment
      { id: "appttype-wart-removal", duration: 15 },            // Wart Removal
    ];

    // Location IDs to rotate through
    const locationIds = ["loc-demo", "loc-east", "loc-south"];

    // Simple seeded random function for reproducible randomization
    let randomSeed = 12345;
    const seededRandom = () => {
      randomSeed = (randomSeed * 1103515245 + 12345) & 0x7fffffff;
      return randomSeed / 0x7fffffff;
    };

    let apptCounter = 1;
    let patientIndex = 0;

    // Create appointments for next 90 days (3 months, weekdays only) - start from today
    for (let dayOffset = 0; dayOffset <= 90; dayOffset++) {
      const apptDate = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
      const dayOfWeek = apptDate.getDay();

      // Skip weekends (0 = Sunday, 6 = Saturday)
      if (dayOfWeek === 0 || dayOfWeek === 6) continue;

      // Randomly skip some days (simulating PTO, conferences, etc.) - about 10% of days
      if (seededRandom() < 0.1) continue;

      // Random number of appointments per day (3-8)
      const baseAppts = Math.floor(seededRandom() * 6) + 3; // 3-8 appointments

      // Mondays and Fridays tend to be busier
      const apptsPerDay = (dayOfWeek === 1 || dayOfWeek === 5)
        ? Math.min(baseAppts + 2, 8)
        : baseAppts;

      // Random start times array (possible start hours: 8, 8:30, 9, 9:30, etc.)
      const possibleStartMinutes = [0, 15, 30, 45];
      let currentHour = 8;
      let currentMinute = 0;

      for (let apptNum = 0; apptNum < apptsPerDay; apptNum++) {
        // Add some random gaps between appointments (0-30 min extra)
        const extraGap = Math.floor(seededRandom() * 3) * 15; // 0, 15, or 30 min gap
        currentMinute += extraGap;
        while (currentMinute >= 60) {
          currentMinute -= 60;
          currentHour++;
        }

        // Don't schedule past 4pm (leave time for paperwork)
        if (currentHour >= 16) break;

        const apptStart = new Date(apptDate);
        apptStart.setHours(currentHour, currentMinute, 0, 0);

        // Weighted random appointment type distribution
        const typeRoll = seededRandom();
        let apptType: { id: string; duration: number };
        if (typeRoll < 0.25) {
          apptType = apptTypesForMartinez[1]!; // Follow Up (20 min)
        } else if (typeRoll < 0.40) {
          apptType = apptTypesForMartinez[0]!; // Derm Consult (30 min)
        } else if (typeRoll < 0.50) {
          apptType = apptTypesForMartinez[3]!; // Full Body Screening (45 min)
        } else if (typeRoll < 0.60) {
          apptType = apptTypesForMartinez[4]!; // Melanoma Check (30 min)
        } else if (typeRoll < 0.68) {
          apptType = apptTypesForMartinez[5]!; // Lesion Biopsy (30 min)
        } else if (typeRoll < 0.75) {
          apptType = apptTypesForMartinez[6]!; // Psoriasis FU (20 min)
        } else if (typeRoll < 0.82) {
          apptType = apptTypesForMartinez[7]!; // Eczema Visit (20 min)
        } else if (typeRoll < 0.88) {
          apptType = apptTypesForMartinez[8]!; // Acne FU (15 min)
        } else if (typeRoll < 0.94) {
          apptType = apptTypesForMartinez[9]!; // AK Treatment (20 min)
        } else {
          apptType = apptTypesForMartinez[10]!; // Wart Removal (15 min)
        }

        const apptEnd = new Date(apptStart.getTime() + apptType.duration * 60 * 1000);

        // Move current time forward by appointment duration
        currentMinute += apptType.duration;
        while (currentMinute >= 60) {
          currentMinute -= 60;
          currentHour++;
        }

        // Shuffle through patients (with some repeats - realistic follow-ups)
        if (seededRandom() < 0.7) {
          patientIndex++;
        }
        const patientId = martinezPatients[patientIndex % martinezPatients.length];

        // Location: mostly Main Clinic, occasional other locations
        const locRoll = seededRandom();
        let locationForAppt;
        if (locRoll < 0.6) {
          locationForAppt = locationIds[0]; // Main Clinic 60%
        } else if (locRoll < 0.85) {
          locationForAppt = locationIds[1]; // East Office 25%
        } else {
          locationForAppt = locationIds[2]; // South Campus 15%
        }

        // Mix of statuses based on how far in the future
        let status = "scheduled";
        if (dayOffset <= 0) {
          // Past - all completed
          status = "completed";
        } else if (dayOffset <= 3) {
          // Very near future - some checked in or in progress
          const statusRoll = seededRandom();
          if (statusRoll < 0.2) status = "checked_in";
          else if (statusRoll < 0.35) status = "in_room";
          else if (statusRoll < 0.45) status = "with_provider";
        } else if (dayOffset <= 14) {
          // Next 2 weeks - rarely cancelled
          if (seededRandom() < 0.05) status = "cancelled";
        } else {
          // Further out - more likely to be cancelled/rescheduled
          if (seededRandom() < 0.08) status = "cancelled";
        }

        await pool.query(
          `insert into appointments(id, tenant_id, patient_id, provider_id, location_id, appointment_type_id, scheduled_start, scheduled_end, status)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           on conflict (id) do nothing`,
          [
            `appt-martinez-${String(apptCounter).padStart(4, "0")}`,
            tenantId,
            patientId,
            "prov-demo-3",
            locationForAppt,
            apptType.id,
            apptStart.toISOString(),
            apptEnd.toISOString(),
            status,
          ],
        );

        apptCounter++;
      }
    }

    // Sarah Mitchell, PA-C appointments - Cosmetic specialist, spread across next 60 days
    const sarahPatients = [
      "p-001", "p-002", "p-003", "p-004", "p-005", "p-006", "p-007", "p-008", "p-009", "p-010",
      "p-011", "p-012", "p-013", "p-014", "p-015", "p-016", "p-017", "p-018", "p-019", "p-020",
      "p-021", "p-022", "p-023", "p-024", "p-025", "p-026", "p-027", "p-028", "p-029", "p-030",
    ];

    // Cosmetic appointment types for Sarah Mitchell
    const cosmeticApptTypes = [
      { id: "appttype-botox-consult", duration: 30 },
      { id: "appttype-botox-treatment", duration: 30 },
      { id: "appttype-filler-consult", duration: 30 },
      { id: "appttype-filler-treatment", duration: 45 },
      { id: "appttype-chemical-peel", duration: 45 },
      { id: "appttype-hydrafacial", duration: 45 },
      { id: "appttype-microderm", duration: 30 },
      { id: "appttype-microneedling", duration: 60 },
      { id: "appttype-cosmetic-consult", duration: 30 },
      { id: "appttype-cosmetic-fu", duration: 15 },
      { id: "appttype-kybella", duration: 30 },
      { id: "appttype-scar-treatment", duration: 30 },
    ];

    let sarahApptCounter = 1;
    let sarahPatientIndex = 0;
    let sarahRandomSeed = 98765;
    const sarahSeededRandom = () => {
      sarahRandomSeed = (sarahRandomSeed * 1103515245 + 12345) & 0x7fffffff;
      return sarahRandomSeed / 0x7fffffff;
    };

    // Extended to 120 days (through May 2026) for comprehensive scheduling
    for (let dayOffset = 0; dayOffset <= 120; dayOffset++) {
      const apptDate = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
      const dayOfWeek = apptDate.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) continue; // Skip weekends
      if (sarahSeededRandom() < 0.1) continue; // Skip some days (PTO, etc.)

      // Sarah sees 6-10 cosmetic patients per day (cosmetic procedures can be quicker)
      const apptsPerDay = Math.floor(sarahSeededRandom() * 5) + 6;
      let currentHour = 9; // Sarah starts at 9am
      let currentMinute = 0;

      for (let apptNum = 0; apptNum < apptsPerDay; apptNum++) {
        // Add random gaps between appointments
        const extraGap = Math.floor(sarahSeededRandom() * 2) * 15;
        currentMinute += extraGap;
        while (currentMinute >= 60) { currentMinute -= 60; currentHour++; }
        if (currentHour >= 18) break; // Sarah works until 6pm

        const apptStart = new Date(apptDate);
        apptStart.setHours(currentHour, currentMinute, 0, 0);

        // Weighted random cosmetic appointment type distribution
        const typeRoll = sarahSeededRandom();
        let apptType: { id: string; duration: number };
        if (typeRoll < 0.25) {
          apptType = cosmeticApptTypes[1]!; // Botox Treatment (most common)
        } else if (typeRoll < 0.40) {
          apptType = cosmeticApptTypes[3]!; // Filler Treatment
        } else if (typeRoll < 0.50) {
          apptType = cosmeticApptTypes[4]!; // Chemical Peel
        } else if (typeRoll < 0.58) {
          apptType = cosmeticApptTypes[5]!; // Hydrafacial
        } else if (typeRoll < 0.65) {
          apptType = cosmeticApptTypes[9]!; // Cosmetic Follow-up
        } else if (typeRoll < 0.72) {
          apptType = cosmeticApptTypes[8]!; // Cosmetic Consult
        } else if (typeRoll < 0.78) {
          apptType = cosmeticApptTypes[0]!; // Botox Consult
        } else if (typeRoll < 0.84) {
          apptType = cosmeticApptTypes[6]!; // Microdermabrasion
        } else if (typeRoll < 0.90) {
          apptType = cosmeticApptTypes[7]!; // Microneedling
        } else if (typeRoll < 0.95) {
          apptType = cosmeticApptTypes[10]!; // Kybella
        } else {
          apptType = cosmeticApptTypes[11]!; // Scar Treatment
        }

        const apptEnd = new Date(apptStart.getTime() + apptType.duration * 60 * 1000);
        currentMinute += apptType.duration;
        while (currentMinute >= 60) { currentMinute -= 60; currentHour++; }

        // Shuffle through patients
        if (sarahSeededRandom() < 0.7) sarahPatientIndex++;
        const patientId = sarahPatients[sarahPatientIndex % sarahPatients.length];

        // Location: Sarah works mostly at Main Clinic
        const locRoll = sarahSeededRandom();
        let locationForAppt = locRoll < 0.75 ? "loc-demo" : (locRoll < 0.9 ? "loc-east" : "loc-south");

        // Status based on how far in the future
        let status = "scheduled";
        if (dayOffset <= 0) {
          status = "completed";
        } else if (dayOffset <= 3) {
          const statusRoll = sarahSeededRandom();
          if (statusRoll < 0.2) status = "checked_in";
          else if (statusRoll < 0.35) status = "in_room";
          else if (statusRoll < 0.45) status = "with_provider";
        } else if (dayOffset <= 14 && sarahSeededRandom() < 0.05) {
          status = "cancelled";
        } else if (dayOffset > 14 && sarahSeededRandom() < 0.08) {
          status = "cancelled";
        }

        await pool.query(
          `insert into appointments(id, tenant_id, patient_id, provider_id, location_id, appointment_type_id, scheduled_start, scheduled_end, status)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           on conflict (id) do nothing`,
          [
            `appt-sarah-${String(sarahApptCounter).padStart(4, "0")}`,
            tenantId,
            patientId,
            "prov-cosmetic-pa",
            locationForAppt,
            apptType.id,
            apptStart.toISOString(),
            apptEnd.toISOString(),
            status,
          ],
        );

        sarahApptCounter++;
      }
    }

    // encounters and vitals
    const encounterId = "enc-demo";
    await pool.query(
      `insert into encounters(id, tenant_id, appointment_id, patient_id, provider_id, status, chief_complaint, hpi, ros, exam, assessment_plan)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       on conflict (id) do nothing`,
      [
        encounterId,
        tenantId,
        null,
        "p-demo",
        "prov-demo",
        "draft",
        "Skin rash",
        "Rash on arm for 2 weeks",
        "Negative except skin",
        "Erythematous patch",
        "Topical steroid; follow-up in 2 weeks",
      ],
    );

    await pool.query(
      `insert into vitals(id, tenant_id, encounter_id, height_cm, weight_kg, bp_systolic, bp_diastolic, pulse, temp_c)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (id) do nothing`,
      ["vitals-demo", tenantId, encounterId, 170, 70, 120, 80, 72, 36.8],
    );

    await pool.query(
      `insert into documents(id, tenant_id, patient_id, encounter_id, title, type, url)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (id) do nothing`,
      ["doc-demo", tenantId, "p-demo", encounterId, "Aftercare Instructions", "pdf", "https://example.com/doc.pdf"],
    );

    await pool.query(
      `insert into photos(id, tenant_id, patient_id, encounter_id, body_location, url)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (id) do nothing`,
      ["photo-demo", tenantId, "p-demo", encounterId, "Left forearm", "https://example.com/photo.jpg"],
    );

    await pool.query(
      `insert into charges(id, tenant_id, encounter_id, cpt_code, icd_codes, amount_cents, status)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (id) do nothing`,
      ["charge-demo", tenantId, encounterId, "99213", ["L30.9"], 15000, "pending"],
    );

    await pool.query(
      `insert into invoices(id, tenant_id, patient_id, total_cents, status)
       values ($1,$2,$3,$4,$5)
       on conflict (id) do nothing`,
      ["inv-demo", tenantId, "p-demo", 15000, "open"],
    );

    await pool.query(
      `insert into payments(id, tenant_id, invoice_id, amount_cents, method)
       values ($1,$2,$3,$4,$5)
       on conflict (id) do nothing`,
      ["pay-demo", tenantId, "inv-demo", 5000, "card"],
    );

    await pool.query(
      `insert into tasks(id, tenant_id, patient_id, encounter_id, title, status, due_at, assigned_to)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (id) do nothing`,
      ["task-demo", tenantId, "p-demo", encounterId, "Call patient with results", "open", new Date().toISOString(), "u-ma"],
    );

    await pool.query(
      `insert into messages(id, tenant_id, patient_id, subject, body, sender)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (id) do nothing`,
      ["msg-demo", tenantId, "p-demo", "Portal message", "Please review aftercare instructions.", "patient"],
    );

    // Seed CPT codes for dermatology
    const cptCodes = [
      // Office visits E/M codes
      { code: "99201", description: "Office visit, new patient, level 1", category: "E/M", fee: 7500, common: true },
      { code: "99202", description: "Office visit, new patient, level 2", category: "E/M", fee: 10900, common: true },
      { code: "99203", description: "Office visit, new patient, level 3", category: "E/M", fee: 14800, common: true },
      { code: "99204", description: "Office visit, new patient, level 4", category: "E/M", fee: 20800, common: true },
      { code: "99205", description: "Office visit, new patient, level 5", category: "E/M", fee: 28200, common: false },
      { code: "99211", description: "Office visit, established patient, level 1", category: "E/M", fee: 4500, common: true },
      { code: "99212", description: "Office visit, established patient, level 2", category: "E/M", fee: 7700, common: true },
      { code: "99213", description: "Office visit, established patient, level 3", category: "E/M", fee: 11200, common: true },
      { code: "99214", description: "Office visit, established patient, level 4", category: "E/M", fee: 16700, common: true },
      { code: "99215", description: "Office visit, established patient, level 5", category: "E/M", fee: 22000, common: false },

      // Biopsies
      { code: "11100", description: "Biopsy of skin, first lesion", category: "Biopsy", fee: 14800, common: true },
      { code: "11101", description: "Biopsy of skin, each additional lesion", category: "Biopsy", fee: 7400, common: true },

      // Debridement
      { code: "11000", description: "Debridement of extensive eczematous or infected skin", category: "Debridement", fee: 12000, common: true },
      { code: "11001", description: "Debridement, each additional 10% body area", category: "Debridement", fee: 6000, common: false },
      { code: "11042", description: "Debridement, subcutaneous tissue, first 20 sq cm", category: "Debridement", fee: 18500, common: false },
      { code: "11043", description: "Debridement, muscle/fascia, first 20 sq cm", category: "Debridement", fee: 25500, common: false },
      { code: "11044", description: "Debridement, bone, first 20 sq cm", category: "Debridement", fee: 31500, common: false },

      // Paring and cutting
      { code: "11055", description: "Paring or cutting of benign hyperkeratotic lesion, single", category: "Paring", fee: 5500, common: true },
      { code: "11056", description: "Paring or cutting, 2 to 4 lesions", category: "Paring", fee: 7500, common: true },
      { code: "11057", description: "Paring or cutting, more than 4 lesions", category: "Paring", fee: 9500, common: true },

      // Skin tag removal
      { code: "11200", description: "Removal of skin tags, up to 15 lesions", category: "Skin Tag Removal", fee: 12500, common: true },
      { code: "11201", description: "Removal of skin tags, each additional 10 lesions", category: "Skin Tag Removal", fee: 6500, common: true },

      // Shaving of lesions
      { code: "11300", description: "Shaving of epidermal or dermal lesion, trunk/arms/legs, 0.5 cm or less", category: "Shaving", fee: 9500, common: true },
      { code: "11301", description: "Shaving of lesion, trunk/arms/legs, 0.6-1.0 cm", category: "Shaving", fee: 11500, common: true },
      { code: "11302", description: "Shaving of lesion, trunk/arms/legs, 1.1-2.0 cm", category: "Shaving", fee: 13500, common: true },
      { code: "11303", description: "Shaving of lesion, trunk/arms/legs, over 2.0 cm", category: "Shaving", fee: 16500, common: false },
      { code: "11310", description: "Shaving of lesion, face/ears/eyelids/nose/lips/mucous membrane, 0.5 cm or less", category: "Shaving", fee: 10500, common: true },
      { code: "11311", description: "Shaving of lesion, face, 0.6-1.0 cm", category: "Shaving", fee: 12500, common: true },
      { code: "11312", description: "Shaving of lesion, face, 1.1-2.0 cm", category: "Shaving", fee: 14500, common: true },
      { code: "11313", description: "Shaving of lesion, face, over 2.0 cm", category: "Shaving", fee: 17500, common: false },

      // Excision benign lesions
      { code: "11400", description: "Excision benign lesion, trunk/arms/legs, 0.5 cm or less", category: "Excision Benign", fee: 15500, common: true },
      { code: "11401", description: "Excision benign lesion, trunk/arms/legs, 0.6-1.0 cm", category: "Excision Benign", fee: 17500, common: true },
      { code: "11402", description: "Excision benign lesion, trunk/arms/legs, 1.1-2.0 cm", category: "Excision Benign", fee: 19500, common: true },
      { code: "11403", description: "Excision benign lesion, trunk/arms/legs, 2.1-3.0 cm", category: "Excision Benign", fee: 22500, common: false },
      { code: "11404", description: "Excision benign lesion, trunk/arms/legs, 3.1-4.0 cm", category: "Excision Benign", fee: 28500, common: false },
      { code: "11420", description: "Excision benign lesion, scalp/neck/hands/feet/genitalia, 0.5 cm or less", category: "Excision Benign", fee: 17500, common: true },
      { code: "11421", description: "Excision benign lesion, scalp/neck/hands/feet/genitalia, 0.6-1.0 cm", category: "Excision Benign", fee: 19500, common: true },
      { code: "11440", description: "Excision benign lesion, face/ears/eyelids/nose/lips/mucous membrane, 0.5 cm or less", category: "Excision Benign", fee: 18500, common: true },
      { code: "11441", description: "Excision benign lesion, face, 0.6-1.0 cm", category: "Excision Benign", fee: 20500, common: true },

      // Excision malignant lesions
      { code: "11600", description: "Excision malignant lesion, trunk/arms/legs, 0.5 cm or less", category: "Excision Malignant", fee: 19500, common: true },
      { code: "11601", description: "Excision malignant lesion, trunk/arms/legs, 0.6-1.0 cm", category: "Excision Malignant", fee: 22500, common: true },
      { code: "11602", description: "Excision malignant lesion, trunk/arms/legs, 1.1-2.0 cm", category: "Excision Malignant", fee: 26500, common: true },
      { code: "11603", description: "Excision malignant lesion, trunk/arms/legs, 2.1-3.0 cm", category: "Excision Malignant", fee: 31500, common: false },
      { code: "11604", description: "Excision malignant lesion, trunk/arms/legs, 3.1-4.0 cm", category: "Excision Malignant", fee: 38500, common: false },
      { code: "11620", description: "Excision malignant lesion, scalp/neck/hands/feet/genitalia, 0.5 cm or less", category: "Excision Malignant", fee: 22500, common: true },
      { code: "11621", description: "Excision malignant lesion, scalp/neck/hands/feet/genitalia, 0.6-1.0 cm", category: "Excision Malignant", fee: 25500, common: true },
      { code: "11640", description: "Excision malignant lesion, face/ears/eyelids/nose/lips, 0.5 cm or less", category: "Excision Malignant", fee: 24500, common: true },
      { code: "11641", description: "Excision malignant lesion, face, 0.6-1.0 cm", category: "Excision Malignant", fee: 27500, common: true },

      // Destruction of lesions
      { code: "17000", description: "Destruction, benign or premalignant lesion, first", category: "Destruction", fee: 11500, common: true },
      { code: "17003", description: "Destruction, 2-14 additional lesions", category: "Destruction", fee: 6500, common: true },
      { code: "17004", description: "Destruction, 15 or more lesions", category: "Destruction", fee: 8500, common: true },
      { code: "17110", description: "Destruction of flat warts, up to 14 lesions", category: "Destruction", fee: 10500, common: true },
      { code: "17111", description: "Destruction of flat warts, 15 or more lesions", category: "Destruction", fee: 13500, common: true },

      // Special dermatology procedures
      { code: "96900", description: "Actinotherapy (ultraviolet light)", category: "Special Procedures", fee: 8500, common: false },
      { code: "96910", description: "Photochemotherapy with UV-B", category: "Special Procedures", fee: 12500, common: true },
      { code: "96912", description: "Photochemotherapy with UV-A", category: "Special Procedures", fee: 14500, common: true },
      { code: "96920", description: "Laser treatment, less than 250 sq cm", category: "Special Procedures", fee: 28500, common: false },
      { code: "96921", description: "Laser treatment, 250-500 sq cm", category: "Special Procedures", fee: 38500, common: false },
    ];

    for (const cpt of cptCodes) {
      await pool.query(
        `insert into cpt_codes(id, code, description, category, default_fee_cents, is_common)
         values ($1,$2,$3,$4,$5,$6)
         on conflict (code) do nothing`,
        [randomUUID(), cpt.code, cpt.description, cpt.category, cpt.fee, cpt.common],
      );
    }

    // Seed ICD-10 codes for dermatology
    const icd10Codes = [
      // Actinic keratosis
      { code: "L57.0", description: "Actinic keratosis", category: "Premalignant", common: true },

      // Basal cell carcinoma
      { code: "C44.01", description: "Basal cell carcinoma of skin of lip", category: "Malignant Neoplasm", common: false },
      { code: "C44.111", description: "Basal cell carcinoma of skin of unspecified eyelid, including canthus", category: "Malignant Neoplasm", common: true },
      { code: "C44.211", description: "Basal cell carcinoma of skin of unspecified ear and external auricular canal", category: "Malignant Neoplasm", common: true },
      { code: "C44.310", description: "Basal cell carcinoma of skin of unspecified parts of face", category: "Malignant Neoplasm", common: true },
      { code: "C44.311", description: "Basal cell carcinoma of skin of nose", category: "Malignant Neoplasm", common: true },
      { code: "C44.510", description: "Basal cell carcinoma of anal skin", category: "Malignant Neoplasm", common: false },
      { code: "C44.511", description: "Basal cell carcinoma of skin of trunk", category: "Malignant Neoplasm", common: true },
      { code: "C44.611", description: "Basal cell carcinoma of skin of upper limb", category: "Malignant Neoplasm", common: true },
      { code: "C44.711", description: "Basal cell carcinoma of skin of lower limb", category: "Malignant Neoplasm", common: true },

      // Squamous cell carcinoma
      { code: "C44.02", description: "Squamous cell carcinoma of skin of lip", category: "Malignant Neoplasm", common: false },
      { code: "C44.121", description: "Squamous cell carcinoma of skin of unspecified eyelid, including canthus", category: "Malignant Neoplasm", common: true },
      { code: "C44.221", description: "Squamous cell carcinoma of skin of unspecified ear and external auricular canal", category: "Malignant Neoplasm", common: true },
      { code: "C44.320", description: "Squamous cell carcinoma of skin of unspecified parts of face", category: "Malignant Neoplasm", common: true },
      { code: "C44.321", description: "Squamous cell carcinoma of skin of nose", category: "Malignant Neoplasm", common: true },
      { code: "C44.521", description: "Squamous cell carcinoma of skin of trunk", category: "Malignant Neoplasm", common: true },
      { code: "C44.621", description: "Squamous cell carcinoma of skin of upper limb", category: "Malignant Neoplasm", common: true },
      { code: "C44.721", description: "Squamous cell carcinoma of skin of lower limb", category: "Malignant Neoplasm", common: true },

      // Malignant melanoma
      { code: "C43.0", description: "Malignant melanoma of lip", category: "Malignant Neoplasm", common: false },
      { code: "C43.10", description: "Malignant melanoma of unspecified eyelid, including canthus", category: "Malignant Neoplasm", common: true },
      { code: "C43.20", description: "Malignant melanoma of unspecified ear and external auricular canal", category: "Malignant Neoplasm", common: true },
      { code: "C43.30", description: "Malignant melanoma of unspecified part of face", category: "Malignant Neoplasm", common: true },
      { code: "C43.31", description: "Malignant melanoma of nose", category: "Malignant Neoplasm", common: true },
      { code: "C43.51", description: "Malignant melanoma of anal skin", category: "Malignant Neoplasm", common: false },
      { code: "C43.59", description: "Malignant melanoma of other part of trunk", category: "Malignant Neoplasm", common: true },
      { code: "C43.60", description: "Malignant melanoma of unspecified upper limb, including shoulder", category: "Malignant Neoplasm", common: true },
      { code: "C43.70", description: "Malignant melanoma of unspecified lower limb, including hip", category: "Malignant Neoplasm", common: true },

      // Seborrheic keratosis
      { code: "L82.0", description: "Inflamed seborrheic keratosis", category: "Benign Neoplasm", common: true },
      { code: "L82.1", description: "Other seborrheic keratosis", category: "Benign Neoplasm", common: true },

      // Dermatitis
      { code: "L20.0", description: "Besnier's prurigo", category: "Dermatitis", common: false },
      { code: "L20.81", description: "Atopic neurodermatitis", category: "Dermatitis", common: true },
      { code: "L20.82", description: "Flexural eczema", category: "Dermatitis", common: true },
      { code: "L20.83", description: "Infantile (acute) (chronic) eczema", category: "Dermatitis", common: true },
      { code: "L20.84", description: "Intrinsic (allergic) eczema", category: "Dermatitis", common: true },
      { code: "L20.89", description: "Other atopic dermatitis", category: "Dermatitis", common: true },
      { code: "L20.9", description: "Atopic dermatitis, unspecified", category: "Dermatitis", common: true },
      { code: "L23.9", description: "Allergic contact dermatitis, unspecified cause", category: "Dermatitis", common: true },
      { code: "L24.9", description: "Irritant contact dermatitis, unspecified cause", category: "Dermatitis", common: true },
      { code: "L25.9", description: "Unspecified contact dermatitis, unspecified cause", category: "Dermatitis", common: true },
      { code: "L30.0", description: "Nummular dermatitis", category: "Dermatitis", common: true },
      { code: "L30.3", description: "Infective dermatitis", category: "Dermatitis", common: true },
      { code: "L30.9", description: "Dermatitis, unspecified", category: "Dermatitis", common: true },

      // Psoriasis
      { code: "L40.0", description: "Psoriasis vulgaris", category: "Psoriasis", common: true },
      { code: "L40.1", description: "Generalized pustular psoriasis", category: "Psoriasis", common: false },
      { code: "L40.4", description: "Guttate psoriasis", category: "Psoriasis", common: true },
      { code: "L40.50", description: "Arthropathic psoriasis, unspecified", category: "Psoriasis", common: true },
      { code: "L40.8", description: "Other psoriasis", category: "Psoriasis", common: true },
      { code: "L40.9", description: "Psoriasis, unspecified", category: "Psoriasis", common: true },

      // Acne
      { code: "L70.0", description: "Acne vulgaris", category: "Acne", common: true },
      { code: "L70.1", description: "Acne conglobata", category: "Acne", common: false },
      { code: "L70.2", description: "Acne varioliformis", category: "Acne", common: false },
      { code: "L70.3", description: "Acne tropica", category: "Acne", common: false },
      { code: "L70.4", description: "Infantile acne", category: "Acne", common: false },
      { code: "L70.5", description: "Acne excoriee", category: "Acne", common: true },
      { code: "L70.8", description: "Other acne", category: "Acne", common: true },
      { code: "L70.9", description: "Acne, unspecified", category: "Acne", common: true },

      // Rosacea
      { code: "L71.0", description: "Perioral dermatitis", category: "Rosacea", common: true },
      { code: "L71.1", description: "Rhinophyma", category: "Rosacea", common: false },
      { code: "L71.8", description: "Other rosacea", category: "Rosacea", common: true },
      { code: "L71.9", description: "Rosacea, unspecified", category: "Rosacea", common: true },

      // Tinea infections
      { code: "B35.0", description: "Tinea barbae and tinea capitis", category: "Fungal Infection", common: true },
      { code: "B35.1", description: "Tinea unguium", category: "Fungal Infection", common: true },
      { code: "B35.2", description: "Tinea manuum", category: "Fungal Infection", common: true },
      { code: "B35.3", description: "Tinea pedis", category: "Fungal Infection", common: true },
      { code: "B35.4", description: "Tinea corporis", category: "Fungal Infection", common: true },
      { code: "B35.5", description: "Tinea imbricata", category: "Fungal Infection", common: false },
      { code: "B35.6", description: "Tinea cruris", category: "Fungal Infection", common: true },
      { code: "B35.8", description: "Other dermatophytoses", category: "Fungal Infection", common: true },
      { code: "B35.9", description: "Dermatophytosis, unspecified", category: "Fungal Infection", common: true },

      // Warts
      { code: "B07.0", description: "Plantar wart", category: "Viral Infection", common: true },
      { code: "B07.8", description: "Other viral warts", category: "Viral Infection", common: true },
      { code: "B07.9", description: "Viral wart, unspecified", category: "Viral Infection", common: true },

      // Melanocytic nevi
      { code: "D22.0", description: "Melanocytic nevi of lip", category: "Benign Neoplasm", common: false },
      { code: "D22.10", description: "Melanocytic nevi of unspecified eyelid, including canthus", category: "Benign Neoplasm", common: true },
      { code: "D22.20", description: "Melanocytic nevi of unspecified ear and external auricular canal", category: "Benign Neoplasm", common: true },
      { code: "D22.30", description: "Melanocytic nevi of unspecified part of face", category: "Benign Neoplasm", common: true },
      { code: "D22.39", description: "Melanocytic nevi of other parts of face", category: "Benign Neoplasm", common: true },
      { code: "D22.5", description: "Melanocytic nevi of trunk", category: "Benign Neoplasm", common: true },
      { code: "D22.60", description: "Melanocytic nevi of unspecified upper limb, including shoulder", category: "Benign Neoplasm", common: true },
      { code: "D22.70", description: "Melanocytic nevi of unspecified lower limb, including hip", category: "Benign Neoplasm", common: true },
      { code: "D22.9", description: "Melanocytic nevi, unspecified", category: "Benign Neoplasm", common: true },

      // Cysts
      { code: "L72.0", description: "Epidermal cyst", category: "Cyst", common: true },
      { code: "L72.11", description: "Pilar cyst", category: "Cyst", common: true },
      { code: "L72.12", description: "Trichodermal cyst", category: "Cyst", common: true },
      { code: "L72.2", description: "Steatocystoma multiplex", category: "Cyst", common: false },
      { code: "L72.3", description: "Sebaceous cyst", category: "Cyst", common: true },
      { code: "L72.8", description: "Other follicular cysts of skin and subcutaneous tissue", category: "Cyst", common: true },
      { code: "L72.9", description: "Follicular cyst of skin and subcutaneous tissue, unspecified", category: "Cyst", common: true },

      // Lipoma
      { code: "D17.0", description: "Benign lipomatous neoplasm of skin and subcutaneous tissue of head, face and neck", category: "Benign Neoplasm", common: true },
      { code: "D17.1", description: "Benign lipomatous neoplasm of skin and subcutaneous tissue of trunk", category: "Benign Neoplasm", common: true },
      { code: "D17.20", description: "Benign lipomatous neoplasm of skin and subcutaneous tissue of unspecified limb", category: "Benign Neoplasm", common: true },
      { code: "D17.30", description: "Benign lipomatous neoplasm of skin and subcutaneous tissue of unspecified sites", category: "Benign Neoplasm", common: true },

      // Alopecia
      { code: "L63.0", description: "Alopecia (capitis) totalis", category: "Hair Disorders", common: true },
      { code: "L63.1", description: "Alopecia universalis", category: "Hair Disorders", common: false },
      { code: "L63.2", description: "Ophiasis", category: "Hair Disorders", common: false },
      { code: "L63.8", description: "Other alopecia areata", category: "Hair Disorders", common: true },
      { code: "L63.9", description: "Alopecia areata, unspecified", category: "Hair Disorders", common: true },
      { code: "L64.0", description: "Drug-induced androgenic alopecia", category: "Hair Disorders", common: false },
      { code: "L64.8", description: "Other androgenic alopecia", category: "Hair Disorders", common: true },
      { code: "L64.9", description: "Androgenic alopecia, unspecified", category: "Hair Disorders", common: true },
    ];

    for (const icd of icd10Codes) {
      await pool.query(
        `insert into icd10_codes(id, code, description, category, is_common)
         values ($1,$2,$3,$4,$5)
         on conflict (code) do nothing`,
        [randomUUID(), icd.code, icd.description, icd.category, icd.common],
      );
    }

    // Create a default fee schedule for the demo tenant
    const feeScheduleId = "fee-schedule-demo";
    await pool.query(
      `insert into fee_schedules(id, tenant_id, name, is_default, description)
       values ($1,$2,$3,$4,$5)
       on conflict (id) do nothing`,
      [feeScheduleId, tenantId, "Medical Dermatology Fee Schedule", true, "Comprehensive fee schedule for medical dermatology procedures"],
    );

    // Seed comprehensive dermatology fee schedule items with 2025 realistic pricing
    // Prices based on industry standards: https://integritydermatology.com, https://derrowdermatology.com
    const feeScheduleItems = [
      // ═══════════════════════════════════════════════════════════════════════════
      // EVALUATION & MANAGEMENT - Office Visits
      // ═══════════════════════════════════════════════════════════════════════════
      { cptCode: "99202", description: "New patient office visit - straightforward (20 min)", category: "Office Visits", feeCents: 12500 },
      { cptCode: "99203", description: "New patient office visit - low complexity (30 min)", category: "Office Visits", feeCents: 17500 },
      { cptCode: "99204", description: "New patient office visit - moderate complexity (45 min)", category: "Office Visits", feeCents: 25000 },
      { cptCode: "99205", description: "New patient office visit - high complexity (60 min)", category: "Office Visits", feeCents: 35000 },
      { cptCode: "99211", description: "Established patient - minimal (5 min, nurse visit)", category: "Office Visits", feeCents: 3500 },
      { cptCode: "99212", description: "Established patient - straightforward (10 min)", category: "Office Visits", feeCents: 8500 },
      { cptCode: "99213", description: "Established patient - low complexity (15 min)", category: "Office Visits", feeCents: 12000 },
      { cptCode: "99214", description: "Established patient - moderate complexity (25 min)", category: "Office Visits", feeCents: 17500 },
      { cptCode: "99215", description: "Established patient - high complexity (40 min)", category: "Office Visits", feeCents: 27500 },

      // ═══════════════════════════════════════════════════════════════════════════
      // SKIN BIOPSIES
      // ═══════════════════════════════════════════════════════════════════════════
      { cptCode: "11102", description: "Tangential biopsy (shave), first lesion", category: "Biopsies", feeCents: 17500 },
      { cptCode: "11103", description: "Tangential biopsy (shave), each additional lesion", category: "Biopsies", feeCents: 5500 },
      { cptCode: "11104", description: "Punch biopsy, first lesion", category: "Biopsies", feeCents: 19500 },
      { cptCode: "11105", description: "Punch biopsy, each additional lesion", category: "Biopsies", feeCents: 6500 },
      { cptCode: "11106", description: "Incisional biopsy, first lesion", category: "Biopsies", feeCents: 27500 },
      { cptCode: "11107", description: "Incisional biopsy, each additional lesion", category: "Biopsies", feeCents: 12500 },

      // ═══════════════════════════════════════════════════════════════════════════
      // SHAVE REMOVALS
      // ═══════════════════════════════════════════════════════════════════════════
      { cptCode: "11300", description: "Shave removal, trunk/arms/legs, ≤0.5 cm", category: "Shave Removals", feeCents: 12500 },
      { cptCode: "11301", description: "Shave removal, trunk/arms/legs, 0.6-1.0 cm", category: "Shave Removals", feeCents: 15000 },
      { cptCode: "11305", description: "Shave removal, scalp/neck/hands/feet, ≤0.5 cm", category: "Shave Removals", feeCents: 14500 },
      { cptCode: "11306", description: "Shave removal, scalp/neck/hands/feet, 0.6-1.0 cm", category: "Shave Removals", feeCents: 17500 },
      { cptCode: "11310", description: "Shave removal, face/ears/eyelids/nose/lips, ≤0.5 cm", category: "Shave Removals", feeCents: 17500 },
      { cptCode: "11311", description: "Shave removal, face/ears/eyelids/nose/lips, 0.6-1.0 cm", category: "Shave Removals", feeCents: 22500 },

      // ═══════════════════════════════════════════════════════════════════════════
      // EXCISIONS - BENIGN LESIONS (Most common sizes)
      // ═══════════════════════════════════════════════════════════════════════════
      { cptCode: "11400", description: "Excision benign lesion, trunk/arms/legs, ≤0.5 cm", category: "Excisions - Benign", feeCents: 22500 },
      { cptCode: "11401", description: "Excision benign lesion, trunk/arms/legs, 0.6-1.0 cm", category: "Excisions - Benign", feeCents: 30000 },
      { cptCode: "11402", description: "Excision benign lesion, trunk/arms/legs, 1.1-2.0 cm", category: "Excisions - Benign", feeCents: 37500 },
      { cptCode: "11420", description: "Excision benign lesion, scalp/neck/hands/feet, ≤0.5 cm", category: "Excisions - Benign", feeCents: 25000 },
      { cptCode: "11421", description: "Excision benign lesion, scalp/neck/hands/feet, 0.6-1.0 cm", category: "Excisions - Benign", feeCents: 32500 },
      { cptCode: "11440", description: "Excision benign lesion, face/ears/eyelids/nose/lips, ≤0.5 cm", category: "Excisions - Benign", feeCents: 30000 },
      { cptCode: "11441", description: "Excision benign lesion, face/ears/eyelids/nose/lips, 0.6-1.0 cm", category: "Excisions - Benign", feeCents: 40000 },
      { cptCode: "11442", description: "Excision benign lesion, face/ears/eyelids/nose/lips, 1.1-2.0 cm", category: "Excisions - Benign", feeCents: 50000 },

      // ═══════════════════════════════════════════════════════════════════════════
      // EXCISIONS - MALIGNANT LESIONS (Skin Cancer)
      // ═══════════════════════════════════════════════════════════════════════════
      { cptCode: "11600", description: "Excision malignant lesion, trunk/arms/legs, ≤0.5 cm", category: "Excisions - Malignant", feeCents: 35000 },
      { cptCode: "11601", description: "Excision malignant lesion, trunk/arms/legs, 0.6-1.0 cm", category: "Excisions - Malignant", feeCents: 45000 },
      { cptCode: "11602", description: "Excision malignant lesion, trunk/arms/legs, 1.1-2.0 cm", category: "Excisions - Malignant", feeCents: 57500 },
      { cptCode: "11620", description: "Excision malignant lesion, scalp/neck/hands/feet, ≤0.5 cm", category: "Excisions - Malignant", feeCents: 40000 },
      { cptCode: "11621", description: "Excision malignant lesion, scalp/neck/hands/feet, 0.6-1.0 cm", category: "Excisions - Malignant", feeCents: 52500 },
      { cptCode: "11640", description: "Excision malignant lesion, face/ears/eyelids/nose/lips, ≤0.5 cm", category: "Excisions - Malignant", feeCents: 47500 },
      { cptCode: "11641", description: "Excision malignant lesion, face/ears/eyelids/nose/lips, 0.6-1.0 cm", category: "Excisions - Malignant", feeCents: 60000 },
      { cptCode: "11642", description: "Excision malignant lesion, face/ears/eyelids/nose/lips, 1.1-2.0 cm", category: "Excisions - Malignant", feeCents: 75000 },

      // ═══════════════════════════════════════════════════════════════════════════
      // DESTRUCTION PROCEDURES (Cryotherapy, Electrodessication)
      // ═══════════════════════════════════════════════════════════════════════════
      { cptCode: "17000", description: "Destruction premalignant lesion (AK), first lesion", category: "Destruction", feeCents: 17500 },
      { cptCode: "17003", description: "Destruction premalignant lesion (AK), 2-14 lesions each", category: "Destruction", feeCents: 1000 },
      { cptCode: "17004", description: "Destruction premalignant lesions (AK), 15 or more", category: "Destruction", feeCents: 32500 },
      { cptCode: "17110", description: "Destruction benign lesions (warts, tags), up to 14", category: "Destruction", feeCents: 20000 },
      { cptCode: "17111", description: "Destruction benign lesions (warts, tags), 15 or more", category: "Destruction", feeCents: 30000 },

      // ═══════════════════════════════════════════════════════════════════════════
      // MOHS MICROGRAPHIC SURGERY
      // ═══════════════════════════════════════════════════════════════════════════
      { cptCode: "17311", description: "Mohs surgery, head/neck/hands/feet, first stage", category: "Mohs Surgery", feeCents: 85000 },
      { cptCode: "17312", description: "Mohs surgery, head/neck/hands/feet, each additional stage", category: "Mohs Surgery", feeCents: 55000 },
      { cptCode: "17313", description: "Mohs surgery, trunk/arms/legs, first stage", category: "Mohs Surgery", feeCents: 75000 },
      { cptCode: "17314", description: "Mohs surgery, trunk/arms/legs, each additional stage", category: "Mohs Surgery", feeCents: 47500 },
      { cptCode: "17315", description: "Mohs surgery, each additional block after 5", category: "Mohs Surgery", feeCents: 12500 },

      // ═══════════════════════════════════════════════════════════════════════════
      // WOUND REPAIRS
      // ═══════════════════════════════════════════════════════════════════════════
      { cptCode: "12001", description: "Simple repair, trunk/extremities, ≤2.5 cm", category: "Repairs", feeCents: 17500 },
      { cptCode: "12002", description: "Simple repair, trunk/extremities, 2.6-7.5 cm", category: "Repairs", feeCents: 25000 },
      { cptCode: "12031", description: "Intermediate repair, scalp/trunk/extremities, ≤2.5 cm", category: "Repairs", feeCents: 32500 },
      { cptCode: "12032", description: "Intermediate repair, scalp/trunk/extremities, 2.6-7.5 cm", category: "Repairs", feeCents: 45000 },
      { cptCode: "12051", description: "Intermediate repair, face/ears/eyelids/nose/lips, ≤2.5 cm", category: "Repairs", feeCents: 45000 },
      { cptCode: "12052", description: "Intermediate repair, face/ears/eyelids/nose/lips, 2.6-5.0 cm", category: "Repairs", feeCents: 60000 },
      { cptCode: "13131", description: "Complex repair, face/hands/feet, 1.1-2.5 cm", category: "Repairs", feeCents: 70000 },
      { cptCode: "13132", description: "Complex repair, face/hands/feet, 2.6-7.5 cm", category: "Repairs", feeCents: 95000 },
      { cptCode: "13151", description: "Complex repair, eyelids/nose/ears/lips, 1.1-2.5 cm", category: "Repairs", feeCents: 85000 },
      { cptCode: "13152", description: "Complex repair, eyelids/nose/ears/lips, 2.6-7.5 cm", category: "Repairs", feeCents: 115000 },

      // ═══════════════════════════════════════════════════════════════════════════
      // SKIN FLAPS & GRAFTS
      // ═══════════════════════════════════════════════════════════════════════════
      { cptCode: "14000", description: "Adjacent tissue transfer, trunk, ≤10 sq cm", category: "Flaps & Grafts", feeCents: 75000 },
      { cptCode: "14001", description: "Adjacent tissue transfer, trunk, 10.1-30 sq cm", category: "Flaps & Grafts", feeCents: 95000 },
      { cptCode: "14040", description: "Adjacent tissue transfer, face, ≤10 sq cm", category: "Flaps & Grafts", feeCents: 95000 },
      { cptCode: "14041", description: "Adjacent tissue transfer, face, 10.1-30 sq cm", category: "Flaps & Grafts", feeCents: 120000 },
      { cptCode: "15100", description: "Split-thickness skin graft, trunk/arms/legs", category: "Flaps & Grafts", feeCents: 85000 },
      { cptCode: "15120", description: "Split-thickness skin graft, face/neck/hands/feet", category: "Flaps & Grafts", feeCents: 110000 },

      // ═══════════════════════════════════════════════════════════════════════════
      // INTRALESIONAL INJECTIONS
      // ═══════════════════════════════════════════════════════════════════════════
      { cptCode: "11900", description: "Intralesional injection (keloid, cyst), up to 7 lesions", category: "Injections", feeCents: 15000 },
      { cptCode: "11901", description: "Intralesional injection (keloid, cyst), more than 7 lesions", category: "Injections", feeCents: 22500 },

      // ═══════════════════════════════════════════════════════════════════════════
      // PHOTOTHERAPY (Medical)
      // ═══════════════════════════════════════════════════════════════════════════
      { cptCode: "96910", description: "Photochemotherapy (PUVA)", category: "Phototherapy", feeCents: 17500 },
      { cptCode: "96912", description: "Phototherapy (narrowband UVB)", category: "Phototherapy", feeCents: 12500 },

      // ═══════════════════════════════════════════════════════════════════════════
      // ALLERGY & PATCH TESTING
      // ═══════════════════════════════════════════════════════════════════════════
      { cptCode: "95044", description: "Patch test, each allergen (up to 80 applied)", category: "Patch Testing", feeCents: 1500 },
      { cptCode: "95052", description: "Photo patch test", category: "Patch Testing", feeCents: 7500 },
      { cptCode: "95024", description: "Intradermal allergy test, each allergen", category: "Patch Testing", feeCents: 1200 },

      // ═══════════════════════════════════════════════════════════════════════════
      // PATHOLOGY (Professional Component)
      // ═══════════════════════════════════════════════════════════════════════════
      { cptCode: "88305", description: "Surgical pathology, Level IV (skin biopsy)", category: "Pathology", feeCents: 12500 },
      { cptCode: "88312", description: "Special stain (fungal, bacterial)", category: "Pathology", feeCents: 7500 },
      { cptCode: "88342", description: "Immunohistochemistry, first antibody", category: "Pathology", feeCents: 15000 },

      // ═══════════════════════════════════════════════════════════════════════════
      // COSMETIC - NEUROTOXINS (Botox, Dysport, Xeomin)
      // ═══════════════════════════════════════════════════════════════════════════
      { cptCode: "64612", description: "Chemodenervation, muscle(s); forehead/glabella (Botox)", category: "Cosmetic - Neurotoxins", feeCents: 45000 },
      { cptCode: "64615", description: "Chemodenervation, muscle(s); hyperhidrosis (Botox)", category: "Cosmetic - Neurotoxins", feeCents: 85000 },
      { cptCode: "J0585", description: "Botulinum toxin type A (Botox), per unit", category: "Cosmetic - Neurotoxins", feeCents: 1400 },
      { cptCode: "BOTOX-20", description: "Botox treatment, 20 units (crow's feet)", category: "Cosmetic - Neurotoxins", feeCents: 28000 },
      { cptCode: "BOTOX-40", description: "Botox treatment, 40 units (forehead + glabella)", category: "Cosmetic - Neurotoxins", feeCents: 56000 },
      { cptCode: "BOTOX-60", description: "Botox treatment, 60 units (full upper face)", category: "Cosmetic - Neurotoxins", feeCents: 84000 },
      { cptCode: "J0586", description: "Abobotulinumtoxin A (Dysport), 5 units", category: "Cosmetic - Neurotoxins", feeCents: 500 },

      // ═══════════════════════════════════════════════════════════════════════════
      // COSMETIC - DERMAL FILLERS
      // ═══════════════════════════════════════════════════════════════════════════
      { cptCode: "FILLER-JUV", description: "Juvederm Ultra XC, 1 syringe (lips/nasolabial)", category: "Cosmetic - Fillers", feeCents: 75000 },
      { cptCode: "FILLER-JUVP", description: "Juvederm Ultra Plus XC, 1 syringe (deep folds)", category: "Cosmetic - Fillers", feeCents: 80000 },
      { cptCode: "FILLER-VOL", description: "Juvederm Voluma XC, 1 syringe (cheeks)", category: "Cosmetic - Fillers", feeCents: 95000 },
      { cptCode: "FILLER-VOLB", description: "Juvederm Volbella XC, 1 syringe (fine lines/lips)", category: "Cosmetic - Fillers", feeCents: 70000 },
      { cptCode: "FILLER-REST", description: "Restylane, 1 syringe", category: "Cosmetic - Fillers", feeCents: 72500 },
      { cptCode: "FILLER-LYFT", description: "Restylane Lyft, 1 syringe (cheeks/hands)", category: "Cosmetic - Fillers", feeCents: 85000 },
      { cptCode: "FILLER-KYSSE", description: "Restylane Kysse, 1 syringe (lips)", category: "Cosmetic - Fillers", feeCents: 75000 },
      { cptCode: "FILLER-RAD", description: "Radiesse, 1.5mL syringe (volumizing)", category: "Cosmetic - Fillers", feeCents: 85000 },
      { cptCode: "FILLER-SCUL", description: "Sculptra, 1 vial (collagen stimulator)", category: "Cosmetic - Fillers", feeCents: 95000 },

      // ═══════════════════════════════════════════════════════════════════════════
      // COSMETIC - CHEMICAL PEELS
      // ═══════════════════════════════════════════════════════════════════════════
      { cptCode: "15788", description: "Chemical peel, facial, epidermal (light)", category: "Cosmetic - Peels", feeCents: 15000 },
      { cptCode: "15789", description: "Chemical peel, facial, dermal (medium)", category: "Cosmetic - Peels", feeCents: 35000 },
      { cptCode: "15792", description: "Chemical peel, nonfacial", category: "Cosmetic - Peels", feeCents: 25000 },
      { cptCode: "PEEL-GLOW", description: "Glycolic acid peel (superficial)", category: "Cosmetic - Peels", feeCents: 12500 },
      { cptCode: "PEEL-JESSN", description: "Jessner's peel (medium depth)", category: "Cosmetic - Peels", feeCents: 20000 },
      { cptCode: "PEEL-TCA", description: "TCA peel 20-35% (medium depth)", category: "Cosmetic - Peels", feeCents: 35000 },
      { cptCode: "PEEL-VI", description: "VI Peel (proprietary blend)", category: "Cosmetic - Peels", feeCents: 35000 },

      // ═══════════════════════════════════════════════════════════════════════════
      // COSMETIC - LASER TREATMENTS
      // ═══════════════════════════════════════════════════════════════════════════
      { cptCode: "96920", description: "Laser treatment, inflammatory skin disease, <250 sq cm", category: "Cosmetic - Laser", feeCents: 25000 },
      { cptCode: "96921", description: "Laser treatment, inflammatory skin disease, 250-500 sq cm", category: "Cosmetic - Laser", feeCents: 40000 },
      { cptCode: "96922", description: "Laser treatment, inflammatory skin disease, >500 sq cm", category: "Cosmetic - Laser", feeCents: 55000 },
      { cptCode: "LASER-IPL", description: "IPL photofacial (sun damage, redness)", category: "Cosmetic - Laser", feeCents: 35000 },
      { cptCode: "LASER-VBEAM", description: "VBeam laser (rosacea, vessels)", category: "Cosmetic - Laser", feeCents: 45000 },
      { cptCode: "LASER-FRAX", description: "Fraxel laser (resurfacing, scars)", category: "Cosmetic - Laser", feeCents: 125000 },
      { cptCode: "LASER-CO2", description: "CO2 laser resurfacing (full face)", category: "Cosmetic - Laser", feeCents: 275000 },
      { cptCode: "LASER-HAIR-S", description: "Laser hair removal, small area (upper lip, chin)", category: "Cosmetic - Laser", feeCents: 15000 },
      { cptCode: "LASER-HAIR-M", description: "Laser hair removal, medium area (underarms, bikini)", category: "Cosmetic - Laser", feeCents: 25000 },
      { cptCode: "LASER-HAIR-L", description: "Laser hair removal, large area (full legs, back)", category: "Cosmetic - Laser", feeCents: 45000 },
      { cptCode: "LASER-TAT-S", description: "Laser tattoo removal, small (<3 sq in)", category: "Cosmetic - Laser", feeCents: 20000 },
      { cptCode: "LASER-TAT-M", description: "Laser tattoo removal, medium (3-6 sq in)", category: "Cosmetic - Laser", feeCents: 35000 },
      { cptCode: "LASER-TAT-L", description: "Laser tattoo removal, large (>6 sq in)", category: "Cosmetic - Laser", feeCents: 50000 },

      // ═══════════════════════════════════════════════════════════════════════════
      // COSMETIC - OTHER PROCEDURES
      // ═══════════════════════════════════════════════════════════════════════════
      { cptCode: "MICRO-NEED", description: "Microneedling (collagen induction therapy)", category: "Cosmetic - Other", feeCents: 35000 },
      { cptCode: "MICRO-PRP", description: "Microneedling with PRP", category: "Cosmetic - Other", feeCents: 65000 },
      { cptCode: "DERMAPLNE", description: "Dermaplaning", category: "Cosmetic - Other", feeCents: 15000 },
      { cptCode: "HYDRAFACL", description: "HydraFacial treatment", category: "Cosmetic - Other", feeCents: 20000 },
      { cptCode: "KYBELLA", description: "Kybella (deoxycholic acid), per vial", category: "Cosmetic - Other", feeCents: 60000 },
      { cptCode: "SCLEROTHPY", description: "Sclerotherapy, spider veins (per session)", category: "Cosmetic - Other", feeCents: 35000 },

      // ═══════════════════════════════════════════════════════════════════════════
      // COSMETIC - CONSULTATIONS & PACKAGES
      // ═══════════════════════════════════════════════════════════════════════════
      { cptCode: "COSM-CONS", description: "Cosmetic consultation (new patient)", category: "Cosmetic - Consults", feeCents: 10000 },
      { cptCode: "COSM-FU", description: "Cosmetic follow-up", category: "Cosmetic - Consults", feeCents: 0 },
      { cptCode: "PKG-BOTOX3", description: "Botox package (3 treatments)", category: "Cosmetic - Packages", feeCents: 145000 },
      { cptCode: "PKG-FILLER2", description: "Filler package (2 syringes)", category: "Cosmetic - Packages", feeCents: 135000 },
      { cptCode: "PKG-LASER3", description: "IPL package (3 treatments)", category: "Cosmetic - Packages", feeCents: 90000 },
    ];

    // Insert all fee schedule items
    for (const item of feeScheduleItems) {
      await pool.query(
        `insert into fee_schedule_items(id, fee_schedule_id, cpt_code, cpt_description, category, fee_cents)
         values ($1,$2,$3,$4,$5,$6)
         on conflict (fee_schedule_id, cpt_code) do update
         set cpt_description = $4, category = $5, fee_cents = $6, updated_at = CURRENT_TIMESTAMP`,
        [randomUUID(), feeScheduleId, item.cptCode, item.description, item.category, item.feeCents],
      );
    }

    // Seed clinical protocols
    await seedProtocols(tenantId, "u-provider");

    // Seed patient portal accounts for testing
    const portalPasswordHash = bcrypt.hashSync("Portal123!", 10); // Dev/test only
    const portalAccounts = [
      { patientId: "p-demo", email: "jamie.patient@example.com" },
      { patientId: "p-demo-2", email: "sarah.smith@example.com" },
      { patientId: "p-perry", email: "dan.perry@example.com" },
    ];

    for (const account of portalAccounts) {
      await pool.query(
        `INSERT INTO patient_portal_accounts (id, tenant_id, patient_id, email, password_hash, is_active, email_verified)
         VALUES ($1, $2, $3, $4, $5, true, true)
         ON CONFLICT (tenant_id, email) DO NOTHING`,
        [randomUUID(), tenantId, account.patientId, account.email, portalPasswordHash]
      );
    }
    console.log("Seeded patient portal accounts");

    await pool.query("commit");
    // eslint-disable-next-line no-console
    console.log("Seed complete");
  } catch (err) {
    await pool.query("rollback");
    throw err;
  }
}

// Export seed function for programmatic use
export { seed as runSeed };

// Run if executed directly
if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("Seed failed", err);
      process.exit(1);
    });
}
