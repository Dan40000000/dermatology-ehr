# Document Management System - Quick Reference

## Files Created

```
backend/
├── migrations/
│   └── 015_document_enhancements.sql      (4.9 KB) - Database schema
├── src/
│   ├── routes/
│   │   └── documents.ts                    (14 KB)  - API endpoints
│   ├── types/
│   │   └── documents.ts                    (5.7 KB) - TypeScript types
│   └── utils/
│       ├── documentProcessing.ts           (5.8 KB) - OCR & thumbnails
│       └── fileUpload.ts                   (3.7 KB) - File handling
├── DOCUMENT_MANAGEMENT_GUIDE.md           (13 KB)  - Full documentation
├── IMPLEMENTATION_SUMMARY.md              (8.2 KB) - Summary
└── QUICK_REFERENCE.md                     (this file)
```

## API Endpoints (10 routes)

### Core
- `GET    /api/documents` - List with filters
- `POST   /api/documents` - Upload new
- `GET    /api/documents/:id` - Get details
- `DELETE /api/documents/:id` - Delete

### Features
- `GET    /api/documents/:id/preview` - Preview URL
- `POST   /api/documents/:id/sign` - E-sign
- `GET    /api/documents/:id/versions` - Version history
- `POST   /api/documents/:id/versions` - New version
- `PUT    /api/documents/:id/category` - Update category
- `GET    /api/documents/meta/categories` - List categories

## Query Parameters

```typescript
GET /api/documents?
  category=Lab Results          // Filter by category
  &patientId=uuid              // Filter by patient
  &startDate=2025-01-01        // Date range start
  &endDate=2025-01-31          // Date range end
  &uploadedBy=uuid             // Filter by uploader
  &signed=true                 // Filter signed/unsigned
  &search=biopsy               // Full-text search
  &limit=50                    // Results per page
  &offset=0                    // Pagination offset
```

## Categories (8 total)

1. Lab Results
2. Pathology Reports
3. Imaging
4. Insurance Cards
5. Consent Forms
6. Referrals
7. Correspondence
8. Other

## Auto-Categorization Keywords

| Keyword | Category |
|---------|----------|
| lab, laboratory | Lab Results |
| path, biopsy | Pathology Reports |
| xray, mri, ct, ultrasound | Imaging |
| insurance, card | Insurance Cards |
| consent, authorization | Consent Forms |
| referral, refer | Referrals |
| letter, correspondence | Correspondence |
| (default) | Other |

## Supported File Types

- PDF: `application/pdf` (.pdf)
- JPEG: `image/jpeg` (.jpg)
- PNG: `image/png` (.png)
- TIFF: `image/tiff` (.tiff, .tif)

Max size: 10MB (configurable)

## Database Tables (4 tables)

1. **documents** - Enhanced with 12 new columns
2. **document_versions** - Version history
3. **document_signatures** - E-signature audit trail
4. **document_access_log** - HIPAA compliance logging

## Key Features

- Document categorization (8 categories)
- Auto-suggest category from filename
- Version control with history
- E-signature (drawn/typed/uploaded)
- HIPAA-compliant audit logging
- Full-text search (title, description, OCR)
- Advanced filtering (category, patient, date, etc.)
- OCR-ready infrastructure
- Thumbnail generation ready
- Secure file storage
- Role-based access control

## Quick Test

```bash
# 1. Run migration
npm run migrate

# 2. Test API
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:3000/api/documents

# 3. Upload document
curl -X POST \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "patientId": "patient-uuid",
    "title": "Lab Results - CBC",
    "url": "/uploads/documents/file.pdf",
    "mimeType": "application/pdf",
    "fileSize": 524288
  }' \
  http://localhost:3000/api/documents

# 4. Search documents
curl -H "Authorization: Bearer TOKEN" \
  "http://localhost:3000/api/documents?search=lab&category=Lab+Results"
```

## Frontend Integration

### Install Dependencies
```bash
npm install react-pdf pdfjs-dist
npm install @react-pdf-viewer/core
npm install react-signature-canvas
npm install react-dropzone
```

### Components Needed
1. DocumentUpload - Drag-drop upload
2. DocumentViewer - PDF/image viewer
3. DocumentGrid - Grid view
4. DocumentList - List view
5. DocumentFilters - Search/filter
6. SignatureCanvas - E-signature

### Import Types
```typescript
import {
  Document,
  DocumentCategory,
  CreateDocumentRequest,
  SignDocumentRequest,
  ListDocumentsParams,
} from '../types/documents';
```

## Security Features

- File type validation (MIME)
- File size limits (10MB)
- Secure filename generation
- Tenant isolation
- Path traversal prevention
- Malicious file detection
- Role-based access control
- HIPAA audit logging

## HIPAA Compliance

### Logged Actions
- view, download, edit, delete, sign, print

### Logged Data
- User ID, Document ID, Action
- IP address, User agent, Timestamp

### E-Signature Audit
- Signer ID, Name, Signature data
- Signature type, IP, User agent
- Timestamp

## Optional Enhancements

### For Production

1. **Thumbnail Generation:**
   ```bash
   npm install sharp pdf-thumbnail
   ```

2. **OCR Integration:**
   ```bash
   npm install tesseract.js pdf-parse
   ```

3. **S3 Storage:**
   ```bash
   npm install @aws-sdk/client-s3
   ```

4. **File Upload Middleware:**
   ```bash
   npm install multer
   ```

## Color-Coded Categories

- Lab Results: blue
- Pathology Reports: purple
- Imaging: teal
- Insurance Cards: green
- Consent Forms: orange
- Referrals: pink
- Correspondence: gray
- Other: gray

## File Icons

- PDF: file-pdf
- Images: file-image
- Default: file

## Next Steps

1. Run database migration
2. Test API endpoints
3. Build frontend components
4. Implement file upload
5. Add OCR/thumbnails (optional)
6. Deploy to production

## Support

See full documentation:
- `DOCUMENT_MANAGEMENT_GUIDE.md` - Complete API docs
- `IMPLEMENTATION_SUMMARY.md` - Implementation details
- `src/types/documents.ts` - TypeScript types
