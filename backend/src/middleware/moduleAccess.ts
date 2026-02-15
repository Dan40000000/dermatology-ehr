import { NextFunction, Response } from "express";
import { AuthedRequest } from "./auth";
import { canAccessModule, type ModuleKey } from "../config/moduleAccess";
import { buildEffectiveRoles } from "../lib/roles";

export function requireModuleAccess(moduleKey: ModuleKey) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthenticated" });
    }

    const roles = buildEffectiveRoles(req.user.role, req.user.roles || req.user.secondaryRoles);
    if (!canAccessModule(roles as any, moduleKey)) {
      return res.status(403).json({ error: "Insufficient role" });
    }

    return next();
  };
}
