import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { pool } from "./pool";

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

    const passwordHash = bcrypt.hashSync("Password123!", 10);
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
      { id: "appttype-demo", name: "Derm Consult", duration: 30 },
      { id: "appttype-fu", name: "Follow Up", duration: 20 },
      { id: "appttype-proc", name: "Procedure", duration: 45 },
    ];

    for (const at of apptTypes) {
      await pool.query(
        `insert into appointment_types(id, tenant_id, name, duration_minutes)
         values ($1,$2,$3,$4) on conflict (id) do nothing`,
        [at.id, tenantId, at.name, at.duration],
      );
    }

    const availability = [
      { provider: "prov-demo", day_of_week: 1, start_time: "09:00", end_time: "16:00" },
      { provider: "prov-demo", day_of_week: 3, start_time: "09:00", end_time: "16:00" },
      { provider: "prov-demo-2", day_of_week: 2, start_time: "10:00", end_time: "18:00" },
    ];

    for (const slot of availability) {
      await pool.query(
        `insert into provider_availability(id, tenant_id, provider_id, day_of_week, start_time, end_time)
         values ($1,$2,$3,$4,$5,$6) on conflict (id) do nothing`,
        [randomUUID(), tenantId, slot.provider, slot.day_of_week, slot.start_time, slot.end_time],
      );
    }

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
         on conflict (id) do nothing`,
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
         on conflict (id) do nothing`,
        [randomUUID(), icd.code, icd.description, icd.category, icd.common],
      );
    }

    // Create a default fee schedule for the demo tenant
    const feeScheduleId = "fee-schedule-demo";
    await pool.query(
      `insert into fee_schedules(id, tenant_id, name, is_default)
       values ($1,$2,$3,$4)
       on conflict (id) do nothing`,
      [feeScheduleId, tenantId, "Standard Fee Schedule", true],
    );

    await pool.query("commit");
    // eslint-disable-next-line no-console
    console.log("Seed complete");
  } catch (err) {
    await pool.query("rollback");
    throw err;
  }
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Seed failed", err);
    process.exit(1);
  });
