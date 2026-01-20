# Derm CLI - Quick Start Guide

## Installation

### Option 1: Global Installation (Recommended)

```bash
cd /Users/danperry/Desktop/Dermatology\ program/derm-app/cli
npm install
npm run build
npm link
```

Now you can use `derm` from anywhere:

```bash
derm --help
```

### Option 2: Local Usage

```bash
cd /Users/danperry/Desktop/Dermatology\ program/derm-app/cli
npm install
npm run build
node dist/index.js --help
```

### Option 3: Using npx

```bash
cd /Users/danperry/Desktop/Dermatology\ program/derm-app/cli
npm install
npm run build
npx derm --help
```

## Initial Setup

1. **Initialize Configuration**
```bash
derm config init
```

This will prompt you for:
- Database host (default: localhost)
- Database port (default: 5432)
- Database name (default: dermatology_db)
- Database user (default: postgres)
- Database password
- Environment (development/staging/production)
- API URL (optional)
- Backup directory (optional)

Configuration is saved to `~/.dermrc`

2. **Verify Connection**
```bash
derm status
```

This checks:
- Database connectivity
- API health (if configured)
- Database tables
- Active connections

## Common Tasks

### Database Management

```bash
# Run migrations
derm db:migrate

# Seed database with sample data
derm db:seed

# Backup database
derm db:backup

# Backup to specific file
derm db:backup --output /path/to/backup.sql

# Restore from backup
derm db:restore /path/to/backup.sql

# Reset database (WARNING: Destructive!)
derm db:reset --force
```

### User Management

```bash
# Create new user (interactive)
derm user:create

# List all users
derm user:list

# List users by role
derm user:list --role doctor

# List users for specific tenant
derm user:list --tenant <tenant-id>

# Reset user password
derm user:reset-password user@example.com

# Deactivate user
derm user:deactivate user@example.com

# Activate user
derm user:activate user@example.com
```

### Tenant Management

```bash
# Create new tenant (interactive)
derm tenant:create

# List all tenants
derm tenant:list

# Show tenant details
derm tenant:info <tenant-id-or-slug>

# Deactivate tenant
derm tenant:deactivate <tenant-id-or-slug>

# Activate tenant
derm tenant:activate <tenant-id-or-slug>
```

### Data Export/Import

```bash
# Export all patients
derm export:patients

# Export patients for specific tenant
derm export:patients --tenant <tenant-id> --output patients.csv

# Export appointments
derm export:appointments

# Export appointments for date range
derm export:appointments --from 2024-01-01 --to 2024-12-31

# Import patients from CSV
derm import:patients patients.csv --tenant <tenant-id>

# Dry run (validate without importing)
derm import:patients patients.csv --tenant <tenant-id> --dry-run
```

### Development Commands

```bash
# Start all services
derm dev:start

# Start only backend
derm dev:start --backend-only

# Start only frontend
derm dev:start --frontend-only

# Tail logs
derm dev:logs

# Run tests
derm dev:test

# Run backend tests
derm dev:test --backend

# Run tests with coverage
derm dev:test --coverage

# Build all packages
derm dev:build
```

### Health & Statistics

```bash
# Check system health
derm status

# Detailed status
derm status --verbose

# Show statistics
derm stats
```

## Configuration Management

```bash
# Show current configuration
derm config show

# Show configuration with password visible
derm config show --show-password

# Get specific value
derm config get database.host

# Set specific value
derm config set database.port 5433

# Set environment
derm config set environment production
```

## Tips & Best Practices

1. **Always initialize config first**: `derm config init`

2. **Test connection before operations**: `derm status`

3. **Backup before destructive operations**:
   ```bash
   derm db:backup
   derm db:reset --force
   ```

4. **Use dry-run for imports**:
   ```bash
   derm import:patients data.csv --tenant <id> --dry-run
   ```

5. **Check stats regularly**: `derm stats`

6. **Use environment-specific configs**: Create different `.dermrc` files for dev/staging/prod

7. **Enable debug mode for troubleshooting**:
   ```bash
   derm --debug <command>
   ```

## Troubleshooting

### Connection Issues

```bash
# Check configuration
derm config show

# Test connection
derm status

# Verify environment variables
echo $DB_HOST $DB_PORT $DB_NAME
```

### Permission Issues

```bash
# For global installation issues
sudo npm link

# Or use npx instead
npx derm <command>
```

### Missing Dependencies

```bash
cd /Users/danperry/Desktop/Dermatology\ program/derm-app/cli
npm install
npm run build
```

## Examples

### Complete Setup Flow

```bash
# 1. Install CLI
cd cli
npm install
npm run build
npm link

# 2. Initialize configuration
derm config init

# 3. Verify connection
derm status

# 4. Run migrations
derm db:migrate

# 5. Seed database
derm db:seed

# 6. Create first tenant
derm tenant:create

# 7. Create first user
derm user:create

# 8. Check stats
derm stats
```

### Daily Development Workflow

```bash
# Morning: Check system status
derm status

# Start development
derm dev:start

# Run tests before committing
derm dev:test

# Check stats
derm stats
```

### Production Deployment

```bash
# 1. Backup production database
derm config set environment production
derm db:backup --output prod-backup-$(date +%Y%m%d).sql

# 2. Run migrations
derm db:migrate

# 3. Verify health
derm status
derm stats

# 4. Monitor logs
derm dev:logs --follow
```

## Need Help?

```bash
# General help
derm --help

# Command-specific help
derm db --help
derm user --help
derm tenant --help

# Enable debug mode
derm --debug <command>
```

## Next Steps

- Read the full [README.md](./README.md) for detailed documentation
- Check [package.json](./package.json) for available scripts
- Explore command source code in `src/commands/`
