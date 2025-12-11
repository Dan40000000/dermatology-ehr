# Production Deployment - Quick Start Guide

This is a condensed quick-start guide for deploying to production. For complete details, see [DEPLOYMENT.md](./DEPLOYMENT.md).

## Prerequisites Checklist

- [ ] Server with 4+ CPU cores, 8+ GB RAM
- [ ] Docker and Docker Compose installed
- [ ] Domain name with DNS access
- [ ] SSL certificates (Let's Encrypt or commercial)
- [ ] PostgreSQL 16 (managed or Docker)
- [ ] AWS account with S3 access
- [ ] Email service (SendGrid, AWS SES, etc.)
- [ ] Sentry account for error tracking

## Step 1: Server Setup (15 minutes)

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install PostgreSQL client
sudo apt install -y postgresql-client

# Configure firewall
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## Step 2: Clone and Configure (10 minutes)

```bash
# Clone repository
cd /opt
sudo git clone https://github.com/yourusername/derm-app.git
cd derm-app

# Create environment file
cp .env.example .env
nano .env
```

### Critical Environment Variables

```bash
# Generate secure secrets
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Required variables (copy output from above)
NODE_ENV=production
DB_PASSWORD=<secure_password>
JWT_SECRET=<64_char_secret>
CSRF_SECRET=<64_char_secret>
SESSION_SECRET=<64_char_secret>
ENCRYPTION_KEY=<32_byte_key>
REDIS_PASSWORD=<secure_password>

# URLs
API_URL=https://api.yourdomain.com
FRONTEND_URL=https://app.yourdomain.com

# AWS S3
AWS_REGION=us-east-1
AWS_S3_BUCKET=derm-uploads-production
AWS_ACCESS_KEY_ID=<your_key>
AWS_SECRET_ACCESS_KEY=<your_secret>

# Email
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=<sendgrid_api_key>
FROM_EMAIL=noreply@yourdomain.com

# Monitoring
SENTRY_DSN=<your_sentry_dsn>
```

## Step 3: Database Setup (10 minutes)

```bash
# Set database URL
export DATABASE_URL="postgres://derm_user:${DB_PASSWORD}@localhost:5432/derm_db"

# Run migrations
chmod +x scripts/migrate.sh
./scripts/migrate.sh

# Optional: Seed sample data
cd backend
npm run db:seed
```

## Step 4: Deploy with Docker (15 minutes)

```bash
# Build images
docker-compose -f docker-compose.prod.yml build

# Start services
docker-compose -f docker-compose.prod.yml up -d

# Verify all services are running
docker-compose -f docker-compose.prod.yml ps

# Check logs
docker-compose -f docker-compose.prod.yml logs -f
```

## Step 5: SSL/TLS Setup (10 minutes)

### Option A: Let's Encrypt (Recommended)

```bash
# Install Certbot
sudo apt install -y certbot

# Generate certificate
sudo certbot certonly --standalone \
  -d app.yourdomain.com \
  -d api.yourdomain.com

# Certificates will be in:
# /etc/letsencrypt/live/app.yourdomain.com/fullchain.pem
# /etc/letsencrypt/live/app.yourdomain.com/privkey.pem

# Set up auto-renewal
sudo crontab -e
# Add: 0 0 * * * certbot renew --quiet
```

### Option B: Nginx Reverse Proxy

```bash
# Install Nginx
sudo apt install -y nginx

# Create configuration
sudo nano /etc/nginx/sites-available/derm-app
# (Copy configuration from DEPLOYMENT.md)

# Enable site
sudo ln -s /etc/nginx/sites-available/derm-app /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## Step 6: Verify Deployment (5 minutes)

```bash
# Health check
curl https://api.yourdomain.com/api/health

# Should return:
# {"status":"healthy","uptime":123,"version":"1.0.0",...}

# Test login
curl -X POST https://api.yourdomain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: tenant-demo" \
  -d '{"email":"admin@demo.practice","password":"Password123!"}'

# Test frontend
curl https://app.yourdomain.com

# Check metrics
curl https://api.yourdomain.com/api/health/metrics
```

## Step 7: Configure Backups (10 minutes)

```bash
# Configure AWS credentials
aws configure

# Create S3 bucket
aws s3 mb s3://derm-backups-production

# Test backup
export BACKUP_BUCKET=derm-backups-production
export BACKUP_ENCRYPTION_KEY=$(openssl rand -base64 32)
./scripts/backup.sh

# Set up daily backups
crontab -e
# Add: 0 2 * * * /opt/derm-app/scripts/backup.sh >> /var/log/derm-backup.log 2>&1
```

## Step 8: Security Hardening (10 minutes)

```bash
# Change default passwords
psql $DATABASE_URL

# Update admin password
UPDATE users
SET password_hash = crypt('NewSecurePassword123!', gen_salt('bf', 10))
WHERE email = 'admin@demo.practice';

\q

# Test SSL configuration
# Visit: https://www.ssllabs.com/ssltest/analyze.html?d=api.yourdomain.com

# Verify security headers
curl -I https://api.yourdomain.com
# Should see: X-Frame-Options, X-Content-Type-Options, etc.
```

## Step 9: Monitoring Setup (5 minutes)

```bash
# Verify Sentry
# 1. Log into sentry.io
# 2. Create new project
# 3. Copy DSN to .env
# 4. Restart backend

# Test error tracking
curl https://api.yourdomain.com/api/test-error

# Set up uptime monitoring
# Use: UptimeRobot, Pingdom, or StatusCake
# Monitor: https://api.yourdomain.com/api/health
```

## Step 10: Final Verification

```bash
# Run through production checklist
cat PRODUCTION_CHECKLIST.md

# Verify all items are checked:
# - [ ] All services running
# - [ ] Health checks passing
# - [ ] SSL working
# - [ ] Backups configured
# - [ ] Monitoring active
# - [ ] Default passwords changed
```

## Common Issues & Solutions

### Port Already in Use
```bash
# Find process using port
sudo lsof -i :4000

# Kill process
sudo kill -9 <PID>
```

### Database Connection Failed
```bash
# Check PostgreSQL is running
docker-compose -f docker-compose.prod.yml ps postgres

# Check logs
docker-compose -f docker-compose.prod.yml logs postgres

# Test connection
psql $DATABASE_URL
```

### Container Won't Start
```bash
# Check logs
docker-compose -f docker-compose.prod.yml logs backend

# Restart service
docker-compose -f docker-compose.prod.yml restart backend

# Rebuild if needed
docker-compose -f docker-compose.prod.yml build backend
docker-compose -f docker-compose.prod.yml up -d backend
```

### High Memory Usage
```bash
# Check container stats
docker stats

# Increase Node.js memory (in docker-compose.prod.yml)
environment:
  NODE_OPTIONS: "--max-old-space-size=4096"
```

## Rollback Procedure

If something goes wrong:

```bash
# 1. Stop deployment
docker-compose -f docker-compose.prod.yml down

# 2. Restore database
./scripts/restore.sh <backup_file> --from-s3

# 3. Deploy previous version
git checkout <previous_tag>
docker-compose -f docker-compose.prod.yml up -d

# 4. Verify
curl https://api.yourdomain.com/api/health
```

## Maintenance Commands

### View Logs
```bash
docker-compose -f docker-compose.prod.yml logs -f backend
docker-compose -f docker-compose.prod.yml logs -f frontend
```

### Restart Service
```bash
docker-compose -f docker-compose.prod.yml restart backend
```

### Update Application
```bash
git pull origin main
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d
./scripts/migrate.sh
```

### Database Backup
```bash
./scripts/backup.sh
```

### Database Restore
```bash
./scripts/restore.sh <backup_file>
```

## Performance Optimization

### Enable Caching
```bash
# Ensure Redis is running
docker-compose -f docker-compose.prod.yml ps redis

# Check cache stats
docker-compose -f docker-compose.prod.yml exec redis redis-cli INFO stats
```

### Optimize Database
```bash
# Connect to database
psql $DATABASE_URL

# Analyze tables
ANALYZE;

# Vacuum database
VACUUM;
```

## Next Steps

1. **Monitor for 24 hours**
   - Check error rates in Sentry
   - Monitor response times
   - Verify backups running

2. **Performance testing**
   - Run load tests
   - Monitor resource usage
   - Optimize as needed

3. **User onboarding**
   - Train staff on new system
   - Migrate data from old system
   - Enable patient portal

## Support

- **Documentation**: See `DEPLOYMENT.md` for details
- **Checklist**: See `PRODUCTION_CHECKLIST.md`
- **Architecture**: See `ARCHITECTURE.md`
- **Issues**: GitHub Issues
- **Emergency**: support@yourdomain.com

---

**Total Deployment Time**: ~90 minutes
**Difficulty**: Intermediate
**Production Ready**: Yes (95%)

For complete details and advanced configuration, see [DEPLOYMENT.md](./DEPLOYMENT.md).
