import { createFinancialWorkQueueItem } from "../financialWorkQueueService";

describe("financialWorkQueueService", () => {
  it("deduplicates appointment-only issues by appointment when no encounter exists", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "fwq-1",
            tenant_id: "tenant-1",
            encounter_id: null,
            appointment_id: "appt-1",
            patient_id: "patient-1",
            claim_id: null,
            bill_id: null,
            issue_type: "checkout_missing_encounter",
            severity: "error",
            status: "open",
            message: "Missing encounter",
            error_detail: null,
            metadata: {},
            created_at: "2026-05-29T00:00:00.000Z",
            updated_at: "2026-05-29T00:00:00.000Z",
          },
        ],
      });

    await createFinancialWorkQueueItem(
      {
        tenantId: "tenant-1",
        appointmentId: "appt-1",
        patientId: "patient-1",
        issueType: "checkout_missing_encounter",
        severity: "error",
        message: "Missing encounter",
      },
      { query },
    );

    expect(query.mock.calls[0][0]).toContain("appointment_id is not distinct from $4::text");
    expect(query.mock.calls[0][1]).toEqual([
      "tenant-1",
      "checkout_missing_encounter",
      null,
      "appt-1",
    ]);
  });
});
