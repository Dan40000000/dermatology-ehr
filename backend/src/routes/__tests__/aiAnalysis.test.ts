import request from "supertest";
import express from "express";
import aiAnalysisRouter from "../aiAnalysis";
import { pool } from "../../db/pool";
import { aiImageAnalysisService } from "../../services/aiImageAnalysis";
import { logger } from "../../lib/logger";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1" };
    return next();
  },
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock("../../services/aiImageAnalysis", () => ({
  aiImageAnalysisService: {
    analyzeSkinLesion: jest.fn(),
    getAnalysisForPhoto: jest.fn(),
    batchAnalyzePatientPhotos: jest.fn(),
  },
}));

jest.mock("../../lib/logger", () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use("/ai-analysis", aiAnalysisRouter);

const queryMock = pool.query as jest.Mock;
const loggerMock = logger as jest.Mocked<typeof logger>;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
  jest.clearAllMocks();
  loggerMock.error.mockReset();
});

describe("AI Analysis Routes", () => {
  describe("POST /ai-analysis/analyze-photo/:photoId", () => {
    it("should analyze a photo", async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [
            { id: "photo-1", url: "https://example.com/photo.jpg", patientId: "patient-1" },
          ],
        })
        .mockResolvedValueOnce({ rows: [] });

      (aiImageAnalysisService.getAnalysisForPhoto as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: "analysis-1",
          riskLevel: "low",
          primaryFinding: "Normal skin",
        });

      (aiImageAnalysisService.analyzeSkinLesion as jest.Mock).mockResolvedValueOnce("analysis-1");

      const res = await request(app).post("/ai-analysis/analyze-photo/photo-1");

      expect(res.status).toBe(200);
      expect(res.body.analysisId).toBe("analysis-1");
      expect(res.body.analysis.riskLevel).toBe("low");
    });

    it("should return existing analysis if already analyzed", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: "photo-1", url: "https://example.com/photo.jpg", patientId: "patient-1" }],
      });

      (aiImageAnalysisService.getAnalysisForPhoto as jest.Mock).mockResolvedValueOnce({
        id: "analysis-1",
        riskLevel: "low",
      });

      const res = await request(app).post("/ai-analysis/analyze-photo/photo-1");

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Photo already analyzed");
      expect(res.body.analysisId).toBe("analysis-1");
    });

    it("should create CDS alert for high risk lesions", async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ id: "photo-1", url: "https://example.com/photo.jpg", patientId: "patient-1" }],
        })
        .mockResolvedValueOnce({ rows: [] });

      (aiImageAnalysisService.getAnalysisForPhoto as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: "analysis-1",
          riskLevel: "high",
          primaryFinding: "Suspicious melanoma",
        });

      (aiImageAnalysisService.analyzeSkinLesion as jest.Mock).mockResolvedValueOnce("analysis-1");

      const res = await request(app).post("/ai-analysis/analyze-photo/photo-1");

      expect(res.status).toBe(200);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("insert into cds_alerts"),
        expect.arrayContaining([
          expect.any(String),
          "tenant-1",
          "patient-1",
          "high_risk_lesion",
          "high",
          "High-Risk Lesion Detected",
          expect.stringContaining("Suspicious melanoma"),
          true,
        ])
      );
    });

    it("should create critical CDS alert for critical risk lesions", async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ id: "photo-1", url: "https://example.com/photo.jpg", patientId: "patient-1" }],
        })
        .mockResolvedValueOnce({ rows: [] });

      (aiImageAnalysisService.getAnalysisForPhoto as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: "analysis-1",
          riskLevel: "critical",
          primaryFinding: "Melanoma",
        });

      (aiImageAnalysisService.analyzeSkinLesion as jest.Mock).mockResolvedValueOnce("analysis-1");

      const res = await request(app).post("/ai-analysis/analyze-photo/photo-1");

      expect(res.status).toBe(200);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("insert into cds_alerts"),
        expect.arrayContaining([expect.any(String), "tenant-1", "patient-1", "high_risk_lesion", "critical"])
      );
    });

    it("should return 404 if photo not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post("/ai-analysis/analyze-photo/photo-1");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Photo not found");
    });

    it("should handle errors", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));

      const res = await request(app).post("/ai-analysis/analyze-photo/photo-1");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to analyze photo");
      expect(loggerMock.error).toHaveBeenCalledWith("AI Analysis Error", {
        error: "DB error",
      });
    });

    it("should mask non-Error failures in logs", async () => {
      queryMock.mockRejectedValueOnce({ patientName: "Jane Doe" });

      const res = await request(app).post("/ai-analysis/analyze-photo/photo-1");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to analyze photo");
      expect(loggerMock.error).toHaveBeenCalledWith("AI Analysis Error", {
        error: "Unknown error",
      });
    });
  });

  describe("GET /ai-analysis/photo/:photoId", () => {
    it("should return analysis for a photo", async () => {
      const mockAnalysis = {
        id: "analysis-1",
        photoId: "photo-1",
        riskLevel: "low",
        primaryFinding: "Normal skin",
      };

      (aiImageAnalysisService.getAnalysisForPhoto as jest.Mock).mockResolvedValueOnce(
        mockAnalysis
      );

      const res = await request(app).get("/ai-analysis/photo/photo-1");

      expect(res.status).toBe(200);
      expect(res.body.id).toBe("analysis-1");
    });

    it("should return 404 if no analysis found", async () => {
      (aiImageAnalysisService.getAnalysisForPhoto as jest.Mock).mockResolvedValueOnce(null);

      const res = await request(app).get("/ai-analysis/photo/photo-1");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("No analysis found for this photo");
    });

    it("should handle errors", async () => {
      (aiImageAnalysisService.getAnalysisForPhoto as jest.Mock).mockRejectedValueOnce(
        new Error("Service error")
      );

      const res = await request(app).get("/ai-analysis/photo/photo-1");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to retrieve analysis");
    });
  });

  describe("POST /ai-analysis/batch-analyze/:patientId", () => {
    it("should batch analyze patient photos", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: "patient-1" }],
      });

      (aiImageAnalysisService.batchAnalyzePatientPhotos as jest.Mock).mockResolvedValueOnce([
        "analysis-1",
        "analysis-2",
        "analysis-3",
      ]);

      const res = await request(app).post("/ai-analysis/batch-analyze/patient-1");

      expect(res.status).toBe(200);
      expect(res.body.analysisCount).toBe(3);
      expect(res.body.analysisIds).toHaveLength(3);
    });

    it("should return 404 if patient not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post("/ai-analysis/batch-analyze/patient-1");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Patient not found");
    });

    it("should handle errors", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));

      const res = await request(app).post("/ai-analysis/batch-analyze/patient-1");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to batch analyze photos");
    });
  });

  describe("GET /ai-analysis/cds-alerts", () => {
    it("should return CDS alerts", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "alert-1",
            patientId: "patient-1",
            alertType: "high_risk_lesion",
            severity: "high",
            title: "High-Risk Lesion",
            dismissed: false,
          },
        ],
      });

      const res = await request(app).get("/ai-analysis/cds-alerts");

      expect(res.status).toBe(200);
      expect(res.body.alerts).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });

    it("should filter by patientId", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      await request(app).get("/ai-analysis/cds-alerts?patientId=patient-1");

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("a.patient_id = $2"),
        expect.arrayContaining(["tenant-1", "patient-1"])
      );
    });

    it("should filter by dismissed status", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      await request(app).get("/ai-analysis/cds-alerts?dismissed=false");

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("a.dismissed = $2"),
        expect.arrayContaining(["tenant-1", false])
      );
    });

    it("should handle errors", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));

      const res = await request(app).get("/ai-analysis/cds-alerts");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to retrieve alerts");
    });
  });

  describe("POST /ai-analysis/cds-alerts/:alertId/dismiss", () => {
    it("should dismiss an alert", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: "alert-1" }],
      });

      const res = await request(app).post("/ai-analysis/cds-alerts/alert-1/dismiss");

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Alert dismissed");
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("update cds_alerts"),
        ["user-1", "alert-1", "tenant-1"]
      );
    });

    it("should return 404 if alert not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post("/ai-analysis/cds-alerts/alert-1/dismiss");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Alert not found");
    });

    it("should handle errors", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));

      const res = await request(app).post("/ai-analysis/cds-alerts/alert-1/dismiss");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to dismiss alert");
    });
  });

  describe("GET /ai-analysis/stats", () => {
    it("should return AI analysis statistics", async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [
            {
              totalAnalyses: 100,
              highRiskCount: 5,
              last30Days: 20,
              avgConfidence: 0.85,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              totalAlerts: 10,
              activeAlerts: 3,
              criticalAlerts: 1,
            },
          ],
        });

      const res = await request(app).get("/ai-analysis/stats");

      expect(res.status).toBe(200);
      expect(res.body.analyses.totalAnalyses).toBe(100);
      expect(res.body.analyses.highRiskCount).toBe(5);
      expect(res.body.alerts.totalAlerts).toBe(10);
      expect(res.body.alerts.activeAlerts).toBe(3);
    });

    it("should handle errors", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));

      const res = await request(app).get("/ai-analysis/stats");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to retrieve statistics");
    });
  });
});
