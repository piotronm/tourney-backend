/**
 * E2E tests for Division CRUD endpoints.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import divisionsRoutes from '../routes/divisions.js';
import seedRoute from '../routes/seed.js';

describe('Division CRUD E2E', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(divisionsRoutes, { prefix: '/api' });
    await app.register(seedRoute, { prefix: '/api' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // ==================== POST /api/divisions ====================

  describe('POST /api/divisions', () => {
    it('should create a division successfully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/divisions',
        payload: {
          name: 'Mens Open',
        },
      });

      expect(response.statusCode).toBe(201);
      const division = JSON.parse(response.body);
      expect(division).toHaveProperty('id');
      expect(division.name).toBe('Mens Open');
      expect(division).toHaveProperty('created_at');
    });

    it('should trim whitespace from division name', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/divisions',
        payload: {
          name: '  Womens Open  ',
        },
      });

      expect(response.statusCode).toBe(201);
      const division = JSON.parse(response.body);
      expect(division.name).toBe('Womens Open');
    });

    it('should return 400 for empty name', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/divisions',
        payload: {
          name: '',
        },
      });

      expect(response.statusCode).toBe(400);
      const error = JSON.parse(response.body);
      expect(error).toHaveProperty('error', 'Invalid request body');
    });

    it('should return 400 for name that is too long', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/divisions',
        payload: {
          name: 'x'.repeat(256), // Max is 255
        },
      });

      expect(response.statusCode).toBe(400);
      const error = JSON.parse(response.body);
      expect(error).toHaveProperty('error', 'Invalid request body');
    });

    it('should return 400 for missing name', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/divisions',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const error = JSON.parse(response.body);
      expect(error).toHaveProperty('error', 'Invalid request body');
    });
  });

  // ==================== GET /api/divisions ====================

  describe('GET /api/divisions', () => {
    it('should list divisions with pagination', async () => {
      // Create some divisions first
      await app.inject({
        method: 'POST',
        url: '/api/divisions',
        payload: { name: 'Division 1' },
      });
      await app.inject({
        method: 'POST',
        url: '/api/divisions',
        payload: { name: 'Division 2' },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/divisions',
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data).toHaveProperty('divisions');
      expect(data).toHaveProperty('total');
      expect(data).toHaveProperty('limit', 50);
      expect(data).toHaveProperty('offset', 0);
      expect(Array.isArray(data.divisions)).toBe(true);
      expect(data.total).toBeGreaterThanOrEqual(2);
    });

    it('should respect limit parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/divisions?limit=1',
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.limit).toBe(1);
      expect(data.divisions.length).toBeLessThanOrEqual(1);
    });

    it('should respect offset parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/divisions?offset=1',
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.offset).toBe(1);
    });

    it('should use default values when no query params provided', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/divisions',
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.limit).toBe(50);
      expect(data.offset).toBe(0);
    });
  });

  // ==================== GET /api/divisions/:id ====================

  describe('GET /api/divisions/:id', () => {
    it('should fetch a division with stats', async () => {
      // Create division
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/divisions',
        payload: { name: 'Stats Test Division' },
      });
      const division = JSON.parse(createResponse.body);

      // Fetch with stats
      const response = await app.inject({
        method: 'GET',
        url: `/api/divisions/${division.id}`,
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data).toHaveProperty('id', division.id);
      expect(data).toHaveProperty('name', 'Stats Test Division');
      expect(data).toHaveProperty('stats');
      expect(data.stats).toHaveProperty('teams', 0);
      expect(data.stats).toHaveProperty('pools', 0);
      expect(data.stats).toHaveProperty('matches', 0);
    });

    it('should return 404 for non-existent division', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/divisions/999999',
      });

      expect(response.statusCode).toBe(404);
      const error = JSON.parse(response.body);
      expect(error).toHaveProperty('error', 'Not Found');
      expect(error.message).toContain('999999');
    });

    it('should return 400 for invalid division ID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/divisions/invalid',
      });

      expect(response.statusCode).toBe(400);
      const error = JSON.parse(response.body);
      expect(error).toHaveProperty('error', 'Invalid division ID');
    });
  });

  // ==================== PUT /api/divisions/:id ====================

  describe('PUT /api/divisions/:id', () => {
    it('should update a division successfully', async () => {
      // Create division
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/divisions',
        payload: { name: 'Original Name' },
      });
      const division = JSON.parse(createResponse.body);

      // Update division
      const response = await app.inject({
        method: 'PUT',
        url: `/api/divisions/${division.id}`,
        payload: { name: 'Updated Name' },
      });

      expect(response.statusCode).toBe(200);
      const updated = JSON.parse(response.body);
      expect(updated.id).toBe(division.id);
      expect(updated.name).toBe('Updated Name');
    });

    it('should return 404 for non-existent division', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/divisions/999999',
        payload: { name: 'Updated Name' },
      });

      expect(response.statusCode).toBe(404);
      const error = JSON.parse(response.body);
      expect(error).toHaveProperty('error', 'Not Found');
    });

    it('should return 400 for empty name', async () => {
      // Create division
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/divisions',
        payload: { name: 'Test Division' },
      });
      const division = JSON.parse(createResponse.body);

      // Try to update with empty name
      const response = await app.inject({
        method: 'PUT',
        url: `/api/divisions/${division.id}`,
        payload: { name: '' },
      });

      expect(response.statusCode).toBe(400);
      const error = JSON.parse(response.body);
      expect(error).toHaveProperty('error', 'Invalid request body');
    });
  });

  // ==================== DELETE /api/divisions/:id ====================

  describe('DELETE /api/divisions/:id', () => {
    it('should delete a division successfully', async () => {
      // Create division
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/divisions',
        payload: { name: 'To Be Deleted' },
      });
      const division = JSON.parse(createResponse.body);

      // Delete division
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/divisions/${division.id}`,
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data).toHaveProperty('message', 'Division deleted successfully');
      expect(data).toHaveProperty('deletedId', division.id);

      // Verify it's gone
      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/divisions/${division.id}`,
      });
      expect(getResponse.statusCode).toBe(404);
    });

    it('should cascade delete related records', async () => {
      // Create division with teams
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/divisions',
        payload: { name: 'Cascade Test' },
      });
      const division = JSON.parse(createResponse.body);

      // Seed with teams (this creates pools, matches, etc.)
      await app.inject({
        method: 'POST',
        url: `/api/divisions/${division.id}/seed`,
        payload: {
          teams: [
            { name: 'Team A' },
            { name: 'Team B' },
            { name: 'Team C' },
            { name: 'Team D' },
          ],
          maxPools: 1,
        },
      });

      // Delete division (should cascade)
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/divisions/${division.id}`,
      });

      expect(response.statusCode).toBe(200);

      // Verify division is gone
      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/divisions/${division.id}`,
      });
      expect(getResponse.statusCode).toBe(404);
    });

    it('should return 404 for non-existent division', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/divisions/999999',
      });

      expect(response.statusCode).toBe(404);
      const error = JSON.parse(response.body);
      expect(error).toHaveProperty('error', 'Not Found');
    });

    it('should return 404 when trying to delete twice', async () => {
      // Create division
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/divisions',
        payload: { name: 'Double Delete Test' },
      });
      const division = JSON.parse(createResponse.body);

      // First delete
      const firstDelete = await app.inject({
        method: 'DELETE',
        url: `/api/divisions/${division.id}`,
      });
      expect(firstDelete.statusCode).toBe(200);

      // Second delete
      const secondDelete = await app.inject({
        method: 'DELETE',
        url: `/api/divisions/${division.id}`,
      });
      expect(secondDelete.statusCode).toBe(404);
    });

    it('should return 400 for invalid division ID', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/divisions/invalid',
      });

      expect(response.statusCode).toBe(400);
      const error = JSON.parse(response.body);
      expect(error).toHaveProperty('error', 'Invalid division ID');
    });
  });
});
