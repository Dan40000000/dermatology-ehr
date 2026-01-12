import { Router } from "express";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimit";
import { randomUUID } from "crypto";
import { requireModuleAccess } from "../middleware/moduleAccess";

export const qualityMeasuresRouter = Router();

qualityMeasuresRouter.use(rateLimit({ windowMs: 60_000, max: 100 }));

// GET /api/quality/measures - List available quality measures
qualityMeasuresRouter.get("/measures", requireAuth, requireModuleAccess("quality"), async (req: AuthedRequest, res) => {
  try {
    const { category, specialty, active } = req.query;

    let query = "select * from quality_measures where 1=1";
    const params: any[] = [];

    if (category) {
      params.push(category);
      query += ` and category = $${params.length}`;
    }

    if (specialty) {
      params.push(specialty);
      query += ` and specialty = $${params.length}`;
    }

    if (active !== undefined) {
      params.push(active === 'true');
      query += ` and is_active = $${params.length}`;
    }

    query += " order by category, measure_code";

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching quality measures:", err);
    res.status(500).json({ error: "Failed to fetch quality measures" });
  }
});

// GET /api/quality/performance - Calculate performance on measures
qualityMeasuresRouter.get("/performance", requireAuth, requireModuleAccess("quality"), async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { providerId, measureId, startDate, endDate, year, quarter } = req.query;

    // Determine reporting period
    let periodStart: string;
    let periodEnd: string;

    if (year && quarter) {
      const y = parseInt(year as string);
      const q = parseInt(quarter as string);
      const qStartMonth = (q - 1) * 3;
      periodStart = `${y}-${String(qStartMonth + 1).padStart(2, '0')}-01`;
      const nextQ = q === 4 ? 1 : q + 1;
      const nextY = q === 4 ? y + 1 : y;
      const nextQStartMonth = (nextQ - 1) * 3;
      periodEnd = `${nextY}-${String(nextQStartMonth + 1).padStart(2, '0')}-01`;
    } else if (startDate && endDate) {
      periodStart = startDate as string;
      periodEnd = endDate as string;
    } else {
      // Default to current year
      const currentYear = new Date().getFullYear();
      periodStart = `${currentYear}-01-01`;
      periodEnd = `${currentYear}-12-31`;
    }

    // Fetch or calculate performance
    let query = `
      select
        mp.*,
        qm.measure_code,
        qm.measure_name,
        qm.category,
        qm.description,
        p.full_name as provider_name
      from measure_performance mp
      join quality_measures qm on mp.measure_id = qm.id
      left join users p on mp.provider_id = p.id
      where mp.tenant_id = $1
        and mp.reporting_period_start >= $2
        and mp.reporting_period_end <= $3
    `;

    const params: any[] = [tenantId, periodStart, periodEnd];

    if (providerId) {
      params.push(providerId);
      query += ` and mp.provider_id = $${params.length}`;
    }

    if (measureId) {
      params.push(measureId);
      query += ` and mp.measure_id = $${params.length}`;
    }

    query += " order by qm.category, qm.measure_code";

    const result = await pool.query(query, params);

    // If no cached performance data, calculate it
    if (result.rows.length === 0) {
      const measures = await pool.query(
        "select * from quality_measures where is_active = true"
      );

      const calculatedPerformance = [];

      for (const measure of measures.rows) {
        // Calculate performance based on patient_measure_events
        const perfQuery = `
          select
            count(*) filter (where numerator_met = true) as numerator_count,
            count(*) filter (where denominator_met = true) as denominator_count,
            count(*) filter (where excluded = true) as exclusion_count
          from patient_measure_events
          where tenant_id = $1
            and measure_id = $2
            and event_date >= $3
            and event_date <= $4
            ${providerId ? 'and provider_id = $5' : ''}
        `;

        const perfParams = providerId
          ? [tenantId, measure.id, periodStart, periodEnd, providerId]
          : [tenantId, measure.id, periodStart, periodEnd];

        const perfResult = await pool.query(perfQuery, perfParams);
        const perf = perfResult.rows[0];

        const denominatorCount = parseInt(perf.denominator_count) - parseInt(perf.exclusion_count);
        const performanceRate = denominatorCount > 0
          ? (parseInt(perf.numerator_count) / denominatorCount) * 100
          : 0;

        calculatedPerformance.push({
          measure_id: measure.id,
          measure_code: measure.measure_code,
          measure_name: measure.measure_name,
          category: measure.category,
          description: measure.description,
          numerator_count: parseInt(perf.numerator_count),
          denominator_count: denominatorCount,
          exclusion_count: parseInt(perf.exclusion_count),
          performance_rate: performanceRate.toFixed(2),
          reporting_period_start: periodStart,
          reporting_period_end: periodEnd,
        });
      }

      return res.json(calculatedPerformance);
    }

    res.json(result.rows);
  } catch (err) {
    console.error("Error calculating performance:", err);
    res.status(500).json({ error: "Failed to calculate performance" });
  }
});

// POST /api/quality/submit - Submit MIPS data
qualityMeasuresRouter.post("/submit", requireAuth, requireModuleAccess("quality"), async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const { providerId, year, quarter, measures, submissionType } = req.body;

    if (!year || !quarter || !measures) {
      return res.status(400).json({ error: "Year, quarter, and measures are required" });
    }

    const submissionId = randomUUID();

    const result = await pool.query(
      `insert into mips_submissions (
        id, tenant_id, provider_id, submission_year, submission_quarter,
        submission_type, submission_date, status, submission_data,
        confirmation_number, submitted_by
      ) values ($1, $2, $3, $4, $5, $6, now(), $7, $8, $9, $10)
      returning *`,
      [
        submissionId,
        tenantId,
        providerId || null,
        year,
        quarter,
        submissionType || 'quality',
        'submitted',
        JSON.stringify(measures),
        `MIPS-${year}-Q${quarter}-${submissionId.substring(0, 8)}`,
        userId,
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error submitting MIPS data:", err);
    res.status(500).json({ error: "Failed to submit MIPS data" });
  }
});

// GET /api/quality/reports/mips - Generate MIPS report
qualityMeasuresRouter.get("/reports/mips", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { year, quarter, providerId } = req.query;

    if (!year) {
      return res.status(400).json({ error: "Year is required" });
    }

    let query = `
      select
        ms.*,
        u.full_name as provider_name
      from mips_submissions ms
      left join users u on ms.provider_id = u.id
      where ms.tenant_id = $1
        and ms.submission_year = $2
    `;

    const params: any[] = [tenantId, year];

    if (quarter) {
      params.push(quarter);
      query += ` and ms.submission_quarter = $${params.length}`;
    }

    if (providerId) {
      params.push(providerId);
      query += ` and ms.provider_id = $${params.length}`;
    }

    query += " order by ms.submission_date desc";

    const result = await pool.query(query, params);

    // Calculate aggregate scores if needed
    const submissions = result.rows;
    const report = {
      year,
      quarter: quarter || 'All',
      total_submissions: submissions.length,
      submissions,
      average_score: submissions.length > 0
        ? submissions.reduce((sum, s) => sum + (parseFloat(s.score) || 0), 0) / submissions.length
        : 0,
    };

    res.json(report);
  } catch (err) {
    console.error("Error generating MIPS report:", err);
    res.status(500).json({ error: "Failed to generate MIPS report" });
  }
});

// GET /api/quality/reports/pqrs - Generate PQRS report
qualityMeasuresRouter.get("/reports/pqrs", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { year, providerId } = req.query;

    const currentYear = year || new Date().getFullYear();
    const periodStart = `${currentYear}-01-01`;
    const periodEnd = `${currentYear}-12-31`;

    // Fetch all measure performance for the year
    let query = `
      select
        mp.*,
        qm.measure_code,
        qm.measure_name,
        qm.category,
        u.full_name as provider_name
      from measure_performance mp
      join quality_measures qm on mp.measure_id = qm.id
      left join users u on mp.provider_id = u.id
      where mp.tenant_id = $1
        and mp.reporting_period_start >= $2
        and mp.reporting_period_end <= $3
    `;

    const params: any[] = [tenantId, periodStart, periodEnd];

    if (providerId) {
      params.push(providerId);
      query += ` and mp.provider_id = $${params.length}`;
    }

    query += " order by qm.category, qm.measure_code";

    const result = await pool.query(query, params);

    // Group by category
    const byCategory: Record<string, any[]> = {};
    result.rows.forEach(row => {
      const category = row.category;
      if (category) {
        if (!byCategory[category]) {
          byCategory[category] = [];
        }
        byCategory[category]!.push(row);
      }
    });

    const report = {
      year: currentYear,
      provider_id: providerId || 'All Providers',
      generated_at: new Date().toISOString(),
      performance_by_category: byCategory,
      total_measures: result.rows.length,
      average_performance: result.rows.length > 0
        ? result.rows.reduce((sum, r) => sum + (parseFloat(r.performance_rate) || 0), 0) / result.rows.length
        : 0,
    };

    res.json(report);
  } catch (err) {
    console.error("Error generating PQRS report:", err);
    res.status(500).json({ error: "Failed to generate PQRS report" });
  }
});

// GET /api/quality/gap-closure - Identify patients needing interventions
qualityMeasuresRouter.get("/gap-closure", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { measureId, providerId, status, priority } = req.query;

    let query = `
      select
        qg.*,
        qm.measure_name,
        qm.measure_code,
        qm.category,
        p.first_name || ' ' || p.last_name as patient_name,
        p.dob,
        p.phone,
        p.email,
        u.full_name as provider_name
      from quality_gaps qg
      join quality_measures qm on qg.measure_id = qm.id
      join patients p on qg.patient_id = p.id
      left join users u on qg.provider_id = u.id
      where qg.tenant_id = $1
    `;

    const params: any[] = [tenantId];

    if (measureId) {
      params.push(measureId);
      query += ` and qg.measure_id = $${params.length}`;
    }

    if (providerId) {
      params.push(providerId);
      query += ` and qg.provider_id = $${params.length}`;
    }

    if (status) {
      params.push(status);
      query += ` and qg.status = $${params.length}`;
    } else {
      // Default to open gaps
      query += " and qg.status = 'open'";
    }

    if (priority) {
      params.push(priority);
      query += ` and qg.priority = $${params.length}`;
    }

    query += " order by qg.priority desc, qg.due_date asc nulls last, qg.created_at desc";

    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching gap closure list:", err);
    res.status(500).json({ error: "Failed to fetch gap closure list" });
  }
});

// POST /api/quality/gap-closure/:id/close - Close a quality gap
qualityMeasuresRouter.post("/gap-closure/:id/close", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const { id } = req.params;
    const { interventionNotes } = req.body;

    const result = await pool.query(
      `update quality_gaps
       set status = 'closed',
           closed_date = now(),
           closed_by = $1,
           intervention_notes = $2,
           updated_at = now()
       where id = $3 and tenant_id = $4
       returning *`,
      [userId, interventionNotes, id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Gap not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error closing quality gap:", err);
    res.status(500).json({ error: "Failed to close quality gap" });
  }
});

// POST /api/quality/recalculate - Recalculate performance for a period
qualityMeasuresRouter.post("/recalculate", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { providerId, measureId, startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: "Start date and end date are required" });
    }

    // Get measures to recalculate
    let measuresQuery = "select * from quality_measures where is_active = true";
    const measuresParams: any[] = [];

    if (measureId) {
      measuresParams.push(measureId);
      measuresQuery += ` and id = $${measuresParams.length}`;
    }

    const measuresResult = await pool.query(measuresQuery, measuresParams);
    const measures = measuresResult.rows;

    const results = [];

    for (const measure of measures) {
      // Calculate performance
      const perfQuery = `
        select
          count(*) filter (where numerator_met = true) as numerator_count,
          count(*) filter (where denominator_met = true) as denominator_count,
          count(*) filter (where excluded = true) as exclusion_count,
          json_agg(json_build_object(
            'patient_id', patient_id,
            'numerator_met', numerator_met,
            'denominator_met', denominator_met,
            'excluded', excluded
          )) as patient_list
        from patient_measure_events
        where tenant_id = $1
          and measure_id = $2
          and event_date >= $3
          and event_date <= $4
          ${providerId ? 'and provider_id = $5' : ''}
      `;

      const perfParams = providerId
        ? [tenantId, measure.id, startDate, endDate, providerId]
        : [tenantId, measure.id, startDate, endDate];

      const perfResult = await pool.query(perfQuery, perfParams);
      const perf = perfResult.rows[0];

      const denominatorCount = parseInt(perf.denominator_count) - parseInt(perf.exclusion_count);
      const performanceRate = denominatorCount > 0
        ? (parseInt(perf.numerator_count) / denominatorCount) * 100
        : 0;

      // Upsert performance record
      const performanceId = randomUUID();
      await pool.query(
        `insert into measure_performance (
          id, tenant_id, provider_id, measure_id,
          reporting_period_start, reporting_period_end,
          numerator_count, denominator_count, exclusion_count,
          performance_rate, patient_list, last_calculated_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
        on conflict (tenant_id, provider_id, measure_id, reporting_period_start, reporting_period_end)
        do update set
          numerator_count = $7,
          denominator_count = $8,
          exclusion_count = $9,
          performance_rate = $10,
          patient_list = $11,
          last_calculated_at = now()`,
        [
          performanceId,
          tenantId,
          providerId || null,
          measure.id,
          startDate,
          endDate,
          perf.numerator_count,
          denominatorCount,
          perf.exclusion_count,
          performanceRate,
          perf.patient_list,
        ]
      );

      results.push({
        measure_id: measure.id,
        measure_code: measure.measure_code,
        measure_name: measure.measure_name,
        performance_rate: performanceRate.toFixed(2),
        numerator_count: parseInt(perf.numerator_count),
        denominator_count: denominatorCount,
      });
    }

    res.json({ recalculated: results.length, results });
  } catch (err) {
    console.error("Error recalculating performance:", err);
    res.status(500).json({ error: "Failed to recalculate performance" });
  }
});
