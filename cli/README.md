# Dermatology App CLI

A professional command-line interface for managing the Dermatology App.

## Installation

### Global Installation

```bash
cd cli
npm install
npm run build
npm link
```

Now you can use the `derm` command from anywhere:

```bash
derm --help
```

### Local Usage with npx

```bash
cd cli
npm install
npm run build
npx derm --help
```

### Development

```bash
cd cli
npm install
npm run dev -- --help
```

## Quick Start

1. Initialize configuration:
```bash
derm config init
```

2. Check system status:
```bash
derm status
```

3. Run migrations:
```bash
derm db:migrate
```

## Commands

### Configuration

- `derm config init` - Initialize CLI configuration
- `derm config show` - Show current configuration
- `derm config set <key> <value>` - Set configuration value
- `derm config get <key>` - Get configuration value

### Database Management

- `derm db:migrate` - Run database migrations
- `derm db:seed` - Seed database with sample data
- `derm db:reset` - Reset database (drop all tables and re-run migrations)
- `derm db:backup` - Backup database to file
- `derm db:restore <file>` - Restore database from backup

### User Management

- `derm user:create` - Create a new user (interactive)
- `derm user:list` - List all users
- `derm user:reset-password <email>` - Reset user password
- `derm user:deactivate <email>` - Deactivate a user
- `derm user:activate <email>` - Activate a user

### Tenant Management

- `derm tenant:create` - Create a new tenant (interactive)
- `derm tenant:list` - List all tenants
- `derm tenant:info <id>` - Show detailed tenant information
- `derm tenant:deactivate <id>` - Deactivate a tenant
- `derm tenant:activate <id>` - Activate a tenant

### Data Export/Import

- `derm export:patients` - Export patients to CSV
- `derm export:appointments` - Export appointments to CSV
- `derm import:patients <file>` - Import patients from CSV

### Development

- `derm dev:start` - Start all development services
- `derm dev:logs` - Tail application logs
- `derm dev:test` - Run tests
- `derm dev:build` - Build all packages

### Health & Status

- `derm status` - Check system health status
- `derm stats` - Show system statistics

### Data Sync

- `derm sync` - Sync data between environments

## Configuration

The CLI uses a configuration file located at `~/.dermrc`. You can create this file manually or use `derm config init`.

Example configuration:

```json
{
  "database": {
    "host": "localhost",
    "port": 5432,
    "database": "dermatology_db",
    "user": "postgres",
    "password": "your_password"
  },
  "environment": "development",
  "apiUrl": "http://localhost:3001",
  "backupDir": "/path/to/backups"
}
```

Alternatively, you can use environment variables:
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `NODE_ENV`
- `API_URL`
- `BACKUP_DIR`

## Examples

### Database Operations

```bash
# Run migrations
derm db:migrate

# Seed database with test data
derm db:seed --test

# Backup database
derm db:backup --output /path/to/backup.sql

# Reset database (dangerous!)
derm db:reset --force
```

### User Management

```bash
# Create a new user interactively
derm user:create

# List all active users
derm user:list

# List users filtered by role
derm user:list --role doctor

# Reset password for a user
derm user:reset-password user@example.com

# Deactivate a user
derm user:deactivate user@example.com
```

### Tenant Management

```bash
# Create a new tenant
derm tenant:create

# List all tenants
derm tenant:list

# Show detailed tenant info
derm tenant:info tenant-id

# Deactivate a tenant
derm tenant:deactivate tenant-slug
```

### Data Export

```bash
# Export all patients
derm export:patients

# Export patients for specific tenant
derm export:patients --tenant tenant-id --output patients.csv

# Export appointments for date range
derm export:appointments --from 2024-01-01 --to 2024-12-31
```

### Development Workflow

```bash
# Start all services
derm dev:start

# Start only backend
derm dev:start --backend-only

# Run tests with coverage
derm dev:test --coverage

# Build all packages
derm dev:build
```

### Health Checks

```bash
# Check system status
derm status

# Show detailed status
derm status --verbose

# Show system statistics
derm stats
```

## Features

- Colorful, user-friendly output with chalk
- Progress spinners with ora
- Interactive prompts with inquirer
- Table output with cli-table3
- Configuration file support (~/.dermrc)
- Environment detection (dev/staging/prod)
- Comprehensive error handling
- TypeScript support

## Requirements

- Node.js >= 16.0.0
- PostgreSQL database
- Access to the dermatology app database

## Troubleshooting

### Connection Issues

If you're having trouble connecting to the database:

1. Check your configuration:
```bash
derm config show
```

2. Test the connection:
```bash
derm status
```

3. Verify environment variables are set correctly

### Permission Issues

If you get permission errors when installing globally:

```bash
sudo npm link
```

Or use npx without global installation:

```bash
npx derm <command>
```

## Development

### Project Structure

```
cli/
├── src/
│   ├── commands/       # Command implementations
│   ├── utils/          # Utility functions
│   ├── types/          # TypeScript types
│   └── index.ts        # Main entry point
├── bin/
│   └── derm.js         # Executable entry point
├── dist/               # Compiled output
├── package.json
├── tsconfig.json
└── README.md
```

### Building

```bash
npm run build
```

### Running in Development

```bash
npm run dev -- <command>
```

## License

ISC
