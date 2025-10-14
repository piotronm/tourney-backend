/**
 * Database schema definitions using Drizzle ORM.
 * All field names use snake_case for consistency.
 */

import { sql } from 'drizzle-orm';
import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';

/**
 * Divisions table.
 * Stores tournament division information.
 */
export const divisions = sqliteTable('divisions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  created_at: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Teams table.
 * Stores team information for tournaments.
 */
export const teams = sqliteTable('teams', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  division_id: integer('division_id').notNull(),
  pool_id: integer('pool_id'),
  name: text('name').notNull(),
  created_at: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Pools table.
 * Stores pool (group) information for tournament divisions.
 */
export const pools = sqliteTable('pools', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  division_id: integer('division_id').notNull(),
  name: text('name').notNull(),
  created_at: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Matches table.
 * Stores round-robin match information.
 */
export const matches = sqliteTable('matches', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  division_id: integer('division_id').notNull(),
  pool_id: integer('pool_id').notNull(),
  round_number: integer('round_number').notNull(),
  match_number: integer('match_number').notNull(),
  team_a_id: integer('team_a_id').notNull(),
  team_b_id: integer('team_b_id'), // Nullable for BYE matches
  score_a: integer('score_a'),
  score_b: integer('score_b'),
  status: text('status', { enum: ['pending', 'completed'] })
    .notNull()
    .default('pending'),
  created_at: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Players table.
 * Stores individual players with DUPR ratings.
 */
export const players = sqliteTable('players', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  division_id: integer('division_id').notNull(),
  team_id: integer('team_id'),
  name: text('name').notNull(),
  dupr_rating: real('dupr_rating').notNull(),
  created_at: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Court assignments table.
 * Stores match-to-court scheduling assignments.
 */
export const court_assignments = sqliteTable('court_assignments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  match_id: integer('match_id').notNull(),
  court_number: integer('court_number').notNull(),
  time_slot: integer('time_slot').notNull(),
  estimated_start_minutes: integer('estimated_start_minutes').notNull(),
  created_at: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Exports table.
 * Tracks export operations for audit purposes.
 */
export const exports = sqliteTable('exports', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  division_id: integer('division_id').notNull(),
  exported_at: text('exported_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  format: text('format', { enum: ['csv', 'tsv', 'excel'] })
    .notNull()
    .default('csv'),
  row_count: integer('row_count').notNull(),
});

/**
 * Type exports for use in application code.
 */
export type Division = typeof divisions.$inferSelect;
export type NewDivision = typeof divisions.$inferInsert;

export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;

export type Pool = typeof pools.$inferSelect;
export type NewPool = typeof pools.$inferInsert;

export type Match = typeof matches.$inferSelect;
export type NewMatch = typeof matches.$inferInsert;

export type Player = typeof players.$inferSelect;
export type NewPlayer = typeof players.$inferInsert;

export type CourtAssignment = typeof court_assignments.$inferSelect;
export type NewCourtAssignment = typeof court_assignments.$inferInsert;

export type Export = typeof exports.$inferSelect;
export type NewExport = typeof exports.$inferInsert;
