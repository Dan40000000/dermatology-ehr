import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { env } from "../config/env";
import { rateLimit } from "../middleware/rateLimit";
import { PatientPortalRequest, requirePatientAuth } from "../middleware/patientPortalAuth";
import { validatePasswordPolicy } from "../middleware/security";
import { logger } from "../lib/logger";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string()
    .min(12, "Password must be at least 12 characters")
    .regex(/[a-z]/, "Password must contain lowercase letter")
    .regex(/[A-Z]/, "Password must contain uppercase letter")
    .regex(/[0-9]/, "Password must contain number")
    .regex(/[^a-zA-Z0-9]/, "Password must contain special character"),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dob: z.string(), // ISO date string
  ssnLast4: z.string().length(4).regex(/^\d{4}$/).optional(),
  verificationCode: z.string().length(4).regex(/^\d{4}$/).optional(), // Last 4 of phone or SSN for verification
}).refine((data) => data.ssnLast4 || data.verificationCode, {
  message: "verificationCode or ssnLast4 is required",
  path: ["verificationCode"],
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const verifyEmailSchema = z.object({
  token: z.string().min(10),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: z.string()
    .min(8)
    .regex(/[a-z]/)
    .regex(/[A-Z]/)
    .regex(/[0-9]/)
    .regex(/[^a-zA-Z0-9]/),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12),
});

const messageUnlockSchema = z.object({
  password: z.string().min(1),
});

const updateProfileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  dob: z.string().optional().nullable(),
  dateOfBirth: z.string().optional().nullable(),
  sex: z.string().optional().nullable(),
  gender: z.string().optional().nullable(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().max(2).optional(),
  zip: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactRelationship: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  pharmacyId: z.string().optional().nullable(),
  pharmacyNcpdp: z.string().optional().nullable(),
  pharmacyName: z.string().optional().nullable(),
  pharmacyPhone: z.string().optional().nullable(),
  pharmacyAddress: z.string().optional().nullable(),
});

const communicationPreferencesSchema = z.object({
  appointmentReminders: z.boolean().optional(),
  labResultNotifications: z.boolean().optional(),
  billingAlerts: z.boolean().optional(),
  healthTipsNewsletter: z.boolean().optional(),
  allowEmail: z.boolean().optional(),
  allowSms: z.boolean().optional(),
  allowPhone: z.boolean().optional(),
  allowMail: z.boolean().optional(),
  preferredMethod: z.enum(["email", "sms", "phone", "mail"]).optional(),
});

export const patientPortalRouter = Router();

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

function logPatientPortalError(message: string, error: unknown): void {
  logger.error(message, {
    error: toSafeErrorMessage(error),
  });
}

function normalizeSex(value: unknown): string | null {
  if (typeof value !== "string") return value == null ? null : String(value);
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (["m", "male"].includes(normalized)) return "male";
  if (["f", "female"].includes(normalized)) return "female";
  if (["o", "other", "nonbinary", "non-binary"].includes(normalized)) return "other";
  if (["prefer_not_to_say", "prefer not to say", "unknown", "u"].includes(normalized)) return "prefer_not_to_say";
  return normalized;
}

// Schema for identity verification (Step 1 of registration)
const verifyIdentitySchema = z.object({
  lastName: z.string().min(1),
  dob: z.string(), // ISO date string
  ssnLast4: z.string().length(4).regex(/^\d{4}$/, "Must be exactly 4 digits"),
});

function identityLast4Condition(paramNumber: number): string {
  return `(ssn_last4 = $${paramNumber}
          OR RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '\\D', '', 'g'), 4) = $${paramNumber})`;
}

function identityDobCondition(paramNumber: number): string {
  return `dob BETWEEN ($${paramNumber}::date - INTERVAL '1 day') AND ($${paramNumber}::date + INTERVAL '1 day')`;
}

function selectIdentityMatch<T extends { exactDobMatch: boolean }>(rows: T[]): T | null {
  const exactMatches = rows.filter((row) => row.exactDobMatch);
  if (exactMatches.length > 0) {
    return exactMatches[0] ?? null;
  }

  // Legacy date-only values have occasionally been displayed one day off by timezone conversion.
  // Only accept a near-date match when the patient is still uniquely identified by last4.
  return rows.length === 1 ? rows[0] ?? null : null;
}

/**
 * POST /api/patient-portal/verify-identity
 * Verify patient identity before allowing registration
 * Uses Last Name + DOB + Last 4 of SSN for verification
 *
 * SECURITY NOTE: SSN full values are stored encrypted when available; last 4 is stored separately.
 */
patientPortalRouter.post(
  "/verify-identity",
  rateLimit({ windowMs: 60_000, max: 5 }), // Strict rate limiting for security
  async (req, res) => {
    const tenantId = req.header(env.tenantHeader);
    if (!tenantId) {
      return res.status(400).json({ error: `Missing tenant header: ${env.tenantHeader}` });
    }

    const parsed = verifyIdentitySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { lastName, dob, ssnLast4 } = parsed.data;

    try {
      // Find patient by last name, DOB, and last 4 of SSN or phone.
      // This links to an existing chart without transmitting full SSN.
      const patientResult = await pool.query(
        `SELECT id,
                first_name,
                last_name,
                email,
                dob::text AS dob,
                (dob = $3::date) AS "exactDobMatch"
         FROM patients
         WHERE tenant_id = $1
         AND LOWER(TRIM(last_name)) = LOWER(TRIM($2))
         AND ${identityDobCondition(3)}
         AND ${identityLast4Condition(4)}
         ORDER BY "exactDobMatch" DESC, created_at DESC`,
        [tenantId, lastName, dob, ssnLast4]
      );
      const patient = selectIdentityMatch(patientResult.rows);

      if (!patient) {
        // Log failed verification attempt for security monitoring
        await pool.query(
          `INSERT INTO audit_log (id, tenant_id, action, resource_type, ip_address, user_agent, severity, status, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            crypto.randomUUID(),
            tenantId,
            'patient_portal_verify_identity_failed',
            'patient',
            req.ip,
            req.get('user-agent'),
            'warning',
            'failure',
            JSON.stringify({ lastName, dob, verificationLast4Provided: true })
          ]
        );

        return res.status(400).json({
          error: "Unable to verify your identity. Please check your information or contact the office."
        });
      }

      // Check if patient already has a portal account
      const existingAccount = await pool.query(
        `SELECT id FROM patient_portal_accounts WHERE tenant_id = $1 AND patient_id = $2`,
        [tenantId, patient.id]
      );

      if (existingAccount.rows.length > 0) {
        return res.status(400).json({
          error: "An account already exists for this patient. Please sign in or reset your password."
        });
      }

      // Log successful verification
      await pool.query(
        `INSERT INTO audit_log (id, tenant_id, action, resource_type, resource_id, ip_address, user_agent, severity, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          crypto.randomUUID(),
          tenantId,
          'patient_portal_verify_identity_success',
          'patient',
          patient.id,
          req.ip,
          req.get('user-agent'),
          'info',
          'success'
        ]
      );

      // Return patient info for next step (without sensitive data)
      return res.json({
        verified: true,
        firstName: patient.first_name,
        lastName: patient.last_name,
        email: patient.email, // Pre-fill if available
        dob: patient.dob,
        patientId: patient.id, // Used internally for registration
      });
    } catch (error) {
      logPatientPortalError("Identity verification error", error);
      return res.status(500).json({ error: "Verification failed. Please try again." });
    }
  }
);

/**
 * POST /api/patient-portal/register
 * Register a new patient portal account
 * Requires prior identity verification via verify-identity endpoint
 */
patientPortalRouter.post(
  "/register",
  rateLimit({ windowMs: 60_000, max: 5 }),
  async (req, res) => {
    const tenantId = req.header(env.tenantHeader);
    if (!tenantId) {
      return res.status(400).json({ error: `Missing tenant header: ${env.tenantHeader}` });
    }

    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { email, password, firstName, lastName, dob, ssnLast4, verificationCode } = parsed.data;
    const ssnLast4Value = ssnLast4 ?? verificationCode;

    try {
      // Check if email is already registered
      const existingAccount = await pool.query(
        `SELECT id FROM patient_portal_accounts WHERE tenant_id = $1 AND email = $2`,
        [tenantId, email.toLowerCase()]
      );

      if (existingAccount.rows.length > 0) {
        return res.status(400).json({ error: "Email already registered" });
      }

      // Re-verify patient identity with SSN for security (prevent session hijacking)
      const patientResult = await pool.query(
        `SELECT id,
                first_name,
                last_name,
                email as patient_email,
                dob::text AS dob,
                (dob = $4::date) AS "exactDobMatch"
         FROM patients
         WHERE tenant_id = $1
         AND LOWER(TRIM(first_name)) = LOWER(TRIM($2))
         AND LOWER(TRIM(last_name)) = LOWER(TRIM($3))
         AND ${identityDobCondition(4)}
         ${ssnLast4Value ? `AND ${identityLast4Condition(5)}` : ""}
         ORDER BY "exactDobMatch" DESC, created_at DESC`,
        ssnLast4Value
          ? [tenantId, firstName, lastName, dob, ssnLast4Value]
          : [tenantId, firstName, lastName, dob]
      );
      const patient = selectIdentityMatch(patientResult.rows);

      if (!patient) {
        return res.status(400).json({
          error: "Patient verification failed. Please check your information or contact the office."
        });
      }

      // Hash password (12 rounds for enhanced security)
      const passwordHash = await bcrypt.hash(password, 12);

      // Generate verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const verificationExpires = new Date();
      verificationExpires.setHours(verificationExpires.getHours() + 24); // 24 hour expiry

      // Create account
      const accountId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO patient_portal_accounts (
          id, tenant_id, patient_id, email, password_hash,
          verification_token, verification_token_expires, is_active, email_verified
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          accountId,
          tenantId,
          patient.id,
          email.toLowerCase(),
          passwordHash,
          verificationToken,
          verificationExpires,
          true,
          false // Require email verification
        ]
      );

      // Log account creation
      await pool.query(
        `INSERT INTO audit_log (id, tenant_id, user_id, action, resource_type, resource_id, severity, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          crypto.randomUUID(),
          tenantId,
          null,
          'patient_portal_register',
          'patient_portal_account',
          accountId,
          'info',
          'success'
        ]
      );

      // TODO: Send verification email with token
      // For now, return the token (in production, only send via email)

      return res.status(201).json({
        message: "Account created successfully. Please verify your email.",
        accountId,
        // Remove this in production - only send via email
        verificationToken: env.nodeEnv === 'development' ? verificationToken : undefined
      });
    } catch (error) {
      logPatientPortalError("Registration error", error);
      return res.status(500).json({ error: "Registration failed" });
    }
  }
);

/**
 * POST /api/patient-portal/login
 * Login with email and password
 * Implements account lockout after 5 failed attempts
 */
patientPortalRouter.post(
  "/login",
  rateLimit({ windowMs: 60_000, max: 10 }),
  async (req, res) => {
    const tenantId = req.header(env.tenantHeader);
    if (!tenantId) {
      return res.status(400).json({ error: `Missing tenant header: ${env.tenantHeader}` });
    }

    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { email, password } = parsed.data;

    try {
      // Get account with practice info
      const accountResult = await pool.query(
        `SELECT a.id, a.patient_id, a.email, a.password_hash, a.is_active,
                a.email_verified, a.failed_login_attempts, a.locked_until,
                p.first_name, p.last_name,
                t.practice_phone, t.name as practice_name
         FROM patient_portal_accounts a
         JOIN patients p ON a.patient_id = p.id
         LEFT JOIN tenants t ON a.tenant_id = t.id
         WHERE a.tenant_id = $1 AND a.email = $2`,
        [tenantId, email.toLowerCase()]
      );

      if (accountResult.rows.length === 0) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const account = accountResult.rows[0];

      // Check if account is active
      if (!account.is_active) {
        return res.status(403).json({ error: "Account is inactive. Please contact support." });
      }

      // Check if account is locked
      if (account.locked_until && new Date(account.locked_until) > new Date()) {
        return res.status(403).json({
          error: "Account is temporarily locked due to failed login attempts. Please try again later.",
          lockedUntil: account.locked_until
        });
      }

      // Verify password
      const passwordMatch = await bcrypt.compare(password, account.password_hash);

      if (!passwordMatch) {
        // Increment failed login attempts
        const newFailedAttempts = account.failed_login_attempts + 1;
        const lockAccount = newFailedAttempts >= 5;
        const lockedUntil = lockAccount
          ? new Date(Date.now() + 30 * 60 * 1000) // Lock for 30 minutes
          : null;

        await pool.query(
          `UPDATE patient_portal_accounts
           SET failed_login_attempts = $1,
               locked_until = $2
           WHERE id = $3`,
          [newFailedAttempts, lockedUntil, account.id]
        );

        // Log failed login
        await pool.query(
          `INSERT INTO audit_log (id, tenant_id, user_id, action, resource_type, ip_address, user_agent, severity, status, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            crypto.randomUUID(),
            tenantId,
            null,
            'patient_portal_failed_login',
            'patient_portal_account',
            req.ip,
            req.get('user-agent'),
            'warning',
            'failure',
            JSON.stringify({ accountId: account.id, attempts: newFailedAttempts, locked: lockAccount })
          ]
        );

        if (lockAccount) {
          return res.status(403).json({
            error: "Account locked due to multiple failed login attempts. Please try again in 30 minutes.",
            lockedUntil
          });
        }

        return res.status(401).json({
          error: "Invalid email or password",
          attemptsRemaining: 5 - newFailedAttempts
        });
      }

      // Check email verification
      if (!account.email_verified) {
        return res.status(403).json({
          error: "Please verify your email before logging in",
          requiresVerification: true
        });
      }

      // Reset failed login attempts
      await pool.query(
        `UPDATE patient_portal_accounts
         SET failed_login_attempts = 0,
             locked_until = NULL,
             last_login_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [account.id]
      );

      // Create session token (JWT)
      const sessionToken = jwt.sign(
        {
          accountId: account.id,
          patientId: account.patient_id,
          tenantId: tenantId,
          email: account.email
        },
        env.jwtSecret,
        { expiresIn: '12h' } // 12 hour session
      );

      // Store session in database
      const sessionId = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 12); // 12 hours

      await pool.query(
        `INSERT INTO patient_portal_sessions (
          id, account_id, session_token, ip_address, user_agent, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [sessionId, account.id, sessionToken, req.ip, req.get('user-agent'), expiresAt]
      );

      // Log successful login (non-blocking - don't fail login if audit fails)
      try {
        await pool.query(
          `INSERT INTO audit_log (id, tenant_id, action, resource_type, resource_id, ip_address, user_agent, severity, status, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            crypto.randomUUID(),
            tenantId,
            'patient_portal_login',
            'patient_portal_account',
            account.patient_id,
            req.ip,
            req.get('user-agent'),
            'info',
            'success',
            JSON.stringify({ accountId: account.id, email: account.email })
          ]
        );
      } catch (auditError) {
        console.warn('Failed to log portal login audit:', auditError);
      }

      return res.json({
        sessionToken,
        expiresAt,
        patient: {
          id: account.patient_id,
          firstName: account.first_name,
          lastName: account.last_name,
          email: account.email,
          practicePhone: account.practice_phone || '(555) 123-4567',
          practiceName: account.practice_name || 'Dermatology DEMO Office'
        }
      });
    } catch (error) {
      logPatientPortalError("Login error", error);
      return res.status(500).json({ error: "Login failed" });
    }
  }
);

/**
 * POST /api/patient-portal/logout
 * Logout and invalidate session
 */
patientPortalRouter.post("/logout", requirePatientAuth, async (req: PatientPortalRequest, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "").trim();

  try {
    // Delete session
    await pool.query(
      `DELETE FROM patient_portal_sessions WHERE session_token = $1`,
      [token]
    );

    // Log logout
    await pool.query(
      `INSERT INTO audit_log (id, tenant_id, user_id, action, resource_type, severity, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        crypto.randomUUID(),
        req.patient!.tenantId,
        null,
        'patient_portal_logout',
        'patient_portal_account',
        'info',
        'success'
      ]
    );

    return res.json({ message: "Logged out successfully" });
  } catch (error) {
    logPatientPortalError("Logout error", error);
    return res.status(500).json({ error: "Logout failed" });
  }
});

/**
 * POST /api/patient-portal/verify-email
 * Verify email with token
 */
patientPortalRouter.post(
  "/verify-email",
  rateLimit({ windowMs: 60_000, max: 5 }),
  async (req, res) => {
    const tenantId = req.header(env.tenantHeader);
    if (!tenantId) {
      return res.status(400).json({ error: `Missing tenant header: ${env.tenantHeader}` });
    }

    const parsed = verifyEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { token } = parsed.data;

    try {
      const result = await pool.query(
        `UPDATE patient_portal_accounts
         SET email_verified = true,
             verification_token = NULL,
             verification_token_expires = NULL
         WHERE tenant_id = $1
         AND verification_token = $2
         AND verification_token_expires > CURRENT_TIMESTAMP
         RETURNING id`,
        [tenantId, token]
      );

      if (result.rows.length === 0) {
        return res.status(400).json({ error: "Invalid or expired verification token" });
      }

      return res.json({ message: "Email verified successfully" });
    } catch (error) {
      logPatientPortalError("Email verification error", error);
      return res.status(500).json({ error: "Email verification failed" });
    }
  }
);

/**
 * POST /api/patient-portal/forgot-password
 * Request password reset
 */
patientPortalRouter.post(
  "/forgot-password",
  rateLimit({ windowMs: 60_000, max: 3 }),
  async (req, res) => {
    const tenantId = req.header(env.tenantHeader);
    if (!tenantId) {
      return res.status(400).json({ error: `Missing tenant header: ${env.tenantHeader}` });
    }

    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { email } = parsed.data;

    try {
      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetExpires = new Date();
      resetExpires.setHours(resetExpires.getHours() + 1); // 1 hour expiry

      const result = await pool.query(
        `UPDATE patient_portal_accounts
         SET reset_token = $1,
             reset_token_expires = $2
         WHERE tenant_id = $3 AND email = $4
         RETURNING id`,
        [resetToken, resetExpires, tenantId, email.toLowerCase()]
      );

      // Always return success even if email doesn't exist (security best practice)
      // TODO: Send reset email with token

      return res.json({
        message: "If an account exists with this email, a password reset link has been sent.",
        // Remove this in production - only send via email
        resetToken: env.nodeEnv === 'development' && result.rows.length > 0 ? resetToken : undefined
      });
    } catch (error) {
      logPatientPortalError("Forgot password error", error);
      return res.status(500).json({ error: "Password reset request failed" });
    }
  }
);

/**
 * POST /api/patient-portal/reset-password
 * Reset password with token
 */
patientPortalRouter.post(
  "/reset-password",
  rateLimit({ windowMs: 60_000, max: 5 }),
  async (req, res) => {
    const tenantId = req.header(env.tenantHeader);
    if (!tenantId) {
      return res.status(400).json({ error: `Missing tenant header: ${env.tenantHeader}` });
    }

    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { token, password } = parsed.data;

    try {
      // Hash new password (12 rounds for enhanced security)
      const passwordHash = await bcrypt.hash(password, 12);

      const result = await pool.query(
        `UPDATE patient_portal_accounts
         SET password_hash = $1,
             reset_token = NULL,
             reset_token_expires = NULL,
             failed_login_attempts = 0,
             locked_until = NULL
         WHERE tenant_id = $2
         AND reset_token = $3
         AND reset_token_expires > CURRENT_TIMESTAMP
         RETURNING id, patient_id`,
        [passwordHash, tenantId, token]
      );

      if (result.rows.length === 0) {
        return res.status(400).json({ error: "Invalid or expired reset token" });
      }

      const account = result.rows[0];

      // Log password reset
      await pool.query(
        `INSERT INTO audit_log (id, tenant_id, user_id, action, resource_type, resource_id, severity, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          crypto.randomUUID(),
          tenantId,
          null,
          'patient_portal_password_reset',
          'patient_portal_account',
          account.patient_id,
          'info',
          'success'
        ]
      );

      return res.json({ message: "Password reset successfully" });
    } catch (error) {
      logPatientPortalError("Password reset error", error);
      return res.status(500).json({ error: "Password reset failed" });
    }
  }
);

/**
 * GET /api/patient-portal/me
 * Get current patient info
 */
patientPortalRouter.get("/me", requirePatientAuth, async (req: PatientPortalRequest, res) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.first_name as "firstName", p.last_name as "lastName",
              p.dob, p.sex, p.phone, p.email, p.address, p.city, p.state, p.zip,
              p.emergency_contact_name as "emergencyContactName",
              p.emergency_contact_relationship as "emergencyContactRelationship",
              p.emergency_contact_phone as "emergencyContactPhone",
              p.pharmacy_id as "pharmacyId",
              p.pharmacy_ncpdp as "pharmacyNcpdp",
              p.pharmacy_name as "pharmacyName",
              p.pharmacy_phone as "pharmacyPhone",
              p.pharmacy_address as "pharmacyAddress",
              p.insurance, a.email as "portalEmail", a.last_login_at as "lastLogin",
              a.email_verified as "emailVerified", a.updated_at as "passwordUpdatedAt"
       FROM patients p
       JOIN patient_portal_accounts a ON p.id = a.patient_id
       WHERE p.id = $1 AND p.tenant_id = $2`,
      [req.patient!.patientId, req.patient!.tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Patient not found" });
    }

    return res.json({ patient: result.rows[0] });
  } catch (error) {
    logPatientPortalError("Get patient error", error);
    return res.status(500).json({ error: "Failed to get patient information" });
  }
});

/**
 * POST /api/patient-portal/security/change-password
 * Change current patient's portal password
 */
patientPortalRouter.post("/security/change-password", requirePatientAuth, async (req: PatientPortalRequest, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  const passwordValidation = validatePasswordPolicy(parsed.data.newPassword);
  if (!passwordValidation.isValid) {
    return res.status(400).json({ error: "Password does not meet requirements", details: passwordValidation.errors });
  }

  try {
    const accountResult = await pool.query(
      `SELECT id, password_hash
       FROM patient_portal_accounts
       WHERE id = $1 AND tenant_id = $2 AND patient_id = $3`,
      [req.patient!.accountId, req.patient!.tenantId, req.patient!.patientId]
    );

    if (accountResult.rows.length === 0) {
      return res.status(404).json({ error: "Portal account not found" });
    }

    const account = accountResult.rows[0];
    const currentPasswordMatches = await bcrypt.compare(parsed.data.currentPassword, account.password_hash);
    if (!currentPasswordMatches) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    const samePassword = await bcrypt.compare(parsed.data.newPassword, account.password_hash);
    if (samePassword) {
      return res.status(400).json({ error: "New password must be different from your current password" });
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    await pool.query(
      `UPDATE patient_portal_accounts
       SET password_hash = $1,
           failed_login_attempts = 0,
           locked_until = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND tenant_id = $3`,
      [passwordHash, req.patient!.accountId, req.patient!.tenantId]
    );

    await pool.query(
      `INSERT INTO audit_log (id, tenant_id, user_id, action, resource_type, resource_id, severity, status, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        crypto.randomUUID(),
        req.patient!.tenantId,
        null,
        'patient_portal_password_change',
        'patient_portal_account',
        req.patient!.accountId,
        'info',
        'success',
        JSON.stringify({ accountId: req.patient!.accountId, patientId: req.patient!.patientId })
      ]
    );

    return res.json({ message: "Password changed successfully" });
  } catch (error) {
    logPatientPortalError("Change password error", error);
    return res.status(500).json({ error: "Failed to change password" });
  }
});

/**
 * POST /api/patient-portal/security/message-unlock
 * Step-up verification for secure portal messages.
 */
patientPortalRouter.post(
  "/security/message-unlock",
  requirePatientAuth,
  rateLimit({ windowMs: 60_000, max: 5 }),
  async (req: PatientPortalRequest, res) => {
    const parsed = messageUnlockSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    try {
      const accountResult = await pool.query(
        `SELECT id, password_hash
         FROM patient_portal_accounts
         WHERE id = $1 AND tenant_id = $2 AND patient_id = $3`,
        [req.patient!.accountId, req.patient!.tenantId, req.patient!.patientId]
      );

      if (accountResult.rows.length === 0) {
        return res.status(404).json({ error: "Portal account not found" });
      }

      const account = accountResult.rows[0];
      const passwordMatches = await bcrypt.compare(parsed.data.password, account.password_hash);
      if (!passwordMatches) {
        await pool.query(
          `INSERT INTO audit_log (id, tenant_id, user_id, action, resource_type, resource_id, ip_address, user_agent, severity, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            crypto.randomUUID(),
            req.patient!.tenantId,
            null,
            "patient_portal_message_unlock_failed",
            "patient_portal_account",
            req.patient!.accountId,
            req.ip,
            req.get("user-agent"),
            "warning",
            "failure",
          ]
        );
        return res.status(403).json({ error: "Password is incorrect" });
      }

      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      const unlockToken = jwt.sign(
        {
          purpose: "portal_messages_unlock",
          accountId: req.patient!.accountId,
          patientId: req.patient!.patientId,
          tenantId: req.patient!.tenantId,
        },
        env.jwtSecret,
        { expiresIn: "10m" }
      );

      await pool.query(
        `INSERT INTO audit_log (id, tenant_id, user_id, action, resource_type, resource_id, ip_address, user_agent, severity, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          crypto.randomUUID(),
          req.patient!.tenantId,
          null,
          "patient_portal_message_unlock",
          "patient_portal_account",
          req.patient!.accountId,
          req.ip,
          req.get("user-agent"),
          "info",
          "success",
        ]
      );

      return res.json({
        message: "Secure messages unlocked",
        unlockToken,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error) {
      logPatientPortalError("Message unlock error", error);
      return res.status(500).json({ error: "Failed to unlock secure messages" });
    }
  }
);

/**
 * PUT /api/patient-portal/me
 * Update patient profile (limited fields)
 */
patientPortalRouter.put("/me", requirePatientAuth, async (req: PatientPortalRequest, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  try {
    // Build dynamic update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    const fieldColumns: Record<string, string> = {
      firstName: "first_name",
      lastName: "last_name",
      dob: "dob",
      dateOfBirth: "dob",
      sex: "sex",
      gender: "sex",
      emergencyContactName: "emergency_contact_name",
      emergencyContactRelationship: "emergency_contact_relationship",
      emergencyContactPhone: "emergency_contact_phone",
      pharmacyId: "pharmacy_id",
      pharmacyNcpdp: "pharmacy_ncpdp",
      pharmacyName: "pharmacy_name",
      pharmacyPhone: "pharmacy_phone",
      pharmacyAddress: "pharmacy_address",
    };

    Object.entries(parsed.data).forEach(([key, value]) => {
      if (value !== undefined) {
        const dbKey = fieldColumns[key] || key.replace(/([A-Z])/g, '_$1').toLowerCase();
        updates.push(`${dbKey} = $${paramIndex}`);
        values.push(dbKey === "sex" ? normalizeSex(value) : value);
        paramIndex++;
      }
    });

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // Add tenant_id and patient_id to values
    values.push(req.patient!.tenantId, req.patient!.patientId);

    const query = `
      UPDATE patients
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = $${paramIndex} AND id = $${paramIndex + 1}
      RETURNING id
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // Log profile update
    await pool.query(
      `INSERT INTO audit_log (id, tenant_id, user_id, action, resource_type, resource_id, severity, status, changes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        crypto.randomUUID(),
        req.patient!.tenantId,
        null,
        'patient_portal_profile_update',
        'patient',
        req.patient!.patientId,
        'info',
        'success',
        JSON.stringify({ fields: Object.keys(parsed.data) })
      ]
    );

    return res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    logPatientPortalError("Update profile error", error);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});

/**
 * GET /api/patient-portal/preferences
 * Get patient communication preferences
 */
patientPortalRouter.get("/preferences", requirePatientAuth, async (req: PatientPortalRequest, res) => {
  try {
    const result = await pool.query(
      `SELECT appointment_reminders as "appointmentReminders",
              lab_result_notifications as "labResultNotifications",
              billing_alerts as "billingAlerts",
              health_tips_newsletter as "healthTipsNewsletter",
              allow_email as "allowEmail",
              allow_sms as "allowSms",
              allow_phone as "allowPhone",
              allow_mail as "allowMail",
              preferred_method as "preferredMethod"
       FROM patient_communication_preferences
       WHERE tenant_id = $1 AND patient_id = $2
       ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
       LIMIT 1`,
      [req.patient!.tenantId, req.patient!.patientId],
    );

    return res.json({
      preferences: {
        appointmentReminders: result.rows[0]?.appointmentReminders ?? true,
        labResultNotifications: result.rows[0]?.labResultNotifications ?? true,
        billingAlerts: result.rows[0]?.billingAlerts ?? true,
        healthTipsNewsletter: result.rows[0]?.healthTipsNewsletter ?? false,
        allowEmail: result.rows[0]?.allowEmail ?? true,
        allowSms: result.rows[0]?.allowSms ?? true,
        allowPhone: result.rows[0]?.allowPhone ?? true,
        allowMail: result.rows[0]?.allowMail ?? true,
        preferredMethod: result.rows[0]?.preferredMethod ?? "email",
      },
    });
  } catch (error) {
    logPatientPortalError("Get patient preferences error", error);
    return res.status(500).json({ error: "Failed to get communication preferences" });
  }
});

/**
 * PUT /api/patient-portal/preferences
 * Update patient communication preferences
 */
patientPortalRouter.put("/preferences", requirePatientAuth, async (req: PatientPortalRequest, res) => {
  const parsed = communicationPreferencesSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  try {
    const data = {
      appointmentReminders: parsed.data.appointmentReminders ?? true,
      labResultNotifications: parsed.data.labResultNotifications ?? true,
      billingAlerts: parsed.data.billingAlerts ?? true,
      healthTipsNewsletter: parsed.data.healthTipsNewsletter ?? false,
      allowEmail: parsed.data.allowEmail ?? true,
      allowSms: parsed.data.allowSms ?? true,
      allowPhone: parsed.data.allowPhone ?? true,
      allowMail: parsed.data.allowMail ?? true,
      preferredMethod: parsed.data.preferredMethod ?? "email",
    };

    const updateResult = await pool.query(
      `UPDATE patient_communication_preferences
       SET appointment_reminders = $1,
           lab_result_notifications = $2,
           billing_alerts = $3,
           health_tips_newsletter = $4,
           allow_email = $5,
           allow_sms = $6,
           allow_phone = $7,
           allow_mail = $8,
           preferred_method = $9,
           updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = $10 AND patient_id = $11
       RETURNING id`,
      [
        data.appointmentReminders,
        data.labResultNotifications,
        data.billingAlerts,
        data.healthTipsNewsletter,
        data.allowEmail,
        data.allowSms,
        data.allowPhone,
        data.allowMail,
        data.preferredMethod,
        req.patient!.tenantId,
        req.patient!.patientId,
      ],
    );

    if (updateResult.rowCount === 0) {
      await pool.query(
        `INSERT INTO patient_communication_preferences (
           id, tenant_id, patient_id, appointment_reminders, lab_result_notifications,
           billing_alerts, health_tips_newsletter, allow_email, allow_sms,
           allow_phone, allow_mail, preferred_method
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          crypto.randomUUID(),
          req.patient!.tenantId,
          req.patient!.patientId,
          data.appointmentReminders,
          data.labResultNotifications,
          data.billingAlerts,
          data.healthTipsNewsletter,
          data.allowEmail,
          data.allowSms,
          data.allowPhone,
          data.allowMail,
          data.preferredMethod,
        ],
      );
    }

    return res.json({ preferences: data });
  } catch (error) {
    logPatientPortalError("Update patient preferences error", error);
    return res.status(500).json({ error: "Failed to update communication preferences" });
  }
});

/**
 * GET /api/patient-portal/activity
 * Get account activity log
 */
patientPortalRouter.get("/activity", requirePatientAuth, async (req: PatientPortalRequest, res) => {
  try {
    const result = await pool.query(
      `SELECT action, resource_type as "resourceType", ip_address as "ipAddress",
              created_at as "createdAt", status, metadata
       FROM audit_log
       WHERE tenant_id = $1
       AND (user_id = $2 OR resource_id = $3)
       AND resource_type LIKE 'patient%'
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.patient!.tenantId, req.patient!.accountId, req.patient!.patientId]
    );

    return res.json({ activity: result.rows });
  } catch (error) {
    logPatientPortalError("Get activity error", error);
    return res.status(500).json({ error: "Failed to get activity log" });
  }
});
