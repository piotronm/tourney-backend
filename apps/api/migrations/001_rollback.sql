-- backend/apps/api/migrations/001_rollback.sql

/**
 * ROLLBACK for Migration 001: Add Tournaments
 *
 * WARNING: This will DELETE all tournaments data!
 *
 * When to use:
 * - Migration failed partway through
 * - Need to re-run migration from scratch
 * - Discovered a critical issue after migration
 *
 * How to use:
 *   sqlite3 apps/api/dev.db < apps/api/migrations/001_rollback.sql
 *
 * IMPORTANT:
 * - This does NOT restore your data
 * - Consider restoring from backup instead if you need to preserve data
 * - Backup location: apps/api/backups/dev.db.backup-<timestamp>
 */

-- ============================================
-- STEP 1: Drop index
-- ============================================

DROP INDEX IF EXISTS idx_divisions_tournament_id;

SELECT 'Step 1: Dropped index idx_divisions_tournament_id' AS status;

-- ============================================
-- STEP 2: Remove tournament_id from divisions
-- ============================================

/**
 * SQLite doesn't support DROP COLUMN directly
 * Solution: Recreate table without the column
 */

-- Create new divisions table without tournament_id
CREATE TABLE divisions_rollback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Copy data (excluding tournament_id)
INSERT INTO divisions_rollback (id, name, created_at)
SELECT id, name, created_at
FROM divisions;

-- Verify counts match
SELECT 'Step 2a: Data verification' AS status,
       (SELECT COUNT(*) FROM divisions) as old_count,
       (SELECT COUNT(*) FROM divisions_rollback) as new_count;

-- Drop old table
DROP TABLE divisions;

-- Rename new table
ALTER TABLE divisions_rollback RENAME TO divisions;

SELECT 'Step 2: Removed tournament_id from divisions' AS status;

-- ============================================
-- STEP 3: Drop tournaments table
-- ============================================

DROP TABLE IF EXISTS tournaments;

SELECT 'Step 3: Dropped tournaments table' AS status;

-- ============================================
-- VERIFICATION
-- ============================================

-- Verify rollback completed
SELECT
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='tournaments')
      AND NOT EXISTS (SELECT 1 FROM pragma_table_info('divisions') WHERE name='tournament_id')
      AND NOT EXISTS (SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_divisions_tournament_id')
    THEN 'ROLLBACK SUCCESSFUL ✓'
    ELSE 'ROLLBACK INCOMPLETE - CHECK ABOVE ✗'
  END AS rollback_status;

-- Show final table structure
PRAGMA table_info(divisions);

SELECT '=== ROLLBACK COMPLETE ===' AS status;
SELECT 'Database has been restored to pre-migration state' AS message;
SELECT 'You can now re-run the migration if needed' AS next_step;
