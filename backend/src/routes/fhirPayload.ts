import { Router } from "express";
import { requireAuth } from "../middleware/auth";

export const fhirPayloadRouter = Router();

// Example payloads for reference/testing
fhirPayloadRouter.get("/appointment-example", requireAuth, (_req, res) => {
  res.json({
    resourceType: "Appointment",
    status: "booked",
    start: new Date().toISOString(),
    end: new Date(Date.now() + 3600000).toISOString(),
    participant: [
      { actor: { reference: "Patient/example" }, status: "accepted" },
      { actor: { reference: "Practitioner/example" }, status: "accepted" },
    ],
  });
});

fhirPayloadRouter.get("/observation-example", requireAuth, (_req, res) => {
  res.json({
    resourceType: "Observation",
    status: "final",
    code: { text: "Blood Pressure" },
    valueString: "120/80",
  });
});
