import { NextFunction, Response } from "express";
import { AuthedRequest } from "./auth";
import { buildEffectiveRoles } from "../lib/roles";

export function requireRoles(roles: string[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Unauthenticated" });
    const effectiveRoles = buildEffectiveRoles(req.user.role, req.user.roles || req.user.secondaryRoles);
    if (!roles.some((role) => effectiveRoles.includes(role))) {
      return res.status(403).json({ error: "Insufficient role" });
    }
    return next();
  };
}
