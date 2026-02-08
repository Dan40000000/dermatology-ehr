import { pool } from "../db/pool";
import config from "../config";
import { buildSsnFields } from "../security/encryption";

async function run() {
  if (!config.security.phiEncryptionEnabled) {
    throw new Error("PHI_ENCRYPTION_ENABLED must be true to run SSN encryption backfill");
  }
  if (!config.security.encryptionKey) {
    throw new Error("ENCRYPTION_KEY is required to run SSN encryption backfill");
  }

  const result = await pool.query(
    `SELECT id, ssn
     FROM patients
     WHERE ssn IS NOT NULL AND ssn <> ''
       AND (ssn_encrypted IS NULL OR ssn_encrypted = '')`
  );

  if (result.rows.length === 0) {
    // eslint-disable-next-line no-console
    console.log("No SSN records found for encryption backfill.");
    return;
  }

  // eslint-disable-next-line no-console
  console.log(`Encrypting SSNs for ${result.rows.length} patients...`);

  for (const row of result.rows) {
    const { ssnLast4, ssnEncrypted } = buildSsnFields(row.ssn as string);
    await pool.query(
      `UPDATE patients
       SET ssn_last4 = $1,
           ssn_encrypted = $2,
           ssn = NULL
       WHERE id = $3`,
      [ssnLast4, ssnEncrypted, row.id]
    );
  }

  // eslint-disable-next-line no-console
  console.log("SSN encryption backfill complete.");
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error("SSN encryption backfill failed", error);
    process.exit(1);
  });
