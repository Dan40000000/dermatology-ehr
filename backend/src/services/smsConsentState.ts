import crypto from 'crypto';

type QueryableClient = {
  query: (sql: string, params?: any[]) => Promise<{ rows: any[] }>;
};

export interface SMSConsentRecord {
  id: string;
  patientId: string;
  consentGiven: boolean;
  consentDate?: string | null;
  consentMethod?: 'verbal' | 'written' | 'electronic' | null;
  obtainedByUserId?: string | null;
  obtainedByName?: string | null;
  expirationDate?: string | null;
  consentRevoked: boolean;
  revokedDate?: string | null;
  revokedReason?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface SMSConsentState {
  hasConsent: boolean;
  pendingRequest: boolean;
  optedOut: boolean;
  consent?: SMSConsentRecord;
  daysUntilExpiration: number | null;
  requestedAt: string | null;
  preferenceOptIn: boolean | null;
}

export interface RecordSMSConsentInput {
  consentMethod: 'verbal' | 'written' | 'electronic';
  obtainedByUserId?: string | null;
  obtainedByName: string;
  expirationDate?: string | null;
  notes?: string | null;
}

export interface RevokeSMSConsentInput {
  reason?: string | null;
  notes?: string | null;
  optedOutVia?: string | null;
}

const latestConsentSelect = `
  SELECT
    id,
    patient_id as "patientId",
    consent_given as "consentGiven",
    consent_date as "consentDate",
    consent_method as "consentMethod",
    obtained_by_user_id as "obtainedByUserId",
    obtained_by_name as "obtainedByName",
    expiration_date as "expirationDate",
    consent_revoked as "consentRevoked",
    revoked_date as "revokedDate",
    revoked_reason as "revokedReason",
    created_at as "createdAt",
    updated_at as "updatedAt"
  FROM sms_consent
  WHERE tenant_id = $1 AND patient_id = $2
  ORDER BY created_at DESC
  LIMIT 1
`;

function calculateDaysUntilExpiration(expirationDate?: string | null): number | null {
  if (!expirationDate) {
    return null;
  }

  const expDate = new Date(expirationDate);
  const now = new Date();
  const diffTime = expDate.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function isConsentExpired(expirationDate?: string | null): boolean {
  if (!expirationDate) {
    return false;
  }

  const expDate = new Date(expirationDate);
  return expDate.getTime() < Date.now();
}

export async function getSMSConsentState(
  tenantId: string,
  patientId: string,
  client: QueryableClient
): Promise<SMSConsentState> {
  const [consentResult, prefsResult] = await Promise.all([
    client.query(latestConsentSelect, [tenantId, patientId]),
    client.query(
      `SELECT
         opted_in as "optedIn",
         consent_date as "consentDate",
         consent_method as "consentMethod",
         opted_out_at as "optedOutAt",
         opted_out_via as "optedOutVia"
       FROM patient_sms_preferences
       WHERE tenant_id = $1 AND patient_id = $2
       LIMIT 1`,
      [tenantId, patientId]
    ),
  ]);

  const rawConsent = consentResult.rows[0] || undefined;
  const consent = rawConsent
    ? ({
        ...rawConsent,
        patientId: rawConsent.patientId ?? rawConsent.patient_id,
        consentGiven: rawConsent.consentGiven ?? rawConsent.consent_given ?? false,
        consentDate: rawConsent.consentDate ?? rawConsent.consent_date ?? null,
        consentMethod: rawConsent.consentMethod ?? rawConsent.consent_method ?? null,
        obtainedByUserId: rawConsent.obtainedByUserId ?? rawConsent.obtained_by_user_id ?? null,
        obtainedByName: rawConsent.obtainedByName ?? rawConsent.obtained_by_name ?? null,
        expirationDate: rawConsent.expirationDate ?? rawConsent.expiration_date ?? null,
        consentRevoked: rawConsent.consentRevoked ?? rawConsent.consent_revoked ?? false,
        revokedDate: rawConsent.revokedDate ?? rawConsent.revoked_date ?? null,
        revokedReason: rawConsent.revokedReason ?? rawConsent.revoked_reason ?? null,
        createdAt: rawConsent.createdAt ?? rawConsent.created_at ?? null,
        updatedAt: rawConsent.updatedAt ?? rawConsent.updated_at ?? null,
      } as SMSConsentRecord)
    : undefined;
  const prefs = prefsResult.rows[0] || null;
  const preferenceOptIn =
    typeof prefs?.optedIn === 'boolean'
      ? prefs.optedIn
      : typeof prefs?.opted_in === 'boolean'
      ? prefs.opted_in
      : null;
  const activeConsent =
    !!consent &&
    consent.consentGiven &&
    !consent.consentRevoked &&
    !isConsentExpired(consent.expirationDate);
  const pendingRequest = !!consent && !consent.consentGiven && !consent.consentRevoked;
  const optedOut = preferenceOptIn === false || (!!consent && consent.consentRevoked);
  const hasConsent = activeConsent || (!consent && preferenceOptIn === true);

  return {
    hasConsent,
    pendingRequest,
    optedOut,
    consent,
    daysUntilExpiration: activeConsent ? calculateDaysUntilExpiration(consent?.expirationDate) : null,
    requestedAt: pendingRequest ? consent?.createdAt || consent?.updatedAt || null : null,
    preferenceOptIn,
  };
}

export async function createPendingSMSConsentRequest(
  tenantId: string,
  patientId: string,
  client: QueryableClient,
  options?: {
    obtainedByUserId?: string | null;
    obtainedByName?: string | null;
    notes?: string | null;
  }
): Promise<string> {
  const existingPending = await client.query(
    `SELECT id
     FROM sms_consent
     WHERE tenant_id = $1
       AND patient_id = $2
       AND consent_given = false
       AND consent_revoked = false
     ORDER BY created_at DESC
     LIMIT 1`,
    [tenantId, patientId]
  );

  if (existingPending.rows[0]?.id) {
    return existingPending.rows[0].id;
  }

  const consentId = crypto.randomUUID();
  await client.query(
    `INSERT INTO sms_consent
     (id, tenant_id, patient_id, consent_given, consent_method, obtained_by_user_id, obtained_by_name, notes)
     VALUES ($1, $2, $3, false, 'electronic', $4, $5, $6)`,
    [
      consentId,
      tenantId,
      patientId,
      options?.obtainedByUserId || null,
      options?.obtainedByName || null,
      options?.notes || 'SMS opt-in request sent',
    ]
  );

  return consentId;
}

async function markPatientSMSOptedIn(
  tenantId: string,
  patientId: string,
  consentMethod: string,
  client: QueryableClient
): Promise<void> {
  await client.query(
    `INSERT INTO patient_sms_preferences
     (tenant_id, patient_id, opted_in, consent_date, consent_method, opted_out_at, opted_out_via)
     VALUES ($1, $2, true, CURRENT_TIMESTAMP, $3, NULL, NULL)
     ON CONFLICT (tenant_id, patient_id)
     DO UPDATE SET
       opted_in = true,
       consent_date = CURRENT_TIMESTAMP,
       consent_method = $3,
       opted_out_at = NULL,
       opted_out_via = NULL,
       updated_at = CURRENT_TIMESTAMP`,
    [tenantId, patientId, consentMethod]
  );
}

async function markPatientSMSOptedOut(
  tenantId: string,
  patientId: string,
  optedOutVia: string,
  client: QueryableClient
): Promise<void> {
  await client.query(
    `INSERT INTO patient_sms_preferences
     (tenant_id, patient_id, opted_in, opted_out_at, opted_out_via)
     VALUES ($1, $2, false, CURRENT_TIMESTAMP, $3)
     ON CONFLICT (tenant_id, patient_id)
     DO UPDATE SET
       opted_in = false,
       opted_out_at = CURRENT_TIMESTAMP,
       opted_out_via = $3,
       updated_at = CURRENT_TIMESTAMP`,
    [tenantId, patientId, optedOutVia]
  );
}

export async function recordSMSConsent(
  tenantId: string,
  patientId: string,
  input: RecordSMSConsentInput,
  client: QueryableClient
): Promise<string> {
  const pendingResult = await client.query(
    `SELECT id
     FROM sms_consent
     WHERE tenant_id = $1
       AND patient_id = $2
       AND consent_given = false
       AND consent_revoked = false
     ORDER BY created_at DESC
     LIMIT 1`,
    [tenantId, patientId]
  );

  let consentId: string;

  if (pendingResult.rows[0]?.id) {
    consentId = pendingResult.rows[0].id;
    await client.query(
      `UPDATE sms_consent
       SET consent_given = true,
           consent_date = CURRENT_TIMESTAMP,
           consent_method = $1,
           obtained_by_user_id = $2,
           obtained_by_name = $3,
           expiration_date = $4,
           consent_revoked = false,
           revoked_date = NULL,
           revoked_reason = NULL,
           notes = COALESCE($5, notes),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6`,
      [
        input.consentMethod,
        input.obtainedByUserId || null,
        input.obtainedByName,
        input.expirationDate || null,
        input.notes || null,
        consentId,
      ]
    );
  } else {
    consentId = crypto.randomUUID();
    await client.query(
      `INSERT INTO sms_consent
       (id, tenant_id, patient_id, consent_given, consent_date, consent_method,
        obtained_by_user_id, obtained_by_name, expiration_date, notes)
       VALUES ($1, $2, $3, true, CURRENT_TIMESTAMP, $4, $5, $6, $7, $8)`,
      [
        consentId,
        tenantId,
        patientId,
        input.consentMethod,
        input.obtainedByUserId || null,
        input.obtainedByName,
        input.expirationDate || null,
        input.notes || null,
      ]
    );
  }

  await markPatientSMSOptedIn(tenantId, patientId, input.consentMethod, client);

  return consentId;
}

export async function clearSMSOptOut(
  tenantId: string,
  phoneNumber: string,
  client: QueryableClient
): Promise<void> {
  await client.query(
    `UPDATE sms_opt_out
     SET opted_in_at = CURRENT_TIMESTAMP,
         reason = 'Opted back in',
         is_active = false
     WHERE tenant_id = $1 AND phone_number = $2`,
    [tenantId, phoneNumber]
  );
}

export async function upsertSMSOptOut(
  tenantId: string,
  phoneNumber: string,
  reason: string,
  client: QueryableClient
): Promise<void> {
  await client.query(
    `INSERT INTO sms_opt_out
     (id, tenant_id, phone_number, opted_out_at, opted_in_at, reason, is_active)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP, NULL, $4, true)
     ON CONFLICT (tenant_id, phone_number)
     DO UPDATE SET
       opted_out_at = CURRENT_TIMESTAMP,
       opted_in_at = NULL,
       reason = EXCLUDED.reason,
       is_active = true`,
    [crypto.randomUUID(), tenantId, phoneNumber, reason]
  );
}

export async function revokeSMSConsent(
  tenantId: string,
  patientId: string,
  input: RevokeSMSConsentInput,
  client: QueryableClient
): Promise<string> {
  const latestResult = await client.query(latestConsentSelect, [tenantId, patientId]);
  const latestConsent = latestResult.rows[0] as SMSConsentRecord | undefined;
  const revokeReason = input.reason || 'Patient opted out of SMS';

  let consentId: string;

  if (latestConsent?.id) {
    consentId = latestConsent.id;
    await client.query(
      `UPDATE sms_consent
       SET consent_revoked = true,
           revoked_date = CURRENT_TIMESTAMP,
           revoked_reason = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [revokeReason, consentId]
    );
  } else {
    consentId = crypto.randomUUID();
    await client.query(
      `INSERT INTO sms_consent
       (id, tenant_id, patient_id, consent_given, consent_revoked, revoked_date, revoked_reason, notes)
       VALUES ($1, $2, $3, false, true, CURRENT_TIMESTAMP, $4, $5)`,
      [consentId, tenantId, patientId, revokeReason, input.notes || null]
    );
  }

  await markPatientSMSOptedOut(tenantId, patientId, input.optedOutVia || 'staff', client);

  return consentId;
}
