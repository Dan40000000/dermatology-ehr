#!/bin/bash
# =============================================================================
# DERMATOLOGY EHR - RESET DEVELOPMENT ENVIRONMENT
# =============================================================================
# Completely resets the local development environment.
# This will DELETE all data in the development database and volumes.
#
# Usage:
#   ./scripts/reset-dev.sh [--full] [--no-confirm] [--skip-seed]
#
# Options:
#   --full       Also removes node_modules and reinstalls dependencies
#   --no-confirm Skip confirmation prompt (use with caution)
#   --skip-seed  Skip database seeding after reset
#   --help       Show this help message
#
# WARNING: This script DELETES all development data!
# =============================================================================

set -e

# Script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Flags
FULL_RESET=false
SKIP_CONFIRM=false
SKIP_SEED=false

# Parse arguments
for arg in "$@"; do
  case $arg in
    --full)
      FULL_RESET=true
      shift
      ;;
    --no-confirm)
      SKIP_CONFIRM=true
      shift
      ;;
    --skip-seed)
      SKIP_SEED=true
      shift
      ;;
    --help|-h)
      head -20 "$0" | tail -17
      exit 0
      ;;
  esac
done

# Helper functions
print_header() {
  echo ""
  echo -e "${BLUE}=============================================${NC}"
  echo -e "${BLUE} $1${NC}"
  echo -e "${BLUE}=============================================${NC}"
}

print_step() {
  echo -e "${CYAN}>>> $1${NC}"
}

print_success() {
  echo -e "${GREEN}[OK] $1${NC}"
}

print_warning() {
  echo -e "${YELLOW}[WARN] $1${NC}"
}

print_error() {
  echo -e "${RED}[ERROR] $1${NC}"
}

# =============================================================================
# Confirmation
# =============================================================================
print_header "RESET DEVELOPMENT ENVIRONMENT"

echo ""
echo -e "${YELLOW}WARNING: This will DELETE all development data!${NC}"
echo ""
echo "The following will be removed:"
echo "  - All Docker volumes (database data, Redis data, LocalStack data)"
echo "  - All data in the development database"
if [ "$FULL_RESET" = true ]; then
  echo "  - All node_modules directories"
fi
echo ""

if [ "$SKIP_CONFIRM" = false ]; then
  read -p "Are you sure you want to continue? (yes/no): " CONFIRM
  if [ "$CONFIRM" != "yes" ]; then
    echo "Aborted."
    exit 0
  fi
  echo ""
fi

cd "$PROJECT_ROOT"

# =============================================================================
# STEP 1: Stop Docker Containers
# =============================================================================
print_header "Step 1: Stopping Docker Containers"

print_step "Stopping all development containers..."
docker compose -f docker-compose.dev.yml down 2>/dev/null || {
  print_warning "No containers to stop or docker-compose.dev.yml not found"
}

print_success "Containers stopped"

# =============================================================================
# STEP 2: Remove Docker Volumes
# =============================================================================
print_header "Step 2: Removing Docker Volumes"

print_step "Removing Docker volumes..."
docker compose -f docker-compose.dev.yml down -v 2>/dev/null || true

# Explicitly remove named volumes if they exist
VOLUMES_TO_REMOVE=(
  "derm-dev-pg-data"
  "derm-dev-redis-data"
  "derm-dev-localstack-data"
  "derm-dev-clamav-data"
  "derm-pg-data-dev"
  "derm-clamav-data-dev"
  "derm-localstack-data-dev"
  "derm-redis-data-dev"
)

for vol in "${VOLUMES_TO_REMOVE[@]}"; do
  if docker volume ls -q | grep -q "^${vol}$"; then
    print_step "Removing volume: $vol"
    docker volume rm "$vol" 2>/dev/null || true
  fi
done

print_success "Docker volumes removed"

# =============================================================================
# STEP 3: Clean Local Files (Optional)
# =============================================================================
if [ "$FULL_RESET" = true ]; then
  print_header "Step 3: Cleaning Local Files (--full)"

  print_step "Removing node_modules..."
  rm -rf "$PROJECT_ROOT/node_modules"
  rm -rf "$PROJECT_ROOT/backend/node_modules"
  rm -rf "$PROJECT_ROOT/frontend/node_modules"

  print_step "Removing build artifacts..."
  rm -rf "$PROJECT_ROOT/backend/dist"
  rm -rf "$PROJECT_ROOT/frontend/dist"

  print_step "Removing local uploads..."
  rm -rf "$PROJECT_ROOT/uploads"
  rm -rf "$PROJECT_ROOT/backend/uploads"

  print_success "Local files cleaned"
else
  print_header "Step 3: Skipping Local Files Cleanup"
  echo "Use --full flag to also remove node_modules and build artifacts"
fi

# =============================================================================
# STEP 4: Restart Docker Containers
# =============================================================================
print_header "Step 4: Restarting Docker Containers"

print_step "Starting Docker containers..."
docker compose -f docker-compose.dev.yml up -d

print_step "Waiting for PostgreSQL to be ready..."
MAX_RETRIES=30
RETRY_COUNT=0

while ! docker compose -f docker-compose.dev.yml exec -T postgres pg_isready -U derm_dev -d derm_dev &> /dev/null; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    print_error "PostgreSQL failed to start after $MAX_RETRIES attempts"
    exit 1
  fi
  echo -n "."
  sleep 1
done
echo ""
print_success "PostgreSQL is ready"

print_step "Waiting for Redis to be ready..."
RETRY_COUNT=0
while ! docker compose -f docker-compose.dev.yml exec -T redis redis-cli ping &> /dev/null; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    print_error "Redis failed to start after $MAX_RETRIES attempts"
    exit 1
  fi
  echo -n "."
  sleep 1
done
echo ""
print_success "Redis is ready"

print_success "All services restarted"

# =============================================================================
# STEP 5: Reinstall Dependencies (if full reset)
# =============================================================================
if [ "$FULL_RESET" = true ]; then
  print_header "Step 5: Reinstalling Dependencies"

  print_step "Installing root dependencies..."
  npm install

  print_step "Installing backend dependencies..."
  cd "$PROJECT_ROOT/backend"
  npm install

  print_step "Installing frontend dependencies..."
  cd "$PROJECT_ROOT/frontend"
  npm install

  cd "$PROJECT_ROOT"
  print_success "Dependencies installed"
else
  print_header "Step 5: Skipping Dependency Installation"
fi

# =============================================================================
# STEP 6: Run Migrations
# =============================================================================
print_header "Step 6: Running Database Migrations"

cd "$PROJECT_ROOT/backend"

# Load environment variables
if [ -f ".env" ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Use default DATABASE_URL if not set
export DATABASE_URL="${DATABASE_URL:-postgres://derm_dev:derm_dev@localhost:5432/derm_dev}"

print_step "Running migrations..."
npm run db:migrate 2>&1 || {
  print_warning "db:migrate script failed, trying direct migration..."
  if [ -f "$PROJECT_ROOT/scripts/migrate.sh" ]; then
    bash "$PROJECT_ROOT/scripts/migrate.sh"
  else
    print_error "Migration failed"
    exit 1
  fi
}

print_success "Migrations complete"

# =============================================================================
# STEP 7: Seed Database
# =============================================================================
if [ "$SKIP_SEED" = false ]; then
  print_header "Step 7: Seeding Database"

  cd "$PROJECT_ROOT/backend"

  print_step "Running database seed..."
  npm run db:seed 2>&1 || {
    print_warning "db:seed may have encountered some errors (non-fatal)"
  }

  print_step "Running demo seed for development data..."
  npm run seed:demo 2>&1 || {
    print_warning "seed:demo may have encountered some errors (non-fatal)"
  }

  print_success "Database seeding complete"
else
  print_header "Step 7: Skipping Seed (--skip-seed)"
fi

# =============================================================================
# STEP 8: Final Summary
# =============================================================================
print_header "Reset Complete!"

cd "$PROJECT_ROOT"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN} Development Environment Reset!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "All development data has been cleared and reseeded."
echo ""
echo "Service URLs:"
echo "  - Frontend:      http://localhost:5173"
echo "  - Backend API:   http://localhost:4000"
echo "  - Mailhog UI:    http://localhost:8025"
echo "  - Adminer (DB):  http://localhost:8080"
echo ""
echo "To start the application:"
echo "  npm run dev"
echo ""
echo "Finished at: $(date)"
