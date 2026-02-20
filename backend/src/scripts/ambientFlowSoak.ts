import crypto from "crypto";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import dotenv from "dotenv";
import { FlowEvidence, FlowOptions, maskIdentifier, runFlow, validateOptions } from "./stagingAmbientFlow";

dotenv.config();

type SoakOptions = {
  flow: Omit<FlowOptions, "outputPath" | "dryRun">;
  iterations: number;
  delayMs: number;
  continueOnFailure: boolean;
  enforceRubric: boolean;
  enforcePatientSummary: boolean;
  summaryOutputPath?: string;
  dryRun: boolean;
};

type SoakIteration = {
  iteration: number;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  success: boolean;
  error?: string;
  evidencePath?: string;
  rubricPassed?: boolean;
  patientSummaryGenerated?: boolean;
  score?: {
    passed: number;
    total: number;
  };
  timingsMs?: FlowEvidence["timingsMs"];
};

type SoakSummary = {
  runId: string;
  generatedAt: string;
  environment: {
    baseUrl: string;
    tenantHeader: string;
    tenantIdMasked: string;
    emailMasked: string;
    providerIdMasked: string;
    patientIdMasked: string;
    encounterIdMasked: string;
  };
  config: {
    iterations: number;
    delayMs: number;
    continueOnFailure: boolean;
    enforceRubric: boolean;
    enforcePatientSummary: boolean;
    durationSeconds: number;
    timeoutMs: number;
    pollIntervalMs: number;
    skipApply: boolean;
    audioPath: string;
  };
  totals: {
    attempted: number;
    succeeded: number;
    failed: number;
    rubricPassed: number;
    patientSummaryGenerated: number;
    averageTotalMs: number;
    averageTranscriptionMs: number;
    averageNoteGenerationMs: number;
    allChecksPassed: boolean;
  };
  iterations: SoakIteration[];
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

export function resolveExistingPath(inputPath: string, roots: string[]): string {
  if (path.isAbsolute(inputPath)) {
    return path.normalize(inputPath);
  }

  for (const root of roots) {
    const candidate = path.resolve(root, inputPath);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  const primaryRoot = roots[0] ?? process.cwd();
  return path.resolve(primaryRoot, inputPath);
}

function nowIsoFileSafe(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function printUsage(): void {
  console.log(`\nAmbient Staging Soak Runner\n
Runs N full ambient flows in sequence and writes aggregate reliability evidence.\n
Required inputs (env or CLI):\n  AMBIENT_SOAK_BASE_URL / --base-url\n  AMBIENT_SOAK_TENANT_ID / --tenant-id\n  AMBIENT_SOAK_EMAIL / --email\n  AMBIENT_SOAK_PASSWORD / --password\n
Optional inputs:\n  AMBIENT_SOAK_TENANT_HEADER / --tenant-header     (default: x-tenant-id)\n  AMBIENT_SOAK_PROVIDER_ID / --provider-id\n  AMBIENT_SOAK_PATIENT_ID / --patient-id\n  AMBIENT_SOAK_ENCOUNTER_ID / --encounter-id\n  AMBIENT_SOAK_AUDIO_PATH / --audio-path\n  AMBIENT_SOAK_DURATION_SECONDS / --duration-seconds (default: 90)\n  AMBIENT_SOAK_TIMEOUT_MS / --timeout-ms           (default: 180000)\n  AMBIENT_SOAK_POLL_INTERVAL_MS / --poll-interval-ms (default: 2000)\n  AMBIENT_SOAK_SKIP_APPLY / --skip-apply           (default: false)\n  AMBIENT_SOAK_ITERATIONS / --iterations           (default: 3)\n  AMBIENT_SOAK_DELAY_MS / --delay-ms               (default: 1000)\n  AMBIENT_SOAK_CONTINUE_ON_FAILURE / --continue-on-failure (default: false)\n  --allow-rubric-fail\n  --allow-missing-patient-summary\n  AMBIENT_SOAK_OUTPUT_PATH / --output-path\n  --dry-run\n  --help\n`);
}

function buildOptions(): SoakOptions {
  const backendRoot = path.resolve(__dirname, "../..");
  const repoRoot = path.resolve(__dirname, "../../..");
  const defaultAudio = path.resolve(backendRoot, "src/routes/__tests__/fixtures/test-audio.wav");
  const rawAudioPath = argValue("--audio-path") || process.env.AMBIENT_SOAK_AUDIO_PATH || process.env.AMBIENT_FLOW_AUDIO_PATH || defaultAudio;

  const flow = {
    baseUrl: (argValue("--base-url") || process.env.AMBIENT_SOAK_BASE_URL || process.env.AMBIENT_FLOW_BASE_URL || "").trim(),
    tenantId: (argValue("--tenant-id") || process.env.AMBIENT_SOAK_TENANT_ID || process.env.AMBIENT_FLOW_TENANT_ID || "").trim(),
    tenantHeader: (
      argValue("--tenant-header")
      || process.env.AMBIENT_SOAK_TENANT_HEADER
      || process.env.AMBIENT_FLOW_TENANT_HEADER
      || process.env.TENANT_HEADER
      || "x-tenant-id"
    ).trim(),
    email: (argValue("--email") || process.env.AMBIENT_SOAK_EMAIL || process.env.AMBIENT_FLOW_EMAIL || "").trim(),
    password: (argValue("--password") || process.env.AMBIENT_SOAK_PASSWORD || process.env.AMBIENT_FLOW_PASSWORD || "").trim(),
    patientId: (argValue("--patient-id") || process.env.AMBIENT_SOAK_PATIENT_ID || process.env.AMBIENT_FLOW_PATIENT_ID || "").trim() || undefined,
    providerId: (argValue("--provider-id") || process.env.AMBIENT_SOAK_PROVIDER_ID || process.env.AMBIENT_FLOW_PROVIDER_ID || "").trim() || undefined,
    encounterId: (argValue("--encounter-id") || process.env.AMBIENT_SOAK_ENCOUNTER_ID || process.env.AMBIENT_FLOW_ENCOUNTER_ID || "").trim() || undefined,
    audioPath: resolveExistingPath(rawAudioPath, [process.cwd(), repoRoot]),
    durationSeconds: parseIntWithDefault(argValue("--duration-seconds") || process.env.AMBIENT_SOAK_DURATION_SECONDS || process.env.AMBIENT_FLOW_DURATION_SECONDS, 90),
    timeoutMs: parseIntWithDefault(argValue("--timeout-ms") || process.env.AMBIENT_SOAK_TIMEOUT_MS || process.env.AMBIENT_FLOW_TIMEOUT_MS, 180000),
    pollIntervalMs: parseIntWithDefault(argValue("--poll-interval-ms") || process.env.AMBIENT_SOAK_POLL_INTERVAL_MS || process.env.AMBIENT_FLOW_POLL_INTERVAL_MS, 2000),
    skipApply: hasFlag("--skip-apply")
      || ["1", "true", "yes", "on"].includes(String(process.env.AMBIENT_SOAK_SKIP_APPLY || process.env.AMBIENT_FLOW_SKIP_APPLY || "").toLowerCase()),
  };

  return {
    flow,
    iterations: parseIntWithDefault(argValue("--iterations") || process.env.AMBIENT_SOAK_ITERATIONS, 3),
    delayMs: parseIntWithDefault(argValue("--delay-ms") || process.env.AMBIENT_SOAK_DELAY_MS, 1000),
    continueOnFailure: hasFlag("--continue-on-failure")
      || ["1", "true", "yes", "on"].includes(String(process.env.AMBIENT_SOAK_CONTINUE_ON_FAILURE || "").toLowerCase()),
    enforceRubric: !hasFlag("--allow-rubric-fail"),
    enforcePatientSummary: !hasFlag("--allow-missing-patient-summary"),
    summaryOutputPath: (argValue("--output-path") || process.env.AMBIENT_SOAK_OUTPUT_PATH || "").trim() || undefined,
    dryRun: hasFlag("--dry-run"),
  };
}

function validateSoakOptions(options: SoakOptions): void {
  validateOptions({
    ...options.flow,
    outputPath: undefined,
    dryRun: false,
  });

  if (!fs.existsSync(options.flow.audioPath)) {
    throw new Error(`Audio file not found: ${options.flow.audioPath}`);
  }
}

async function writeSummary(options: SoakOptions, summary: SoakSummary): Promise<string> {
  const repoRoot = path.resolve(__dirname, "../../..");
  const defaultDir = path.join(repoRoot, "compliance", "evidence", "ambient-flow-runs");
  const filename = `ambient-flow-soak-${nowIsoFileSafe()}-${summary.runId.slice(0, 8)}.json`;
  const outputPath = options.summaryOutputPath
    ? path.resolve(options.summaryOutputPath)
    : path.join(defaultDir, filename);

  await fsp.mkdir(path.dirname(outputPath), { recursive: true });
  await fsp.writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  return outputPath;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round(total / values.length);
}

export async function main(): Promise<void> {
  if (hasFlag("--help")) {
    printUsage();
    return;
  }

  const options = buildOptions();
  validateSoakOptions(options);

  if (options.dryRun) {
    console.log("Ambient flow soak dry-run configuration");
    console.log(JSON.stringify({
      baseUrl: options.flow.baseUrl,
      tenantHeader: options.flow.tenantHeader,
      tenantIdMasked: maskIdentifier(options.flow.tenantId),
      emailMasked: maskIdentifier(options.flow.email),
      providerIdMasked: maskIdentifier(options.flow.providerId),
      patientIdMasked: maskIdentifier(options.flow.patientId),
      encounterIdMasked: maskIdentifier(options.flow.encounterId),
      audioPath: options.flow.audioPath,
      durationSeconds: options.flow.durationSeconds,
      timeoutMs: options.flow.timeoutMs,
      pollIntervalMs: options.flow.pollIntervalMs,
      skipApply: options.flow.skipApply,
      iterations: options.iterations,
      delayMs: options.delayMs,
      continueOnFailure: options.continueOnFailure,
      enforceRubric: options.enforceRubric,
      enforcePatientSummary: options.enforcePatientSummary,
      outputPath: options.summaryOutputPath || "(auto)",
    }, null, 2));
    return;
  }

  const runId = crypto.randomUUID();
  const iterations: SoakIteration[] = [];

  console.log("Starting ambient soak run...");
  console.log(`Target: ${options.flow.baseUrl}`);
  console.log(`Tenant: ${maskIdentifier(options.flow.tenantId)}`);
  console.log(`Iterations: ${options.iterations}`);

  for (let i = 1; i <= options.iterations; i += 1) {
    const startedAt = new Date();
    const startedMs = Date.now();
    console.log(`Running iteration ${i}/${options.iterations}...`);

    try {
      const { evidence, outputPath } = await runFlow({
        ...options.flow,
        outputPath: undefined,
        dryRun: false,
      });

      const validationErrors: string[] = [];
      if (options.enforceRubric && !evidence.quality.rubricPassed) {
        validationErrors.push("Rubric failed");
      }
      if (options.enforcePatientSummary && !evidence.flow.patientSummaryGenerated) {
        validationErrors.push("Patient summary was not generated");
      }

      const success = validationErrors.length === 0;
      const iteration: SoakIteration = {
        iteration: i,
        startedAt: startedAt.toISOString(),
        endedAt: new Date().toISOString(),
        durationMs: Date.now() - startedMs,
        success,
        error: validationErrors.length > 0 ? validationErrors.join("; ") : undefined,
        evidencePath: outputPath,
        rubricPassed: evidence.quality.rubricPassed,
        patientSummaryGenerated: evidence.flow.patientSummaryGenerated,
        score: {
          passed: evidence.quality.score.passed,
          total: evidence.quality.score.total,
        },
        timingsMs: evidence.timingsMs,
      };

      iterations.push(iteration);
      console.log(
        `Iteration ${i} ${success ? "passed" : "failed"}: rubric=${evidence.quality.score.passed}/${evidence.quality.score.total}, patientSummary=${evidence.flow.patientSummaryGenerated}, evidence=${outputPath}`,
      );

      if (!success && !options.continueOnFailure) {
        console.log("Stopping early due to failed iteration and continueOnFailure=false");
        break;
      }
    } catch (error) {
      const message = errorMessage(error);
      iterations.push({
        iteration: i,
        startedAt: startedAt.toISOString(),
        endedAt: new Date().toISOString(),
        durationMs: Date.now() - startedMs,
        success: false,
        error: message,
      });
      console.error(`Iteration ${i} failed: ${message}`);

      if (!options.continueOnFailure) {
        console.log("Stopping early due to run failure and continueOnFailure=false");
        break;
      }
    }

    if (i < options.iterations && options.delayMs > 0) {
      await sleep(options.delayMs);
    }
  }

  const succeeded = iterations.filter((iteration) => iteration.success);
  const failed = iterations.filter((iteration) => !iteration.success);
  const rubricPassed = iterations.filter((iteration) => iteration.rubricPassed).length;
  const patientSummaryGenerated = iterations.filter((iteration) => iteration.patientSummaryGenerated).length;

  const averageTotalMs = average(succeeded.map((iteration) => iteration.timingsMs?.total || 0).filter((value) => value > 0));
  const averageTranscriptionMs = average(
    succeeded.map((iteration) => iteration.timingsMs?.transcriptionWait || 0).filter((value) => value > 0),
  );
  const averageNoteGenerationMs = average(
    succeeded.map((iteration) => iteration.timingsMs?.noteGenerationWait || 0).filter((value) => value > 0),
  );

  const summary: SoakSummary = {
    runId,
    generatedAt: new Date().toISOString(),
    environment: {
      baseUrl: options.flow.baseUrl,
      tenantHeader: options.flow.tenantHeader,
      tenantIdMasked: maskIdentifier(options.flow.tenantId),
      emailMasked: maskIdentifier(options.flow.email),
      providerIdMasked: maskIdentifier(options.flow.providerId),
      patientIdMasked: maskIdentifier(options.flow.patientId),
      encounterIdMasked: maskIdentifier(options.flow.encounterId),
    },
    config: {
      iterations: options.iterations,
      delayMs: options.delayMs,
      continueOnFailure: options.continueOnFailure,
      enforceRubric: options.enforceRubric,
      enforcePatientSummary: options.enforcePatientSummary,
      durationSeconds: options.flow.durationSeconds,
      timeoutMs: options.flow.timeoutMs,
      pollIntervalMs: options.flow.pollIntervalMs,
      skipApply: options.flow.skipApply,
      audioPath: options.flow.audioPath,
    },
    totals: {
      attempted: iterations.length,
      succeeded: succeeded.length,
      failed: failed.length,
      rubricPassed,
      patientSummaryGenerated,
      averageTotalMs,
      averageTranscriptionMs,
      averageNoteGenerationMs,
      allChecksPassed: failed.length === 0,
    },
    iterations,
  };

  const summaryPath = await writeSummary(options, summary);
  console.log("Ambient soak run completed");
  console.log(`Attempted: ${summary.totals.attempted}/${options.iterations}`);
  console.log(`Succeeded: ${summary.totals.succeeded}`);
  console.log(`Failed: ${summary.totals.failed}`);
  console.log(`Rubric passed runs: ${summary.totals.rubricPassed}`);
  console.log(`Patient summary generated runs: ${summary.totals.patientSummaryGenerated}`);
  console.log(`Average run total ms: ${summary.totals.averageTotalMs}`);
  console.log(`Summary file: ${summaryPath}`);

  if (!summary.totals.allChecksPassed) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(`Ambient soak failed: ${errorMessage(error)}`);
    process.exitCode = 1;
  });
}
