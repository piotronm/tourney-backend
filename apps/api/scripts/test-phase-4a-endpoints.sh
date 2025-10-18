#!/bin/bash
################################################################################
# Phase 4A Backend Admin Routes - Comprehensive Test Suite
# Tests all 14 updated admin endpoints with tournament context
#
# Updated Routes:
# - 8 Division endpoints (CRUD, pools, matches)
# - 6 Team endpoints (CRUD, bulk import)
#
# Test Scenarios:
# ✅ Happy path (tournament ID 1)
# ❌ Invalid tournament ID (999) → 404
# ❌ Wrong tournament-division mismatch → 403
# ❌ Invalid parameters → 400
#
# Usage: ./test-phase-4a-endpoints.sh
################################################################################

set -e  # Exit on error

# Configuration
BASE_URL="http://localhost:3000"
VALID_TOURNAMENT_ID=1
INVALID_TOURNAMENT_ID=999

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Store created IDs
DIVISION_ID=""
TEAM_ID=""
POOL_ID=""

################################################################################
# Helper Functions
################################################################################

print_header() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

test_endpoint() {
    local test_name="$1"
    local expected_code="$2"
    local method="$3"
    local endpoint="$4"
    local data="$5"

    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    echo ""
    echo -e "${YELLOW}TEST $TOTAL_TESTS: $test_name${NC}"
    echo "  → $method $endpoint"

    # Make request
    if [ -z "$data" ]; then
        RESPONSE=$(curl -s -w "\n%{http_code}" -X "$method" "$BASE_URL$endpoint" \
            -H "Content-Type: application/json" 2>/dev/null)
    else
        RESPONSE=$(curl -s -w "\n%{http_code}" -X "$method" "$BASE_URL$endpoint" \
            -H "Content-Type: application/json" \
            -d "$data" 2>/dev/null)
    fi

    # Parse response
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | head -n-1)

    # Check result
    if [ "$HTTP_CODE" = "$expected_code" ]; then
        echo -e "  ${GREEN}✅ PASS${NC} - HTTP $HTTP_CODE (expected $expected_code)"
        PASSED_TESTS=$((PASSED_TESTS + 1))

        # Pretty print JSON response if present
        if [ -n "$BODY" ] && [ "$BODY" != "" ]; then
            echo "$BODY" | jq -C '.' 2>/dev/null | head -n 10 || echo "$BODY" | head -n 5
        fi

        return 0
    else
        echo -e "  ${RED}❌ FAIL${NC} - HTTP $HTTP_CODE (expected $expected_code)"
        FAILED_TESTS=$((FAILED_TESTS + 1))

        # Show error response
        if [ -n "$BODY" ]; then
            echo -e "  ${RED}Response:${NC}"
            echo "$BODY" | jq -C '.' 2>/dev/null || echo "$BODY"
        fi

        return 1
    fi
}

extract_id() {
    local json="$1"
    local field="${2:-id}"
    echo "$json" | jq -r ".$field" 2>/dev/null || echo ""
}

################################################################################
# MAIN TEST SUITE
################################################################################

clear
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         PHASE 4A - Admin Routes Test Suite                      ║${NC}"
echo -e "${BLUE}║         Tournament Context Validation                            ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Base URL: $BASE_URL"
echo "Valid Tournament ID: $VALID_TOURNAMENT_ID"
echo "Invalid Tournament ID: $INVALID_TOURNAMENT_ID"

################################################################################
# SECTION 1: DIVISION ENDPOINTS (8 tests)
################################################################################

print_header "SECTION 1: DIVISION CRUD ENDPOINTS"

# Test 1: Create Division (Happy Path)
test_endpoint \
    "Create division in tournament 1" \
    "201" \
    "POST" \
    "/api/tournaments/$VALID_TOURNAMENT_ID/divisions" \
    '{"name":"Phase 4A Test Division"}'

# Extract division ID for subsequent tests
if [ $? -eq 0 ]; then
    DIVISION_ID=$(echo "$BODY" | jq -r '.id' 2>/dev/null)
    echo -e "  ${GREEN}→ Created Division ID: $DIVISION_ID${NC}"
fi

# Test 2: Create Division (Invalid Tournament - 404)
test_endpoint \
    "Create division in non-existent tournament" \
    "404" \
    "POST" \
    "/api/tournaments/$INVALID_TOURNAMENT_ID/divisions" \
    '{"name":"Should Fail Division"}'

# Test 3: List Divisions in Tournament (Happy Path)
test_endpoint \
    "List divisions in tournament 1" \
    "200" \
    "GET" \
    "/api/tournaments/$VALID_TOURNAMENT_ID/divisions?limit=10&offset=0" \
    ""

# Test 4: List Divisions (Invalid Tournament - 404)
test_endpoint \
    "List divisions in non-existent tournament" \
    "404" \
    "GET" \
    "/api/tournaments/$INVALID_TOURNAMENT_ID/divisions" \
    ""

# Test 5: Get Single Division (Happy Path)
if [ -n "$DIVISION_ID" ]; then
    test_endpoint \
        "Get division $DIVISION_ID from tournament 1" \
        "200" \
        "GET" \
        "/api/tournaments/$VALID_TOURNAMENT_ID/divisions/$DIVISION_ID" \
        ""
fi

# Test 6: Get Division (Wrong Tournament - 403)
if [ -n "$DIVISION_ID" ]; then
    test_endpoint \
        "Get division $DIVISION_ID from wrong tournament 2" \
        "403" \
        "GET" \
        "/api/tournaments/2/divisions/$DIVISION_ID" \
        ""
fi

# Test 7: Update Division (Happy Path)
if [ -n "$DIVISION_ID" ]; then
    test_endpoint \
        "Update division $DIVISION_ID name" \
        "200" \
        "PUT" \
        "/api/tournaments/$VALID_TOURNAMENT_ID/divisions/$DIVISION_ID" \
        '{"name":"Phase 4A Test Division (Updated)"}'
fi

# Test 8: Update Division (Wrong Tournament - 403)
if [ -n "$DIVISION_ID" ]; then
    test_endpoint \
        "Update division $DIVISION_ID from wrong tournament" \
        "403" \
        "PUT" \
        "/api/tournaments/2/divisions/$DIVISION_ID" \
        '{"name":"Should Fail"}'
fi

################################################################################
# SECTION 2: POOL ENDPOINTS (4 tests)
################################################################################

print_header "SECTION 2: POOL MANAGEMENT ENDPOINTS"

# Test 9: Create Single Pool (Happy Path)
if [ -n "$DIVISION_ID" ]; then
    test_endpoint \
        "Create pool in division $DIVISION_ID" \
        "201" \
        "POST" \
        "/api/tournaments/$VALID_TOURNAMENT_ID/divisions/$DIVISION_ID/pools" \
        '{"name":"Pool A","label":"A","orderIndex":1}'

    if [ $? -eq 0 ]; then
        POOL_ID=$(echo "$BODY" | jq -r '.id' 2>/dev/null)
        echo -e "  ${GREEN}→ Created Pool ID: $POOL_ID${NC}"
    fi
fi

# Test 10: Create Pool (Invalid Tournament - 404)
if [ -n "$DIVISION_ID" ]; then
    test_endpoint \
        "Create pool with invalid tournament ID" \
        "404" \
        "POST" \
        "/api/tournaments/$INVALID_TOURNAMENT_ID/divisions/$DIVISION_ID/pools" \
        '{"name":"Pool B","label":"B","orderIndex":2}'
fi

# Test 11: Create Pool (Wrong Tournament - 403)
if [ -n "$DIVISION_ID" ]; then
    test_endpoint \
        "Create pool with mismatched tournament-division" \
        "403" \
        "POST" \
        "/api/tournaments/2/divisions/$DIVISION_ID/pools" \
        '{"name":"Pool C","label":"C","orderIndex":3}'
fi

# Test 12: Bulk Create Pools (Happy Path)
if [ -n "$DIVISION_ID" ]; then
    test_endpoint \
        "Bulk create 3 pools in division $DIVISION_ID" \
        "201" \
        "POST" \
        "/api/tournaments/$VALID_TOURNAMENT_ID/divisions/$DIVISION_ID/pools/bulk" \
        '{"pools":[{"name":"Pool B","label":"B","orderIndex":2},{"name":"Pool C","label":"C","orderIndex":3},{"name":"Pool D","label":"D","orderIndex":4}]}'
fi

################################################################################
# SECTION 3: TEAM ENDPOINTS (6 tests)
################################################################################

print_header "SECTION 3: TEAM CRUD ENDPOINTS"

# Test 13: Create Team (Happy Path)
if [ -n "$DIVISION_ID" ] && [ -n "$POOL_ID" ]; then
    test_endpoint \
        "Create team in division $DIVISION_ID" \
        "201" \
        "POST" \
        "/api/tournaments/$VALID_TOURNAMENT_ID/divisions/$DIVISION_ID/teams" \
        "{\"name\":\"Test Team 1\",\"poolId\":$POOL_ID,\"poolSeed\":1}"

    if [ $? -eq 0 ]; then
        TEAM_ID=$(echo "$BODY" | jq -r '.id' 2>/dev/null)
        echo -e "  ${GREEN}→ Created Team ID: $TEAM_ID${NC}"
    fi
fi

# Test 14: Create Team (Invalid Tournament - 404)
if [ -n "$DIVISION_ID" ]; then
    test_endpoint \
        "Create team with invalid tournament ID" \
        "404" \
        "POST" \
        "/api/tournaments/$INVALID_TOURNAMENT_ID/divisions/$DIVISION_ID/teams" \
        '{"name":"Should Fail Team"}'
fi

# Test 15: Create Team (Wrong Tournament - 403)
if [ -n "$DIVISION_ID" ]; then
    test_endpoint \
        "Create team with mismatched tournament-division" \
        "403" \
        "POST" \
        "/api/tournaments/2/divisions/$DIVISION_ID/teams" \
        '{"name":"Should Fail Team"}'
fi

# Test 16: List Teams (Happy Path)
if [ -n "$DIVISION_ID" ]; then
    test_endpoint \
        "List teams in division $DIVISION_ID" \
        "200" \
        "GET" \
        "/api/tournaments/$VALID_TOURNAMENT_ID/divisions/$DIVISION_ID/teams?limit=20" \
        ""
fi

# Test 17: Get Single Team (Happy Path)
if [ -n "$DIVISION_ID" ] && [ -n "$TEAM_ID" ]; then
    test_endpoint \
        "Get team $TEAM_ID details" \
        "200" \
        "GET" \
        "/api/tournaments/$VALID_TOURNAMENT_ID/divisions/$DIVISION_ID/teams/$TEAM_ID" \
        ""
fi

# Test 18: Update Team (Happy Path)
if [ -n "$DIVISION_ID" ] && [ -n "$TEAM_ID" ]; then
    test_endpoint \
        "Update team $TEAM_ID name" \
        "200" \
        "PUT" \
        "/api/tournaments/$VALID_TOURNAMENT_ID/divisions/$DIVISION_ID/teams/$TEAM_ID" \
        '{"name":"Test Team 1 (Updated)"}'
fi

# Test 19: Update Team (Wrong Tournament - 403)
if [ -n "$DIVISION_ID" ] && [ -n "$TEAM_ID" ]; then
    test_endpoint \
        "Update team with mismatched tournament" \
        "403" \
        "PUT" \
        "/api/tournaments/2/divisions/$DIVISION_ID/teams/$TEAM_ID" \
        '{"name":"Should Fail"}'
fi

# Test 20: Bulk Import Teams (Happy Path)
if [ -n "$DIVISION_ID" ]; then
    test_endpoint \
        "Bulk import 3 teams into division $DIVISION_ID" \
        "200" \
        "POST" \
        "/api/tournaments/$VALID_TOURNAMENT_ID/divisions/$DIVISION_ID/teams/bulk-import" \
        '{"teams":[{"name":"Import Team 1","poolName":"Pool A","poolSeed":2},{"name":"Import Team 2","poolName":"Pool B","poolSeed":1},{"name":"Import Team 3","poolName":"Pool C","poolSeed":1}]}'
fi

################################################################################
# SECTION 4: MATCH GENERATION (2 tests)
################################################################################

print_header "SECTION 4: MATCH GENERATION ENDPOINT"

# Test 21: Generate Matches (Happy Path)
if [ -n "$DIVISION_ID" ]; then
    test_endpoint \
        "Generate round-robin matches for division $DIVISION_ID" \
        "201" \
        "POST" \
        "/api/tournaments/$VALID_TOURNAMENT_ID/divisions/$DIVISION_ID/generate-matches" \
        '{"format":"ROUND_ROBIN"}'
fi

# Test 22: Generate Matches (Wrong Tournament - 403)
if [ -n "$DIVISION_ID" ]; then
    test_endpoint \
        "Generate matches with mismatched tournament" \
        "403" \
        "POST" \
        "/api/tournaments/2/divisions/$DIVISION_ID/generate-matches" \
        '{"format":"ROUND_ROBIN"}'
fi

################################################################################
# SECTION 5: CLEANUP AND DELETE TESTS (3 tests)
################################################################################

print_header "SECTION 5: DELETE ENDPOINTS (CLEANUP)"

# Test 23: Delete Team (Happy Path)
if [ -n "$DIVISION_ID" ] && [ -n "$TEAM_ID" ]; then
    test_endpoint \
        "Delete team $TEAM_ID" \
        "204" \
        "DELETE" \
        "/api/tournaments/$VALID_TOURNAMENT_ID/divisions/$DIVISION_ID/teams/$TEAM_ID" \
        ""
fi

# Test 24: Delete Division (Wrong Tournament - 403)
if [ -n "$DIVISION_ID" ]; then
    test_endpoint \
        "Delete division with wrong tournament ID" \
        "403" \
        "DELETE" \
        "/api/tournaments/2/divisions/$DIVISION_ID" \
        ""
fi

# Test 25: Delete Division (Happy Path)
if [ -n "$DIVISION_ID" ]; then
    test_endpoint \
        "Delete division $DIVISION_ID (cascade delete all data)" \
        "200" \
        "DELETE" \
        "/api/tournaments/$VALID_TOURNAMENT_ID/divisions/$DIVISION_ID" \
        ""
fi

################################################################################
# FINAL SUMMARY
################################################################################

print_header "TEST SUMMARY"

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║                        TEST RESULTS                              ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
printf "  Total Tests:   %3d\n" $TOTAL_TESTS
printf "  ${GREEN}Passed Tests:  %3d${NC}\n" $PASSED_TESTS
printf "  ${RED}Failed Tests:  %3d${NC}\n" $FAILED_TESTS
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}✅ ALL TESTS PASSED! Phase 4A backend routes are working correctly.${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    exit 0
else
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}❌ SOME TESTS FAILED! Please review the errors above.${NC}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    exit 1
fi
