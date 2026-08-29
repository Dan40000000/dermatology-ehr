import { SmtpEmailAdapter } from '../SmtpEmailAdapter';

describe('SmtpEmailAdapter production BAA gate', () => {
  const originalDeploymentEnv = process.env.DEPLOYMENT_ENV;
  const originalEmailVendorBaaEnabled = process.env.EMAIL_VENDOR_BAA_ENABLED;

  afterEach(() => {
    if (originalDeploymentEnv === undefined) delete process.env.DEPLOYMENT_ENV;
    else process.env.DEPLOYMENT_ENV = originalDeploymentEnv;
    if (originalEmailVendorBaaEnabled === undefined) delete process.env.EMAIL_VENDOR_BAA_ENABLED;
    else process.env.EMAIL_VENDOR_BAA_ENABLED = originalEmailVendorBaaEnabled;
  });

  it('blocks email egress in production without a verified vendor BAA attestation', async () => {
    process.env.DEPLOYMENT_ENV = 'production';
    delete process.env.EMAIL_VENDOR_BAA_ENABLED;
    const adapter = new SmtpEmailAdapter();

    await expect(adapter.sendEmail({
      to: 'patient@example.com',
      subject: 'Portal notification',
      text: 'You have a new portal notification.',
    })).rejects.toThrow('EMAIL_VENDOR_BAA_ENABLED=true has not been set');
  });
});
