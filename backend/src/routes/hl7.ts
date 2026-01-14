import { Router, Request, Response } from "express";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { parseHL7Message, validateHL7Message, generateACK } from "../services/hl7Parser";
import { processHL7Message } from "../services/hl7Processor";
import {
  enqueueHL7Message,
  getQueuedMessages,
  getMessageById,
  retryFailedMessage,
  getQueueStatistics,
} from "../services/hl7Queue";
import { createAuditLog } from "../services/audit";

export const hl7Router = Router();

/**
 * POST /api/hl7/inbound
 * Receive HL7 messages from external systems
 * Accepts raw HL7 text (pipe-delimited format)
 */
hl7Router.post("/inbound", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
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
          error: error instanceof Error ? error.message : String(error),
          rawMessage: rawMessage.substring(0, 500), // Log first 500 chars
        },
        severity: "error",
        status: "failure",
      });

      const nackMessage = `MSH|^~\\&|DERMAPP|DERM|SENDER|SENDER|${new Date().toISOString()}||ACK|${Date.now()}|P|2.5\rMSA|AR|UNKNOWN|Invalid HL7 format`;
      return res.status(400).json({
        error: "Invalid HL7 message format",
        details: error instanceof Error ? error.message : String(error),
        ack: nackMessage,
      });
    }

    const validation = validateHL7Message(parsed);
    if (!validation.valid) {
      await createAuditLog({
        tenantId,
        userId: req.user?.id || null,
        action: "HL7_VALIDATION_ERROR",
        resourceType: "hl7_message",
        resourceId: parsed.messageControlId,
        metadata: {
          errors: validation.errors,
          messageType: parsed.messageType,
        },
        severity: "warning",
        status: "failure",
      });

      const nackMessage = generateACK(parsed, "AR"); // Application Reject
      return res.status(400).json({
        error: "HL7 message validation failed",
        validationErrors: validation.errors,
        ack: nackMessage,
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
        messageControlId: parsed.messageControlId,
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
    console.error("Error receiving HL7 message:", error);
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
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    let rawMessage: string;
    if (typeof req.body === "string") {
      rawMessage = req.body;
    } else if (req.body.message) {
      rawMessage = req.body.message;
    } else {
      return res.status(400).json({ error: "Missing HL7 message in request body" });
    }

    // Parse and validate
    const parsed = parseHL7Message(rawMessage);
    const validation = validateHL7Message(parsed);

    if (!validation.valid) {
      const nackMessage = generateACK(parsed, "AR");
      return res.status(400).json({
        error: "HL7 message validation failed",
        validationErrors: validation.errors,
        ack: nackMessage,
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
        resourceId: parsed.messageControlId,
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
    console.error("Error processing HL7 message synchronously:", error);
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
    const tenantId = req.user?.tenantId;
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
    console.error("Error listing HL7 messages:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/hl7/messages/:id
 * Get details of a specific HL7 message
 */
hl7Router.get("/messages/:id", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
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
    console.error("Error getting HL7 message:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/hl7/messages/:id/reprocess
 * Retry processing a failed message
 */
hl7Router.post("/messages/:id/reprocess", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
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
    console.error("Error reprocessing HL7 message:", error);
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
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const stats = await getQueueStatistics(tenantId);
    res.json(stats);
  } catch (error) {
    console.error("Error getting HL7 statistics:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Legacy endpoints for backwards compatibility
 * All message types should use the main /inbound endpoint
 * These endpoints are deprecated and will be removed in a future version
 *
 * Note: These legacy endpoints don't require authentication for backwards compatibility
 * They accept messages without tenant validation (tenant determined from message content)
 */

// Helper function for legacy endpoints - processes HL7 without auth
const legacyHL7Handler = async (req: Request, res: Response) => {
  try {
    // Extract message from request body
    let rawMessage: string;
    if (typeof req.body === "string") {
      rawMessage = req.body;
    } else if (req.body.message) {
      rawMessage = req.body.message;
    } else {
      return res.status(400).json({ error: "Missing HL7 message in request body" });
    }

    // Parse the message to extract metadata (including potential tenant info)
    const parsed = parseHL7Message(rawMessage);
    const validation = validateHL7Message(parsed);

    if (!validation.valid) {
      const nackMessage = generateACK(parsed, "AR");
      return res.status(400).json({
        error: "HL7 message validation failed",
        validationErrors: validation.errors,
        ack: nackMessage,
      });
    }

    // For legacy endpoints, we'll use a default tenant or extract from message
    // In production, this would come from the message headers or a configured mapping
    const tenantId = "default"; // TODO: Extract from message routing info

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
    console.error("Error processing legacy HL7 message:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : String(error),
    });
  }
};

// ADT - Patient Administration Messages
hl7Router.post("/adt", legacyHL7Handler);

// SIU - Scheduling Information Unsolicited
hl7Router.post("/siu", legacyHL7Handler);

// DFT - Detailed Financial Transaction
hl7Router.post("/dft", legacyHL7Handler);

// ORU - Observation Result (lab results)
hl7Router.post("/oru", legacyHL7Handler);
