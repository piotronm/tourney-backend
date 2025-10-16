/**
 * E2E tests for Authentication endpoints.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import authRoutes from '../routes/auth.js';
import divisionsRoutes from '../routes/divisions.js';
import { db } from '../lib/db/drizzle.js';
import { users, sessions } from '../lib/db/schema.js';
import { eq } from 'drizzle-orm';
import { createSession } from '../lib/auth/sessions.js';

describe('Auth E2E Tests', () => {
  let app: FastifyInstance;
  let testAdminUserId: number;
  let testViewerUserId: number;
  let testAdminSessionId: string;
  let testViewerSessionId: string;

  beforeAll(async () => {
    app = Fastify();
    await app.register(cookie);
    await app.register(authRoutes, { prefix: '/api' });
    await app.register(divisionsRoutes, { prefix: '/api' });
    await app.ready();

    // Create test admin user
    const [adminUser] = await db.insert(users).values({
      google_id: 'test-admin-google-id',
      email: 'admin@example.com',
      name: 'Test Admin',
      role: 'admin',
    }).returning();

    testAdminUserId = adminUser!.id;
    testAdminSessionId = await createSession(testAdminUserId);

    // Create test viewer user
    const [viewerUser] = await db.insert(users).values({
      google_id: 'test-viewer-google-id',
      email: 'viewer@example.com',
      name: 'Test Viewer',
      role: 'viewer',
    }).returning();

    testViewerUserId = viewerUser!.id;
    testViewerSessionId = await createSession(testViewerUserId);
  });

  afterAll(async () => {
    // Cleanup test data
    await db.delete(sessions).where(eq(sessions.user_id, testAdminUserId));
    await db.delete(sessions).where(eq(sessions.user_id, testViewerUserId));
    await db.delete(users).where(eq(users.id, testAdminUserId));
    await db.delete(users).where(eq(users.id, testViewerUserId));
    await app.close();
  });

  describe('GET /api/auth/me', () => {
    it('should return user info with valid admin session', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        cookies: { sid: testAdminSessionId },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.user).toMatchObject({
        id: testAdminUserId,
        email: 'admin@example.com',
        name: 'Test Admin',
        role: 'admin',
      });
      expect(body.user).toHaveProperty('picture');
    });

    it('should return user info with valid viewer session', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        cookies: { sid: testViewerSessionId },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.user).toMatchObject({
        id: testViewerUserId,
        email: 'viewer@example.com',
        name: 'Test Viewer',
        role: 'viewer',
      });
    });

    it('should return 401 without session cookie', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Unauthorized');
      expect(body.message).toContain('No session cookie');
    });

    it('should return 401 with invalid session', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        cookies: { sid: 'invalid-session-id' },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Unauthorized');
      expect(body.message).toContain('Invalid or expired session');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout and clear session', async () => {
      // Create a temporary session for this test
      const tempSessionId = await createSession(testAdminUserId);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        cookies: { sid: tempSessionId },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Logged out successfully');

      // Session should be deleted from database
      const [session] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.id, tempSessionId))
        .limit(1);

      expect(session).toBeUndefined();
    });

    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('Protected Endpoints - Admin Access', () => {
    it('should allow admin to create division', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/divisions',
        cookies: { sid: testAdminSessionId },
        payload: { name: 'Test Division for Auth' },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.name).toBe('Test Division for Auth');
    });

    it('should block unauthenticated requests to admin endpoints', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/divisions',
        payload: { name: 'Test Division' },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Unauthorized');
    });

    it('should block non-admin users from admin endpoints', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/divisions',
        cookies: { sid: testViewerSessionId },
        payload: { name: 'Test Division' },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Forbidden');
      expect(body.message).toContain('Admin role required');
    });

    it('should allow admin to update division', async () => {
      // Create division first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/divisions',
        cookies: { sid: testAdminSessionId },
        payload: { name: 'Original Name' },
      });
      const division = JSON.parse(createResponse.body);

      // Update it
      const response = await app.inject({
        method: 'PUT',
        url: `/api/divisions/${division.id}`,
        cookies: { sid: testAdminSessionId },
        payload: { name: 'Updated Name' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.name).toBe('Updated Name');
    });

    it('should block viewer from updating division', async () => {
      // Create division as admin
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/divisions',
        cookies: { sid: testAdminSessionId },
        payload: { name: 'Test Division' },
      });
      const division = JSON.parse(createResponse.body);

      // Try to update as viewer
      const response = await app.inject({
        method: 'PUT',
        url: `/api/divisions/${division.id}`,
        cookies: { sid: testViewerSessionId },
        payload: { name: 'Hacked Name' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should allow admin to delete division', async () => {
      // Create division first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/divisions',
        cookies: { sid: testAdminSessionId },
        payload: { name: 'To Be Deleted' },
      });
      const division = JSON.parse(createResponse.body);

      // Delete it
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/divisions/${division.id}`,
        cookies: { sid: testAdminSessionId },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Division deleted successfully');
      expect(body.deletedId).toBe(division.id);
    });

    it('should block viewer from deleting division', async () => {
      // Create division as admin
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/divisions',
        cookies: { sid: testAdminSessionId },
        payload: { name: 'Test Division' },
      });
      const division = JSON.parse(createResponse.body);

      // Try to delete as viewer
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/divisions/${division.id}`,
        cookies: { sid: testViewerSessionId },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('Session Expiration', () => {
    it('should reject expired session', async () => {
      // Create a session that expires immediately
      const expiredSessionId = 'expired-session-test';
      await db.insert(sessions).values({
        id: expiredSessionId,
        user_id: testAdminUserId,
        expires_at: Date.now() - 1000, // Expired 1 second ago
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        cookies: { sid: expiredSessionId },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('Invalid or expired session');

      // Session should be deleted from database
      const [session] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.id, expiredSessionId))
        .limit(1);

      expect(session).toBeUndefined();
    });
  });
});
