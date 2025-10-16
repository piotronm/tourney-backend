import { randomBytes } from 'node:crypto';
import { db } from '../db/drizzle.js';
import { sessions, users } from '../db/schema.js';
import { eq, lt } from 'drizzle-orm';
import type { User } from '../db/schema.js';

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Generate a cryptographically secure session ID
 */
export function generateSessionId(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Create a new session for a user
 */
export async function createSession(userId: number): Promise<string> {
  const sessionId = generateSessionId();
  const expiresAt = Date.now() + SESSION_DURATION_MS;

  await db.insert(sessions).values({
    id: sessionId,
    user_id: userId,
    expires_at: expiresAt,
  });

  return sessionId;
}

/**
 * Validate a session and return the user if valid
 */
export async function validateSession(sessionId: string): Promise<User | null> {
  // Get session
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!session) {
    return null;
  }

  // Check if expired
  if (session.expires_at < Date.now()) {
    // Delete expired session
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }

  // Get user
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.user_id))
    .limit(1);

  return user ?? null;
}

/**
 * Delete a session (logout)
 */
export async function deleteSession(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

/**
 * Delete all sessions for a user
 */
export async function deleteAllUserSessions(userId: number): Promise<void> {
  await db.delete(sessions).where(eq(sessions.user_id, userId));
}

/**
 * Clean up expired sessions (run periodically)
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const now = Date.now();
  const result = await db
    .delete(sessions)
    .where(lt(sessions.expires_at, now));

  return result.changes ?? 0;
}
