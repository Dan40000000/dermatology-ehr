function currentEnvironment(): string {
  return (
    process.env.DEPLOYMENT_ENV ||
    process.env.APP_ENV ||
    process.env.RAILWAY_ENVIRONMENT ||
    process.env.NODE_ENV ||
    'development'
  ).toLowerCase();
}

export function assertNonProductionVendorModeAllowed(
  workflow: string,
  mode: 'mock' | 'sandbox' = 'mock',
): void {
  if (currentEnvironment() !== 'production') {
    return;
  }

  throw new Error(
    `${workflow} ${mode} adapter is disabled in production. ` +
      'Configure and validate a live vendor adapter before using this workflow.',
  );
}

export function assertSyntheticVendorMockAllowed(workflow: string): void {
  assertNonProductionVendorModeAllowed(workflow, 'mock');
}

export function assertVendorBaaEnabled(workflow: string, flagName: string): void {
  if (currentEnvironment() !== 'production') {
    return;
  }

  if (String(process.env[flagName] || '').trim().toLowerCase() === 'true') {
    return;
  }

  throw new Error(
    `${workflow} is disabled in production because ${flagName}=true has not been set ` +
      'after verifying an effective vendor BAA for the exact production account and service.',
  );
}
