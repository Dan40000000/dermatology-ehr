import { BiopsyService } from "../biopsyService";
import { pool } from "../../db/pool";
import { logger } from "../../lib/logger";

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock("../../lib/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

const queryMock = pool.query as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  (logger.info as jest.Mock).mockReset();
});

describe("BiopsyService", () => {
  it("generateSpecimenId returns formatted id", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ count: "0" }] });
    const id = await BiopsyService.generateSpecimenId({
      tenantId: "tenant-1",
      date: new Date(2025, 0, 2, 12),
    });
    expect(id).toBe("BX-20250102-001");
  });

  it("calculateTurnaroundTime handles missing dates", () => {
    expect(BiopsyService.calculateTurnaroundTime(null, new Date())).toBeNull();
  });

  it("calculateTurnaroundTime returns day count", () => {
    const sent = new Date("2025-01-01T00:00:00Z");
    const resulted = new Date("2025-01-03T00:00:00Z");
    expect(BiopsyService.calculateTurnaroundTime(sent, resulted)).toBe(2);
  });

  it("isOverdue returns true for overdue sent biopsies", () => {
    const sent = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000);
    expect(BiopsyService.isOverdue(sent, null, "sent")).toBe(true);
  });

  it("isOverdue returns false for reviewed biopsies", () => {
    const sent = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000);
    expect(BiopsyService.isOverdue(sent, null, "reviewed")).toBe(false);
  });

  it("getOverdueBiopsies returns rows", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "bio-1" }] });
    const result = await BiopsyService.getOverdueBiopsies("tenant-1");
    expect(result).toHaveLength(1);
  });

  it("getPendingReviewBiopsies returns rows", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "bio-2" }] });
    const result = await BiopsyService.getPendingReviewBiopsies("tenant-1", "prov-1");
    expect(result).toHaveLength(1);
  });

  it("getBiopsyStats returns stats", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total_biopsies_all_time: 5 }] });
    const result = await BiopsyService.getBiopsyStats("tenant-1");
    expect(result.total_biopsies_all_time).toBe(5);
  });

  it("linkBiopsyToLesion returns updated row", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "bio-1", lesion_id: "lesion-1" }] });
    const result = await BiopsyService.linkBiopsyToLesion("bio-1", "lesion-1", "tenant-1");
    expect(result.lesion_id).toBe("lesion-1");
  });

  it("updateLesionStatusForBiopsy updates marking", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "mark-1" }] });
    const result = await BiopsyService.updateLesionStatusForBiopsy("lesion-1", "bio-1");
    expect(result.id).toBe("mark-1");
  });

  it("createAlert inserts alert", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "alert-1" }] });
    const result = await BiopsyService.createAlert({
      biopsyId: "bio-1",
      tenantId: "tenant-1",
      alertType: "overdue",
      severity: "high",
      title: "Overdue",
      message: "Test",
    });
    expect(result.id).toBe("alert-1");
  });

  it("sendNotification throws when biopsy missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await expect(
      BiopsyService.sendNotification({
        biopsyId: "bio-1",
        tenantId: "tenant-1",
        type: "result_available",
        recipientType: "provider",
      })
    ).rejects.toThrow("Biopsy not found");
  });

  it("sendNotification logs notification", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          specimen_id: "BX-1",
          patient_name: "Test Patient",
          provider_email: "doc@example.com",
          patient_email: "patient@example.com",
          malignancy_type: "melanoma",
          follow_up_action: "mohs",
          days_overdue: 10,
        },
      ],
    });
    await BiopsyService.sendNotification({
      biopsyId: "bio-1",
      tenantId: "tenant-1",
      type: "malignancy",
      recipientType: "provider",
    });
    expect(logger.info).toHaveBeenCalled();
  });

  it("validateBiopsyData returns errors for invalid data", () => {
    const result = BiopsyService.validateBiopsyData({
      specimen_type: "bad",
      status: "unknown",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("trackSpecimen inserts tracking row", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "track-1" }] });
    const result = await BiopsyService.trackSpecimen({
      biopsyId: "bio-1",
      eventType: "sent",
    });
    expect(result.id).toBe("track-1");
  });

  it("getQualityMetrics returns metrics", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total_biopsies: "2" }] });
    const result = await BiopsyService.getQualityMetrics("tenant-1", new Date("2025-01-01"), new Date("2025-01-31"));
    expect(result.total_biopsies).toBe("2");
  });

  it("exportBiopsyLog returns rows", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ specimen_id: "BX-1" }] });
    const result = await BiopsyService.exportBiopsyLog("tenant-1", {
      startDate: new Date("2025-01-01"),
      endDate: new Date("2025-01-31"),
      providerId: "prov-1",
    });
    expect(result).toHaveLength(1);
  });
});
