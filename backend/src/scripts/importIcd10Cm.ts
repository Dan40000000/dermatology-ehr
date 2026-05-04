import "dotenv/config";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pool } from "../db/pool";

const DEFAULT_CMS_ICD10_ZIP_URL =
  "https://www.cms.gov/files/zip/april-1-2026-code-descriptions-tabular-order.zip";

interface Icd10CodeRow {
  id: string;
  code: string;
  description: string;
  category: string;
}

function formatIcd10Code(rawCode: string): string {
  const normalized = rawCode.trim().toUpperCase().replace(/\./g, "");
  if (normalized.length <= 3) return normalized;
  return `${normalized.slice(0, 3)}.${normalized.slice(3)}`;
}

function chapterCategory(code: string): string {
  const first = code[0]?.toUpperCase() || "";

  if (first === "A" || first === "B") return "Certain infectious and parasitic diseases";
  if (first === "C") return "Neoplasms";
  if (first === "D") return code.startsWith("D0") || code.startsWith("D1") || code.startsWith("D2") || code.startsWith("D3") || code.startsWith("D4")
    ? "Neoplasms"
    : "Diseases of the blood and immune mechanism";
  if (first === "E") return "Endocrine, nutritional and metabolic diseases";
  if (first === "F") return "Mental, behavioral and neurodevelopmental disorders";
  if (first === "G") return "Diseases of the nervous system";
  if (first === "H") return "Diseases of the eye, ear and mastoid process";
  if (first === "I") return "Diseases of the circulatory system";
  if (first === "J") return "Diseases of the respiratory system";
  if (first === "K") return "Diseases of the digestive system";
  if (first === "L") return "Diseases of the skin and subcutaneous tissue";
  if (first === "M") return "Diseases of the musculoskeletal system and connective tissue";
  if (first === "N") return "Diseases of the genitourinary system";
  if (first === "O") return "Pregnancy, childbirth and the puerperium";
  if (first === "P") return "Certain conditions originating in the perinatal period";
  if (first === "Q") return "Congenital malformations";
  if (first === "R") return "Symptoms, signs and abnormal findings";
  if (first === "S" || first === "T") return "Injury, poisoning and external causes";
  if (first === "V" || first === "W" || first === "X" || first === "Y") return "External causes of morbidity";
  if (first === "Z") return "Factors influencing health status and contact with health services";
  if (first === "U") return "Codes for special purposes";
  return "ICD-10-CM";
}

function parseCodeRows(fileText: string): Icd10CodeRow[] {
  return fileText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^([A-Z0-9]+)\s+(.+)$/.exec(line);
      if (!match) return null;
      const rawCode = match[1];
      const description = match[2]?.trim();
      if (!rawCode || !description) return null;
      const code = formatIcd10Code(rawCode);
      return {
        id: `icd10_${rawCode.toLowerCase()}`,
        code,
        description,
        category: chapterCategory(code),
      };
    })
    .filter((row): row is Icd10CodeRow => Boolean(row));
}

async function downloadZip(url: string, outputPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download CMS ICD-10-CM ZIP: ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(outputPath, buffer);
}

function readCodesFileFromZip(zipPath: string): string {
  const listing = execFileSync("unzip", ["-Z", "-1", zipPath], { encoding: "utf8" });
  const codeFile = listing
    .split(/\r?\n/)
    .find((name) => /icd10cm_codes_\d{4}\.txt$/i.test(name.trim()));

  if (!codeFile) {
    throw new Error("Could not find icd10cm_codes_YYYY.txt in CMS ZIP file");
  }

  return execFileSync("unzip", ["-p", zipPath, codeFile], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
}

async function importRows(rows: Icd10CodeRow[]): Promise<number> {
  const chunkSize = 500;
  let imported = 0;

  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const params: unknown[] = [];
    const values = chunk
      .map((row, index) => {
        const offset = index * 5;
        params.push(row.id, row.code, row.description, row.category, false);
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`;
      })
      .join(", ");

    await pool.query(
      `insert into icd10_codes(id, code, description, category, is_common)
       values ${values}
       on conflict (code) do update set
         description = excluded.description,
         category = coalesce(nullif(icd10_codes.category, ''), excluded.category),
         is_common = icd10_codes.is_common`,
      params,
    );

    imported += chunk.length;
    // eslint-disable-next-line no-console
    console.log(`Imported ${imported}/${rows.length} ICD-10-CM codes`);
  }

  return imported;
}

async function main() {
  const url = process.env.ICD10_CM_ZIP_URL || DEFAULT_CMS_ICD10_ZIP_URL;
  const tempDir = mkdtempSync(join(tmpdir(), "derm-icd10-"));
  const zipPath = join(tempDir, "icd10.zip");

  try {
    // eslint-disable-next-line no-console
    console.log(`Downloading ICD-10-CM code descriptions from ${url}`);
    await downloadZip(url, zipPath);
    const fileText = readCodesFileFromZip(zipPath);
    const rows = parseCodeRows(fileText);

    if (rows.length === 0) {
      throw new Error("No ICD-10-CM rows parsed from CMS code file");
    }

    const imported = await importRows(rows);
    // eslint-disable-next-line no-console
    console.log(`ICD-10-CM import complete: ${imported} codes loaded`);
  } finally {
    await pool.end();
    rmSync(tempDir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  });
}
