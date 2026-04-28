export const DEFAULT_PATIENT_PORTAL_TENANT_ID = 'tenant-demo';

export function sanitizePortalRedirect(
  redirect: string | null | undefined,
  fallback = '/portal/dashboard'
): string {
  if (!redirect || typeof redirect !== 'string') {
    return fallback;
  }

  if (!redirect.startsWith('/') || redirect.startsWith('//')) {
    return fallback;
  }

  return redirect;
}

export function buildPortalUrl(
  path: string,
  options: {
    tenantId?: string | null;
    redirect?: string | null;
  } = {}
): string {
  const params = new URLSearchParams();

  if (options.tenantId) {
    params.set('tenantId', options.tenantId);
  }

  if (options.redirect) {
    params.set('redirect', options.redirect);
  }

  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
