import { Router } from "express";
import Stripe from "stripe";
import { logger } from "../lib/logger";
import * as productSalesService from "../services/productSalesService";
import { pool } from "../db/pool";
import { saveIntegrationConfig } from "../integrations/baseAdapter";

export const stripeWebhooksRouter = Router();

function getStripeEvent(req: any): Stripe.Event {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
  const signature = req.get("stripe-signature");

  if (!webhookSecret) {
    throw new Error("Stripe webhook secret is not configured");
  }
  if (!signature) {
    throw new Error("Missing Stripe signature");
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder");
  const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}

async function markStoreOrderPaidFromMetadata(input: {
  tenantId?: string | null;
  saleId?: string | null;
  checkoutSessionId?: string | null;
  paymentIntentId?: string | null;
  paymentStatus?: string | null;
}): Promise<void> {
  if (!input.tenantId || !input.saleId) {
    logger.warn("Stripe payment event missing store order metadata", {
      checkoutSessionId: input.checkoutSessionId,
      paymentIntentId: input.paymentIntentId,
    });
    return;
  }

  await productSalesService.markStoreOrderPaid(input.tenantId, input.saleId, {
    stripeCheckoutSessionId: input.checkoutSessionId || null,
    stripePaymentIntentId: input.paymentIntentId || null,
    stripePaymentStatus: input.paymentStatus || "paid",
    paymentReference: input.checkoutSessionId || input.paymentIntentId || null,
  });
}

function mapStripeSubscriptionToConfig(subscription: Stripe.Subscription): Record<string, any> {
  const firstItem = subscription.items?.data?.[0] as any;
  return {
    status: subscription.status,
    customerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id,
    subscriptionId: subscription.id,
    priceId: typeof firstItem?.price === "string" ? firstItem.price : firstItem?.price?.id,
    currentPeriodEnd: firstItem?.current_period_end
      ? new Date(firstItem.current_period_end * 1000).toISOString()
      : null,
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    lastEventAt: new Date().toISOString(),
  };
}

function mapStripeAccountToConnectConfig(account: Stripe.Account): Record<string, any> {
  const requirements = account.requirements as any;
  return {
    accountId: account.id,
    accountType: account.type || "express",
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

async function patchPaymentIntegrationConfig(
  tenantId: string,
  patch: {
    stripeConnect?: Record<string, any>;
    subscription?: Record<string, any>;
  }
): Promise<void> {
  const existing = await pool.query(
    `SELECT provider, config, sync_frequency_minutes
     FROM integration_configs
     WHERE tenant_id = $1
       AND integration_type = 'payment'
       AND is_active = true
     LIMIT 1`,
    [tenantId]
  );
  const row = existing.rows[0] || {};
  const current = row.config || {};
  const nextConfig = {
    ...current,
    environment: current.environment || "stripe",
    mode: current.mode || "test",
    syncFrequencyMinutes: row.sync_frequency_minutes || current.syncFrequencyMinutes || 60,
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
    tenantId,
    "payment",
    row.provider || "stripe",
    nextConfig
  );
}

async function patchPaymentIntegrationByAccountId(account: Stripe.Account): Promise<void> {
  const result = await pool.query(
    `SELECT tenant_id
     FROM integration_configs
     WHERE integration_type = 'payment'
       AND provider = 'stripe'
       AND is_active = true
       AND config->'stripeConnect'->>'accountId' = $1
     LIMIT 1`,
    [account.id]
  );

  const tenantId = result.rows[0]?.tenant_id || account.metadata?.tenantId;
  if (!tenantId) {
    logger.warn("Stripe account.updated event could not be mapped to a tenant", { accountId: account.id });
    return;
  }

  await patchPaymentIntegrationConfig(tenantId, {
    stripeConnect: mapStripeAccountToConnectConfig(account),
  });
}

async function patchSubscriptionFromCheckoutSession(session: Stripe.Checkout.Session): Promise<void> {
  const tenantId = session.metadata?.tenantId;
  if (!tenantId || session.mode !== "subscription") {
    return;
  }

  await patchPaymentIntegrationConfig(tenantId, {
    subscription: {
      status: "checkout_started",
      customerId: typeof session.customer === "string" ? session.customer : session.customer?.id,
      subscriptionId: typeof session.subscription === "string" ? session.subscription : session.subscription?.id,
      checkoutSessionId: session.id,
      lastEventAt: new Date().toISOString(),
    },
  });
}

async function patchSubscriptionFromStripe(subscription: Stripe.Subscription): Promise<void> {
  const tenantId = subscription.metadata?.tenantId;
  if (!tenantId) {
    logger.warn("Stripe subscription event missing tenant metadata", { subscriptionId: subscription.id });
    return;
  }

  await patchPaymentIntegrationConfig(tenantId, {
    subscription: mapStripeSubscriptionToConfig(subscription),
  });
}

stripeWebhooksRouter.post("/webhook", async (req, res) => {
  let event: Stripe.Event;
  try {
    event = getStripeEvent(req);
  } catch (error: any) {
    logger.warn("Rejected Stripe webhook", { error: error.message });
    return res.status(400).json({ error: error.message || "Invalid Stripe webhook" });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status === "paid") {
        await markStoreOrderPaidFromMetadata({
          tenantId: session.metadata?.tenantId,
          saleId: session.metadata?.saleId,
          checkoutSessionId: session.id,
          paymentIntentId:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id,
          paymentStatus: session.payment_status,
        });
      }
      if (session.mode === "subscription") {
        await patchSubscriptionFromCheckoutSession(session);
      }
    }

    if (event.type === "payment_intent.succeeded") {
      const intent = event.data.object as Stripe.PaymentIntent;
      await markStoreOrderPaidFromMetadata({
        tenantId: intent.metadata?.tenantId,
        saleId: intent.metadata?.saleId,
        paymentIntentId: intent.id,
        paymentStatus: "paid",
      });
    }

    if (event.type === "account.updated") {
      await patchPaymentIntegrationByAccountId(event.data.object as Stripe.Account);
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      await patchSubscriptionFromStripe(event.data.object as Stripe.Subscription);
    }

    return res.json({ received: true });
  } catch (error: any) {
    logger.error("Stripe webhook processing failed", { eventType: event.type, error: error.message });
    return res.status(500).json({ error: "Failed to process Stripe webhook" });
  }
});
