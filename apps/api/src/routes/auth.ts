import type { FastifyPluginAsync } from 'fastify';
import { randomUUID } from 'node:crypto';
import { env } from '../env.js';
import { db } from '../lib/db/drizzle.js';
import { users } from '../lib/db/schema.js';
import { eq, sql } from 'drizzle-orm';
import {
  exchangeCodeForTokens,
  decodeIdToken,
  getAuthorizationUrl,
} from '../lib/auth/google.js';
import {
  createSession,
  deleteSession,
} from '../lib/auth/sessions.js';
import { requireAuth } from '../middleware/auth.js';

const authRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/auth/google
   * Initiates OAuth flow - redirects to Google
   */
  fastify.get('/auth/google', async (_request, reply) => {
    // Check if OAuth is configured
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_REDIRECT_URI) {
      return reply.status(500).send({
        error: 'OAuth not configured',
        message: 'Google OAuth credentials are not set up',
      });
    }

    // Generate cryptographic state for CSRF protection
    const state = randomUUID();

    // Store state in short-lived cookie (5 minutes)
    reply.setCookie('oauth_state', state, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 5 * 60, // 5 minutes
    });

    const authUrl = getAuthorizationUrl(state);

    return reply.redirect(authUrl);
  });

  /**
   * GET /api/auth/google/callback
   * OAuth callback - receives code from Google
   */
  fastify.get('/auth/google/callback', async (request, reply) => {
    const { code, state, error, error_description } = request.query as {
      code?: string;
      state?: string;
      error?: string;
      error_description?: string;
    };

    const frontendUrl = env.FRONTEND_URL || 'http://localhost:5173';

    // Handle OAuth errors
    if (error) {
      fastify.log.error({ error, error_description }, 'OAuth error');
      return reply.redirect(
        `${frontendUrl}/login?error=${encodeURIComponent(error_description || error)}`
      );
    }

    if (!code) {
      return reply.redirect(
        `${frontendUrl}/login?error=${encodeURIComponent('No authorization code received')}`
      );
    }

    // Verify state (CSRF protection)
    const storedState = request.cookies.oauth_state;
    if (!storedState || storedState !== state) {
      fastify.log.error({ state, storedState }, 'State mismatch - possible CSRF attack');
      return reply.redirect(
        `${frontendUrl}/login?error=${encodeURIComponent('Invalid state parameter')}`
      );
    }

    // Clear state cookie
    reply.clearCookie('oauth_state', { path: '/' });

    try {
      // Exchange code for tokens
      const tokens = await exchangeCodeForTokens(code);

      // Decode ID token to get user info
      const googleUser = decodeIdToken(tokens.id_token);

      // Find or create user in database
      let [user] = await db
        .select()
        .from(users)
        .where(eq(users.google_id, googleUser.sub))
        .limit(1);

      if (!user) {
        // Check if this is the first user (bootstrap admin)
        // Use cross-driver compatible COUNT syntax
        const countResult = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(users);
        const isFirstUser = countResult[0]?.count === 0;

        // Create new user
        const [newUser] = await db
          .insert(users)
          .values({
            google_id: googleUser.sub,
            email: googleUser.email,
            name: googleUser.name,
            picture: googleUser.picture,
            role: isFirstUser ? 'admin' : 'viewer', // First user is admin
            last_login_at: new Date().toISOString(),
          })
          .returning();

        user = newUser!;

        fastify.log.info(
          { userId: user.id, email: user.email, role: user.role, isFirstUser },
          'New user created'
        );
      } else {
        // Update existing user
        await db
          .update(users)
          .set({
            name: googleUser.name,
            picture: googleUser.picture,
            last_login_at: new Date().toISOString(),
          })
          .where(eq(users.id, user.id));

        fastify.log.info({ userId: user.id, email: user.email }, 'User logged in');
      }

      // Create session
      const sessionId = await createSession(user.id);

      // Set session cookie (using 'sid' - shorter, conventional)
      reply.setCookie('sid', sessionId, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60, // 30 days
      });

      // Redirect to frontend
      return reply.redirect(`${frontendUrl}/`);
    } catch (err) {
      fastify.log.error({ err }, 'OAuth callback error');
      return reply.redirect(
        `${frontendUrl}/login?error=${encodeURIComponent('Authentication failed')}`
      );
    }
  });

  /**
   * GET /api/auth/me
   * Get current authenticated user
   */
  fastify.get(
    '/auth/me',
    {
      preHandler: requireAuth,
    },
    async (request, reply) => {
      // User is attached by requireAuth middleware
      return reply.send({
        user: {
          id: request.user!.id,
          email: request.user!.email,
          name: request.user!.name,
          picture: request.user!.picture,
          role: request.user!.role,
        },
      });
    }
  );

  /**
   * POST /api/auth/logout
   * Logout - destroys session
   * Optional query param: ?redirect=/login for browser redirects
   */
  fastify.post(
    '/auth/logout',
    {
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const sessionId = request.sessionId!;
      const { redirect } = request.query as { redirect?: string };

      // Delete session from database
      await deleteSession(sessionId);

      // Clear cookie
      reply.clearCookie('sid', { path: '/' });

      // If redirect requested (browser flow), redirect
      if (redirect) {
        return reply.redirect(redirect);
      }

      // Otherwise return JSON (API flow)
      return reply.send({
        message: 'Logged out successfully',
      });
    }
  );
};

export default authRoutes;
