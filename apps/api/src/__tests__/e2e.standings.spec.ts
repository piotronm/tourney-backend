import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import seedRoute from '../routes/seed.js';
import scoreMatchRoute from '../routes/scoreMatch.js';
import standingsRoute from '../routes/standings.js';
import { db } from '../lib/db/drizzle.js';
import { matches, pools as poolsTable } from '../lib/db/schema.js';
import { eq } from 'drizzle-orm';

describe('GET /api/divisions/:id/standings', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(seedRoute, { prefix: '/api' });
    await app.register(scoreMatchRoute, { prefix: '/api' });
    await app.register(standingsRoute, { prefix: '/api' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should retrieve standings for a division', async () => {
    const divisionId = 30;

    // Seed tournament
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
        options: { seed: 42 },
      },
    });

    // Get standings
    const response = await app.inject({
      method: 'GET',
      url: `/api/divisions/${divisionId}/standings`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();

    expect(body.divisionId).toBe(divisionId);
    expect(body.divisionName).toBeDefined();
    expect(body.pools).toHaveLength(1);
    expect(body.pools[0].standings).toBeDefined();
  });

  it('should have correct standings structure', async () => {
    const divisionId = 31;

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
        options: { seed: 100 },
      },
    });

    // Score one match
    const matchList = await db
      .select()
      .from(matches)
      .where(eq(matches.division_id, divisionId))
      .limit(1);

    await app.inject({
      method: 'PUT',
      url: `/api/matches/${matchList[0]!.id}/score`,
      payload: { scoreA: 11, scoreB: 7 },
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/divisions/${divisionId}/standings`,
    });

    const { pools } = response.json();
    const standings = pools[0].standings;

    expect(standings.length).toBe(3);

    standings.forEach((standing: any) => {
      expect(standing).toHaveProperty('rank');
      expect(standing).toHaveProperty('teamId');
      expect(standing).toHaveProperty('teamName');
      expect(standing).toHaveProperty('wins');
      expect(standing).toHaveProperty('losses');
      expect(standing).toHaveProperty('pointsFor');
      expect(standing).toHaveProperty('pointsAgainst');
      expect(standing).toHaveProperty('pointDiff');
      expect(standing).toHaveProperty('matchesPlayed');
    });
  });

  it('should rank teams correctly by wins', async () => {
    const divisionId = 32;

    await app.inject({
      method: 'POST',
      url: `/api/divisions/${divisionId}/seed`,
      payload: {
        teams: [{ name: 'Team A' }, { name: 'Team B' }],
        maxPools: 1,
        options: { seed: 200 },
      },
    });

    // Score match
    const matchList = await db
      .select()
      .from(matches)
      .where(eq(matches.division_id, divisionId));

    await app.inject({
      method: 'PUT',
      url: `/api/matches/${matchList[0]!.id}/score`,
      payload: { scoreA: 11, scoreB: 5 },
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/divisions/${divisionId}/standings`,
    });

    const { pools } = response.json();
    const standings = pools[0].standings;

    // Verify ranks are assigned
    expect(standings).toHaveLength(2);
    expect(standings[0].rank).toBe(1);
    expect(standings[1].rank).toBe(2);

    // Winner should be rank 1 with 1 win
    expect(standings[0].wins).toBe(1);
    expect(standings[0].losses).toBe(0);

    // Loser should be rank 2 with 1 loss
    expect(standings[1].wins).toBe(0);
    expect(standings[1].losses).toBe(1);
  });

  it('should calculate point differential correctly', async () => {
    const divisionId = 33;

    await app.inject({
      method: 'POST',
      url: `/api/divisions/${divisionId}/seed`,
      payload: {
        teams: [{ name: 'Team A' }, { name: 'Team B' }],
        options: { seed: 300 },
      },
    });

    const matchList = await db
      .select()
      .from(matches)
      .where(eq(matches.division_id, divisionId))
      .limit(1);

    await app.inject({
      method: 'PUT',
      url: `/api/matches/${matchList[0]!.id}/score`,
      payload: { scoreA: 11, scoreB: 3 },
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/divisions/${divisionId}/standings`,
    });

    const { pools } = response.json();
    const standings = pools[0].standings;

    // Winner: 11 for, 3 against, diff = +8
    const winner = standings.find((s: any) => s.wins === 1);
    expect(winner.pointsFor).toBe(11);
    expect(winner.pointsAgainst).toBe(3);
    expect(winner.pointDiff).toBe(8);

    // Loser: 3 for, 11 against, diff = -8
    const loser = standings.find((s: any) => s.losses === 1);
    expect(loser.pointsFor).toBe(3);
    expect(loser.pointsAgainst).toBe(11);
    expect(loser.pointDiff).toBe(-8);
  });

  it('should filter by poolId if provided', async () => {
    const divisionId = 34;

    // Seed with 2 pools
    await app.inject({
      method: 'POST',
      url: `/api/divisions/${divisionId}/seed`,
      payload: {
        teams: [
          { name: 'T1' },
          { name: 'T2' },
          { name: 'T3' },
          { name: 'T4' },
        ],
        maxPools: 2,
        options: { seed: 400, poolStrategy: 'balanced' },
      },
    });

    // Get first pool ID
    const poolsList = await db
      .select()
      .from(poolsTable)
      .where(eq(poolsTable.division_id, divisionId))
      .limit(1);
    const poolId = poolsList[0]!.id;

    // Get standings filtered by pool
    const response = await app.inject({
      method: 'GET',
      url: `/api/divisions/${divisionId}/standings?poolId=${poolId}`,
    });

    expect(response.statusCode).toBe(200);
    const { pools } = response.json();

    expect(pools).toHaveLength(1);
    expect(pools[0].poolId).toBe(poolId);
  });

  it('should return 404 for non-existent division', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/divisions/99999/standings',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().message).toContain('not found');
  });

  it('should return 404 for non-existent pool', async () => {
    const divisionId = 35;

    await app.inject({
      method: 'POST',
      url: `/api/divisions/${divisionId}/seed`,
      payload: {
        teams: [{ name: 'T1' }, { name: 'T2' }],
        options: { seed: 500 },
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/divisions/${divisionId}/standings?poolId=99999`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().message).toContain('Pool');
  });

  it('should handle division with no scored matches', async () => {
    const divisionId = 36;

    await app.inject({
      method: 'POST',
      url: `/api/divisions/${divisionId}/seed`,
      payload: {
        teams: [{ name: 'Team X' }, { name: 'Team Y' }],
        options: { seed: 600 },
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/divisions/${divisionId}/standings`,
    });

    expect(response.statusCode).toBe(200);
    const { pools } = response.json();

    // All teams should have 0 wins, 0 losses
    pools[0].standings.forEach((s: any) => {
      expect(s.wins).toBe(0);
      expect(s.losses).toBe(0);
      expect(s.matchesPlayed).toBe(0);
      expect(s.pointsFor).toBe(0);
      expect(s.pointsAgainst).toBe(0);
    });
  });

  it('should handle multiple pools in same division', async () => {
    const divisionId = 37;

    await app.inject({
      method: 'POST',
      url: `/api/divisions/${divisionId}/seed`,
      payload: {
        teams: [
          { name: 'Pool1-T1' },
          { name: 'Pool1-T2' },
          { name: 'Pool2-T1' },
          { name: 'Pool2-T2' },
        ],
        maxPools: 2,
        options: { seed: 700, poolStrategy: 'balanced' },
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/divisions/${divisionId}/standings`,
    });

    expect(response.statusCode).toBe(200);
    const { pools } = response.json();

    expect(pools).toHaveLength(2);
    expect(pools[0].poolName).toBeDefined();
    expect(pools[1].poolName).toBeDefined();
    expect(pools[0].standings).toHaveLength(2);
    expect(pools[1].standings).toHaveLength(2);
  });
});
