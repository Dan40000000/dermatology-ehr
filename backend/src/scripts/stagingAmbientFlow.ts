import crypto from "crypto";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import axios, { AxiosError, AxiosInstance } from "axios";
import FormData from "form-data";
import dotenv from "dotenv";

dotenv.config();

type AmbientTranscript = {
  id: string;
  transcriptionStatus: string;
  speakerCount?: number;
  wordCount?: number;
  phiMasked?: boolean;
};

type AmbientNote = {
  id: string;
  generationStatus: string;
  reviewStatus?: string;
  overallConfidence?: number;
  chiefComplaint?: string;
  assessment?: string;
  plan?: string;
  noteContent?: {
    formalAppointmentSummary?: {
      symptoms?: string[];
      probableDiagnoses?: Array<{
        condition?: string;
        probabilityPercent?: number;
        reasoning?: string;
        icd10Code?: string;
      }>;
      suggestedTests?: Array<{
        testName?: string;
        urgency?: string;
        rationale?: string;
        cptCode?: string;
      }>;
    };
    patientSummary?: {
      whatWeDiscussed?: string;
      yourConcerns?: string[];
      diagnosis?: string;
      treatmentPlan?: string;
      followUp?: string;
    };
  };
};

export type RubricCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
};

export type FlowOptions = {
  baseUrl: string;
  tenantId: string;
  tenantHeader: string;
  email: string;
  password: string;
  patientId?: string;
  providerId?: string;
  encounterId?: string;
  audioPath: string;
  durationSeconds: number;
  timeoutMs: number;
  pollIntervalMs: number;
  skipApply: boolean;
  outputPath?: string;
  dryRun: boolean;
};

type FlowContext = {
  providerId: string;
  patientId: string;
  encounterId: string;
  recordingId: string;
  transcriptId: string;
  noteId: string;
};

export type FlowEvidence = {
  runId: string;
  generatedAt: string;
  environment: {
    baseUrl: string;
    tenantHeader: string;
    tenantIdMasked: string;
  };
  actor: {
    role?: string;
    userIdMasked?: string;
  };
  entities: {
    providerIdMasked: string;
    patientIdMasked: string;
    encounterIdMasked: string;
  };
  flow: {
    recordingIdMasked: string;
    transcriptIdMasked: string;
    noteIdMasked: string;
    transcriptStatus: string;
    noteGenerationStatus: string;
    noteReviewStatusAfterApproval?: string;
    noteAppliedToEncounter: boolean;
    patientSummaryGenerated: boolean;
    patientSummaryIdMasked?: string;
  };
  quality: {
    rubricPassed: boolean;
    checks: RubricCheck[];
    score: {
      passed: number;
      total: number;
    };
    noteSignals: {
      hasChiefComplaint: boolean;
      hasAssessment: boolean;
      hasPlan: boolean;
      overallConfidence?: number;
      symptomCount: number;
      probableDiagnosisCount: number;
      suggestedTestCount: number;
    };
  };
  timingsMs: {
    total: number;
    transcriptionWait: number;
    noteGenerationWait: number;
  };
};

const args = process.argv.slice(2);

function argValue(flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index < 0) {
    return undefined;
  }

  return args[index + 1];
}

function hasFlag(flag: string): boolean {
  return args.includes(flag);
}

function parseIntWithDefault(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

export function maskIdentifier(value: string | undefined | null): string {
  if (!value) {
    return "n/a";
  }

  if (value.length <= 8) {
    return `${value.slice(0, 2)}***${value.slice(-2)}`;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowIsoFileSafe(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function printUsage(): void {
  console.log(`\nAmbient Staging Flow Runner\n
Runs a non-mock ambient appointment flow against an API target:\n  login -> start recording -> upload -> transcribe -> generate note -> review -> apply -> summary\n
Required inputs (env or CLI):\n  AMBIENT_FLOW_BASE_URL / --base-url\n  AMBIENT_FLOW_TENANT_ID / --tenant-id\n  AMBIENT_FLOW_EMAIL / --email\n  AMBIENT_FLOW_PASSWORD / --password\n
Optional inputs:\n  AMBIENT_FLOW_TENANT_HEADER / --tenant-header     (default: x-tenant-id)\n  AMBIENT_FLOW_PROVIDER_ID / --provider-id\n  AMBIENT_FLOW_PATIENT_ID / --patient-id\n  AMBIENT_FLOW_ENCOUNTER_ID / --encounter-id\n  AMBIENT_FLOW_AUDIO_PATH / --audio-path           (default: backend test fixture wav)\n  AMBIENT_FLOW_DURATION_SECONDS / --duration-seconds (default: 90)\n  AMBIENT_FLOW_TIMEOUT_MS / --timeout-ms           (default: 180000)\n  AMBIENT_FLOW_POLL_INTERVAL_MS / --poll-interval-ms (default: 2000)\n  AMBIENT_FLOW_SKIP_APPLY / --skip-apply           (default: false)\n  AMBIENT_FLOW_OUTPUT_PATH / --output-path\n  --dry-run\n  --help\n\nExample:\n  npm run ambient:staging:flow --prefix backend -- \\\n    --base-url https://staging.example.com \\\n    --tenant-id tenant-123 \\\n    --email provider@example.com \\\n    --password '***'\n`);
}

function buildOptions(): FlowOptions {
  const backendRoot = path.resolve(__dirname, "../..");
  const defaultAudio = path.resolve(backendRoot, "src/routes/__tests__/fixtures/test-audio.wav");

  return {
    baseUrl: (argValue("--base-url") || process.env.AMBIENT_FLOW_BASE_URL || "").trim(),
    tenantId: (argValue("--tenant-id") || process.env.AMBIENT_FLOW_TENANT_ID || "").trim(),
    tenantHeader: (argValue("--tenant-header") || process.env.AMBIENT_FLOW_TENANT_HEADER || process.env.TENANT_HEADER || "x-tenant-id").trim(),
    email: (argValue("--email") || process.env.AMBIENT_FLOW_EMAIL || "").trim(),
    password: (argValue("--password") || process.env.AMBIENT_FLOW_PASSWORD || "").trim(),
    patientId: (argValue("--patient-id") || process.env.AMBIENT_FLOW_PATIENT_ID || "").trim() || undefined,
    providerId: (argValue("--provider-id") || process.env.AMBIENT_FLOW_PROVIDER_ID || "").trim() || undefined,
    encounterId: (argValue("--encounter-id") || process.env.AMBIENT_FLOW_ENCOUNTER_ID || "").trim() || undefined,
    audioPath: path.resolve(argValue("--audio-path") || process.env.AMBIENT_FLOW_AUDIO_PATH || defaultAudio),
    durationSeconds: parseIntWithDefault(argValue("--duration-seconds") || process.env.AMBIENT_FLOW_DURATION_SECONDS, 90),
    timeoutMs: parseIntWithDefault(argValue("--timeout-ms") || process.env.AMBIENT_FLOW_TIMEOUT_MS, 180000),
    pollIntervalMs: parseIntWithDefault(argValue("--poll-interval-ms") || process.env.AMBIENT_FLOW_POLL_INTERVAL_MS, 2000),
    skipApply: hasFlag("--skip-apply") || parseBool(process.env.AMBIENT_FLOW_SKIP_APPLY, false),
    outputPath: (argValue("--output-path") || process.env.AMBIENT_FLOW_OUTPUT_PATH || "").trim() || undefined,
    dryRun: hasFlag("--dry-run") || parseBool(process.env.AMBIENT_FLOW_DRY_RUN, false),
  };
}

export function validateOptions(options: FlowOptions): void {
  const missing: string[] = [];

  if (!options.baseUrl) missing.push("baseUrl");
  if (!options.tenantId) missing.push("tenantId");
  if (!options.email) missing.push("email");
  if (!options.password) missing.push("password");

  if (missing.length > 0) {
    throw new Error(`Missing required options: ${missing.join(", ")}`);
  }

  if (!options.baseUrl.startsWith("http://") && !options.baseUrl.startsWith("https://")) {
    throw new Error("baseUrl must start with http:// or https://");
  }
}

function axiosErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const status = error.response?.status;
    const data = error.response?.data as Record<string, unknown> | undefined;
    const apiError = typeof data?.error === "string" ? data.error : undefined;
    const payload = apiError || error.message;
    return status ? `${status}: ${payload}` : payload;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function authHeaders(options: FlowOptions, accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    [options.tenantHeader]: options.tenantId,
  };
}

async function login(client: AxiosInstance, options: FlowOptions): Promise<{ accessToken: string; role?: string; userId?: string }> {
  const response = await client.post(
    "/api/auth/login",
    {
      email: options.email,
      password: options.password,
    },
    {
      headers: {
        [options.tenantHeader]: options.tenantId,
      },
    },
  );

  const body = response.data as Record<string, any>;
  const accessToken = body?.tokens?.accessToken as string | undefined;

  if (!accessToken) {
    throw new Error("Login did not return an access token");
  }

  return {
    accessToken,
    role: body?.user?.role as string | undefined,
    userId: body?.user?.id as string | undefined,
  };
}

async function resolveProviderId(
  client: AxiosInstance,
  options: FlowOptions,
  headers: Record<string, string>,
): Promise<string> {
  if (options.providerId) {
    return options.providerId;
  }

  const providersResponse = await client.get("/api/providers", { headers });
  const providers = (providersResponse.data?.providers || []) as Array<{ id?: string }>;
  const providerId = providers.find((provider) => provider.id)?.id;

  if (!providerId) {
    throw new Error("No providerId supplied and no providers available via /api/providers");
  }

  return providerId;
}

async function resolvePatientId(
  client: AxiosInstance,
  options: FlowOptions,
  headers: Record<string, string>,
): Promise<string> {
  if (options.patientId) {
    return options.patientId;
  }

  const patientsResponse = await client.get("/api/patients?limit=20&page=1", { headers });
  const patients = (patientsResponse.data?.data || []) as Array<{ id?: string }>;
  const patientId = patients.find((patient) => patient.id)?.id;

  if (!patientId) {
    throw new Error("No patientId supplied and no patients available via /api/patients");
  }

  return patientId;
}

async function resolveEncounterId(
  client: AxiosInstance,
  options: FlowOptions,
  headers: Record<string, string>,
  patientId: string,
  providerId: string,
): Promise<string> {
  if (options.encounterId) {
    return options.encounterId;
  }

  const encountersResponse = await client.get("/api/encounters", { headers });
  const encounters = (encountersResponse.data?.encounters || []) as Array<{
    id?: string;
    patientId?: string;
    providerId?: string;
    status?: string;
  }>;

  const reusableEncounter = encounters.find((encounter) =>
    encounter.id &&
    encounter.patientId === patientId &&
    encounter.providerId === providerId &&
    !["signed", "completed", "closed", "locked", "finalized"].includes(String(encounter.status || "").toLowerCase()),
  );

  if (reusableEncounter?.id) {
    return reusableEncounter.id;
  }

  const createResponse = await client.post(
    "/api/encounters",
    {
      patientId,
      providerId,
      chiefComplaint: "Staging ambient flow validation appointment",
      hpi: "Scripted non-mock staging validation flow",
      ros: "See generated ambient transcript",
      exam: "Deferred",
      assessmentPlan: "Pending ambient AI note",
    },
    { headers },
  );

  const encounterId = createResponse.data?.id as string | undefined;
  if (!encounterId) {
    throw new Error("Failed to create encounter for ambient flow");
  }

  return encounterId;
}

async function startRecording(
  client: AxiosInstance,
  headers: Record<string, string>,
  patientId: string,
  providerId: string,
  encounterId: string,
): Promise<string> {
  const response = await client.post(
    "/api/ambient/recordings/start",
    {
      encounterId,
      patientId,
      providerId,
      consentObtained: true,
      consentMethod: "verbal",
    },
    { headers },
  );

  const recordingId = response.data?.recordingId as string | undefined;
  if (!recordingId) {
    throw new Error("Ambient recording start did not return a recordingId");
  }

  return recordingId;
}

async function uploadAudio(
  client: AxiosInstance,
  headers: Record<string, string>,
  recordingId: string,
  audioPath: string,
  durationSeconds: number,
): Promise<void> {
  const form = new FormData();
  form.append("audio", fs.createReadStream(audioPath));
  form.append("durationSeconds", String(durationSeconds));

  await client.post(`/api/ambient/recordings/${recordingId}/upload`, form, {
    headers: {
      ...headers,
      ...form.getHeaders(),
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });
}

async function pollForTranscript(
  client: AxiosInstance,
  headers: Record<string, string>,
  recordingId: string,
  timeoutMs: number,
  pollIntervalMs: number,
): Promise<{ transcript: AmbientTranscript; elapsedMs: number }> {
  const started = Date.now();

  while (Date.now() - started <= timeoutMs) {
    try {
      const response = await client.get(`/api/ambient/recordings/${recordingId}/transcript`, { headers });
      const transcript = response.data?.transcript as AmbientTranscript | undefined;

      if (!transcript?.id) {
        await sleep(pollIntervalMs);
        continue;
      }

      if (transcript.transcriptionStatus === "failed") {
        throw new Error("Transcript processing failed");
      }

      if (transcript.transcriptionStatus === "completed") {
        return {
          transcript,
          elapsedMs: Date.now() - started,
        };
      }
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 404) {
        await sleep(pollIntervalMs);
        continue;
      }

      throw error;
    }

    await sleep(pollIntervalMs);
  }

  throw new Error(`Timed out waiting for transcript after ${timeoutMs}ms`);
}

async function generateNote(
  client: AxiosInstance,
  headers: Record<string, string>,
  transcriptId: string,
): Promise<string> {
  const response = await client.post(`/api/ambient/transcripts/${transcriptId}/generate-note`, {}, { headers });
  const noteId = response.data?.noteId as string | undefined;

  if (!noteId) {
    throw new Error("Generate-note endpoint did not return noteId");
  }

  return noteId;
}

async function pollForNote(
  client: AxiosInstance,
  headers: Record<string, string>,
  noteId: string,
  timeoutMs: number,
  pollIntervalMs: number,
): Promise<{ note: AmbientNote; elapsedMs: number }> {
  const started = Date.now();

  while (Date.now() - started <= timeoutMs) {
    const response = await client.get(`/api/ambient/notes/${noteId}`, { headers });
    const note = response.data?.note as AmbientNote | undefined;

    if (!note?.id) {
      await sleep(pollIntervalMs);
      continue;
    }

    if (note.generationStatus === "failed") {
      throw new Error("Note generation failed");
    }

    if (note.generationStatus === "completed") {
      return {
        note,
        elapsedMs: Date.now() - started,
      };
    }

    await sleep(pollIntervalMs);
  }

  throw new Error(`Timed out waiting for note generation after ${timeoutMs}ms`);
}

async function approveNote(
  client: AxiosInstance,
  headers: Record<string, string>,
  noteId: string,
): Promise<void> {
  await client.post(
    `/api/ambient/notes/${noteId}/review`,
    {
      action: "approve",
      reason: "Automated staging ambient validation",
    },
    { headers },
  );
}

async function applyNoteToEncounter(
  client: AxiosInstance,
  headers: Record<string, string>,
  noteId: string,
): Promise<void> {
  await client.post(`/api/ambient/notes/${noteId}/apply-to-encounter`, {}, { headers });
}

async function generatePatientSummary(
  client: AxiosInstance,
  headers: Record<string, string>,
  noteId: string,
): Promise<string | undefined> {
  const response = await client.post(`/api/ambient/notes/${noteId}/generate-patient-summary`, {}, { headers });
  return response.data?.summaryId as string | undefined;
}

export function evaluateRubric(note: AmbientNote): { rubricPassed: boolean; checks: RubricCheck[] } {
  const summary = note.noteContent?.formalAppointmentSummary;
  const probableDiagnoses = summary?.probableDiagnoses || [];
  const suggestedTests = summary?.suggestedTests || [];
  const symptoms = summary?.symptoms || [];
  const patientSummary = note.noteContent?.patientSummary;

  const checks: RubricCheck[] = [
    {
      id: "chief_complaint_present",
      label: "Chief complaint is present",
      passed: Boolean(note.chiefComplaint && note.chiefComplaint.trim().length > 0),
      detail: note.chiefComplaint ? `Length=${note.chiefComplaint.trim().length}` : "Missing chiefComplaint",
    },
    {
      id: "assessment_present",
      label: "Assessment is present",
      passed: Boolean(note.assessment && note.assessment.trim().length > 0),
      detail: note.assessment ? `Length=${note.assessment.trim().length}` : "Missing assessment",
    },
    {
      id: "plan_present",
      label: "Plan is present",
      passed: Boolean(note.plan && note.plan.trim().length > 0),
      detail: note.plan ? `Length=${note.plan.trim().length}` : "Missing plan",
    },
    {
      id: "summary_symptoms_present",
      label: "Formal summary contains symptoms",
      passed: symptoms.length > 0,
      detail: `symptoms=${symptoms.length}`,
    },
    {
      id: "summary_differential_present",
      label: "Formal summary contains probable diagnoses",
      passed: probableDiagnoses.length > 0,
      detail: `probableDiagnoses=${probableDiagnoses.length}`,
    },
    {
      id: "summary_differential_fields",
      label: "Probable diagnoses include condition + probability",
      passed: probableDiagnoses.length > 0 && probableDiagnoses.every((diagnosis) =>
        Boolean(diagnosis.condition && diagnosis.condition.trim().length > 0) &&
        typeof diagnosis.probabilityPercent === "number" &&
        diagnosis.probabilityPercent > 0 &&
        diagnosis.probabilityPercent <= 100,
      ),
      detail: probableDiagnoses.length > 0
        ? `validated=${probableDiagnoses.filter((diagnosis) =>
            Boolean(diagnosis.condition && diagnosis.condition.trim().length > 0) &&
            typeof diagnosis.probabilityPercent === "number" &&
            diagnosis.probabilityPercent > 0 &&
            diagnosis.probabilityPercent <= 100,
          ).length}/${probableDiagnoses.length}`
        : "No probable diagnoses",
    },
    {
      id: "summary_tests_present",
      label: "Formal summary contains suggested tests",
      passed: suggestedTests.length > 0,
      detail: `suggestedTests=${suggestedTests.length}`,
    },
    {
      id: "summary_tests_fields",
      label: "Suggested tests include name + rationale",
      passed: suggestedTests.length > 0 && suggestedTests.every((test) =>
        Boolean(test.testName && test.testName.trim().length > 0) &&
        Boolean(test.rationale && test.rationale.trim().length > 0),
      ),
      detail: suggestedTests.length > 0
        ? `validated=${suggestedTests.filter((test) =>
            Boolean(test.testName && test.testName.trim().length > 0) &&
            Boolean(test.rationale && test.rationale.trim().length > 0),
          ).length}/${suggestedTests.length}`
        : "No suggested tests",
    },
    {
      id: "patient_summary_present",
      label: "Patient-facing summary exists",
      passed: Boolean(patientSummary?.whatWeDiscussed && patientSummary.whatWeDiscussed.trim().length > 0),
      detail: patientSummary?.whatWeDiscussed
        ? `whatWeDiscussedLength=${patientSummary.whatWeDiscussed.trim().length}`
        : "Missing patient summary",
    },
  ];

  return {
    rubricPassed: checks.every((check) => check.passed),
    checks,
  };
}

async function writeEvidence(options: FlowOptions, evidence: FlowEvidence): Promise<string> {
  const repoRoot = path.resolve(__dirname, "../../..");
  const defaultDir = path.join(repoRoot, "compliance", "evidence", "ambient-flow-runs");
  const runFile = `ambient-flow-${nowIsoFileSafe()}-${evidence.runId.slice(0, 8)}.json`;
  const outputPath = options.outputPath
    ? path.resolve(options.outputPath)
    : path.join(defaultDir, runFile);

  await fsp.mkdir(path.dirname(outputPath), { recursive: true });
  await fsp.writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

  return outputPath;
}

export async function runFlow(options: FlowOptions): Promise<{ evidence: FlowEvidence; outputPath: string }> {
  const runId = crypto.randomUUID();
  const startedAt = Date.now();

  const client = axios.create({
    baseURL: options.baseUrl,
    timeout: options.timeoutMs,
  });

  const loginResult = await login(client, options);
  const headers = authHeaders(options, loginResult.accessToken);

  const providerId = await resolveProviderId(client, options, headers);
  const patientId = await resolvePatientId(client, options, headers);
  const encounterId = await resolveEncounterId(client, options, headers, patientId, providerId);

  const recordingId = await startRecording(client, headers, patientId, providerId, encounterId);
  await uploadAudio(client, headers, recordingId, options.audioPath, options.durationSeconds);

  const transcriptResult = await pollForTranscript(
    client,
    headers,
    recordingId,
    options.timeoutMs,
    options.pollIntervalMs,
  );

  const noteId = await generateNote(client, headers, transcriptResult.transcript.id);
  const noteResult = await pollForNote(
    client,
    headers,
    noteId,
    options.timeoutMs,
    options.pollIntervalMs,
  );

  const rubric = evaluateRubric(noteResult.note);

  await approveNote(client, headers, noteId);

  let noteAppliedToEncounter = false;
  if (!options.skipApply) {
    await applyNoteToEncounter(client, headers, noteId);
    noteAppliedToEncounter = true;
  }

  let summaryId: string | undefined;
  let patientSummaryGenerated = false;
  try {
    summaryId = await generatePatientSummary(client, headers, noteId);
    patientSummaryGenerated = true;
  } catch (error) {
    // Leave evidence trail without failing whole run if patient-summary endpoint is disabled in a target env.
    patientSummaryGenerated = false;
    console.warn(`Patient summary generation skipped: ${axiosErrorMessage(error)}`);
  }

  const checksPassed = rubric.checks.filter((check) => check.passed).length;
  const evidence: FlowEvidence = {
    runId,
    generatedAt: new Date().toISOString(),
    environment: {
      baseUrl: options.baseUrl,
      tenantHeader: options.tenantHeader,
      tenantIdMasked: maskIdentifier(options.tenantId),
    },
    actor: {
      role: loginResult.role,
      userIdMasked: maskIdentifier(loginResult.userId),
    },
    entities: {
      providerIdMasked: maskIdentifier(providerId),
      patientIdMasked: maskIdentifier(patientId),
      encounterIdMasked: maskIdentifier(encounterId),
    },
    flow: {
      recordingIdMasked: maskIdentifier(recordingId),
      transcriptIdMasked: maskIdentifier(transcriptResult.transcript.id),
      noteIdMasked: maskIdentifier(noteId),
      transcriptStatus: transcriptResult.transcript.transcriptionStatus,
      noteGenerationStatus: noteResult.note.generationStatus,
      noteReviewStatusAfterApproval: "approved",
      noteAppliedToEncounter,
      patientSummaryGenerated,
      patientSummaryIdMasked: maskIdentifier(summaryId),
    },
    quality: {
      rubricPassed: rubric.rubricPassed,
      checks: rubric.checks,
      score: {
        passed: checksPassed,
        total: rubric.checks.length,
      },
      noteSignals: {
        hasChiefComplaint: Boolean(noteResult.note.chiefComplaint),
        hasAssessment: Boolean(noteResult.note.assessment),
        hasPlan: Boolean(noteResult.note.plan),
        overallConfidence: noteResult.note.overallConfidence,
        symptomCount: noteResult.note.noteContent?.formalAppointmentSummary?.symptoms?.length || 0,
        probableDiagnosisCount: noteResult.note.noteContent?.formalAppointmentSummary?.probableDiagnoses?.length || 0,
        suggestedTestCount: noteResult.note.noteContent?.formalAppointmentSummary?.suggestedTests?.length || 0,
      },
    },
    timingsMs: {
      total: Date.now() - startedAt,
      transcriptionWait: transcriptResult.elapsedMs,
      noteGenerationWait: noteResult.elapsedMs,
    },
  };

  const outputPath = await writeEvidence(options, evidence);
  return { evidence, outputPath };
}

async function main(): Promise<void> {
  if (hasFlag("--help")) {
    printUsage();
    return;
  }

  const options = buildOptions();
  validateOptions(options);

  if (!fs.existsSync(options.audioPath)) {
    throw new Error(`Audio file not found: ${options.audioPath}`);
  }

  if (options.dryRun) {
    console.log("Ambient flow dry-run configuration");
    console.log(JSON.stringify({
      baseUrl: options.baseUrl,
      tenantHeader: options.tenantHeader,
      tenantIdMasked: maskIdentifier(options.tenantId),
      emailMasked: maskIdentifier(options.email),
      providerIdMasked: maskIdentifier(options.providerId),
      patientIdMasked: maskIdentifier(options.patientId),
      encounterIdMasked: maskIdentifier(options.encounterId),
      audioPath: options.audioPath,
      durationSeconds: options.durationSeconds,
      timeoutMs: options.timeoutMs,
      pollIntervalMs: options.pollIntervalMs,
      skipApply: options.skipApply,
      outputPath: options.outputPath || "(auto)",
    }, null, 2));
    return;
  }

  console.log("Starting ambient staging flow...");
  console.log(`Target: ${options.baseUrl}`);
  console.log(`Tenant: ${maskIdentifier(options.tenantId)}`);

  const { evidence, outputPath } = await runFlow(options);

  console.log("Ambient staging flow completed");
  console.log(`Rubric: ${evidence.quality.score.passed}/${evidence.quality.score.total} checks passed`);
  console.log(`Rubric overall pass: ${evidence.quality.rubricPassed}`);
  console.log(`Evidence file: ${outputPath}`);

  if (!evidence.quality.rubricPassed) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(`Ambient staging flow failed: ${axiosErrorMessage(error)}`);
    process.exitCode = 1;
  });
}
