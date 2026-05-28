import type { CookieOptions, Response } from "express";
import config from "../config";
import { env } from "../config/env";
import type { AuthTokens } from "../types";

export const COOKIE_AUTH_TOKEN_PLACEHOLDER = "__http_only_cookie__";
export const STAFF_ACCESS_COOKIE = "derm_staff_access";
export const STAFF_REFRESH_COOKIE = "derm_staff_refresh";
export const PATIENT_PORTAL_SESSION_COOKIE = "derm_patient_portal_session";

type SameSite = NonNullable<CookieOptions["sameSite"]>;

function sameSitePolicy(): SameSite {
  return config.isProductionLike ? "none" : "lax";
}

function cookieOptions(maxAgeSeconds?: number): CookieOptions {
  return {
    httpOnly: true,
    secure: config.isProductionLike,
    sameSite: sameSitePolicy(),
    path: "/",
    ...(maxAgeSeconds ? { maxAge: maxAgeSeconds * 1000 } : {}),
  };
}

export function isCookieAuthPlaceholder(value: unknown): boolean {
  return value === COOKIE_AUTH_TOKEN_PLACEHOLDER || value === "cookie" || value === "__cookie__";
}

export function publicCookieTokens(tokens: AuthTokens): AuthTokens {
  return {
    accessToken: COOKIE_AUTH_TOKEN_PLACEHOLDER,
    refreshToken: COOKIE_AUTH_TOKEN_PLACEHOLDER,
    expiresIn: tokens.expiresIn,
  };
}

export function setStaffAuthCookies(res: Response, tokens: AuthTokens): void {
  res.cookie(STAFF_ACCESS_COOKIE, tokens.accessToken, cookieOptions(env.accessTokenTtlSec));
  res.cookie(STAFF_REFRESH_COOKIE, tokens.refreshToken, cookieOptions(env.refreshTokenTtlSec));
}

export function clearStaffAuthCookies(res: Response): void {
  res.clearCookie(STAFF_ACCESS_COOKIE, cookieOptions());
  res.clearCookie(STAFF_REFRESH_COOKIE, cookieOptions());
}

export function setPatientPortalSessionCookie(res: Response, token: string): void {
  res.cookie(PATIENT_PORTAL_SESSION_COOKIE, token, cookieOptions(12 * 60 * 60));
}

export function clearPatientPortalSessionCookie(res: Response): void {
  res.clearCookie(PATIENT_PORTAL_SESSION_COOKIE, cookieOptions());
}
