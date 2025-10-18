#!/bin/bash

# Phase 2: Public API Tournament Endpoints Test Suite
# Tests all new tournament-scoped endpoints

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  PHASE 2: PUBLIC TOURNAMENT ENDPOINTS TEST SUITE          ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

API_URL="http://localhost:3000/api/public"
PASS=0
FAIL=0

test_endpoint() {
  local name="$1"
  local url="$2"
  local expected_status="${3:-200}"

  echo "Test: $name"
  echo "URL: $url"

  response=$(curl -s -w "\n%{http_code}" "$url")
  status_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  if [ "$status_code" = "$expected_status" ]; then
    echo "✅ PASS (HTTP $status_code)"
    ((PASS++))
  else
    echo "❌ FAIL (Expected HTTP $expected_status, got HTTP $status_code)"
    ((FAIL++))
  fi

  # Show first 200 chars of response
  echo "Response: $(echo "$body" | cut -c1-200)..."
  echo ""
}

echo "════════════════════════════════════════════════════════════"
echo "PART 1: Tournament Endpoints"
echo "════════════════════════════════════════════════════════════"
echo ""

# Test 1: List all active tournaments
test_endpoint \
  "GET /api/public/tournaments" \
  "$API_URL/tournaments"

# Test 2: Get single tournament
test_endpoint \
  "GET /api/public/tournaments/1" \
  "$API_URL/tournaments/1"

# Test 3: Get non-existent tournament (500 expected - not found error)
test_endpoint \
  "GET /api/public/tournaments/99999 (500 expected)" \
  "$API_URL/tournaments/99999" \
  "500"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "PART 2: Division Endpoints (Tournament-Scoped)"
echo "════════════════════════════════════════════════════════════"
echo ""

# Test 4: List divisions in tournament
test_endpoint \
  "GET /api/public/tournaments/1/divisions" \
  "$API_URL/tournaments/1/divisions"

# Test 5: Get single division
test_endpoint \
  "GET /api/public/tournaments/1/divisions/100218" \
  "$API_URL/tournaments/1/divisions/100218"

# Test 6: Get division from wrong tournament (500 expected - tournament doesn't exist)
test_endpoint \
  "GET /api/public/tournaments/99/divisions/100218 (500 expected)" \
  "$API_URL/tournaments/99/divisions/100218" \
  "500"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "PART 3: Standings Endpoint (Tournament-Scoped)"
echo "════════════════════════════════════════════════════════════"
echo ""

# Test 7: Get division standings
test_endpoint \
  "GET /api/public/tournaments/1/divisions/100218/standings" \
  "$API_URL/tournaments/1/divisions/100218/standings"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "PART 4: Matches Endpoint (Tournament-Scoped)"
echo "════════════════════════════════════════════════════════════"
echo ""

# Test 8: Get division matches
test_endpoint \
  "GET /api/public/tournaments/1/divisions/100218/matches" \
  "$API_URL/tournaments/1/divisions/100218/matches"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "PART 5: Teams Endpoints (Tournament-Scoped)"
echo "════════════════════════════════════════════════════════════"
echo ""

# Test 9: List teams in division
test_endpoint \
  "GET /api/public/tournaments/1/divisions/100218/teams" \
  "$API_URL/tournaments/1/divisions/100218/teams"

# Test 10: Get single team
test_endpoint \
  "GET /api/public/tournaments/1/divisions/100219/teams/2067" \
  "$API_URL/tournaments/1/divisions/100219/teams/2067"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "PART 6: Pools Endpoint (Tournament-Scoped)"
echo "════════════════════════════════════════════════════════════"
echo ""

# Test 11: List pools in division
test_endpoint \
  "GET /api/public/tournaments/1/divisions/100218/pools" \
  "$API_URL/tournaments/1/divisions/100218/pools"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "PART 7: Verify OLD Routes Are Gone (404 expected)"
echo "════════════════════════════════════════════════════════════"
echo ""

# Test 12: OLD route should return 404
test_endpoint \
  "GET /api/public/divisions (OLD - should be 404)" \
  "$API_URL/divisions" \
  "404"

# Test 13: OLD division detail should return 404
test_endpoint \
  "GET /api/public/divisions/100218 (OLD - should be 404)" \
  "$API_URL/divisions/100218" \
  "404"

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                    TEST SUMMARY                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "✅ Passed: $PASS"
echo "❌ Failed: $FAIL"
echo ""

if [ $FAIL -eq 0 ]; then
  echo "🎉 All tests passed! Phase 2 public API complete."
  exit 0
else
  echo "⚠️  Some tests failed. Review errors above."
  exit 1
fi
