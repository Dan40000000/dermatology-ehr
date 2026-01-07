-- Patient Portal Billing and Payment System
-- Comprehensive bill pay functionality for patient portal

-- Payment methods (tokenized credit cards, ACH)
CREATE TABLE portal_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(255) NOT NULL,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  payment_type varchar(50) NOT NULL, -- credit_card, debit_card, ach, bank_account

  -- Tokenization (never store real card numbers!)
  token varchar(255) NOT NULL UNIQUE, -- Stripe/payment processor token
  processor varchar(50) DEFAULT 'stripe', -- stripe, square, authorize_net

  -- Display information (last 4 digits, brand, etc.)
  last_four varchar(4) NOT NULL,
  card_brand varchar(50), -- visa, mastercard, amex, discover
  account_type varchar(50), -- checking, savings (for ACH)
  bank_name varchar(255), -- for ACH

  cardholder_name varchar(255),
  expiry_month integer,
  expiry_year integer,

  billing_address jsonb, -- {street, city, state, zip, country}

  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,

  created_at timestamp DEFAULT current_timestamp,
  updated_at timestamp DEFAULT current_timestamp,

  CONSTRAINT valid_payment_type CHECK (payment_type IN ('credit_card', 'debit_card', 'ach', 'bank_account')),
  CONSTRAINT valid_expiry_month CHECK (expiry_month IS NULL OR (expiry_month >= 1 AND expiry_month <= 12)),
  CONSTRAINT valid_expiry_year CHECK (expiry_year IS NULL OR expiry_year >= 2024)
);

CREATE INDEX idx_payment_methods_patient ON portal_payment_methods(patient_id);
CREATE INDEX idx_payment_methods_tenant ON portal_payment_methods(tenant_id);
CREATE INDEX idx_payment_methods_token ON portal_payment_methods(token);
CREATE INDEX idx_payment_methods_active ON portal_payment_methods(is_active) WHERE is_active = true;

COMMENT ON TABLE portal_payment_methods IS 'Tokenized payment methods stored for patients (PCI-compliant)';
COMMENT ON COLUMN portal_payment_methods.token IS 'Payment processor token - NEVER store real card numbers';
COMMENT ON COLUMN portal_payment_methods.last_four IS 'Last 4 digits for display purposes only';

-- Payment transactions
CREATE TABLE portal_payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(255) NOT NULL,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  amount decimal(10,2) NOT NULL,
  currency varchar(3) DEFAULT 'USD',

  status varchar(50) NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed, refunded, cancelled

  payment_method_id uuid REFERENCES portal_payment_methods(id),
  payment_method_type varchar(50), -- credit_card, ach, cash, check

  -- Payment processor details
  processor varchar(50) DEFAULT 'stripe',
  processor_transaction_id varchar(255), -- Stripe charge ID, etc.
  processor_response jsonb, -- full response from payment processor

  -- What this payment is for
  invoice_id uuid, -- if paying a specific invoice
  charge_ids jsonb, -- array of charge IDs being paid
  description text,

  -- Metadata
  ip_address varchar(50),
  user_agent text,

  -- Receipt
  receipt_url varchar(500),
  receipt_number varchar(100) UNIQUE,

  -- Refund tracking
  refund_amount decimal(10,2) DEFAULT 0,
  refund_reason text,
  refunded_at timestamp,
  refunded_by uuid REFERENCES users(id),

  created_at timestamp DEFAULT current_timestamp,
  completed_at timestamp,

  CONSTRAINT valid_amount CHECK (amount > 0),
  CONSTRAINT valid_refund CHECK (refund_amount >= 0 AND refund_amount <= amount),
  CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled'))
);

CREATE INDEX idx_transactions_patient ON portal_payment_transactions(patient_id);
CREATE INDEX idx_transactions_tenant ON portal_payment_transactions(tenant_id);
CREATE INDEX idx_transactions_status ON portal_payment_transactions(status);
CREATE INDEX idx_transactions_created ON portal_payment_transactions(created_at DESC);
CREATE INDEX idx_transactions_receipt ON portal_payment_transactions(receipt_number);
CREATE INDEX idx_transactions_processor_id ON portal_payment_transactions(processor_transaction_id);

COMMENT ON TABLE portal_payment_transactions IS 'All payment transactions processed through patient portal';
COMMENT ON COLUMN portal_payment_transactions.processor_transaction_id IS 'External transaction ID from payment processor (Stripe, Square, etc.)';
COMMENT ON COLUMN portal_payment_transactions.receipt_number IS 'Unique receipt number for patient records';

-- Payment plans
CREATE TABLE portal_payment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(255) NOT NULL,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  total_amount decimal(10,2) NOT NULL,
  amount_paid decimal(10,2) DEFAULT 0,

  installment_amount decimal(10,2) NOT NULL,
  installment_frequency varchar(50) NOT NULL, -- weekly, biweekly, monthly
  number_of_installments integer NOT NULL,

  start_date date NOT NULL,
  next_payment_date date NOT NULL,

  status varchar(50) NOT NULL DEFAULT 'active', -- active, completed, cancelled, defaulted

  auto_pay boolean DEFAULT false,
  payment_method_id uuid REFERENCES portal_payment_methods(id),

  -- What this plan is for
  invoice_id uuid,
  charge_ids jsonb,
  description text,

  terms_accepted boolean DEFAULT false,
  terms_accepted_at timestamp,
  terms_ip_address varchar(50),

  created_at timestamp DEFAULT current_timestamp,
  created_by uuid REFERENCES users(id), -- staff member who set up plan
  completed_at timestamp,
  cancelled_at timestamp,

  CONSTRAINT valid_plan_amount CHECK (total_amount > 0),
  CONSTRAINT valid_installment CHECK (installment_amount > 0),
  CONSTRAINT valid_paid CHECK (amount_paid >= 0 AND amount_paid <= total_amount),
  CONSTRAINT valid_frequency CHECK (installment_frequency IN ('weekly', 'biweekly', 'monthly')),
  CONSTRAINT valid_plan_status CHECK (status IN ('active', 'completed', 'cancelled', 'defaulted'))
);

CREATE INDEX idx_payment_plans_patient ON portal_payment_plans(patient_id);
CREATE INDEX idx_payment_plans_tenant ON portal_payment_plans(tenant_id);
CREATE INDEX idx_payment_plans_status ON portal_payment_plans(status);
CREATE INDEX idx_payment_plans_next_payment ON portal_payment_plans(next_payment_date) WHERE status = 'active';

COMMENT ON TABLE portal_payment_plans IS 'Payment plan agreements for patients to pay over time';
COMMENT ON COLUMN portal_payment_plans.auto_pay IS 'Automatically charge payment method on next_payment_date';

-- Payment plan installments (individual payments in a plan)
CREATE TABLE portal_payment_plan_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(255) NOT NULL,
  payment_plan_id uuid NOT NULL REFERENCES portal_payment_plans(id) ON DELETE CASCADE,

  installment_number integer NOT NULL,
  amount decimal(10,2) NOT NULL,
  due_date date NOT NULL,

  status varchar(50) NOT NULL DEFAULT 'pending', -- pending, paid, failed, waived

  paid_amount decimal(10,2) DEFAULT 0,
  paid_at timestamp,
  transaction_id uuid REFERENCES portal_payment_transactions(id),

  failed_attempts integer DEFAULT 0,
  last_attempt_at timestamp,
  failure_reason text,

  created_at timestamp DEFAULT current_timestamp,

  CONSTRAINT valid_installment_amount CHECK (amount > 0),
  CONSTRAINT valid_paid_amount CHECK (paid_amount >= 0 AND paid_amount <= amount),
  CONSTRAINT valid_installment_status CHECK (status IN ('pending', 'paid', 'failed', 'waived'))
);

CREATE INDEX idx_installments_plan ON portal_payment_plan_installments(payment_plan_id);
CREATE INDEX idx_installments_tenant ON portal_payment_plan_installments(tenant_id);
CREATE INDEX idx_installments_status ON portal_payment_plan_installments(status);
CREATE INDEX idx_installments_due_date ON portal_payment_plan_installments(due_date);

COMMENT ON TABLE portal_payment_plan_installments IS 'Individual installment payments within a payment plan';

-- Patient balances view (for quick balance lookup)
CREATE TABLE portal_patient_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(255) NOT NULL,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE UNIQUE,

  total_charges decimal(10,2) DEFAULT 0,
  total_payments decimal(10,2) DEFAULT 0,
  total_adjustments decimal(10,2) DEFAULT 0,

  current_balance decimal(10,2) GENERATED ALWAYS AS (total_charges - total_payments - total_adjustments) STORED,

  last_payment_date timestamp,
  last_payment_amount decimal(10,2),

  last_updated timestamp DEFAULT current_timestamp,

  CONSTRAINT valid_charges CHECK (total_charges >= 0),
  CONSTRAINT valid_payments CHECK (total_payments >= 0)
);

CREATE INDEX idx_balances_patient ON portal_patient_balances(patient_id);
CREATE INDEX idx_balances_tenant ON portal_patient_balances(tenant_id);
CREATE INDEX idx_balances_current ON portal_patient_balances(current_balance) WHERE current_balance > 0;

COMMENT ON TABLE portal_patient_balances IS 'Cached patient balance information for quick portal display';
COMMENT ON COLUMN portal_patient_balances.current_balance IS 'Computed column: total_charges - total_payments - total_adjustments';

-- Auto-pay enrollments
CREATE TABLE portal_autopay_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(255) NOT NULL,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  payment_method_id uuid NOT NULL REFERENCES portal_payment_methods(id) ON DELETE CASCADE,

  is_active boolean DEFAULT true,

  -- When to charge
  charge_day integer DEFAULT 1, -- day of month (1-28)
  charge_all_balances boolean DEFAULT true, -- charge entire balance vs minimum
  minimum_amount decimal(10,2), -- if not charging all, minimum to charge

  -- Notifications
  notify_before_charge boolean DEFAULT true,
  notification_days integer DEFAULT 3, -- notify 3 days before charging

  enrolled_at timestamp DEFAULT current_timestamp,
  terms_accepted boolean DEFAULT false,
  terms_accepted_at timestamp,

  last_charge_date timestamp,
  last_charge_amount decimal(10,2),

  cancelled_at timestamp,
  cancelled_reason text,

  CONSTRAINT valid_charge_day CHECK (charge_day >= 1 AND charge_day <= 28)
);

CREATE INDEX idx_autopay_patient ON portal_autopay_enrollments(patient_id);
CREATE INDEX idx_autopay_tenant ON portal_autopay_enrollments(tenant_id);
CREATE INDEX idx_autopay_active ON portal_autopay_enrollments(is_active) WHERE is_active = true;

COMMENT ON TABLE portal_autopay_enrollments IS 'Patient enrollments in automatic payment programs';
COMMENT ON COLUMN portal_autopay_enrollments.charge_day IS 'Day of month to process auto-payment (1-28 to avoid month-end issues)';

-- Initialize balances for existing patients
INSERT INTO portal_patient_balances (tenant_id, patient_id, total_charges, total_payments, total_adjustments)
SELECT
  p.tenant_id,
  p.id,
  COALESCE(SUM(CASE WHEN c.transaction_type = 'charge' THEN c.amount ELSE 0 END), 0) as total_charges,
  COALESCE(SUM(CASE WHEN c.transaction_type = 'payment' THEN c.amount ELSE 0 END), 0) as total_payments,
  COALESCE(SUM(CASE WHEN c.transaction_type = 'adjustment' THEN c.amount ELSE 0 END), 0) as total_adjustments
FROM patients p
LEFT JOIN charges c ON c.patient_id = p.id AND c.tenant_id = p.tenant_id
GROUP BY p.tenant_id, p.id
ON CONFLICT (patient_id) DO UPDATE SET
  total_charges = EXCLUDED.total_charges,
  total_payments = EXCLUDED.total_payments,
  total_adjustments = EXCLUDED.total_adjustments,
  last_updated = current_timestamp;

COMMENT ON TABLE portal_payment_methods IS 'Securely tokenized payment methods for patient portal payments';
COMMENT ON TABLE portal_payment_transactions IS 'Transaction history for all portal payments';
COMMENT ON TABLE portal_payment_plans IS 'Payment plan agreements allowing patients to pay over time';
