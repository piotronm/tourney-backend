/**
 * Drizzle ORM database connection and initialization.
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { env } from '../../env.js';

/**
 * SQLite database instance.
 */
const sqlite = new Database(env.DATABASE_URL.replace('file:', ''));

// Enable foreign keys
sqlite.pragma('foreign_keys = ON');

/**
 * Drizzle ORM database instance with schema.
 */
export const db = drizzle(sqlite, { schema });

/**
 * Close the database connection.
 * Should be called on application shutdown.
 */
export function closeDatabase(): void {
  sqlite.close();
}
