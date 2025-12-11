-- Document Management Enhancements
-- Adds categories, versioning, OCR support, e-signatures, and metadata

-- Add new columns to documents table
ALTER TABLE documents ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS subcategory TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_size BIGINT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS mime_type TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS ocr_text TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_signed BOOLEAN DEFAULT FALSE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS signed_by TEXT REFERENCES users(id);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS uploaded_by TEXT REFERENCES users(id);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage TEXT DEFAULT 'local';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS object_key TEXT;

-- Document versions table for version history
CREATE TABLE IF NOT EXISTS document_versions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  file_url TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  change_description TEXT
);

-- Document signatures table for tracking e-signatures
CREATE TABLE IF NOT EXISTS document_signatures (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  signer_id TEXT NOT NULL REFERENCES users(id),
  signer_name TEXT NOT NULL,
  signature_data TEXT NOT NULL,
  signature_type TEXT NOT NULL CHECK (signature_type IN ('drawn', 'typed', 'uploaded')),
  ip_address TEXT,
  user_agent TEXT,
  signed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Document access log for HIPAA compliance
CREATE TABLE IF NOT EXISTS document_access_log (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL CHECK (action IN ('view', 'download', 'edit', 'delete', 'sign', 'print')),
  ip_address TEXT,
  user_agent TEXT,
  accessed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
CREATE INDEX IF NOT EXISTS idx_documents_patient ON documents(patient_id);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by ON documents(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_documents_signed ON documents(is_signed);
CREATE INDEX IF NOT EXISTS idx_documents_tenant_category ON documents(tenant_id, category);
CREATE INDEX IF NOT EXISTS idx_document_versions_document ON document_versions(document_id);
CREATE INDEX IF NOT EXISTS idx_document_signatures_document ON document_signatures(document_id);
CREATE INDEX IF NOT EXISTS idx_document_signatures_signer ON document_signatures(signer_id);
CREATE INDEX IF NOT EXISTS idx_document_access_log_document ON document_access_log(document_id);
CREATE INDEX IF NOT EXISTS idx_document_access_log_user ON document_access_log(user_id);
CREATE INDEX IF NOT EXISTS idx_document_access_log_date ON document_access_log(accessed_at DESC);

-- Full-text search index for documents (OCR text and description)
CREATE INDEX IF NOT EXISTS idx_documents_search ON documents USING gin(to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(description, '') || ' ' || COALESCE(ocr_text, '')));

-- Comments for documentation
COMMENT ON COLUMN documents.category IS 'Document category: Lab Results, Pathology Reports, Imaging, Insurance Cards, Consent Forms, Referrals, Correspondence, Other';
COMMENT ON COLUMN documents.subcategory IS 'Optional subcategory for additional classification';
COMMENT ON COLUMN documents.file_size IS 'File size in bytes';
COMMENT ON COLUMN documents.mime_type IS 'MIME type (e.g., application/pdf, image/jpeg)';
COMMENT ON COLUMN documents.thumbnail_url IS 'URL to thumbnail preview image';
COMMENT ON COLUMN documents.ocr_text IS 'Extracted text from document via OCR';
COMMENT ON COLUMN documents.is_signed IS 'Whether document has been electronically signed';
COMMENT ON COLUMN documents.signed_at IS 'Timestamp of signature';
COMMENT ON COLUMN documents.signed_by IS 'User who signed the document';
COMMENT ON COLUMN documents.description IS 'User-provided description of document';
COMMENT ON COLUMN documents.uploaded_by IS 'User who uploaded the document';

COMMENT ON TABLE document_versions IS 'Version history for documents';
COMMENT ON TABLE document_signatures IS 'E-signature records for documents';
COMMENT ON TABLE document_access_log IS 'HIPAA-compliant audit log of document access';
