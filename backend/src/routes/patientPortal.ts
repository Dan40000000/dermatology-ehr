import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { env } from "../config/env";
import { rateLimit } from "../middleware/rateLimit";
import { PatientPortalRequest, requirePatientAuth } from "../middleware/patientPortalAuth";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[a-z]/, "Password must contain lowercase letter")
    .regex(/[A-Z]/, "Password must contain uppercase letter")
    .regex(/[0-9]/, "Password must contain number")
    .regex(/[^a-zA-Z0-9]/, "Password must contain special character"),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dob: z.string(), // ISO date string
  verificationCode: z.string().optional(), // Last 4 of phone or SSN for verification
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

const updateProfileSchema = z.object({
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().max(2).optional(),
  zip: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactRelationship: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
});

export const patientPortalRouter = Router();

/**
 * POST /api/patient-portal/register
 * Register a new patient portal account
 * Requires patient verification (matching DOB and last name)
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

    const { email, password, firstName, lastName, dob } = parsed.data;

    try {
      // Check if email is already registered
      const existingAccount = await pool.query(
        `SELECT id FROM patient_portal_accounts WHERE tenant_id = $1 AND email = $2`,
        [tenantId, email.toLowerCase()]
      );

      if (existingAccount.rows.length > 0) {
        return res.status(400).json({ error: "Email already registered" });
      }

      // Find patient by name and DOB for verification
      const patientResult = await pool.query(
        `SELECT id, first_name, last_name, email as patient_email
         FROM patients
         WHERE tenant_id = $1
         AND LOWER(first_name) = LOWER($2)
         AND LOWER(last_name) = LOWER($3)
         AND dob = $4`,
        [tenantId, firstName, lastName, dob]
      );

      if (patientResult.rows.length === 0) {
        return res.status(400).json({
          error: "Patient verification failed. Please check your information or contact the office."
        });
      }

      const patient = patientResult.rows[0];

      // Hash password (10 rounds for HIPAA compliance)
      const passwordHash = await bcrypt.hash(password, 10);

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
          accountId,
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
      console.error("Registration error:", error);
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
      // Get account
      const accountResult = await pool.query(
        `SELECT a.id, a.patient_id, a.email, a.password_hash, a.is_active,
                a.email_verified, a.failed_login_attempts, a.locked_until,
                p.first_name, p.last_name
         FROM patient_portal_accounts a
         JOIN patients p ON a.patient_id = p.id
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
            account.id,
            'patient_portal_failed_login',
            'patient_portal_account',
            req.ip,
            req.get('user-agent'),
            'warning',
            'failure',
            JSON.stringify({ attempts: newFailedAttempts, locked: lockAccount })
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
             last_login = CURRENT_TIMESTAMP
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

      // Log successful login
      await pool.query(
        `INSERT INTO audit_log (id, tenant_id, user_id, action, resource_type, resource_id, ip_address, user_agent, severity, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          crypto.randomUUID(),
          tenantId,
          account.id,
          'patient_portal_login',
          'patient_portal_account',
          account.patient_id,
          req.ip,
          req.get('user-agent'),
          'info',
          'success'
        ]
      );

      return res.json({
        sessionToken,
        expiresAt,
        patient: {
          id: account.patient_id,
          firstName: account.first_name,
          lastName: account.last_name,
          email: account.email
        }
      });
    } catch (error) {
      console.error("Login error:", error);
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
        req.patient!.accountId,
        'patient_portal_logout',
        'patient_portal_account',
        'info',
        'success'
      ]
    );

    return res.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
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
      console.error("Email verification error:", error);
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
      console.error("Forgot password error:", error);
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
      // Hash new password
      const passwordHash = await bcrypt.hash(password, 10);

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
          account.id,
          'patient_portal_password_reset',
          'patient_portal_account',
          account.patient_id,
          'info',
          'success'
        ]
      );

      return res.json({ message: "Password reset successfully" });
    } catch (error) {
      console.error("Password reset error:", error);
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
              p.dob, p.phone, p.email, p.address, p.city, p.state, p.zip,
              p.emergency_contact_name as "emergencyContactName",
              p.emergency_contact_relationship as "emergencyContactRelationship",
              p.emergency_contact_phone as "emergencyContactPhone",
              p.insurance, a.email as "portalEmail", a.last_login as "lastLogin"
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
    console.error("Get patient error:", error);
    return res.status(500).json({ error: "Failed to get patient information" });
  }
});

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

    Object.entries(parsed.data).forEach(([key, value]) => {
      if (value !== undefined) {
        // Convert camelCase to snake_case
        const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        updates.push(`${dbKey} = $${paramIndex}`);
        values.push(value);
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
        req.patient!.accountId,
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
    console.error('Update profile error:', error);
    return res.status(500).json({ error: 'Failed to update profile' });
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
    console.error("Get activity error:", error);
    return res.status(500).json({ error: "Failed to get activity log" });
  }
});
