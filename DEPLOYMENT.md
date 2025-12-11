# Production Deployment Guide

This guide provides comprehensive instructions for deploying the Dermatology EHR System to production.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Infrastructure Setup](#infrastructure-setup)
- [Environment Configuration](#environment-configuration)
- [Database Setup](#database-setup)
- [Docker Deployment](#docker-deployment)
- [SSL/TLS Configuration](#ssltls-configuration)
- [Monitoring Setup](#monitoring-setup)
- [Backup Configuration](#backup-configuration)
- [Post-Deployment](#post-deployment)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Services

- **Compute**: VM or container platform (AWS EC2, DigitalOcean, GCP, etc.)
- **Database**: PostgreSQL 16 managed service or self-hosted
- **Cache**: Redis 7 managed service or self-hosted
- **Storage**: AWS S3 or compatible object storage
- **Domain**: Registered domain with DNS access
- **SSL**: Valid SSL certificate (Let's Encrypt recommended)

### Required Tools

- Docker 24+ and Docker Compose
- PostgreSQL client
- AWS CLI (for S3 backup)
- Git

### Minimum Server Requirements

**Production (Single Server)**
- **CPU**: 4 cores
- **RAM**: 8 GB
- **Storage**: 100 GB SSD
- **Network**: 1 Gbps

**High Availability (Multiple Servers)**
- **Load Balancer**: 2 vCPU, 4 GB RAM
- **App Servers**: 2+ instances (4 vCPU, 8 GB RAM each)
- **Database**: Managed PostgreSQL with read replicas
- **Cache**: Redis cluster

## Infrastructure Setup

### 1. Server Provisioning

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install PostgreSQL client
sudo apt install -y postgresql-client

# Install AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

### 2. DNS Configuration

Point your domain to your server:

```
A     app.yourdomain.com     -> YOUR_SERVER_IP
A     api.yourdomain.com     -> YOUR_SERVER_IP
CNAME www.yourdomain.com     -> app.yourdomain.com
```

### 3. Firewall Configuration

```bash
# Allow HTTP, HTTPS, SSH
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## Environment Configuration

### 1. Clone Repository

```bash
cd /opt
sudo git clone https://github.com/yourusername/derm-app.git
cd derm-app
```

### 2. Create Production Environment File

```bash
cp .env.example .env
nano .env
```

### 3. Configure Environment Variables

**Critical Variables** (must be changed):

```bash
# Generate secure secrets
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Update .env
DB_PASSWORD=<generate_secure_password>
JWT_SECRET=<generate_64_char_secret>
CSRF_SECRET=<generate_64_char_secret>
SESSION_SECRET=<generate_64_char_secret>
ENCRYPTION_KEY=<generate_32_byte_key>
REDIS_PASSWORD=<generate_secure_password>
```

**Service Configuration**:

```bash
# Application
NODE_ENV=production
API_URL=https://api.yourdomain.com
FRONTEND_URL=https://app.yourdomain.com

# AWS S3
AWS_REGION=us-east-1
AWS_S3_BUCKET=derm-uploads-production
AWS_ACCESS_KEY_ID=<your_aws_key>
AWS_SECRET_ACCESS_KEY=<your_aws_secret>

# Email (SendGrid example)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=<your_sendgrid_api_key>
FROM_EMAIL=noreply@yourdomain.com

# Monitoring
SENTRY_DSN=<your_sentry_dsn>
```

## Database Setup

### Option 1: Managed Database (Recommended)

Use managed PostgreSQL from:
- AWS RDS
- DigitalOcean Managed Databases
- Google Cloud SQL
- Azure Database for PostgreSQL

Update connection in `.env`:
```bash
DB_HOST=<managed_db_host>
DB_PORT=5432
DB_NAME=derm_db
DB_USER=derm_user
DB_PASSWORD=<secure_password>
```

### Option 2: Self-Hosted Database

If using the included PostgreSQL container:

```bash
# Ensure strong password in .env
DB_PASSWORD=$(openssl rand -base64 32)

# Update docker-compose.prod.yml with password
```

### Run Migrations

```bash
# Set DATABASE_URL
export DATABASE_URL=postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}

# Run migrations
chmod +x scripts/migrate.sh
./scripts/migrate.sh

# Seed initial data (optional)
cd backend
npm run db:seed
```

## Docker Deployment

### 1. Build Images

```bash
# Build backend
cd backend
docker build -t derm-backend:latest .

# Build frontend
cd ../frontend
docker build -t derm-frontend:latest .
```

### 2. Start Services

```bash
# Return to root
cd ..

# Start all services
docker-compose -f docker-compose.prod.yml up -d

# Verify services are running
docker-compose -f docker-compose.prod.yml ps

# Check logs
docker-compose -f docker-compose.prod.yml logs -f
```

### 3. Verify Deployment

```bash
# Check backend health
curl http://localhost:4000/api/health

# Check frontend
curl http://localhost:80

# Check database connectivity
docker-compose -f docker-compose.prod.yml exec backend node -e "require('./dist/db/pool').pool.query('SELECT 1').then(() => console.log('DB OK')).catch(e => console.error('DB Error:', e))"
```

## SSL/TLS Configuration

### Option 1: Let's Encrypt with Certbot

```bash
# Install Certbot
sudo apt install -y certbot

# Generate certificate
sudo certbot certonly --standalone -d app.yourdomain.com -d api.yourdomain.com

# Certificates will be in:
# /etc/letsencrypt/live/app.yourdomain.com/fullchain.pem
# /etc/letsencrypt/live/app.yourdomain.com/privkey.pem

# Update .env
SSL_ENABLED=true
SSL_CERT_PATH=/etc/letsencrypt/live/app.yourdomain.com/fullchain.pem
SSL_KEY_PATH=/etc/letsencrypt/live/app.yourdomain.com/privkey.pem

# Set up auto-renewal
sudo crontab -e
# Add: 0 0 * * * certbot renew --quiet
```

### Option 2: Nginx Reverse Proxy with SSL

Create `/etc/nginx/sites-available/derm-app`:

```nginx
server {
    listen 80;
    server_name app.yourdomain.com api.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name app.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/app.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.yourdomain.com/privkey.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    location / {
        proxy_pass http://localhost:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/app.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/derm-app /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## Monitoring Setup

### 1. Sentry Configuration

```bash
# Sign up at sentry.io
# Create new project
# Copy DSN to .env
SENTRY_DSN=https://xxx@sentry.io/xxx

# Verify Sentry is working
curl -X POST https://api.yourdomain.com/api/test-error
```

### 2. Prometheus & Grafana (Optional)

```yaml
# Add to docker-compose.prod.yml
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    volumes:
      - grafana_data:/var/lib/grafana
```

Create `prometheus.yml`:
```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'derm-backend'
    static_configs:
      - targets: ['backend:4000']
    metrics_path: '/api/health/metrics'
```

### 3. Log Management

```bash
# View logs
docker-compose -f docker-compose.prod.yml logs -f backend
docker-compose -f docker-compose.prod.yml logs -f frontend

# Set up log rotation
sudo nano /etc/docker/daemon.json
```

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "5"
  }
}
```

## Backup Configuration

### 1. Configure AWS S3 Backup

```bash
# Create S3 bucket
aws s3 mb s3://derm-backups-production

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket derm-backups-production \
  --versioning-configuration Status=Enabled

# Set lifecycle policy for old backups
aws s3api put-bucket-lifecycle-configuration \
  --bucket derm-backups-production \
  --lifecycle-configuration file://lifecycle.json
```

### 2. Set Up Automated Backups

```bash
# Configure backup environment
export BACKUP_BUCKET=derm-backups-production
export BACKUP_ENCRYPTION_KEY=$(openssl rand -base64 32)
export BACKUP_RETENTION_DAYS=90

# Test backup
./scripts/backup.sh

# Set up cron job
crontab -e
# Add: 0 2 * * * /opt/derm-app/scripts/backup.sh >> /var/log/derm-backup.log 2>&1
```

### 3. Test Restore Process

```bash
# List backups
aws s3 ls s3://derm-backups-production/backups/ --recursive

# Test restore (to test database)
./scripts/restore.sh <backup_file> --from-s3
```

## Post-Deployment

### 1. Verify All Services

```bash
# Health check
curl https://api.yourdomain.com/api/health

# Test login
curl -X POST https://api.yourdomain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: tenant-demo" \
  -d '{"email":"admin@demo.practice","password":"Password123!"}'

# Test file upload
# (Use Postman or similar)

# Check metrics
curl https://api.yourdomain.com/api/health/metrics
```

### 2. Performance Testing

```bash
# Install Apache Bench
sudo apt install apache2-utils

# Test API performance
ab -n 1000 -c 10 https://api.yourdomain.com/api/health

# Monitor resource usage
docker stats
```

### 3. Security Audit

```bash
# Run security scan
npm audit

# Check for exposed secrets
git secrets --scan

# SSL test
https://www.ssllabs.com/ssltest/analyze.html?d=api.yourdomain.com
```

### 4. Change Default Credentials

```sql
-- Connect to database
psql $DATABASE_URL

-- Update admin password
UPDATE users
SET password_hash = crypt('NewSecurePassword123!', gen_salt('bf', 10))
WHERE email = 'admin@demo.practice';
```

### 5. Configure Monitoring Alerts

Set up alerts for:
- High error rates
- Slow response times
- Database connection failures
- High memory usage
- Disk space warnings

## Troubleshooting

### Service Won't Start

```bash
# Check logs
docker-compose -f docker-compose.prod.yml logs backend

# Check if ports are in use
sudo lsof -i :4000
sudo lsof -i :80

# Verify environment variables
docker-compose -f docker-compose.prod.yml config
```

### Database Connection Issues

```bash
# Test database connection
psql $DATABASE_URL

# Check if database is accepting connections
docker-compose -f docker-compose.prod.yml exec postgres pg_isready

# Verify credentials
docker-compose -f docker-compose.prod.yml exec postgres psql -U derm_user -d derm_db
```

### High Memory Usage

```bash
# Check container resources
docker stats

# Increase Node.js memory limit
# Update docker-compose.prod.yml
environment:
  NODE_OPTIONS: "--max-old-space-size=4096"
```

### SSL Certificate Errors

```bash
# Verify certificate
openssl x509 -in /etc/letsencrypt/live/app.yourdomain.com/fullchain.pem -text -noout

# Check renewal
sudo certbot renew --dry-run

# Force renewal
sudo certbot renew --force-renewal
```

## Rollback Procedure

If deployment fails:

```bash
# 1. Stop new deployment
docker-compose -f docker-compose.prod.yml down

# 2. Restore from backup
./scripts/restore.sh <previous_backup> --from-s3

# 3. Deploy previous version
git checkout <previous_tag>
docker-compose -f docker-compose.prod.yml up -d

# 4. Verify rollback
curl https://api.yourdomain.com/api/health
```

## Maintenance

### Regular Maintenance Tasks

**Daily**:
- Monitor error logs
- Check backup success
- Review audit logs

**Weekly**:
- Review performance metrics
- Check disk space
- Update dependencies

**Monthly**:
- Security patches
- Database optimization
- Backup verification

### Updates

```bash
# Pull latest changes
git pull origin main

# Backup before update
./scripts/backup.sh

# Rebuild and deploy
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d

# Run new migrations
./scripts/migrate.sh

# Verify deployment
curl https://api.yourdomain.com/api/health
```

## Support

For deployment assistance:
- Email: support@yourdomain.com
- Documentation: https://docs.yourdomain.com
- Status: https://status.yourdomain.com

---

**Last Updated**: December 2025
**Version**: 1.0.0
