#!/bin/bash
# =============================================================================
# DERMATOLOGY EHR - LOCAL DEVELOPMENT SETUP
# =============================================================================
# One-command setup for local development environment.
#
# Usage:
#   ./scripts/setup-dev.sh [--skip-docker] [--skip-deps] [--skip-seed]
#
# Options:
#   --skip-docker  Skip starting Docker containers (assumes they're already running)
#   --skip-deps    Skip npm install steps
#   --skip-seed    Skip database seeding
#   --help         Show this help message
#
# Prerequisites:
#   - Docker Desktop (or Docker + Docker Compose)
#   - Node.js 18+ and npm
#   - Git
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
SKIP_DOCKER=false
SKIP_DEPS=false
SKIP_SEED=false

# Parse arguments
for arg in "$@"; do
  case $arg in
    --skip-docker)
      SKIP_DOCKER=true
      shift
      ;;
    --skip-deps)
      SKIP_DEPS=true
      shift
      ;;
    --skip-seed)
      SKIP_SEED=true
      shift
      ;;
    --help|-h)
      head -25 "$0" | tail -20
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

check_command() {
  if command -v "$1" &> /dev/null; then
    print_success "$1 is installed"
    return 0
  else
    print_error "$1 is not installed"
    return 1
  fi
}

# =============================================================================
# STEP 0: Header
# =============================================================================
print_header "DERMATOLOGY EHR - Development Setup"
echo ""
echo "Project root: $PROJECT_ROOT"
echo "Started at: $(date)"
echo ""

# =============================================================================
# STEP 1: Check Prerequisites
# =============================================================================
print_header "Step 1: Checking Prerequisites"

PREREQS_OK=true

# Check Docker
print_step "Checking Docker..."
if check_command docker; then
  # Check if Docker daemon is running
  if docker info &> /dev/null; then
    print_success "Docker daemon is running"
  else
    print_error "Docker daemon is not running. Please start Docker Desktop."
    PREREQS_OK=false
  fi
else
  print_error "Docker is required. Install Docker Desktop from https://docker.com"
  PREREQS_OK=false
fi

# Check Docker Compose
print_step "Checking Docker Compose..."
if docker compose version &> /dev/null; then
  print_success "Docker Compose is available ($(docker compose version --short))"
elif check_command docker-compose; then
  print_warning "Using legacy docker-compose. Consider updating Docker Desktop."
else
  print_error "Docker Compose is required"
  PREREQS_OK=false
fi

# Check Node.js
print_step "Checking Node.js..."
if check_command node; then
  NODE_VERSION=$(node -v | sed 's/v//')
  NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
  if [ "$NODE_MAJOR" -ge 18 ]; then
    print_success "Node.js version $NODE_VERSION (>= 18 required)"
  else
    print_error "Node.js 18+ is required. Current: $NODE_VERSION"
    PREREQS_OK=false
  fi
else
  PREREQS_OK=false
fi

# Check npm
print_step "Checking npm..."
check_command npm || PREREQS_OK=false

# Check Git
print_step "Checking Git..."
check_command git || PREREQS_OK=false

# Exit if prerequisites are not met
if [ "$PREREQS_OK" = false ]; then
  echo ""
  print_error "Prerequisites check failed. Please install missing dependencies."
  exit 1
fi

print_success "All prerequisites met!"

# =============================================================================
# STEP 2: Setup Environment File
# =============================================================================
print_header "Step 2: Setting Up Environment"

cd "$PROJECT_ROOT"

# Root .env.local
if [ ! -f ".env.local" ]; then
  if [ -f ".env.local.example" ]; then
    print_step "Creating .env.local from .env.local.example..."
    cp .env.local.example .env.local
    print_success "Created .env.local"
  else
    print_warning ".env.local.example not found, skipping root .env.local"
  fi
else
  print_success ".env.local already exists"
fi

# Backend .env
if [ ! -f "backend/.env" ]; then
  if [ -f ".env.local" ]; then
    print_step "Creating backend/.env from root .env.local..."
    cp .env.local backend/.env
    print_success "Created backend/.env"
  elif [ -f "backend/.env.example" ]; then
    print_step "Creating backend/.env from backend/.env.example..."
    cp backend/.env.example backend/.env
    print_success "Created backend/.env"
  fi
else
  print_success "backend/.env already exists"
fi

# Frontend .env
if [ ! -f "frontend/.env" ]; then
  if [ -f "frontend/.env.example" ]; then
    print_step "Creating frontend/.env from frontend/.env.example..."
    cp frontend/.env.example frontend/.env
    print_success "Created frontend/.env"
  fi
else
  print_success "frontend/.env already exists"
fi

# =============================================================================
# STEP 3: Start Docker Services
# =============================================================================
if [ "$SKIP_DOCKER" = false ]; then
  print_header "Step 3: Starting Docker Services"

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

  print_step "Waiting for LocalStack to be ready..."
  RETRY_COUNT=0
  while ! curl -s http://localhost:4566/_localstack/health | grep -q '"s3": "available"' 2>/dev/null; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
      print_warning "LocalStack may not be fully ready (continuing anyway)"
      break
    fi
    echo -n "."
    sleep 2
  done
  echo ""
  print_success "LocalStack is ready"

  print_success "All Docker services are running"
else
  print_header "Step 3: Skipping Docker (--skip-docker)"
fi

# =============================================================================
# STEP 4: Install Dependencies
# =============================================================================
if [ "$SKIP_DEPS" = false ]; then
  print_header "Step 4: Installing Dependencies"

  print_step "Installing root dependencies..."
  npm install

  print_step "Installing backend dependencies..."
  cd "$PROJECT_ROOT/backend"
  npm install

  print_step "Installing frontend dependencies..."
  cd "$PROJECT_ROOT/frontend"
  npm install

  cd "$PROJECT_ROOT"
  print_success "All dependencies installed"
else
  print_header "Step 4: Skipping Dependencies (--skip-deps)"
fi

# =============================================================================
# STEP 5: Run Database Migrations
# =============================================================================
print_header "Step 5: Running Database Migrations"

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
# STEP 6: Seed Database
# =============================================================================
if [ "$SKIP_SEED" = false ]; then
  print_header "Step 6: Seeding Database"

  cd "$PROJECT_ROOT/backend"

  print_step "Running database seed..."
  npm run db:seed 2>&1 || {
    print_warning "db:seed may have encountered some errors (non-fatal)"
  }

  # Optionally run demo seed for development data
  print_step "Running demo seed for development data..."
  npm run seed:demo 2>&1 || {
    print_warning "seed:demo may have encountered some errors (non-fatal)"
  }

  print_success "Database seeding complete"
else
  print_header "Step 6: Skipping Seed (--skip-seed)"
fi

# =============================================================================
# STEP 7: Final Summary
# =============================================================================
print_header "Setup Complete!"

cd "$PROJECT_ROOT"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN} Development Environment Ready!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Service URLs:"
echo "  - Frontend:      http://localhost:5173"
echo "  - Backend API:   http://localhost:4000"
echo "  - API Docs:      http://localhost:4000/api-docs"
echo "  - Mailhog UI:    http://localhost:8025"
echo "  - Adminer (DB):  http://localhost:8080"
echo "  - LocalStack S3: http://localhost:4566"
echo ""
echo "Database connection:"
echo "  - Host:     localhost:5432"
echo "  - Database: derm_dev"
echo "  - User:     derm_dev"
echo "  - Password: derm_dev"
echo ""
echo "To start the application:"
echo "  npm run dev"
echo ""
echo "Or start backend/frontend separately:"
echo "  cd backend && npm run dev"
echo "  cd frontend && npm run dev"
echo ""
echo "To view Docker logs:"
echo "  docker compose -f docker-compose.dev.yml logs -f"
echo ""
echo "To reset everything:"
echo "  ./scripts/reset-dev.sh"
echo ""
echo "Finished at: $(date)"
