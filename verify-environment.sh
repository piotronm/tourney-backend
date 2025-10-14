#!/bin/bash

echo "========================================="
echo "Tournament Backend Environment Verification"
echo "========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Node.js
echo "Checking Node.js..."
NODE_VERSION=$(node --version)
if [[ $NODE_VERSION == v20* ]]; then
    echo -e "${GREEN}✓${NC} Node.js: $NODE_VERSION"
else
    echo -e "${RED}✗${NC} Node.js: $NODE_VERSION (Expected v20.x.x)"
fi

# Check pnpm
echo "Checking pnpm..."
PNPM_VERSION=$(pnpm --version)
if [[ $PNPM_VERSION =~ ^(8|9|10) ]]; then
    echo -e "${GREEN}✓${NC} pnpm: $PNPM_VERSION"
else
    echo -e "${YELLOW}⚠${NC} pnpm: $PNPM_VERSION (Expected v8+)"
fi

# Check better-sqlite3
echo "Checking better-sqlite3 compilation..."
if find node_modules -name "better_sqlite3.node" -type f 2>/dev/null | grep -q .; then
    echo -e "${GREEN}✓${NC} better-sqlite3 compiled for Linux"
else
    echo -e "${RED}✗${NC} better-sqlite3 not compiled correctly"
fi

# Build
echo ""
echo "Building project..."
pnpm --filter tournament-engine build > /dev/null 2>&1 && pnpm --filter api build > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Build successful"
else
    echo -e "${RED}✗${NC} Build failed"
fi

# Unit tests
echo ""
echo "Running unit tests..."
cd packages/tournament-engine
TEST_OUTPUT=$(pnpm test 2>&1)
TEST_RESULT=$?
cd ../..
if [ $TEST_RESULT -eq 0 ]; then
    TEST_COUNT=$(echo "$TEST_OUTPUT" | grep -o '[0-9]* passed' | head -1)
    echo -e "${GREEN}✓${NC} Unit tests: $TEST_COUNT"
else
    echo -e "${RED}✗${NC} Unit tests failed"
fi

# E2E tests
echo ""
echo "Running E2E tests..."
cd apps/api
E2E_OUTPUT=$(pnpm test 2>&1)
E2E_RESULT=$?
PASSED=$(echo "$E2E_OUTPUT" | grep -o '[0-9]* passed' | head -1)
FAILED=$(echo "$E2E_OUTPUT" | grep -o '[0-9]* failed' | head -1)
cd ../..
if [ $E2E_RESULT -eq 0 ]; then
    echo -e "${GREEN}✓${NC} E2E tests: $PASSED"
else
    echo -e "${YELLOW}⚠${NC} E2E tests: $PASSED, $FAILED"
fi

echo ""
echo "========================================="
echo "Verification complete!"
echo "========================================="
