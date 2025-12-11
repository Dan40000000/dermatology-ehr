import { Router } from "express";
import { AuthedRequest, requireAuth } from "../middleware/auth";

export const interopRouter = Router();

// Simple ACK logging for HL7 stubs
interopRouter.post("/ack", requireAuth, (req: AuthedRequest, res) => {
  // Here we would parse HL7 and return ACK; currently just echoes
  res.json({ ack: true, received: req.body });
});

// FHIR capability stub
interopRouter.get("/capability", requireAuth, (_req: AuthedRequest, res) => {
  res.json({
    fhirVersion: "4.0.1",
    resources: ["Patient", "Practitioner", "Appointment", "Encounter", "Observation", "DocumentReference"],
  });
});
