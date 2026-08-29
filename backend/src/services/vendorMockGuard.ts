function currentEnvironment(): string {
  return (
    process.env.DEPLOYMENT_ENV ||
    process.env.APP_ENV ||
    process.env.RAILWAY_ENVIRONMENT ||
    process.env.NODE_ENV ||
    'development'
  ).toLowerCase();
}

export function assertSyntheticVendorMockAllowed(workflow: string): void {
  if (currentEnvironment() !== 'production') {
    return;
  }

  throw new Error(
    `${workflow} mock adapter is disabled in production. ` +
      'Configure and validate a live vendor adapter before using this workflow.',
  );
}
