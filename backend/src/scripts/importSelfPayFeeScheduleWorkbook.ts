import crypto from "crypto";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { pool } from "../db/pool";

type SheetRows = Array<Array<string | number | null>>;

interface FeeSeedItem {
  code: string;
  description: string;
  category: string;
  feeCents: number;
  minPriceCents: number;
  maxPriceCents: number | null;
  units: string;
  notes: string;
}

interface ParsedPrice {
  feeCents: number;
  minPriceCents: number;
  maxPriceCents: number | null;
  units: string;
  raw: string;
}

const DEFAULT_WORKBOOK_PATH = "/Users/danperry/Desktop/New - Self Pay Fee Schedule W. Sizes and locations 072623.xlsx";
const MEDICAL_SCHEDULE_NAME = "Practice Medical Self-Pay Fee Schedule";
const COSMETIC_SCHEDULE_NAME = "Practice Cosmetic Self-Pay Fee Schedule";

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

function unzipText(workbookPath: string, entry: string): string {
  return execFileSync("unzip", ["-p", workbookPath, entry], { encoding: "utf8" });
}

function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  const itemRegex = /<si[\s\S]*?<\/si>/g;
  const textRegex = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
  const items = xml.match(itemRegex) || [];

  for (const item of items) {
    const parts: string[] = [];
    for (const match of item.matchAll(textRegex)) {
      parts.push(decodeXml(match[1] || ""));
    }
    strings.push(parts.join(""));
  }

  return strings;
}

function columnIndex(cellRef: string): number {
  const letters = (cellRef.match(/[A-Z]+/i)?.[0] || "").toUpperCase();
  let index = 0;
  for (const letter of letters) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }
  return Math.max(0, index - 1);
}

function parseSheet(xml: string, sharedStrings: string[]): SheetRows {
  const rows: SheetRows = [];
  const rowRegex = /<row[^>]*>([\s\S]*?)<\/row>/g;
  const cellRegex = /<c\s+([^>]*?)(?<!\/)>([\s\S]*?)<\/c>/g;

  for (const rowMatch of xml.matchAll(rowRegex)) {
    const rowCells: Array<string | number | null> = [];
    const rowXml = rowMatch[1] || "";
    for (const cellMatch of rowXml.matchAll(cellRegex)) {
      const attrs = cellMatch[1] || "";
      const cellXml = cellMatch[2] || "";
      const ref = attrs.match(/\br="([^"]+)"/)?.[1] || "";
      const type = attrs.match(/\bt="([^"]+)"/)?.[1] || "";
      const value = cellXml.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      const inlineValue = cellXml.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/)?.[1];

      let parsed: string | number | null = null;
      if (type === "s" && value !== undefined) {
        parsed = sharedStrings[Number(value)] ?? "";
      } else if (inlineValue !== undefined) {
        parsed = decodeXml(inlineValue);
      } else if (value !== undefined) {
        const numeric = Number(value);
        parsed = Number.isFinite(numeric) ? numeric : decodeXml(value);
      }

      rowCells[columnIndex(ref)] = parsed;
    }
    rows.push(rowCells);
  }

  return rows;
}

export function loadWorkbook(workbookPath: string): Record<string, SheetRows> {
  const workbookXml = unzipText(workbookPath, "xl/workbook.xml");
  const relsXml = unzipText(workbookPath, "xl/_rels/workbook.xml.rels");
  const sharedStrings = parseSharedStrings(unzipText(workbookPath, "xl/sharedStrings.xml"));
  const relTargets = new Map<string, string>();

  for (const match of relsXml.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    const id = match[1];
    const target = match[2];
    if (id && target) {
      relTargets.set(id, target.startsWith("xl/") ? target : `xl/${target}`);
    }
  }

  const sheets: Record<string, SheetRows> = {};
  for (const match of workbookXml.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*(?:r:id|id)="([^"]+)"/g)) {
    const name = decodeXml(match[1] || "");
    const relId = match[2] || "";
    const target = relTargets.get(relId);
    if (!name || !target) continue;
    sheets[name] = parseSheet(unzipText(workbookPath, target), sharedStrings);
  }

  return sheets;
}

function cents(value: number): number {
  return Math.round(value * 100);
}

function parsePrice(value: string | number | null | undefined): ParsedPrice | null {
  if (value === null || value === undefined || value === "") return null;
  const raw = String(value).trim();
  const normalized = raw.replace(/,/g, "");
  const dollarValues = Array.from(normalized.matchAll(/\$\s*(\d+(?:\.\d+)?)/g)).map((match) => Number(match[1]));
  const allValues = Array.from(normalized.matchAll(/\d+(?:\.\d+)?/g)).map((match) => Number(match[0]));
  if (allValues.length === 0) return null;

  let min = dollarValues[0] ?? allValues[0] ?? 0;
  let max = min;
  if (dollarValues.length >= 2 && dollarValues[0] !== undefined && dollarValues[1] !== undefined) {
    min = dollarValues[0];
    max = dollarValues[1];
  } else if (normalized.includes("-") && allValues.length >= 2 && allValues[0] !== undefined && allValues[1] !== undefined) {
    min = allValues[0];
    max = allValues[1];
  }

  const lower = normalized.toLowerCase();
  let units = "service";
  if (lower.includes("unit")) units = "unit";
  else if (lower.includes("syringe")) units = "syringe";
  else if (lower.includes("ml")) units = "mL";
  else if (lower.startsWith("add")) units = "add-on";

  return {
    feeCents: cents(min),
    minPriceCents: cents(min),
    maxPriceCents: max === min ? null : cents(max),
    units,
    raw,
  };
}

function slugCode(text: string, prefix: string): string {
  const base = text.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${prefix}-${base}`.slice(0, 20).replace(/-$/g, "");
}

function medicalCategory(rawCode: string, description: string): string {
  const code = rawCode.replace("*", "").trim().toUpperCase();
  const desc = description.toUpperCase();
  if (!code && desc.includes("OV")) return "Self-Pay Office Visits";
  if (desc.includes("MOHS")) return "Self-Pay Mohs Surgery";
  if (code.startsWith("113")) return "Self-Pay Shave Removals";
  if (code.startsWith("114")) return "Self-Pay Benign Excisions";
  if (code.startsWith("116")) return "Self-Pay Malignant Excisions";
  if (code.startsWith("120")) return "Self-Pay Intermediate Repairs";
  if (code.startsWith("131")) return "Self-Pay Complex Repairs";
  if (code.startsWith("140") || code.startsWith("143")) return "Self-Pay Flaps & Grafts";
  if (code.startsWith("170") || code.startsWith("171") || code.startsWith("172") || desc.includes("DEST")) return "Self-Pay Destruction";
  if (code.startsWith("111") || code === "69100" || code === "40490" || desc.includes("BX")) return "Self-Pay Biopsies";
  if (code.startsWith("969")) return "Self-Pay Phototherapy";
  if (
    ["11900", "11901", "96372", "64650", "64653", "64999", "J0585", "J3301", "J3490"].includes(code) ||
    desc.includes("INJ") ||
    desc.includes("BTX") ||
    desc.includes("BOTOX")
  ) {
    return "Self-Pay Injections & Medications";
  }
  if (code === "81025" || code === "88331" || desc.includes("TEST") || desc.includes("PATH")) return "Self-Pay Tests & Pathology";
  if (code.startsWith("112") || desc.includes("SKIN TAG")) return "Self-Pay Benign Lesions";
  if (code === "10060") return "Self-Pay Procedures";
  return "Self-Pay Medical Procedures";
}

function uniqueCode(base: string, used: Map<string, number>): string {
  const count = (used.get(base) || 0) + 1;
  used.set(base, count);
  if (count === 1) return base;
  const suffix = `-${count}`;
  return `${base.slice(0, 20 - suffix.length)}${suffix}`;
}

export function parseMedicalSheet(rows: SheetRows): FeeSeedItem[] {
  const items: FeeSeedItem[] = [];
  const usedCodes = new Map<string, number>();
  const starts = [0, 4, 8, 12];

  rows.slice(1).forEach((row) => {
    for (const start of starts) {
      const rawCode = String(row[start + 1] ?? "").trim();
      const description = String(row[start + 2] ?? "").trim();
      const price = parsePrice(row[start + 3]);
      if (!description || !price) continue;

      const cleanCode = rawCode.replace("*", "").trim().toUpperCase();
      let code = "";
      if (cleanCode === "11200" && description.includes("1-2")) {
        code = "SPM-11200-1-2";
      } else if (cleanCode === "11200" && description.includes("3-15")) {
        code = "SPM-11200-3-15";
      } else {
        code = cleanCode ? slugCode(cleanCode, "SPM") : slugCode(description, "SPM");
      }
      code = uniqueCode(code, usedCodes);

      const notes = [
        rawCode ? `Workbook source CPT/HCPCS: ${rawCode}.` : "No CPT/HCPCS provided in workbook; internal self-pay service code used.",
        `Workbook price: ${price.raw}.`,
        rawCode.startsWith("*") ? "Workbook marked this code with an asterisk." : null,
        price.maxPriceCents ? "Price range imported; adjust charge line if a different price in the range applies." : null,
      ].filter(Boolean).join(" ");

      items.push({
        code,
        description,
        category: medicalCategory(cleanCode, description),
        feeCents: price.feeCents,
        minPriceCents: price.minPriceCents,
        maxPriceCents: price.maxPriceCents,
        units: price.units,
        notes,
      });
    }
  });

  return items;
}

function cosmeticCategory(raw: string): string {
  const trimmed = raw.trim();
  const map: Record<string, string> = {
    Fillers: "Dermal Fillers",
    Peels: "Chemical Peels",
    Facials: "Facials",
    Other: "Other Cosmetic",
  };
  return map[trimmed] || trimmed || "Other Cosmetic";
}

export function parseCosmeticSheet(rows: SheetRows): FeeSeedItem[] {
  const items: FeeSeedItem[] = [];
  const usedCodes = new Map<string, number>();
  const currentCategory = new Map<number, string>([
    [0, "Neurotoxins"],
    [4, "Waxing Services"],
    [8, "Facials"],
  ]);

  rows.slice(3).forEach((row) => {
    for (const start of [0, 4, 8]) {
      const section = String(row[start] ?? "").trim();
      const rawDescription = String(row[start + 1] ?? "").trim();
      const price = parsePrice(row[start + 2]);

      if (section && !rawDescription && !price) {
        currentCategory.set(start, cosmeticCategory(section));
        continue;
      }
      if (!rawDescription || !price || rawDescription.toUpperCase().includes("REV")) continue;

      const description = rawDescription.replace(/\*$/g, "").trim();
      const code = uniqueCode(slugCode(description, "COS"), usedCodes);
      const notes = [
        `Workbook cosmetic price: ${price.raw}.`,
        rawDescription.endsWith("*") ? "Workbook marked this service with an asterisk." : null,
        price.maxPriceCents ? "Price range imported; adjust charge line if a different price in the range applies." : null,
      ].filter(Boolean).join(" ");

      items.push({
        code,
        description,
        category: currentCategory.get(start) || "Other Cosmetic",
        feeCents: price.feeCents,
        minPriceCents: price.minPriceCents,
        maxPriceCents: price.maxPriceCents,
        units: price.units,
        notes,
      });
    }
  });

  return items;
}

function categorySlug(category: string): string {
  return category.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

async function ensureSchedule(client: any, tenantId: string, name: string, description: string): Promise<string> {
  const existing = await client.query(
    `select id from fee_schedules where tenant_id = $1 and name = $2 limit 1`,
    [tenantId, name],
  );
  if (existing.rows[0]?.id) return existing.rows[0].id;

  const id = crypto.randomUUID();
  await client.query(
    `insert into fee_schedules(id, tenant_id, name, is_default, description)
     values ($1, $2, $3, false, $4)`,
    [id, tenantId, name, description],
  );
  return id;
}

async function upsertItems(client: any, scheduleId: string, items: FeeSeedItem[], isCosmetic: boolean): Promise<void> {
  const importedCodes = items.map((item) => item.code);
  await client.query(
    `delete from fee_schedule_items
     where fee_schedule_id = $1
       and notes ilike 'Imported from workbook:%'
       and not (cpt_code = any($2::text[]))`,
    [scheduleId, importedCodes],
  );

  for (const item of items) {
    const notes = `Imported from workbook: ${item.notes}`;
    await client.query(
      `insert into fee_schedule_items(
         id, fee_schedule_id, cpt_code, cpt_description, category, fee_cents,
         min_price_cents, max_price_cents, units, fee_amount,
         code_type, billing_route, is_cosmetic, requires_diagnosis, notes
       )
       values (gen_random_uuid(), $1, $2, $3, $4, $5::int, $6, $7, $8, round(($5::numeric / 100), 2),
               'INTERNAL', 'self_pay', $9, false, $10)
       on conflict (fee_schedule_id, cpt_code)
       do update set
         cpt_description = excluded.cpt_description,
         category = excluded.category,
         fee_cents = excluded.fee_cents,
         min_price_cents = excluded.min_price_cents,
         max_price_cents = excluded.max_price_cents,
         units = excluded.units,
         fee_amount = excluded.fee_amount,
         code_type = excluded.code_type,
         billing_route = excluded.billing_route,
         is_cosmetic = excluded.is_cosmetic,
         requires_diagnosis = excluded.requires_diagnosis,
         notes = excluded.notes,
         updated_at = current_timestamp`,
      [
        scheduleId,
        item.code,
        item.description,
        item.category,
        item.feeCents,
        item.minPriceCents,
        item.maxPriceCents,
        item.units,
        isCosmetic,
        notes,
      ],
    );
  }
}

async function ensureCosmeticCategories(categories: string[]): Promise<void> {
  let order = 20;
  for (const category of categories) {
    await pool.query(
      `insert into cosmetic_procedure_categories(category_name, display_name, description, sort_order, is_active)
       values ($1, $2, $3, $4, true)
       on conflict (category_name)
       do update set
         display_name = excluded.display_name,
         description = excluded.description,
         is_active = true,
         updated_at = current_timestamp`,
      [
        categorySlug(category),
        category,
        `Workbook self-pay cosmetic category: ${category}.`,
        order++,
      ],
    );
  }
}

async function run(): Promise<void> {
  const workbookPath = process.argv.find((arg) => arg.endsWith(".xlsx")) || DEFAULT_WORKBOOK_PATH;
  const tenantArg = process.argv.find((arg) => arg.startsWith("--tenant="));
  const tenantId = tenantArg ? tenantArg.split("=")[1] : null;

  if (!fs.existsSync(workbookPath)) {
    throw new Error(`Workbook not found: ${workbookPath}`);
  }

  const sheets = loadWorkbook(path.resolve(workbookPath));
  const medicalRows = sheets["Self-Pay Medical"];
  const cosmeticRows = sheets["Self-Pay Cosmetic"];
  if (!medicalRows || !cosmeticRows) {
    throw new Error("Workbook must contain Self-Pay Medical and Self-Pay Cosmetic sheets");
  }

  const medicalItems = parseMedicalSheet(medicalRows);
  const cosmeticItems = parseCosmeticSheet(cosmeticRows);
  await ensureCosmeticCategories(Array.from(new Set(cosmeticItems.map((item) => item.category))));

  const tenants = await pool.query(
    tenantId
      ? `select id from tenants where id = $1`
      : `select id from tenants order by case when id = 'tenant-demo' then 0 else 1 end, id`,
    tenantId ? [tenantId] : [],
  );

  if (tenants.rows.length === 0) {
    throw new Error(tenantId ? `Tenant not found: ${tenantId}` : "No tenants found");
  }

  for (const tenant of tenants.rows) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const medicalScheduleId = await ensureSchedule(
        client,
        tenant.id,
        MEDICAL_SCHEDULE_NAME,
        "Workbook-backed medical self-pay fee schedule. Internal codes keep these charges out of insurance claims by default.",
      );
      const cosmeticScheduleId = await ensureSchedule(
        client,
        tenant.id,
        COSMETIC_SCHEDULE_NAME,
        "Workbook-backed cosmetic self-pay fee schedule. These services route to patient responsibility by default.",
      );

      await upsertItems(client, medicalScheduleId, medicalItems, false);
      await upsertItems(client, cosmeticScheduleId, cosmeticItems, true);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  console.log(`Imported ${medicalItems.length} medical self-pay fees and ${cosmeticItems.length} cosmetic fees into ${tenants.rows.length} tenant(s).`);
}

if (require.main === module) {
  run()
    .then(() => pool.end())
    .catch(async (error) => {
      console.error(error);
      await pool.end();
      process.exit(1);
    });
}
