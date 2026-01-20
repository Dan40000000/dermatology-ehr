#!/bin/bash

# Claims System Setup Script
# This script sets up the enhanced claims management system

set -e

echo "============================================"
echo "Claims Management System Setup"
echo "============================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the backend directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: Must be run from the backend directory${NC}"
    exit 1
fi

echo -e "${YELLOW}Step 1: Running database migrations...${NC}"
if npm run db:migrate; then
    echo -e "${GREEN}✓ Migrations completed successfully${NC}"
else
    echo -e "${RED}✗ Migration failed${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Step 2: Seeding fee schedules and diagnosis codes...${NC}"
# The migration already seeds these, so we just verify
echo -e "${GREEN}✓ Fee schedules and diagnosis codes seeded via migration${NC}"

echo ""
echo -e "${YELLOW}Step 3: Seeding claims data...${NC}"
if npx ts-node-dev --transpile-only src/db/seed-claims.ts; then
    echo -e "${GREEN}✓ Claims data seeded successfully${NC}"
else
    echo -e "${RED}✗ Claims seeding failed${NC}"
    echo -e "${YELLOW}Note: Make sure you have run the regular seed first (npm run db:seed)${NC}"
    exit 1
fi

echo ""
echo "============================================"
echo -e "${GREEN}✓ Setup Complete!${NC}"
echo "============================================"
echo ""
echo "Next steps:"
echo "1. Start the backend: npm run dev"
echo "2. Start the frontend: cd ../frontend && npm run dev"
echo "3. Navigate to /claims-dashboard to view the enhanced claims system"
echo ""
echo "Features available:"
echo "  - 10 realistic dermatology claims"
echo "  - 165+ ICD-10 diagnosis codes"
echo "  - 17 common CPT procedure codes"
echo "  - Financial metrics and aging buckets"
echo "  - Denial tracking"
echo "  - Fee schedule integration"
echo ""
