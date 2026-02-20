import fs from "fs";
import path from "path";

type Violation = {
  fingerprint: string;
  relPath: string;
  line: number;
  snippet: string;
};

type BaselineFile = {
  generatedAt: string;
  pattern: string;
  fingerprints: string[];
};

const RAW_ERROR_LOG_PATTERN = /console\.error\([^\n]*\b(err|error)\b/;
const EXCLUDED_SEGMENTS = ["/__tests__/", "/tests/"];

const args = new Set(process.argv.slice(2));
const writeBaseline = args.has("--write-baseline");

const backendRoot = path.resolve(__dirname, "../..");
const baselinePath = path.join(backendRoot, "compliance", "safe-error-logging-baseline.json");
const scanRoots = [
  path.join(backendRoot, "src", "routes"),
  path.join(backendRoot, "src", "services"),
];

function normalizeRelPath(absolutePath: string): string {
  return path.relative(backendRoot, absolutePath).split(path.sep).join("/");
}

function isScannableFile(absolutePath: string): boolean {
  if (!absolutePath.endsWith(".ts")) {
    return false;
  }

  const normalizedPath = absolutePath.split(path.sep).join("/");
  return !EXCLUDED_SEGMENTS.some((segment) => normalizedPath.includes(segment));
}

function walkFiles(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...walkFiles(absolutePath));
      continue;
    }

    if (entry.isFile() && isScannableFile(absolutePath)) {
      files.push(absolutePath);
    }
  }

  return files;
}

function collectViolations(): Violation[] {
  const violations: Violation[] = [];
  const files = scanRoots.flatMap((root) => walkFiles(root));
  const occurrenceMap = new Map<string, number>();

  for (const filePath of files) {
    const relPath = normalizeRelPath(filePath);
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split(/\r?\n/);

    lines.forEach((line, idx) => {
      if (!RAW_ERROR_LOG_PATTERN.test(line)) {
        return;
      }

      const snippet = line.trim().replace(/\s+/g, " ");
      const occurrenceKey = `${relPath}|${snippet}`;
      const occurrence = (occurrenceMap.get(occurrenceKey) ?? 0) + 1;
      occurrenceMap.set(occurrenceKey, occurrence);

      violations.push({
        fingerprint: `${occurrenceKey}|#${occurrence}`,
        relPath,
        line: idx + 1,
        snippet,
      });
    });
  }

  violations.sort((a, b) => {
    if (a.relPath === b.relPath) {
      return a.line - b.line;
    }
    return a.relPath.localeCompare(b.relPath);
  });

  return violations;
}

function writeBaselineFile(violations: Violation[]): void {
  const payload: BaselineFile = {
    generatedAt: new Date().toISOString(),
    pattern: RAW_ERROR_LOG_PATTERN.source,
    fingerprints: Array.from(new Set(violations.map((item) => item.fingerprint))).sort(),
  };

  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  fs.writeFileSync(baselinePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log(
    `safeErrorLoggingGuard: baseline written to ${normalizeRelPath(baselinePath)} (${payload.fingerprints.length} entries)`,
  );
}

function readBaselineFile(): BaselineFile {
  if (!fs.existsSync(baselinePath)) {
    throw new Error(
      `Baseline missing at ${normalizeRelPath(
        baselinePath,
      )}. Run: npm run logging:guard:baseline --prefix backend`,
    );
  }

  const raw = fs.readFileSync(baselinePath, "utf8");
  const parsed = JSON.parse(raw) as Partial<BaselineFile>;

  if (!Array.isArray(parsed.fingerprints)) {
    throw new Error(`Invalid baseline format at ${normalizeRelPath(baselinePath)} (missing fingerprints array).`);
  }

  return {
    generatedAt: typeof parsed.generatedAt === "string" ? parsed.generatedAt : "",
    pattern: typeof parsed.pattern === "string" ? parsed.pattern : "",
    fingerprints: parsed.fingerprints.filter((entry): entry is string => typeof entry === "string"),
  };
}

function main(): void {
  const violations = collectViolations();

  if (writeBaseline) {
    writeBaselineFile(violations);
    return;
  }

  const baseline = readBaselineFile();
  const baselineSet = new Set(baseline.fingerprints);
  const newlyIntroduced = violations.filter((item) => !baselineSet.has(item.fingerprint));

  if (newlyIntroduced.length === 0) {
    console.log(
      `safeErrorLoggingGuard: no new raw console.error(error/err) patterns (current matches: ${violations.length}).`,
    );
    return;
  }

  console.error("safeErrorLoggingGuard: new raw console.error(error/err) patterns detected:");
  newlyIntroduced.forEach((item) => {
    console.error(`- ${item.relPath}:${item.line} ${item.snippet}`);
  });
  console.error(
    "Migrate to structured safe logging. If intentionally accepting new raw patterns, refresh baseline with logging:guard:baseline.",
  );

  process.exitCode = 1;
}

main();
