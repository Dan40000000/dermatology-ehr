/**
 * Payment Processing Adapter
 *
 * Handles patient payment processing via Stripe.
 * Supports payment intents, saved payment methods, refunds,
 * and recurring payments for payment plans.
 */

import crypto from 'crypto';
import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import { BaseAdapter, AdapterOptions } from './baseAdapter';

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
      // In production, verify Stripe API key
      const credentials = this.getCredentials();
      if (!credentials.stripeSecretKey) {
        return {
          success: false,
          message: 'Stripe API key not configured',
        };
      }

      await this.sleep(300);

      await this.logIntegration({
        direction: 'outbound',
        endpoint: '/v1/account',
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

    logger.info('Creating payment intent', {
      amountCents,
      patientId,
    });

    try {
      let intent: PaymentIntent;

      // Get or create Stripe customer
      const customerId = await this.getOrCreateCustomer(patientId);

      if (this.useMock) {
        intent = await this.mockCreatePaymentIntent(amountCents, customerId, metadata);
      } else {
        intent = await this.withRetry(() =>
          this.realCreatePaymentIntent(amountCents, customerId, metadata)
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

  // ============================================================================
  // Real API Implementations (placeholders)
  // ============================================================================

  private async realCreatePaymentIntent(
    amountCents: number,
    customerId: string,
    metadata?: Record<string, string>
  ): Promise<PaymentIntent> {
    throw new Error('Real API not implemented - use mock mode');
  }

  private async realProcessPayment(
    paymentIntentId: string,
    paymentMethodId: string
  ): Promise<PaymentResult> {
    throw new Error('Real API not implemented - use mock mode');
  }

  private async realRefundPayment(
    paymentIntentId: string,
    amountCents?: number,
    reason?: string
  ): Promise<RefundResult> {
    throw new Error('Real API not implemented - use mock mode');
  }

  private async realCreateCustomer(patient: Patient): Promise<StripeCustomer> {
    throw new Error('Real API not implemented - use mock mode');
  }

  private async realSavePaymentMethod(
    customerId: string,
    paymentMethodId: string,
    setAsDefault: boolean
  ): Promise<PaymentMethod> {
    throw new Error('Real API not implemented - use mock mode');
  }

  private async realSetupRecurring(
    customerId: string,
    paymentMethodId: string,
    amountCents: number,
    intervalMonths: number,
    totalPayments: number
  ): Promise<RecurringPayment> {
    throw new Error('Real API not implemented - use mock mode');
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
