import crypto from 'crypto';

type PublicTenantRequest = {
  header: (name: string) => string | undefined;
  query?: Record<string, unknown>;
};

export type PublicTenantResolution = {
  tenantId: string | null;
  hadUnverifiedHint: boolean;
};

function parseMap(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    }
  } catch {
    // Support simple key=tenant,key2=tenant2 values for deployment envs.
    return Object.fromEntries(raw.split(',').map((part) => part.split('=').map((value) => value.trim())).filter((parts): parts is [string, string] => parts.length === 2 && Boolean(parts[0]) && Boolean(parts[1])));
  }
  return {};
}

function getCandidate(req: PublicTenantRequest, ...names: string[]): string {
  for (const name of names) {
    const header = req.header(name);
    if (header?.trim()) return header.trim();
    const queryValue = req.query?.[name];
    if (typeof queryValue === 'string' && queryValue.trim()) return queryValue.trim();
  }
  return '';
}

function decodeBase64Url(value: string): string | null {
  try {
    return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  } catch {
    return null;
  }
}

function verifyTenantToken(token: string, secret: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 2 && parts.length !== 3) return null;
  const payloadPart = parts.length === 3 ? parts[1] : parts[0];
  const signaturePart = parts.length === 3 ? parts[2] : parts[1];
  if (!payloadPart || !signaturePart) return null;
  const signingInput = parts.length === 3 ? `${parts[0]}.${payloadPart}` : payloadPart;
  const expected = crypto.createHmac('sha256', secret).update(signingInput).digest('base64url');
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(signaturePart);
  if (expectedBuffer.length !== suppliedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)) return null;
  const payloadJson = decodeBase64Url(payloadPart);
  if (!payloadJson) return null;
  try {
    const payload = JSON.parse(payloadJson) as { tenantId?: string; tenant_id?: string; exp?: number };
    const tenantId = payload.tenantId || payload.tenant_id;
    if (!tenantId || (payload.exp !== undefined && payload.exp <= Math.floor(Date.now() / 1000))) return null;
    return tenantId;
  } catch {
    return null;
  }
}

/**
 * Resolve a public booking tenant from a verified site key, host allowlist, or
 * signed tenant token.  A raw tenant header/query parameter is intentionally
 * not trusted outside test fixtures or an explicitly configured demo site.
 */
export function resolvePublicTenantBinding(req: PublicTenantRequest): PublicTenantResolution {
  const rawTenant = getCandidate(req, 'x-tenant-id', 'tenantId');
  const siteKey = getCandidate(req, 'x-public-site-key', 'x-site-key', 'siteKey');
  const tenantToken = getCandidate(req, 'x-public-tenant-token', 'tenantToken');
  const host = (req.header('host') || '').toLowerCase().replace(/:\d+$/, '');
  const isTest = process.env.NODE_ENV === 'test';
  const isDemo = ['1', 'true', 'yes', 'on'].includes(String(req.query?.demo || req.header('x-demo-booking') || '').toLowerCase());
  const hostBindingConfigured = Boolean(process.env.PUBLIC_BOOKING_HOST_TENANTS || process.env.PUBLIC_TENANT_HOST_MAP);

  if (siteKey) {
    const mapped = parseMap(process.env.PUBLIC_BOOKING_SITE_KEYS || process.env.PUBLIC_SITE_KEY_TENANTS)[siteKey];
    if (mapped) return { tenantId: mapped, hadUnverifiedHint: false };
  }

  if (host) {
    const mapped = parseMap(process.env.PUBLIC_BOOKING_HOST_TENANTS || process.env.PUBLIC_TENANT_HOST_MAP)[host];
    if (mapped) return { tenantId: mapped, hadUnverifiedHint: false };
  }

  if (tenantToken) {
    const secret = process.env.PUBLIC_BOOKING_SIGNING_SECRET || process.env.PUBLIC_SITE_TOKEN_SECRET || process.env.PUBLIC_BOOKING_TENANT_SECRET;
    if (secret) {
      const mapped = verifyTenantToken(tenantToken, secret);
      if (mapped) return { tenantId: mapped, hadUnverifiedHint: false };
    }
  }

  if (rawTenant && ((isTest && !siteKey && !tenantToken && !hostBindingConfigured) || (isDemo && !process.env.NODE_ENV?.includes('production') && rawTenant === (process.env.PUBLIC_BOOKING_DEMO_TENANT || 'tenant-demo')))) {
    return { tenantId: rawTenant, hadUnverifiedHint: false };
  }

  return { tenantId: null, hadUnverifiedHint: Boolean(rawTenant || siteKey || tenantToken || (host && hostBindingConfigured)) };
}
