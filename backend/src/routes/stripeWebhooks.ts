import { Router } from "express";
import Stripe from "stripe";
import { logger } from "../lib/logger";
import * as productSalesService from "../services/productSalesService";

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

    return res.json({ received: true });
  } catch (error: any) {
    logger.error("Stripe webhook processing failed", { eventType: event.type, error: error.message });
    return res.status(500).json({ error: "Failed to process Stripe webhook" });
  }
});
