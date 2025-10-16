import type { FastifyRequest, FastifyReply } from 'fastify';
import { validateSession } from '../lib/auth/sessions.js';
import type { User } from '../lib/db/schema.js';

// Extend Fastify request type to include user
declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
    sessionId?: string;
  }
}

/**
 * Middleware to require authentication
 * Validates session cookie and attaches user to request
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Get session ID from cookie (using 'sid' - shorter, conventional)
  const sessionId = request.cookies.sid;

  if (!sessionId) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'No session cookie provided',
    });
  }

  // Validate session
  const user = await validateSession(sessionId);

  if (!user) {
    // Clear invalid cookie
    reply.clearCookie('sid');
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Invalid or expired session',
    });
  }

  // Attach user to request
  request.user = user;
  request.sessionId = sessionId;
}

/**
 * Middleware to require admin role
 * Must be used AFTER requireAuth
 */
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.user) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
  }

  if (request.user.role !== 'admin') {
    return reply.status(403).send({
      error: 'Forbidden',
      message: 'Admin role required',
    });
  }
}

/**
 * Optional auth - doesn't fail if no session
 * Just attaches user if valid session exists
 */
export async function optionalAuth(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const sessionId = request.cookies.sid;

  if (sessionId) {
    const user = await validateSession(sessionId);
    if (user) {
      request.user = user;
      request.sessionId = sessionId;
    }
  }
}
