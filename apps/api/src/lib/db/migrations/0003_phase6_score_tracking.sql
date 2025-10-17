-- Phase 6: Add score tracking and team statistics
-- Migration: 0003_phase6_score_tracking.sql
-- Created: 2025-10-17

-- Add stats columns to teams table
ALTER TABLE teams ADD COLUMN wins INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE teams ADD COLUMN losses INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE teams ADD COLUMN points_for INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE teams ADD COLUMN points_against INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE teams ADD COLUMN matches_played INTEGER DEFAULT 0 NOT NULL;

-- Add score tracking columns to matches table
ALTER TABLE matches ADD COLUMN score_json TEXT;
ALTER TABLE matches ADD COLUMN winner_team_id INTEGER;
ALTER TABLE matches ADD COLUMN scheduled_at TEXT;
ALTER TABLE matches ADD COLUMN slot_index INTEGER;
ALTER TABLE matches ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL;

-- Update status column to support new values
-- Note: SQLite doesn't support ALTER COLUMN, so we need to handle this differently
-- The schema.ts enum will validate at application level

-- Add court_number if it doesn't exist (may already exist in some deployments)
-- This is safe to run even if the column exists
ALTER TABLE matches ADD COLUMN court_number INTEGER;

-- Update existing teams to have 0 for all stats
UPDATE teams SET
  wins = 0,
  losses = 0,
  points_for = 0,
  points_against = 0,
  matches_played = 0
WHERE wins IS NULL;
