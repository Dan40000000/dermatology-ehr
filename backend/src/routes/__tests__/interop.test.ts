import request from "supertest";
import express from "express";
import { interopRouter } from "../interop";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));

const app = express();
app.use(express.json());
app.use("/interop", interopRouter);

describe("Interop routes", () => {
  it("POST /interop/ack echoes body", async () => {
    const res = await request(app).post("/interop/ack").send({ msg: "HL7" });
    expect(res.status).toBe(200);
    expect(res.body.ack).toBe(true);
    expect(res.body.received.msg).toBe("HL7");
  });

  it("GET /interop/capability returns FHIR capability", async () => {
    const res = await request(app).get("/interop/capability");
    expect(res.status).toBe(200);
    expect(res.body.fhirVersion).toBe("4.0.1");
  });
});
