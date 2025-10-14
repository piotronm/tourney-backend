/**
 * Test setup and teardown utilities.
 */

import { beforeAll, afterEach } from 'vitest';
import { db } from '../lib/db/drizzle.js';
import { teams, pools, matches, exports, players, divisions, court_assignments } from '../lib/db/schema.js';
import Database from 'better-sqlite3';
import { env } from '../env.js';

/**
 * Initialize test database with schema before all tests.
 */
beforeAll(() => {
  const dbPath = env.DATABASE_URL.replace('file:', '');
  const sqlite = new Database(dbPath);

  // Enable foreign keys
  sqlite.pragma('foreign_keys = ON');

  // Create all tables
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS divisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      division_id INTEGER NOT NULL,
      pool_id INTEGER,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS pools (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      division_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

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

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS exports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      division_id INTEGER NOT NULL,
      exported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      format TEXT NOT NULL DEFAULT 'csv' CHECK(format IN ('csv', 'tsv', 'excel')),
      row_count INTEGER NOT NULL
    );
  `);

  sqlite.close();
});

/**
 * Clean up database after each test.
 * Use a separate database connection to avoid locking issues.
 */
afterEach(async () => {
  try {
    // Add delay to ensure all async operations complete
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Delete in correct order (respecting foreign keys)
    // Use separate statements to avoid transaction issues
    try {
      await db.delete(court_assignments);
    } catch (e) {
      // Ignore if table is locked or doesn't have data
    }
    try {
      await db.delete(matches);
    } catch (e) {
      // Ignore if table is locked or doesn't have data
    }
    try {
      await db.delete(players);
    } catch (e) {
      // Ignore if table is locked or doesn't have data
    }
    try {
      await db.delete(teams);
    } catch (e) {
      // Ignore if table is locked or doesn't have data
    }
    try {
      await db.delete(pools);
    } catch (e) {
      // Ignore if table is locked or doesn't have data
    }
    try {
      await db.delete(divisions);
    } catch (e) {
      // Ignore if table is locked or doesn't have data
    }
    try {
      await db.delete(exports);
    } catch (e) {
      // Ignore if table is locked or doesn't have data
    }
  } catch (error) {
    // Silently ignore cleanup errors
  }
});
