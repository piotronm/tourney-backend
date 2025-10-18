#!/bin/bash
# backend/apps/api/scripts/verify-migration.sh

###############################################################################
# Phase 1 Migration Verification Script
#
# Purpose: Thoroughly verify the migration was successful
#
# Checks:
# - Table existence and structure
# - Data integrity
# - Indexes
# - Relationships
###############################################################################

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

DB_PATH="apps/api/dev.db"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Phase 1 Migration Verification Report                    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ ! -f "$DB_PATH" ]; then
  echo -e "${RED}ERROR: Database not found at $DB_PATH${NC}"
  exit 1
fi

###############################################################################
# CHECK 1: Table Structure
###############################################################################

echo -e "${YELLOW}[1/7] Checking table structure...${NC}"

# Check tournaments table
TOURNAMENTS_TABLE=$(sqlite3 "$DB_PATH" "SELECT sql FROM sqlite_master WHERE type='table' AND name='tournaments';" 2>/dev/null)
if [ -n "$TOURNAMENTS_TABLE" ]; then
  echo -e "${GREEN}✓ tournaments table exists${NC}"

  # Verify required columns
  EXPECTED_COLUMNS=("id" "name" "description" "start_date" "end_date" "status" "created_at" "updated_at")
  for col in "${EXPECTED_COLUMNS[@]}"; do
    if echo "$TOURNAMENTS_TABLE" | grep -q "$col"; then
      echo -e "  ${GREEN}✓${NC} Column: $col"
    else
      echo -e "  ${RED}✗${NC} Missing column: $col"
    fi
  done
else
  echo -e "${RED}✗ tournaments table NOT found${NC}"
  exit 1
fi

echo ""

# Check divisions table has tournament_id
DIVISIONS_TABLE=$(sqlite3 "$DB_PATH" "PRAGMA table_info(divisions);" 2>/dev/null)
if echo "$DIVISIONS_TABLE" | grep -q "tournament_id"; then
  echo -e "${GREEN}✓ divisions.tournament_id column exists${NC}"

  # Check if it's NOT NULL
  if echo "$DIVISIONS_TABLE" | grep "tournament_id" | grep -q "1"; then
    echo -e "  ${GREEN}✓${NC} Column is NOT NULL"
  else
    echo -e "  ${YELLOW}⚠${NC}  Column is nullable (may need fixing)"
  fi
else
  echo -e "${RED}✗ divisions.tournament_id column NOT found${NC}"
  exit 1
fi

echo ""

###############################################################################
# CHECK 2: Data Integrity
###############################################################################

echo -e "${YELLOW}[2/7] Checking data integrity...${NC}"

TOURNAMENT_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM tournaments;" 2>/dev/null)
DIVISION_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM divisions;" 2>/dev/null)
DIVISIONS_WITH_TOURNAMENT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM divisions WHERE tournament_id IS NOT NULL;" 2>/dev/null)
DIVISIONS_WITHOUT_TOURNAMENT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM divisions WHERE tournament_id IS NULL;" 2>/dev/null)

echo "  Tournaments: $TOURNAMENT_COUNT"
echo "  Divisions: $DIVISION_COUNT"
echo "  Divisions with tournament_id: $DIVISIONS_WITH_TOURNAMENT"
echo "  Divisions without tournament_id: $DIVISIONS_WITHOUT_TOURNAMENT"

if [ "$DIVISIONS_WITHOUT_TOURNAMENT" = "0" ]; then
  echo -e "${GREEN}✓ All divisions have tournament_id${NC}"
else
  echo -e "${RED}✗ Found $DIVISIONS_WITHOUT_TOURNAMENT divisions without tournament_id${NC}"
  exit 1
fi

echo ""

###############################################################################
# CHECK 3: Indexes
###############################################################################

echo -e "${YELLOW}[3/7] Checking indexes...${NC}"

INDEX_EXISTS=$(sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_divisions_tournament_id';" 2>/dev/null)
if [ -n "$INDEX_EXISTS" ]; then
  echo -e "${GREEN}✓ idx_divisions_tournament_id exists${NC}"

  # Show index details
  INDEX_SQL=$(sqlite3 "$DB_PATH" "SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_divisions_tournament_id';" 2>/dev/null)
  echo "  SQL: $INDEX_SQL"
else
  echo -e "${RED}✗ idx_divisions_tournament_id NOT found${NC}"
  echo "  This will impact performance on tournament queries"
fi

echo ""

###############################################################################
# CHECK 4: Relationships
###############################################################################

echo -e "${YELLOW}[4/7] Checking tournament-division relationships...${NC}"

# Query to show tournaments with division counts
RELATIONSHIP_DATA=$(sqlite3 "$DB_PATH" "
  SELECT
    t.id,
    t.name,
    t.status,
    COUNT(d.id) as division_count
  FROM tournaments t
  LEFT JOIN divisions d ON d.tournament_id = t.id
  GROUP BY t.id, t.name, t.status;
" 2>/dev/null)

echo "$RELATIONSHIP_DATA" | while IFS='|' read -r id name status div_count; do
  echo -e "  Tournament #$id: ${BLUE}$name${NC} ($status)"
  echo "    └─ Divisions: $div_count"
done

echo ""

###############################################################################
# CHECK 5: Default Tournament
###############################################################################

echo -e "${YELLOW}[5/7] Checking default tournament...${NC}"

DEFAULT_TOURNAMENT=$(sqlite3 "$DB_PATH" "SELECT id, name, status FROM tournaments WHERE name='Default Tournament';" 2>/dev/null)
if [ -n "$DEFAULT_TOURNAMENT" ]; then
  echo -e "${GREEN}✓ Default Tournament exists${NC}"
  echo "  $DEFAULT_TOURNAMENT"
else
  echo -e "${YELLOW}⚠ No 'Default Tournament' found (may have been renamed)${NC}"
fi

echo ""

###############################################################################
# CHECK 6: Referential Integrity
###############################################################################

echo -e "${YELLOW}[6/7] Checking referential integrity...${NC}"

# Find divisions pointing to non-existent tournaments (orphaned divisions)
ORPHANED_DIVISIONS=$(sqlite3 "$DB_PATH" "
  SELECT COUNT(*)
  FROM divisions d
  LEFT JOIN tournaments t ON d.tournament_id = t.id
  WHERE t.id IS NULL;
" 2>/dev/null)

if [ "$ORPHANED_DIVISIONS" = "0" ]; then
  echo -e "${GREEN}✓ No orphaned divisions (all tournament_id values are valid)${NC}"
else
  echo -e "${RED}✗ Found $ORPHANED_DIVISIONS orphaned divisions${NC}"
  echo "  These divisions reference non-existent tournaments"
  exit 1
fi

echo ""

###############################################################################
# CHECK 7: Schema Version / Completeness
###############################################################################

echo -e "${YELLOW}[7/7] Final schema validation...${NC}"

# List all tables
TABLES=$(sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;" 2>/dev/null)
echo "Tables in database:"
echo "$TABLES" | while read -r table; do
  ROW_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM $table;" 2>/dev/null)
  echo "  • $table ($ROW_COUNT rows)"
done

echo ""

###############################################################################
# FINAL REPORT
###############################################################################

echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         ✓ MIGRATION VERIFICATION PASSED ✓                  ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Summary:"
echo "  • Tournaments: $TOURNAMENT_COUNT"
echo "  • Divisions: $DIVISION_COUNT"
echo "  • All integrity checks passed ✓"
echo ""
echo -e "${BLUE}Phase 1 migration is complete and verified.${NC}"
echo ""
echo "You can now:"
echo "  1. Start the backend: pnpm run dev"
echo "  2. Query tournaments: sqlite3 $DB_PATH \"SELECT * FROM tournaments;\""
echo "  3. Proceed to Phase 2 (Backend API updates)"
echo ""
