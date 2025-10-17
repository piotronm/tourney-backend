/**
 * Database migration runner.
 * Run with: pnpm migrate
 */

import Database from 'better-sqlite3';
import { env } from '../../env.js';

const dbPath = env.DATABASE_URL.replace('file:', '');
const sqlite = new Database(dbPath);

console.log('🔄 Running database migrations...');
console.log(`📁 Database: ${dbPath}`);

// Enable foreign keys
sqlite.pragma('foreign_keys = ON');

// Create divisions table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS divisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

// Create teams table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    division_id INTEGER NOT NULL,
    pool_id INTEGER,
    name TEXT NOT NULL,
    pool_seed INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

// Add pool_seed and updated_at columns if they don't exist (migration for existing databases)
try {
  sqlite.exec(`ALTER TABLE teams ADD COLUMN pool_seed INTEGER;`);
  console.log('✅ Added pool_seed column to teams table');
} catch (e) {
  // Column already exists, ignore
}

try {
  sqlite.exec(`ALTER TABLE teams ADD COLUMN updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP;`);
  console.log('✅ Added updated_at column to teams table');
} catch (e) {
  // Column already exists, ignore
}

// Create trigger to auto-update updated_at
sqlite.exec(`
  CREATE TRIGGER IF NOT EXISTS teams_updated_at_trigger
  AFTER UPDATE ON teams
  FOR EACH ROW
  BEGIN
    UPDATE teams SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
  END;
`);

// Phase 6: Add team statistics columns
try {
  sqlite.exec(`ALTER TABLE teams ADD COLUMN wins INTEGER DEFAULT 0 NOT NULL;`);
  console.log('✅ Added wins column to teams table');
} catch (e) {
  // Column already exists, ignore
}

try {
  sqlite.exec(`ALTER TABLE teams ADD COLUMN losses INTEGER DEFAULT 0 NOT NULL;`);
  console.log('✅ Added losses column to teams table');
} catch (e) {
  // Column already exists, ignore
}

try {
  sqlite.exec(`ALTER TABLE teams ADD COLUMN points_for INTEGER DEFAULT 0 NOT NULL;`);
  console.log('✅ Added points_for column to teams table');
} catch (e) {
  // Column already exists, ignore
}

try {
  sqlite.exec(`ALTER TABLE teams ADD COLUMN points_against INTEGER DEFAULT 0 NOT NULL;`);
  console.log('✅ Added points_against column to teams table');
} catch (e) {
  // Column already exists, ignore
}

try {
  sqlite.exec(`ALTER TABLE teams ADD COLUMN matches_played INTEGER DEFAULT 0 NOT NULL;`);
  console.log('✅ Added matches_played column to teams table');
} catch (e) {
  // Column already exists, ignore
}

// Create pools table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS pools (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    division_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

// Create matches table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    division_id INTEGER NOT NULL,
    pool_id INTEGER NOT NULL,
    round_number INTEGER NOT NULL,
    match_number INTEGER NOT NULL,
    team_a_id INTEGER NOT NULL,
    team_b_id INTEGER,
    score_a INTEGER,
    score_b INTEGER,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'completed')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

// Phase 6: Add match score tracking columns
try {
  sqlite.exec(`ALTER TABLE matches ADD COLUMN score_json TEXT;`);
  console.log('✅ Added score_json column to matches table');
} catch (e) {
  // Column already exists, ignore
}

try {
  sqlite.exec(`ALTER TABLE matches ADD COLUMN winner_team_id INTEGER;`);
  console.log('✅ Added winner_team_id column to matches table');
} catch (e) {
  // Column already exists, ignore
}

try {
  sqlite.exec(`ALTER TABLE matches ADD COLUMN scheduled_at TEXT;`);
  console.log('✅ Added scheduled_at column to matches table');
} catch (e) {
  // Column already exists, ignore
}

try {
  sqlite.exec(`ALTER TABLE matches ADD COLUMN court_number INTEGER;`);
  console.log('✅ Added court_number column to matches table');
} catch (e) {
  // Column already exists, ignore
}

try {
  sqlite.exec(`ALTER TABLE matches ADD COLUMN slot_index INTEGER;`);
  console.log('✅ Added slot_index column to matches table');
} catch (e) {
  // Column already exists, ignore
}

try {
  sqlite.exec(`ALTER TABLE matches ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL;`);
  console.log('✅ Added updated_at column to matches table');
} catch (e) {
  // Column already exists, ignore
}

// Create trigger to auto-update matches updated_at
sqlite.exec(`
  CREATE TRIGGER IF NOT EXISTS matches_updated_at_trigger
  AFTER UPDATE ON matches
  FOR EACH ROW
  BEGIN
    UPDATE matches SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
  END;
`);

// Create players table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    division_id INTEGER NOT NULL,
    team_id INTEGER,
    name TEXT NOT NULL,
    dupr_rating REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

// Create court_assignments table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS court_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL,
    court_number INTEGER NOT NULL,
    time_slot INTEGER NOT NULL,
    estimated_start_minutes INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

// Create exports table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS exports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    division_id INTEGER NOT NULL,
    exported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    format TEXT NOT NULL DEFAULT 'csv' CHECK(format IN ('csv', 'tsv', 'excel')),
    row_count INTEGER NOT NULL
  );
`);

// Create indexes for better query performance
sqlite.exec(`
  CREATE INDEX IF NOT EXISTS idx_teams_division_id ON teams(division_id);
  CREATE INDEX IF NOT EXISTS idx_teams_pool_id ON teams(pool_id);
  CREATE INDEX IF NOT EXISTS idx_pools_division_id ON pools(division_id);
  CREATE INDEX IF NOT EXISTS idx_matches_division_id ON matches(division_id);
  CREATE INDEX IF NOT EXISTS idx_matches_pool_id ON matches(pool_id);
  CREATE INDEX IF NOT EXISTS idx_players_division_id ON players(division_id);
  CREATE INDEX IF NOT EXISTS idx_players_team_id ON players(team_id);
  CREATE INDEX IF NOT EXISTS idx_court_assignments_match_id ON court_assignments(match_id);
  CREATE INDEX IF NOT EXISTS idx_exports_division_id ON exports(division_id);
`);

// Public API performance indexes (added v0.4.0)
sqlite.exec(`
  CREATE INDEX IF NOT EXISTS idx_divisions_created_at ON divisions(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_matches_status_division_id ON matches(status, division_id);
  CREATE INDEX IF NOT EXISTS idx_matches_ordering ON matches(division_id, round_number, match_number);
`);

console.log('✅ Migrations completed successfully!');

sqlite.close();
