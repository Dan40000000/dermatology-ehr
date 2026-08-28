import { Router, Request, Response } from "express";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { parseHL7Message, validateHL7Message, generateACK, type HL7Message } from "../services/hl7Parser";
import { processHL7Message } from "../services/hl7Processor";
import {
  enqueueHL7Message,
  getQueuedMessages,
  getMessageById,
  retryFailedMessage,
  getQueueStatistics,
} from "../services/hl7Queue";
import { createAuditLog } from "../services/audit";
import { logger } from "../lib/logger";
import { hashValue, safeErrorCode } from "../utils/phiRedaction";

export const hl7Router = Router();

function logHl7Error(message: string, error: unknown): void {
  logger.error(message, {
    errorCode: safeErrorCode(error),
  });
}

function hashControlId(messageControlId: string | undefined): string | undefined {
  return messageControlId ? `hl7-${hashValue(messageControlId)}` : undefined;
}

function getTenantId(req: AuthedRequest): string | undefined {
  const tenantId = req.user?.tenantId || req.tenantId;
  return typeof tenantId === "string" && tenantId.trim() ? tenantId : undefined;
}

function requestedBodyTenant(req: Request): string | undefined {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) return undefined;
  const candidate = (req.body as any).tenantId || (req.body as any).tenant_id;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : undefined;
}

function ackIfAddressable(message: HL7Message | undefined, code: "AA" | "AE" | "AR"): string | undefined {
  return message?.messageControlId ? generateACK(message, code) : undefined;
}

/**
 * POST /api/hl7/inbound
 * Receive HL7 messages from external systems
 * Accepts raw HL7 text (pipe-delimited format)
 */
hl7Router.post("/inbound", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const bodyTenant = requestedBodyTenant(req);
    if (bodyTenant && bodyTenant !== tenantId) {
      return res.status(403).json({ error: "Invalid tenant" });
    }

    // Get raw message - could be in body as string or in a field
    let rawMessage: string;

    if (typeof req.body === "string") {
      rawMessage = req.body;
    } else if (req.body.message) {
      rawMessage = req.body.message;
    } else if (req.body.hl7Message) {
      rawMessage = req.body.hl7Message;
    } else {
      return res.status(400).json({ error: "Missing HL7 message in request body" });
    }

    // Parse and validate the message
    let parsed;
    try {
      parsed = parseHL7Message(rawMessage);
    } catch (error) {
      // Log parsing error
      await createAuditLog({
        tenantId,
        userId: req.user?.id || null,
        action: "HL7_PARSE_ERROR",
        resourceType: "hl7_message",
        metadata: {
          errorCode: safeErrorCode(error),
          messageLength: Buffer.byteLength(rawMessage, "utf8"),
        },
        severity: "error",
        status: "failure",
      });

      return res.status(400).json({
        error: "Invalid HL7 message format",
        errorCode: safeErrorCode(error),
      });
    }

    const validation = validateHL7Message(parsed);
    if (!validation.valid) {
      await createAuditLog({
        tenantId,
        userId: req.user?.id || null,
        action: "HL7_VALIDATION_ERROR",
        resourceType: "hl7_message",
        resourceId: hashControlId(parsed.messageControlId),
        metadata: {
          errors: validation.errors,
          messageType: parsed.messageType,
        },
        severity: "warning",
        status: "failure",
      });

      const nack = ackIfAddressable(parsed, "AR");

      return res.status(400).json({
        error: "HL7 message validation failed",
        validationErrors: validation.errors,
        ...(nack ? { ack: nack } : {}),
      });
    }

    // Enqueue the message for processing
    const messageId = await enqueueHL7Message(rawMessage, tenantId);

    // Log successful receipt
    await createAuditLog({
      tenantId,
      userId: req.user?.id || null,
      action: "HL7_MESSAGE_RECEIVED",
      resourceType: "hl7_message",
      resourceId: messageId,
      metadata: {
        messageType: parsed.messageType,
        messageControlIdHash: hashControlId(parsed.messageControlId),
        sendingApplication: parsed.sendingApplication,
        sendingFacility: parsed.sendingFacility,
      },
      severity: "info",
      status: "success",
    });

    // Return ACK (Application Accept)
    const ackMessage = generateACK(parsed, "AA");

    res.status(200).json({
      success: true,
      messageId,
      messageType: parsed.messageType,
      messageControlId: parsed.messageControlId,
      status: "queued",
      ack: ackMessage,
    });
  } catch (error) {
    logHl7Error("Error receiving HL7 message", error);
    res.status(500).json({
      error: "Internal server error processing HL7 message",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/hl7/inbound/sync
 * Receive and immediately process HL7 message (synchronous)
 * Use this for real-time processing when you need immediate feedback
 */
hl7Router.post("/inbound/sync", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const bodyTenant = requestedBodyTenant(req);
    if (bodyTenant && bodyTenant !== tenantId) {
      return res.status(403).json({ error: "Invalid tenant" });
    }

    let rawMessage: string;
    if (typeof req.body === "string") {
      rawMessage = req.body;
    } else if (req.body.message) {
      rawMessage = req.body.message;
    } else {
      return res.status(400).json({ error: "Missing HL7 message in request body" });
    }

    // Parse and validate. Parsing failures are client errors and must not
    // reach processing or produce an ACK with an invented control id.
    let parsed: ReturnType<typeof parseHL7Message>;
    try {
      parsed = parseHL7Message(rawMessage);
    } catch (error) {
      return res.status(400).json({
        error: "Invalid HL7 message format",
        details: error instanceof Error ? error.message : String(error),
      });
    }
    const validation = validateHL7Message(parsed);

    if (!validation.valid) {
      const nack = ackIfAddressable(parsed, "AR");
      return res.status(400).json({
        error: "HL7 message validation failed",
        validationErrors: validation.errors,
        ...(nack ? { ack: nack } : {}),
      });
    }

    // Process immediately
    const result = await processHL7Message(parsed, tenantId, req.user?.id);

    if (result.success) {
      await createAuditLog({
        tenantId,
        userId: req.user?.id || null,
        action: "HL7_MESSAGE_PROCESSED_SYNC",
        resourceType: "hl7_message",
        resourceId: hashControlId(parsed.messageControlId),
        metadata: {
          messageType: parsed.messageType,
          resourceId: result.resourceId,
        },
        severity: "info",
        status: "success",
      });

      res.status(200).json({
        success: true,
        messageType: parsed.messageType,
        messageControlId: parsed.messageControlId,
        resourceId: result.resourceId,
        ack: result.ackMessage,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
        ack: result.ackMessage,
      });
    }
  } catch (error) {
    logHl7Error("Error processing HL7 message synchronously", error);
    res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/hl7/messages
 * List HL7 messages with filtering and pagination
 */
hl7Router.get("/messages", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const status = req.query.status as "pending" | "processing" | "processed" | "failed" | undefined;
    const messageType = req.query.messageType as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await getQueuedMessages(tenantId, {
      status,
      messageType,
      limit,
      offset,
    });

    res.json({
      messages: result.messages,
      total: result.total,
      limit,
      offset,
    });
  } catch (error) {
    logHl7Error("Error listing HL7 messages", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/hl7/messages/:id
 * Get details of a specific HL7 message
 */
hl7Router.get("/messages/:id", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const messageId = req.params.id!;
    const message = await getMessageById(messageId, tenantId);

    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    res.json(message);
  } catch (error) {
    logHl7Error("Error getting HL7 message", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/hl7/messages/:id/reprocess
 * Retry processing a failed message
 */
hl7Router.post("/messages/:id/reprocess", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const messageId = req.params.id!;

    await retryFailedMessage(messageId, tenantId);

    await createAuditLog({
      tenantId,
      userId: req.user?.id || null,
      action: "HL7_MESSAGE_REPROCESS",
      resourceType: "hl7_message",
      resourceId: messageId,
      severity: "info",
      status: "success",
    });

    res.json({
      success: true,
      message: "Message queued for reprocessing",
    });
  } catch (error) {
    logHl7Error("Error reprocessing HL7 message", error);
    res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/hl7/statistics
 * Get queue statistics
 */
hl7Router.get("/statistics", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const stats = await getQueueStatistics(tenantId);
    res.json(stats);
  } catch (error) {
    logHl7Error("Error getting HL7 statistics", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Legacy endpoints for backwards compatibility
 * All message types should use the main /inbound endpoint
 * These endpoints are deprecated and will be removed in a future version
 *
 * Legacy clients retain the endpoint paths, but authentication and an
 * authenticated tenant are required before any message is parsed or queued.
 */

// Helper function for legacy endpoints - processes HL7 for an authenticated tenant
const legacyHL7Handler = async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // The authenticated identity is authoritative. A body-supplied tenant is
    // accepted only as a consistency check and can never select the storage
    // tenant (preventing cross-tenant writes through legacy clients).
    const bodyTenant = requestedBodyTenant(req);
    if (bodyTenant && bodyTenant !== tenantId) {
      return res.status(403).json({ error: "Invalid tenant" });
    }

    // Extract message from request body
    let rawMessage: string;
    if (typeof req.body === "string") {
      rawMessage = req.body;
    } else if (req.body.message) {
      rawMessage = req.body.message;
    } else {
      return res.status(400).json({ error: "Missing HL7 message in request body" });
    }

    // Parse the message to extract metadata (including potential tenant info).
    // Invalid messages are rejected before queueing or ACK generation.
    let parsed: ReturnType<typeof parseHL7Message>;
    try {
      parsed = parseHL7Message(rawMessage);
    } catch (error) {
      return res.status(400).json({
        error: "Invalid HL7 message format",
        details: error instanceof Error ? error.message : String(error),
      });
    }
    const validation = validateHL7Message(parsed);

    if (!validation.valid) {
      const nack = ackIfAddressable(parsed, "AR");
      return res.status(400).json({
        error: "HL7 message validation failed",
        validationErrors: validation.errors,
        ...(nack ? { ack: nack } : {}),
      });
    }

    // Enqueue the message
    const messageId = await enqueueHL7Message(rawMessage, tenantId);

    // Return success with ACK
    const ackMessage = generateACK(parsed, "AA");
    res.status(200).json({
      success: true,
      messageId,
      messageType: parsed.messageType,
      messageControlId: parsed.messageControlId,
      status: "queued",
      ack: ackMessage,
    });
  } catch (error) {
    logHl7Error("Error processing legacy HL7 message", error);
    res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : String(error),
    });
  }
};

// ADT - Patient Administration Messages
hl7Router.post("/adt", requireAuth, legacyHL7Handler);

// SIU - Scheduling Information Unsolicited
hl7Router.post("/siu", requireAuth, legacyHL7Handler);

// DFT - Detailed Financial Transaction
hl7Router.post("/dft", requireAuth, legacyHL7Handler);

// ORU - Observation Result (lab results)
hl7Router.post("/oru", requireAuth, legacyHL7Handler);
