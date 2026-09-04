import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const API = (process.env.MIPS_UAT_API_URL || 'https://derm-api-pilot-live.up.railway.app').replace(/\/$/, '');
const FRONTEND = (process.env.MIPS_UAT_FRONTEND_URL || 'https://derm-frontend-pilot-live.up.railway.app').replace(/\/$/, '');
const TENANT = process.env.MIPS_UAT_TENANT_ID || 'tenant-demo';
const PERFORMANCE_YEAR = Number(process.env.MIPS_UAT_YEAR || 2026);
const PACKET = process.env.MIPS_PILOT_PACKET || join(REPO_ROOT, 'PILOT_PACKET.md');
const PATIENT_ID = process.env.MIPS_UAT_PATIENT_ID || '96d8dc52-97dc-48ec-a423-1b79065d0619';
const ENCOUNTER_ID = process.env.MIPS_UAT_ENCOUNTER_ID || 'a690a67c-a76e-4ec8-8d14-4adefdfb1193';
const RESET_SYNTHETIC_RECORDS = process.env.MIPS_UAT_RESET_SYNTHETIC === '1';

const results = [];

function assert(value, message) {
  if (!value) throw new Error(message);
}

function pass(step, detail) {
  results.push({ step, status: 'PASS', detail });
  console.log(`PASS ${step}: ${detail}`);
}

function requireSyntheticPilot() {
  assert(
    process.env.MIPS_UAT_CONFIRM_SYNTHETIC === '1',
    'Refusing live workflow writes without MIPS_UAT_CONFIRM_SYNTHETIC=1',
  );
  assert(TENANT === 'tenant-demo', `Refusing workflow writes outside tenant-demo (received ${TENANT})`);
  assert(PERFORMANCE_YEAR === 2026, `This qualification script is pinned to the 2026 catalog (received ${PERFORMANCE_YEAR})`);
}

function credentialsFromPilotPacket() {
  const rows = fs.readFileSync(PACKET, 'utf8').split('\n');
  const parsed = {};
  for (const line of rows) {
    const match = line.match(/^\|\s*([^|]+?)\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|$/);
    if (match) parsed[match[1].trim()] = { email: match[2], password: match[3] };
  }
  return parsed;
}

function credentials() {
  const configured = process.env.MIPS_UAT_CREDENTIALS_JSON;
  const credentialsFile = process.env.MIPS_UAT_CREDENTIALS_FILE;
  let parsed;
  if (configured) {
    parsed = JSON.parse(configured);
  } else if (credentialsFile) {
    parsed = JSON.parse(fs.readFileSync(credentialsFile, 'utf8'));
  } else {
    assert(
      process.env.MIPS_UAT_ALLOW_PILOT_PACKET === '1',
      'Provide MIPS_UAT_CREDENTIALS_JSON or MIPS_UAT_CREDENTIALS_FILE; the tracked pilot packet requires explicit MIPS_UAT_ALLOW_PILOT_PACKET=1',
    );
    parsed = credentialsFromPilotPacket();
  }
  return {
    admin: parsed.admin || parsed['Owner / Admin'],
    provider: parsed.provider || parsed.Physician,
    nurse: parsed.nurse || parsed['RN / Nurse'],
    manager: parsed.manager || parsed['Office Manager'],
    front_desk: parsed.front_desk || parsed['Front Desk'],
    ma: parsed.ma || parsed['Medical Assistant'],
    billing: parsed.billing || parsed.Billing,
  };
}

function splitSetCookie(value) {
  return value ? String(value).split(/,(?=\s*[A-Za-z0-9_.-]+=)/g) : [];
}

class Client {
  constructor(label) {
    this.label = label;
    this.cookies = new Map();
  }

  absorb(headers) {
    const values = typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : splitSetCookie(headers.get('set-cookie'));
    for (const value of values) {
      const first = value.split(';')[0];
      const equals = first.indexOf('=');
      if (equals > 0) this.cookies.set(first.slice(0, equals), first.slice(equals + 1));
    }
  }

  async request(path, { method = 'GET', body, tenant = TENANT } = {}) {
    const headers = {};
    if (tenant) headers['X-Tenant-ID'] = tenant;
    if (this.cookies.size) {
      headers.Cookie = [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; ');
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const response = await fetch(`${API}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    });
    this.absorb(response.headers);
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: response.status, body: json };
  }
}

async function login(label, credential) {
  assert(credential?.email && credential?.password, `Missing ${label} synthetic pilot credential`);
  const client = new Client(label);
  const response = await client.request('/api/auth/login', {
    method: 'POST',
    body: { email: credential.email, password: credential.password },
  });
  assert(response.status === 200, `${label} login returned ${response.status}`);
  return client;
}

async function resetSyntheticRecords(admin, phase) {
  if (!RESET_SYNTHETIC_RECORDS) return;
  const response = await admin.request(`/api/mips/readiness/uat/reset?year=${PERFORMANCE_YEAR}`, {
    method: 'POST',
    body: { confirmation: 'RESET_SYNTHETIC_MIPS_UAT' },
  });
  assert(response.status === 200, `${phase} synthetic UAT reset returned ${response.status}`);
  assert(response.body?.reset === true, `${phase} synthetic UAT reset was not confirmed`);
  console.log(
    `PASS ${phase} fixture reset: removed ${response.body.deleted?.assessments || 0} assessment(s) and ${response.body.deleted?.evidence || 0} evidence row(s)`,
  );
}

function evidenceArray(response) {
  assert(response.status === 200, `Evidence read returned ${response.status}`);
  assert(Array.isArray(response.body?.evidence), 'Evidence response did not contain an array');
  return response.body.evidence;
}

function newestCandidate(evidence, predicate, label, excludedIds = new Set()) {
  const matches = evidence
    .filter((item) => item.origin === 'automation' && !excludedIds.has(item.id) && predicate(item))
    .sort((left, right) => String(right.observedAt || '').localeCompare(String(left.observedAt || '')));
  assert(matches.length > 0, `Missing ${label} workflow candidate`);
  return matches[0];
}

async function main() {
  requireSyntheticPilot();

  const frontendHealth = await fetch(FRONTEND, { redirect: 'manual' });
  assert(frontendHealth.status === 200, `Frontend returned ${frontendHealth.status}`);
  const apiHealth = await fetch(`${API}/health/live`);
  assert(apiHealth.status === 200, `API health returned ${apiHealth.status}`);
  pass('deployment', 'frontend and API are healthy on the synthetic pilot');

  const roleCredentials = credentials();
  const clients = {};
  for (const [role, credential] of Object.entries(roleCredentials)) {
    clients[role] = await login(role, credential);
  }
  pass('authentication', 'all seven synthetic workforce roles authenticated');

  await resetSyntheticRecords(clients.admin, 'pre-run');
  try {
  const profileRead = await clients.admin.request(`/api/mips/readiness/profile?year=${PERFORMANCE_YEAR}`);
  assert(profileRead.status === 200, `Profile read returned ${profileRead.status}`);
  const profile = profileRead.body?.profile;
  assert(profile, 'Profile read did not return a profile');
  const profileWrite = await clients.admin.request(`/api/mips/readiness/profile?year=${PERFORMANCE_YEAR}`, {
    method: 'PUT',
    body: {
      performanceYear: PERFORMANCE_YEAR,
      selectedQualityMeasureIds: profile.selectedQualityMeasureIds,
      selectedCostMeasureIds: profile.selectedCostMeasureIds,
      selectedImprovementActivityIds: profile.selectedImprovementActivityIds,
      categoryConfiguration: profile.categoryConfiguration,
      eligibilityInputs: profile.eligibilityInputs,
    },
  });
  assert(profileWrite.status === 200, `No-change profile save returned ${profileWrite.status}`);
  assert(
    JSON.stringify(profileWrite.body?.profile?.selectedQualityMeasureIds) === JSON.stringify(profile.selectedQualityMeasureIds),
    'Profile save changed selected quality measures',
  );
  pass('1 practice profile', 'admin no-change save preserved the configured 2026 profile');

  const beforeCapture = evidenceArray(
    await clients.admin.request(`/api/mips/readiness/evidence?year=${PERFORMANCE_YEAR}`),
  );
  const pathology440 = newestCandidate(
    beforeCapture,
    (item) => item.sourceType === 'biopsy' && item.measureId === '440',
    'pathology measure 440',
  );
  const pathologyAad6 = newestCandidate(
    beforeCapture,
    (item) => item.sourceType === 'biopsy' && item.measureId === 'AAD6',
    'pathology measure AAD6',
  );
  const tb176 = newestCandidate(
    beforeCapture,
    (item) => item.sourceType === 'chronic_therapy_registry' && item.measureId === '176',
    'TB measure 176',
  );
  const priorAad6ForRejection = newestCandidate(
    beforeCapture,
    (item) => item.sourceType === 'biopsy' && item.measureId === 'AAD6',
    'second pathology measure AAD6',
    new Set([pathologyAad6.id]),
  );

  const runKey = randomUUID().replaceAll('-', '').slice(0, 12);
  const instrumentCode = `uat_itch_${PERFORMANCE_YEAR}_${runKey}`;
  const commonAssessment = {
    patientId: PATIENT_ID,
    encounterId: ENCOUNTER_ID,
    conditionCode: 'atopic_dermatitis',
    instrumentCode,
    instrumentVersion: 'uat-v1',
    scaleMin: 0,
    scaleMax: 10,
    sourceRevision: 1,
  };
  const baseline = await clients.nurse.request('/api/mips/readiness/itch-assessments', {
    method: 'POST',
    body: {
      ...commonAssessment,
      score: 8,
      assessmentDate: `${PERFORMANCE_YEAR}-09-01`,
      phase: 'baseline',
      clientEventId: `uat-${runKey}-itch-baseline`,
    },
  });
  assert(baseline.status === 201, `Baseline itch capture returned ${baseline.status}`);
  const followUp = await clients.nurse.request('/api/mips/readiness/itch-assessments', {
    method: 'POST',
    body: {
      ...commonAssessment,
      score: 3,
      assessmentDate: `${PERFORMANCE_YEAR}-09-03`,
      phase: 'follow_up',
      clientEventId: `uat-${runKey}-itch-followup`,
    },
  });
  assert(followUp.status === 201, `Follow-up itch capture returned ${followUp.status}`);
  const itchEvidenceId = followUp.body?.candidateCapture?.id;
  assert(itchEvidenceId, 'Follow-up capture did not return a candidate ID');

  const afterCapture = evidenceArray(
    await clients.admin.request(`/api/mips/readiness/evidence?year=${PERFORMANCE_YEAR}`),
  );
  const itch = afterCapture.find((item) => item.id === itchEvidenceId);
  assert(itch?.measureId === '486', 'Itch candidate did not map to measure 486');
  assert(itch?.sourceRevision === 2, `Itch aggregate revision was ${itch?.sourceRevision}, expected 2`);
  assert(itch?.metadata?.computedStatus === 'met', 'Itch candidate did not compute a met signal');
  assert(
    itch?.metadata?.baselineScore === 8 && itch?.metadata?.followUpScore === 3,
    'Itch candidate did not retain the synthetic score pair',
  );
  pass(
    '2 workflow candidates',
    'pathology, TB, and itch workflows produced expected automatic candidates; itch advanced from revision 1 to 2',
  );

  const dispositionIds = [pathology440.id, pathologyAad6.id, tb176.id, itchEvidenceId];
  let providerEvidence = evidenceArray(
    await clients.provider.request(`/api/mips/readiness/evidence?year=${PERFORMANCE_YEAR}`),
  );
  for (const id of dispositionIds) {
    const item = providerEvidence.find((candidate) => candidate.id === id);
    assert(item, `Provider could not load candidate ${id}`);
    const review = await clients.provider.request(
      `/api/mips/readiness/evidence/${id}/review?year=${PERFORMANCE_YEAR}`,
      { method: 'PATCH', body: { status: 'verified', sourceRevision: item.sourceRevision ?? null } },
    );
    assert(review.status === 200, `Provider verification returned ${review.status}`);
  }
  const prior = providerEvidence.find((candidate) => candidate.id === priorAad6ForRejection.id);
  assert(prior, 'Designated prior candidate for rejection was missing');
  const rejection = await clients.provider.request(
    `/api/mips/readiness/evidence/${prior.id}/review?year=${PERFORMANCE_YEAR}`,
    { method: 'PATCH', body: { status: 'rejected', sourceRevision: prior.sourceRevision ?? null } },
  );
  assert(rejection.status === 200, `Provider rejection returned ${rejection.status}`);
  providerEvidence = evidenceArray(
    await clients.provider.request(`/api/mips/readiness/evidence?year=${PERFORMANCE_YEAR}`),
  );
  assert(
    dispositionIds.every((id) => providerEvidence.find((item) => item.id === id)?.status === 'verified'),
    'One or more provider verifications were not retained',
  );
  assert(
    providerEvidence.find((item) => item.id === prior.id)?.status === 'rejected',
    'Provider rejection was not retained',
  );
  pass('3 provider disposition', 'provider verified four current candidates and rejected one distinct prior candidate');

  const syncOne = await clients.provider.request(
    `/api/mips/readiness/automation/sync?year=${PERFORMANCE_YEAR}`,
    { method: 'POST', body: {} },
  );
  const syncTwo = await clients.provider.request(
    `/api/mips/readiness/automation/sync?year=${PERFORMANCE_YEAR}`,
    { method: 'POST', body: {} },
  );
  assert(syncOne.status === 200 && syncTwo.status === 200, `Reconciliation returned ${syncOne.status}/${syncTwo.status}`);
  for (const sync of [syncOne.body, syncTwo.body]) {
    assert(
      sync.created === 0 && sync.updated === 0 && sync.stale === 0,
      `Reconciliation was not idempotent (${sync.created}/${sync.updated}/${sync.stale})`,
    );
  }
  const afterSync = evidenceArray(
    await clients.provider.request(`/api/mips/readiness/evidence?year=${PERFORMANCE_YEAR}`),
  );
  assert(
    dispositionIds.every((id) => afterSync.find((item) => item.id === id)?.status === 'verified'),
    'Reconciliation lost a verified disposition',
  );
  assert(afterSync.find((item) => item.id === prior.id)?.status === 'rejected', 'Reconciliation lost a rejected disposition');
  assert(new Set(afterSync.map((item) => item.id)).size === afterSync.length, 'Duplicate evidence IDs appeared after reconciliation');
  pass('4 reconciliation', 'two reconciliations were idempotent with no lost review decisions or duplicate evidence IDs');

  const expectedReporting = {
    admin: 200,
    provider: 200,
    manager: 200,
    ma: 403,
    nurse: 403,
    front_desk: 403,
    billing: 403,
  };
  for (const [role, expected] of Object.entries(expectedReporting)) {
    const response = await clients[role].request(`/api/mips/readiness?year=${PERFORMANCE_YEAR}`);
    assert(response.status === expected, `${role} reporting returned ${response.status}, expected ${expected}`);
  }
  const expectedCapture = {
    admin: 400,
    provider: 400,
    manager: 403,
    ma: 400,
    nurse: 400,
    front_desk: 403,
    billing: 403,
  };
  for (const [role, expected] of Object.entries(expectedCapture)) {
    const response = await clients[role].request('/api/mips/readiness/itch-assessments', {
      method: 'POST',
      body: {},
    });
    assert(response.status === expected, `${role} capture boundary returned ${response.status}, expected ${expected}`);
  }
  assert(
    (await clients.provider.request(`/api/mips/readiness?year=${PERFORMANCE_YEAR}`, { tenant: 'tenant-not-authorized' })).status === 403,
    'Wrong-tenant request was not denied',
  );
  assert(
    (await clients.provider.request(`/api/mips/readiness?year=${PERFORMANCE_YEAR}`, { tenant: null })).status === 403,
    'Missing-tenant request was not denied',
  );

  const settingsRead = await clients.admin.request('/api/access-settings');
  assert(settingsRead.status === 200, `Access settings read returned ${settingsRead.status}`);
  const originalSettings = settingsRead.body;
  try {
    const withoutProvider = {
      ...originalSettings.moduleAccess,
      quality: originalSettings.moduleAccess.quality.filter((role) => role !== 'provider'),
    };
    const removeProvider = await clients.admin.request('/api/access-settings', {
      method: 'PUT',
      body: { moduleAccess: withoutProvider, commandCenterAccess: originalSettings.commandCenterAccess },
    });
    assert(removeProvider.status === 200, 'Could not remove provider quality permission');
    assert(
      (await clients.provider.request(`/api/mips/readiness?year=${PERFORMANCE_YEAR}`)).status === 403,
      'Provider retained reporting after quality permission removal',
    );
    assert(
      (await clients.nurse.request('/api/mips/readiness/itch-assessments', { method: 'POST', body: {} })).status === 400,
      'Clinical capture was incorrectly coupled to reporting permission',
    );

    const withMa = {
      ...originalSettings.moduleAccess,
      quality: [...new Set([...originalSettings.moduleAccess.quality, 'ma'])],
    };
    const addMa = await clients.admin.request('/api/access-settings', {
      method: 'PUT',
      body: { moduleAccess: withMa, commandCenterAccess: originalSettings.commandCenterAccess },
    });
    assert(addMa.status === 200, 'Could not add MA quality permission');
    assert(
      (await clients.ma.request(`/api/mips/readiness?year=${PERFORMANCE_YEAR}`)).status === 403,
      'Tenant settings incorrectly granted MA reporting access',
    );
  } finally {
    const restore = await clients.admin.request('/api/access-settings', {
      method: 'PUT',
      body: {
        moduleAccess: originalSettings.moduleAccess,
        commandCenterAccess: originalSettings.commandCenterAccess,
      },
    });
    assert(restore.status === 200, `Access settings restore returned ${restore.status}`);
  }
  assert(
    (await clients.provider.request(`/api/mips/readiness?year=${PERFORMANCE_YEAR}`)).status === 200,
    'Provider reporting was not restored',
  );
  pass(
    '5 authorization',
    'role, tenant, configurable permission, and clinical-capture/reporting boundaries held; original settings restored',
  );

  const preview = await clients.admin.request(`/api/mips/readiness/preview?year=${PERFORMANCE_YEAR}`);
  assert(preview.status === 200, `Preview returned ${preview.status}`);
  assert(preview.body?.draft === true && preview.body?.nonSubmission === true, 'Preview did not declare draft/non-submission state');
  assert(preview.body?.submissionState === 'not_submitted', 'Preview changed submission state');
  assert(preview.body?.transportState === 'not_configured', 'Preview unexpectedly configured transport');
  pass('6 registry preview', 'draft stayed not_submitted/not_configured; no registry transmission endpoint was invoked');

  pass(
    '7 defect capture',
    RESET_SYNTHETIC_RECORDS
      ? 'results are suitable for the defect register; uniquely tagged synthetic assessment records are reset after the run'
      : 'results are suitable for the defect register; synthetic assessment records remain unless reset mode is enabled',
  );
  } finally {
    await resetSyntheticRecords(clients.admin, 'post-run');
  }
  console.log(JSON.stringify({ status: 'PASS', passed: results.length, results }, null, 2));
}

main().catch((error) => {
  console.error(`FAIL ${error.message}`);
  process.exitCode = 1;
});
