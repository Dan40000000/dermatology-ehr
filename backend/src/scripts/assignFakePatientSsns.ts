import { pool } from "../db/pool";
import config from "../config";
import { buildSsnFields } from "../security/encryption";

type PatientRow = {
  id: string;
  tenant_id: string;
  first_name: string | null;
  last_name: string | null;
  ssn_last4: string | null;
  ssn_encrypted: string | null;
  fake_ordinal: string | number;
};

function buildFakeSsn(ordinal: number): string {
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > 899_999) {
    throw new Error(`Cannot generate fake SSN for ordinal ${ordinal}`);
  }

  const group = String(10 + Math.floor((ordinal - 1) / 9999)).padStart(2, "0");
  const serial = String(((ordinal - 1) % 9999) + 1).padStart(4, "0");

  return `666${group}${serial}`;
}

function parseArgs(argv: string[]) {
  return {
    dryRun: argv.includes("--dry-run"),
    overwrite: argv.includes("--overwrite"),
  };
}

async function run() {
  const { dryRun, overwrite } = parseArgs(process.argv.slice(2));

  if (!config.security.phiEncryptionEnabled) {
    throw new Error("PHI_ENCRYPTION_ENABLED must be true to assign encrypted patient SSNs");
  }
  if (!config.security.encryptionKey) {
    throw new Error("ENCRYPTION_KEY is required to assign encrypted patient SSNs");
  }

  const result = await pool.query<PatientRow>(
    `SELECT id,
            tenant_id,
            first_name,
            last_name,
            ssn_last4,
            ssn_encrypted,
            ROW_NUMBER() OVER (ORDER BY tenant_id, created_at, id) AS fake_ordinal
     FROM patients
     ORDER BY tenant_id, created_at, id`,
  );

  const patientsToUpdate = result.rows.filter((patient) => (
    overwrite
      ? true
      : !patient.ssn_last4 || !patient.ssn_encrypted
  ));

  if (patientsToUpdate.length === 0) {
    // eslint-disable-next-line no-console
    console.log("All patients already have protected SSN fields.");
    return;
  }

  if (dryRun) {
    // eslint-disable-next-line no-console
    console.log(`Dry run: ${patientsToUpdate.length} patients would receive encrypted fake SSNs.`);
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const patient of patientsToUpdate) {
      const ordinal = Number(patient.fake_ordinal);
      const fakeSsn = buildFakeSsn(ordinal);
      const { ssnLast4, ssnEncrypted } = buildSsnFields(fakeSsn);

      if (!ssnLast4 || !ssnEncrypted) {
        throw new Error(`Failed to build encrypted SSN fields for patient ${patient.id}`);
      }

      await client.query(
        `UPDATE patients
         SET ssn_last4 = $1,
             ssn_encrypted = $2,
             ssn = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3
           AND tenant_id = $4`,
        [ssnLast4, ssnEncrypted, patient.id, patient.tenant_id],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  // eslint-disable-next-line no-console
  console.log(`Assigned encrypted fake SSNs to ${patientsToUpdate.length} patients.`);
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Failed to assign fake patient SSNs:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
