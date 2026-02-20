import { Router } from "express";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { logger } from "../lib/logger";

export const icd10CodesRouter = Router();

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

function logIcd10CodesError(message: string, error: unknown): void {
  logger.error(message, {
    error: toSafeErrorMessage(error),
  });
}

// GET /api/icd10-codes - List/search ICD-10 codes
icd10CodesRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { search, category, common_only } = req.query;

    let query = `
      select id, code, description, category,
             is_common as "isCommon",
             created_at as "createdAt"
      from icd10_codes
      where 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (search) {
      query += ` and (code ilike $${paramIndex} or description ilike $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (category) {
      query += ` and category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (common_only === 'true') {
      query += ` and is_common = true`;
    }

    query += ` order by code`;

    const result = await pool.query(query, params);
    return res.json({ icd10Codes: result.rows });
  } catch (err) {
    logIcd10CodesError("Error fetching ICD-10 codes", err);
    return res.status(500).json({ error: "Failed to fetch ICD-10 codes" });
  }
});

// GET /api/icd10-codes/:code - Get single ICD-10 code by code
icd10CodesRouter.get("/:code", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { code } = req.params;

    const result = await pool.query(
      `select id, code, description, category,
              is_common as "isCommon",
              created_at as "createdAt"
       from icd10_codes
       where code = $1`,
      [code]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "ICD-10 code not found" });
    }

    return res.json({ icd10Code: result.rows[0] });
  } catch (err) {
    logIcd10CodesError("Error fetching ICD-10 code", err);
    return res.status(500).json({ error: "Failed to fetch ICD-10 code" });
  }
});
