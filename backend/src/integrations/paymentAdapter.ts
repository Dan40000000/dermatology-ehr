/**
 * Payment Processing Adapter
 *
 * Handles patient payment processing via Stripe.
 * Supports payment intents, saved payment methods, refunds,
 * and recurring payments for payment plans.
 */

import crypto from 'crypto';
import Stripe from 'stripe';
import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import { BaseAdapter, AdapterOptions, saveIntegrationConfig } from './baseAdapter';
import { scanAiPhi } from '../utils/aiPhiGuard';

// ============================================================================
// Types
// ============================================================================

export interface PaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status: 'requires_payment_method' | 'requires_confirmation' | 'processing' | 'succeeded' | 'failed' | 'cancelled';
  clientSecret: string;
  paymentMethodId?: string;
  metadata?: Record<string, string>;
  createdAt: string;
}

export interface PaymentResult {
  success: boolean;
  paymentIntentId: string;
  status: 'succeeded' | 'processing' | 'requires_action' | 'failed';
  amount: number;
  currency: string;
  receiptUrl?: string;
  failureCode?: string;
  failureMessage?: string;
  timestamp: string;
}

export interface RefundResult {
  success: boolean;
  refundId: string;
  paymentIntentId: string;
  amount: number;
  status: 'succeeded' | 'pending' | 'failed';
  reason?: string;
  timestamp: string;
}

export interface StripeCustomer {
  id: string;
  email?: string;
  name?: string;
  defaultPaymentMethod?: string;
  createdAt: string;
}

export interface PaymentMethod {
  id: string;
  type: 'card' | 'us_bank_account';
  card?: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  };
  bankAccount?: {
    bankName: string;
    last4: string;
  };
  billingDetails?: {
    name?: string;
    email?: string;
    address?: {
      postalCode?: string;
    };
  };
  isDefault: boolean;
  createdAt: string;
}

export interface RecurringPayment {
  id: string;
  customerId: string;
  paymentMethodId: string;
  amount: number;
  currency: string;
  interval: 'week' | 'month';
  intervalCount: number;
  status: 'active' | 'paused' | 'cancelled' | 'completed';
  nextPaymentDate: string;
  totalPayments: number;
  completedPayments: number;
}

export interface CheckoutLineItem {
  name: string;
  description?: string;
  unitAmountCents: number;
  quantity: number;
  productId?: string;
  sku?: string;
}

export interface CheckoutSessionResult {
  id: string;
  url?: string;
  paymentIntentId?: string;
  paymentStatus: 'paid' | 'unpaid' | 'no_payment_required';
  amountTotal: number;
  currency: string;
  mode: 'stripe' | 'mock';
  metadata?: Record<string, string>;
  createdAt: string;
}

export interface StripeConnectStatus {
  mode: 'mock' | 'test' | 'live' | 'unknown';
  platformConfigured: boolean;
  publishableKey?: string;
  connectedAccountId?: string;
  accountType?: string;
  onboardingStatus: 'not_started' | 'pending' | 'complete' | 'restricted' | 'mock';
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  destinationChargesEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsDue: string[];
  disabledReason?: string | null;
  lastSyncedAt?: string | null;
  subscription: {
    status: 'not_started' | 'checkout_started' | 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'mock';
    customerId?: string;
    subscriptionId?: string;
    priceId?: string;
    currentPeriodEnd?: string | null;
    cancelAtPeriodEnd?: boolean;
    checkoutSessionId?: string;
  };
}

export interface StripeAccountOnboardingLink {
  mode: 'mock' | 'test' | 'live';
  accountId: string;
  url: string;
  expiresAt?: string;
}

export interface StripeSubscriptionCheckout {
  mode: 'mock' | 'test' | 'live';
  sessionId: string;
  url: string;
  customerId?: string;
  subscriptionId?: string;
}

export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
}

// ============================================================================
// Payment Adapter
// ============================================================================

export class PaymentAdapter extends BaseAdapter {
  constructor(options: AdapterOptions) {
    super(options);
  }

  getIntegrationType(): string {
    return 'payment';
  }

  getProvider(): string {
    return 'stripe';
  }

  hasStripeCredentials(): boolean {
    return this.getStripeSecretKey().length > 0;
  }

  isMockMode(): boolean {
    return this.useMock;
  }

  /**
   * Test connection to Stripe
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (this.useMock) {
      await this.sleep(200);
      return {
        success: true,
        message: 'Connected to Stripe (mock mode)',
      };
    }

    const startTime = Date.now();
    try {
      const stripe = this.getStripeClient();
      await stripe.balance.retrieve();

      await this.logIntegration({
        direction: 'outbound',
        endpoint: '/v1/balance',
        method: 'GET',
        status: 'success',
        durationMs: Date.now() - startTime,
      });

      return {
        success: true,
        message: 'Connected to Stripe',
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Create a payment intent
   */
  async createPaymentIntent(
    amountCents: number,
    patientId: string,
    metadata?: Record<string, string>
  ): Promise<PaymentIntent> {
    const startTime = Date.now();
    const safeMetadata = this.normalizeMetadata(metadata);

    logger.info('Creating payment intent', {
      amountCents,
      patientId,
    });

    try {
      let intent: PaymentIntent;

      // Get or create Stripe customer
      const customerId = await this.getOrCreateCustomer(patientId);

      if (this.useMock) {
        intent = await this.mockCreatePaymentIntent(amountCents, customerId, safeMetadata);
      } else {
        intent = await this.withRetry(() =>
          this.realCreatePaymentIntent(amountCents, customerId, safeMetadata)
        );
      }

      // Store payment intent
      await this.storePaymentIntent(patientId, intent);

      await this.logIntegration({
        direction: 'outbound',
        endpoint: '/v1/payment_intents',
        method: 'POST',
        request: { amountCents, patientId },
        response: { intentId: intent.id, status: intent.status },
        status: 'success',
        durationMs: Date.now() - startTime,
      });

      return intent;
    } catch (error: any) {
      logger.error('Failed to create payment intent', { patientId, error: error.message });
      throw error;
    }
  }

  /**
   * Create a hosted Stripe Checkout session for store orders.
   */
  async createCheckoutSession(input: {
    patientId: string;
    lineItems: CheckoutLineItem[];
    successUrl: string;
    cancelUrl: string;
    metadata?: Record<string, string>;
    customerEmail?: string;
  }): Promise<CheckoutSessionResult> {
    const startTime = Date.now();
    const amountCents = input.lineItems.reduce(
      (sum, item) => sum + Math.max(0, item.unitAmountCents) * Math.max(1, item.quantity),
      0
    );

    logger.info('Creating Stripe Checkout session', {
      patientId: input.patientId,
      amountCents,
    });

    try {
      const safeInput = { ...input, metadata: this.normalizeMetadata(input.metadata) };
      const useMockCheckout = this.useMock || !this.hasStripeCredentials();
      const session = useMockCheckout
        ? await this.mockCreateCheckoutSession(safeInput, amountCents)
        : await this.withRetry(() => this.realCreateCheckoutSession(safeInput));

      await this.logIntegration({
        direction: 'outbound',
        endpoint: '/v1/checkout/sessions',
        method: 'POST',
        request: {
          patientId: input.patientId,
          amountCents,
          lineItemCount: input.lineItems.length,
        },
        response: { sessionId: session.id, paymentStatus: session.paymentStatus, mode: session.mode },
        status: 'success',
        durationMs: Date.now() - startTime,
      });

      return session;
    } catch (error: any) {
      logger.error('Failed to create Stripe Checkout session', { patientId: input.patientId, error: error.message });
      throw error;
    }
  }

  async retrieveCheckoutSession(sessionId: string): Promise<CheckoutSessionResult> {
    if (this.useMock || sessionId.startsWith('cs_mock_') || !this.hasStripeCredentials()) {
      return {
        id: sessionId,
        paymentStatus: 'paid',
        amountTotal: 0,
        currency: 'usd',
        mode: 'mock',
        createdAt: new Date().toISOString(),
      };
    }

    const stripe = this.getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent'],
    });

    return this.mapCheckoutSession(session);
  }

  /**
   * Process a payment using a payment method
   */
  async processPayment(
    paymentIntentId: string,
    paymentMethodId: string
  ): Promise<PaymentResult> {
    const startTime = Date.now();

    logger.info('Processing payment', { paymentIntentId, paymentMethodId });

    try {
      let result: PaymentResult;

      if (this.useMock) {
        result = await this.mockProcessPayment(paymentIntentId, paymentMethodId);
      } else {
        result = await this.withRetry(() =>
          this.realProcessPayment(paymentIntentId, paymentMethodId)
        );
      }

      // Update payment intent status
      await pool.query(
        `UPDATE payment_intents
         SET status = $1, payment_method_id = $2, captured_at = $3,
             failure_code = $4, failure_message = $5, receipt_url = $6, updated_at = NOW()
         WHERE stripe_payment_intent_id = $7`,
        [
          result.status,
          paymentMethodId,
          result.status === 'succeeded' ? new Date() : null,
          result.failureCode,
          result.failureMessage,
          result.receiptUrl,
          paymentIntentId,
        ]
      );

      await this.logIntegration({
        direction: 'outbound',
        endpoint: `/v1/payment_intents/${paymentIntentId}/confirm`,
        method: 'POST',
        request: { paymentIntentId, paymentMethodId },
        response: { status: result.status },
        status: result.success ? 'success' : 'error',
        durationMs: Date.now() - startTime,
      });

      return result;
    } catch (error: any) {
      logger.error('Failed to process payment', { paymentIntentId, error: error.message });
      throw error;
    }
  }

  /**
   * Refund a payment
   */
  async refundPayment(
    paymentIntentId: string,
    amountCents?: number,
    reason?: string
  ): Promise<RefundResult> {
    const startTime = Date.now();

    logger.info('Processing refund', { paymentIntentId, amountCents, reason });

    try {
      let result: RefundResult;

      if (this.useMock) {
        result = await this.mockRefundPayment(paymentIntentId, amountCents, reason);
      } else {
        result = await this.withRetry(() =>
          this.realRefundPayment(paymentIntentId, amountCents, reason)
        );
      }

      // Update payment intent with refund
      if (result.success) {
        await pool.query(
          `UPDATE payment_intents
           SET refunded_amount_cents = COALESCE(refunded_amount_cents, 0) + $1,
               status = CASE WHEN refunded_amount_cents + $1 >= amount_cents THEN 'refunded' ELSE status END,
               updated_at = NOW()
           WHERE stripe_payment_intent_id = $2`,
          [result.amount, paymentIntentId]
        );
      }

      await this.logIntegration({
        direction: 'outbound',
        endpoint: '/v1/refunds',
        method: 'POST',
        request: { paymentIntentId, amountCents, reason },
        response: { status: result.status, refundId: result.refundId },
        status: result.success ? 'success' : 'error',
        durationMs: Date.now() - startTime,
      });

      return result;
    } catch (error: any) {
      logger.error('Failed to process refund', { paymentIntentId, error: error.message });
      throw error;
    }
  }

  /**
   * Create a Stripe customer for a patient
   */
  async createCustomer(patient: Patient): Promise<StripeCustomer> {
    const startTime = Date.now();

    logger.info('Creating Stripe customer', { patientId: patient.id });

    try {
      // Check if customer already exists
      const existing = await pool.query(
        `SELECT stripe_customer_id FROM stripe_customers
         WHERE patient_id = $1 AND tenant_id = $2`,
        [patient.id, this.tenantId]
      );

      if (existing.rows.length > 0) {
        return {
          id: existing.rows[0].stripe_customer_id,
          email: patient.email,
          name: `${patient.firstName} ${patient.lastName}`,
          createdAt: new Date().toISOString(),
        };
      }

      let customer: StripeCustomer;

      if (this.useMock) {
        customer = await this.mockCreateCustomer(patient);
      } else {
        customer = await this.withRetry(() => this.realCreateCustomer(patient));
      }

      // Store customer
      await pool.query(
        `INSERT INTO stripe_customers (tenant_id, patient_id, stripe_customer_id, email)
         VALUES ($1, $2, $3, $4)`,
        [this.tenantId, patient.id, customer.id, patient.email]
      );

      await this.logIntegration({
        direction: 'outbound',
        endpoint: '/v1/customers',
        method: 'POST',
        request: { patientId: patient.id },
        response: { customerId: customer.id },
        status: 'success',
        durationMs: Date.now() - startTime,
      });

      return customer;
    } catch (error: any) {
      logger.error('Failed to create customer', { patientId: patient.id, error: error.message });
      throw error;
    }
  }

  /**
   * Save a payment method for a customer
   */
  async savePaymentMethod(
    patientId: string,
    paymentMethodId: string,
    setAsDefault: boolean = false
  ): Promise<PaymentMethod> {
    const startTime = Date.now();

    logger.info('Saving payment method', { patientId, paymentMethodId, setAsDefault });

    try {
      const customerId = await this.getOrCreateCustomer(patientId);
      let method: PaymentMethod;

      if (this.useMock) {
        method = await this.mockSavePaymentMethod(customerId, paymentMethodId, setAsDefault);
      } else {
        method = await this.withRetry(() =>
          this.realSavePaymentMethod(customerId, paymentMethodId, setAsDefault)
        );
      }

      // Store payment method
      if (setAsDefault) {
        await pool.query(
          `UPDATE payment_methods SET is_default = false
           WHERE patient_id = $1 AND tenant_id = $2`,
          [patientId, this.tenantId]
        );
      }

      await pool.query(
        `INSERT INTO payment_methods
         (tenant_id, patient_id, stripe_payment_method_id, stripe_customer_id,
          type, card_brand, card_last4, card_exp_month, card_exp_year,
          billing_name, billing_zip, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (stripe_payment_method_id)
         DO UPDATE SET is_default = EXCLUDED.is_default, updated_at = NOW()`,
        [
          this.tenantId,
          patientId,
          method.id,
          customerId,
          method.type,
          method.card?.brand,
          method.card?.last4,
          method.card?.expMonth,
          method.card?.expYear,
          method.billingDetails?.name,
          method.billingDetails?.address?.postalCode,
          setAsDefault,
        ]
      );

      await this.logIntegration({
        direction: 'outbound',
        endpoint: `/v1/payment_methods/${paymentMethodId}/attach`,
        method: 'POST',
        request: { customerId, setAsDefault },
        response: { methodId: method.id },
        status: 'success',
        durationMs: Date.now() - startTime,
      });

      return method;
    } catch (error: any) {
      logger.error('Failed to save payment method', { patientId, error: error.message });
      throw error;
    }
  }

  /**
   * Set up recurring payment for a payment plan
   */
  async setupRecurringPayment(
    patientId: string,
    paymentMethodId: string,
    amountCents: number,
    intervalMonths: number,
    totalPayments: number
  ): Promise<RecurringPayment> {
    const startTime = Date.now();

    logger.info('Setting up recurring payment', {
      patientId,
      amountCents,
      intervalMonths,
      totalPayments,
    });

    try {
      const customerId = await this.getOrCreateCustomer(patientId);
      let recurring: RecurringPayment;

      if (this.useMock) {
        recurring = await this.mockSetupRecurring(
          customerId, paymentMethodId, amountCents, intervalMonths, totalPayments
        );
      } else {
        recurring = await this.withRetry(() =>
          this.realSetupRecurring(
            customerId, paymentMethodId, amountCents, intervalMonths, totalPayments
          )
        );
      }

      await this.logIntegration({
        direction: 'outbound',
        endpoint: '/v1/subscriptions',
        method: 'POST',
        request: { patientId, amountCents, totalPayments },
        response: { recurringId: recurring.id },
        status: 'success',
        durationMs: Date.now() - startTime,
      });

      return recurring;
    } catch (error: any) {
      logger.error('Failed to setup recurring payment', { patientId, error: error.message });
      throw error;
    }
  }

  /**
   * Get patient's saved payment methods
   */
  async getPaymentMethods(patientId: string): Promise<PaymentMethod[]> {
    try {
      const result = await pool.query(
        `SELECT stripe_payment_method_id, type, card_brand, card_last4,
                card_exp_month, card_exp_year, billing_name, billing_zip, is_default, created_at
         FROM payment_methods
         WHERE patient_id = $1 AND tenant_id = $2 AND is_active = true
         ORDER BY is_default DESC, created_at DESC`,
        [patientId, this.tenantId]
      );

      return result.rows.map(row => ({
        id: row.stripe_payment_method_id,
        type: row.type,
        card: row.type === 'card' ? {
          brand: row.card_brand,
          last4: row.card_last4,
          expMonth: row.card_exp_month,
          expYear: row.card_exp_year,
        } : undefined,
        billingDetails: {
          name: row.billing_name,
          address: { postalCode: row.billing_zip },
        },
        isDefault: row.is_default,
        createdAt: row.created_at,
      }));
    } catch (error: any) {
      logger.error('Failed to get payment methods', { patientId, error: error.message });
      return [];
    }
  }

  async getStripeConnectStatus(): Promise<StripeConnectStatus> {
    await this.ensureConfigLoaded();
    const stripeConnect = this.getStripeConnectConfig();
    const subscription = this.getStripeSubscriptionConfig();
    const platformConfigured = this.hasStripeCredentials();
    const baseStatus = this.buildStripeConnectStatus({ platformConfigured, stripeConnect, subscription });

    if (
      this.useMock ||
      !platformConfigured ||
      !stripeConnect.accountId ||
      String(stripeConnect.accountId).startsWith('acct_mock_')
    ) {
      return baseStatus;
    }

    try {
      const account = await this.getStripeClient().accounts.retrieve(stripeConnect.accountId);
      await this.persistStripeAccountStatus(account);
      return this.buildStripeConnectStatus({
        platformConfigured,
        stripeConnect: this.mapStripeAccountToConnectConfig(account),
        subscription,
      });
    } catch (error: any) {
      logger.warn('Failed to refresh Stripe connected account status', {
        tenantId: this.tenantId,
        accountId: stripeConnect.accountId,
        error: error.message,
      });
      return {
        ...baseStatus,
        disabledReason: error.message || baseStatus.disabledReason,
      };
    }
  }

  async createStripeConnectOnboardingLink(input: {
    returnUrl: string;
    refreshUrl: string;
    userEmail?: string;
  }): Promise<StripeAccountOnboardingLink> {
    await this.ensureConfigLoaded();

    if (this.useMock) {
      const accountId = this.getStripeConnectConfig().accountId || `acct_mock_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
      await this.updatePaymentConfig({
        stripeConnect: {
          accountId,
          accountType: 'express',
          onboardingStatus: 'mock',
          chargesEnabled: false,
          payoutsEnabled: false,
          detailsSubmitted: false,
          requirementsDue: ['platform_live_key_required'],
          disabledReason: 'Mock Stripe Connect account. Configure Stripe platform keys for real onboarding.',
          lastSyncedAt: new Date().toISOString(),
        },
      });

      const separator = input.returnUrl.includes('?') ? '&' : '?';
      return {
        mode: 'mock',
        accountId,
        url: `${input.returnUrl}${separator}stripe_connect=mock&account=${encodeURIComponent(accountId)}`,
      };
    }

    if (!this.hasStripeCredentials()) {
      throw new Error('Stripe platform secret key is not configured');
    }

    const stripe = this.getStripeClient();
    let accountId = this.getStripeConnectConfig().accountId;

    if (!accountId) {
      const tenant = await this.getTenantProfile();
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        email: input.userEmail || undefined,
        business_type: 'company',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_profile: {
          name: tenant.practiceName || tenant.name || undefined,
          support_phone: tenant.practicePhone || undefined,
        },
        metadata: {
          tenantId: this.tenantId,
        },
      });
      accountId = account.id;
      await this.persistStripeAccountStatus(account);
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: input.refreshUrl,
      return_url: input.returnUrl,
      type: 'account_onboarding',
    });

    return {
      mode: this.resolveStripeMode(),
      accountId,
      url: link.url,
      expiresAt: link.expires_at ? new Date(link.expires_at * 1000).toISOString() : undefined,
    };
  }

  async refreshStripeConnectStatus(): Promise<StripeConnectStatus> {
    await this.ensureConfigLoaded();
    const accountId = this.getStripeConnectConfig().accountId;
    if (!accountId || this.useMock || accountId.startsWith('acct_mock_')) {
      return this.getStripeConnectStatus();
    }
    if (!this.hasStripeCredentials()) {
      throw new Error('Stripe platform secret key is not configured');
    }

    const account = await this.getStripeClient().accounts.retrieve(accountId);
    await this.persistStripeAccountStatus(account);
    return this.getStripeConnectStatus();
  }

  async createPracticeSubscriptionCheckout(input: {
    returnUrl: string;
    cancelUrl: string;
    userEmail?: string;
    priceId?: string;
  }): Promise<StripeSubscriptionCheckout> {
    await this.ensureConfigLoaded();
    const subscriptionConfig = this.getStripeSubscriptionConfig();
    const priceId =
      input.priceId ||
      process.env.STRIPE_PLATFORM_SUBSCRIPTION_PRICE_ID ||
      process.env.STRIPE_SUBSCRIPTION_PRICE_ID ||
      subscriptionConfig.priceId;

    if (this.useMock) {
      const sessionId = `cs_sub_mock_${crypto.randomUUID().replace(/-/g, '')}`;
      await this.updatePaymentConfig({
        subscription: {
          ...subscriptionConfig,
          status: 'mock',
          checkoutSessionId: sessionId,
          priceId: priceId || 'price_mock_derm_subscription',
        },
      });
      const separator = input.returnUrl.includes('?') ? '&' : '?';
      return {
        mode: 'mock',
        sessionId,
        url: `${input.returnUrl}${separator}stripe_subscription=mock&session_id=${encodeURIComponent(sessionId)}`,
      };
    }

    if (!this.hasStripeCredentials()) {
      throw new Error('Stripe platform secret key is not configured');
    }
    if (!priceId) {
      throw new Error('Stripe subscription price is not configured');
    }

    const stripe = this.getStripeClient();
    const tenant = await this.getTenantProfile();
    let customerId = subscriptionConfig.customerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: input.userEmail || undefined,
        name: tenant.practiceName || tenant.name || undefined,
        metadata: {
          tenantId: this.tenantId,
          customerType: 'practice_subscription',
        },
      });
      customerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      success_url: input.returnUrl,
      cancel_url: input.cancelUrl,
      allow_promotion_codes: true,
      metadata: {
        tenantId: this.tenantId,
        kind: 'practice_subscription',
      },
      subscription_data: {
        metadata: {
          tenantId: this.tenantId,
          kind: 'practice_subscription',
        },
      },
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
    });

    await this.updatePaymentConfig({
      subscription: {
        ...subscriptionConfig,
        status: 'checkout_started',
        customerId,
        checkoutSessionId: session.id,
        subscriptionId: typeof session.subscription === 'string' ? session.subscription : undefined,
        priceId,
      },
    });

    return {
      mode: this.resolveStripeMode(),
      sessionId: session.id,
      url: session.url || input.returnUrl,
      customerId,
      subscriptionId: typeof session.subscription === 'string' ? session.subscription : undefined,
    };
  }

  async refreshPracticeSubscriptionStatus(): Promise<StripeConnectStatus> {
    await this.ensureConfigLoaded();
    const subscription = this.getStripeSubscriptionConfig();
    if (!subscription.subscriptionId || this.useMock) {
      return this.getStripeConnectStatus();
    }
    if (!this.hasStripeCredentials()) {
      throw new Error('Stripe platform secret key is not configured');
    }

    const stripeSubscription = await this.getStripeClient().subscriptions.retrieve(subscription.subscriptionId);
    await this.updatePaymentConfig({
      subscription: this.mapStripeSubscriptionToConfig(stripeSubscription),
    });
    return this.getStripeConnectStatus();
  }

  // ============================================================================
  // Mock Implementations
  // ============================================================================

  private async mockCreatePaymentIntent(
    amountCents: number,
    customerId: string,
    metadata?: Record<string, string>
  ): Promise<PaymentIntent> {
    await this.sleep(300 + Math.random() * 400);

    const id = `pi_mock_${crypto.randomUUID().replace(/-/g, '')}`;

    return {
      id,
      amount: amountCents,
      currency: 'usd',
      status: 'requires_payment_method',
      clientSecret: `${id}_secret_${crypto.randomUUID().substring(0, 16)}`,
      metadata,
      createdAt: new Date().toISOString(),
    };
  }

  private async mockProcessPayment(
    paymentIntentId: string,
    paymentMethodId: string
  ): Promise<PaymentResult> {
    await this.sleep(500 + Math.random() * 1000);

    // 95% success rate
    const success = Math.random() < 0.95;

    // Get payment intent amount
    const intentResult = await pool.query(
      `SELECT amount_cents FROM payment_intents WHERE stripe_payment_intent_id = $1`,
      [paymentIntentId]
    );
    const amount = intentResult.rows[0]?.amount_cents || 0;

    return {
      success,
      paymentIntentId,
      status: success ? 'succeeded' : 'failed',
      amount,
      currency: 'usd',
      receiptUrl: success ? `https://pay.stripe.com/receipts/mock/${paymentIntentId}` : undefined,
      failureCode: success ? undefined : 'card_declined',
      failureMessage: success ? undefined : 'Your card was declined',
      timestamp: new Date().toISOString(),
    };
  }

  private async mockRefundPayment(
    paymentIntentId: string,
    amountCents?: number,
    reason?: string
  ): Promise<RefundResult> {
    await this.sleep(400 + Math.random() * 600);

    // Get original payment amount if not specified
    let refundAmount = amountCents;
    if (!refundAmount) {
      const intentResult = await pool.query(
        `SELECT amount_cents FROM payment_intents WHERE stripe_payment_intent_id = $1`,
        [paymentIntentId]
      );
      refundAmount = intentResult.rows[0]?.amount_cents || 0;
    }

    return {
      success: true,
      refundId: `re_mock_${crypto.randomUUID().replace(/-/g, '')}`,
      paymentIntentId,
      amount: refundAmount || 0,
      status: 'succeeded',
      reason,
      timestamp: new Date().toISOString(),
    };
  }

  private async mockCreateCustomer(patient: Patient): Promise<StripeCustomer> {
    await this.sleep(200 + Math.random() * 300);

    return {
      id: `cus_mock_${crypto.randomUUID().replace(/-/g, '').substring(0, 14)}`,
      email: patient.email,
      name: `${patient.firstName} ${patient.lastName}`,
      createdAt: new Date().toISOString(),
    };
  }

  private async mockSavePaymentMethod(
    customerId: string,
    paymentMethodId: string,
    setAsDefault: boolean
  ): Promise<PaymentMethod> {
    await this.sleep(200 + Math.random() * 300);

    const brands = ['visa', 'mastercard', 'amex', 'discover'];

    return {
      id: paymentMethodId.startsWith('pm_') ? paymentMethodId : `pm_mock_${crypto.randomUUID().replace(/-/g, '').substring(0, 14)}`,
      type: 'card',
      card: {
        brand: brands[Math.floor(Math.random() * brands.length)]!,
        last4: String(Math.floor(1000 + Math.random() * 9000)),
        expMonth: Math.floor(1 + Math.random() * 12),
        expYear: new Date().getFullYear() + Math.floor(1 + Math.random() * 5),
      },
      isDefault: setAsDefault,
      createdAt: new Date().toISOString(),
    };
  }

  private async mockSetupRecurring(
    customerId: string,
    paymentMethodId: string,
    amountCents: number,
    intervalMonths: number,
    totalPayments: number
  ): Promise<RecurringPayment> {
    await this.sleep(400 + Math.random() * 600);

    const nextPayment = new Date();
    nextPayment.setMonth(nextPayment.getMonth() + intervalMonths);

    return {
      id: `sub_mock_${crypto.randomUUID().replace(/-/g, '').substring(0, 14)}`,
      customerId,
      paymentMethodId,
      amount: amountCents,
      currency: 'usd',
      interval: 'month',
      intervalCount: intervalMonths,
      status: 'active',
      nextPaymentDate: nextPayment.toISOString(),
      totalPayments,
      completedPayments: 0,
    };
  }

  private async mockCreateCheckoutSession(
    input: {
      patientId: string;
      lineItems: CheckoutLineItem[];
      successUrl: string;
      cancelUrl: string;
      metadata?: Record<string, string>;
      customerEmail?: string;
    },
    amountCents: number
  ): Promise<CheckoutSessionResult> {
    await this.sleep(250 + Math.random() * 300);

    const id = `cs_mock_${crypto.randomUUID().replace(/-/g, '')}`;
    return {
      id,
      url: undefined,
      paymentIntentId: `pi_mock_${crypto.randomUUID().replace(/-/g, '')}`,
      paymentStatus: 'paid',
      amountTotal: amountCents,
      currency: 'usd',
      mode: 'mock',
      metadata: input.metadata,
      createdAt: new Date().toISOString(),
    };
  }

  // ============================================================================
  // Real API Implementations (placeholders)
  // ============================================================================

  private async realCreatePaymentIntent(
    amountCents: number,
    customerId: string,
    metadata?: Record<string, string>
  ): Promise<PaymentIntent> {
    const stripe = this.getStripeClient();
    const destinationChargeParams = this.getDestinationChargeParams();
    const intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      customer: customerId,
      metadata: this.normalizeMetadata(metadata),
      automatic_payment_methods: {
        enabled: true,
      },
      ...destinationChargeParams,
    });

    return {
      id: intent.id,
      amount: intent.amount,
      currency: intent.currency,
      status: this.mapPaymentIntentStatus(intent.status),
      clientSecret: intent.client_secret || '',
      paymentMethodId: typeof intent.payment_method === 'string' ? intent.payment_method : intent.payment_method?.id,
      metadata: intent.metadata || undefined,
      createdAt: new Date(intent.created * 1000).toISOString(),
    };
  }

  private async realProcessPayment(
    paymentIntentId: string,
    paymentMethodId: string
  ): Promise<PaymentResult> {
    const stripe = this.getStripeClient();
    const intent = await stripe.paymentIntents.confirm(paymentIntentId, {
      payment_method: paymentMethodId,
      expand: ['latest_charge'],
    });

    const charge =
      typeof intent.latest_charge === 'string' || !intent.latest_charge
        ? null
        : intent.latest_charge;
    const mappedStatus = this.mapProcessStatus(intent.status);
    const success = mappedStatus === 'succeeded' || mappedStatus === 'processing';

    return {
      success,
      paymentIntentId: intent.id,
      status: mappedStatus,
      amount: intent.amount,
      currency: intent.currency,
      receiptUrl: charge?.receipt_url || undefined,
      failureCode: intent.last_payment_error?.code || undefined,
      failureMessage: intent.last_payment_error?.message || undefined,
      timestamp: new Date().toISOString(),
    };
  }

  private async realRefundPayment(
    paymentIntentId: string,
    amountCents?: number,
    reason?: string
  ): Promise<RefundResult> {
    const stripe = this.getStripeClient();
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: amountCents,
      reason: this.mapRefundReason(reason),
      metadata: this.normalizeMetadata(
        reason
          ? {
              note: reason,
            }
          : undefined
      ),
    });

    return {
      success: refund.status !== 'failed' && refund.status !== 'canceled',
      refundId: refund.id,
      paymentIntentId,
      amount: refund.amount,
      status: this.mapRefundStatus(refund.status),
      reason,
      timestamp: new Date().toISOString(),
    };
  }

  private async realCreateCustomer(patient: Patient): Promise<StripeCustomer> {
    const stripe = this.getStripeClient();
    const customer = await stripe.customers.create({
      name: `${patient.firstName} ${patient.lastName}`.trim(),
      email: patient.email || undefined,
      phone: patient.phone || undefined,
      metadata: {
        patientId: patient.id,
        tenantId: this.tenantId,
      },
    });

    return {
      id: customer.id,
      email: customer.email || undefined,
      name: customer.name || undefined,
      defaultPaymentMethod:
        typeof customer.invoice_settings?.default_payment_method === 'string'
          ? customer.invoice_settings.default_payment_method
          : customer.invoice_settings?.default_payment_method?.id,
      createdAt: new Date(customer.created * 1000).toISOString(),
    };
  }

  private async realSavePaymentMethod(
    customerId: string,
    paymentMethodId: string,
    setAsDefault: boolean
  ): Promise<PaymentMethod> {
    const stripe = this.getStripeClient();

    let paymentMethod: Stripe.PaymentMethod;
    try {
      paymentMethod = await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    } catch (error: any) {
      // If already attached to this customer, retrieve and continue.
      const maybeCode = String(error?.code || '').toLowerCase();
      const maybeType = String(error?.type || '').toLowerCase();
      if (maybeCode.includes('already') || maybeType.includes('invalid_request')) {
        paymentMethod = (await stripe.paymentMethods.retrieve(paymentMethodId)) as Stripe.PaymentMethod;
      } else {
        throw error;
      }
    }

    if (setAsDefault) {
      await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethod.id,
        },
      });
    }

    if (paymentMethod.type !== 'card' || !paymentMethod.card) {
      throw new Error(`Unsupported payment method type: ${paymentMethod.type}`);
    }

    return {
      id: paymentMethod.id,
      type: 'card',
      card: {
        brand: paymentMethod.card.brand,
        last4: paymentMethod.card.last4,
        expMonth: paymentMethod.card.exp_month,
        expYear: paymentMethod.card.exp_year,
      },
      billingDetails: {
        name: paymentMethod.billing_details.name || undefined,
        email: paymentMethod.billing_details.email || undefined,
        address: {
          postalCode: paymentMethod.billing_details.address?.postal_code || undefined,
        },
      },
      isDefault: setAsDefault,
      createdAt: new Date(paymentMethod.created * 1000).toISOString(),
    };
  }

  private async realSetupRecurring(
    customerId: string,
    paymentMethodId: string,
    amountCents: number,
    intervalMonths: number,
    totalPayments: number
  ): Promise<RecurringPayment> {
    const stripe = this.getStripeClient();
    const product = await stripe.products.create({
      name: 'Patient Payment Plan',
      metadata: {
        tenantId: this.tenantId,
      },
    });
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      default_payment_method: paymentMethodId,
      collection_method: 'charge_automatically',
      metadata: {
        tenantId: this.tenantId,
        totalPayments: String(totalPayments),
      },
      items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: amountCents,
            recurring: {
              interval: 'month',
              interval_count: intervalMonths,
            },
            product: product.id,
          },
        },
      ],
    });

    const firstItem = subscription.items.data[0];
    const nextPaymentDate = firstItem?.current_period_end
      ? new Date(firstItem.current_period_end * 1000).toISOString()
      : new Date().toISOString();

    return {
      id: subscription.id,
      customerId,
      paymentMethodId,
      amount: amountCents,
      currency: 'usd',
      interval: 'month',
      intervalCount: intervalMonths,
      status: this.mapSubscriptionStatus(subscription.status),
      nextPaymentDate,
      totalPayments,
      completedPayments: 0,
    };
  }

  private async realCreateCheckoutSession(input: {
    patientId: string;
    lineItems: CheckoutLineItem[];
    successUrl: string;
    cancelUrl: string;
    metadata?: Record<string, string>;
    customerEmail?: string;
  }): Promise<CheckoutSessionResult> {
    const stripe = this.getStripeClient();
    const customerId = await this.getOrCreateCustomer(input.patientId);
    const metadata = this.normalizeMetadata(input.metadata);
    const destinationChargeParams = this.getDestinationChargeParams();
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        customer: customerId,
        customer_email: customerId ? undefined : input.customerEmail || undefined,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        metadata,
        payment_intent_data: {
          metadata,
          ...destinationChargeParams,
        },
        line_items: input.lineItems.map((item) => ({
          quantity: Math.max(1, item.quantity),
          price_data: {
            currency: 'usd',
            unit_amount: Math.max(0, item.unitAmountCents),
            product_data: {
              name: item.name,
              description: item.description || undefined,
              metadata: this.normalizeMetadata({
                productId: item.productId || '',
                sku: item.sku || '',
              }),
            },
          },
        })),
      },
      metadata?.saleId ? { idempotencyKey: `store-checkout-${metadata.saleId}` } : undefined
    );

    return this.mapCheckoutSession(session);
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private async getOrCreateCustomer(patientId: string): Promise<string> {
    // Check if customer exists
    const existing = await pool.query(
      `SELECT stripe_customer_id FROM stripe_customers
       WHERE patient_id = $1 AND tenant_id = $2`,
      [patientId, this.tenantId]
    );

    if (existing.rows.length > 0) {
      return existing.rows[0].stripe_customer_id;
    }

    // Get patient details
    const patientResult = await pool.query(
      `SELECT id, first_name, last_name, email, phone FROM patients WHERE id = $1`,
      [patientId]
    );

    if (patientResult.rows.length === 0) {
      throw new Error('Patient not found');
    }

    const patient = patientResult.rows[0];
    const customer = await this.createCustomer({
      id: patient.id,
      firstName: patient.first_name,
      lastName: patient.last_name,
      email: patient.email,
      phone: patient.phone,
    });

    return customer.id;
  }

  private async storePaymentIntent(patientId: string, intent: PaymentIntent): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO payment_intents
         (tenant_id, patient_id, stripe_payment_intent_id, amount_cents,
          currency, status, client_secret, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          this.tenantId,
          patientId,
          intent.id,
          intent.amount,
          intent.currency,
          intent.status,
          intent.clientSecret,
          intent.metadata ? JSON.stringify(intent.metadata) : null,
        ]
      );
    } catch (error) {
      logger.error('Failed to store payment intent', { error });
    }
  }

  private getStripeSecretKey(): string {
    const credentials = this.getCredentials();
    const candidates = [
      credentials.stripeSecretKey,
      credentials.secretKey,
      credentials.secret_key,
      credentials.apiKey,
      credentials.api_key,
      process.env.STRIPE_SECRET_KEY,
    ];
    const resolved = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim().length > 0);
    return typeof resolved === 'string' ? resolved.trim() : '';
  }

  private getStripeClient(): Stripe {
    const secretKey = this.getStripeSecretKey();
    if (!secretKey) {
      throw new Error('Stripe API key not configured');
    }
    return new Stripe(secretKey);
  }

  private async ensureConfigLoaded(): Promise<void> {
    if (!this.config) {
      await this.loadConfig();
    }
  }

  private resolveStripeMode(): 'mock' | 'test' | 'live' {
    if (this.useMock) {
      return 'mock';
    }

    const configMode = String(this.config?.config?.mode || '').trim().toLowerCase();
    if (configMode === 'live') return 'live';
    if (configMode === 'test') return 'test';

    const secretKey = this.getStripeSecretKey();
    if (secretKey.startsWith('sk_live_')) return 'live';
    if (secretKey.startsWith('sk_test_')) return 'test';
    return 'mock';
  }

  private getStripePublishableKey(): string | undefined {
    const credentials = this.getCredentials();
    const candidates = [
      credentials.stripePublishableKey,
      credentials.publishableKey,
      credentials.publishable_key,
      this.config?.config?.publishableKey,
      process.env.STRIPE_PUBLISHABLE_KEY,
    ];
    const resolved = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim().length > 0);
    return typeof resolved === 'string' ? resolved.trim() : undefined;
  }

  private getStripeConnectConfig(): Record<string, any> {
    const value = this.config?.config?.stripeConnect;
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  private getStripeSubscriptionConfig(): Record<string, any> {
    const value = this.config?.config?.subscription;
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  private async updatePaymentConfig(patch: {
    stripeConnect?: Record<string, any>;
    subscription?: Record<string, any>;
  }): Promise<void> {
    await this.ensureConfigLoaded();
    const current = this.config?.config || {};
    const nextConfig = {
      ...current,
      environment: current.environment || (this.useMock ? 'mock' : 'stripe'),
      mode: current.mode || this.resolveStripeMode(),
      syncFrequencyMinutes: this.config?.syncFrequencyMinutes || current.syncFrequencyMinutes || 60,
      ...(patch.stripeConnect
        ? {
            stripeConnect: {
              ...(current.stripeConnect || {}),
              ...patch.stripeConnect,
            },
          }
        : {}),
      ...(patch.subscription
        ? {
            subscription: {
              ...(current.subscription || {}),
              ...patch.subscription,
            },
          }
        : {}),
    };

    await saveIntegrationConfig(
      this.tenantId,
      'payment',
      this.config?.provider || 'stripe',
      nextConfig
    );
    await this.loadConfig();
  }

  private async getTenantProfile(): Promise<{
    name?: string;
    practiceName?: string;
    practicePhone?: string;
  }> {
    const result = await pool.query(
      `SELECT name, practice_name, practice_phone
       FROM tenants
       WHERE id = $1
       LIMIT 1`,
      [this.tenantId]
    );
    const row = result.rows[0] || {};
    return {
      name: row.name,
      practiceName: row.practice_name,
      practicePhone: row.practice_phone,
    };
  }

  private buildStripeConnectStatus(input: {
    platformConfigured: boolean;
    stripeConnect: Record<string, any>;
    subscription: Record<string, any>;
  }): StripeConnectStatus {
    const accountId = input.stripeConnect.accountId;
    const chargesEnabled = Boolean(input.stripeConnect.chargesEnabled);
    const payoutsEnabled = Boolean(input.stripeConnect.payoutsEnabled);
    const detailsSubmitted = Boolean(input.stripeConnect.detailsSubmitted);
    const requirementsDue = Array.isArray(input.stripeConnect.requirementsDue)
      ? input.stripeConnect.requirementsDue
      : [];

    let onboardingStatus: StripeConnectStatus['onboardingStatus'] = 'not_started';
    if (String(accountId || '').startsWith('acct_mock_') || input.stripeConnect.onboardingStatus === 'mock') {
      onboardingStatus = 'mock';
    } else if (accountId && chargesEnabled && payoutsEnabled && detailsSubmitted && requirementsDue.length === 0) {
      onboardingStatus = 'complete';
    } else if (accountId && (chargesEnabled || payoutsEnabled || detailsSubmitted)) {
      onboardingStatus = 'pending';
    } else if (accountId) {
      onboardingStatus = 'restricted';
    }

    return {
      mode: this.resolveStripeMode() || 'unknown',
      platformConfigured: input.platformConfigured,
      publishableKey: this.getStripePublishableKey(),
      connectedAccountId: accountId || undefined,
      accountType: input.stripeConnect.accountType || undefined,
      onboardingStatus,
      chargesEnabled,
      payoutsEnabled,
      destinationChargesEnabled: onboardingStatus === 'complete',
      detailsSubmitted,
      requirementsDue,
      disabledReason: input.stripeConnect.disabledReason || (!input.platformConfigured ? 'Stripe platform key is not configured' : null),
      lastSyncedAt: input.stripeConnect.lastSyncedAt || null,
      subscription: {
        status: input.subscription.status || 'not_started',
        customerId: input.subscription.customerId,
        subscriptionId: input.subscription.subscriptionId,
        priceId: input.subscription.priceId,
        currentPeriodEnd: input.subscription.currentPeriodEnd || null,
        cancelAtPeriodEnd: Boolean(input.subscription.cancelAtPeriodEnd),
        checkoutSessionId: input.subscription.checkoutSessionId,
      },
    };
  }

  private mapStripeAccountToConnectConfig(account: Stripe.Account): Record<string, any> {
    const requirements = account.requirements as any;
    return {
      accountId: account.id,
      accountType: account.type || 'express',
      chargesEnabled: Boolean(account.charges_enabled),
      payoutsEnabled: Boolean(account.payouts_enabled),
      detailsSubmitted: Boolean(account.details_submitted),
      requirementsDue: [
        ...(requirements?.currently_due || []),
        ...(requirements?.past_due || []),
      ],
      disabledReason: requirements?.disabled_reason || null,
      lastSyncedAt: new Date().toISOString(),
    };
  }

  private async persistStripeAccountStatus(account: Stripe.Account): Promise<void> {
    await this.updatePaymentConfig({
      stripeConnect: this.mapStripeAccountToConnectConfig(account),
    });
  }

  private getDestinationChargeParams():
    | Pick<Stripe.PaymentIntentCreateParams, 'on_behalf_of' | 'transfer_data'>
    | Record<string, never> {
    if (this.useMock) {
      return {};
    }

    const stripeConnect = this.getStripeConnectConfig();
    const accountId = typeof stripeConnect.accountId === 'string' ? stripeConnect.accountId.trim() : '';
    if (!accountId || accountId.startsWith('acct_mock_')) {
      return {};
    }

    const requirementsDue = Array.isArray(stripeConnect.requirementsDue)
      ? stripeConnect.requirementsDue
      : [];
    const accountReady =
      Boolean(stripeConnect.chargesEnabled) &&
      Boolean(stripeConnect.payoutsEnabled) &&
      Boolean(stripeConnect.detailsSubmitted) &&
      requirementsDue.length === 0;

    if (!accountReady) {
      return {};
    }

    return {
      on_behalf_of: accountId,
      transfer_data: {
        destination: accountId,
      },
    };
  }

  private mapStripeSubscriptionToConfig(subscription: Stripe.Subscription): Record<string, any> {
    const firstItem = subscription.items?.data?.[0] as any;
    return {
      status: subscription.status,
      customerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id,
      subscriptionId: subscription.id,
      priceId: typeof firstItem?.price === 'string' ? firstItem.price : firstItem?.price?.id,
      currentPeriodEnd: firstItem?.current_period_end
        ? new Date(firstItem.current_period_end * 1000).toISOString()
        : null,
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    };
  }

  private normalizeMetadata(metadata?: Record<string, string>): Record<string, string> | undefined {
    if (!metadata) {
      return undefined;
    }
    const entries: Array<[string, string]> = Object.entries(metadata)
      .filter((entry): entry is [string, string] => {
        const [key, value] = entry;
        return Boolean(key) && value !== undefined && value !== null;
      })
      .map(([key, value]): [string, string] => [String(key), String(value)])
      .filter(([key, value]) => {
        if (this.isUnsafePaymentMetadataKey(key)) {
          logger.warn('Dropped unsafe payment metadata key before sending to Stripe', { key });
          return false;
        }
        if (scanAiPhi(`${key}: ${value}`).some((entity) => entity.risk === 'block')) {
          logger.warn('Dropped payment metadata value that looked patient-identifying before sending to Stripe', { key });
          return false;
        }
        return true;
      });
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  }

  private isUnsafePaymentMetadataKey(key: string): boolean {
    return /(?:patient|name|dob|birth|mrn|chart|ssn|email|phone|address|diagnosis|icd|cpt|procedure|medication|prescription|insurance|member|subscriber|policy|group)/i.test(key);
  }

  private mapPaymentIntentStatus(status: Stripe.PaymentIntent.Status): PaymentIntent['status'] {
    if (status === 'requires_payment_method') return 'requires_payment_method';
    if (status === 'requires_confirmation') return 'requires_confirmation';
    if (status === 'processing') return 'processing';
    if (status === 'succeeded') return 'succeeded';
    if (status === 'canceled') return 'cancelled';
    // requires_action / requires_capture are closest to confirmation state
    return 'requires_confirmation';
  }

  private mapProcessStatus(status: Stripe.PaymentIntent.Status): PaymentResult['status'] {
    if (status === 'succeeded') return 'succeeded';
    if (status === 'processing') return 'processing';
    if (status === 'requires_action') return 'requires_action';
    return 'failed';
  }

  private mapRefundStatus(status: string | null | undefined): RefundResult['status'] {
    if (status === 'succeeded') return 'succeeded';
    if (status === 'pending') return 'pending';
    return 'failed';
  }

  private mapRefundReason(reason?: string): Stripe.RefundCreateParams.Reason | undefined {
    if (!reason) return undefined;
    const normalized = reason.trim().toLowerCase();
    if (normalized.includes('fraud')) return 'fraudulent';
    if (normalized.includes('duplicate')) return 'duplicate';
    return 'requested_by_customer';
  }

  private mapSubscriptionStatus(status: Stripe.Subscription.Status): RecurringPayment['status'] {
    if (status === 'active' || status === 'trialing') return 'active';
    if (status === 'paused' || status === 'past_due' || status === 'unpaid') return 'paused';
    if (status === 'canceled' || status === 'incomplete_expired') return 'cancelled';
    return 'active';
  }

  private mapCheckoutSession(session: Stripe.Checkout.Session): CheckoutSessionResult {
    const paymentIntent =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id;

    return {
      id: session.id,
      url: session.url || undefined,
      paymentIntentId: paymentIntent || undefined,
      paymentStatus: session.payment_status,
      amountTotal: session.amount_total || 0,
      currency: session.currency || 'usd',
      mode: 'stripe',
      metadata: session.metadata || undefined,
      createdAt: new Date(session.created * 1000).toISOString(),
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createPaymentAdapter(
  tenantId: string,
  useMock: boolean = true
): PaymentAdapter {
  return new PaymentAdapter({
    tenantId,
    useMock,
  });
}
