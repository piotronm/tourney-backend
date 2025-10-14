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
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

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
