import { PaymentAdapter } from '../paymentAdapter';
import type { IntegrationConfig } from '../baseAdapter';

function createAdapter(stripeConnect: Record<string, unknown>, useMock = false): PaymentAdapter {
  const config: IntegrationConfig = {
    id: 'cfg-payment',
    tenantId: 'tenant-demo',
    integrationType: 'payment',
    provider: 'stripe',
    config: {
      mode: 'test',
      stripeConnect,
    },
    isActive: true,
    syncFrequencyMinutes: 60,
  };

  return new PaymentAdapter({
    tenantId: 'tenant-demo',
    config,
    useMock,
  });
}

describe('PaymentAdapter Stripe Connect routing', () => {
  it('routes charges to the connected practice account only after onboarding is complete', () => {
    const adapter = createAdapter({
      accountId: 'acct_ready_123',
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
      requirementsDue: [],
    });

    expect((adapter as any).getDestinationChargeParams()).toEqual({
      on_behalf_of: 'acct_ready_123',
      transfer_data: {
        destination: 'acct_ready_123',
      },
    });
  });

  it('keeps charges on the platform while the connected account still has requirements due', () => {
    const adapter = createAdapter({
      accountId: 'acct_needs_123',
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
      requirementsDue: ['external_account'],
    });

    expect((adapter as any).getDestinationChargeParams()).toEqual({});
  });

  it('does not route mock payments to a Stripe connected account', () => {
    const adapter = createAdapter(
      {
        accountId: 'acct_ready_123',
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
        requirementsDue: [],
      },
      true
    );

    expect((adapter as any).getDestinationChargeParams()).toEqual({});
  });
});
