import { Router } from "express";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import {
  getTenantAccessSettings,
  saveTenantAccessSettings,
} from "../services/accessSettings";

export const accessSettingsRouter = Router();

accessSettingsRouter.use(requireAuth);

accessSettingsRouter.get("/", async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId || req.user?.tenantId;
  if (!tenantId) {
    return res.status(403).json({ error: "Missing tenant" });
  }

  const settings = await getTenantAccessSettings(tenantId);
  return res.json(settings);
});

accessSettingsRouter.put("/", requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId || req.user?.tenantId;
  if (!tenantId) {
    return res.status(403).json({ error: "Missing tenant" });
  }

  const settings = await saveTenantAccessSettings(tenantId, req.user!.id, {
    moduleAccess: req.body?.moduleAccess,
    commandCenterAccess: req.body?.commandCenterAccess,
  });

  return res.json(settings);
});
