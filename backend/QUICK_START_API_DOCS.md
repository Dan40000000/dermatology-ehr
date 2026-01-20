# Quick Start - API Documentation

## Viewing the Documentation

### 1. Start the Server
```bash
cd backend
npm run dev
```

### 2. Open Swagger UI
Open your browser to: **http://localhost:3000/api/docs**

### 3. Authenticate
1. Click the **"Authorize"** button (lock icon in top right)
2. Enter your JWT token from login
3. Add tenant ID in the second field: x-tenant-id
4. Click **"Close"**

### 4. Test Endpoints
- Browse endpoints by tag (category)
- Click **"Try it out"** on any endpoint
- Fill in required parameters
- Click **"Execute"**
- View request/response

## Completed Documentation (Ready to Use)

### Adaptive Learning
- `/api/adaptive/diagnoses/suggested` - Get AI-suggested diagnoses
- `/api/adaptive/procedures/suggested` - Get AI-suggested procedures
- `/api/adaptive/learn/*` - Record usage for learning

### AI Agent Configs
- `/api/ai-agent-configs` - Manage AI note generation configurations
- `/api/ai-agent-configs/{id}/*` - CRUD operations

### AI Analysis
- `/api/ai-analysis/analyze-photo/{photoId}` - AI skin analysis
- `/api/ai-analysis/cds-alerts` - Clinical decision support alerts

### Audit & Compliance
- `/api/audit` - HIPAA-compliant audit logs

### Payment Batches
- `/api/batches` - Payment batch management

### Core Features
- `/api/auth/*` - Authentication
- `/api/appointments/*` - Scheduling
- `/api/patients/*` - Patient management
- `/api/medications/*` - Medication search

## Authentication

All endpoints require:
- **Header**: `Authorization: Bearer <JWT_TOKEN>`
- **Header**: `x-tenant-id: <TENANT_ID>`

## Support

For details see:
- `SWAGGER_DOCUMENTATION_COMPLETE_SUMMARY.md`
- `scripts/document-remaining-apis.md`
- `API_DOCUMENTATION_STATUS.md`
