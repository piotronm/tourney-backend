-- backend/apps/api/migrations/001_add_tournaments.sql

/**
 * Migration: Add Tournaments Table and Update Divisions
 *
 * Purpose: Restructure database hierarchy to add "Tournaments" as top-level entity
 *
 * Changes:
 * 1. Create new `tournaments` table
 * 2. Add `tournament_id` foreign key to `divisions` table
 * 3. Create default tournament and migrate existing divisions to it
 * 4. Add performance index on divisions.tournament_id
 *
 * Database: SQLite
 * Safe to run: YES (no production data)
 * Reversible: YES (see 001_rollback.sql)
 */

-- ============================================
-- STEP 1: Create tournaments table
-- ============================================

CREATE TABLE IF NOT EXISTS tournaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  start_date TEXT,        -- ISO 8601 format (YYYY-MM-DD or full timestamp)
  end_date TEXT,          -- ISO 8601 format
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'active', 'completed', 'archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Verify tournaments table was created
SELECT 'Step 1: tournaments table created' AS status, COUNT(*) as table_count
FROM sqlite_master
WHERE type='table' AND name='tournaments';

-- ============================================
-- STEP 2: Add tournament_id to divisions (nullable first)
-- ============================================

-- SQLite doesn't support ALTER COLUMN, so we add it as nullable initially
-- We'll recreate the table later to make it NOT NULL
ALTER TABLE divisions ADD COLUMN tournament_id INTEGER;

-- Verify column was added
PRAGMA table_info(divisions);

-- ============================================
-- STEP 3: Create default tournament for migration
-- ============================================

INSERT INTO tournaments (name, status, description, created_at, updated_at)
VALUES (
  'Default Tournament',
  'active',
  'Automatically created during migration from legacy divisions structure',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

-- Verify default tournament was created
SELECT 'Step 3: Default tournament created' AS status,
       id, name, status
FROM tournaments
WHERE name = 'Default Tournament';

-- ============================================
-- STEP 4: Assign all existing divisions to default tournament
-- ============================================

-- Get the ID of the default tournament and assign it to all divisions
UPDATE divisions
SET tournament_id = (
  SELECT id FROM tournaments WHERE name = 'Default Tournament' LIMIT 1
);

-- Verify all divisions now have tournament_id
SELECT 'Step 4: Divisions updated' AS status,
       COUNT(*) as total_divisions,
       COUNT(tournament_id) as divisions_with_tournament_id,
       COUNT(*) - COUNT(tournament_id) as divisions_without_tournament_id
FROM divisions;

-- ============================================
-- STEP 5: Recreate divisions table with NOT NULL constraint
-- ============================================

/**
 * SQLite Limitation Workaround:
 *
 * SQLite doesn't support "ALTER COLUMN ... SET NOT NULL"
 * Solution: Create new table with correct schema, copy data, rename
 *
 * This is the standard SQLite pattern for schema modifications
 * Safe because we've already populated tournament_id in all rows
 */

-- Create new divisions table with NOT NULL constraint
CREATE TABLE divisions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Copy all data from old table to new table
INSERT INTO divisions_new (id, tournament_id, name, created_at)
SELECT id, tournament_id, name, created_at
FROM divisions;

-- Verify data was copied correctly
SELECT 'Step 5a: Data copied to new table' AS status,
       (SELECT COUNT(*) FROM divisions) as old_count,
       (SELECT COUNT(*) FROM divisions_new) as new_count,
       CASE
         WHEN (SELECT COUNT(*) FROM divisions) = (SELECT COUNT(*) FROM divisions_new)
         THEN 'MATCH ✓'
         ELSE 'MISMATCH ✗'
       END as verification;

-- Drop old table
DROP TABLE divisions;

-- Rename new table to original name
ALTER TABLE divisions_new RENAME TO divisions;

-- Verify final table structure
PRAGMA table_info(divisions);

-- ============================================
-- STEP 6: Create performance index
-- ============================================

/**
 * Index Purpose:
 * - Speeds up queries filtering by tournament_id
 * - Essential for: GET /tournaments/:id/divisions
 * - Also helps with JOIN operations
 */

CREATE INDEX IF NOT EXISTS idx_divisions_tournament_id
ON divisions(tournament_id);

-- Verify index was created
SELECT 'Step 6: Index created' AS status,
       name, tbl_name, sql
FROM sqlite_master
WHERE type='index' AND name='idx_divisions_tournament_id';

-- ============================================
-- STEP 7: Final Verification Queries
-- ============================================

-- Summary report
SELECT '=== MIGRATION COMPLETE ===' AS status;

SELECT 'Tournaments' AS entity, COUNT(*) AS count FROM tournaments
UNION ALL
SELECT 'Divisions', COUNT(*) FROM divisions
UNION ALL
SELECT 'Divisions with tournament_id', COUNT(*) FROM divisions WHERE tournament_id IS NOT NULL
UNION ALL
SELECT 'Divisions without tournament_id', COUNT(*) FROM divisions WHERE tournament_id IS NULL;

-- Detailed check: All divisions must have tournament_id
SELECT
  CASE
    WHEN COUNT(*) = 0 THEN 'SUCCESS: All divisions have tournament_id ✓'
    ELSE 'ERROR: ' || COUNT(*) || ' divisions missing tournament_id ✗'
  END AS validation_result
FROM divisions
WHERE tournament_id IS NULL;

-- Show tournament-division relationships
SELECT
  t.id AS tournament_id,
  t.name AS tournament_name,
  t.status,
  COUNT(d.id) AS division_count
FROM tournaments t
LEFT JOIN divisions d ON d.tournament_id = t.id
GROUP BY t.id, t.name, t.status;

-- Final safety check: Verify schema integrity
SELECT
  CASE
    WHEN EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='tournaments')
      AND EXISTS (SELECT 1 FROM pragma_table_info('divisions') WHERE name='tournament_id')
      AND EXISTS (SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_divisions_tournament_id')
    THEN 'MIGRATION SUCCESSFUL ✓✓✓'
    ELSE 'MIGRATION INCOMPLETE - CHECK ERRORS ABOVE ✗✗✗'
  END AS final_status;
