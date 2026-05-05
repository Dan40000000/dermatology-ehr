import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { pool } from "./pool";
import { seedProtocols } from "./seed-protocols";
import {
  addDaysToDateKey,
  getDateKeyInTimeZone,
  getPracticeTimeZone,
  getUtcInstantForPracticeDateTime,
  getUtcRangeForPracticeDate,
  getWeekdayForDateKey,
} from "../lib/practiceTimeZone";

async function seed() {
  await pool.query("begin");
  try {
    const tenantId = "tenant-demo";
    const tableColumnsCache = new Map<string, Set<string>>();
    const tableExists = async (tableName: string) => {
      const result = await pool.query(
        `select exists (
          select 1
          from information_schema.tables
          where table_schema = 'public' and table_name = $1
        ) as exists`,
        [tableName],
      );
      return Boolean(result.rows[0]?.exists);
    };
    const getTableColumns = async (tableName: string) => {
      if (tableColumnsCache.has(tableName)) {
        return tableColumnsCache.get(tableName)!;
      }
      const result = await pool.query(
        `select column_name
         from information_schema.columns
         where table_schema = 'public' and table_name = $1`,
        [tableName],
      );
      const columns = new Set<string>(result.rows.map((row) => String(row.column_name)));
      tableColumnsCache.set(tableName, columns);
      return columns;
    };
    const columnExists = async (tableName: string, columnName: string) => {
      return (await getTableColumns(tableName)).has(columnName);
    };
    await pool.query(
      `insert into tenants(id, name) values ($1, $2) on conflict (id) do nothing`,
      [tenantId, "Demo Dermatology"],
    );

    const users = [
      { id: "u-admin", email: "admin@demo.practice", role: "admin", fullName: "Admin User" },
      { id: "u-owner", email: "owner@demo.practice", role: "admin", fullName: "Practice Owner" },
      { id: "u-provider", email: "provider@demo.practice", role: "provider", fullName: "Derm Provider" },
      { id: "u-ma", email: "ma@demo.practice", role: "ma", fullName: "Medical Assistant" },
      { id: "u-front", email: "frontdesk@demo.practice", role: "front_desk", fullName: "Front Desk" },
      { id: "u-billing", email: "billing@demo.practice", role: "billing", fullName: "Billing User" },
      { id: "u-nurse", email: "nurse@demo.practice", role: "nurse", fullName: "Clinic Nurse" },
      { id: "u-manager", email: "manager@demo.practice", role: "manager", fullName: "Practice Manager" },
      { id: "u-scheduler", email: "scheduler@demo.practice", role: "scheduler", fullName: "Scheduler" },
      { id: "u-compliance", email: "compliance@demo.practice", role: "compliance_officer", fullName: "Compliance Officer" },
      { id: "u-staff", email: "staff@demo.practice", role: "staff", fullName: "General Staff" },
      { id: "u-hr", email: "hr@demo.practice", role: "hr", fullName: "HR User" },
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

    const rosterTarget = 800;
    const syntheticFirstNamesMale = [
      "Liam", "Noah", "Oliver", "James", "Benjamin", "Elijah", "Lucas", "Mason", "Ethan", "Henry",
      "Owen", "Levi", "Wyatt", "Jack", "Julian", "Caleb", "Ezra", "Dominic", "Isaac", "Parker",
    ];
    const syntheticFirstNamesFemale = [
      "Olivia", "Emma", "Charlotte", "Amelia", "Sophia", "Ava", "Mia", "Isabella", "Evelyn", "Harper",
      "Nora", "Lily", "Hannah", "Natalie", "Leah", "Claire", "Maya", "Grace", "Stella", "Zoey",
    ];
    const syntheticLastNames = [
      "Adams", "Anderson", "Bennett", "Brooks", "Carter", "Collins", "Diaz", "Edwards", "Foster", "Garcia",
      "Gomez", "Gray", "Harris", "Jackson", "Kelly", "Lee", "Lopez", "Mitchell", "Morgan", "Nelson",
      "Nguyen", "Ortiz", "Patel", "Perez", "Ramirez", "Reed", "Rivera", "Ross", "Sanders", "Scott",
      "Simmons", "Stewart", "Taylor", "Thomas", "Turner", "Walker", "Ward", "Watson", "White", "Young",
    ];
    const syntheticCities = [
      { city: "Denver", zip: "80202" },
      { city: "Boulder", zip: "80301" },
      { city: "Aurora", zip: "80012" },
      { city: "Lakewood", zip: "80226" },
      { city: "Littleton", zip: "80120" },
      { city: "Arvada", zip: "80003" },
      { city: "Westminster", zip: "80031" },
      { city: "Centennial", zip: "80112" },
      { city: "Parker", zip: "80134" },
      { city: "Thornton", zip: "80241" },
    ];
    const syntheticStreets = [
      "Maple", "Oak", "Pine", "Aspen", "Cedar", "Willow", "Cherry", "Juniper", "Sunset", "Highland",
      "Canyon", "Grant", "Pearl", "Lincoln", "Spruce", "Birch", "Madison", "Broadway", "Elm", "Meadow",
    ];
    const syntheticInsurances = [
      "Blue Cross Blue Shield of Colorado",
      "Aetna",
      "Cigna",
      "United Healthcare",
      "Kaiser Permanente",
      "Anthem Blue Cross",
      "Medicare",
    ];
    const syntheticAllergies = [
      "None",
      "Penicillin",
      "Sulfa drugs",
      "Latex",
      "Adhesive tape",
      "Doxycycline",
      "Nickel",
    ];
    const syntheticMedications = [
      "None",
      "Tretinoin cream",
      "Spironolactone 50mg daily",
      "Dupixent every 2 weeks",
      "Methotrexate 15mg weekly",
      "Benzoyl peroxide wash",
      "Clobetasol ointment",
      "Metronidazole cream",
      "Doxycycline 100mg BID",
      "Azelaic acid gel",
    ];
    const syntheticSeededRandom = (seed: number) => {
      let state = seed >>> 0;
      return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 0x100000000;
      };
    };
    const createSyntheticPatient = (index: number) => {
      const random = syntheticSeededRandom(20260427 + index);
      const sex = random() > 0.55 ? "F" : "M";
      const firstNames = sex === "F" ? syntheticFirstNamesFemale : syntheticFirstNamesMale;
      const firstName = firstNames[Math.floor(random() * firstNames.length)]!;
      const lastName = syntheticLastNames[index % syntheticLastNames.length]!;
      const cityInfo = syntheticCities[index % syntheticCities.length]!;
      const street = syntheticStreets[Math.floor(random() * syntheticStreets.length)]!;
      const birthYear = 1945 + Math.floor(random() * 60);
      const birthMonth = 1 + Math.floor(random() * 12);
      const birthDay = 1 + Math.floor(random() * 28);
      return {
        id: `p-synth-${String(index + 1).padStart(4, "0")}`,
        first_name: firstName,
        last_name: lastName,
        dob: `${birthYear}-${String(birthMonth).padStart(2, "0")}-${String(birthDay).padStart(2, "0")}`,
        phone: `(303) 555-${String(2000 + index).padStart(4, "0")}`,
        email: `${firstName}.${lastName}.${index + 1}@example.test`.toLowerCase(),
        address: `${200 + ((index * 19) % 9600)} ${street} ${random() > 0.5 ? "St" : "Ave"}`,
        city: cityInfo.city,
        state: "CO",
        zip: cityInfo.zip,
        insurance: syntheticInsurances[index % syntheticInsurances.length]!,
        allergies: syntheticAllergies[index % syntheticAllergies.length]!,
        medications: syntheticMedications[index % syntheticMedications.length]!,
      };
    };

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
        id: "demo-patient-1",
        first_name: "Alex",
        last_name: "Johnson",
        dob: "1985-03-15",
        phone: "(720) 555-0142",
        email: "patient@demo.portal",
        address: "4821 Pinecrest Drive",
        city: "Denver",
        state: "CO",
        zip: "80202",
        insurance: "Blue Cross Blue Shield of Colorado",
        allergies: "Penicillin (Hives), Sulfonamides (Rash)",
        medications: "Methotrexate 15mg weekly, Tretinoin 0.025% cream",
      },
      {
        id: "demo-patient-2",
        first_name: "Jane",
        last_name: "Doe",
        dob: "1992-07-22",
        phone: "(303) 555-0287",
        email: "jane@demo.portal",
        address: "1103 Maple Street",
        city: "Boulder",
        state: "CO",
        zip: "80301",
        insurance: "Aetna HMO Silver Plan",
        allergies: "Latex (Anaphylaxis), Nickel (Contact Dermatitis)",
        medications: "Dupilumab 300mg SC q2w, Hydrocortisone 2.5% cream, Cetirizine 10mg daily",
      },
      {
        id: "demo-patient-3",
        first_name: "Marcus",
        last_name: "Williams",
        dob: "2002-07-22",
        phone: "(720) 555-0319",
        email: "marcus@demo.portal",
        address: "88 Larimer Street",
        city: "Denver",
        state: "CO",
        zip: "80202",
        insurance: "United Healthcare",
        allergies: "Sulfa drugs (Rash)",
        medications: "Isotretinoin 40mg daily, Benzoyl peroxide 5% wash",
      },
      {
        id: "demo-patient-4",
        first_name: "Sofia",
        last_name: "Chen",
        dob: "1995-12-01",
        phone: "(303) 555-0441",
        email: "sofia@demo.portal",
        address: "302 Pearl Street",
        city: "Boulder",
        state: "CO",
        zip: "80302",
        insurance: "Cigna PPO",
        allergies: "No known allergies",
        medications: "Spironolactone 50mg daily, Tretinoin 0.05% cream",
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

    const syntheticPatientCount = Math.max(rosterTarget - patients.length, 0);
    for (let index = 0; index < syntheticPatientCount; index += 1) {
      patients.push(createSyntheticPatient(index));
    }

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

    const enrichedPortalPatientProfiles = [
      {
        id: "demo-patient-1",
        emergencyContactName: "Lisa Johnson",
        emergencyContactRelationship: "Spouse",
        emergencyContactPhone: "(720) 555-0143",
        pharmacyName: "Walgreens",
        pharmacyPhone: "(720) 555-9200",
        pharmacyAddress: "1560 Blake St, Denver, CO 80202",
      },
      {
        id: "demo-patient-2",
        emergencyContactName: "Mark Doe",
        emergencyContactRelationship: "Spouse",
        emergencyContactPhone: "(303) 555-0288",
        pharmacyName: "CVS Pharmacy",
        pharmacyPhone: "(303) 555-8800",
        pharmacyAddress: "1600 28th St, Boulder, CO 80301",
      },
      {
        id: "demo-patient-3",
        emergencyContactName: "Alicia Williams",
        emergencyContactRelationship: "Mother",
        emergencyContactPhone: "(720) 555-0320",
        pharmacyName: "King Soopers Pharmacy",
        pharmacyPhone: "(720) 555-7711",
        pharmacyAddress: "1950 Chestnut Pl, Denver, CO 80202",
      },
      {
        id: "demo-patient-4",
        emergencyContactName: "Daniel Chen",
        emergencyContactRelationship: "Brother",
        emergencyContactPhone: "(303) 555-0442",
        pharmacyName: "CVS Pharmacy",
        pharmacyPhone: "(303) 555-8800",
        pharmacyAddress: "1600 28th St, Boulder, CO 80301",
      },
    ];

    for (const profile of enrichedPortalPatientProfiles) {
      await pool.query(
        `update patients
         set emergency_contact_name = $3,
             emergency_contact_relationship = $4,
             emergency_contact_phone = $5,
             pharmacy_name = $6,
             pharmacy_phone = $7,
             pharmacy_address = $8,
             updated_at = current_timestamp
         where id = $1 and tenant_id = $2`,
        [
          profile.id,
          tenantId,
          profile.emergencyContactName,
          profile.emergencyContactRelationship,
          profile.emergencyContactPhone,
          profile.pharmacyName,
          profile.pharmacyPhone,
          profile.pharmacyAddress,
        ],
      );
    }

    const dateOffset = (days: number) => {
      const date = new Date();
      date.setUTCDate(date.getUTCDate() + days);
      return date.toISOString().slice(0, 10);
    };
    const hasPatientSmsPreferences = Boolean(
      (await pool.query("select to_regclass('patient_sms_preferences') as table_name")).rows[0]?.table_name,
    );
    const ensureRecallCommunicationPreferences = async (patientId: string, preferredMethod: string) => {
      await pool.query(
        `update patient_communication_preferences
         set allow_email = true,
             allow_sms = true,
             allow_phone = true,
             allow_mail = true,
             preferred_method = $3,
             opted_out = false,
             updated_at = now()
         where tenant_id = $1 and patient_id = $2`,
        [tenantId, patientId, preferredMethod],
      );

      await pool.query(
        `insert into patient_communication_preferences(
          id,
          tenant_id,
          patient_id,
          allow_email,
          allow_sms,
          allow_phone,
          allow_mail,
          preferred_method,
          opted_out,
          created_at,
          updated_at
        )
        select $1,$2,$3,true,true,true,true,$4,false,now(),now()
        where not exists (
          select 1 from patient_communication_preferences where tenant_id = $2 and patient_id = $3
        )`,
        [`recall-comm-pref-${patientId}`, tenantId, patientId, preferredMethod],
      );

      if (hasPatientSmsPreferences) {
        await pool.query(
          `insert into patient_sms_preferences(
            id,
            tenant_id,
            patient_id,
            opted_in,
            appointment_reminders,
            transactional_messages,
            marketing_messages,
            consent_date,
            consent_method,
            updated_at
          )
          values ($1,$2,$3,true,true,true,false,now(),'demo_recall_seed',now())
          on conflict (tenant_id, patient_id) do update set
            opted_in = true,
            appointment_reminders = true,
            transactional_messages = true,
            updated_at = now()`,
          [`sms-pref-recall-${patientId}`, tenantId, patientId],
        );
      }
    };

    const melanomaPatientIds = [
      "p-demo",
      "p-demo-2",
      "demo-patient-1",
      "demo-patient-2",
      "demo-patient-3",
      "demo-patient-4",
      ...Array.from({ length: 24 }, (_, index) => `p-${String(index + 1).padStart(3, "0")}`),
    ];
    const annualSkinCheckPatientIds = [
      ...Array.from({ length: 6 }, (_, index) => `p-${String(index + 25).padStart(3, "0")}`),
      ...Array.from({ length: 24 }, (_, index) => `p-synth-${String(index + 1).padStart(4, "0")}`),
    ];
    const melanomaStages = ["IA", "IB", "IIA", "IIB", "IIIA"];
    const melanomaSites = [
      "upper back",
      "right arm",
      "left shoulder",
      "scalp",
      "right thigh",
      "nose",
      "left calf",
      "chest",
      "right forearm",
      "left cheek",
      "mid back",
      "abdomen",
      "left ear",
      "right lower leg",
      "posterior neck",
      "left upper arm",
      "right temple",
      "left dorsal hand",
      "right shoulder",
      "left shin",
      "mid scalp",
      "left flank",
      "right chest",
      "left jawline",
      "upper sternum",
      "right calf",
      "left posterior thigh",
      "right lateral neck",
      "left collarbone",
      "mid upper back",
    ];

    const seedRecallCohorts = async (defaultProviderId: string) => {
      const melanomaRecallIds = melanomaPatientIds.map((_, index) => `melanoma-recall-${String(index + 1).padStart(2, "0")}`);
      const annualRecallIds = annualSkinCheckPatientIds.map((_, index) => `annual-skin-check-recall-${String(index + 1).padStart(2, "0")}`);

      await pool.query(
        `insert into recall_campaigns(
          id,
          tenant_id,
          name,
          description,
          recall_type,
          interval_months,
          criteria,
          message_template,
          is_active,
          created_at,
          updated_at
        )
        values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,true,now(),now())
        on conflict (id) do update set
          name = excluded.name,
          description = excluded.description,
          recall_type = excluded.recall_type,
          interval_months = excluded.interval_months,
          criteria = excluded.criteria,
          message_template = excluded.message_template,
          is_active = true,
          updated_at = now()`,
        [
          "recall-campaign-melanoma-surveillance",
          tenantId,
          "Melanoma Surveillance",
          "Patients with melanoma history who need recurring total body skin exams and staff outreach.",
          "Melanoma Surveillance",
          3,
          JSON.stringify({ diagnoses: ["C43.%", "D03.%", "Z85.820"], intervalsMonths: [3, 6], riskLevel: ["high"] }),
          "Dermatology DEMO Office: You are due for a dermatology follow-up visit. Please call us or reply to schedule. Reply STOP to opt out.",
        ],
      );

      await pool.query(
        `insert into recall_campaigns(
          id,
          tenant_id,
          name,
          description,
          recall_type,
          interval_months,
          criteria,
          message_template,
          is_active,
          created_at,
          updated_at
        )
        values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,true,now(),now())
        on conflict (id) do update set
          name = excluded.name,
          description = excluded.description,
          recall_type = excluded.recall_type,
          interval_months = excluded.interval_months,
          criteria = excluded.criteria,
          message_template = excluded.message_template,
          is_active = true,
          updated_at = now()`,
        [
          "recall-campaign-annual-skin-check",
          tenantId,
          "Annual Skin Check",
          "Patients due for annual total body skin exams and proactive outreach.",
          "Annual Skin Check",
          12,
          JSON.stringify({ appointmentType: ["Derm Consult", "Skin Check"], intervalMonths: [12], riskLevel: ["routine", "elevated"] }),
          "Dermatology DEMO Office: It is time to schedule your annual skin check. Please call us or reply to schedule. Reply STOP to opt out.",
        ],
      );

      await pool.query(
        `update recall_campaigns
         set is_active = false,
             updated_at = now()
         where tenant_id = $1
           and id <> 'recall-campaign-annual-skin-check'
           and (
             lower(coalesce(name, '')) like 'annual skin check%' or
             lower(coalesce(recall_type, '')) = 'annual skin check'
           )`,
        [tenantId],
      );

      await pool.query(
        `delete from patient_recalls
         where tenant_id = $1
           and campaign_id = 'recall-campaign-melanoma-surveillance'
           and not (id = any($2::text[]))`,
        [tenantId, melanomaRecallIds],
      );

      await pool.query(
        `delete from patient_recalls
         where tenant_id = $1
           and campaign_id = 'recall-campaign-annual-skin-check'
           and not (id = any($2::text[]))`,
        [tenantId, annualRecallIds],
      );

      for (let index = 0; index < melanomaPatientIds.length; index++) {
        const patientId = melanomaPatientIds[index]!;
        const dueOffset = -21 + index * 3;
        const intervalMonths = index % 2 === 0 ? 3 : 6;
        const stage = melanomaStages[index % melanomaStages.length]!;
        const site = melanomaSites[index % melanomaSites.length]!;
        const dueDate = dateOffset(dueOffset);
        const diagnosisDate = dateOffset(-365 - index * 21);
        const lastExamDate = dateOffset(dueOffset - intervalMonths * 30);
        const intervalText = `${intervalMonths}-month`;
        const diagnosisCode = index % 3 === 0 ? "C43.9" : index % 3 === 1 ? "D03.9" : "Z85.820";
        const diagnosisDescription =
          diagnosisCode === "C43.9"
            ? "Malignant melanoma of skin, unspecified"
            : diagnosisCode === "D03.9"
              ? "Melanoma in situ, unspecified"
              : "Personal history of malignant melanoma of skin";
        const clinicalNote = `Melanoma surveillance recall: Stage ${stage} melanoma history at ${site}; ${intervalText} total body skin exam due ${dueDate}.`;

        await pool.query(
          `update patients
           set past_medical_history = case
               when coalesce(past_medical_history, '') ilike '%melanoma%' then past_medical_history
               else concat_ws(E'\\n', nullif(past_medical_history, ''), $3::text)
             end,
             updated_at = now()
           where id = $1 and tenant_id = $2`,
          [patientId, tenantId, `History of malignant melanoma (${stage}), ${site}.`],
        );

        await pool.query(
          `update melanoma_registry
           set diagnosis_date = $3,
               primary_site = $4,
               ajcc_stage = $5,
               surveillance_schedule = $6,
               last_full_body_exam = $7,
               next_scheduled_exam = $8,
               recurrence_status = 'no_recurrence',
               surveillance_adherent = $9,
               notes = $10,
               updated_at = now()
           where tenant_id = $1 and patient_id = $2`,
          [
            tenantId,
            patientId,
            diagnosisDate,
            site,
            stage,
            `every_${intervalMonths}_months`,
            lastExamDate,
            dueDate,
            dueOffset >= 0,
            clinicalNote,
          ],
        );

        await pool.query(
          `insert into melanoma_registry(
            id,
            tenant_id,
            patient_id,
            diagnosis_date,
            primary_site,
            ajcc_stage,
            sentinel_node_biopsy_performed,
            sentinel_node_status,
            surveillance_schedule,
            last_full_body_exam,
            next_scheduled_exam,
            recurrence_status,
            initial_staging_documented,
            surveillance_adherent,
            notes,
            created_by
          )
          select $1,$2,$3,$4,$5,$6,true,'negative',$7,$8,$9,'no_recurrence',true,$10,$11,'u-admin'
          where not exists (
            select 1 from melanoma_registry where tenant_id = $2 and patient_id = $3
          )`,
          [
            `melanoma-registry-${patientId}`,
            tenantId,
            patientId,
            diagnosisDate,
            site,
            stage,
            `every_${intervalMonths}_months`,
            lastExamDate,
            dueDate,
            dueOffset >= 0,
            clinicalNote,
          ],
        );

        await pool.query(
          `insert into encounters(id, tenant_id, patient_id, provider_id, status, chief_complaint, hpi, ros, exam, assessment_plan)
           values ($1,$2,$3,$4,'locked',$5,$6,$7,$8,$9)
           on conflict (id) do update set
             patient_id = excluded.patient_id,
             provider_id = excluded.provider_id,
             status = excluded.status,
             chief_complaint = excluded.chief_complaint,
             hpi = excluded.hpi,
             ros = excluded.ros,
             exam = excluded.exam,
             assessment_plan = excluded.assessment_plan,
             updated_at = current_timestamp`,
          [
            `enc-melanoma-recall-${String(index + 1).padStart(2, "0")}`,
            tenantId,
            patientId,
            defaultProviderId,
            'Melanoma surveillance follow-up',
            `History of ${stage} melanoma at ${site}. Patient is due for ${intervalText} total body skin exam surveillance.`,
            'Denies new bleeding, pain, or rapidly enlarging lesions. Surveillance visit planned per melanoma protocol.',
            `Total body skin exam completed. Prior melanoma site at ${site} without obvious recurrence.`,
            `Continue ${intervalText} melanoma surveillance. Reinforced ABCDE warning signs and sun protection guidance.`,
          ],
        );

        await pool.query(
          `insert into encounter_diagnoses(id, tenant_id, encounter_id, icd10_code, description, is_primary, created_at)
           values ($1,$2,$3,$4,$5,true,now())
           on conflict (id) do update set
             icd10_code = excluded.icd10_code,
             description = excluded.description,
             is_primary = excluded.is_primary`,
          [
            `dx-melanoma-recall-${String(index + 1).padStart(2, "0")}`,
            tenantId,
            `enc-melanoma-recall-${String(index + 1).padStart(2, "0")}`,
            diagnosisCode,
            diagnosisDescription,
          ],
        );

        await pool.query(
          `insert into patient_recalls(
            id,
            tenant_id,
            patient_id,
            campaign_id,
            recall_type,
            recall_date,
            due_date,
            status,
            notes,
            doctor_notes,
            preferred_contact_method,
            notification_count,
            created_by,
            created_at,
            updated_at
          )
          values ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,'sms',0,'u-admin',now(),now())
          on conflict (id) do update set
            campaign_id = excluded.campaign_id,
            recall_type = excluded.recall_type,
            recall_date = excluded.recall_date,
            due_date = excluded.due_date,
            status = excluded.status,
            notes = excluded.notes,
            doctor_notes = excluded.doctor_notes,
            preferred_contact_method = excluded.preferred_contact_method,
            updated_at = now()`,
          [
            `melanoma-recall-${String(index + 1).padStart(2, "0")}`,
            tenantId,
            patientId,
            "recall-campaign-melanoma-surveillance",
            "Melanoma Surveillance",
            dueDate,
            dueOffset < -7 ? "pending" : dueOffset <= 0 ? "contacted" : "pending",
            clinicalNote,
            `Recommended ${intervalText} melanoma surveillance. Staff should contact patient and schedule a total body skin exam.`,
          ],
        );

        await ensureRecallCommunicationPreferences(patientId, "sms");

        await pool.query(
          `insert into tasks(
            id,
            tenant_id,
            patient_id,
            title,
            description,
            category,
            priority,
            status,
            due_date,
            due_at,
            assigned_to,
            created_by
          )
          values ($1,$2,$3,$4,$5,'recall',$6,'todo',$7,$7,'u-ma','u-admin')
          on conflict (id) do update set
            title = excluded.title,
            description = excluded.description,
            priority = excluded.priority,
            status = case when tasks.status = 'completed' then tasks.status else excluded.status end,
            due_date = excluded.due_date,
            due_at = excluded.due_at,
            assigned_to = excluded.assigned_to`,
          [
            `task-melanoma-recall-${String(index + 1).padStart(2, "0")}`,
            tenantId,
            patientId,
            `Schedule melanoma surveillance recall due ${dueDate}`,
            clinicalNote,
            dueOffset <= 0 ? "high" : "normal",
            dueDate,
          ],
        );
      }

      for (let index = 0; index < annualSkinCheckPatientIds.length; index++) {
        const patientId = annualSkinCheckPatientIds[index]!;
        const dueOffset = -18 + index * 4;
        const dueDate = dateOffset(dueOffset);
        const lastExamDate = dateOffset(-365 - index * 11);
        const annualNote = `Annual skin check recall due ${dueDate}. Last routine total body skin exam documented ${lastExamDate}.`;

        await pool.query(
          `update patients
           set past_medical_history = case
               when coalesce(past_medical_history, '') ilike '%annual skin check recall%' then past_medical_history
               else concat_ws(E'\\n', nullif(past_medical_history, ''), $3::text)
             end,
             updated_at = now()
           where id = $1 and tenant_id = $2`,
          [patientId, tenantId, 'Annual skin check recall program enrolled for preventive dermatology follow-up.'],
        );

        await pool.query(
          `insert into patient_recalls(
            id,
            tenant_id,
            patient_id,
            campaign_id,
            recall_type,
            recall_date,
            due_date,
            status,
            notes,
            doctor_notes,
            preferred_contact_method,
            notification_count,
            created_by,
            created_at,
            updated_at
          )
          values ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,'email',0,'u-admin',now(),now())
          on conflict (id) do update set
            campaign_id = excluded.campaign_id,
            recall_type = excluded.recall_type,
            recall_date = excluded.recall_date,
            due_date = excluded.due_date,
            status = excluded.status,
            notes = excluded.notes,
            doctor_notes = excluded.doctor_notes,
            preferred_contact_method = excluded.preferred_contact_method,
            updated_at = now()`,
          [
            `annual-skin-check-recall-${String(index + 1).padStart(2, "0")}`,
            tenantId,
            patientId,
            "recall-campaign-annual-skin-check",
            "Annual Skin Check",
            dueDate,
            dueOffset < 0 ? "pending" : "contacted",
            annualNote,
            "Schedule annual total body skin exam with routine preventive recall outreach.",
          ],
        );

        await ensureRecallCommunicationPreferences(patientId, "email");

        await pool.query(
          `insert into tasks(
            id,
            tenant_id,
            patient_id,
            title,
            description,
            category,
            priority,
            status,
            due_date,
            due_at,
            assigned_to,
            created_by
          )
          values ($1,$2,$3,$4,$5,'recall','normal','todo',$6,$6,'u-front','u-admin')
          on conflict (id) do update set
            title = excluded.title,
            description = excluded.description,
            status = case when tasks.status = 'completed' then tasks.status else excluded.status end,
            due_date = excluded.due_date,
            due_at = excluded.due_at,
            assigned_to = excluded.assigned_to`,
          [
            `task-annual-skin-check-${String(index + 1).padStart(2, "0")}`,
            tenantId,
            patientId,
            `Schedule annual skin check due ${dueDate}`,
            annualNote,
            dueDate,
          ],
        );
      }
    };

    const legacyPhilProvider = await pool.query(
      `select id
         from providers
        where tenant_id = $1
          and lower(full_name) like '%phil jackson%'
        order by id
        limit 1`,
      [tenantId],
    );
    const philProviderId = legacyPhilProvider.rows[0]?.id || "prov-demo-4";

    const providers = [
      { id: "prov-demo", name: "Dr. David Skin, MD, FAAD", specialty: "Dermatology - General" },
      { id: "prov-demo-2", name: "Riley Johnson, PA-C", specialty: "Dermatology - General" },
      { id: "prov-demo-3", name: "Dr. Maria Martinez, MD, FAAD", specialty: "Dermatology - General & Medical" },
      { id: philProviderId, name: "Dr. Phil Jackson - PA", specialty: "Dermatology" },
      { id: "prov-cosmetic-pa", name: "Sarah Mitchell, PA-C", specialty: "Cosmetic Dermatology" },
    ];

    for (const pr of providers) {
      await pool.query(
        `insert into providers(id, tenant_id, full_name, specialty)
         values ($1,$2,$3,$4)
         on conflict (id) do update set
           full_name = excluded.full_name,
           specialty = excluded.specialty`,
        [pr.id, tenantId, pr.name, pr.specialty],
      );
    }

    await seedRecallCohorts("prov-demo-3");

    // Facilities (Locations)
    const locations = [
      { id: "loc-demo", name: "Main Clinic", address: "123 Skin St, Denver, CO 80202", phone: "(303) 555-0100" },
      { id: "loc-east", name: "East Office", address: "456 Aurora Ave, Aurora, CO 80010", phone: "(303) 555-0101" },
      { id: "loc-south", name: "South Campus", address: "789 Littleton Blvd, Littleton, CO 80123", phone: "(303) 555-0102" },
      { id: "loc-virtual", name: "Virtual Care", address: "Video visit delivered through the portal", phone: "(303) 555-0199" },
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
      {
        id: "appttype-telehealth-fu",
        name: "Telehealth Follow-up",
        duration: 20,
        color: "#2563EB",
        category: "telehealth",
        description: "Virtual follow-up visit through secure video"
      },
      {
        id: "appttype-video-acne",
        name: "Video Acne Follow-Up",
        duration: 20,
        color: "#1D4ED8",
        category: "telehealth",
        description: "Virtual acne medication check and treatment follow-up"
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
      // Dr. Phil Jackson - PA: Monday-Friday, 8am-5pm
      { provider: philProviderId, day_of_week: 1, start_time: "08:00", end_time: "17:00" },
      { provider: philProviderId, day_of_week: 2, start_time: "08:00", end_time: "17:00" },
      { provider: philProviderId, day_of_week: 3, start_time: "08:00", end_time: "17:00" },
      { provider: philProviderId, day_of_week: 4, start_time: "08:00", end_time: "17:00" },
      { provider: philProviderId, day_of_week: 5, start_time: "08:00", end_time: "17:00" },
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

      await pool.query(
        `insert into provider_availability_templates(
          id, tenant_id, provider_id, day_of_week, start_time, end_time,
          slot_duration_minutes, allow_online_booking, is_active
        )
         select $1,$2,$3,$4,$5,$6,$7,true,true
         where not exists (
           select 1 from provider_availability_templates
           where tenant_id = $2
             and provider_id = $3
             and day_of_week = $4
             and start_time = $5::time
             and end_time = $6::time
         )`,
        [
          randomUUID(),
          tenantId,
          slot.provider,
          slot.day_of_week,
          slot.start_time,
          slot.end_time,
          15,
        ],
      );
    }

    await pool.query(
      `insert into online_booking_settings(
        id, tenant_id, is_enabled, booking_window_days, min_advance_hours, max_advance_days,
        allow_cancellation, cancellation_cutoff_hours, require_reason,
        confirmation_email, reminder_email, reminder_hours_before, custom_message
      )
       values ($1,$2,true,60,24,90,true,24,false,true,true,24,$3)
       on conflict (tenant_id) do update set
         is_enabled = excluded.is_enabled,
         booking_window_days = excluded.booking_window_days,
         min_advance_hours = excluded.min_advance_hours,
         max_advance_days = excluded.max_advance_days,
         allow_cancellation = excluded.allow_cancellation,
         cancellation_cutoff_hours = excluded.cancellation_cutoff_hours,
         require_reason = excluded.require_reason,
         confirmation_email = excluded.confirmation_email,
         reminder_email = excluded.reminder_email,
         reminder_hours_before = excluded.reminder_hours_before,
         custom_message = excluded.custom_message,
         updated_at = current_timestamp`,
      [
        randomUUID(),
        tenantId,
        "Demo online scheduling is enabled for the linked portal patients.",
      ],
    );

    // Clear existing appointments to regenerate with fresh dates.
    // A used local DB can have multiple appointment-linked tables, so break those links first.
    await pool.query(`DELETE FROM appointment_status_history WHERE tenant_id = $1`, [tenantId]);
    if (await tableExists("portal_checkin_sessions")) {
      await pool.query(`DELETE FROM portal_checkin_sessions WHERE tenant_id = $1`, [tenantId]);
    }
    if (await tableExists("checkin_sessions")) {
      await pool.query(`DELETE FROM checkin_sessions WHERE tenant_id = $1`, [tenantId]);
    }
    if (await tableExists("scheduled_reminders")) {
      await pool.query(`DELETE FROM scheduled_reminders WHERE tenant_id = $1`, [tenantId]);
    }
    if (await tableExists("patient_flow")) {
      await pool.query(`DELETE FROM patient_flow WHERE tenant_id = $1`, [tenantId]);
    }
    if (await columnExists("encounters", "appointment_id")) {
      await pool.query(`UPDATE encounters SET appointment_id = null WHERE tenant_id = $1`, [tenantId]);
    }
    if (await columnExists("time_blocks", "scheduled_appointment_id")) {
      await pool.query(`UPDATE time_blocks SET scheduled_appointment_id = null WHERE tenant_id = $1`, [tenantId]);
    }
    if (await columnExists("referrals", "appointment_id")) {
      await pool.query(`UPDATE referrals SET appointment_id = null WHERE tenant_id = $1`, [tenantId]);
    }
    await pool.query(`DELETE FROM appointments WHERE tenant_id = $1`, [tenantId]);

    const now = new Date();
    const practiceTimeZone = getPracticeTimeZone();
    const todayDateKey = getDateKeyInTimeZone(now, practiceTimeZone);
    const getSeedDateKey = (dayOffset: number) => addDaysToDateKey(todayDateKey, dayOffset);
    const buildPracticeInstant = (dateKey: string, hour: number, minute: number) =>
      getUtcInstantForPracticeDateTime(dateKey, hour, minute, practiceTimeZone);
    const buildPracticeWindow = (
      dateKey: string,
      hour: number,
      minute: number,
      durationMinutes: number,
    ) => {
      const startTime = buildPracticeInstant(dateKey, hour, minute);
      const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);
      return { startTime, endTime };
    };
    const scheduleHorizonDays = 180;
    const generalPatientIds = patients
      .filter((patient) => !String(patient.id).startsWith("demo-patient-"))
      .map((patient) => patient.id);
    const sarahPatients = generalPatientIds.filter((_, index) => index % 5 === 0);
    const medicalPatients = generalPatientIds.filter((_, index) => index % 5 !== 0);
    const skinPatients = medicalPatients.filter((_, index) => index % 4 === 0);
    const rileyPatients = medicalPatients.filter((_, index) => index % 4 === 1);
    const martinezPatients = medicalPatients.filter((_, index) => index % 4 === 2);
    const philPatients = medicalPatients.filter((_, index) => index % 4 === 3);
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
    // using the broader patient roster so no single chart gets unrealistically hammered.

    // Dr. Skin appointments - spread across next 6 months
    let skinApptCounter = 1;
    let skinPatientIndex = 0;
    let skinRandomSeed = 67890;
    const skinSeededRandom = () => {
      skinRandomSeed = (skinRandomSeed * 1103515245 + 12345) & 0x7fffffff;
      return skinRandomSeed / 0x7fffffff;
    };

    for (let dayOffset = 0; dayOffset <= scheduleHorizonDays; dayOffset++) {
      const apptDateKey = getSeedDateKey(dayOffset);
      const dayOfWeek = getWeekdayForDateKey(apptDateKey);
      if (dayOfWeek === 0 || dayOfWeek === 6) continue; // Skip weekends
      if (skinSeededRandom() < 0.15) continue; // Skip some days

      const apptsPerDay = Math.floor(skinSeededRandom() * 5) + 7; // 7-11 appointments
      let currentHour = 8;
      let currentMinute = 0;

      for (let apptNum = 0; apptNum < apptsPerDay; apptNum++) {
        const extraGap = Math.floor(skinSeededRandom() * 2) * 15;
        currentMinute += extraGap;
        while (currentMinute >= 60) { currentMinute -= 60; currentHour++; }
        if (currentHour >= 16) break;

        const apptStart = buildPracticeInstant(apptDateKey, currentHour, currentMinute);

        const typeRoll = skinSeededRandom();
        let duration = typeRoll < 0.5 ? 20 : (typeRoll < 0.8 ? 30 : 45);
        let apptTypeId = typeRoll < 0.5 ? "appttype-fu" : (typeRoll < 0.8 ? "appttype-demo" : "appttype-proc");

        const apptEnd = new Date(apptStart.getTime() + duration * 60 * 1000);
        currentMinute += duration;
        while (currentMinute >= 60) { currentMinute -= 60; currentHour++; }

        if (skinSeededRandom() < 0.7) skinPatientIndex++;
        const patientId = skinPatients[skinPatientIndex % skinPatients.length];

        let status = "scheduled";
        if (dayOffset === 0) {
          const statusRoll = skinSeededRandom();
          if (statusRoll < 0.08) status = "checked_in";
          else if (statusRoll < 0.12) status = "in_room";
        } else if (dayOffset <= 3 && skinSeededRandom() < 0.3) status = "checked_in";
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

    // Location IDs to rotate through
    const locationIds = ["loc-demo", "loc-east", "loc-south"];

    // PA Riley appointments - spread across next 6 months
    let rileyApptCounter = 1;
    let rileyPatientIndex = 0;
    let rileyRandomSeed = 54321;
    const rileySeededRandom = () => {
      rileyRandomSeed = (rileyRandomSeed * 1103515245 + 12345) & 0x7fffffff;
      return rileyRandomSeed / 0x7fffffff;
    };

    for (let dayOffset = 0; dayOffset <= scheduleHorizonDays; dayOffset++) {
      const apptDateKey = getSeedDateKey(dayOffset);
      const dayOfWeek = getWeekdayForDateKey(apptDateKey);
      if (dayOfWeek === 0 || dayOfWeek === 6) continue; // Skip weekends
      if (rileySeededRandom() < 0.12) continue; // Skip some days

      const apptsPerDay = Math.floor(rileySeededRandom() * 5) + 8; // 8-12 appointments
      let currentHour = 8;
      let currentMinute = 0;

      for (let apptNum = 0; apptNum < apptsPerDay; apptNum++) {
        const extraGap = Math.floor(rileySeededRandom() * 2) * 15;
        currentMinute += extraGap;
        while (currentMinute >= 60) { currentMinute -= 60; currentHour++; }
        if (currentHour >= 17) break; // PA works until 6pm

        const apptStart = buildPracticeInstant(apptDateKey, currentHour, currentMinute);

        const typeRoll = rileySeededRandom();
        let duration = typeRoll < 0.6 ? 20 : (typeRoll < 0.9 ? 30 : 45);
        let apptTypeId = typeRoll < 0.6 ? "appttype-fu" : (typeRoll < 0.9 ? "appttype-demo" : "appttype-proc");

        const apptEnd = new Date(apptStart.getTime() + duration * 60 * 1000);
        currentMinute += duration;
        while (currentMinute >= 60) { currentMinute -= 60; currentHour++; }

        if (rileySeededRandom() < 0.7) rileyPatientIndex++;
        const patientId = rileyPatients[rileyPatientIndex % rileyPatients.length];

        let status = "scheduled";
        if (dayOffset === 0) {
          const statusRoll = rileySeededRandom();
          if (statusRoll < 0.08) status = "checked_in";
          else if (statusRoll < 0.12) status = "in_room";
        } else if (dayOffset <= 3 && rileySeededRandom() < 0.25) status = "checked_in";
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

    // Dr. Phil Jackson appointments - established patient derm, skin checks, and minor procedures
    const apptTypesForPhil = [
      { id: "appttype-fu", duration: 20 },
      { id: "appttype-demo", duration: 30 },
      { id: "appttype-acne-fu", duration: 15 },
      { id: "appttype-eczema-visit", duration: 20 },
      { id: "appttype-psoriasis-fu", duration: 20 },
      { id: "appttype-skin-tag-removal", duration: 15 },
      { id: "appttype-wart-removal", duration: 15 },
      { id: "appttype-ak-treatment", duration: 20 },
      { id: "appttype-fullbody-screening", duration: 45 },
    ];

    let philApptCounter = 1;
    let philPatientIndex = 0;
    let philRandomSeed = 86420;
    const philSeededRandom = () => {
      philRandomSeed = (philRandomSeed * 1103515245 + 12345) & 0x7fffffff;
      return philRandomSeed / 0x7fffffff;
    };

    for (let dayOffset = 0; dayOffset <= scheduleHorizonDays; dayOffset++) {
      const apptDateKey = getSeedDateKey(dayOffset);
      const dayOfWeek = getWeekdayForDateKey(apptDateKey);
      if (dayOfWeek === 0 || dayOfWeek === 6) continue;
      if (philSeededRandom() < 0.12) continue;

      const apptsPerDay = Math.floor(philSeededRandom() * 4) + 5;
      let currentHour = 8;
      let currentMinute = 0;

      for (let apptNum = 0; apptNum < apptsPerDay; apptNum++) {
        const extraGap = Math.floor(philSeededRandom() * 2) * 15;
        currentMinute += extraGap;
        while (currentMinute >= 60) { currentMinute -= 60; currentHour++; }
        if (currentHour >= 17) break;

        const apptStart = buildPracticeInstant(apptDateKey, currentHour, currentMinute);

        const typeRoll = philSeededRandom();
        let apptType: { id: string; duration: number };
        if (typeRoll < 0.26) {
          apptType = apptTypesForPhil[0]!;
        } else if (typeRoll < 0.46) {
          apptType = apptTypesForPhil[1]!;
        } else if (typeRoll < 0.58) {
          apptType = apptTypesForPhil[8]!;
        } else if (typeRoll < 0.69) {
          apptType = apptTypesForPhil[2]!;
        } else if (typeRoll < 0.79) {
          apptType = apptTypesForPhil[3]!;
        } else if (typeRoll < 0.87) {
          apptType = apptTypesForPhil[4]!;
        } else if (typeRoll < 0.93) {
          apptType = apptTypesForPhil[5]!;
        } else if (typeRoll < 0.97) {
          apptType = apptTypesForPhil[6]!;
        } else {
          apptType = apptTypesForPhil[7]!;
        }

        const apptEnd = new Date(apptStart.getTime() + apptType.duration * 60 * 1000);
        currentMinute += apptType.duration;
        while (currentMinute >= 60) { currentMinute -= 60; currentHour++; }

        if (philSeededRandom() < 0.72) {
          philPatientIndex++;
        }
        const patientId = philPatients[philPatientIndex % philPatients.length];

        const locRoll = philSeededRandom();
        let locationForAppt;
        if (locRoll < 0.55) {
          locationForAppt = locationIds[0];
        } else if (locRoll < 0.82) {
          locationForAppt = locationIds[1];
        } else {
          locationForAppt = locationIds[2];
        }

        let status = "scheduled";
        if (dayOffset === 0) {
          const statusRoll = philSeededRandom();
          if (statusRoll < 0.1) status = "checked_in";
          else if (statusRoll < 0.15) status = "in_room";
        } else if (dayOffset <= 3) {
          const statusRoll = philSeededRandom();
          if (statusRoll < 0.18) status = "checked_in";
          else if (statusRoll < 0.28) status = "in_room";
        } else if (dayOffset > 14 && philSeededRandom() < 0.05) {
          status = "cancelled";
        }

        await pool.query(
          `insert into appointments(id, tenant_id, patient_id, provider_id, location_id, appointment_type_id, scheduled_start, scheduled_end, status)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           on conflict (id) do nothing`,
          [
            `appt-phil-${String(philApptCounter).padStart(4, "0")}`,
            tenantId,
            patientId,
            philProviderId,
            locationForAppt,
            apptType.id,
            apptStart.toISOString(),
            apptEnd.toISOString(),
            status,
          ],
        );

        philApptCounter++;
      }
    }

    // Dr. Martinez appointments - spread across next 6 months

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

    // Simple seeded random function for reproducible randomization
    let randomSeed = 12345;
    const seededRandom = () => {
      randomSeed = (randomSeed * 1103515245 + 12345) & 0x7fffffff;
      return randomSeed / 0x7fffffff;
    };

    let apptCounter = 1;
    let patientIndex = 0;

    // Create appointments for next 6 months (weekdays only) - start from today
    for (let dayOffset = 0; dayOffset <= scheduleHorizonDays; dayOffset++) {
      const apptDateKey = getSeedDateKey(dayOffset);
      const dayOfWeek = getWeekdayForDateKey(apptDateKey);

      // Skip weekends (0 = Sunday, 6 = Saturday)
      if (dayOfWeek === 0 || dayOfWeek === 6) continue;

      // Randomly skip some days (simulating PTO, conferences, etc.) - about 10% of days
      if (seededRandom() < 0.1) continue;

      // Random number of appointments per day (6-10)
      const baseAppts = Math.floor(seededRandom() * 5) + 6; // 6-10 appointments

      // Mondays and Fridays tend to be busier
      const apptsPerDay = (dayOfWeek === 1 || dayOfWeek === 5)
        ? Math.min(baseAppts + 1, 10)
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

        const apptStart = buildPracticeInstant(apptDateKey, currentHour, currentMinute);

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
        if (dayOffset === 0) {
          const statusRoll = seededRandom();
          if (statusRoll < 0.1) status = "checked_in";
          else if (statusRoll < 0.16) status = "in_room";
          else if (statusRoll < 0.2) status = "with_provider";
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

    // Sarah Mitchell, PA-C appointments - cosmetic specialist, spread across next 6 months

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

    for (let dayOffset = 0; dayOffset <= scheduleHorizonDays; dayOffset++) {
      const apptDateKey = getSeedDateKey(dayOffset);
      const dayOfWeek = getWeekdayForDateKey(apptDateKey);
      if (dayOfWeek === 0 || dayOfWeek === 6) continue; // Skip weekends
      if (sarahSeededRandom() < 0.1) continue; // Skip some days (PTO, etc.)

      // Sarah sees a lighter cosmetic panel so the schedule still has open time.
      const apptsPerDay = Math.floor(sarahSeededRandom() * 4) + 4;
      let currentHour = 9; // Sarah starts at 9am
      let currentMinute = 0;

      for (let apptNum = 0; apptNum < apptsPerDay; apptNum++) {
        // Add random gaps between appointments
        const extraGap = Math.floor(sarahSeededRandom() * 2) * 15;
        currentMinute += extraGap;
        while (currentMinute >= 60) { currentMinute -= 60; currentHour++; }
        if (currentHour >= 18) break; // Sarah works until 6pm

        const apptStart = buildPracticeInstant(apptDateKey, currentHour, currentMinute);

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
        if (dayOffset === 0) {
          const statusRoll = sarahSeededRandom();
          if (statusRoll < 0.1) status = "checked_in";
          else if (statusRoll < 0.14) status = "in_room";
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

    const buildAppointmentWindow = (
      dayOffset: number,
      hour: number,
      minute: number,
      durationMinutes: number,
    ) => {
      return buildPracticeWindow(getSeedDateKey(dayOffset), hour, minute, durationMinutes);
    };

    const overlapsAppointmentWindow = (
      leftStart: Date,
      leftEnd: Date,
      rightStart: Date,
      rightEnd: Date,
    ) => leftStart.getTime() < rightEnd.getTime() && leftEnd.getTime() > rightStart.getTime();

    const findOpenTelehealthWindow = async (
      providerId: string,
      telehealthDateKey: string,
      durationMinutes: number,
      candidates: ReadonlyArray<{ hour: number; minute: number }>,
    ) => {
      const { start: dayStart, end: dayEnd } = getUtcRangeForPracticeDate(telehealthDateKey, practiceTimeZone);

      const existingAppointments = await pool.query(
        `select scheduled_start, scheduled_end
           from appointments
          where tenant_id = $1
            and provider_id = $2
            and status <> 'cancelled'
            and scheduled_start < $4
            and scheduled_end > $3`,
        [tenantId, providerId, dayStart.toISOString(), dayEnd.toISOString()],
      );

      for (const candidate of candidates) {
        const startTime = buildPracticeInstant(telehealthDateKey, candidate.hour, candidate.minute);
        const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);
        const hasConflict = existingAppointments.rows.some((row) => {
          const existingStart = new Date(row.scheduled_start);
          const existingEnd = new Date(row.scheduled_end);
          if (Number.isNaN(existingStart.getTime()) || Number.isNaN(existingEnd.getTime())) {
            return false;
          }
          return overlapsAppointmentWindow(startTime, endTime, existingStart, existingEnd);
        });
        if (!hasConflict) {
          return { startTime, endTime };
        }
      }

      return null;
    };

    const portalPatientFixtures = [
      {
        patientId: "demo-patient-1",
        providerId: "prov-demo",
        pastAppointment: {
          id: "appt-portal-alex-completed",
          typeId: "appttype-psoriasis-fu",
          chiefComplaint: "Psoriasis follow-up and methotrexate monitoring",
          dayOffset: -42,
          hour: 14,
          minute: 30,
          duration: 30,
        },
        upcomingAppointment: {
          id: "appt-portal-alex-upcoming",
          typeId: "appttype-psoriasis-fu",
          chiefComplaint: "Psoriasis follow-up and medication review",
          dayOffset: 8,
          hour: 16,
          minute: 0,
          duration: 30,
        },
        encounter: {
          id: "enc-portal-alex-completed",
          chiefComplaint: "Plaque psoriasis follow-up",
          hpi: "Established patient with chronic plaque psoriasis reports improved scale and erythema on methotrexate with no new joint pain. Mild nausea the day after dosing only.",
          ros: "Skin: improved plaques, mild dryness. GI: mild post-dose nausea. MSK: denies joint swelling.",
          exam: "Residual erythematous plaques on elbows with minimal scale. No scalp involvement. No nail pitting.",
          assessmentPlan: "Assessment: Plaque psoriasis improving on methotrexate. Plan: continue methotrexate 15mg weekly with folic acid, repeat CBC/CMP in 8 weeks, follow up in 2 months.",
        },
        vitals: { id: "vitals-portal-alex-completed", heightCm: 178, weightKg: 81.8, bpSystolic: 120, bpDiastolic: 76, pulse: 70, tempC: 36.8 },
        prescriptions: [
          {
            id: "rx-portal-alex-1",
            medicationName: "Methotrexate",
            genericName: "Methotrexate",
            strength: "2.5mg",
            dosageForm: "tablet",
            sig: "Take 6 tablets by mouth once weekly.",
            quantity: 24,
            quantityUnit: "tablets",
            refills: 2,
            daysSupply: 28,
            pharmacyName: "Walgreens Denver",
          },
          {
            id: "rx-portal-alex-2",
            medicationName: "Tretinoin",
            genericName: "Tretinoin",
            strength: "0.025%",
            dosageForm: "cream",
            sig: "Apply a pea-sized amount nightly to affected areas.",
            quantity: 1,
            quantityUnit: "tube",
            refills: 3,
            daysSupply: 90,
            pharmacyName: "Walgreens Denver",
          },
        ],
        allergies: [
          { id: "alg-portal-alex-1", allergenType: "drug", allergenName: "Penicillin", reactionType: "hives", severity: "moderate", notes: "Childhood reaction with urticaria." },
          { id: "alg-portal-alex-2", allergenType: "drug", allergenName: "Sulfonamides", reactionType: "rash", severity: "mild", notes: "Delayed maculopapular rash." },
        ],
        documents: [
          {
            id: "doc-portal-alex-1",
            title: "Visit Summary - Psoriasis Follow-Up",
            type: "visit_summary",
            url: "https://example.com/portal/alex-visit-summary.pdf",
            category: "Visit Notes",
            notes: "Shared after methotrexate follow-up.",
          },
        ],
        visitSummary: {
          id: "vs-portal-alex-1",
          summaryText: "Psoriasis is improving on methotrexate with stable labs.",
          symptomsDiscussed: "Residual elbow plaques and mild post-dose nausea.",
          diagnosisShared: "Plaque psoriasis",
          treatmentPlan: "Continue methotrexate and folic acid.",
          nextSteps: "Repeat labs before next follow-up.",
          diagnoses: [{ code: "L40.0", description: "Plaque psoriasis" }],
          medications: [{ name: "Methotrexate", sig: "15mg weekly", quantity: 24 }],
          followUpInstructions: "Return in 8 weeks for repeat evaluation.",
        },
      },
      {
        patientId: "demo-patient-2",
        providerId: "prov-demo-3",
        pastAppointment: {
          id: "appt-portal-jane-completed",
          typeId: "appttype-eczema-visit",
          chiefComplaint: "Eczema control and post-procedure scar review",
          dayOffset: -55,
          hour: 15,
          minute: 0,
          duration: 30,
        },
        upcomingAppointment: {
          id: "appt-portal-jane-upcoming",
          typeId: "appttype-patch-testing",
          chiefComplaint: "Patch testing and eczema follow-up",
          dayOffset: 12,
          hour: 16,
          minute: 0,
          duration: 45,
        },
        encounter: {
          id: "enc-portal-jane-completed",
          chiefComplaint: "Eczema follow-up",
          hpi: "Established patient reports fewer severe flares on dupilumab with persistent intermittent pruritus on hands and neck. Surgical scar on right cheek healing well.",
          ros: "Skin: intermittent pruritus, improved eczema. Constitutional: no fever. All other systems reviewed and negative.",
          exam: "Mild erythematous lichenified plaques on dorsal hands and flexural neck. Well-healed linear scar on right cheek.",
          assessmentPlan: "Assessment: Atopic dermatitis improving on dupilumab. Plan: continue dupilumab, hydrocortisone for flares, proceed with patch testing at next visit.",
        },
        vitals: { id: "vitals-portal-jane-completed", heightCm: 165, weightKg: 61.5, bpSystolic: 110, bpDiastolic: 68, pulse: 74, tempC: 36.9 },
        prescriptions: [
          {
            id: "rx-portal-jane-1",
            medicationName: "Dupilumab",
            genericName: "Dupilumab",
            strength: "300mg/2mL",
            dosageForm: "injection",
            sig: "Inject 300mg subcutaneously every 2 weeks.",
            quantity: 2,
            quantityUnit: "syringes",
            refills: 5,
            daysSupply: 28,
            pharmacyName: "CVS Specialty Boulder",
          },
          {
            id: "rx-portal-jane-2",
            medicationName: "Hydrocortisone",
            genericName: "Hydrocortisone",
            strength: "2.5%",
            dosageForm: "cream",
            sig: "Apply to affected areas twice daily as needed for flares.",
            quantity: 1,
            quantityUnit: "tube",
            refills: 2,
            daysSupply: 60,
            pharmacyName: "CVS Boulder",
          },
        ],
        allergies: [
          { id: "alg-portal-jane-1", allergenType: "latex", allergenName: "Latex", reactionType: "anaphylaxis", severity: "life_threatening", notes: "History of throat swelling." },
          { id: "alg-portal-jane-2", allergenType: "contact", allergenName: "Nickel", reactionType: "contact_dermatitis", severity: "moderate", notes: "Patch-test positive contact allergy." },
        ],
        documents: [
          {
            id: "doc-portal-jane-1",
            title: "Patch Testing Instructions",
            type: "patient_handout",
            url: "https://example.com/portal/jane-patch-testing.pdf",
            category: "Forms",
            notes: "Pre-visit instructions for extended patch testing.",
          },
        ],
        visitSummary: {
          id: "vs-portal-jane-1",
          summaryText: "Eczema control has improved and patch testing remains indicated.",
          symptomsDiscussed: "Intermittent pruritus on hands and neck.",
          diagnosisShared: "Atopic dermatitis",
          treatmentPlan: "Continue dupilumab and topical steroid as needed.",
          nextSteps: "Return for patch testing.",
          diagnoses: [{ code: "L20.9", description: "Atopic dermatitis" }],
          medications: [{ name: "Dupilumab", sig: "300mg every 2 weeks", quantity: 2 }],
          followUpInstructions: "Avoid topical steroids before patch testing appointment.",
        },
      },
      {
        patientId: "demo-patient-3",
        providerId: philProviderId,
        pastAppointment: {
          id: "appt-portal-marcus-completed",
          typeId: "appttype-acne-fu",
          chiefComplaint: "Isotretinoin monitoring and acne follow-up",
          dayOffset: -35,
          hour: 14,
          minute: 45,
          duration: 15,
        },
        upcomingAppointment: {
          id: "appt-portal-marcus-upcoming",
          typeId: "appttype-video-acne",
          locationId: "loc-virtual",
          chiefComplaint: "Video acne follow-up and isotretinoin lab review",
          dayOffset: 0,
          hour: 10,
          minute: 0,
          duration: 20,
        },
        encounter: {
          id: "enc-portal-marcus-completed",
          chiefComplaint: "Isotretinoin follow-up",
          hpi: "Established acne patient is tolerating isotretinoin with dry lips and improving inflammatory lesions. No mood changes, headaches, or visual symptoms.",
          ros: "Skin: fewer papules and pustules, dry lips. Neuro: negative. Psych: negative.",
          exam: "Moderate improvement in inflammatory facial acne. Mild cheilitis. No cystic lesions today.",
          assessmentPlan: "Assessment: Acne vulgaris improving on isotretinoin. Plan: continue isotretinoin 40mg daily, continue benzoyl peroxide wash to trunk, repeat CBC/CMP/lipids.",
        },
        vitals: { id: "vitals-portal-marcus-completed", heightCm: 183, weightKg: 77.1, bpSystolic: 118, bpDiastolic: 74, pulse: 70, tempC: 36.8 },
        prescriptions: [
          {
            id: "rx-portal-marcus-1",
            medicationName: "Isotretinoin",
            genericName: "Isotretinoin",
            strength: "40mg",
            dosageForm: "capsule",
            sig: "Take 1 capsule by mouth daily with food.",
            quantity: 30,
            quantityUnit: "capsules",
            refills: 0,
            daysSupply: 30,
            pharmacyName: "King Soopers Pharmacy Denver",
          },
          {
            id: "rx-portal-marcus-2",
            medicationName: "Clindamycin",
            genericName: "Clindamycin Phosphate",
            strength: "1%",
            dosageForm: "lotion",
            sig: "Apply thin layer daily to acne-prone areas.",
            quantity: 1,
            quantityUnit: "bottle",
            refills: 2,
            daysSupply: 60,
            pharmacyName: "King Soopers Pharmacy Denver",
          },
        ],
        allergies: [
          { id: "alg-portal-marcus-1", allergenType: "drug", allergenName: "Sulfa drugs", reactionType: "rash", severity: "moderate", notes: "Rash after prior sulfonamide antibiotic." },
        ],
        documents: [
          {
            id: "doc-portal-marcus-1",
            title: "Isotretinoin Lab Results",
            type: "lab_result",
            url: "https://example.com/portal/marcus-labs.pdf",
            category: "Lab Results",
            notes: "Shared monthly monitoring labs.",
          },
        ],
        visitSummary: {
          id: "vs-portal-marcus-1",
          summaryText: "Acne is improving on isotretinoin with expected dryness only.",
          symptomsDiscussed: "Dry lips and resolving inflammatory acne.",
          diagnosisShared: "Acne vulgaris",
          treatmentPlan: "Continue isotretinoin and monthly labs.",
          nextSteps: "Follow up next month.",
          diagnoses: [{ code: "L70.0", description: "Acne vulgaris" }],
          medications: [{ name: "Isotretinoin", sig: "40mg daily", quantity: 30 }],
          followUpInstructions: "Use emollients and avoid donating blood while on isotretinoin.",
        },
      },
      {
        patientId: "demo-patient-4",
        providerId: "prov-demo-2",
        pastAppointment: {
          id: "appt-portal-sofia-completed",
          typeId: "appttype-acne-fu",
          chiefComplaint: "Hormonal acne and pigment follow-up",
          dayOffset: -70,
          hour: 15,
          minute: 15,
          duration: 30,
        },
        upcomingAppointment: {
          id: "appt-portal-sofia-upcoming",
          typeId: "appttype-fu",
          chiefComplaint: "Acne maintenance follow-up and skin check",
          dayOffset: 15,
          hour: 17,
          minute: 15,
          duration: 30,
        },
        encounter: {
          id: "enc-portal-sofia-completed",
          chiefComplaint: "Hormonal acne follow-up",
          hpi: "Established patient reports fewer jawline breakouts on spironolactone and tretinoin. Melasma is stable with sun protection.",
          ros: "Skin: improved acne, stable melasma. GU: no dizziness or breast tenderness.",
          exam: "Scattered resolving papules on chin with post-inflammatory hyperpigmented macules. Stable malar melasma.",
          assessmentPlan: "Assessment: Hormonal acne improving and melasma stable. Plan: continue spironolactone, tretinoin, azelaic acid, and tinted mineral sunscreen daily.",
        },
        vitals: { id: "vitals-portal-sofia-completed", heightCm: 168, weightKg: 57.6, bpSystolic: 108, bpDiastolic: 66, pulse: 70, tempC: 36.8 },
        prescriptions: [
          {
            id: "rx-portal-sofia-1",
            medicationName: "Spironolactone",
            genericName: "Spironolactone",
            strength: "50mg",
            dosageForm: "tablet",
            sig: "Take 1 tablet by mouth daily.",
            quantity: 30,
            quantityUnit: "tablets",
            refills: 5,
            daysSupply: 30,
            pharmacyName: "CVS Pharmacy Boulder",
          },
          {
            id: "rx-portal-sofia-2",
            medicationName: "Azelaic Acid",
            genericName: "Azelaic Acid",
            strength: "15%",
            dosageForm: "gel",
            sig: "Apply thin layer to face every morning.",
            quantity: 1,
            quantityUnit: "tube",
            refills: 2,
            daysSupply: 60,
            pharmacyName: "CVS Pharmacy Boulder",
          },
        ],
        allergies: [],
        documents: [
          {
            id: "doc-portal-sofia-1",
            title: "Acne and Melasma Treatment Plan",
            type: "care_plan",
            url: "https://example.com/portal/sofia-treatment-plan.pdf",
            category: "Forms",
            notes: "Shared treatment instructions and sunscreen recommendations.",
          },
        ],
        visitSummary: {
          id: "vs-portal-sofia-1",
          summaryText: "Hormonal acne is improving and melasma remains stable.",
          symptomsDiscussed: "Fewer jawline flares and stable facial pigment.",
          diagnosisShared: "Hormonal acne and melasma",
          treatmentPlan: "Continue spironolactone, tretinoin, and azelaic acid.",
          nextSteps: "Return for maintenance follow-up and skin check.",
          diagnoses: [
            { code: "L70.0", description: "Acne vulgaris" },
            { code: "L81.1", description: "Melasma" },
          ],
          medications: [{ name: "Spironolactone", sig: "50mg daily", quantity: 30 }],
          followUpInstructions: "Continue strict daily mineral sunscreen use.",
        },
      },
    ] as const;

    const prescriptionColumns = await getTableColumns("prescriptions");
    const allergyColumns = await getTableColumns("patient_allergies");

    for (const fixture of portalPatientFixtures) {
      const pastWindow = buildAppointmentWindow(
        fixture.pastAppointment.dayOffset,
        fixture.pastAppointment.hour,
        fixture.pastAppointment.minute,
        fixture.pastAppointment.duration,
      );
      const upcomingWindow = buildAppointmentWindow(
        fixture.upcomingAppointment.dayOffset,
        fixture.upcomingAppointment.hour,
        fixture.upcomingAppointment.minute,
        fixture.upcomingAppointment.duration,
      );

      await pool.query(
        `insert into appointments(id, tenant_id, patient_id, provider_id, location_id, appointment_type_id, scheduled_start, scheduled_end, status)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'completed')
         on conflict (id) do update set
           tenant_id = excluded.tenant_id,
           patient_id = excluded.patient_id,
           provider_id = excluded.provider_id,
           location_id = excluded.location_id,
           appointment_type_id = excluded.appointment_type_id,
           scheduled_start = excluded.scheduled_start,
           scheduled_end = excluded.scheduled_end,
           status = 'completed'`,
        [
          fixture.pastAppointment.id,
          tenantId,
          fixture.patientId,
          fixture.providerId,
          "loc-demo",
          fixture.pastAppointment.typeId,
          pastWindow.startTime.toISOString(),
          pastWindow.endTime.toISOString(),
        ],
      );

      await pool.query(
        `insert into appointments(id, tenant_id, patient_id, provider_id, location_id, appointment_type_id, scheduled_start, scheduled_end, status)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'scheduled')
         on conflict (id) do update set
           tenant_id = excluded.tenant_id,
           patient_id = excluded.patient_id,
           provider_id = excluded.provider_id,
           location_id = excluded.location_id,
           appointment_type_id = excluded.appointment_type_id,
           scheduled_start = excluded.scheduled_start,
           scheduled_end = excluded.scheduled_end,
           status = 'scheduled'`,
        [
          fixture.upcomingAppointment.id,
          tenantId,
          fixture.patientId,
          fixture.providerId,
          ("locationId" in fixture.upcomingAppointment ? fixture.upcomingAppointment.locationId : undefined) || "loc-demo",
          fixture.upcomingAppointment.typeId,
          upcomingWindow.startTime.toISOString(),
          upcomingWindow.endTime.toISOString(),
        ],
      );

      await pool.query(
        `insert into encounters(id, tenant_id, appointment_id, patient_id, provider_id, status, chief_complaint, hpi, ros, exam, assessment_plan)
         values ($1,$2,$3,$4,$5,'locked',$6,$7,$8,$9,$10)
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
           updated_at = current_timestamp`,
        [
          fixture.encounter.id,
          tenantId,
          fixture.pastAppointment.id,
          fixture.patientId,
          fixture.providerId,
          fixture.encounter.chiefComplaint,
          fixture.encounter.hpi,
          fixture.encounter.ros,
          fixture.encounter.exam,
          fixture.encounter.assessmentPlan,
        ],
      );

      await pool.query(
        `insert into vitals(id, tenant_id, encounter_id, height_cm, weight_kg, bp_systolic, bp_diastolic, pulse, temp_c)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         on conflict (id) do nothing`,
        [
          fixture.vitals.id,
          tenantId,
          fixture.encounter.id,
          fixture.vitals.heightCm,
          fixture.vitals.weightKg,
          fixture.vitals.bpSystolic,
          fixture.vitals.bpDiastolic,
          fixture.vitals.pulse,
          fixture.vitals.tempC,
        ],
      );

      for (const prescription of fixture.prescriptions) {
        if (prescriptionColumns.has("encounter_id")) {
          await pool.query(
            `insert into prescriptions(
              id, tenant_id, patient_id, encounter_id, provider_id,
              medication_name, generic_name, strength, dosage_form,
              sig, quantity, quantity_unit, refills, days_supply,
              pharmacy_name, status, created_by, updated_by
            )
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'transmitted',$16,$16)
             on conflict (id) do nothing`,
            [
              prescription.id,
              tenantId,
              fixture.patientId,
              fixture.encounter.id,
              fixture.providerId,
              prescription.medicationName,
              prescription.genericName,
              prescription.strength,
              prescription.dosageForm,
              prescription.sig,
              prescription.quantity,
              prescription.quantityUnit,
              prescription.refills,
              prescription.daysSupply,
              prescription.pharmacyName,
              "u-provider",
            ],
          );
        } else {
          await pool.query(
            `insert into prescriptions(
              id, tenant_id, patient_id, provider_id,
              medication_name, strength, sig, quantity, quantity_unit,
              refills, refills_remaining, days_supply, prescribed_date,
              pharmacy_name, status, drug_description
            )
             values (
              $1,$2,$3,$4,
              $5,$6,$7,$8,$9,
              $10,$10,$11,current_timestamp,
              $12,'transmitted',$13
             )
             on conflict (id) do nothing`,
            [
              prescription.id,
              tenantId,
              fixture.patientId,
              "u-provider",
              prescription.medicationName,
              prescription.strength,
              prescription.sig,
              prescription.quantity,
              prescription.quantityUnit,
              prescription.refills,
              prescription.daysSupply,
              prescription.pharmacyName,
              [prescription.genericName, prescription.dosageForm].filter(Boolean).join(" "),
            ],
          );
        }
      }

      for (const allergy of fixture.allergies) {
        const allergenColumn = allergyColumns.has("allergen_name") ? "allergen_name" : "allergen";
        await pool.query(
          `insert into patient_allergies(
            id, tenant_id, patient_id, allergen_type, ${allergenColumn}, reaction, reaction_type,
            severity, verified_by, verified_at, status, notes, source, created_by, updated_by
          )
           select
             $1,$2,$3,$4,$5,$6,$7,$8,$9,current_timestamp,'active',$10,'patient_reported',$9,$9
           where not exists (
             select 1
             from patient_allergies
             where tenant_id = $2
               and patient_id = $3
               and allergen_type = $4
               and ${allergenColumn} = $5
           )`,
          [
            allergy.id,
            tenantId,
            fixture.patientId,
            allergy.allergenType,
            allergy.allergenName,
            allergy.reactionType,
            allergy.reactionType,
            allergy.severity,
            "u-provider",
            allergy.notes,
          ],
        );
      }

      for (const document of fixture.documents) {
        await pool.query(
          `insert into documents(id, tenant_id, patient_id, encounter_id, title, type, url)
           values ($1,$2,$3,$4,$5,$6,$7)
           on conflict (id) do nothing`,
          [
            document.id,
            tenantId,
            fixture.patientId,
            fixture.encounter.id,
            document.title,
            document.type,
            document.url,
          ],
        );

        await pool.query(
          `insert into patient_document_shares(
            id, tenant_id, document_id, patient_id, shared_by, shared_at, notes, category
          )
           values ($1,$2,$3,$4,$5,current_timestamp,$6,$7)
           on conflict (id) do nothing`,
          [
            `share-${document.id}`,
            tenantId,
            document.id,
            fixture.patientId,
            "u-provider",
            document.notes,
            document.category,
          ],
        );
      }

      await pool.query(
        `insert into visit_summaries(
          id, tenant_id, encounter_id, patient_id, provider_id, visit_date, provider_name,
          summary_text, symptoms_discussed, diagnosis_shared, treatment_plan, next_steps,
          chief_complaint, diagnoses, medications, follow_up_instructions,
          is_released, released_at, released_by, shared_at, created_at, updated_at
        )
         values (
           $1,$2,$3,$4,$5,$6,$7,
           $8,$9,$10,$11,$12,
           $13,$14::jsonb,$15::jsonb,$16,
           true,current_timestamp,'u-provider',current_timestamp,current_timestamp,current_timestamp
         )
         on conflict (id) do nothing`,
        [
          fixture.visitSummary.id,
          tenantId,
          fixture.encounter.id,
          fixture.patientId,
          fixture.providerId,
          pastWindow.startTime.toISOString(),
          providers.find((provider) => provider.id === fixture.providerId)?.name || "Derm Provider",
          fixture.visitSummary.summaryText,
          fixture.visitSummary.symptomsDiscussed,
          fixture.visitSummary.diagnosisShared,
          fixture.visitSummary.treatmentPlan,
          fixture.visitSummary.nextSteps,
          fixture.encounter.chiefComplaint,
          JSON.stringify(fixture.visitSummary.diagnoses),
          JSON.stringify(fixture.visitSummary.medications),
          fixture.visitSummary.followUpInstructions,
        ],
      );
    }

    const telehealthProviderConfigs = [
      {
        providerId: "prov-demo-2",
        patientIds: ["demo-patient-4", ...rileyPatients],
        appointmentTypeId: "appttype-telehealth-fu",
        slotCandidates: [
          { hour: 9, minute: 40 },
          { hour: 11, minute: 0 },
          { hour: 13, minute: 0 },
          { hour: 15, minute: 0 },
          { hour: 16, minute: 20 },
        ],
      },
      {
        providerId: "prov-demo",
        patientIds: ["demo-patient-1", ...skinPatients],
        appointmentTypeId: "appttype-telehealth-fu",
        slotCandidates: [
          { hour: 9, minute: 50 },
          { hour: 11, minute: 20 },
          { hour: 13, minute: 10 },
          { hour: 15, minute: 20 },
        ],
      },
      {
        providerId: "prov-demo-3",
        patientIds: ["demo-patient-2", ...martinezPatients],
        appointmentTypeId: "appttype-telehealth-fu",
        slotCandidates: [
          { hour: 9, minute: 20 },
          { hour: 10, minute: 50 },
          { hour: 13, minute: 20 },
          { hour: 14, minute: 50 },
        ],
      },
      {
        providerId: "prov-cosmetic-pa",
        patientIds: sarahPatients,
        appointmentTypeId: "appttype-telehealth-fu",
        slotCandidates: [
          { hour: 10, minute: 15 },
          { hour: 12, minute: 15 },
          { hour: 14, minute: 15 },
          { hour: 16, minute: 15 },
        ],
      },
      {
        providerId: philProviderId,
        patientIds: [...philPatients],
        appointmentTypeId: "appttype-video-acne",
        slotCandidates: [
          { hour: 10, minute: 0 },
          { hour: 11, minute: 20 },
          { hour: 13, minute: 20 },
          { hour: 15, minute: 20 },
        ],
      },
    ] as const;

    const usedTelehealthPatientIds = new Set<string>(["demo-patient-3"]);
    const telehealthQueueOffsets = new Map<string, number>();
    let telehealthRotationOffset = 0;
    let telehealthCounter = 1;

    const getNextUniqueTelehealthPatient = (providerId: string, patientIds: readonly string[]) => {
      if (patientIds.length === 0) return null;
      const offset = telehealthQueueOffsets.get(providerId) || 0;
      for (let attempt = 0; attempt < patientIds.length; attempt += 1) {
        const patientId = patientIds[(offset + attempt) % patientIds.length]!;
        if (usedTelehealthPatientIds.has(patientId)) continue;
        return {
          patientId,
          nextOffset: offset + attempt + 1,
        };
      }
      return null;
    };

    for (let dayOffset = 1; dayOffset <= 60; dayOffset += 1) {
      const telehealthDateKey = getSeedDateKey(dayOffset);
      const dayOfWeek = getWeekdayForDateKey(telehealthDateKey);
      if (dayOfWeek === 0 || dayOfWeek === 6) continue;

      for (let providerAttempt = 0; providerAttempt < telehealthProviderConfigs.length; providerAttempt += 1) {
        const config = telehealthProviderConfigs[(telehealthRotationOffset + providerAttempt) % telehealthProviderConfigs.length]!;
        const candidate = getNextUniqueTelehealthPatient(config.providerId, config.patientIds);
        if (!candidate) continue;

        const window = await findOpenTelehealthWindow(
          config.providerId,
          telehealthDateKey,
          20,
          config.slotCandidates,
        );
        if (!window) continue;

        usedTelehealthPatientIds.add(candidate.patientId);
        telehealthQueueOffsets.set(config.providerId, candidate.nextOffset);
        await pool.query(
          `insert into appointments(
            id, tenant_id, patient_id, provider_id, location_id, appointment_type_id,
            scheduled_start, scheduled_end, status
          )
           values ($1,$2,$3,$4,$5,$6,$7,$8,'scheduled')
           on conflict (id) do nothing`,
          [
            `appt-telehealth-${String(telehealthCounter).padStart(4, "0")}`,
            tenantId,
            candidate.patientId,
            config.providerId,
            "loc-virtual",
            config.appointmentTypeId,
            window.startTime.toISOString(),
            window.endTime.toISOString(),
          ],
        );

        telehealthCounter += 1;
        telehealthRotationOffset += 1;
        break;
      }
    }

    // encounters and vitals
    const encounterId = "enc-demo";
    await pool.query(
      `insert into encounters(id, tenant_id, appointment_id, patient_id, provider_id, status, chief_complaint, hpi, ros, exam, assessment_plan)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
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
         updated_at = current_timestamp`,
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
      { code: "C44.319", description: "Basal cell carcinoma of skin of other parts of face", category: "Malignant Neoplasm", common: true },
      { code: "C44.41", description: "Basal cell carcinoma of skin of scalp and neck", category: "Malignant Neoplasm", common: true },
      { code: "C44.510", description: "Basal cell carcinoma of anal skin", category: "Malignant Neoplasm", common: false },
      { code: "C44.511", description: "Basal cell carcinoma of skin of trunk", category: "Malignant Neoplasm", common: true },
      { code: "C44.519", description: "Basal cell carcinoma of skin of other part of trunk", category: "Malignant Neoplasm", common: true },
      { code: "C44.611", description: "Basal cell carcinoma of skin of upper limb", category: "Malignant Neoplasm", common: true },
      { code: "C44.711", description: "Basal cell carcinoma of skin of lower limb", category: "Malignant Neoplasm", common: true },

      // Squamous cell carcinoma
      { code: "C44.02", description: "Squamous cell carcinoma of skin of lip", category: "Malignant Neoplasm", common: false },
      { code: "C44.121", description: "Squamous cell carcinoma of skin of unspecified eyelid, including canthus", category: "Malignant Neoplasm", common: true },
      { code: "C44.221", description: "Squamous cell carcinoma of skin of unspecified ear and external auricular canal", category: "Malignant Neoplasm", common: true },
      { code: "C44.320", description: "Squamous cell carcinoma of skin of unspecified parts of face", category: "Malignant Neoplasm", common: true },
      { code: "C44.321", description: "Squamous cell carcinoma of skin of nose", category: "Malignant Neoplasm", common: true },
      { code: "C44.329", description: "Squamous cell carcinoma of skin of other parts of face", category: "Malignant Neoplasm", common: true },
      { code: "C44.42", description: "Squamous cell carcinoma of skin of scalp and neck", category: "Malignant Neoplasm", common: true },
      { code: "C44.521", description: "Squamous cell carcinoma of skin of trunk", category: "Malignant Neoplasm", common: true },
      { code: "C44.529", description: "Squamous cell carcinoma of skin of other part of trunk", category: "Malignant Neoplasm", common: true },
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
    const cosmeticScheduleId = "cosmetic-fee-schedule";
    await pool.query(
      `insert into fee_schedules(id, tenant_id, name, is_default, description)
       values ($1,$2,$3,$4,$5)
       on conflict (id) do nothing`,
      [cosmeticScheduleId, tenantId, "Cosmetic Services", false, "Cosmetic dermatology procedures"],
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
      { cptCode: "COSM-FU", description: "Cosmetic follow-up", category: "Cosmetic - Consults", feeCents: 7500 },
      { cptCode: "PKG-BOTOX3", description: "Botox package (3 treatments)", category: "Cosmetic - Packages", feeCents: 145000 },
      { cptCode: "PKG-FILLER2", description: "Filler package (2 syringes)", category: "Cosmetic - Packages", feeCents: 135000 },
      { cptCode: "PKG-LASER3", description: "IPL package (3 treatments)", category: "Cosmetic - Packages", feeCents: 90000 },
    ];

    // Insert all fee schedule items
    for (const item of feeScheduleItems) {
      const targetScheduleId = item.category?.startsWith("Cosmetic -")
        ? cosmeticScheduleId
        : feeScheduleId;
      await pool.query(
        `insert into fee_schedule_items(id, fee_schedule_id, cpt_code, cpt_description, category, fee_cents)
         values ($1,$2,$3,$4,$5,$6)
         on conflict (fee_schedule_id, cpt_code) do update
         set cpt_description = $4, category = $5, fee_cents = $6, updated_at = CURRENT_TIMESTAMP`,
        [randomUUID(), targetScheduleId, item.cptCode, item.description, item.category, item.feeCents],
      );
    }

    // Seed clinical protocols
    await seedProtocols(tenantId, "u-provider");

    // Seed patient portal accounts for testing
    const portalPasswordHash = bcrypt.hashSync("Portal123!", 10); // Dev/test only
    const portalAccounts = [
      { patientId: "demo-patient-1", email: "patient@demo.portal" },
      { patientId: "demo-patient-2", email: "jane@demo.portal" },
      { patientId: "demo-patient-3", email: "marcus@demo.portal" },
      { patientId: "demo-patient-4", email: "sofia@demo.portal" },
      { patientId: "p-demo", email: "jamie.patient@example.com" },
      { patientId: "p-demo-2", email: "alex.derm@example.com" },
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

    await pool.query(
      `update appointments
       set status = 'scheduled'
       where tenant_id = $1
         and status = 'completed'
         and (scheduled_start at time zone 'America/Denver')::date = (now() at time zone 'America/Denver')::date
         and (
           id like 'appt-skin-%' or
           id like 'appt-riley-%' or
           id like 'appt-phil-%' or
           id like 'appt-martinez-%' or
           id like 'appt-sarah-%'
         )`,
      [tenantId],
    );

    await pool.query(
      `update appointments
       set status = 'scheduled',
           arrived_at = null,
           checked_in_at = null,
           roomed_at = null,
           completed_at = null,
           updated_at = now()
       where tenant_id = $1
         and status in ('checked_in', 'in_room', 'with_provider', 'checkout')
         and (
           id like 'appt-skin-%' or
           id like 'appt-riley-%' or
           id like 'appt-phil-%' or
           id like 'appt-martinez-%' or
           id like 'appt-sarah-%'
         )`,
      [tenantId],
    );

    await pool.query(
      `update patient_flow
       set status = 'completed',
           completed_at = coalesce(completed_at, now()),
           status_changed_at = now(),
           updated_at = now()
       where tenant_id = $1
         and status <> 'completed'`,
      [tenantId],
    );

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
