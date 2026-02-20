import request from "supertest";
import express from "express";
import aiLesionAnalysisRouter from "../aiLesionAnalysis";
import { aiLesionAnalysisService } from "../../services/aiLesionAnalysisService";
import { pool } from "../../db/pool";
import { logger } from "../../lib/logger";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "provider" };
    return next();
  },
}));

jest.mock("../../middleware/rbac", () => ({
  requireRoles: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock("../../services/aiLesionAnalysisService", () => ({
  aiLesionAnalysisService: {
    analyzeImage: jest.fn(),
    getAnalysis: jest.fn(),
    getAnalysisForImage: jest.fn(),
    compareToPrior: jest.fn(),
    recordFeedback: jest.fn(),
    getPatientHighRiskLesions: jest.fn(),
    getPatientAnalysisHistory: jest.fn(),
    getAccuracyMetrics: jest.fn(),
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
app.use("/ai-lesion-analysis", aiLesionAnalysisRouter);

const queryMock = pool.query as jest.Mock;
const lesionServiceMock = aiLesionAnalysisService as jest.Mocked<typeof aiLesionAnalysisService>;
const loggerMock = logger as jest.Mocked<typeof logger>;

describe("AI lesion analysis routes", () => {
  beforeEach(() => {
    queryMock.mockReset();
    lesionServiceMock.analyzeImage.mockReset();
    lesionServiceMock.getAnalysis.mockReset();
    lesionServiceMock.getAnalysisForImage.mockReset();
    lesionServiceMock.compareToPrior.mockReset();
    lesionServiceMock.recordFeedback.mockReset();
    lesionServiceMock.getPatientHighRiskLesions.mockReset();
    lesionServiceMock.getPatientAnalysisHistory.mockReset();
    lesionServiceMock.getAccuracyMetrics.mockReset();
    loggerMock.error.mockReset();
  });

  it("POST /ai-lesion-analysis/analyze logs sanitized Error failures", async () => {
    lesionServiceMock.analyzeImage.mockRejectedValueOnce(new Error("analysis failed"));

    const res = await request(app).post("/ai-lesion-analysis/analyze").send({
      imageId: "11111111-1111-4111-8111-111111111111",
      analysisType: "standard",
    });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("analysis failed");
    expect(loggerMock.error).toHaveBeenCalledWith("AI Lesion Analysis Error", {
      error: "analysis failed",
    });
  });

  it("POST /ai-lesion-analysis/analyze masks non-Error failures in logs", async () => {
    lesionServiceMock.analyzeImage.mockRejectedValueOnce({ patientName: "Jane Doe" });

    const res = await request(app).post("/ai-lesion-analysis/analyze").send({
      imageId: "11111111-1111-4111-8111-111111111111",
      analysisType: "standard",
    });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to analyze image");
    expect(loggerMock.error).toHaveBeenCalledWith("AI Lesion Analysis Error", {
      error: "Unknown error",
    });
  });

  it("GET /ai-lesion-analysis/patient/:patientId/high-risk masks non-Error DB failures", async () => {
    queryMock.mockRejectedValueOnce({ patientName: "Jane Doe" });

    const res = await request(app).get("/ai-lesion-analysis/patient/patient-1/high-risk");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to retrieve high-risk lesions");
    expect(loggerMock.error).toHaveBeenCalledWith("Get High-Risk Lesions Error", {
      error: "Unknown error",
    });
  });
});
