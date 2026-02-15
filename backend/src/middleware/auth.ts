import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AuthenticatedRequestUser } from "../types";
import { buildEffectiveRoles, normalizeRoleArray } from "../lib/roles";

export interface AuthedRequest extends Request {
  user?: AuthenticatedRequestUser;
  tenantId?: string;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing token" });
  }
  const token = header.replace("Bearer ", "").trim();
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
    };
    req.tenantId = tenantId;
    return next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}
