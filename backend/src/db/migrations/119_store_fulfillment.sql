-- Migration: Store Fulfillment Operations
-- Description: Shipping, payment, and notification metadata for patient store orders.

CREATE TABLE IF NOT EXISTS store_order_fulfillments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES product_sales(id) ON DELETE CASCADE,
  patient_id VARCHAR(255) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  channel VARCHAR(50) NOT NULL DEFAULT 'patient_portal',
  fulfillment_status VARCHAR(50) NOT NULL DEFAULT 'paid',
  shipping_method VARCHAR(50) NOT NULL DEFAULT 'standard',
  shipping_fee INTEGER NOT NULL DEFAULT 0,
  carrier VARCHAR(100),
  tracking_number VARCHAR(120),
  shipping_address JSONB NOT NULL DEFAULT '{}'::jsonb,

  notification_email VARCHAR(255),
  notification_status VARCHAR(50) NOT NULL DEFAULT 'queued',
  last_notification_at TIMESTAMP,

  stripe_payment_intent_id VARCHAR(255),
  stripe_payment_status VARCHAR(80) NOT NULL DEFAULT 'paid',

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(sale_id),
  CONSTRAINT valid_store_fulfillment_channel CHECK (channel IN ('patient_portal', 'public_store', 'staff')),
  CONSTRAINT valid_store_fulfillment_status CHECK (fulfillment_status IN ('paid', 'packing', 'label_created', 'shipped', 'delivered', 'exception', 'cancelled')),
  CONSTRAINT valid_store_notification_status CHECK (notification_status IN ('queued', 'sent', 'failed', 'muted')),
  CONSTRAINT valid_store_shipping_method CHECK (shipping_method IN ('standard', 'priority', 'pickup')),
  CONSTRAINT valid_store_shipping_fee CHECK (shipping_fee >= 0)
);

CREATE INDEX IF NOT EXISTS idx_store_fulfillments_tenant ON store_order_fulfillments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_store_fulfillments_sale ON store_order_fulfillments(sale_id);
CREATE INDEX IF NOT EXISTS idx_store_fulfillments_patient ON store_order_fulfillments(patient_id);
CREATE INDEX IF NOT EXISTS idx_store_fulfillments_status ON store_order_fulfillments(tenant_id, fulfillment_status);
CREATE INDEX IF NOT EXISTS idx_store_fulfillments_created ON store_order_fulfillments(created_at DESC);

COMMENT ON TABLE store_order_fulfillments IS 'Operational fulfillment metadata for patient portal and public store orders';
COMMENT ON COLUMN store_order_fulfillments.shipping_address IS 'Patient-entered shipping details stored as structured JSON';
COMMENT ON COLUMN store_order_fulfillments.stripe_payment_intent_id IS 'Stripe PaymentIntent or Checkout Session identifier when available';
