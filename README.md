# Dermatology EHR System

A comprehensive, HIPAA-compliant Electronic Health Record (EHR) system specifically designed for dermatology practices. This multi-tenant healthcare application provides complete patient management, appointment scheduling, clinical documentation, and secure messaging capabilities.

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Technology Stack](#technology-stack)
- [Getting Started](#getting-started)
- [Documentation](#documentation)
- [Security & Compliance](#security--compliance)
- [Support](#support)

## Overview

The Dermatology EHR System is a modern, cloud-native healthcare application built to streamline dermatology practice operations while maintaining the highest standards of security and HIPAA compliance.

### Key Features

#### Clinical Features
- **Patient Management**: Comprehensive patient records with demographics, medical history, and insurance information
- **Appointment Scheduling**: Advanced calendar system with provider availability and automated reminders
- **Clinical Documentation**: SOAP notes, procedure documentation, and treatment plans
- **Photo Documentation**: Secure storage and comparison of clinical photography
- **Document Management**: Upload, organize, and retrieve patient documents with version control

#### Administrative Features
- **Multi-Tenant Architecture**: Support for multiple practices with complete data isolation
- **Role-Based Access Control (RBAC)**: Granular permissions for Admin, Physician, Nurse, and Front Desk roles
- **Patient Portal**: Secure patient access to records, messaging, and appointment management
- **Messaging System**: HIPAA-compliant internal messaging between staff and patients
- **Task Management**: Integrated task tracking with assignments and priorities
- **Data Export**: Comprehensive export capabilities in PDF, CSV, and Excel formats
- **Audit Logging**: Complete audit trail for HIPAA compliance

#### Technical Features
- **Real-time Updates**: Live notifications and messaging
- **Responsive Design**: Full mobile and tablet support
- **High Performance**: Optimized for speed with caching and lazy loading
- **Scalable Architecture**: Designed to grow with your practice

## Technology Stack

### Frontend
- **React 19**: Modern UI library
- **TypeScript**: Type-safe development
- **React Router**: Client-side routing
- **Vite**: Lightning-fast build tool

### Backend
- **Node.js 18**: JavaScript runtime
- **Express 5**: Web application framework
- **TypeScript**: Type-safe server development
- **PostgreSQL 16**: Relational database
- **Redis 7**: Caching and session management

### Infrastructure
- **Docker**: Containerization
- **GitHub Actions**: CI/CD pipeline
- **AWS S3**: File storage
- **ClamAV**: Virus scanning
- **Sentry**: Error tracking

## Getting Started

### Prerequisites

- Node.js 18 or higher
- PostgreSQL 16
- Redis 7 (optional but recommended)
- Docker and Docker Compose (for containerized deployment)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/derm-app.git
   cd derm-app
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Install dependencies**
   ```bash
   cd backend && npm install
   cd ../frontend && npm install
   ```

4. **Start the database**
   ```bash
   docker-compose up -d postgres redis
   ```

5. **Run database migrations**
   ```bash
   cd backend
   npm run db:migrate
   npm run db:seed  # Optional: seed with sample data
   ```

6. **Start the development servers**
   ```bash
   # Terminal 1 - Backend
   cd backend
   npm run dev

   # Terminal 2 - Frontend
   cd frontend
   npm run dev
   ```

7. **Access the application**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:4000
   - API Health: http://localhost:4000/api/health

### Docker Deployment

For production deployment using Docker:

```bash
# Build and start all services
docker-compose -f docker-compose.prod.yml up -d

# View logs
docker-compose -f docker-compose.prod.yml logs -f

# Stop services
docker-compose -f docker-compose.prod.yml down
```

## Documentation

Comprehensive documentation is available:

- [**DEPLOYMENT.md**](./DEPLOYMENT.md) - Production deployment guide
- [**ARCHITECTURE.md**](./ARCHITECTURE.md) - System architecture
- [**API_DOCUMENTATION.md**](./API_DOCUMENTATION.md) - Complete API reference
- [**SECURITY.md**](./SECURITY.md) - Security and HIPAA compliance
- [**PRODUCTION_CHECKLIST.md**](./PRODUCTION_CHECKLIST.md) - Pre-launch checklist

### Additional Resources

- [Patient Portal Implementation](./PATIENT_PORTAL_SUMMARY.md)
- [Messaging Architecture](./PATIENT_MESSAGING_ARCHITECTURE.md)
- [Document Management Guide](./backend/DOCUMENT_MANAGEMENT_GUIDE.md)
- [Export Implementation](./EXPORT_IMPLEMENTATION_SUMMARY.md)

## Security & Compliance

### HIPAA Compliance

- **Encryption**: All PHI encrypted at rest and in transit
- **Access Controls**: Role-based access with audit logging
- **Authentication**: Secure JWT-based authentication
- **Audit Trails**: Complete logging of all PHI access
- **Data Backup**: Automated encrypted backups
- **Virus Scanning**: All file uploads scanned

### Default Credentials (Change Immediately!)

- **Admin**: admin@demo.practice / Password123!
- **Provider**: provider@demo.practice / Password123!
- **MA**: ma@demo.practice / Password123!
- **Front Desk**: frontdesk@demo.practice / Password123!

Tenant ID: `tenant-demo`

## Development

### Project Structure

```
derm-app/
├── backend/              # Node.js/Express backend
│   ├── src/
│   │   ├── routes/      # API routes
│   │   ├── db/          # Database layer
│   │   ├── lib/         # Utilities
│   │   └── config/      # Configuration
│   ├── migrations/      # Database migrations
│   └── Dockerfile
├── frontend/            # React frontend
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── pages/       # Page components
│   │   └── lib/         # Utilities
│   ├── nginx.conf
│   └── Dockerfile
├── scripts/             # Deployment scripts
└── .github/workflows/   # CI/CD pipelines
```

### Running Tests

```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test
```

## Monitoring & Maintenance

### Health Checks

- `/api/health` - Overall health status
- `/api/health/detailed` - Detailed health check
- `/api/health/ready` - Readiness probe
- `/api/health/live` - Liveness probe
- `/api/health/metrics` - Prometheus metrics

### Backups

Automated daily backups:
```bash
./scripts/backup.sh
```

Restore from backup:
```bash
./scripts/restore.sh <backup_file>
```

## Support

For issues, questions, or support:
- **Documentation**: Check the docs folder
- **Issues**: GitHub Issues
- **Security**: security@yourdomain.com

## License

MIT License - see LICENSE file for details.

---

**Version**: 1.0.0
**Last Updated**: December 2025

For production deployment assistance: support@yourdomain.com
