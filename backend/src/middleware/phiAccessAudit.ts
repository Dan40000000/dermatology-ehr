import type { NextFunction, Request, Response } from 'express';
import { createAuditLog } from '../services/audit';
import { logger } from '../lib/logger';

const PHI_ROUTE_PREFIXES = [
  '/api/patients',
  '/api/encounters',
  '/api/notes',
  '/api/documents',
  '/api/photos',
  '/api/diagnoses',
  '/api/vitals',
  '/api/prescriptions',
  '/api/medications',
  '/api/allergies',
  '/api/lab-orders',
  '/api/lab-results',
  '/api/dermpath',
  '/api/ambient',
  '/api/voice',
  '/api/ai-analysis',
  '/api/ai-lesion-analysis',
  '/api/sms',
  '/api/fax',
  '/api/referrals',
  '/api/claims',
  '/api/eligibility',
  '/api/billing',
  '/api/rcm',
  '/api/patient-portal',
  '/api/patient-portal-data',
];

function isPhiRoute(path: string): boolean {
  return PHI_ROUTE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function resourceTypeForPath(path: string): string {
  const [, , resource] = path.split('/');
  return resource ? resource.replace(/-/g, '_') : 'phi';
}

function resourceIdForPath(path: string): string | undefined {
  return path.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)?.[0];
}

function actionForRequest(method: string): string {
  const normalized = method.toUpperCase();
  if (normalized === 'GET') return 'phi_access_view';
  if (normalized === 'POST') return 'phi_access_create';
  if (normalized === 'PUT' || normalized === 'PATCH') return 'phi_access_update';
  if (normalized === 'DELETE') return 'phi_access_delete';
  return 'phi_access';
}

export function phiAccessAuditMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!isPhiRoute(req.path)) {
    next();
    return;
  }

  res.on('finish', () => {
    const authedUser = (req as any).user;
    const portalUser = (req as any).patient;
    const tenantId = authedUser?.tenantId || portalUser?.tenantId || req.header('x-tenant-id');
    if (!tenantId) return;

    const status = res.statusCode >= 200 && res.statusCode < 400 ? 'success' : 'failure';
    createAuditLog({
      tenantId,
      userId: authedUser?.id || portalUser?.accountId || null,
      action: actionForRequest(req.method),
      resourceType: resourceTypeForPath(req.path),
      resourceId: resourceIdForPath(req.path),
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: {
        path: req.path,
        method: req.method,
        statusCode: res.statusCode,
        queryKeys: Object.keys(req.query || {}),
        actorType: authedUser?.id ? 'staff' : portalUser?.accountId ? 'patient_portal' : 'unknown',
      },
      severity: req.method.toUpperCase() === 'GET' ? 'info' : 'warning',
      status,
      requestId: (req as any).requestId,
    }).catch((error) => {
      logger.warn('Failed to write PHI access audit event', {
        error: error instanceof Error ? error.message : 'Unknown error',
        path: req.path,
      });
    });
  });

  next();
}

