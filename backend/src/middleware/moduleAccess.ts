import { NextFunction, Response } from "express";
import { AuthedRequest } from "./auth";
import { type ModuleKey } from "../config/moduleAccess";
import { buildEffectiveRoles } from "../lib/roles";
import { canAccessTenantModule } from "../services/accessSettings";

export function requireModuleAccess(moduleKey: ModuleKey) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthenticated" });
    }

    const roles = buildEffectiveRoles(req.user.role, req.user.roles || req.user.secondaryRoles);
    const tenantId = req.tenantId || req.user.tenantId;
    if (!tenantId || !(await canAccessTenantModule(tenantId, roles as any, moduleKey))) {
      return res.status(403).json({ error: "Insufficient role" });
    }

    return next();
  };
}
