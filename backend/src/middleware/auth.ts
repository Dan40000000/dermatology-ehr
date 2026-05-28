import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AuthenticatedRequestUser } from "../types";
import { buildEffectiveRoles, normalizeRoleArray } from "../lib/roles";
import { isCookieAuthPlaceholder, STAFF_ACCESS_COOKIE } from "../auth/cookies";

export interface AuthedRequest extends Request {
  user?: AuthenticatedRequestUser;
  tenantId?: string;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const bearerToken = header?.startsWith("Bearer ") ? header.replace("Bearer ", "").trim() : "";
  const cookieToken = req.cookies?.[STAFF_ACCESS_COOKIE];
  const token = bearerToken && !isCookieAuthPlaceholder(bearerToken) ? bearerToken : cookieToken;

  if (!token) {
    return res.status(401).json({ error: "Missing token" });
  }

  try {
    const decoded = jwt.verify(token, env.jwtSecret) as AuthenticatedRequestUser;
    const tenantId = req.header(env.tenantHeader);
    if (!tenantId || tenantId !== decoded.tenantId) {
      return res.status(403).json({ error: "Invalid tenant" });
    }

    const secondaryRoles = normalizeRoleArray(decoded.secondaryRoles);
    const roles = buildEffectiveRoles(decoded.role, decoded.roles || secondaryRoles);

    req.user = {
      ...decoded,
      secondaryRoles,
      roles,
      passwordResetRequired: Boolean(decoded.passwordResetRequired),
    };
    req.tenantId = tenantId;

    const originalUrl = req.originalUrl || req.path;
    const passwordResetAllowed =
      originalUrl.includes("/api/auth/me") ||
      originalUrl.includes("/api/auth/refresh") ||
      originalUrl.includes("/api/auth/logout") ||
      originalUrl.includes("/api/auth/change-password");
    if (req.user.passwordResetRequired && !passwordResetAllowed) {
      return res.status(403).json({
        error: "Password reset required",
        passwordResetRequired: true,
      });
    }

    return next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}
