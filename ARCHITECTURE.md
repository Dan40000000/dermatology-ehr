# System Architecture

This document describes the technical architecture of the Dermatology EHR System.

## Table of Contents

- [Overview](#overview)
- [Architecture Diagram](#architecture-diagram)
- [Technology Stack](#technology-stack)
- [System Components](#system-components)
- [Data Flow](#data-flow)
- [Security Architecture](#security-architecture)
- [Scalability](#scalability)
- [Design Decisions](#design-decisions)

## Overview

The Dermatology EHR is a modern, cloud-native application built using a multi-tier architecture:

- **Presentation Layer**: React-based SPA
- **API Layer**: RESTful API (Node.js/Express)
- **Data Layer**: PostgreSQL relational database
- **Cache Layer**: Redis for sessions and caching
- **Storage Layer**: S3-compatible object storage
- **Security Layer**: Multi-layered security controls

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Browser    │  │    Mobile    │  │   Tablet     │          │
│  │   (React)    │  │  (Responsive)│  │ (Responsive) │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Load Balancer / CDN                         │
│                    (SSL Termination, DDoS)                       │
└──────────────────────────┬──────────────────────────────────────┘
                           │
           ┌───────────────┴───────────────┐
           │                               │
           ▼                               ▼
┌──────────────────────┐         ┌──────────────────────┐
│   Frontend Server    │         │   Frontend Server    │
│  (Nginx + React SPA) │         │  (Nginx + React SPA) │
│                      │         │                      │
│  - Static Assets     │         │  - Static Assets     │
│  - SPA Routing       │         │  - SPA Routing       │
│  - API Proxy         │         │  - API Proxy         │
└──────────┬───────────┘         └──────────┬───────────┘
           │                                 │
           └────────────┬────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                       API Gateway / Nginx                        │
│              (Rate Limiting, Request Routing)                    │
└──────────────────────────┬──────────────────────────────────────┘
                           │
           ┌───────────────┴───────────────┐
           │                               │
           ▼                               ▼
┌──────────────────────┐         ┌──────────────────────┐
│   Backend Server     │         │   Backend Server     │
│  (Node.js/Express)   │         │  (Node.js/Express)   │
│                      │         │                      │
│  - REST API          │         │  - REST API          │
│  - Business Logic    │         │  - Business Logic    │
│  - Authentication    │         │  - Authentication    │
│  - Authorization     │         │  - Authorization     │
└──────────┬───────────┘         └──────────┬───────────┘
           │                                 │
           └────────────┬────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  PostgreSQL  │ │    Redis     │ │   AWS S3     │
│   Database   │ │    Cache     │ │   Storage    │
│              │ │              │ │              │
│ - Patient    │ │ - Sessions   │ │ - Documents  │
│ - Clinical   │ │ - Rate Limit │ │ - Photos     │
│ - Audit Log  │ │ - Temp Data  │ │ - Backups    │
└──────────────┘ └──────────────┘ └──────────────┘
        │
        ▼
┌──────────────┐
│   ClamAV     │
│ Virus Scan   │
└──────────────┘

External Services:
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│    Sentry    │ │  SendGrid    │ │  Prometheus  │
│   Monitoring │ │    Email     │ │   Metrics    │
└──────────────┘ └──────────────┘ └──────────────┘
```

## Technology Stack

### Frontend
- **React 19**: UI library with hooks and concurrent features
- **TypeScript**: Static typing for reliability
- **Vite**: Fast build tool and dev server
- **React Router**: Client-side routing
- **jsPDF**: PDF generation

### Backend
- **Node.js 18**: JavaScript runtime (LTS)
- **Express 5**: Web framework
- **TypeScript**: Type-safe server code
- **Zod**: Runtime validation

### Database & Cache
- **PostgreSQL 16**: Primary data store
- **Redis 7**: Session store and cache

### Infrastructure
- **Docker**: Containerization
- **Docker Compose**: Multi-container orchestration
- **Nginx**: Reverse proxy and static file serving
- **GitHub Actions**: CI/CD automation

### Monitoring & Security
- **Sentry**: Error tracking and performance monitoring
- **Prometheus**: Metrics collection
- **ClamAV**: Antivirus scanning
- **Let's Encrypt**: SSL certificates

## System Components

### Frontend (React SPA)

**Purpose**: User interface for web browsers

**Key Features**:
- Single Page Application (SPA)
- Client-side routing
- State management (React hooks)
- Responsive design
- Progressive Web App (PWA) capabilities

**Build Output**:
- Optimized JavaScript bundles
- CSS modules
- Static assets
- Service worker (for PWA)

### Backend API (Express)

**Purpose**: RESTful API server

**Responsibilities**:
- Request validation
- Business logic execution
- Database queries
- File upload handling
- Authentication/authorization
- Audit logging

**Architecture Pattern**: Layered architecture
```
Routes → Controllers → Services → Database
                    ↓
                  Logging
```

### Database (PostgreSQL)

**Purpose**: Persistent data storage

**Key Features**:
- ACID transactions
- Row-level security
- Full-text search
- JSON data types
- Advanced indexing

**Schema Design**: Normalized relational model with multi-tenancy

**Major Tables**:
- `users` - User accounts
- `patients` - Patient records
- `appointments` - Appointment scheduling
- `clinical_notes` - Clinical documentation
- `documents` - Document metadata
- `messages` - Secure messaging
- `audit_logs` - HIPAA audit trail

### Cache (Redis)

**Purpose**: Fast data access and session storage

**Use Cases**:
- Session management
- Rate limiting counters
- Temporary data (OTP, tokens)
- Query result caching
- Real-time features (pub/sub)

### File Storage (S3)

**Purpose**: Object storage for files

**Stored Content**:
- Patient documents (PDFs, images)
- Clinical photos
- Exported reports
- Database backups

**Features**:
- Versioning enabled
- Encryption at rest
- Lifecycle policies
- Pre-signed URLs for temporary access

## Data Flow

### Authentication Flow

```
1. User enters credentials
   ↓
2. Frontend sends POST /api/auth/login
   ↓
3. Backend validates credentials
   ↓
4. Backend generates JWT + refresh token
   ↓
5. Tokens stored in httpOnly cookies
   ↓
6. Frontend redirects to dashboard
   ↓
7. Subsequent requests include JWT in cookie
   ↓
8. Backend middleware validates JWT
   ↓
9. Request proceeds if valid
```

### File Upload Flow

```
1. User selects file
   ↓
2. Frontend validates file type/size
   ↓
3. POST /api/documents/upload with multipart form
   ↓
4. Backend receives file (multer middleware)
   ↓
5. File scanned by ClamAV
   ↓
6. If clean, upload to S3
   ↓
7. Metadata saved to database
   ↓
8. Audit log created
   ↓
9. Return document ID to frontend
```

### Patient Data Access Flow

```
1. User navigates to patient page
   ↓
2. GET /api/patients/:id
   ↓
3. Backend extracts tenant_id from JWT
   ↓
4. Backend validates user permissions
   ↓
5. Database query with tenant_id filter
   ↓
6. PHI data decrypted (if encrypted)
   ↓
7. Audit log created for access
   ↓
8. Data returned to frontend
   ↓
9. Frontend renders patient data
```

## Security Architecture

### Defense in Depth

**Layer 1: Network**
- Firewall rules
- DDoS protection
- Rate limiting

**Layer 2: Transport**
- TLS 1.3 encryption
- HSTS headers
- Certificate pinning

**Layer 3: Application**
- Input validation (Zod)
- SQL injection prevention (parameterized queries)
- XSS prevention (React escaping + CSP)
- CSRF protection (tokens)

**Layer 4: Authentication**
- JWT-based authentication
- Secure password hashing (bcrypt)
- Session management
- Multi-factor authentication ready

**Layer 5: Authorization**
- Role-Based Access Control (RBAC)
- Tenant isolation
- Resource-level permissions

**Layer 6: Data**
- Encryption at rest (database)
- PHI field-level encryption
- Encrypted backups
- Secure file storage

**Layer 7: Monitoring**
- Audit logging
- Anomaly detection
- Security event alerts
- Compliance reporting

### Multi-Tenancy

**Tenant Isolation**:
- Every request requires `x-tenant-id` header
- All database queries filtered by tenant_id
- Data completely segregated per tenant
- No cross-tenant data access possible

**Implementation**:
```typescript
// Middleware enforces tenant context
app.use((req, res, next) => {
  req.tenantId = req.headers['x-tenant-id'];
  if (!req.tenantId) {
    return res.status(400).json({ error: 'Missing tenant' });
  }
  next();
});

// All queries include tenant filter
SELECT * FROM patients WHERE tenant_id = $1 AND id = $2
```

## Scalability

### Horizontal Scaling

**Stateless Design**:
- No server-side session state
- JWT contains all session info
- Enables multiple backend instances

**Load Balancing**:
- Round-robin distribution
- Health check-based routing
- Session affinity not required

### Caching Strategy

**Cache Layers**:
1. **Browser cache**: Static assets (1 year)
2. **CDN cache**: Frontend bundles (immutable)
3. **Redis cache**: API responses (5-15 min)
4. **Database query cache**: Frequently accessed data

### Database Optimization

**Indexing**:
- Primary keys on all tables
- Foreign key indexes
- Composite indexes for common queries
- Full-text search indexes

**Query Optimization**:
- Connection pooling
- Prepared statements
- Efficient joins
- Pagination for large result sets

**Read Replicas**:
- Master for writes
- Replicas for reads
- Automatic failover

### File Storage Optimization

**S3 Features**:
- CloudFront CDN for distribution
- Transfer acceleration
- Multipart uploads for large files
- Intelligent tiering

## Design Decisions

### Why React?
- Rich ecosystem
- Strong community
- Excellent TypeScript support
- Component reusability
- Virtual DOM performance

### Why Node.js/Express?
- JavaScript full-stack
- Non-blocking I/O for high concurrency
- Extensive middleware ecosystem
- Easy to deploy and scale
- Strong TypeScript support

### Why PostgreSQL?
- ACID compliance (critical for healthcare)
- Advanced features (JSON, full-text search)
- Proven reliability
- Excellent performance
- Strong community

### Why JWT?
- Stateless authentication
- Scales horizontally
- Cross-domain compatible
- Industry standard
- Easy to implement

### Why Multi-Tenant?
- Cost-effective for SaaS model
- Centralized updates
- Shared infrastructure
- Data isolation per practice
- Easier maintenance

### Why Docker?
- Consistent environments
- Easy deployment
- Resource isolation
- Portable across cloud providers
- Built-in orchestration

## Performance Targets

- **Page Load**: < 3 seconds (first load)
- **API Response**: < 500ms (95th percentile)
- **Database Query**: < 100ms (average)
- **File Upload**: 10 MB in < 5 seconds
- **Concurrent Users**: 1000+ per server
- **Uptime**: 99.9% (three nines)

## Future Enhancements

### Planned Improvements

1. **Microservices**: Split monolith into services
2. **GraphQL**: Alternative to REST API
3. **Real-time**: WebSocket for live updates
4. **Mobile Apps**: Native iOS/Android
5. **AI/ML**: Diagnostic assistance
6. **Kubernetes**: Container orchestration
7. **Service Mesh**: Istio for observability
8. **Event Sourcing**: Complete audit trail
9. **CQRS**: Separate read/write models
10. **Multi-Region**: Geographic distribution

---

**Last Updated**: December 2025
**Version**: 1.0.0
