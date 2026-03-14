import request from "supertest";
import express from "express";
import handoutsRouter from "../handouts";
import { pool } from "../../db/pool";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "provider" };
    return next();
  },
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use("/handouts", handoutsRouter);

const queryMock = pool.query as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Handouts routes", () => {
  it("GET /handouts returns list", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (typeof sql === "string" && sql.startsWith("SELECT * FROM patient_handouts WHERE tenant_id = $1")) {
        return { rows: [{ id: "h1", instruction_type: "aftercare" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const res = await request(app).get("/handouts?category=Skin&condition=Acne&search=care");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("GET /handouts supports instructionType filter", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (typeof sql === "string" && sql.startsWith("SELECT * FROM patient_handouts WHERE tenant_id = $1")) {
        return { rows: [{ id: "h2", instruction_type: "lab_results" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const res = await request(app).get("/handouts?instructionType=lab_results");
    expect(res.status).toBe(200);
    expect(res.body[0].instruction_type).toBe("lab_results");
  });

  it("GET /handouts/:id returns 404", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get("/handouts/h1");
    expect(res.status).toBe(404);
  });

  it("GET /handouts/:id returns handout", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "h1" }] });
    const res = await request(app).get("/handouts/h1");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("h1");
  });

  it("POST /handouts rejects invalid payload", async () => {
    const res = await request(app).post("/handouts").send({ title: "" });
    expect(res.status).toBe(400);
  });

  it("POST /handouts creates handout", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "h1" }] });
    const res = await request(app).post("/handouts").send({
      title: "Acne Care",
      category: "Skin",
      condition: "Acne",
      content: "Wash daily",
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe("h1");
  });

  it("PATCH /handouts rejects invalid payload", async () => {
    const res = await request(app).patch("/handouts/h1").send({ title: "" });
    expect(res.status).toBe(400);
  });

  it("PATCH /handouts returns 404", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).patch("/handouts/h1").send({ title: "Updated" });
    expect(res.status).toBe(404);
  });

  it("PATCH /handouts updates handout", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "h1" }] });
    const res = await request(app).patch("/handouts/h1").send({ title: "Updated" });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("h1");
  });

  it("DELETE /handouts returns 404", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).delete("/handouts/h1");
    expect(res.status).toBe(404);
  });

  it("DELETE /handouts deletes handout", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "h1" }] });
    const res = await request(app).delete("/handouts/h1");
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Handout deleted");
  });
});
