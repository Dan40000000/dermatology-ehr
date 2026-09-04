import request from "supertest";
import express from "express";
import { interopRouter } from "../interop";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1" };
    return next();
  },
}));

const app = express();
app.use(express.json());
app.use("/interop", interopRouter);

describe("Interop routes", () => {
  it("POST /interop/ack returns an application accept for an addressable message", async () => {
    const message = [
      "MSH|^~\\&|SENDER|FACILITY|RECEIVER|CLINIC|20240115120000||ADT^A04|CTRL-1|P|2.5.1",
      "PID|1||patient-1||Doe^Jane",
    ].join("\r");
    const res = await request(app).post("/interop/ack").send({ message });
    expect(res.status).toBe(200);
    expect(res.body.ack).toBe(true);
    expect(res.body.messageControlId).toBe("CTRL-1");
    expect(res.body.acknowledgment).toContain("MSA|AA|CTRL-1");
  });

  it("POST /interop/ack rejects malformed messages without inventing a control id", async () => {
    const message = "MSH|^~\\&|SENDER|FACILITY|RECEIVER|CLINIC|20240115120000||ADT^A04||P|2.5.1";
    const res = await request(app).post("/interop/ack").send({ message });
    expect(res.status).toBe(400);
    expect(res.body.ack).toBeUndefined();
  });

  it("GET /interop/capability returns FHIR capability", async () => {
    const res = await request(app).get("/interop/capability");
    expect(res.status).toBe(200);
    expect(res.body.fhirVersion).toBe("4.0.1");
  });
});
