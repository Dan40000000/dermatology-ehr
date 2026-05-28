import { Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AuthenticatedRequestUser } from "../types";
import { logger } from "../lib/logger";
import { buildEffectiveRoles, normalizeRoleArray } from "../lib/roles";
import { isCookieAuthPlaceholder, STAFF_ACCESS_COOKIE } from "../auth/cookies";

export interface AuthenticatedSocket extends Socket {
  user?: AuthenticatedRequestUser;
  tenantId?: string;
}

function parseCookieHeader(header: string | string[] | undefined): Record<string, string> {
  const raw = Array.isArray(header) ? header.join(";") : header || "";
  return raw.split(";").reduce<Record<string, string>>((acc, part) => {
    const index = part.indexOf("=");
    if (index === -1) return acc;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

/**
 * Middleware to authenticate WebSocket connections via JWT
 * Expects token in handshake auth.token field
 * Also validates tenant ID from handshake auth.tenantId
 */
export function authenticateSocket(socket: AuthenticatedSocket, next: (err?: Error) => void) {
  try {
    const authToken = typeof socket.handshake.auth.token === "string" ? socket.handshake.auth.token : "";
    const cookies = parseCookieHeader(socket.handshake.headers?.cookie);
    const token = authToken && !isCookieAuthPlaceholder(authToken) ? authToken : cookies[STAFF_ACCESS_COOKIE];
    const tenantId = socket.handshake.auth.tenantId;

    if (!token) {
      logger.warn("WebSocket connection attempted without token", {
        socketId: socket.id,
      });
      return next(new Error("Authentication token required"));
    }

    if (!tenantId) {
      logger.warn("WebSocket connection attempted without tenant ID", {
        socketId: socket.id,
      });
      return next(new Error("Tenant ID required"));
    }

    // Verify JWT token
    const decoded = jwt.verify(token, env.jwtSecret) as AuthenticatedRequestUser;

    // Validate tenant ID matches token
    if (decoded.tenantId !== tenantId) {
      logger.warn("WebSocket connection attempted with mismatched tenant ID", {
        socketId: socket.id,
        tokenTenantId: decoded.tenantId,
        providedTenantId: tenantId,
      });
      return next(new Error("Invalid tenant ID"));
    }

    if (decoded.passwordResetRequired) {
      logger.warn("WebSocket connection blocked until password reset", {
        socketId: socket.id,
        userId: decoded.id,
        tenantId: decoded.tenantId,
      });
      return next(new Error("Password reset required"));
    }

    // Attach user info to socket
    socket.user = {
      ...decoded,
      secondaryRoles: normalizeRoleArray(decoded.secondaryRoles),
      roles: buildEffectiveRoles(decoded.role, decoded.roles || decoded.secondaryRoles),
    };
    socket.tenantId = tenantId;

    logger.info("WebSocket authenticated", {
      socketId: socket.id,
      userId: decoded.id,
      tenantId: decoded.tenantId,
      role: decoded.role,
      roles: socket.user.roles,
    });

    next();
  } catch (err: any) {
    logger.error("WebSocket authentication failed", {
      socketId: socket.id,
      error: err.message,
    });
    next(new Error("Invalid authentication token"));
  }
}
