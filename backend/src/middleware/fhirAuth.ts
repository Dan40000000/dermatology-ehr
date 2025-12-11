/**
 * FHIR OAuth 2.0 Authentication Middleware
 * Implements OAuth 2.0 Bearer token authentication for FHIR endpoints
 * Supports SMART on FHIR scopes
 */

import { NextFunction, Request, Response } from "express";
import { pool } from "../db/pool";
import { createAuditLog } from "../services/audit";
import { createOperationOutcome } from "../services/fhirMapper";

export interface FHIRAuthenticatedRequest extends Request {
  fhirAuth?: {
    tenantId: string;
    clientId: string;
    scope: string[];
    tokenId: string;
  };
}

/**
 * Parse and validate FHIR scopes
 * Supports: patient/*.read, user/*.read, system/*.read
 */
function parseScopes(scopeString: string): string[] {
  if (!scopeString) return [];
  return scopeString.split(/\s+/).filter(Boolean);
}

/**
 * Check if the request scope allows access to a resource
 */
function checkScopePermission(scopes: string[], resourceType: string, operation: "read" | "write"): boolean {
  // System scope has access to all resources
  if (scopes.includes(`system/*.${operation}`) || scopes.includes("system/*.*")) {
    return true;
  }

  // User scope has access to all resources (for authenticated user context)
  if (scopes.includes(`user/*.${operation}`) || scopes.includes("user/*.*")) {
    return true;
  }

  // Patient scope has access to patient-specific resources
  if (scopes.includes(`patient/*.${operation}`) || scopes.includes("patient/*.*")) {
    return true;
  }

  // Check specific resource type
  if (scopes.includes(`user/${resourceType}.${operation}`) || scopes.includes(`user/${resourceType}.*`)) {
    return true;
  }

  if (scopes.includes(`patient/${resourceType}.${operation}`) || scopes.includes(`patient/${resourceType}.*`)) {
    return true;
  }

  if (scopes.includes(`system/${resourceType}.${operation}`) || scopes.includes(`system/${resourceType}.*`)) {
    return true;
  }

  return false;
}

/**
 * FHIR OAuth middleware - validates Bearer tokens and checks scopes
 */
export async function requireFHIRAuth(req: FHIRAuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    // Extract Bearer token
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json(
        createOperationOutcome(
          "error",
          "login",
          "Missing or invalid Authorization header. Expected: Bearer <token>"
        )
      );
    }

    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return res.status(401).json(
        createOperationOutcome("error", "login", "Missing access token")
      );
    }

    // Validate token in database
    const result = await pool.query(
      `SELECT id, tenant_id, client_id, client_name, scope, expires_at
       FROM fhir_oauth_tokens
       WHERE access_token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      // Log failed authentication attempt
      await createAuditLog({
        tenantId: "unknown",
        userId: null,
        action: "fhir_auth_failed",
        resourceType: "OAuth",
        severity: "warning",
        status: "failure",
        metadata: {
          reason: "Invalid token",
          ip: req.ip,
          userAgent: req.get("user-agent"),
        },
      });

      return res.status(401).json(
        createOperationOutcome("error", "login", "Invalid access token")
      );
    }

    const tokenData = result.rows[0];

    // Check if token is expired
    if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
      await createAuditLog({
        tenantId: tokenData.tenant_id,
        userId: null,
        action: "fhir_auth_failed",
        resourceType: "OAuth",
        severity: "warning",
        status: "failure",
        metadata: {
          reason: "Token expired",
          clientId: tokenData.client_id,
          ip: req.ip,
        },
      });

      return res.status(401).json(
        createOperationOutcome("error", "login", "Access token has expired")
      );
    }

    // Parse scopes
    const scopes = parseScopes(tokenData.scope);

    // Attach FHIR auth context to request
    req.fhirAuth = {
      tenantId: tokenData.tenant_id,
      clientId: tokenData.client_id,
      scope: scopes,
      tokenId: tokenData.id,
    };

    // Update last used timestamp
    await pool.query(
      `UPDATE fhir_oauth_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [tokenData.id]
    );

    // Log successful authentication
    await createAuditLog({
      tenantId: tokenData.tenant_id,
      userId: null,
      action: "fhir_auth_success",
      resourceType: "OAuth",
      severity: "info",
      status: "success",
      metadata: {
        clientId: tokenData.client_id,
        clientName: tokenData.client_name,
        scope: scopes,
        ip: req.ip,
        userAgent: req.get("user-agent"),
      },
    });

    next();
  } catch (error) {
    console.error("FHIR auth error:", error);
    return res.status(500).json(
      createOperationOutcome("error", "exception", "Internal server error during authentication")
    );
  }
}

/**
 * Middleware to check if request has permission for a specific resource type and operation
 */
export function requireFHIRScope(resourceType: string, operation: "read" | "write" = "read") {
  return (req: FHIRAuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.fhirAuth) {
      return res.status(401).json(
        createOperationOutcome("error", "login", "Authentication required")
      );
    }

    const hasPermission = checkScopePermission(req.fhirAuth.scope, resourceType, operation);

    if (!hasPermission) {
      // Log unauthorized access attempt
      createAuditLog({
        tenantId: req.fhirAuth.tenantId,
        userId: null,
        action: "fhir_access_denied",
        resourceType,
        severity: "warning",
        status: "failure",
        metadata: {
          clientId: req.fhirAuth.clientId,
          requestedOperation: operation,
          scopes: req.fhirAuth.scope,
          ip: req.ip,
        },
      }).catch(console.error);

      return res.status(403).json(
        createOperationOutcome(
          "error",
          "forbidden",
          `Insufficient scope. Required: ${resourceType}.${operation}`
        )
      );
    }

    next();
  };
}

/**
 * Log FHIR resource access for audit trail
 */
export async function logFHIRAccess(
  req: FHIRAuthenticatedRequest,
  resourceType: string,
  resourceId: string | undefined,
  operation: string
) {
  if (!req.fhirAuth) return;

  await createAuditLog({
    tenantId: req.fhirAuth.tenantId,
    userId: null,
    action: `fhir_${operation}`,
    resourceType,
    resourceId: resourceId || '',
    severity: "info",
    status: "success",
    metadata: {
      clientId: req.fhirAuth.clientId,
      scope: req.fhirAuth.scope,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      path: req.path,
      query: req.query,
    },
  });
}
