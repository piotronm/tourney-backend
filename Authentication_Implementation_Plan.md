# Backend Authentication: Google OAuth 2.0 / OIDC Implementation

## Objective
Implement Google OAuth 2.0 with OpenID Connect (OIDC) for user authentication in the Tournament Manager backend, replacing password-based authentication with secure Google Sign-In.

**IMPORTANT: This is an IMPLEMENTATION task. You will write actual code, create files, and modify the database.**

---

## Key Implementation Features

This plan includes several production-ready improvements:

✅ **Manual DB-based sessions** (no `@fastify/session` needed)  
✅ **Proper form encoding** for Google token exchange (`application/x-www-form-urlencoded`)  
✅ **CSRF protection** with cryptographic state verification  
✅ **First-user bootstrap** - first login automatically gets admin role (cross-driver compatible COUNT)  
✅ **Logout redirect support** - works for both API and browser flows  
✅ **Short cookie names** - uses `sid` instead of `session_id` (conventional)  
✅ **Google Workspace ready** - notes about org account configuration  
✅ **Future-proof** - migration path to `openid-client` documented  
✅ **Clean dependencies** - only `@fastify/cookie` and `axios` needed  

---

## Context & Current State

### Project Details
- **Backend Framework:** Fastify 4.26.0
- **Database:** SQLite with Drizzle ORM
- **Current State:** No authentication system exists
- **API Structure:** Admin endpoints at `/api`, public at `/api/public`
- **Environment:** Development (Tailscale network access)

### Why OAuth Instead of Passwords
✅ No password storage (better security)  
✅ Leverages Google's authentication  
✅ Better UX (single sign-on)  
✅ No password reset flows needed  
✅ User email verification automatic  

---

## OAuth 2.0 / OIDC Flow Overview

### Standard OAuth Flow (What We'll Implement)
```
1. User clicks "Sign in with Google" on frontend
   ↓
2. Frontend redirects to Google authorization URL
   ↓
3. User authenticates with Google and grants permissions
   ↓
4. Google redirects back to our callback URL with authorization code
   ↓
5. Backend exchanges code for access token + ID token
   ↓
6. Backend validates ID token (contains user info)
   ↓
7. Backend creates/updates user in database
   ↓
8. Backend creates session and returns session token to frontend
   ↓
9. Frontend stores session token, uses for authenticated requests
```

---

## Implementation Plan

### Phase 1: Environment & Dependencies (30 minutes)

#### Task 1.1: Install Dependencies
```bash
cd backend/apps/api
pnpm add @fastify/cookie
pnpm add axios # For making HTTP requests to Google
pnpm add -D @types/node
```

**Dependencies Explained:**
- `@fastify/cookie` - Cookie handling (for session cookies)
- `axios` - HTTP client for OAuth token exchange

**Note:** We're NOT using `@fastify/session` or `@fastify/oauth2` because:
- We implement DB-based sessions manually (more control, better for scaling)
- Simple OAuth flow doesn't need a full plugin
- Keeps dependencies minimal

#### Task 1.2: Set Up Google OAuth Credentials
**Manual Step (Document in Implementation Notes):**

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create new project (or use existing): "Tournament Manager"
3. Enable **Google+ API** (for user info)
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Application type: **Web application**
6. Authorized redirect URIs:
   - Development: `http://100.125.100.17:3000/api/auth/google/callback`
   - Production: `https://yourdomain.com/api/auth/google/callback`
7. Copy **Client ID** and **Client Secret**

**Important: OAuth Consent Screen Configuration**
- If you expect Google Workspace (organizational) accounts, configure your OAuth consent screen properly:
  - **User Type:** 
    - Choose "Internal" if ONLY your organization's users
    - Choose "External" for any Google account (requires verification for production)
  - **Scopes:** Select `openid`, `email`, and `profile`
  - **Test Users:** Add test emails if using "External" during development
- **Note:** Internal apps bypass the Google verification process but only work for your organization

**Google Workspace Considerations:**
- If your users are from a Google Workspace domain, you can restrict access to that domain
- Add domain restriction in your OAuth consent screen settings
- This prevents users from other organizations logging in

#### Task 1.3: Update Environment Variables
**File: `backend/apps/api/.env`**

Add these variables:
```bash
# Google OAuth
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret"
GOOGLE_REDIRECT_URI="http://100.125.100.17:3000/api/auth/google/callback"

# Session Secret (currently unused, reserved for future HMAC-signed session IDs)
SESSION_SECRET="generate-a-random-32-char-string"

# Frontend URL (for redirects after auth)
FRONTEND_URL="http://100.125.100.17:5173"
```

**Note on SESSION_SECRET:**
- Currently unused since we're using random UUID session IDs stored directly in the database
- Reserved for future use if you want to implement HMAC-signed session IDs for tamper detection
- Keep it for consistency with common auth patterns

#### Task 1.4: Update Env Schema Validation
**File: `backend/apps/api/src/env.ts`**

Add to existing schema:
```typescript
export const envSchema = z.object({
  // ... existing fields
  
  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),
  
  // Session
  SESSION_SECRET: z.string().min(32),
  
  // Frontend
  FRONTEND_URL: z.string().url(),
});
```

---

### Phase 2: Database Schema (1 hour)

#### Task 2.1: Create Users Table Schema
**File: `backend/apps/api/src/lib/db/schema.ts`**

Add this table definition:
```typescript
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  
  // Google OAuth fields
  google_id: text('google_id').notNull().unique(), // Google's user ID
  email: text('email').notNull().unique(),
  name: text('name'),
  picture: text('picture'), // Profile picture URL from Google
  
  // Authorization
  role: text('role', { enum: ['admin', 'organizer', 'viewer'] })
    .notNull()
    .default('viewer'),
  
  // Timestamps
  created_at: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updated_at: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  last_login_at: text('last_login_at'),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

**Key Points:**
- `google_id` is the unique identifier from Google (sub claim in ID token)
- No `password_hash` field (OAuth doesn't need it)
- `email` from Google (verified by Google)
- `picture` stores Google profile photo URL
- `role` for authorization (default: viewer)

#### Task 2.2: Create Sessions Table Schema
**File: `backend/apps/api/src/lib/db/schema.ts`**

Add this table:
```typescript
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(), // Session ID (random UUID)
  user_id: integer('user_id').notNull(), // FK to users.id
  expires_at: integer('expires_at').notNull(), // Unix timestamp
  created_at: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
```

**Indexes for Performance:**
```typescript
// Add after table definitions
export const sessionsUserIdIdx = index('sessions_user_id_idx').on(sessions.user_id);
export const sessionsExpiresAtIdx = index('sessions_expires_at_idx').on(sessions.expires_at);
```

#### Task 2.3: Create Database Migration
**File: `backend/apps/api/src/lib/db/migrations/XXXX_add_auth_tables.sql`**

```sql
-- Create users table
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  google_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  picture TEXT,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT
);

-- Create indexes
CREATE UNIQUE INDEX idx_users_google_id ON users(google_id);
CREATE UNIQUE INDEX idx_users_email ON users(email);

-- Create sessions table
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
```

#### Task 2.4: Run Migration
```bash
cd backend/apps/api
pnpm drizzle-kit push:sqlite
# OR manually apply the SQL to your database
```

---

### Phase 3: Auth Utilities (1 hour)

#### Task 3.1: Create Session Management Utilities
**File: `backend/apps/api/src/lib/auth/sessions.ts`**

```typescript
import { randomBytes } from 'node:crypto';
import { db } from '../db';
import { sessions, users } from '../db/schema';
import { eq, lt } from 'drizzle-orm';
import type { User } from '../db/schema';

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
```

#### Task 3.2: Create Google OAuth Utilities
**File: `backend/apps/api/src/lib/auth/google.ts`**

```typescript
import axios from 'axios';
import { env } from '../../env';

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  id_token: string; // JWT with user info
}

interface GoogleUserInfo {
  sub: string; // Google user ID (unique)
  email: string;
  email_verified: boolean;
  name: string;
  picture: string;
  given_name?: string;
  family_name?: string;
  locale?: string;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
  // Google's token endpoint requires application/x-www-form-urlencoded
  const params = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    grant_type: 'authorization_code',
  });

  const response = await axios.post<GoogleTokenResponse>(
    'https://oauth2.googleapis.com/token',
    params.toString(),
    {
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  return response.data;
}

/**
 * Decode and validate Google ID token
 * In production, you should verify the signature using google-auth-library
 */
export function decodeIdToken(idToken: string): GoogleUserInfo {
  // ID token is a JWT: header.payload.signature
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid ID token format');
  }

  const payload = Buffer.from(parts[1], 'base64url').toString('utf-8');
  const userInfo = JSON.parse(payload) as GoogleUserInfo;

  // Basic validation
  if (!userInfo.sub || !userInfo.email) {
    throw new Error('Invalid user info in ID token');
  }

  if (!userInfo.email_verified) {
    throw new Error('Email not verified by Google');
  }

  // Validate issuer (Google)
  const iss = (userInfo as any).iss;
  if (iss !== 'https://accounts.google.com' && iss !== 'accounts.google.com') {
    throw new Error('Invalid token issuer');
  }

  // Validate audience (our client ID)
  const aud = (userInfo as any).aud;
  if (aud !== env.GOOGLE_CLIENT_ID) {
    throw new Error('Invalid token audience');
  }

  return userInfo;
}

/**
 * Get user info from Google (alternative to decoding ID token)
 */
export async function getUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const response = await axios.get<GoogleUserInfo>(
    'https://www.googleapis.com/oauth2/v3/userinfo',
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  return response.data;
}

/**
 * Generate Google OAuth authorization URL with PKCE-style state
 */
export function getAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
    state, // CSRF protection
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
```

**Important Notes:**
- **Token Exchange:** Uses `URLSearchParams` to properly encode as `application/x-www-form-urlencoded`
- **ID Token Validation:** Adds basic issuer and audience validation
- **Production TODO:** For production, replace `decodeIdToken` with `google-auth-library` for signature verification
- **Alternative:** Consider migrating to `openid-client` library for automatic discovery and validation

---

### Phase 4: Auth Middleware (1 hour)

#### Task 4.1: Create Auth Middleware
**File: `backend/apps/api/src/middleware/auth.ts`**

```typescript
import type { FastifyRequest, FastifyReply } from 'fastify';
import { validateSession } from '../lib/auth/sessions';
import type { User } from '../lib/db/schema';

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
  reply: FastifyReply
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
```

---

### Phase 5: Auth Routes (2 hours)

#### Task 5.1: Create Auth Routes
**File: `backend/apps/api/src/routes/auth.ts`**

```typescript
import type { FastifyPluginAsync } from 'fastify';
import { randomUUID } from 'node:crypto';
import { env } from '../env';
import { db } from '../lib/db';
import { users } from '../lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { 
  exchangeCodeForTokens, 
  decodeIdToken, 
  getAuthorizationUrl 
} from '../lib/auth/google';
import { 
  createSession, 
  deleteSession, 
  validateSession 
} from '../lib/auth/sessions';
import { requireAuth } from '../middleware/auth';

const authRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/auth/google
   * Initiates OAuth flow - redirects to Google
   */
  fastify.get('/auth/google', async (request, reply) => {
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

    // Handle OAuth errors
    if (error) {
      fastify.log.error({ error, error_description }, 'OAuth error');
      return reply.redirect(
        `${env.FRONTEND_URL}/login?error=${encodeURIComponent(error_description || error)}`
      );
    }

    if (!code) {
      return reply.redirect(
        `${env.FRONTEND_URL}/login?error=${encodeURIComponent('No authorization code received')}`
      );
    }

    // Verify state (CSRF protection)
    const storedState = request.cookies.oauth_state;
    if (!storedState || storedState !== state) {
      fastify.log.error({ state, storedState }, 'State mismatch - possible CSRF attack');
      return reply.redirect(
        `${env.FRONTEND_URL}/login?error=${encodeURIComponent('Invalid state parameter')}`
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
        const [{ count }] = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(users);
        const isFirstUser = count === 0;

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

        user = newUser;

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
      return reply.redirect(`${env.FRONTEND_URL}/`);
    } catch (err) {
      fastify.log.error({ err }, 'OAuth callback error');
      return reply.redirect(
        `${env.FRONTEND_URL}/login?error=${encodeURIComponent('Authentication failed')}`
      );
    }
  });

  /**
   * GET /api/auth/me
   * Get current authenticated user
   */
  fastify.get('/auth/me', {
    preHandler: requireAuth,
  }, async (request, reply) => {
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
  });

  /**
   * POST /api/auth/logout
   * Logout - destroys session
   * Optional query param: ?redirect=/login for browser redirects
   */
  fastify.post('/auth/logout', {
    preHandler: requireAuth,
  }, async (request, reply) => {
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
  });
};

export default authRoutes;
```

**Key Improvements:**
- ✅ **State verification:** Uses `crypto.randomUUID()` for CSRF protection
- ✅ **First user is admin:** Bootstrap logic - first user automatically gets admin role
- ✅ **Logout redirect:** Optional `?redirect=/login` parameter for browser flows
- ✅ **Cookie naming:** Uses `sid` (shorter, conventional)
- ✅ **State storage:** Temporary cookie for state verification (5 min TTL)

---

### Phase 6: Server Configuration (1 hour)

#### Task 6.1: Update Server Setup
**File: `backend/apps/api/src/server.ts`**

Add cookie plugin and auth routes:

```typescript
// Add imports at top
import cookie from '@fastify/cookie';
import authRoutes from './routes/auth';

// ... existing imports and config

export async function buildServer() {
  const fastify = Fastify({
    // ... existing config
  });

  // ... existing plugins (logger, cors, helmet, etc.)

  // ADD: Cookie support (required for session cookies)
  await fastify.register(cookie);

  // ... existing routes registration
  
  // ADD: Auth routes
  await fastify.register(authRoutes, { prefix: '/api' });

  // ... rest of server setup

  return fastify;
}
```

**Note:** We're using only `@fastify/cookie` for cookie handling. Session data is stored in the database (sessions table), and cookies only contain the session ID. This is simpler and more scalable than in-memory session storage.

#### Task 6.2: Protect Admin Endpoints
**File: `backend/apps/api/src/routes/divisions.ts`**

Add auth protection to admin routes:

```typescript
import { requireAuth, requireAdmin } from '../middleware/auth';

const divisionsRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/divisions - CREATE (admin only)
  fastify.post('/divisions', {
    preHandler: [requireAuth, requireAdmin], // ADD THIS
  }, async (request, reply) => {
    // ... existing code
  });

  // PUT /api/divisions/:id - UPDATE (admin only)
  fastify.put('/divisions/:id', {
    preHandler: [requireAuth, requireAdmin], // ADD THIS
  }, async (request, reply) => {
    // ... existing code
  });

  // DELETE /api/divisions/:id - DELETE (admin only)
  fastify.delete('/divisions/:id', {
    preHandler: [requireAuth, requireAdmin], // ADD THIS
  }, async (request, reply) => {
    // ... existing code
  });

  // GET endpoints can remain public or use optionalAuth
};
```

**Apply same pattern to:**
- `seed.ts` - POST endpoints (admin only)
- `seedDupr.ts` - POST endpoints (admin only)
- `scoreMatch.ts` - PUT endpoint (admin only)

---

### Phase 7: Testing (2 hours)

#### Task 7.1: Create Auth Tests
**File: `backend/apps/api/src/__tests__/e2e.auth.spec.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server';
import type { FastifyInstance } from 'fastify';
import { db } from '../lib/db';
import { users, sessions } from '../lib/db/schema';
import { eq } from 'drizzle-orm';
import { createSession } from '../lib/auth/sessions';

describe('Auth E2E Tests', () => {
  let app: FastifyInstance;
  let testUserId: number;
  let testSessionId: string;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();

    // Create test user
    const [user] = await db.insert(users).values({
      google_id: 'test-google-id',
      email: 'test@example.com',
      name: 'Test User',
      role: 'admin',
    }).returning();

    testUserId = user.id;
    testSessionId = await createSession(testUserId);
  });

  afterAll(async () => {
    // Cleanup
    await db.delete(sessions).where(eq(sessions.user_id, testUserId));
    await db.delete(users).where(eq(users.id, testUserId));
    await app.close();
  });

  describe('GET /api/auth/me', () => {
    it('should return user info with valid session', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        cookies: { sid: testSessionId },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.user).toMatchObject({
        id: testUserId,
        email: 'test@example.com',
        name: 'Test User',
        role: 'admin',
      });
    });

    it('should return 401 without session cookie', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 401 with invalid session', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        cookies: { sid: 'invalid-session-id' },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout and clear session', async () => {
      // Create a session for this test
      const sessionId = await createSession(testUserId);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        cookies: { sid: sessionId },
      });

      expect(response.statusCode).toBe(200);

      // Session should be deleted
      const [session] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .limit(1);

      expect(session).toBeUndefined();
    });
  });

  describe('Protected Endpoints', () => {
    it('should allow admin to create division', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/divisions',
        cookies: { sid: testSessionId },
        payload: { name: 'Test Division' },
      });

      expect(response.statusCode).toBe(201);
    });

    it('should block unauthenticated requests to admin endpoints', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/divisions',
        payload: { name: 'Test Division' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should block non-admin users', async () => {
      // Create viewer user
      const [viewer] = await db.insert(users).values({
        google_id: 'viewer-google-id',
        email: 'viewer@example.com',
        name: 'Viewer User',
        role: 'viewer',
      }).returning();

      const viewerSession = await createSession(viewer.id);

      const response = await app.inject({
        method: 'POST',
        url: '/api/divisions',
        cookies: { sid: viewerSession },
        payload: { name: 'Test Division' },
      });

      expect(response.statusCode).toBe(403);

      // Cleanup
      await db.delete(sessions).where(eq(sessions.user_id, viewer.id));
      await db.delete(users).where(eq(users.id, viewer.id));
    });
  });
});
```

#### Task 7.2: Test OAuth Flow Manually
**Manual Testing Checklist:**

1. Start backend server
2. Open browser to `http://100.125.100.17:3000/api/auth/google`
3. Should redirect to Google login
4. Sign in with Google account
5. Should redirect back to frontend with session cookie set
6. Test `/api/auth/me` in browser dev tools
7. Test creating a division
8. Test logout

---

### Phase 8: Documentation (30 minutes)

#### Task 8.1: Create Auth Documentation
**File: `backend/apps/api/docs/AUTHENTICATION.md`**

```markdown
# Authentication System

## Overview
Tournament Manager uses Google OAuth 2.0 with OpenID Connect for authentication.

## Flow
1. User clicks "Sign in with Google"
2. Frontend redirects to `/api/auth/google`
3. Backend redirects to Google authorization
4. User authenticates with Google
5. Google redirects to `/api/auth/google/callback`
6. Backend creates/updates user and session
7. Backend sets session cookie and redirects to frontend
8. Frontend makes authenticated requests with cookie

## Endpoints

### GET /api/auth/google
Initiates OAuth flow. Redirects to Google.

### GET /api/auth/google/callback
OAuth callback. Processes Google response and creates session.

### GET /api/auth/me
Get current authenticated user.

**Auth Required:** Yes

**Response:**
```json
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "John Doe",
    "picture": "https://...",
    "role": "admin"
  }
}
```

### POST /api/auth/logout
Logout current user. Destroys session.

**Auth Required:** Yes

## Roles
- **admin** - Full access to all endpoints
- **organizer** - Can manage tournaments (future)
- **viewer** - Read-only access (default)

## Session Management
- Sessions stored in database
- 30-day expiration
- HttpOnly cookies (XSS protection)
- Secure flag in production (HTTPS only)

## Testing
See `src/__tests__/e2e.auth.spec.ts` for test examples.

## Environment Variables
```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://100.125.100.17:3000/api/auth/google/callback
SESSION_SECRET=...
FRONTEND_URL=http://100.125.100.17:5173
```
```

#### Task 8.2: Update Main README
**File: `backend/apps/api/README.md`**

Add authentication section:
```markdown
## Authentication

This API uses Google OAuth 2.0 for authentication.

See [docs/AUTHENTICATION.md](docs/AUTHENTICATION.md) for details.

### Quick Start
1. Set up Google OAuth credentials
2. Add environment variables
3. Run migrations
4. Start server
5. Visit `/api/auth/google` to test
```

---

## Implementation Checklist

### Setup (1 hour)
- [ ] Install dependencies (`@fastify/oauth2`, `@fastify/session`, `@fastify/cookie`, `axios`)
- [ ] Create Google OAuth credentials in Google Cloud Console
- [ ] Add environment variables to `.env`
- [ ] Update `env.ts` schema validation

### Database (1 hour)
- [ ] Add `users` table to schema
- [ ] Add `sessions` table to schema
- [ ] Create and run migration
- [ ] Verify tables created correctly

### Auth Logic (2 hours)
- [ ] Create `lib/auth/sessions.ts` (session management)
- [ ] Create `lib/auth/google.ts` (OAuth utilities)
- [ ] Create `middleware/auth.ts` (requireAuth, requireAdmin)

### Routes (2 hours)
- [ ] Create `routes/auth.ts` (OAuth flow + endpoints)
- [ ] Register auth routes in `server.ts`
- [ ] Protect admin endpoints with middleware

### Testing (2 hours)
- [ ] Create `e2e.auth.spec.ts`
- [ ] Run automated tests
- [ ] Manual OAuth flow testing
- [ ] Test protected endpoints

### Documentation (30 minutes)
- [ ] Create `docs/AUTHENTICATION.md`
- [ ] Update main README
- [ ] Document environment setup

### Verification (30 minutes)
- [ ] Full OAuth flow works end-to-end
- [ ] Sessions persist correctly
- [ ] Logout works
- [ ] Protected endpoints block unauthorized access
- [ ] Admin role enforcement works
- [ ] All tests pass

---

## Success Criteria

✅ User can sign in with Google  
✅ User info stored in database  
✅ Session cookie set correctly  
✅ `/api/auth/me` returns user info  
✅ Protected endpoints require auth  
✅ Admin endpoints require admin role  
✅ Logout destroys session  
✅ All tests pass  

---

## Next Steps (After Implementation)

1. **Frontend Integration** - Build login UI and AuthContext
2. **Role Management** - Add UI for changing user roles (super-admin feature)
3. **Session Cleanup** - Add cron job to clean expired sessions
4. **Production Hardening:**
   - Verify ID token signatures
   - Add rate limiting to auth endpoints
   - Setup HTTPS
   - Secure cookies with `secure` flag

---

## Common Issues & Troubleshooting

### Issue: "redirect_uri_mismatch" error
**Solution:** Make sure the redirect URI in Google Console exactly matches `GOOGLE_REDIRECT_URI` in `.env`

### Issue: Sessions not persisting
**Solution:** Check that cookie settings are correct (httpOnly, sameSite, path)

### Issue: 401 on protected endpoints
**Solution:** Verify session cookie is being sent and session exists in database

### Issue: CORS errors
**Solution:** Ensure frontend origin is in CORS whitelist and credentials: true is set

---

## Production Considerations

### Security Enhancements
- **ID Token Signature Verification:** 
  - Current implementation decodes ID tokens but doesn't verify signatures
  - For production, use `google-auth-library`:
    ```typescript
    import { OAuth2Client } from 'google-auth-library';
    const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    ```
  - Or better yet, migrate to `openid-client` (see below)

- **Consider `openid-client` Library (Recommended for Production):**
  - Handles discovery, validation, and key rotation automatically
  - Supports multiple providers (Google, Azure AD, Okta, etc.)
  - Better maintained than manual implementation
  - Migration path:
    ```bash
    pnpm add openid-client
    ```
    ```typescript
    import { Issuer } from 'openid-client';
    const googleIssuer = await Issuer.discover('https://accounts.google.com');
    const client = new googleIssuer.Client({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uris: [env.GOOGLE_REDIRECT_URI],
      response_types: ['code'],
    });
    ```
  - Automatically verifies signatures, validates claims, handles token refresh
  - **Recommendation:** Migrate to `openid-client` before production launch

- Enable HTTPS and set `secure: true` on cookies
- Add CSRF protection (already implemented with state verification)
- Rate limit auth endpoints:
  ```typescript
  fastify.register(rateLimit, {
    max: 10, // 10 attempts
    timeWindow: '15 minutes',
  });
  ```
- Regular session cleanup (see cleanup function in sessions.ts)

### Monitoring
- Log authentication attempts
- Track failed logins
- Monitor session creation/deletion
- Alert on unusual patterns

### Scaling
- Consider Redis for session storage (if high traffic)
- Add session refresh logic (extend expiration on activity)
- Implement token rotation for extra security

### Multi-Provider Support (Future)
If you want to support multiple OAuth providers:
- Migrate to `openid-client` (simplifies multi-provider)
- Add provider field to users table
- Support multiple `{provider}_id` fields
- Example providers: Google, Microsoft, GitHub, custom OIDC

---

## Resources

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [OpenID Connect](https://developers.google.com/identity/protocols/oauth2/openid-connect)
- [Fastify OAuth2 Plugin](https://github.com/fastify/fastify-oauth2)
- [Session Management Best Practices](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

---

**End of Implementation Plan**