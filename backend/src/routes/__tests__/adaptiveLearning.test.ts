import request from "supertest";
import express from "express";
import { adaptiveLearningRouter } from "../adaptiveLearning";
import { pool } from "../../db/pool";
import {
  recordDiagnosisUsage,
  recordProcedureUsage,
  recordDiagnosisProcedurePair,
  calculateAdaptiveScore,
} from "../../services/learningService";

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

jest.mock("../../services/learningService", () => ({
  recordDiagnosisUsage: jest.fn(),
  recordProcedureUsage: jest.fn(),
  recordDiagnosisProcedurePair: jest.fn(),
  calculateAdaptiveScore: jest.fn((frequency, _lastUsed) => frequency * 10),
}));

const app = express();
app.use(express.json());
app.use("/adaptive", adaptiveLearningRouter);

const queryMock = pool.query as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
  (recordDiagnosisUsage as jest.Mock).mockReset();
  (recordProcedureUsage as jest.Mock).mockReset();
  (recordDiagnosisProcedurePair as jest.Mock).mockReset();
});

describe("Adaptive Learning Routes", () => {
  describe("GET /adaptive/diagnoses/suggested", () => {
    it("should return suggested diagnoses", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            icd10Code: "L20.9",
            frequencyCount: 10,
            lastUsed: new Date("2024-01-01"),
            description: "Atopic dermatitis",
            category: "Dermatitis",
          },
        ],
      });

      const res = await request(app).get("/adaptive/diagnoses/suggested");

      expect(res.status).toBe(200);
      expect(res.body.suggestions).toHaveLength(1);
      expect(res.body.suggestions[0].icd10Code).toBe("L20.9");
      expect(res.body.suggestions[0].adaptiveScore).toBe(100);
    });

    it("should accept providerId and limit query params", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      await request(app).get("/adaptive/diagnoses/suggested?providerId=provider-1&limit=5");

      expect(queryMock).toHaveBeenCalledWith(
        expect.any(String),
        ["tenant-1", "provider-1", 5]
      );
    });

    it("should handle database errors", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));

      const res = await request(app).get("/adaptive/diagnoses/suggested");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to fetch suggestions");
    });
  });

  describe("GET /adaptive/procedures/suggested", () => {
    it("should return suggested procedures", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            cptCode: "11100",
            frequencyCount: 5,
            lastUsed: new Date("2024-01-01"),
            description: "Biopsy of skin",
            category: "Procedures",
            defaultFeeCents: 15000,
          },
        ],
      });

      const res = await request(app).get("/adaptive/procedures/suggested");

      expect(res.status).toBe(200);
      expect(res.body.suggestions).toHaveLength(1);
      expect(res.body.suggestions[0].cptCode).toBe("11100");
      expect(res.body.suggestions[0].adaptiveScore).toBe(50);
    });

    it("should accept providerId and limit query params", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      await request(app).get("/adaptive/procedures/suggested?providerId=provider-2&limit=20");

      expect(queryMock).toHaveBeenCalledWith(
        expect.any(String),
        ["tenant-1", "provider-2", 20]
      );
    });

    it("should handle database errors", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));

      const res = await request(app).get("/adaptive/procedures/suggested");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to fetch suggestions");
    });
  });

  describe("GET /adaptive/procedures/for-diagnosis/:icd10Code", () => {
    it("should return procedures for a specific diagnosis", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            cptCode: "11100",
            pairCount: 8,
            lastUsed: new Date("2024-01-01"),
            description: "Biopsy of skin",
            category: "Procedures",
            defaultFeeCents: 15000,
          },
        ],
      });

      const res = await request(app).get("/adaptive/procedures/for-diagnosis/L20.9");

      expect(res.status).toBe(200);
      expect(res.body.suggestions).toHaveLength(1);
      expect(res.body.suggestions[0].cptCode).toBe("11100");
      expect(res.body.suggestions[0].pairCount).toBe(8);
    });

    it("should accept providerId and limit query params", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      await request(app).get("/adaptive/procedures/for-diagnosis/L20.9?providerId=provider-1&limit=5");

      expect(queryMock).toHaveBeenCalledWith(
        expect.any(String),
        ["tenant-1", "provider-1", "L20.9", 5]
      );
    });

    it("should handle database errors", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));

      const res = await request(app).get("/adaptive/procedures/for-diagnosis/L20.9");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to fetch suggestions");
    });
  });

  describe("POST /adaptive/learn/diagnosis", () => {
    it("should record diagnosis usage", async () => {
      (recordDiagnosisUsage as jest.Mock).mockResolvedValueOnce(undefined);

      const res = await request(app)
        .post("/adaptive/learn/diagnosis")
        .send({
          providerId: "provider-1",
          icd10Code: "L20.9",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(recordDiagnosisUsage).toHaveBeenCalledWith("tenant-1", "provider-1", "L20.9");
    });

    it("should reject invalid payload", async () => {
      const res = await request(app)
        .post("/adaptive/learn/diagnosis")
        .send({ providerId: "provider-1" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
    });

    it("should handle service errors", async () => {
      (recordDiagnosisUsage as jest.Mock).mockRejectedValueOnce(new Error("Service error"));

      const res = await request(app)
        .post("/adaptive/learn/diagnosis")
        .send({
          providerId: "provider-1",
          icd10Code: "L20.9",
        });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to record usage");
    });
  });

  describe("POST /adaptive/learn/procedure", () => {
    it("should record procedure usage", async () => {
      (recordProcedureUsage as jest.Mock).mockResolvedValueOnce(undefined);

      const res = await request(app)
        .post("/adaptive/learn/procedure")
        .send({
          providerId: "provider-1",
          cptCode: "11100",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(recordProcedureUsage).toHaveBeenCalledWith("tenant-1", "provider-1", "11100");
    });

    it("should reject invalid payload", async () => {
      const res = await request(app)
        .post("/adaptive/learn/procedure")
        .send({ cptCode: "11100" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
    });

    it("should handle service errors", async () => {
      (recordProcedureUsage as jest.Mock).mockRejectedValueOnce(new Error("Service error"));

      const res = await request(app)
        .post("/adaptive/learn/procedure")
        .send({
          providerId: "provider-1",
          cptCode: "11100",
        });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to record usage");
    });
  });

  describe("POST /adaptive/learn/pair", () => {
    it("should record diagnosis-procedure pair", async () => {
      (recordDiagnosisProcedurePair as jest.Mock).mockResolvedValueOnce(undefined);

      const res = await request(app)
        .post("/adaptive/learn/pair")
        .send({
          providerId: "provider-1",
          icd10Code: "L20.9",
          cptCode: "11100",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(recordDiagnosisProcedurePair).toHaveBeenCalledWith(
        "tenant-1",
        "provider-1",
        "L20.9",
        "11100"
      );
    });

    it("should reject invalid payload", async () => {
      const res = await request(app)
        .post("/adaptive/learn/pair")
        .send({ providerId: "provider-1", icd10Code: "L20.9" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
    });

    it("should handle service errors", async () => {
      (recordDiagnosisProcedurePair as jest.Mock).mockRejectedValueOnce(new Error("Service error"));

      const res = await request(app)
        .post("/adaptive/learn/pair")
        .send({
          providerId: "provider-1",
          icd10Code: "L20.9",
          cptCode: "11100",
        });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to record pair");
    });
  });

  describe("GET /adaptive/stats/:providerId", () => {
    it("should return provider statistics", async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [
            { icd10Code: "L20.9", frequencyCount: 10, description: "Atopic dermatitis" },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            { cptCode: "11100", frequencyCount: 5, description: "Biopsy of skin" },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            { totalDiagnoses: 25, totalProcedures: 15, totalPairs: 40 },
          ],
        });

      const res = await request(app).get("/adaptive/stats/provider-1");

      expect(res.status).toBe(200);
      expect(res.body.topDiagnoses).toHaveLength(1);
      expect(res.body.topProcedures).toHaveLength(1);
      expect(res.body.stats.totalDiagnoses).toBe(25);
    });

    it("should handle database errors", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));

      const res = await request(app).get("/adaptive/stats/provider-1");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to fetch statistics");
    });
  });
});
