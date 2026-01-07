#!/bin/bash

echo "=================================="
echo "Mobile App Installation Verification"
echo "=================================="
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} $1"
        return 0
    else
        echo -e "${RED}✗${NC} $1 (MISSING)"
        return 1
    fi
}

check_dir() {
    if [ -d "$1" ]; then
        echo -e "${GREEN}✓${NC} $1/"
        return 0
    else
        echo -e "${RED}✗${NC} $1/ (MISSING)"
        return 1
    fi
}

echo "Checking directory structure..."
check_dir "src"
check_dir "src/api"
check_dir "src/screens"
check_dir "src/types"
echo ""

echo "Checking source files..."
check_file "App.tsx"
check_file "app.json"
check_file "package.json"
check_file "src/api/client.ts"
check_file "src/api/aiNotes.ts"
check_file "src/types/index.ts"
check_file "src/screens/DemoLauncherScreen.tsx"
check_file "src/screens/AINoteTakingScreen.tsx"
check_file "src/screens/AINoteReviewScreen.tsx"
echo ""

echo "Checking documentation..."
check_file "README.md"
check_file "QUICKSTART.md"
echo ""

echo "Checking dependencies..."
if [ -d "node_modules" ]; then
    echo -e "${GREEN}✓${NC} node_modules/ (dependencies installed)"
else
    echo -e "${RED}✗${NC} node_modules/ (run: npm install)"
fi
echo ""

echo "Checking backend..."
backend_status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/health 2>/dev/null)
if [ "$backend_status" = "200" ]; then
    echo -e "${GREEN}✓${NC} Backend running on http://localhost:4000"
else
    echo -e "${RED}✗${NC} Backend not responding (start with: cd ../backend && npm run dev)"
fi
echo ""

echo "=================================="
echo "Summary"
echo "=================================="

total_files=12
existing_files=$(ls App.tsx app.json package.json src/api/client.ts src/api/aiNotes.ts src/types/index.ts src/screens/*.tsx README.md QUICKSTART.md 2>/dev/null | wc -l)

echo "Files: $existing_files/$total_files"

if [ "$existing_files" -eq "$total_files" ]; then
    echo -e "${GREEN}✓ All files present!${NC}"
    echo ""
    echo "Ready to run: npx expo start"
else
    echo -e "${RED}✗ Some files missing${NC}"
fi

echo "=================================="
