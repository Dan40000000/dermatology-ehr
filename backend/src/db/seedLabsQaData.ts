import { pool } from "./pool";

type SeedOrder = {
  id: string;
  type: "lab" | "pathology";
  status: "pending" | "in-progress" | "completed";
  priority: "routine" | "normal" | "high" | "urgent" | "stat";
  details: string;
  notes: string;
  createdAt: string;
};

function isoDaysAgo(daysAgo: number, hour = 9): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

async function resolveTenantId(): Promise<string> {
  const envTenant = process.env.SEED_TENANT_ID?.trim();
  if (envTenant) return envTenant;

  const tenantResult = await pool.query(`select id from tenants order by created_at asc limit 1`);
  if (!tenantResult.rowCount) {
    throw new Error("No tenant found. Set SEED_TENANT_ID or create a tenant first.");
  }
  return tenantResult.rows[0].id as string;
}

async function seedLabsQaData() {
  const tenantId = await resolveTenantId();

  const providerResult = await pool.query(
    `select id, full_name
     from providers
     where tenant_id = $1
     order by created_at asc
     limit 1`,
    [tenantId],
  );
  if (!providerResult.rowCount) {
    throw new Error(`No provider found for tenant ${tenantId}`);
  }

  const providerId = providerResult.rows[0].id as string;
  const providerName = (providerResult.rows[0].full_name as string | null) || "Provider";

  const patientResult = await pool.query(
    `select id
     from patients
     where tenant_id = $1
     order by created_at asc
     limit 10`,
    [tenantId],
  );
  if (!patientResult.rowCount) {
    throw new Error(`No patients found for tenant ${tenantId}`);
  }

  const patientIds = patientResult.rows.map((row) => row.id as string);
  const pickPatient = (index: number) => patientIds[index % patientIds.length];

  const seedOrders: SeedOrder[] = [
    {
      id: "qa-lab-order-01",
      type: "lab",
      status: "pending",
      priority: "routine",
      details: "CBC with differential",
      notes: "QA seed: pending CBC for Labs page validation",
      createdAt: isoDaysAgo(0, 8),
    },
    {
      id: "qa-lab-order-02",
      type: "lab",
      status: "pending",
      priority: "routine",
      details: "Comprehensive metabolic panel",
      notes: "QA seed: pending CMP for Labs page validation",
      createdAt: isoDaysAgo(0, 9),
    },
    {
      id: "qa-lab-order-03",
      type: "lab",
      status: "pending",
      priority: "routine",
      details: "Lipid panel",
      notes: "QA seed: pending lipid panel for Labs page validation",
      createdAt: isoDaysAgo(1, 10),
    },
    {
      id: "qa-lab-order-04",
      type: "lab",
      status: "pending",
      priority: "high",
      details: "TSH + free T4",
      notes: "QA seed: additional pending endocrine labs",
      createdAt: isoDaysAgo(1, 11),
    },
    {
      id: "qa-lab-order-05",
      type: "lab",
      status: "in-progress",
      priority: "urgent",
      details: "HbA1c + fasting glucose",
      notes: "QA seed: in-progress chemistry panel",
      createdAt: isoDaysAgo(2, 9),
    },
    {
      id: "qa-lab-order-06",
      type: "lab",
      status: "completed",
      priority: "normal",
      details: "Vitamin D 25-OH",
      notes: "QA seed: completed lab result",
      createdAt: isoDaysAgo(3, 9),
    },
    {
      id: "qa-lab-order-07",
      type: "pathology",
      status: "pending",
      priority: "routine",
      details: "Shave biopsy - right forearm lesion",
      notes: "QA seed: pending pathology specimen",
      createdAt: isoDaysAgo(0, 13),
    },
    {
      id: "qa-lab-order-08",
      type: "pathology",
      status: "in-progress",
      priority: "normal",
      details: "Excision specimen - left cheek",
      notes: "QA seed: pathology in-progress",
      createdAt: isoDaysAgo(1, 14),
    },
    {
      id: "qa-lab-order-09",
      type: "pathology",
      status: "completed",
      priority: "normal",
      details: "Punch biopsy - scalp plaque",
      notes: "QA seed: completed pathology",
      createdAt: isoDaysAgo(4, 15),
    },
  ];

  for (const [index, order] of seedOrders.entries()) {
    await pool.query(
      `insert into orders(
        id, tenant_id, encounter_id, patient_id, provider_id, provider_name,
        type, status, priority, details, notes, created_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      on conflict (id) do update set
        patient_id = excluded.patient_id,
        provider_id = excluded.provider_id,
        provider_name = excluded.provider_name,
        type = excluded.type,
        status = excluded.status,
        priority = excluded.priority,
        details = excluded.details,
        notes = excluded.notes,
        created_at = excluded.created_at`,
      [
        order.id,
        tenantId,
        null,
        pickPatient(index),
        providerId,
        providerName,
        order.type,
        order.status,
        order.priority,
        order.details,
        order.notes,
        order.createdAt,
      ],
    );
  }

  const summary = await pool.query(
    `select type, status, count(*)::int as count
     from orders
     where tenant_id = $1 and id like 'qa-lab-order-%'
     group by type, status
     order by type, status`,
    [tenantId],
  );

  console.log(`Seeded/updated ${seedOrders.length} QA lab/pathology orders for tenant ${tenantId}`);
  console.table(summary.rows);
}

seedLabsQaData()
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed to seed Labs QA data:", message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
