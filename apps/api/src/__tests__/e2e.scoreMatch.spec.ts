import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import seedRoute from '../routes/seed.js';
import scoreMatchRoute from '../routes/scoreMatch.js';
import { db } from '../lib/db/drizzle.js';
import { matches } from '../lib/db/schema.js';
import { eq } from 'drizzle-orm';

describe('PUT /api/matches/:id/score', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(seedRoute, { prefix: '/api' });
    await app.register(scoreMatchRoute, { prefix: '/api' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should score a match successfully', async () => {
    const divisionId = 20;

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

    // Get first match
    const matchList = await db
      .select()
      .from(matches)
      .where(eq(matches.division_id, divisionId))
      .limit(1);
    const matchId = matchList[0]!.id;

    // Score the match
    const response = await app.inject({
      method: 'PUT',
      url: `/api/matches/${matchId}/score`,
      payload: {
        scoreA: 11,
        scoreB: 9,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();

    expect(body.match).toMatchObject({
      id: matchId,
      scoreA: 11,
      scoreB: 9,
      status: 'completed',
    });

    expect(body.standings).toBeDefined();
    expect(Array.isArray(body.standings)).toBe(true);
    expect(body.standings.length).toBeGreaterThan(0);
  });

  it('should return standings with correct structure', async () => {
    const divisionId = 21;

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

    const matchList = await db
      .select()
      .from(matches)
      .where(eq(matches.division_id, divisionId))
      .limit(1);

    const response = await app.inject({
      method: 'PUT',
      url: `/api/matches/${matchList[0]!.id}/score`,
      payload: { scoreA: 11, scoreB: 7 },
    });

    const { standings } = response.json();

    expect(standings[0]).toHaveProperty('teamId');
    expect(standings[0]).toHaveProperty('wins');
    expect(standings[0]).toHaveProperty('losses');
    expect(standings[0]).toHaveProperty('pointsFor');
    expect(standings[0]).toHaveProperty('pointsAgainst');
    expect(standings[0]).toHaveProperty('pointDiff');
  });

  it('should return 404 for non-existent match', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/matches/99999/score',
      payload: {
        scoreA: 11,
        scoreB: 9,
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().message).toContain('not found');
  });

  it('should return 400 for negative scores', async () => {
    const divisionId = 22;

    await app.inject({
      method: 'POST',
      url: `/api/divisions/${divisionId}/seed`,
      payload: {
        teams: [{ name: 'T1' }, { name: 'T2' }],
        options: { seed: 200 },
      },
    });

    const matchList = await db
      .select()
      .from(matches)
      .where(eq(matches.division_id, divisionId))
      .limit(1);

    const response = await app.inject({
      method: 'PUT',
      url: `/api/matches/${matchList[0]!.id}/score`,
      payload: {
        scoreA: -1,
        scoreB: 9,
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should return 400 for missing scoreB', async () => {
    const divisionId = 23;

    await app.inject({
      method: 'POST',
      url: `/api/divisions/${divisionId}/seed`,
      payload: {
        teams: [{ name: 'T1' }, { name: 'T2' }],
        options: { seed: 300 },
      },
    });

    const matchList = await db
      .select()
      .from(matches)
      .where(eq(matches.division_id, divisionId))
      .limit(1);

    const response = await app.inject({
      method: 'PUT',
      url: `/api/matches/${matchList[0]!.id}/score`,
      payload: {
        scoreA: 11,
        // scoreB missing
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should allow re-scoring a completed match', async () => {
    const divisionId = 24;

    await app.inject({
      method: 'POST',
      url: `/api/divisions/${divisionId}/seed`,
      payload: {
        teams: [{ name: 'T1' }, { name: 'T2' }],
        options: { seed: 400 },
      },
    });

    const matchList = await db
      .select()
      .from(matches)
      .where(eq(matches.division_id, divisionId))
      .limit(1);

    const matchId = matchList[0]!.id;

    // First score
    await app.inject({
      method: 'PUT',
      url: `/api/matches/${matchId}/score`,
      payload: { scoreA: 11, scoreB: 9 },
    });

    // Re-score
    const response = await app.inject({
      method: 'PUT',
      url: `/api/matches/${matchId}/score`,
      payload: { scoreA: 11, scoreB: 5 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().match.scoreB).toBe(5);
  });

  it('should calculate point differential correctly', async () => {
    const divisionId = 25;

    await app.inject({
      method: 'POST',
      url: `/api/divisions/${divisionId}/seed`,
      payload: {
        teams: [{ name: 'Winner' }, { name: 'Loser' }],
        options: { seed: 500 },
      },
    });

    const matchList = await db
      .select()
      .from(matches)
      .where(eq(matches.division_id, divisionId))
      .limit(1);

    const response = await app.inject({
      method: 'PUT',
      url: `/api/matches/${matchList[0]!.id}/score`,
      payload: { scoreA: 11, scoreB: 3 },
    });

    const { standings } = response.json();

    // Winner should have +8 point diff
    const winner = standings.find((s: any) => s.wins === 1);
    expect(winner.pointDiff).toBe(8);

    // Loser should have -8 point diff
    const loser = standings.find((s: any) => s.losses === 1);
    expect(loser.pointDiff).toBe(-8);
  });

  it('should return 400 for invalid match ID', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/matches/abc/score',
      payload: { scoreA: 11, scoreB: 9 },
    });

    expect(response.statusCode).toBe(400);
  });
});
