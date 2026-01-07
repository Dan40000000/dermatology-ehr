-- Migration: Direct Secure Messaging (HIPAA-compliant provider-to-provider)
-- Direct messaging is a standardized protocol for secure email-based healthcare communication
-- Supports encrypted message exchange between healthcare organizations

-- Direct messages table (simulates secure Direct messaging protocol)
CREATE TABLE IF NOT EXISTS direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  from_address VARCHAR(255) NOT NULL,  -- Direct address (e.g., provider@practice.direct)
  to_address VARCHAR(255) NOT NULL,    -- External provider's Direct address
  subject VARCHAR(500) NOT NULL,
  body TEXT,
  attachments JSONB DEFAULT '[]'::jsonb,  -- Array of attachment references
  status VARCHAR(50) DEFAULT 'sent',   -- sent, delivered, failed, read
  sent_at TIMESTAMP DEFAULT NOW(),
  delivered_at TIMESTAMP,
  read_at TIMESTAMP,
  transmission_id VARCHAR(100),  -- Mock transmission tracking ID
  error_message TEXT,
  sent_by UUID,  -- User who sent the message
  reply_to_message_id UUID,  -- For threading replies
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_sent_by FOREIGN KEY (sent_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_reply_to FOREIGN KEY (reply_to_message_id) REFERENCES direct_messages(id) ON DELETE SET NULL
);

CREATE INDEX idx_direct_messages_tenant ON direct_messages(tenant_id);
CREATE INDEX idx_direct_messages_from ON direct_messages(from_address);
CREATE INDEX idx_direct_messages_to ON direct_messages(to_address);
CREATE INDEX idx_direct_messages_status ON direct_messages(status);
CREATE INDEX idx_direct_messages_sent_at ON direct_messages(sent_at DESC);

-- Direct contacts/provider directory (external healthcare providers)
CREATE TABLE IF NOT EXISTS direct_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  provider_name VARCHAR(255) NOT NULL,
  specialty VARCHAR(100),
  organization VARCHAR(255),
  direct_address VARCHAR(255) NOT NULL UNIQUE,  -- Their Direct email address
  phone VARCHAR(50),
  fax VARCHAR(50),
  address TEXT,
  notes TEXT,
  is_favorite BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID,
  CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_direct_contacts_tenant ON direct_contacts(tenant_id);
CREATE INDEX idx_direct_contacts_address ON direct_contacts(direct_address);
CREATE INDEX idx_direct_contacts_specialty ON direct_contacts(specialty);
CREATE INDEX idx_direct_contacts_favorite ON direct_contacts(is_favorite);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_direct_messaging_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_direct_messages_updated_at
  BEFORE UPDATE ON direct_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_direct_messaging_timestamp();

CREATE TRIGGER trigger_direct_contacts_updated_at
  BEFORE UPDATE ON direct_contacts
  FOR EACH ROW
  EXECUTE FUNCTION update_direct_messaging_timestamp();

-- Seed sample external provider contacts
INSERT INTO direct_contacts (
  tenant_id,
  provider_name,
  specialty,
  organization,
  direct_address,
  phone,
  fax,
  notes
)
SELECT
  t.id,
  'Dr. Sarah Johnson',
  'Dermatopathology',
  'Mountain View Pathology',
  'sarah.johnson@mvpath.direct',
  '555-0101',
  '555-0102',
  'Preferred pathologist for complex cases'
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM direct_contacts
  WHERE direct_address = 'sarah.johnson@mvpath.direct'
);

INSERT INTO direct_contacts (
  tenant_id,
  provider_name,
  specialty,
  organization,
  direct_address,
  phone,
  notes
)
SELECT
  t.id,
  'Dr. Michael Chen',
  'Rheumatology',
  'Evergreen Medical Group',
  'michael.chen@evergreen.direct',
  '555-0201',
  'Referrals for autoimmune skin conditions'
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM direct_contacts
  WHERE direct_address = 'michael.chen@evergreen.direct'
);

INSERT INTO direct_contacts (
  tenant_id,
  provider_name,
  specialty,
  organization,
  direct_address,
  phone,
  notes
)
SELECT
  t.id,
  'Dr. Emily Roberts',
  'Mohs Surgery',
  'Advanced Dermatology Surgical Center',
  'emily.roberts@adsc.direct',
  '555-0301',
  'Mohs micrographic surgery referrals'
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM direct_contacts
  WHERE direct_address = 'emily.roberts@adsc.direct'
);

INSERT INTO direct_contacts (
  tenant_id,
  provider_name,
  specialty,
  organization,
  direct_address,
  phone,
  fax,
  notes,
  is_favorite
)
SELECT
  t.id,
  'LabCorp West Regional',
  'Laboratory',
  'LabCorp',
  'westernlab@labcorp.direct',
  '555-0401',
  '555-0402',
  'Primary reference lab',
  true
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM direct_contacts
  WHERE direct_address = 'westernlab@labcorp.direct'
);

-- Seed a few sample Direct messages
INSERT INTO direct_messages (
  tenant_id,
  from_address,
  to_address,
  subject,
  body,
  status,
  sent_at,
  delivered_at,
  transmission_id
)
SELECT
  t.id,
  'provider@mountainpinederm.direct',
  'sarah.johnson@mvpath.direct',
  'Biopsy Results Request - Patient #12345',
  'Requesting expedited pathology report for suspicious nevus biopsy performed on 12/28/2025. Patient has family history of melanoma. Clinical concern for atypical melanocytic proliferation.',
  'delivered',
  NOW() - INTERVAL '2 days',
  NOW() - INTERVAL '2 days' + INTERVAL '5 minutes',
  'TX-' || substr(md5(random()::text), 1, 12)
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM direct_messages
  WHERE subject = 'Biopsy Results Request - Patient #12345'
);

INSERT INTO direct_messages (
  tenant_id,
  from_address,
  to_address,
  subject,
  body,
  status,
  sent_at,
  delivered_at,
  read_at,
  transmission_id
)
SELECT
  t.id,
  'sarah.johnson@mvpath.direct',
  'provider@mountainpinederm.direct',
  'RE: Biopsy Results Request - Patient #12345',
  E'Pathology Report #PATH-2025-12345\n\nDiagnosis: Compound melanocytic nevus with architectural disorder\n\nMicroscopic Description: The specimen shows a compound melanocytic proliferation with some asymmetry and irregular nesting. There is mild cytologic atypia but no definitive features of melanoma.\n\nRecommendation: Complete excision recommended with 5mm clinical margins. Consider follow-up dermoscopy in 3-6 months.',
  'read',
  NOW() - INTERVAL '1 day',
  NOW() - INTERVAL '1 day' + INTERVAL '3 minutes',
  NOW() - INTERVAL '12 hours',
  'TX-' || substr(md5(random()::text), 1, 12)
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM direct_messages
  WHERE subject = 'RE: Biopsy Results Request - Patient #12345'
);

-- Add comment
COMMENT ON TABLE direct_messages IS 'HIPAA-compliant Direct secure messaging for provider-to-provider communication';
COMMENT ON TABLE direct_contacts IS 'External healthcare provider directory for Direct messaging';
