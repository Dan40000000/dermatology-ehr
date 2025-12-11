import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import {
  generateAppointmentReport,
  generateFinancialReport,
  generateClinicalReport,
  generatePatientListReport,
  generateProviderProductivityReport,
  generateNoShowReport,
  getFinancialSummary,
  ReportFilters,
} from "../services/reportService";

export const reportsRouter = Router();

const reportFiltersSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  providerId: z.string().optional(),
  locationId: z.string().optional(),
  patientId: z.string().optional(),
  status: z.string().optional(),
  appointmentTypeId: z.string().optional(),
  paymentStatus: z.string().optional(),
  diagnosisCode: z.string().optional(),
  procedureCode: z.string().optional(),
  ageMin: z.number().optional(),
  ageMax: z.number().optional(),
  gender: z.string().optional(),
  active: z.boolean().optional(),
  format: z.enum(["json", "csv", "pdf"]).optional(),
});

// Generate Appointment Report
reportsRouter.post(
  "/appointments",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const parsed = reportFiltersSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const filters = parsed.data;
    const format = filters.format || "json";

    try {
      const data = await generateAppointmentReport(
        tenantId,
        filters,
        req.user!.id
      );

      if (format === "csv") {
        const header =
          "Date,Time,Patient,Provider,Location,Type,Status,Duration (min)";
        const rows = data.map(
          (r) =>
            `${r.date},${r.time},"${r.patientName}","${r.providerName}","${r.locationName}","${r.appointmentType}",${r.status},${r.duration}`
        );
        const csv = [header, ...rows].join("\n");

        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="Appointments_Report_${new Date().toISOString().split("T")[0]}.csv"`
        );
        return res.send(csv);
      }

      return res.json({ data, count: data.length });
    } catch (error) {
      console.error("Error generating appointment report:", error);
      return res.status(500).json({ error: "Failed to generate report" });
    }
  }
);

// Generate Financial Report
reportsRouter.post(
  "/financial",
  requireAuth,
  requireRoles(["admin", "front_desk"]),
  async (req: AuthedRequest, res) => {
    const parsed = reportFiltersSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const filters = parsed.data;
    const format = filters.format || "json";

    try {
      const data = await generateFinancialReport(
        tenantId,
        filters,
        req.user!.id
      );
      const summary = await getFinancialSummary(tenantId, filters);

      if (format === "csv") {
        const header =
          "Date,Patient,Services,Charges,Payments,Balance,Claim Number";
        const rows = data.map((r) => {
          const charges = (r.chargesCents / 100).toFixed(2);
          const payments = (r.paymentsCents / 100).toFixed(2);
          const balance = (r.balanceCents / 100).toFixed(2);
          return `${r.date},"${r.patientName}","${r.services}",${charges},${payments},${balance},${r.claimNumber || ""}`;
        });

        // Add summary row
        const totalCharges = ((summary.totalCharges || 0) / 100).toFixed(2);
        const totalPayments = ((summary.totalPayments || 0) / 100).toFixed(2);
        const totalOutstanding = (
          (summary.totalOutstanding || 0) / 100
        ).toFixed(2);
        const summaryRow = `\nSUMMARY,,Total,${totalCharges},${totalPayments},${totalOutstanding},`;

        const csv = [header, ...rows, summaryRow].join("\n");

        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="Financial_Report_${new Date().toISOString().split("T")[0]}.csv"`
        );
        return res.send(csv);
      }

      return res.json({ data, summary, count: data.length });
    } catch (error) {
      console.error("Error generating financial report:", error);
      return res.status(500).json({ error: "Failed to generate report" });
    }
  }
);

// Generate Clinical Report
reportsRouter.post(
  "/clinical",
  requireAuth,
  requireRoles(["admin", "provider"]),
  async (req: AuthedRequest, res) => {
    const parsed = reportFiltersSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const filters = parsed.data;
    const format = filters.format || "json";

    try {
      const data = await generateClinicalReport(
        tenantId,
        filters,
        req.user!.id
      );

      if (format === "csv") {
        const header =
          "Date,Patient,Diagnosis Code,Diagnosis,Procedure Code,Procedure,Provider";
        const rows = data.map(
          (r) =>
            `${r.date},"${r.patientName}",${r.diagnosisCode},"${r.diagnosisDescription}",${r.procedureCode},"${r.procedureDescription}","${r.providerName}"`
        );
        const csv = [header, ...rows].join("\n");

        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="Clinical_Report_${new Date().toISOString().split("T")[0]}.csv"`
        );
        return res.send(csv);
      }

      return res.json({ data, count: data.length });
    } catch (error) {
      console.error("Error generating clinical report:", error);
      return res.status(500).json({ error: "Failed to generate report" });
    }
  }
);

// Generate Patient List Report
reportsRouter.post(
  "/patients",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const parsed = reportFiltersSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const filters = parsed.data;
    const format = filters.format || "json";

    try {
      const data = await generatePatientListReport(
        tenantId,
        filters,
        req.user!.id
      );

      if (format === "csv") {
        const header = "Name,Date of Birth,Age,Gender,Phone,Email,Last Visit,Status";
        const rows = data.map(
          (r) =>
            `"${r.name}",${r.dob},${r.age},${r.gender},"${r.phone}","${r.email}",${r.lastVisit || "Never"},${r.status}`
        );
        const csv = [header, ...rows].join("\n");

        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="Patient_List_${new Date().toISOString().split("T")[0]}.csv"`
        );
        return res.send(csv);
      }

      return res.json({ data, count: data.length });
    } catch (error) {
      console.error("Error generating patient list report:", error);
      return res.status(500).json({ error: "Failed to generate report" });
    }
  }
);

// Generate Provider Productivity Report
reportsRouter.post(
  "/productivity",
  requireAuth,
  requireRoles(["admin"]),
  async (req: AuthedRequest, res) => {
    const parsed = reportFiltersSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const filters = parsed.data;
    const format = filters.format || "json";

    try {
      const data = await generateProviderProductivityReport(
        tenantId,
        filters,
        req.user!.id
      );

      if (format === "csv") {
        const header =
          "Provider,Patients Seen,Appointments,Revenue,Avg per Patient";
        const rows = data.map((r) => {
          const revenue = (r.revenueCents / 100).toFixed(2);
          const avgPerPatient = (r.avgPerPatientCents / 100).toFixed(2);
          return `"${r.providerName}",${r.patientsSeen},${r.appointments},${revenue},${avgPerPatient}`;
        });
        const csv = [header, ...rows].join("\n");

        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="Provider_Productivity_${new Date().toISOString().split("T")[0]}.csv"`
        );
        return res.send(csv);
      }

      return res.json({ data, count: data.length });
    } catch (error) {
      console.error("Error generating productivity report:", error);
      return res.status(500).json({ error: "Failed to generate report" });
    }
  }
);

// Generate No-Show Report
reportsRouter.post(
  "/no-shows",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const parsed = reportFiltersSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const filters = parsed.data;
    const format = filters.format || "json";

    try {
      const data = await generateNoShowReport(tenantId, filters, req.user!.id);

      // Calculate no-show rate
      const totalQuery = `
        select count(*) as total
        from appointments
        where tenant_id = $1
          ${filters.startDate ? "and scheduled_start >= $2::date" : ""}
          ${
            filters.endDate
              ? `and scheduled_start < $${filters.startDate ? 3 : 2}::date + interval '1 day'`
              : ""
          }
      `;

      const totalParams: any[] = [tenantId];
      if (filters.startDate) totalParams.push(filters.startDate);
      if (filters.endDate) totalParams.push(filters.endDate);

      const totalResult = await pool.query(totalQuery, totalParams);
      const total = parseInt(totalResult.rows[0]?.total) || 1;
      const noShowCount = data.length;
      const noShowRate = ((noShowCount / total) * 100).toFixed(2);

      if (format === "csv") {
        const header = "Date,Patient,Provider,Appointment Type,Reason,Status";
        const rows = data.map(
          (r) =>
            `${r.date},"${r.patientName}","${r.providerName}","${r.appointmentType}","${r.reason}",${r.status}`
        );
        const summaryRow = `\n\nNo-Show Rate: ${noShowRate}% (${noShowCount} of ${total} appointments)`;
        const csv = [header, ...rows, summaryRow].join("\n");

        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="No_Show_Report_${new Date().toISOString().split("T")[0]}.csv"`
        );
        return res.send(csv);
      }

      return res.json({
        data,
        count: data.length,
        noShowRate,
        totalAppointments: total,
      });
    } catch (error) {
      console.error("Error generating no-show report:", error);
      return res.status(500).json({ error: "Failed to generate report" });
    }
  }
);

// Get list of providers (for filter dropdown)
reportsRouter.get("/filters/providers", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const result = await pool.query(
    "select id, full_name as name from providers where tenant_id = $1 order by full_name",
    [tenantId]
  );
  res.json({ providers: result.rows });
});

// Get list of locations (for filter dropdown)
reportsRouter.get("/filters/locations", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const result = await pool.query(
    "select id, name from locations where tenant_id = $1 order by name",
    [tenantId]
  );
  res.json({ locations: result.rows });
});

// Get list of appointment types (for filter dropdown)
reportsRouter.get("/filters/appointment-types", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const result = await pool.query(
    "select id, name from appointment_types where tenant_id = $1 order by name",
    [tenantId]
  );
  res.json({ appointmentTypes: result.rows });
});

// Legacy export endpoint (for backward compatibility)
reportsRouter.get("/appointments/export", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const result = await pool.query(
    `select a.id, p.first_name || ' ' || p.last_name as patient, pr.full_name as provider, a.scheduled_start, a.scheduled_end, a.status
     from appointments a
     join patients p on p.id = a.patient_id
     join providers pr on pr.id = a.provider_id
     where a.tenant_id = $1
     order by a.scheduled_start asc
     limit 500`,
    [tenantId],
  );
  const rows = result.rows;
  const header = "id,patient,provider,start,end,status";
  const csv = [header, ...rows.map((r) => `${r.id},${r.patient},${r.provider},${r.scheduled_start},${r.scheduled_end},${r.status}`)].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=\"appointments.csv\"");
  res.send(csv);
});
