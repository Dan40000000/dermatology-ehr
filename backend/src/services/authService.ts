import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AuthTokens, AuthenticatedRequestUser, TenantUser } from "../types";
import { pool } from "../db/pool";
import { userStore } from "./userStore";
import { buildEffectiveRoles, normalizeRoleArray } from "../lib/roles";
import { logger } from "../lib/logger";

function isMissingRefreshTokensTable(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? String((error as { code?: string }).code || "") : "";
  const message = "message" in error ? String((error as { message?: string }).message || "") : "";

  return code === "42P01" || /refresh_tokens/i.test(message);
}

function signAccessToken(user: TenantUser): string {
  const secondaryRoles = normalizeRoleArray(user.secondaryRoles);
  const roles = buildEffectiveRoles(user.role, user.roles || secondaryRoles);
  const payload: AuthenticatedRequestUser = {
    id: user.id,
    tenantId: user.tenantId,
    role: user.role,
    secondaryRoles,
    roles,
    email: user.email,
    fullName: user.fullName,
  };

  return jwt.sign(payload, env.jwtSecret, {
    issuer: env.jwtIssuer,
    expiresIn: env.accessTokenTtlSec,
  });
}

async function signRefreshToken(user: TenantUser): Promise<string> {
  const secondaryRoles = normalizeRoleArray(user.secondaryRoles);
  const roles = buildEffectiveRoles(user.role, user.roles || secondaryRoles);
  const token = jwt.sign(
    {
      sub: user.id,
      tenantId: user.tenantId,
      type: "refresh",
      email: user.email,
      role: user.role,
      secondaryRoles,
      roles,
      fullName: user.fullName,
    },
    env.jwtSecret,
    {
      issuer: env.jwtIssuer,
      expiresIn: env.refreshTokenTtlSec,
      jwtid: randomUUID(),
    },
  );

  const expiresAt = new Date(Date.now() + env.refreshTokenTtlSec * 1000);
  try {
    await pool.query(
      `insert into refresh_tokens(token, user_id, tenant_id, expires_at)
       values ($1,$2,$3,$4)`,
      [token, user.id, user.tenantId, expiresAt.toISOString()],
    );
  } catch (error) {
    if (!isMissingRefreshTokensTable(error)) {
      throw error;
    }

    logger.warn("refresh_tokens table missing; issuing stateless refresh token", {
      userId: user.id,
      tenantId: user.tenantId,
    });
  }

  return token;
}

export async function issueTokens(user: TenantUser): Promise<AuthTokens> {
  const accessToken = signAccessToken(user);
  const refreshToken = await signRefreshToken(user);
  return {
    accessToken,
    refreshToken,
    expiresIn: env.accessTokenTtlSec,
  };
}

async function revokeRefreshToken(token: string) {
  await pool.query(`update refresh_tokens set revoked = true where token = $1`, [token]);
}

export async function rotateRefreshToken(
  token: string,
): Promise<{ tokens: AuthTokens; user: AuthenticatedRequestUser } | null> {
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as jwt.JwtPayload;
    if (decoded.type !== "refresh" || !decoded.sub || !decoded.tenantId) return null;

    let stored: { revoked: boolean; expires_at: string } | undefined;

    try {
      const res = await pool.query(
        `select token, user_id, tenant_id, expires_at, revoked
         from refresh_tokens where token = $1`,
        [token],
      );
      stored = res.rows[0];
    } catch (error) {
      if (!isMissingRefreshTokensTable(error)) {
        return null;
      }

      const user = await userStore.findById(decoded.sub as string);
      if (!user || user.tenantId !== decoded.tenantId) return null;

      const accessToken = signAccessToken(user);
      const refreshToken = await signRefreshToken(user);

      return {
        tokens: { accessToken, refreshToken, expiresIn: env.accessTokenTtlSec },
        user: {
          id: user.id,
          tenantId: user.tenantId,
          role: user.role,
          secondaryRoles: normalizeRoleArray(user.secondaryRoles),
          roles: buildEffectiveRoles(user.role, user.roles || user.secondaryRoles),
          email: user.email,
          fullName: user.fullName,
        },
      };
    }

    if (!stored || stored.revoked) return null;
    if (new Date(stored.expires_at).getTime() < Date.now()) return null;

    const user = await userStore.findById(decoded.sub as string);
    if (!user || user.tenantId !== decoded.tenantId) return null;

    await revokeRefreshToken(token);

    const accessToken = signAccessToken(user);
    const refreshToken = await signRefreshToken(user);

    return {
      tokens: { accessToken, refreshToken, expiresIn: env.accessTokenTtlSec },
      user: {
        id: user.id,
        tenantId: user.tenantId,
        role: user.role,
        secondaryRoles: normalizeRoleArray(user.secondaryRoles),
        roles: buildEffectiveRoles(user.role, user.roles || user.secondaryRoles),
        email: user.email,
        fullName: user.fullName,
      },
    };
  } catch (err) {
    return null;
  }
}
