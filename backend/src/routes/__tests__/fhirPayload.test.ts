import request from "supertest";
import express from "express";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));

const { fhirPayloadRouter } = require("../fhirPayload");

const app = express();
app.use(express.json());
app.use("/fhir-payload", fhirPayloadRouter);

describe("FHIR payload routes", () => {
  it("GET /fhir-payload/appointment-example returns payload", async () => {
    const res = await request(app).get("/fhir-payload/appointment-example");
    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe("Appointment");
  });

  it("GET /fhir-payload/observation-example returns payload", async () => {
    const res = await request(app).get("/fhir-payload/observation-example");
    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe("Observation");
  });
});
