-- Migration: Cosmetic Packages and Membership System
-- Version: 101
-- Description: Complete cosmetic service packages, memberships, and loyalty program

-- =============================================================================
-- COSMETIC SERVICES TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS cosmetic_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) NOT NULL,
    subcategory VARCHAR(100),
    base_price_cents INTEGER NOT NULL,
    unit_type VARCHAR(50) NOT NULL CHECK (unit_type IN ('units', 'area', 'session', 'syringe', 'vial', 'treatment')),
    units_per_session INTEGER DEFAULT 1,
    loyalty_points_per_dollar INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cosmetic_services_tenant ON cosmetic_services(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cosmetic_services_category ON cosmetic_services(tenant_id, category);
CREATE INDEX IF NOT EXISTS idx_cosmetic_services_active ON cosmetic_services(tenant_id, is_active);

-- =============================================================================
-- COSMETIC PACKAGES TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS cosmetic_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    -- JSONB array of service items: [{serviceId, quantity, discountPercent}]
    services JSONB NOT NULL DEFAULT '[]',
    package_price_cents INTEGER NOT NULL,
    original_price_cents INTEGER,
    savings_amount_cents INTEGER GENERATED ALWAYS AS (COALESCE(original_price_cents, package_price_cents) - package_price_cents) STORED,
    savings_percent NUMERIC(5,2),
    validity_days INTEGER NOT NULL DEFAULT 365,
    max_redemptions_per_service JSONB DEFAULT '{}',
    terms_conditions TEXT,
    is_featured BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cosmetic_packages_tenant ON cosmetic_packages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cosmetic_packages_active ON cosmetic_packages(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_cosmetic_packages_featured ON cosmetic_packages(tenant_id, is_featured, is_active);

-- =============================================================================
-- PATIENT PACKAGES TABLE (Purchased packages)
-- =============================================================================
CREATE TABLE IF NOT EXISTS patient_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(100) NOT NULL,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    package_id UUID NOT NULL REFERENCES cosmetic_packages(id),
    purchase_date TIMESTAMPTZ DEFAULT NOW(),
    expiration_date TIMESTAMPTZ NOT NULL,
    amount_paid_cents INTEGER NOT NULL,
    payment_method VARCHAR(50),
    payment_reference VARCHAR(255),
    -- JSONB tracking remaining services: {serviceId: {original: N, remaining: M}}
    remaining_services JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'fully_redeemed', 'cancelled', 'refunded')),
    notes TEXT,
    purchased_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_packages_tenant ON patient_packages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_patient_packages_patient ON patient_packages(tenant_id, patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_packages_status ON patient_packages(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_patient_packages_expiration ON patient_packages(expiration_date) WHERE status = 'active';

-- =============================================================================
-- PACKAGE REDEMPTIONS TABLE (Track individual service uses)
-- =============================================================================
CREATE TABLE IF NOT EXISTS package_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(100) NOT NULL,
    patient_package_id UUID NOT NULL REFERENCES patient_packages(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES cosmetic_services(id),
    encounter_id UUID REFERENCES encounters(id),
    redeemed_at TIMESTAMPTZ DEFAULT NOW(),
    quantity INTEGER NOT NULL DEFAULT 1,
    redeemed_by UUID,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_package_redemptions_patient_package ON package_redemptions(patient_package_id);
CREATE INDEX IF NOT EXISTS idx_package_redemptions_service ON package_redemptions(service_id);

-- =============================================================================
-- MEMBERSHIP PLANS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS membership_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    tier VARCHAR(50) DEFAULT 'standard',
    monthly_price_cents INTEGER NOT NULL,
    annual_price_cents INTEGER,
    -- JSONB array of benefits: [{type, description, value}]
    benefits JSONB NOT NULL DEFAULT '[]',
    discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
    -- Array of service IDs included free
    included_services JSONB DEFAULT '[]',
    -- JSONB map of service-specific discounts: {serviceId: discountPercent}
    service_discounts JSONB DEFAULT '{}',
    priority_booking BOOLEAN DEFAULT FALSE,
    free_consultations BOOLEAN DEFAULT FALSE,
    loyalty_points_multiplier NUMERIC(3,2) DEFAULT 1.0,
    min_commitment_months INTEGER DEFAULT 0,
    cancellation_notice_days INTEGER DEFAULT 30,
    is_active BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_membership_plans_tenant ON membership_plans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_membership_plans_active ON membership_plans(tenant_id, is_active);

-- =============================================================================
-- PATIENT MEMBERSHIPS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS patient_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(100) NOT NULL,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES membership_plans(id),
    start_date DATE NOT NULL,
    end_date DATE,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled', 'expired', 'pending')),
    billing_frequency VARCHAR(20) DEFAULT 'monthly' CHECK (billing_frequency IN ('monthly', 'annual')),
    billing_day INTEGER CHECK (billing_day >= 1 AND billing_day <= 28),
    next_billing_date DATE,
    payment_method_id VARCHAR(255),
    payment_method_type VARCHAR(50),
    payment_method_last4 VARCHAR(4),
    cancellation_date DATE,
    cancellation_reason TEXT,
    pause_start_date DATE,
    pause_end_date DATE,
    enrolled_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_memberships_tenant ON patient_memberships(tenant_id);
CREATE INDEX IF NOT EXISTS idx_patient_memberships_patient ON patient_memberships(tenant_id, patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_memberships_status ON patient_memberships(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_patient_memberships_billing ON patient_memberships(next_billing_date) WHERE status = 'active';

-- =============================================================================
-- MEMBERSHIP BILLING HISTORY TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS membership_billing_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(100) NOT NULL,
    membership_id UUID NOT NULL REFERENCES patient_memberships(id) ON DELETE CASCADE,
    billing_date DATE NOT NULL,
    amount_cents INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
    payment_method_id VARCHAR(255),
    transaction_id VARCHAR(255),
    failure_reason TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_membership_billing_membership ON membership_billing_history(membership_id);
CREATE INDEX IF NOT EXISTS idx_membership_billing_status ON membership_billing_history(tenant_id, status, billing_date);

-- =============================================================================
-- LOYALTY POINTS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS loyalty_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(100) NOT NULL,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    points_balance INTEGER NOT NULL DEFAULT 0,
    lifetime_earned INTEGER NOT NULL DEFAULT 0,
    lifetime_redeemed INTEGER NOT NULL DEFAULT 0,
    tier VARCHAR(50) DEFAULT 'bronze',
    tier_updated_at TIMESTAMPTZ,
    last_activity TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, patient_id)
);

CREATE INDEX IF NOT EXISTS idx_loyalty_points_tenant ON loyalty_points(tenant_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_points_patient ON loyalty_points(patient_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_points_tier ON loyalty_points(tenant_id, tier);

-- =============================================================================
-- LOYALTY TRANSACTIONS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS loyalty_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(100) NOT NULL,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    points INTEGER NOT NULL,
    transaction_type VARCHAR(50) NOT NULL CHECK (transaction_type IN ('earn', 'redeem', 'expire', 'adjust', 'bonus', 'referral')),
    reference_type VARCHAR(50),
    reference_id UUID,
    description TEXT,
    balance_after INTEGER NOT NULL,
    expires_at TIMESTAMPTZ,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_tenant ON loyalty_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_patient ON loyalty_transactions(tenant_id, patient_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_type ON loyalty_transactions(tenant_id, transaction_type);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_date ON loyalty_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_expiry ON loyalty_transactions(expires_at) WHERE expires_at IS NOT NULL AND transaction_type = 'earn';

-- =============================================================================
-- LOYALTY TIERS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS loyalty_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(100) NOT NULL,
    name VARCHAR(100) NOT NULL,
    min_lifetime_points INTEGER NOT NULL,
    discount_percent NUMERIC(5,2) DEFAULT 0,
    points_multiplier NUMERIC(3,2) DEFAULT 1.0,
    benefits JSONB DEFAULT '[]',
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_tiers_tenant ON loyalty_tiers(tenant_id);

-- =============================================================================
-- SEED DATA: Sample Cosmetic Services
-- =============================================================================
INSERT INTO cosmetic_services (tenant_id, name, description, category, subcategory, base_price_cents, unit_type, loyalty_points_per_dollar, display_order) VALUES
-- Neurotoxins
('tenant-demo', 'Botox Cosmetic', 'Botulinum toxin type A for wrinkle reduction', 'neurotoxins', 'botox', 1500, 'units', 2, 1),
('tenant-demo', 'Dysport', 'Botulinum toxin for moderate to severe frown lines', 'neurotoxins', 'dysport', 500, 'units', 2, 2),
('tenant-demo', 'Xeomin', 'Pure form botulinum toxin without complexing proteins', 'neurotoxins', 'xeomin', 1400, 'units', 2, 3),

-- Dermal Fillers
('tenant-demo', 'Juvederm Ultra Plus XC', 'Hyaluronic acid filler for facial wrinkles and folds', 'dermal_fillers', 'juvederm', 75000, 'syringe', 2, 10),
('tenant-demo', 'Juvederm Voluma XC', 'HA filler for cheek augmentation and volume loss', 'dermal_fillers', 'juvederm', 85000, 'syringe', 2, 11),
('tenant-demo', 'Restylane Lyft', 'HA filler for cheeks and midface', 'dermal_fillers', 'restylane', 70000, 'syringe', 2, 12),
('tenant-demo', 'Restylane Kysse', 'HA filler specifically designed for lips', 'dermal_fillers', 'restylane', 75000, 'syringe', 2, 13),
('tenant-demo', 'Sculptra Aesthetic', 'Poly-L-lactic acid for deep facial wrinkles', 'dermal_fillers', 'sculptra', 90000, 'vial', 2, 14),

-- Laser Hair Removal
('tenant-demo', 'Laser Hair Removal - Small Area', 'Upper lip, chin, underarms', 'laser_hair_removal', 'small', 15000, 'session', 1, 20),
('tenant-demo', 'Laser Hair Removal - Medium Area', 'Bikini, lower legs', 'laser_hair_removal', 'medium', 30000, 'session', 1, 21),
('tenant-demo', 'Laser Hair Removal - Large Area', 'Full legs, back, chest', 'laser_hair_removal', 'large', 45000, 'session', 1, 22),

-- Chemical Peels
('tenant-demo', 'Superficial Chemical Peel', 'Light glycolic or salicylic acid peel', 'chemical_peels', 'superficial', 12500, 'treatment', 1, 30),
('tenant-demo', 'Medium Chemical Peel', 'TCA peel for moderate skin concerns', 'chemical_peels', 'medium', 25000, 'treatment', 1, 31),
('tenant-demo', 'VI Peel', 'Medical-grade chemical peel', 'chemical_peels', 'vi_peel', 35000, 'treatment', 1, 32),

-- Microneedling
('tenant-demo', 'Microneedling', 'Collagen induction therapy', 'microneedling', 'standard', 35000, 'treatment', 1, 40),
('tenant-demo', 'Microneedling with PRP', 'Microneedling combined with platelet-rich plasma', 'microneedling', 'prp', 55000, 'treatment', 2, 41),

-- Consultations
('tenant-demo', 'Cosmetic Consultation', 'Initial cosmetic consultation', 'consultation', 'initial', 0, 'session', 0, 50),
('tenant-demo', 'Follow-up Consultation', 'Follow-up for existing patients', 'consultation', 'followup', 0, 'session', 0, 51)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- SEED DATA: Sample Packages
-- =============================================================================
INSERT INTO cosmetic_packages (tenant_id, name, description, category, services, package_price_cents, original_price_cents, validity_days, is_featured, display_order) VALUES
-- Filler Package
('tenant-demo', 'Filler Refresh Package',
 'Buy 2 syringes of filler, get the 3rd at 50% off. Perfect for lips, cheeks, and chin enhancement.',
 'dermal_fillers',
 '[{"serviceId": "juvederm_ultra", "name": "Juvederm Ultra Plus XC", "quantity": 3, "discountedUnits": 1, "discountPercent": 50}]'::jsonb,
 18750, 22500, 365, TRUE, 1),

-- Laser Hair Removal Package
('tenant-demo', 'Laser Hair Removal - 6 Session Package',
 'Complete 6-session package for optimal hair reduction. Includes complimentary consultation.',
 'laser_hair_removal',
 '[{"serviceId": "laser_hair_medium", "name": "Laser Hair Removal - Medium Area", "quantity": 6}]'::jsonb,
 135000, 180000, 730, TRUE, 2),

-- Chemical Peel Series
('tenant-demo', 'Peel Perfection Series',
 '3-peel package for progressive skin improvement. Spaced 4-6 weeks apart.',
 'chemical_peels',
 '[{"serviceId": "superficial_peel", "name": "Superficial Chemical Peel", "quantity": 3}]'::jsonb,
 30000, 37500, 365, FALSE, 3),

-- Anti-Aging Bundle
('tenant-demo', 'Ultimate Anti-Aging Bundle',
 'Comprehensive anti-aging treatment: Botox for wrinkles, filler for volume, and microneedling for texture.',
 'bundles',
 '[{"serviceId": "botox", "name": "Botox (up to 50 units)", "quantity": 1}, {"serviceId": "filler", "name": "1 Syringe Filler", "quantity": 1}, {"serviceId": "microneedling", "name": "Microneedling Treatment", "quantity": 1}]'::jsonb,
 165000, 200000, 180, TRUE, 4)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- SEED DATA: Sample Membership Plans
-- =============================================================================
INSERT INTO membership_plans (tenant_id, name, description, tier, monthly_price_cents, annual_price_cents, benefits, discount_percent, free_consultations, priority_booking, loyalty_points_multiplier, display_order) VALUES
('tenant-demo', 'VIP Glow Membership',
 'Our premium membership with maximum benefits. Priority booking, best discounts, and exclusive perks.',
 'vip',
 19900, 199000,
 '[{"type": "discount", "description": "15% off all cosmetic services", "value": 15}, {"type": "consultation", "description": "Free cosmetic consultations", "value": "unlimited"}, {"type": "booking", "description": "Priority appointment booking", "value": true}, {"type": "points", "description": "2x loyalty points on all purchases", "value": 2}, {"type": "exclusive", "description": "Early access to new treatments", "value": true}, {"type": "gift", "description": "Annual birthday gift", "value": true}]'::jsonb,
 15.00, TRUE, TRUE, 2.0, 1),

('tenant-demo', 'Radiance Membership',
 'Great value for regular clients. Enjoy 10% off treatments and enhanced loyalty rewards.',
 'premium',
 9900, 99000,
 '[{"type": "discount", "description": "10% off all cosmetic services", "value": 10}, {"type": "consultation", "description": "2 free consultations per year", "value": 2}, {"type": "points", "description": "1.5x loyalty points on all purchases", "value": 1.5}]'::jsonb,
 10.00, FALSE, FALSE, 1.5, 2),

('tenant-demo', 'Essential Glow Membership',
 'Entry-level membership with valuable perks. Perfect for trying out our cosmetic services.',
 'standard',
 4900, 49000,
 '[{"type": "discount", "description": "5% off all cosmetic services", "value": 5}, {"type": "consultation", "description": "1 free consultation per year", "value": 1}]'::jsonb,
 5.00, FALSE, FALSE, 1.0, 3)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- SEED DATA: Loyalty Tiers
-- =============================================================================
INSERT INTO loyalty_tiers (tenant_id, name, min_lifetime_points, discount_percent, points_multiplier, benefits, display_order) VALUES
('tenant-demo', 'Bronze', 0, 0, 1.0, '["Earn 1 point per dollar spent", "Redeem points for discounts"]'::jsonb, 1),
('tenant-demo', 'Silver', 5000, 3, 1.25, '["Earn 1.25 points per dollar spent", "3% additional discount on all services", "Birthday bonus points"]'::jsonb, 2),
('tenant-demo', 'Gold', 15000, 5, 1.5, '["Earn 1.5 points per dollar spent", "5% additional discount on all services", "Birthday bonus points", "Early access to promotions"]'::jsonb, 3),
('tenant-demo', 'Platinum', 30000, 8, 2.0, '["Earn 2 points per dollar spent", "8% additional discount on all services", "Birthday bonus points", "Early access to promotions", "Complimentary annual treatment"]'::jsonb, 4)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- COMMENTS
-- =============================================================================
COMMENT ON TABLE cosmetic_services IS 'Catalog of all cosmetic services offered';
COMMENT ON TABLE cosmetic_packages IS 'Pre-defined service bundles with special pricing';
COMMENT ON TABLE patient_packages IS 'Packages purchased by patients';
COMMENT ON TABLE package_redemptions IS 'Track individual service redemptions from packages';
COMMENT ON TABLE membership_plans IS 'Available membership subscription plans';
COMMENT ON TABLE patient_memberships IS 'Active patient membership subscriptions';
COMMENT ON TABLE membership_billing_history IS 'Billing history for memberships';
COMMENT ON TABLE loyalty_points IS 'Patient loyalty point balances';
COMMENT ON TABLE loyalty_transactions IS 'Individual loyalty point transactions';
COMMENT ON TABLE loyalty_tiers IS 'Loyalty program tier definitions';
