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
    /** Launch-context patient for patient-scoped SMART access. */
    patientId?: string;
    /** Authenticated user for user-scoped access, when issued by the token service. */
    userId?: string;
  };
}

type ScopeContext = "patient" | "user" | "system";

interface ParsedScope {
  context: ScopeContext;
  resource: string;
  operations: Set<string>;
}

const PATIENT_COMPARTMENT_RESOURCES = new Set([
  "Patient",
  "Observation",
  "Condition",
  "Procedure",
  "Encounter",
  "Appointment",
  "AllergyIntolerance",
]);

const OPERATION_ALIASES: Record<string, string> = {
  c: "create",
  r: "read",
  u: "update",
  d: "delete",
  s: "search",
};

/**
 * Parse and validate FHIR scopes
 * Supports: patient/*.read, user/*.read, system/*.read
 */
export function parseScopes(scopeString: string): string[] {
  if (!scopeString) return [];
  return scopeString.split(/\s+/).filter(Boolean);
}

function parseScope(scope: string): ParsedScope | null {
  const match = /^(patient|user|system)\/([^.?]+|\*)(?:\.([a-z*]+))?(?:\?.*)?$/i.exec(scope);
  if (!match) return null;

  const context = match[1].toLowerCase() as ScopeContext;
  const resource = match[2];
  const operationPart = (match[3] || "").toLowerCase();
  const operations = new Set<string>();

  // SMART v1 uses .read/.write while SMART v2 uses compact operation letters
  // (for example .rs). Accept both forms for existing clients, but keep the
  // context prefix intact so patient/user/system permissions are not merged.
  if (operationPart === "read") {
    operations.add("read");
    operations.add("search");
  } else if (operationPart === "write") {
    ["create", "update", "delete"].forEach((operation) => operations.add(operation));
  } else if (operationPart === "*") {
    ["create", "read", "update", "delete", "search"].forEach((operation) => operations.add(operation));
  } else {
    for (const letter of operationPart) {
      const operation = OPERATION_ALIASES[letter];
      if (operation) operations.add(operation);
    }
  }

  return { context, resource, operations };
}

function parsedScopes(scopes: string[]): ParsedScope[] {
  return scopes.map(parseScope).filter((scope): scope is ParsedScope => Boolean(scope));
}

function allowsOperation(scope: ParsedScope, resourceType: string, operation: "read" | "write" | "search"): boolean {
  if (scope.resource !== "*" && scope.resource !== resourceType) return false;
  if (operation === "read") {
    return scope.operations.has("read") || scope.operations.has("r");
  }
  if (operation === "search") {
    return scope.operations.has("read") || scope.operations.has("r") || scope.operations.has("search");
  }
  return ["create", "update", "delete", "write"].some((permission) => scope.operations.has(permission));
}

/**
 * Check if the request scope allows access to a resource
 */
export function checkScopePermission(scopes: string[], resourceType: string, operation: "read" | "write" | "search"): boolean {
  return parsedScopes(scopes).some((scope) => allowsOperation(scope, resourceType, operation));
}

function hasPatientScope(scopes: string[]): boolean {
  return parsedScopes(scopes).some((scope) => scope.context === "patient");
}

function hasNonPatientScope(scopes: string[], resourceType: string, operation: "read" | "write" | "search"): boolean {
  return parsedScopes(scopes).some(
    (scope) => scope.context !== "patient" && allowsOperation(scope, resourceType, operation),
  );
}

function normalizePatientReference(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const reference = value.trim();
  const match = /(?:^|\/)Patient\/([^/?#]+)$/i.exec(reference);
  return match ? match[1] : reference.replace(/^Patient\//i, "");
}

function patientContextMatchesRequest(
  req: FHIRAuthenticatedRequest,
  patientId: string,
  resourceType: string,
): boolean {
  const queryPatient = normalizePatientReference(req.query?.patient);
  if (queryPatient && queryPatient !== patientId) return false;

  // `_id` and `identifier` identify Patient resources. They must not be
  // compared with the launch patient when they are used to filter a member
  // resource (for example AllergyIntolerance?_id=allergy-1).
  if (resourceType === "Patient") {
    const queryId = typeof req.query?._id === "string" ? req.query._id : undefined;
    if (queryId && queryId.split(",").some((id) => id.trim() !== patientId)) return false;

    const queryIdentifier = typeof req.query?.identifier === "string" ? req.query.identifier : undefined;
    if (queryIdentifier) {
      const identifierValue = queryIdentifier.includes("|")
        ? queryIdentifier.slice(queryIdentifier.indexOf("|") + 1)
        : queryIdentifier;
      if (identifierValue !== patientId) return false;
    }
  }

  const requestedId = typeof req.params?.id === "string" ? req.params.id : undefined;
  if (requestedId && req.path?.toLowerCase().includes("/patient/") && requestedId !== patientId) {
    return false;
  }

  return true;
}

/**
 * Return the launch patient when this request is authorized solely by a
 * patient-context grant. Routes use this value to add a mandatory database
 * compartment predicate; user/system grants intentionally return undefined.
 */
export function getFHIRPatientContext(
  req: FHIRAuthenticatedRequest,
  resourceType: string,
  operation: "read" | "write" | "search" = "read",
): string | undefined {
  if (!req.fhirAuth?.patientId || !PATIENT_COMPARTMENT_RESOURCES.has(resourceType)) return undefined;
  const scopes = req.fhirAuth.scope;
  const patientGrant = parsedScopes(scopes).some(
    (scope) => scope.context === "patient" && allowsOperation(scope, resourceType, operation),
  );
  if (!patientGrant || hasNonPatientScope(scopes, resourceType, operation)) return undefined;
  return req.fhirAuth.patientId;
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
      `SELECT id, tenant_id, client_id, client_name, scope, expires_at,
              patient_id, user_id
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

    if (typeof tokenData.tenant_id !== "string" || !tokenData.tenant_id.trim()) {
      return res.status(401).json(
        createOperationOutcome("error", "login", "FHIR token is not associated with a tenant")
      );
    }

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
    const scopes = parseScopes(tokenData.scope || "");
    const patientId = tokenData.patient_id || tokenData.patient_context;
    if (hasPatientScope(scopes) && !patientId) {
      await createAuditLog({
        tenantId: tokenData.tenant_id,
        userId: null,
        action: "fhir_auth_failed",
        resourceType: "OAuth",
        severity: "warning",
        status: "failure",
        metadata: {
          reason: "Patient-scoped token is missing launch patient context",
          clientId: tokenData.client_id,
          ip: req.ip,
        },
      });

      return res.status(401).json(
        createOperationOutcome("error", "login", "Patient-scoped access token is missing patient context")
      );
    }

    // Attach FHIR auth context to request
    req.fhirAuth = {
      tenantId: tokenData.tenant_id,
      clientId: tokenData.client_id,
      scope: scopes,
      tokenId: tokenData.id,
      patientId: patientId || undefined,
      userId: tokenData.user_id || undefined,
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
export function requireFHIRScope(resourceType: string, operation: "read" | "write" | "search" = "read") {
  return (req: FHIRAuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.fhirAuth) {
      return res.status(401).json(
        createOperationOutcome("error", "login", "Authentication required")
      );
    }

    const scopes = req.fhirAuth.scope;
    const patientScopeApplies = parsedScopes(scopes).some(
      (scope) => scope.context === "patient" && allowsOperation(scope, resourceType, operation),
    );
    const hasPermission = checkScopePermission(scopes, resourceType, operation);

    // A patient grant is a compartment grant. It cannot be used to access an
    // unrelated resource type, and every such token must carry launch context.
    if (patientScopeApplies && !hasNonPatientScope(scopes, resourceType, operation)) {
      if (!PATIENT_COMPARTMENT_RESOURCES.has(resourceType)) {
        return res.status(403).json(
          createOperationOutcome("error", "forbidden", "Patient-scoped access is not permitted for this resource")
        );
      }
      if (!req.fhirAuth.patientId) {
        return res.status(403).json(
          createOperationOutcome("error", "forbidden", "Patient context is required for patient-scoped access")
        );
      }
      if (!patientContextMatchesRequest(req, req.fhirAuth.patientId, resourceType)) {
        return res.status(403).json(
          createOperationOutcome("error", "forbidden", "Requested patient is outside the token patient context")
        );
      }
    }

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
