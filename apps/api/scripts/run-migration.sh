#!/bin/bash
# backend/apps/api/scripts/run-migration.sh

###############################################################################
# Phase 1 Migration Execution Script
#
# Purpose: Safely run the 001_add_tournaments.sql migration
#
# Features:
# - Checks prerequisites
# - Creates timestamped backup
# - Runs migration
# - Verifies success
# - Provides rollback instructions if needed
###############################################################################

set -e  # Exit on any error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DB_PATH="apps/api/dev.db"
MIGRATION_FILE="apps/api/migrations/001_add_tournaments.sql"
BACKUP_DIR="apps/api/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/dev.db.backup-${TIMESTAMP}"

# Ensure we're in the backend directory
if [ ! -f "package.json" ]; then
  echo -e "${RED}ERROR: Must be run from backend/ directory${NC}"
  echo "Current directory: $(pwd)"
  exit 1
fi

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Phase 1 Migration: Add Tournaments Table                 ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

###############################################################################
# STEP 1: Prerequisites Check
###############################################################################

echo -e "${YELLOW}[1/6] Checking prerequisites...${NC}"

# Check if SQLite is installed
if ! command -v sqlite3 &> /dev/null; then
  echo -e "${RED}ERROR: sqlite3 command not found${NC}"
  echo "Install SQLite: https://www.sqlite.org/download.html"
  exit 1
fi

# Check if database exists
if [ ! -f "$DB_PATH" ]; then
  echo -e "${RED}ERROR: Database not found at $DB_PATH${NC}"
  echo "Have you initialized the database?"
  exit 1
fi

# Check if migration file exists
if [ ! -f "$MIGRATION_FILE" ]; then
  echo -e "${RED}ERROR: Migration file not found at $MIGRATION_FILE${NC}"
  exit 1
fi

# Check if tournaments table already exists
TOURNAMENTS_EXISTS=$(sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='table' AND name='tournaments';" 2>/dev/null)
if [ -n "$TOURNAMENTS_EXISTS" ]; then
  echo -e "${YELLOW}WARNING: tournaments table already exists${NC}"
  read -p "Continue anyway? (y/N): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Migration cancelled"
    exit 0
  fi
fi

echo -e "${GREEN}✓ Prerequisites check passed${NC}"
echo ""

###############################################################################
# STEP 2: Create Backup
###############################################################################

echo -e "${YELLOW}[2/6] Creating database backup...${NC}"

# Create backups directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Copy database to backup location
cp "$DB_PATH" "$BACKUP_FILE"

# Verify backup was created
if [ ! -f "$BACKUP_FILE" ]; then
  echo -e "${RED}ERROR: Failed to create backup${NC}"
  exit 1
fi

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo -e "${GREEN}✓ Backup created: $BACKUP_FILE ($BACKUP_SIZE)${NC}"
echo ""

###############################################################################
# STEP 3: Show Current Database State
###############################################################################

echo -e "${YELLOW}[3/6] Current database state:${NC}"

DIVISION_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM divisions;" 2>/dev/null || echo "0")
TEAM_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM teams;" 2>/dev/null || echo "0")
POOL_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM pools;" 2>/dev/null || echo "0")

echo "  Divisions: $DIVISION_COUNT"
echo "  Teams: $TEAM_COUNT"
echo "  Pools: $POOL_COUNT"
echo ""

###############################################################################
# STEP 4: Run Migration
###############################################################################

echo -e "${YELLOW}[4/6] Running migration...${NC}"

# Run the migration file
if sqlite3 "$DB_PATH" < "$MIGRATION_FILE"; then
  echo -e "${GREEN}✓ Migration executed successfully${NC}"
else
  echo -e "${RED}✗ Migration failed!${NC}"
  echo ""
  echo "Rollback instructions:"
  echo "1. Restore from backup:"
  echo "   cp $BACKUP_FILE $DB_PATH"
  echo "2. Or run rollback script:"
  echo "   sqlite3 $DB_PATH < apps/api/migrations/001_rollback.sql"
  exit 1
fi

echo ""

###############################################################################
# STEP 5: Verify Migration
###############################################################################

echo -e "${YELLOW}[5/6] Verifying migration...${NC}"

# Check tournaments table exists
TOURNAMENTS_EXISTS=$(sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='table' AND name='tournaments';" 2>/dev/null)
if [ -z "$TOURNAMENTS_EXISTS" ]; then
  echo -e "${RED}✗ tournaments table not found${NC}"
  exit 1
fi
echo -e "${GREEN}✓ tournaments table exists${NC}"

# Check tournament_id column exists in divisions
TOURNAMENT_ID_EXISTS=$(sqlite3 "$DB_PATH" "PRAGMA table_info(divisions);" | grep "tournament_id")
if [ -z "$TOURNAMENT_ID_EXISTS" ]; then
  echo -e "${RED}✗ tournament_id column not found in divisions${NC}"
  exit 1
fi
echo -e "${GREEN}✓ tournament_id column exists in divisions${NC}"

# Check all divisions have tournament_id
NULL_TOURNAMENT_IDS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM divisions WHERE tournament_id IS NULL;" 2>/dev/null)
if [ "$NULL_TOURNAMENT_IDS" != "0" ]; then
  echo -e "${RED}✗ Found $NULL_TOURNAMENT_IDS divisions without tournament_id${NC}"
  exit 1
fi
echo -e "${GREEN}✓ All divisions have tournament_id${NC}"

# Check index exists
INDEX_EXISTS=$(sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_divisions_tournament_id';" 2>/dev/null)
if [ -z "$INDEX_EXISTS" ]; then
  echo -e "${RED}✗ Index idx_divisions_tournament_id not found${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Index idx_divisions_tournament_id exists${NC}"

echo ""

###############################################################################
# STEP 6: Display Summary
###############################################################################

echo -e "${YELLOW}[6/6] Migration summary:${NC}"

TOURNAMENT_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM tournaments;" 2>/dev/null)
DIVISIONS_WITH_TOURNAMENT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM divisions WHERE tournament_id IS NOT NULL;" 2>/dev/null)

echo ""
echo "╔════════════════════════════════════════╗"
echo "║         MIGRATION SUCCESSFUL ✓         ║"
echo "╚════════════════════════════════════════╝"
echo ""
echo "Summary:"
echo "  • Tournaments created: $TOURNAMENT_COUNT"
echo "  • Divisions migrated: $DIVISIONS_WITH_TOURNAMENT"
echo "  • Backup location: $BACKUP_FILE"
echo ""
echo -e "${GREEN}Next steps:${NC}"
echo "  1. Run verification script:"
echo "     ./apps/api/scripts/verify-migration.sh"
echo ""
echo "  2. Test the backend:"
echo "     pnpm run dev"
echo ""
echo "  3. Verify in SQLite CLI:"
echo "     sqlite3 $DB_PATH \"SELECT * FROM tournaments;\""
echo ""
echo "  4. Optional: Seed test data:"
echo "     pnpm tsx apps/api/scripts/seed-tournaments.ts"
echo ""
echo -e "${BLUE}Backup preserved at: $BACKUP_FILE${NC}"
echo ""
