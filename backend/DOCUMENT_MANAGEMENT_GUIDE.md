# Document Management System - Implementation Guide

## Overview

This document management system provides a comprehensive solution for handling medical documents with categories, versioning, e-signatures, OCR support, and HIPAA-compliant audit logging.

## Database Schema

### Migration: 015_document_enhancements.sql

Run this migration to add the following enhancements:

**Enhanced Documents Table:**
- `category` - Document category (Lab Results, Pathology Reports, etc.)
- `subcategory` - Optional subcategory
- `file_size` - File size in bytes
- `mime_type` - MIME type (application/pdf, image/jpeg, etc.)
- `thumbnail_url` - URL to thumbnail preview
- `ocr_text` - Extracted text from OCR
- `is_signed` - E-signature status
- `signed_at` - Signature timestamp
- `signed_by` - Reference to user who signed
- `description` - User-provided description
- `uploaded_by` - Reference to user who uploaded

**New Tables:**
- `document_versions` - Version history tracking
- `document_signatures` - E-signature records with audit trail
- `document_access_log` - HIPAA-compliant access logging

## API Endpoints

### Document Management

#### GET /api/documents
List documents with advanced filtering.

**Query Parameters:**
- `category` - Filter by category
- `patientId` - Filter by patient
- `startDate` - Filter by start date (ISO 8601)
- `endDate` - Filter by end date (ISO 8601)
- `uploadedBy` - Filter by uploader user ID
- `signed` - Filter by signature status (true/false)
- `search` - Full-text search (title, description, OCR text)
- `limit` - Results per page (default: 50)
- `offset` - Pagination offset (default: 0)

**Response:**
```json
{
  "documents": [
    {
      "id": "uuid",
      "patientId": "uuid",
      "patientName": "John Doe",
      "title": "Lab Results - CBC",
      "category": "Lab Results",
      "subcategory": "Hematology",
      "fileSize": 524288,
      "mimeType": "application/pdf",
      "thumbnailUrl": "/uploads/thumbnails/...",
      "isSigned": false,
      "uploadedBy": "uuid",
      "uploadedByEmail": "doctor@example.com",
      "createdAt": "2025-01-15T10:30:00Z"
    }
  ]
}
```

#### POST /api/documents
Upload a new document.

**Request Body:**
```json
{
  "patientId": "uuid",
  "encounterId": "uuid", // optional
  "title": "Lab Results - CBC",
  "category": "Lab Results", // optional, auto-suggested if not provided
  "subcategory": "Hematology", // optional
  "description": "Complete Blood Count results",
  "url": "/uploads/documents/...",
  "storage": "local",
  "objectKey": "tenant-id/filename.pdf",
  "fileSize": 524288,
  "mimeType": "application/pdf",
  "thumbnailUrl": "/uploads/thumbnails/..."
}
```

**Response:**
```json
{
  "id": "uuid",
  "suggestedCategory": "Lab Results"
}
```

#### GET /api/documents/:id
Get document details.

**Response:**
```json
{
  "id": "uuid",
  "patientId": "uuid",
  "patientName": "John Doe",
  "title": "Lab Results - CBC",
  "category": "Lab Results",
  "description": "Complete Blood Count results",
  "url": "/uploads/documents/...",
  "fileSize": 524288,
  "mimeType": "application/pdf",
  "thumbnailUrl": "/uploads/thumbnails/...",
  "isSigned": true,
  "signedAt": "2025-01-15T11:00:00Z",
  "signedBy": "uuid",
  "signedByEmail": "patient@example.com",
  "uploadedBy": "uuid",
  "uploadedByEmail": "doctor@example.com",
  "createdAt": "2025-01-15T10:30:00Z"
}
```

#### GET /api/documents/:id/preview
Get preview URL for document.

**Response:**
```json
{
  "previewUrl": "/uploads/thumbnails/...",
  "fullUrl": "/uploads/documents/...",
  "mimeType": "application/pdf",
  "storage": "local",
  "objectKey": "tenant-id/filename.pdf"
}
```

#### DELETE /api/documents/:id
Delete a document (admin/provider only).

**Response:**
```json
{
  "success": true
}
```

### E-Signature

#### POST /api/documents/:id/sign
Electronically sign a document.

**Request Body:**
```json
{
  "signatureData": "data:image/png;base64,...",
  "signatureType": "drawn", // "drawn", "typed", or "uploaded"
  "signerName": "John Doe"
}
```

**Response:**
```json
{
  "success": true,
  "signatureId": "uuid"
}
```

**Features:**
- Records IP address and user agent for audit trail
- Prevents double-signing
- Locks document after signature
- HIPAA-compliant logging

### Version Control

#### GET /api/documents/:id/versions
Get version history for a document.

**Response:**
```json
{
  "versions": [
    {
      "id": "uuid",
      "versionNumber": 2,
      "fileUrl": "/uploads/documents/...",
      "fileSize": 524288,
      "mimeType": "application/pdf",
      "uploadedBy": "uuid",
      "uploadedByEmail": "doctor@example.com",
      "uploadedAt": "2025-01-16T10:00:00Z",
      "changeDescription": "Updated lab values"
    }
  ]
}
```

#### POST /api/documents/:id/versions
Upload a new version of a document.

**Request Body:**
```json
{
  "fileUrl": "/uploads/documents/...",
  "fileSize": 524288,
  "mimeType": "application/pdf",
  "changeDescription": "Updated lab values"
}
```

**Response:**
```json
{
  "id": "uuid",
  "versionNumber": 2
}
```

### Category Management

#### PUT /api/documents/:id/category
Update document category.

**Request Body:**
```json
{
  "category": "Pathology Reports",
  "subcategory": "Dermatopathology"
}
```

**Response:**
```json
{
  "success": true
}
```

#### GET /api/documents/meta/categories
Get list of available categories.

**Response:**
```json
{
  "categories": [
    "Lab Results",
    "Pathology Reports",
    "Imaging",
    "Insurance Cards",
    "Consent Forms",
    "Referrals",
    "Correspondence",
    "Other"
  ]
}
```

## Document Categories

The system supports the following predefined categories:

1. **Lab Results** - Laboratory test results, blood work, urinalysis
2. **Pathology Reports** - Biopsy results, dermatopathology reports
3. **Imaging** - X-rays, MRI, CT scans, ultrasound
4. **Insurance Cards** - Insurance information, coverage documents
5. **Consent Forms** - Treatment consent, authorization forms
6. **Referrals** - Referral letters, specialist consultations
7. **Correspondence** - Letters, faxes, external communications
8. **Other** - Miscellaneous documents

## Auto-Categorization

The system automatically suggests categories based on filename keywords:

- Files containing "lab" or "laboratory" → Lab Results
- Files containing "path" or "biopsy" → Pathology Reports
- Files containing "xray", "mri", "ct", "ultrasound" → Imaging
- Files containing "insurance" or "card" → Insurance Cards
- Files containing "consent" or "authorization" → Consent Forms
- Files containing "referral" or "refer" → Referrals
- Files containing "letter" or "correspondence" → Correspondence
- All others → Other

## File Upload Utilities

### Supported File Types

- PDF: `application/pdf` (.pdf)
- JPEG: `image/jpeg` (.jpg)
- PNG: `image/png` (.png)
- TIFF: `image/tiff` (.tiff, .tif)

### File Size Limits

- Default: 10MB per file
- Configurable in `fileUpload.ts`

### Security Features

1. **File Validation:**
   - MIME type verification
   - File size limits
   - Extension validation

2. **Secure Storage:**
   - Randomized filenames
   - Tenant-isolated directories
   - Path traversal prevention

3. **Malicious File Detection:**
   - Blocks executable files
   - Validates MIME type vs extension
   - Sanitizes filenames

### Usage Example

```typescript
import { storeFileLocally, validateFile } from './utils/fileUpload';

// Upload file
const result = await storeFileLocally(file, tenantId);
// Returns: { url, objectKey, fileSize, mimeType, thumbnailUrl }

// Validate file
const validation = validateFile(file);
if (!validation.valid) {
  throw new Error(validation.error);
}
```

## Document Processing

### Thumbnail Generation (Placeholder)

```typescript
import { generateThumbnail } from './utils/documentProcessing';

const thumbnailUrl = await generateThumbnail(
  filePath,
  mimeType,
  { width: 200, height: 200, quality: 80 }
);
```

**Production Implementation:**
- For PDFs: Use `pdf-thumbnail` or `pdf-poppler`
- For Images: Use `sharp` library

### OCR Text Extraction (Placeholder)

```typescript
import { extractTextOCR } from './utils/documentProcessing';

const ocrResult = await extractTextOCR(filePath, mimeType);
// Returns: { text, confidence, language }
```

**Production Implementation:**
- For PDFs: Use `pdf-parse` for text extraction
- For Images: Use `tesseract.js` for local OCR
- For Cloud OCR: AWS Textract or Google Cloud Vision API

## HIPAA Compliance

### Access Logging

All document access is logged in `document_access_log` table:

**Logged Actions:**
- `view` - Document viewed/previewed
- `download` - Document downloaded
- `edit` - Document uploaded/updated
- `delete` - Document deleted
- `sign` - Document signed
- `print` - Document printed

**Logged Information:**
- User ID
- Document ID
- Action type
- IP address
- User agent
- Timestamp

### E-Signature Audit Trail

All signatures are recorded in `document_signatures` table:

**Recorded Information:**
- Signer ID and name
- Signature data (base64 image)
- Signature type (drawn/typed/uploaded)
- IP address
- User agent
- Timestamp

## Frontend Integration Guide

### Upload Flow

1. **Drag & Drop Zone:**
   - Accept multiple files
   - Show preview thumbnails
   - Display upload progress

2. **Category Selection:**
   - Show suggested category
   - Allow manual override
   - Optional subcategory

3. **Patient Association:**
   - Search/select patient
   - Link to encounter (optional)

4. **Metadata:**
   - Title (auto-populated from filename)
   - Description (optional)
   - Category/subcategory

### Document Viewer Component

**Features:**
- PDF viewer (use `react-pdf` or `pdf.js`)
- Image viewer with zoom/pan
- Navigation controls
- Download button
- Print button
- E-sign button (for consent forms)
- Version history dropdown

**Example Structure:**
```typescript
<DocumentViewer
  documentId={id}
  onSign={handleSign}
  onDownload={handleDownload}
  onPrint={handlePrint}
/>
```

### Grid View

**Display:**
- Thumbnail preview
- Category badge (color-coded)
- File type icon
- File size
- Upload date
- Patient name
- Hover actions: View, Download, Delete

### List View

**Table Columns:**
- Thumbnail
- Title
- Category
- Patient
- Uploaded By
- Date
- Size
- Actions

**Features:**
- Sortable columns
- Multi-select checkboxes
- Bulk actions (delete, download)

### Search & Filter Component

**Filters:**
- Category dropdown
- Patient autocomplete
- Date range picker
- Uploaded by dropdown
- Signed/unsigned toggle
- Full-text search input

**Example:**
```typescript
<DocumentFilters
  onFilterChange={handleFilterChange}
  categories={categories}
  patients={patients}
/>
```

## Next Steps

### Required Frontend Work

1. **Install Dependencies:**
   ```bash
   npm install react-pdf pdfjs-dist
   npm install @react-pdf-viewer/core
   npm install react-signature-canvas
   ```

2. **Create Components:**
   - `DocumentUpload.tsx` - Upload interface
   - `DocumentViewer.tsx` - Document preview modal
   - `DocumentGrid.tsx` - Grid view display
   - `DocumentList.tsx` - List view display
   - `DocumentFilters.tsx` - Search/filter controls
   - `SignatureCanvas.tsx` - E-signature drawing

3. **Update DocumentsPage:**
   - Add grid/list toggle
   - Implement filtering
   - Add upload modal
   - Add viewer modal

### Optional Enhancements

1. **Thumbnail Generation:**
   - Install: `npm install pdf-thumbnail sharp`
   - Implement in `documentProcessing.ts`
   - Generate on upload

2. **OCR Integration:**
   - Install: `npm install tesseract.js pdf-parse`
   - Implement text extraction
   - Enable full-text search

3. **Cloud Storage (S3):**
   - Install: `npm install @aws-sdk/client-s3`
   - Implement `storeFileS3` function
   - Configure bucket and credentials

4. **Encryption at Rest:**
   - Implement file encryption
   - Store encryption keys securely
   - Decrypt on retrieval

## Testing

### API Testing

```bash
# Get all documents
curl -H "Authorization: Bearer TOKEN" http://localhost:3000/api/documents

# Get documents by category
curl -H "Authorization: Bearer TOKEN" \
  "http://localhost:3000/api/documents?category=Lab+Results"

# Search documents
curl -H "Authorization: Bearer TOKEN" \
  "http://localhost:3000/api/documents?search=biopsy"

# Upload document
curl -X POST -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "patientId": "uuid",
    "title": "Lab Results",
    "url": "/uploads/documents/file.pdf",
    "mimeType": "application/pdf",
    "fileSize": 524288
  }' \
  http://localhost:3000/api/documents

# Sign document
curl -X POST -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "signatureData": "data:image/png;base64,...",
    "signatureType": "drawn",
    "signerName": "John Doe"
  }' \
  http://localhost:3000/api/documents/:id/sign
```

## Summary

This implementation provides:

- Comprehensive document categorization
- Version control and history
- E-signature support with audit trail
- HIPAA-compliant access logging
- OCR-ready infrastructure
- Secure file storage
- Advanced search and filtering
- Auto-categorization based on filenames

All backend functionality is complete and ready for frontend integration.
