import { Router } from "express";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { logger } from "../lib/logger";

export const cptCodesRouter = Router();

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

function logCptCodesError(message: string, error: unknown): void {
  logger.error(message, {
    error: toSafeErrorMessage(error),
  });
}

// GET /api/cpt-codes - List/search CPT codes
cptCodesRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { search, category, common_only } = req.query;

    let query = `
      select id, code, description, category,
             default_fee_cents as "defaultFeeCents",
             is_common as "isCommon",
             created_at as "createdAt"
      from cpt_codes
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
    return res.json({ cptCodes: result.rows });
  } catch (err) {
    logCptCodesError("Error fetching CPT codes", err);
    return res.status(500).json({ error: "Failed to fetch CPT codes" });
  }
});

// GET /api/cpt-codes/:code - Get single CPT code by code
cptCodesRouter.get("/:code", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { code } = req.params;

    const result = await pool.query(
      `select id, code, description, category,
              default_fee_cents as "defaultFeeCents",
              is_common as "isCommon",
              created_at as "createdAt"
       from cpt_codes
       where code = $1`,
      [code]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "CPT code not found" });
    }

    return res.json({ cptCode: result.rows[0] });
  } catch (err) {
    logCptCodesError("Error fetching CPT code", err);
    return res.status(500).json({ error: "Failed to fetch CPT code" });
  }
});
