/**
 * Notification Rate Limiting Middleware
 *
 * Implements rate limiting for notification endpoints (SMS, Email)
 * to prevent abuse and ensure HIPAA compliance
 */

import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import { createAuditLog } from '../services/audit';

/**
 * Store for tracking notification counts per patient
 */
interface NotificationCount {
  patientId: string;
  tenantId: string;
  type: 'sms' | 'email';
  count: number;
  windowStart: Date;
}

const notificationCounts = new Map<string, NotificationCount>();

/**
 * Get count key for a patient/tenant/type combination
 */
function getCountKey(tenantId: string, patientId: string, type: 'sms' | 'email'): string {
  return `${tenantId}:${patientId}:${type}`;
}

/**
 * Clean up old entries from the notification counts map
 */
function cleanupOldEntries() {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;

  for (const [key, value] of notificationCounts.entries()) {
    if (value.windowStart.getTime() < oneHourAgo) {
      notificationCounts.delete(key);
    }
  }
}

// Clean up every 5 minutes
const cleanupInterval = setInterval(cleanupOldEntries, 5 * 60 * 1000);
cleanupInterval.unref();

/**
 * Check if patient has exceeded notification rate limit
 */
export async function checkPatientNotificationLimit(
  tenantId: string,
  patientId: string,
  type: 'sms' | 'email',
  limit: number = 100,
  windowMs: number = 60 * 60 * 1000 // 1 hour default
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const key = getCountKey(tenantId, patientId, type);
  const now = new Date();

  let count = notificationCounts.get(key);

  // Initialize or reset if window expired
  if (!count || now.getTime() - count.windowStart.getTime() > windowMs) {
    count = {
      patientId,
      tenantId,
      type,
      count: 0,
      windowStart: now,
    };
    notificationCounts.set(key, count);
  }

  const allowed = count.count < limit;
  const remaining = Math.max(0, limit - count.count);
  const resetAt = new Date(count.windowStart.getTime() + windowMs);

  return { allowed, remaining, resetAt };
}

/**
 * Increment notification count for a patient
 */
export async function incrementPatientNotificationCount(
  tenantId: string,
  patientId: string,
  type: 'sms' | 'email'
): Promise<void> {
  const key = getCountKey(tenantId, patientId, type);
  const count = notificationCounts.get(key);

  if (count) {
    count.count++;
  } else {
    notificationCounts.set(key, {
      patientId,
      tenantId,
      type,
      count: 1,
      windowStart: new Date(),
    });
  }
}

/**
 * Log rate limit event to audit log
 */
async function logRateLimitEvent(
  tenantId: string,
  userId: string | undefined,
  patientId: string,
  type: 'sms' | 'email',
  ipAddress?: string
): Promise<void> {
  try {
    await createAuditLog({
      tenantId,
      userId: userId || null,
      action: 'notification_rate_limit_exceeded',
      resourceType: type,
      resourceId: patientId,
      ipAddress,
      metadata: {
        patientId,
        notificationType: type,
        reason: 'rate_limit_exceeded',
      },
      severity: 'warning',
      status: 'failure',
    });

    logger.warn('Notification rate limit exceeded', {
      tenantId,
      userId,
      patientId,
      type,
    });
  } catch (error: any) {
    logger.error('Failed to log rate limit event', {
      error: error.message,
      tenantId,
      patientId,
      type,
    });
  }
}

/**
 * SMS Rate Limiter - 100 SMS per patient per hour
 */
export const smsRateLimiter = async (req: Request, res: Response, next: Function) => {
  try {
    const tenantId = (req as any).user?.tenantId || req.headers['x-tenant-id'] as string;
    const userId = (req as any).user?.id;
    const patientId = req.body.patientId || req.params.patientId;

    if (!tenantId || !patientId) {
      // If we can't identify tenant or patient, allow through
      // (will be caught by auth middleware)
      return next();
    }

    const limit = 100; // 100 SMS per hour per patient
    const { allowed, remaining, resetAt } = await checkPatientNotificationLimit(
      tenantId,
      patientId,
      'sms',
      limit
    );

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', limit.toString());
    res.setHeader('X-RateLimit-Remaining', remaining.toString());
    res.setHeader('X-RateLimit-Reset', resetAt.toISOString());

    if (!allowed) {
      await logRateLimitEvent(tenantId, userId, patientId, 'sms', req.ip);

      return res.status(429).json({
        error: 'SMS rate limit exceeded for this patient',
        limit,
        resetAt: resetAt.toISOString(),
        message: `Maximum ${limit} SMS messages per hour per patient. Please try again later.`,
      });
    }

    // Increment count after successful check
    await incrementPatientNotificationCount(tenantId, patientId, 'sms');

    next();
  } catch (error: any) {
    logger.error('Error in SMS rate limiter', { error: error.message });
    // On error, allow through to prevent blocking legitimate requests
    next();
  }
};

/**
 * Email Rate Limiter - 100 emails per patient per hour
 */
export const emailRateLimiter = async (req: Request, res: Response, next: Function) => {
  try {
    const tenantId = (req as any).user?.tenantId || req.headers['x-tenant-id'] as string;
    const userId = (req as any).user?.id;
    const patientId = req.body.patientId || req.params.patientId;

    if (!tenantId || !patientId) {
      // If we can't identify tenant or patient, allow through
      return next();
    }

    const limit = 100; // 100 emails per hour per patient
    const { allowed, remaining, resetAt } = await checkPatientNotificationLimit(
      tenantId,
      patientId,
      'email',
      limit
    );

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', limit.toString());
    res.setHeader('X-RateLimit-Remaining', remaining.toString());
    res.setHeader('X-RateLimit-Reset', resetAt.toISOString());

    if (!allowed) {
      await logRateLimitEvent(tenantId, userId, patientId, 'email', req.ip);

      return res.status(429).json({
        error: 'Email rate limit exceeded for this patient',
        limit,
        resetAt: resetAt.toISOString(),
        message: `Maximum ${limit} emails per hour per patient. Please try again later.`,
      });
    }

    // Increment count after successful check
    await incrementPatientNotificationCount(tenantId, patientId, 'email');

    next();
  } catch (error: any) {
    logger.error('Error in email rate limiter', { error: error.message });
    // On error, allow through to prevent blocking legitimate requests
    next();
  }
};

/**
 * Bulk notification rate limiter - stricter limits for bulk sends
 */
export const bulkNotificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 bulk sends per hour per user
  skipSuccessfulRequests: false,
  message: 'Bulk notification rate limit exceeded. Maximum 10 bulk sends per hour.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: async (req: Request, res: Response) => {
    const tenantId = (req as any).user?.tenantId;
    const userId = (req as any).user?.id;

    if (tenantId && userId) {
      await createAuditLog({
        tenantId,
        userId,
        action: 'bulk_notification_rate_limit_exceeded',
        resourceType: 'notification',
        ipAddress: req.ip,
        metadata: {
          endpoint: req.path,
          method: req.method,
        },
        severity: 'warning',
        status: 'failure',
      });
    }

    res.status(429).json({
      error: 'Bulk notification rate limit exceeded',
      message: 'Maximum 10 bulk notification sends per hour. Please try again later.',
    });
  },
});

/**
 * Get current notification stats for a patient
 */
export async function getPatientNotificationStats(
  tenantId: string,
  patientId: string
): Promise<{
  sms: { count: number; limit: number; remaining: number; resetAt: Date };
  email: { count: number; limit: number; remaining: number; resetAt: Date };
}> {
  const smsLimit = 100;
  const emailLimit = 100;

  const smsStatus = await checkPatientNotificationLimit(tenantId, patientId, 'sms', smsLimit);
  const emailStatus = await checkPatientNotificationLimit(tenantId, patientId, 'email', emailLimit);

  const smsKey = getCountKey(tenantId, patientId, 'sms');
  const emailKey = getCountKey(tenantId, patientId, 'email');

  const smsCount = notificationCounts.get(smsKey)?.count || 0;
  const emailCount = notificationCounts.get(emailKey)?.count || 0;

  return {
    sms: {
      count: smsCount,
      limit: smsLimit,
      remaining: smsStatus.remaining,
      resetAt: smsStatus.resetAt,
    },
    email: {
      count: emailCount,
      limit: emailLimit,
      remaining: emailStatus.remaining,
      resetAt: emailStatus.resetAt,
    },
  };
}
