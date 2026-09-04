import { Router } from "express";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { generateACK, parseHL7Message, validateHL7Message } from "../services/hl7Parser";

export const interopRouter = Router();

function getRawMessage(body: unknown): string | undefined {
  if (typeof body === "string") return body;
  if (!body || typeof body !== "object" || Array.isArray(body)) return undefined;
  const value = (body as any).message || (body as any).hl7Message;
  return typeof value === "string" ? value : undefined;
}

/** Generate an HL7 ACK for a valid, addressable message. */
interopRouter.post("/ack", requireAuth, (req: AuthedRequest, res) => {
  if (!req.user?.tenantId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const rawMessage = getRawMessage(req.body);
  if (!rawMessage) {
    return res.status(400).json({ error: "Missing HL7 message in request body" });
  }

  try {
    const parsed = parseHL7Message(rawMessage);
    const validation = validateHL7Message(parsed);
    if (!validation.valid) {
      const response: Record<string, unknown> = {
        error: "HL7 message validation failed",
        validationErrors: validation.errors,
      };
      if (parsed.messageControlId) response.ack = generateACK(parsed, "AR");
      return res.status(400).json(response);
    }

    return res.json({
      ack: true,
      acknowledgment: generateACK(parsed, "AA"),
      messageControlId: parsed.messageControlId,
      messageType: parsed.messageType,
    });
  } catch (error) {
    return res.status(400).json({
      error: "Invalid HL7 message format",
      details: error instanceof Error ? error.message : "Invalid HL7 message",
    });
  }
});

// This endpoint mirrors the implemented R4 surface. SMART authorization and
// US Core profiles are deliberately not claimed here because they are not
// implemented by this server.
interopRouter.get("/capability", requireAuth, (_req: AuthedRequest, res) => {
  res.json({
    resourceType: "CapabilityStatement",
    status: "active",
    kind: "instance",
    fhirVersion: "4.0.1",
    format: ["json"],
    security: {
      description:
        "OAuth 2.0 bearer tokens are validated against configured FHIR token records. SMART App Launch authorization and discovery are not implemented.",
    },
    resources: ["Patient", "Practitioner", "Appointment", "Encounter", "Observation", "Condition", "Procedure", "Organization", "AllergyIntolerance"],
  });
});
