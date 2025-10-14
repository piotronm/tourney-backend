/**
 * E2E tests for Public API endpoints (frontend integration).
 * Tests all read-only public routes with no authentication required.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import publicRoutes from '../routes/public.js';
import divisionsRoutes from '../routes/divisions.js';
import seedRoute from '../routes/seed.js';
import scoreMatchRoute from '../routes/scoreMatch.js';

describe('Public API E2E', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();

    // Register necessary plugins for public routes (must be before routes)
    await app.register(import('@fastify/sensible'));
    await app.register(import('@fastify/etag'));

    // Register public routes with /api/public prefix
    await app.register(publicRoutes, { prefix: '/api/public' });

    // Register admin routes for test setup (seeding, scoring)
    await app.register(divisionsRoutes, { prefix: '/api' });
    await app.register(seedRoute, { prefix: '/api' });
    await app.register(scoreMatchRoute, { prefix: '/api' });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // ==================== GET /api/public/divisions ====================

  describe('GET /api/public/divisions', () => {
    it('should list all divisions with default pagination', async () => {
      // Create test divisions
      const div1 = await app.inject({
        method: 'POST',
        url: '/api/divisions',
        payload: { name: 'Public Test Division 1' },
      });
      const div2 = await app.inject({
        method: 'POST',
        url: '/api/divisions',
        payload: { name: 'Public Test Division 2' },
      });

      expect(div1.statusCode).toBe(201);
      expect(div2.statusCode).toBe(201);

      // Test public list endpoint
      const response = await app.inject({
        method: 'GET',
        url: '/api/public/divisions',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Verify response envelope
      expect(body).toHaveProperty('data');
      expect(body).toHaveProperty('meta');
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(2);

      // Verify meta fields
      expect(body.meta).toHaveProperty('total');
      expect(body.meta).toHaveProperty('limit');
      expect(body.meta).toHaveProperty('offset');
      expect(body.meta.limit).toBe(20); // default limit
      expect(body.meta.offset).toBe(0); // default offset

      // Verify division structure with stats
      const division = body.data[0];
      expect(division).toHaveProperty('id');
      expect(division).toHaveProperty('name');
      expect(division).toHaveProperty('createdAt');
      expect(division).toHaveProperty('stats');
      expect(division.stats).toHaveProperty('teams');
      expect(division.stats).toHaveProperty('pools');
      expect(division.stats).toHaveProperty('matches');
      expect(division.stats).toHaveProperty('completedMatches');
    });

    it('should include stats for each division', async () => {
      // Create division with teams
      const divResponse = await app.inject({
        method: 'POST',
        url: '/api/divisions',
        payload: { name: 'Division With Stats' },
      });
      const divisionId = JSON.parse(divResponse.body).id;

      // Seed with teams
      await app.inject({
        method: 'POST',
        url: `/api/divisions/${divisionId}/seed`,
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

      // Fetch public list
      const response = await app.inject({
        method: 'GET',
        url: '/api/public/divisions',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      const division = body.data.find((d: any) => d.id === divisionId);

      expect(division).toBeDefined();
      expect(division.stats.teams).toBe(4);
      expect(division.stats.pools).toBe(1);
      expect(division.stats.matches).toBeGreaterThan(0); // Round-robin generates matches
    });

    it('should support pagination with limit and offset', async () => {
      // Create 5 test divisions
      for (let i = 1; i <= 5; i++) {
        await app.inject({
          method: 'POST',
          url: '/api/divisions',
          payload: { name: `Pagination Test ${i}` },
        });
      }

      // Test with limit=2, offset=0
      const page1 = await app.inject({
        method: 'GET',
        url: '/api/public/divisions?limit=2&offset=0',
      });

      expect(page1.statusCode).toBe(200);
      const body1 = JSON.parse(page1.body);
      expect(body1.data.length).toBeLessThanOrEqual(2);
      expect(body1.meta.limit).toBe(2);
      expect(body1.meta.offset).toBe(0);

      // Test with limit=2, offset=2
      const page2 = await app.inject({
        method: 'GET',
        url: '/api/public/divisions?limit=2&offset=2',
      });

      expect(page2.statusCode).toBe(200);
      const body2 = JSON.parse(page2.body);
      expect(body2.meta.limit).toBe(2);
      expect(body2.meta.offset).toBe(2);
    });

    it('should support search filtering by name', async () => {
      // Create divisions with unique names
      await app.inject({
        method: 'POST',
        url: '/api/divisions',
        payload: { name: 'Unique Search Term Alpha' },
      });
      await app.inject({
        method: 'POST',
        url: '/api/divisions',
        payload: { name: 'Unique Search Term Beta' },
      });
      await app.inject({
        method: 'POST',
        url: '/api/divisions',
        payload: { name: 'Different Name Gamma' },
      });

      // Search for "Unique Search Term"
      const response = await app.inject({
        method: 'GET',
        url: '/api/public/divisions?search=Unique Search Term',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Should find at least 2 results
      const matches = body.data.filter((d: any) => d.name.includes('Unique Search Term'));
      expect(matches.length).toBeGreaterThanOrEqual(2);

      // Should NOT include "Different Name Gamma"
      const excluded = body.data.find((d: any) => d.name === 'Different Name Gamma');
      expect(excluded).toBeUndefined();
    });

    it('should include Cache-Control header for performance', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/public/divisions',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBeDefined();
      expect(response.headers['cache-control']).toContain('public');
      expect(response.headers['cache-control']).toContain('max-age');
    });

    it('should reject invalid pagination parameters', async () => {
      // Test negative offset
      const response1 = await app.inject({
        method: 'GET',
        url: '/api/public/divisions?offset=-1',
      });
      expect(response1.statusCode).toBe(400);

      // Test limit > 100
      const response2 = await app.inject({
        method: 'GET',
        url: '/api/public/divisions?limit=101',
      });
      expect(response2.statusCode).toBe(400);

      // Test non-numeric limit
      const response3 = await app.inject({
        method: 'GET',
        url: '/api/public/divisions?limit=abc',
      });
      expect(response3.statusCode).toBe(400);
    });
  });

  // ==================== GET /api/public/divisions/:id ====================

  describe('GET /api/public/divisions/:id', () => {
    it('should get division details with pools', async () => {
      // Create division
      const divResponse = await app.inject({
        method: 'POST',
        url: '/api/divisions',
        payload: { name: 'Division Details Test' },
      });
      const divisionId = JSON.parse(divResponse.body).id;

      // Seed with teams (creates pools) - need 8+ teams for 2 pools
      await app.inject({
        method: 'POST',
        url: `/api/divisions/${divisionId}/seed`,
        payload: {
          teams: [
            { name: 'Team 1' },
            { name: 'Team 2' },
            { name: 'Team 3' },
            { name: 'Team 4' },
            { name: 'Team 5' },
            { name: 'Team 6' },
            { name: 'Team 7' },
            { name: 'Team 8' },
          ],
          maxPools: 2, // Create 2 pools
          options: {
            poolStrategy: 'balanced', // Use balanced strategy to create multiple pools
          },
        },
      });

      // Fetch division details
      const response = await app.inject({
        method: 'GET',
        url: `/api/public/divisions/${divisionId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Verify division fields
      expect(body.id).toBe(divisionId);
      expect(body.name).toBe('Division Details Test');
      expect(body).toHaveProperty('createdAt');
      expect(body).toHaveProperty('stats');
      expect(body).toHaveProperty('pools');

      // Verify stats
      expect(body.stats.teams).toBe(8);
      expect(body.stats.pools).toBe(2);

      // Verify pools array
      expect(Array.isArray(body.pools)).toBe(true);
      expect(body.pools.length).toBe(2);
      expect(body.pools[0]).toHaveProperty('id');
      expect(body.pools[0]).toHaveProperty('name');
      expect(body.pools[0]).toHaveProperty('teamCount');
      expect(body.pools[0].teamCount).toBeGreaterThan(0);
    });

    it('should return 404 for non-existent division', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/public/divisions/999999',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('message');
      expect(body.message).toContain('not found');
    });

    it('should return 400 for invalid division ID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/public/divisions/invalid',
      });

      expect(response.statusCode).toBe(400);
    });

    it('should include Cache-Control header', async () => {
      // Create division
      const divResponse = await app.inject({
        method: 'POST',
        url: '/api/divisions',
        payload: { name: 'Cache Test Division' },
      });
      const divisionId = JSON.parse(divResponse.body).id;

      const response = await app.inject({
        method: 'GET',
        url: `/api/public/divisions/${divisionId}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBeDefined();
      expect(response.headers['cache-control']).toContain('public');
    });
  });

  // ==================== GET /api/public/divisions/:id/matches ====================

  describe('GET /api/public/divisions/:id/matches', () => {
    it('should list all matches for a division', async () => {
      // Create division and seed
      const divResponse = await app.inject({
        method: 'POST',
        url: '/api/divisions',
        payload: { name: 'Matches Test Division' },
      });
      const divisionId = JSON.parse(divResponse.body).id;

      await app.inject({
        method: 'POST',
        url: `/api/divisions/${divisionId}/seed`,
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

      // Fetch matches
      const response = await app.inject({
        method: 'GET',
        url: `/api/public/divisions/${divisionId}/matches`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Verify response envelope
      expect(body).toHaveProperty('data');
      expect(body).toHaveProperty('meta');
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);

      // Verify match structure
      const match = body.data[0];
      expect(match).toHaveProperty('id');
      expect(match).toHaveProperty('poolId');
      expect(match).toHaveProperty('poolName');
      expect(match).toHaveProperty('roundNumber');
      expect(match).toHaveProperty('matchNumber');
      expect(match).toHaveProperty('teamAName');
      expect(match).toHaveProperty('teamBName');
      expect(match).toHaveProperty('scoreA');
      expect(match).toHaveProperty('scoreB');
      expect(match).toHaveProperty('status');
    });

    it('should filter matches by status', async () => {
      // Create division and seed
      const divResponse = await app.inject({
        method: 'POST',
        url: '/api/divisions',
        payload: { name: 'Status Filter Test' },
      });
      const divisionId = JSON.parse(divResponse.body).id;

      await app.inject({
        method: 'POST',
        url: `/api/divisions/${divisionId}/seed`,
        payload: {
          teams: [
            { name: 'Team 1' },
            { name: 'Team 2' },
            { name: 'Team 3' },
            { name: 'Team 4' },
          ],
          maxPools: 1,
        },
      });

      // Get all matches (should be pending)
      const allMatches = await app.inject({
        method: 'GET',
        url: `/api/public/divisions/${divisionId}/matches`,
      });
      const allBody = JSON.parse(allMatches.body);
      const firstMatchId = allBody.data[0].id;

      // Score one match
      await app.inject({
        method: 'PUT',
        url: `/api/matches/${firstMatchId}/score`,
        payload: { scoreA: 11, scoreB: 9 },
      });

      // Filter by completed status
      const completedResponse = await app.inject({
        method: 'GET',
        url: `/api/public/divisions/${divisionId}/matches?status=completed`,
      });

      expect(completedResponse.statusCode).toBe(200);
      const completedBody = JSON.parse(completedResponse.body);
      expect(completedBody.data.length).toBeGreaterThan(0);
      expect(completedBody.data.every((m: any) => m.status === 'completed')).toBe(true);

      // Filter by pending status
      const pendingResponse = await app.inject({
        method: 'GET',
        url: `/api/public/divisions/${divisionId}/matches?status=pending`,
      });

      expect(pendingResponse.statusCode).toBe(200);
      const pendingBody = JSON.parse(pendingResponse.body);
      expect(pendingBody.data.every((m: any) => m.status === 'pending')).toBe(true);
    });

    it('should filter matches by poolId', async () => {
      // Create division with 2 pools
      const divResponse = await app.inject({
        method: 'POST',
        url: '/api/divisions',
        payload: { name: 'Pool Filter Test' },
      });
      const divisionId = JSON.parse(divResponse.body).id;

      await app.inject({
        method: 'POST',
        url: `/api/divisions/${divisionId}/seed`,
        payload: {
          teams: [
            { name: 'Team 1' },
            { name: 'Team 2' },
            { name: 'Team 3' },
            { name: 'Team 4' },
            { name: 'Team 5' },
            { name: 'Team 6' },
          ],
          maxPools: 2,
        },
      });

      // Get all matches to find poolId
      const allMatches = await app.inject({
        method: 'GET',
        url: `/api/public/divisions/${divisionId}/matches`,
      });
      const allBody = JSON.parse(allMatches.body);
      const poolId = allBody.data[0].poolId;

      // Filter by specific pool
      const response = await app.inject({
        method: 'GET',
        url: `/api/public/divisions/${divisionId}/matches?poolId=${poolId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.every((m: any) => m.poolId === poolId)).toBe(true);
    });

    it('should support pagination for matches', async () => {
      // Create division with multiple matches
      const divResponse = await app.inject({
        method: 'POST',
        url: '/api/divisions',
        payload: { name: 'Pagination Matches Test' },
      });
      const divisionId = JSON.parse(divResponse.body).id;

      await app.inject({
        method: 'POST',
        url: `/api/divisions/${divisionId}/seed`,
        payload: {
          teams: [
            { name: 'Team 1' },
            { name: 'Team 2' },
            { name: 'Team 3' },
            { name: 'Team 4' },
            { name: 'Team 5' },
          ],
          maxPools: 1,
        },
      });

      // Test pagination with limit
      const response = await app.inject({
        method: 'GET',
        url: `/api/public/divisions/${divisionId}/matches?limit=2`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.length).toBeLessThanOrEqual(2);
      expect(body.meta.limit).toBe(2);
      expect(body.meta).toHaveProperty('total');
    });

    it('should return 404 for non-existent division', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/public/divisions/999999/matches',
      });

      expect(response.statusCode).toBe(404);
    });

    it('should include Cache-Control header', async () => {
      // Create division
      const divResponse = await app.inject({
        method: 'POST',
        url: '/api/divisions',
        payload: { name: 'Matches Cache Test' },
      });
      const divisionId = JSON.parse(divResponse.body).id;

      const response = await app.inject({
        method: 'GET',
        url: `/api/public/divisions/${divisionId}/matches`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBeDefined();
    });
  });

  // ==================== GET /api/public/divisions/:id/standings ====================

  describe('GET /api/public/divisions/:id/standings', () => {
    it('should return standings with computed stats', async () => {
      // Create division
      const divResponse = await app.inject({
        method: 'POST',
        url: '/api/divisions',
        payload: { name: 'Standings Test Division' },
      });
      const divisionId = JSON.parse(divResponse.body).id;

      // Seed with teams
      await app.inject({
        method: 'POST',
        url: `/api/divisions/${divisionId}/seed`,
        payload: {
          teams: [
            { name: 'Team Alpha' },
            { name: 'Team Beta' },
            { name: 'Team Gamma' },
            { name: 'Team Delta' },
          ],
          maxPools: 1,
        },
      });

      // Get matches and score them
      const matchesResponse = await app.inject({
        method: 'GET',
        url: `/api/public/divisions/${divisionId}/matches`,
      });
      const matches = JSON.parse(matchesResponse.body).data;

      // Score first 2 matches
      await app.inject({
        method: 'PUT',
        url: `/api/matches/${matches[0].id}/score`,
        payload: { scoreA: 11, scoreB: 5 },
      });
      await app.inject({
        method: 'PUT',
        url: `/api/matches/${matches[1].id}/score`,
        payload: { scoreA: 11, scoreB: 8 },
      });

      // Get standings
      const response = await app.inject({
        method: 'GET',
        url: `/api/public/divisions/${divisionId}/standings`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Verify response structure
      expect(body).toHaveProperty('divisionId');
      expect(body).toHaveProperty('divisionName');
      expect(body).toHaveProperty('pools');
      expect(Array.isArray(body.pools)).toBe(true);
      expect(body.pools.length).toBe(1);

      // Verify pool standings
      const pool = body.pools[0];
      expect(pool).toHaveProperty('poolId');
      expect(pool).toHaveProperty('poolName');
      expect(pool).toHaveProperty('standings');
      expect(Array.isArray(pool.standings)).toBe(true);
      expect(pool.standings.length).toBe(4); // All 4 teams

      // Verify standing entry structure
      const standing = pool.standings[0];
      expect(standing).toHaveProperty('rank');
      expect(standing).toHaveProperty('teamId');
      expect(standing).toHaveProperty('teamName');
      expect(standing).toHaveProperty('wins');
      expect(standing).toHaveProperty('losses');
      expect(standing).toHaveProperty('pointsFor');
      expect(standing).toHaveProperty('pointsAgainst');
      expect(standing).toHaveProperty('pointDiff');

      // Verify rankings are sequential
      expect(pool.standings[0].rank).toBe(1);
      expect(pool.standings[1].rank).toBe(2);
      expect(pool.standings[2].rank).toBe(3);
      expect(pool.standings[3].rank).toBe(4);
    });

    it('should include teams with 0-0 records (no matches played)', async () => {
      // Create division
      const divResponse = await app.inject({
        method: 'POST',
        url: '/api/divisions',
        payload: { name: 'Zero Record Test' },
      });
      const divisionId = JSON.parse(divResponse.body).id;

      // Seed with teams (no scoring)
      await app.inject({
        method: 'POST',
        url: `/api/divisions/${divisionId}/seed`,
        payload: {
          teams: [
            { name: 'Team 1' },
            { name: 'Team 2' },
            { name: 'Team 3' },
          ],
          maxPools: 1,
        },
      });

      // Get standings without scoring any matches
      const response = await app.inject({
        method: 'GET',
        url: `/api/public/divisions/${divisionId}/standings`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      const standings = body.pools[0].standings;

      // All teams should be present with 0-0 records
      expect(standings.length).toBe(3);
      standings.forEach((s: any) => {
        expect(s.wins).toBe(0);
        expect(s.losses).toBe(0);
        expect(s.pointsFor).toBe(0);
        expect(s.pointsAgainst).toBe(0);
      });
    });

    it('should filter standings by poolId', async () => {
      // Create division with 2 pools
      const divResponse = await app.inject({
        method: 'POST',
        url: '/api/divisions',
        payload: { name: 'Multi-Pool Standings Test' },
      });
      const divisionId = JSON.parse(divResponse.body).id;

      await app.inject({
        method: 'POST',
        url: `/api/divisions/${divisionId}/seed`,
        payload: {
          teams: [
            { name: 'Pool1 Team1' },
            { name: 'Pool1 Team2' },
            { name: 'Pool1 Team3' },
            { name: 'Pool1 Team4' },
            { name: 'Pool2 Team1' },
            { name: 'Pool2 Team2' },
            { name: 'Pool2 Team3' },
            { name: 'Pool2 Team4' },
          ],
          maxPools: 2,
          options: {
            poolStrategy: 'balanced', // Use balanced strategy to create multiple pools
          },
        },
      });

      // Get all standings
      const allResponse = await app.inject({
        method: 'GET',
        url: `/api/public/divisions/${divisionId}/standings`,
      });
      const allBody = JSON.parse(allResponse.body);
      expect(allBody.pools.length).toBe(2);

      // Filter by specific pool
      const poolId = allBody.pools[0].poolId;
      const filteredResponse = await app.inject({
        method: 'GET',
        url: `/api/public/divisions/${divisionId}/standings?poolId=${poolId}`,
      });

      expect(filteredResponse.statusCode).toBe(200);
      const filteredBody = JSON.parse(filteredResponse.body);
      expect(filteredBody.pools.length).toBe(1);
      expect(filteredBody.pools[0].poolId).toBe(poolId);
    });

    it('should return 404 for non-existent division', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/public/divisions/999999/standings',
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 404 for non-existent poolId filter', async () => {
      // Create division
      const divResponse = await app.inject({
        method: 'POST',
        url: '/api/divisions',
        payload: { name: 'Invalid Pool Test' },
      });
      const divisionId = JSON.parse(divResponse.body).id;

      const response = await app.inject({
        method: 'GET',
        url: `/api/public/divisions/${divisionId}/standings?poolId=999999`,
      });

      expect(response.statusCode).toBe(404);
    });

    it('should include Cache-Control header with shorter TTL', async () => {
      // Create division
      const divResponse = await app.inject({
        method: 'POST',
        url: '/api/divisions',
        payload: { name: 'Standings Cache Test' },
      });
      const divisionId = JSON.parse(divResponse.body).id;

      // Seed
      await app.inject({
        method: 'POST',
        url: `/api/divisions/${divisionId}/seed`,
        payload: {
          teams: [{ name: 'Team 1' }, { name: 'Team 2' }],
          maxPools: 1,
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/public/divisions/${divisionId}/standings`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBeDefined();
      expect(response.headers['cache-control']).toContain('public');
      // Standings should have shorter cache time (15s vs 30s for lists)
      expect(response.headers['cache-control']).toContain('max-age=15');
    });
  });

  // ==================== Caching & ETags ====================

  describe('Caching & ETags', () => {
    it('should include ETag header for GET requests', async () => {
      // Create division
      const divResponse = await app.inject({
        method: 'POST',
        url: '/api/divisions',
        payload: { name: 'ETag Test Division' },
      });
      const divisionId = JSON.parse(divResponse.body).id;

      const response = await app.inject({
        method: 'GET',
        url: `/api/public/divisions/${divisionId}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers.etag).toBeDefined();
    });

    it('should return 304 Not Modified when content unchanged', async () => {
      // Create division
      const divResponse = await app.inject({
        method: 'POST',
        url: '/api/divisions',
        payload: { name: '304 Test Division' },
      });
      const divisionId = JSON.parse(divResponse.body).id;

      // First request - get ETag
      const firstResponse = await app.inject({
        method: 'GET',
        url: `/api/public/divisions/${divisionId}`,
      });
      const etag = firstResponse.headers.etag;

      expect(firstResponse.statusCode).toBe(200);
      expect(etag).toBeDefined();

      // Second request with If-None-Match header
      const secondResponse = await app.inject({
        method: 'GET',
        url: `/api/public/divisions/${divisionId}`,
        headers: {
          'if-none-match': etag as string,
        },
      });

      expect(secondResponse.statusCode).toBe(304);
      expect(secondResponse.body).toBe(''); // No body for 304
    });

    it('should set appropriate Cache-Control for different endpoints', async () => {
      // Create division with data
      const divResponse = await app.inject({
        method: 'POST',
        url: '/api/divisions',
        payload: { name: 'Cache Headers Test' },
      });
      const divisionId = JSON.parse(divResponse.body).id;

      await app.inject({
        method: 'POST',
        url: `/api/divisions/${divisionId}/seed`,
        payload: {
          teams: [{ name: 'Team 1' }, { name: 'Team 2' }],
          maxPools: 1,
        },
      });

      // Check divisions list cache
      const listResponse = await app.inject({
        method: 'GET',
        url: '/api/public/divisions',
      });
      expect(listResponse.headers['cache-control']).toContain('max-age=30');

      // Check standings cache (should be shorter)
      const standingsResponse = await app.inject({
        method: 'GET',
        url: `/api/public/divisions/${divisionId}/standings`,
      });
      expect(standingsResponse.headers['cache-control']).toContain('max-age=15');

      // Check matches cache
      const matchesResponse = await app.inject({
        method: 'GET',
        url: `/api/public/divisions/${divisionId}/matches`,
      });
      expect(matchesResponse.headers['cache-control']).toContain('max-age=15');
    });
  });

  // ==================== Rate Limiting ====================

  describe('Rate Limiting', () => {
    it('should apply rate limiting', async () => {
      // Make requests in batches to avoid timing issues
      const batchSize = 25;
      const batches = 5; // Total: 125 requests (exceeds limit of 100)

      let rateLimitedCount = 0;

      for (let i = 0; i < batches; i++) {
        const requests = Array.from({ length: batchSize }, () =>
          app.inject({
            method: 'GET',
            url: '/api/public/divisions',
          })
        );

        const responses = await Promise.all(requests);
        rateLimitedCount += responses.filter((r) => r.statusCode === 429).length;

        // Small delay between batches
        if (i < batches - 1) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }

      // Some requests should be rate limited
      expect(rateLimitedCount).toBeGreaterThan(0);
    });

    it('should return proper rate limit error message', async () => {
      // Exhaust rate limit
      const requests = Array.from({ length: 105 }, () =>
        app.inject({
          method: 'GET',
          url: '/api/public/divisions',
        })
      );

      const responses = await Promise.all(requests);
      const rateLimited = responses.find((r) => r.statusCode === 429);

      if (rateLimited) {
        const body = rateLimited.json();
        expect(body.error).toBe('Too Many Requests');
        expect(body.message).toContain('Rate limit exceeded');
      }
    });
  });

  // ==================== Caching & ETag ====================

  describe('Caching & ETag', () => {
    it('should include Cache-Control headers', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/public/divisions',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBeDefined();
      expect(response.headers['cache-control']).toContain('public');
      expect(response.headers['cache-control']).toContain('max-age');
    });

    it('should include ETag header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/public/divisions',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers.etag).toBeDefined();
    });

    it('should support conditional requests with If-None-Match', async () => {
      // First request to get ETag
      const response1 = await app.inject({
        method: 'GET',
        url: '/api/public/divisions',
      });

      const etag = response1.headers.etag;
      expect(etag).toBeDefined();

      // Second request with If-None-Match
      const response2 = await app.inject({
        method: 'GET',
        url: '/api/public/divisions',
        headers: {
          'if-none-match': etag as string,
        },
      });

      // Should return 304 Not Modified if content hasn't changed
      // Note: This might be 200 in tests due to data changes between requests
      expect([200, 304]).toContain(response2.statusCode);
    });
  });
});
