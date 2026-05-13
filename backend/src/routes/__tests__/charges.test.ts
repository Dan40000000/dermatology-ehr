import request from "supertest";
import express from "express";
import { chargesRouter } from "../charges";
import { pool } from "../../db/pool";

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

const app = express();
app.use(express.json());
app.use("/charges", chargesRouter);

const queryMock = pool.query as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Charges routes", () => {
  it("GET /charges returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "charge-1" }] });
    const res = await request(app).get("/charges");
    expect(res.status).toBe(200);
    expect(res.body.charges).toHaveLength(1);
  });

  it("GET /charges/encounter/:id returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "charge-1" }] });
    const res = await request(app).get("/charges/encounter/enc-1");
    expect(res.status).toBe(200);
    expect(res.body.charges).toHaveLength(1);
  });

  it("POST /charges rejects invalid payload", async () => {
    const res = await request(app).post("/charges").send({ amountCents: 100 });
    expect(res.status).toBe(400);
  });

  it("POST /charges creates charge", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/charges").send({
      cptCode: "11100",
      amountCents: 12000,
      description: "Biopsy",
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
  });

  it("POST /charges can price from the charge-code catalog", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{
        description: "Mohs surgery first stage",
        category: "Mohs Surgery",
        feeCents: 136700,
        codeType: "CPT",
        billingRoute: "insurance",
        requiresDiagnosis: true,
      }],
    });

    const res = await request(app).post("/charges").send({
      cptCode: "17311",
      quantity: 1,
      icdCodes: ["C44.41"],
      linkedDiagnosisIds: ["dx-bcc-scalp-neck"],
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    const insertArgs = queryMock.mock.calls[1][1];
    expect(insertArgs).toEqual(expect.arrayContaining(["17311", "CPT", "insurance"]));
    expect(insertArgs[7]).toEqual(["C44.41"]);
    expect(insertArgs[8]).toEqual(["dx-bcc-scalp-neck"]);
  });

  it("POST /charges accepts self_pay status for cosmetic work", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/charges").send({
      cptCode: "COSLHR",
      amountCents: 32000,
      description: "Laser hair removal - Full Face",
      status: "self_pay",
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
  });

  it("PUT /charges/:id rejects empty updates", async () => {
    const res = await request(app).put("/charges/charge-1").send({});
    expect(res.status).toBe(400);
  });

  it("PUT /charges/:id updates charge", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ status: "pending" }], rowCount: 1 });
    const res = await request(app).put("/charges/charge-1").send({ status: "paid" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("PUT /charges/:id blocks charges already attached to claims", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ status: "pending" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: "claim-1", claimNumber: "CLM-1", status: "coding_review" }], rowCount: 1 });

    const res = await request(app).put("/charges/charge-1").send({ amountCents: 20000 });

    expect(res.status).toBe(409);
    expect(res.body.downstreamArtifacts.claims).toHaveLength(1);
    expect(String(queryMock.mock.calls[queryMock.mock.calls.length - 1]?.[0] || "")).not.toContain("update charges set");
  });

  it("DELETE /charges/:id deletes charge", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ status: "pending" }], rowCount: 1 });
    const res = await request(app).delete("/charges/charge-1");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("DELETE /charges/:id blocks terminal billing statuses", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ status: "paid" }], rowCount: 1 });

    const res = await request(app).delete("/charges/charge-1");

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("locked");
    expect(String(queryMock.mock.calls[queryMock.mock.calls.length - 1]?.[0] || "")).not.toContain("delete from charges");
  });

  it("GET /charges/search/cpt rejects missing query", async () => {
    const res = await request(app).get("/charges/search/cpt");
    expect(res.status).toBe(400);
  });

  it("GET /charges/search/cpt returns codes", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ code: "11100" }] });
    const res = await request(app).get("/charges/search/cpt?q=111");
    expect(res.status).toBe(200);
    expect(res.body.codes).toHaveLength(1);
  });

  it("GET /charges/search/cpt searches fee schedule cosmetic codes too", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ code: "LASER-HAIR-S", defaultFeeCents: 15000 }] });
    const res = await request(app).get("/charges/search/cpt?q=laser");
    expect(res.status).toBe(200);
    expect(res.body.codes[0].code).toBe("LASER-HAIR-S");
    expect(String(queryMock.mock.calls[0]?.[0] ?? "")).toContain("fee_schedule_items");
  });
});
