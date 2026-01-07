import { NextFunction, Response } from "express";
import { AuthedRequest } from "./auth";
import { canAccessModule, type ModuleKey } from "../config/moduleAccess";

export function requireModuleAccess(moduleKey: ModuleKey) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthenticated" });
    }

    if (!canAccessModule(req.user.role as any, moduleKey)) {
      return res.status(403).json({ error: "Insufficient role" });
    }

    return next();
  };
}
