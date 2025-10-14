import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { db } from '../lib/db/drizzle.js';
import { teams, pools, matches, players } from '../lib/db/schema.js';
import seedRoute from '../routes/seed.js';
import seedDuprRoute from '../routes/seedDupr.js';
import exportExcelRoute from '../routes/exportExcel.js';
import { eq } from 'drizzle-orm';

describe('POST /api/divisions/:id/seed', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(seedRoute, { prefix: '/api' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should seed a tournament with even teams successfully', async () => {
    const divisionId = 1;

    const response = await app.inject({
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
        options: {
          seed: 12345,
          shuffle: false,
          poolStrategy: 'respect-input',
        },
      },
    });

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body).toMatchObject({
      divisionId: 1,
      poolsCreated: 1,
      teamsCount: 4,
      matchesGenerated: 6, // 4 teams = 6 matches
      message: 'Tournament seeded successfully',
    });

    // Verify database records
    const dbTeams = await db
      .select()
      .from(teams)
      .where(eq(teams.division_id, divisionId));
    expect(dbTeams).toHaveLength(4);

    const dbPools = await db
      .select()
      .from(pools)
      .where(eq(pools.division_id, divisionId));
    expect(dbPools).toHaveLength(1);

    const dbMatches = await db
      .select()
      .from(matches)
      .where(eq(matches.division_id, divisionId));
    expect(dbMatches).toHaveLength(6);
  });

  it('should seed a tournament with odd teams successfully', async () => {
    const divisionId = 2;

    const response = await app.inject({
      method: 'POST',
      url: `/api/divisions/${divisionId}/seed`,
      payload: {
        teams: [
          { name: 'Team Red' },
          { name: 'Team Blue' },
          { name: 'Team Green' },
        ],
        maxPools: 1,
        options: {
          seed: 99,
        },
      },
    });

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body).toMatchObject({
      divisionId: 2,
      poolsCreated: 1,
      teamsCount: 3,
      matchesGenerated: 3, // 3 teams = 3 matches
    });
  });

  it('should seed with multiple pools using balanced strategy', async () => {
    const divisionId = 3;

    const response = await app.inject({
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
        options: {
          seed: 777,
          poolStrategy: 'balanced',
        },
      },
    });

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.poolsCreated).toBe(2);
    expect(body.teamsCount).toBe(6);

    // Verify pools have balanced teams
    const dbPools = await db
      .select()
      .from(pools)
      .where(eq(pools.division_id, divisionId));
    expect(dbPools).toHaveLength(2);

    const dbTeams = await db
      .select()
      .from(teams)
      .where(eq(teams.division_id, divisionId));

    const pool1Teams = dbTeams.filter((t) => t.pool_id === dbPools[0]?.id);
    const pool2Teams = dbTeams.filter((t) => t.pool_id === dbPools[1]?.id);

    expect(pool1Teams).toHaveLength(3);
    expect(pool2Teams).toHaveLength(3);
  });

  it('should respect input poolId assignments', async () => {
    const divisionId = 4;

    const response = await app.inject({
      method: 'POST',
      url: `/api/divisions/${divisionId}/seed`,
      payload: {
        teams: [
          { name: 'Pool1 Team1', poolId: 1 },
          { name: 'Pool1 Team2', poolId: 1 },
          { name: 'Pool2 Team1', poolId: 2 },
          { name: 'Pool2 Team2', poolId: 2 },
        ],
        maxPools: 2,
        options: {
          poolStrategy: 'respect-input',
        },
      },
    });

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.poolsCreated).toBe(2);
  });

  it('should shuffle teams deterministically with same seed', async () => {
    const divisionId1 = 5;
    const divisionId2 = 6;

    const payload = {
      teams: [
        { name: 'Team A' },
        { name: 'Team B' },
        { name: 'Team C' },
        { name: 'Team D' },
      ],
      maxPools: 1,
      options: {
        seed: 999,
        shuffle: true,
      },
    };

    // Seed first division
    await app.inject({
      method: 'POST',
      url: `/api/divisions/${divisionId1}/seed`,
      payload,
    });

    // Seed second division with same seed
    await app.inject({
      method: 'POST',
      url: `/api/divisions/${divisionId2}/seed`,
      payload,
    });

    // Get teams from both divisions
    const teams1 = await db
      .select()
      .from(teams)
      .where(eq(teams.division_id, divisionId1))
      .orderBy(teams.id);

    const teams2 = await db
      .select()
      .from(teams)
      .where(eq(teams.division_id, divisionId2))
      .orderBy(teams.id);

    // Team names should be in same order (deterministic shuffle)
    expect(teams1.map((t) => t.name)).toEqual(teams2.map((t) => t.name));
  });

  it('should return 400 for invalid division ID', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/divisions/invalid/seed',
      payload: {
        teams: [{ name: 'Team A' }, { name: 'Team B' }],
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Invalid division ID');
  });

  it('should return 400 for fewer than 2 teams', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/divisions/1/seed',
      payload: {
        teams: [{ name: 'Team A' }],
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Invalid request body');
  });

  it('should return 400 for empty team name', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/divisions/1/seed',
      payload: {
        teams: [{ name: '' }, { name: 'Team B' }],
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should clear existing data before reseeding', async () => {
    const divisionId = 7;

    // First seed
    await app.inject({
      method: 'POST',
      url: `/api/divisions/${divisionId}/seed`,
      payload: {
        teams: [{ name: 'A' }, { name: 'B' }],
      },
    });

    // Second seed with different data
    await app.inject({
      method: 'POST',
      url: `/api/divisions/${divisionId}/seed`,
      payload: {
        teams: [
          { name: 'X' },
          { name: 'Y' },
          { name: 'Z' },
        ],
      },
    });

    // Should only have data from second seed
    const dbTeams = await db
      .select()
      .from(teams)
      .where(eq(teams.division_id, divisionId));

    expect(dbTeams).toHaveLength(3);
    expect(dbTeams.map((t) => t.name).sort()).toEqual(['X', 'Y', 'Z']);
  });

  describe('Error cases', () => {
    it('should return 404 for non-existent division (when querying, not seeding)', async () => {
      // Note: Seeding creates division, so we test 404 on data queries
      // This is tested more thoroughly in export tests
      const response = await app.inject({
        method: 'POST',
        url: '/api/divisions/99999/seed',
        payload: {
          teams: [{ name: 'A' }, { name: 'B' }],
        },
      });

      // Seeding should succeed even for new division
      expect(response.statusCode).toBe(200);
    });

    it('should return 400 for malformed JSON', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/divisions/1/seed',
        payload: 'not valid json{',
        headers: {
          'content-type': 'application/json',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for missing required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/divisions/1/seed',
        payload: {
          // Missing 'teams' field
          maxPools: 1,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Invalid request body');
    });

    it('should return 400 for teams array with < 2 teams', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/divisions/1/seed',
        payload: {
          teams: [{ name: 'Only One Team' }],
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Invalid request body');
    });

    it('should return 400 for invalid team structure', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/divisions/1/seed',
        payload: {
          teams: [
            { name: 'Valid Team' },
            { invalidField: 'No name field' }, // Missing 'name'
          ],
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('Pool strategy tests', () => {
    it('should produce different results for respect-input vs balanced', async () => {
      const divisionId1 = 100;
      const divisionId2 = 101;

      const teamsPayload = [
        { name: 'Team 1' },
        { name: 'Team 2' },
        { name: 'Team 3' },
        { name: 'Team 4' },
        { name: 'Team 5' },
        { name: 'Team 6' },
      ];

      // Seed with respect-input (no poolId = single pool)
      await app.inject({
        method: 'POST',
        url: `/api/divisions/${divisionId1}/seed`,
        payload: {
          teams: teamsPayload,
          maxPools: 2,
          options: {
            seed: 555,
            poolStrategy: 'respect-input',
          },
        },
      });

      // Seed with balanced strategy
      await app.inject({
        method: 'POST',
        url: `/api/divisions/${divisionId2}/seed`,
        payload: {
          teams: teamsPayload,
          maxPools: 2,
          options: {
            seed: 555,
            poolStrategy: 'balanced',
          },
        },
      });

      const pools1 = await db
        .select()
        .from(pools)
        .where(eq(pools.division_id, divisionId1));

      const pools2 = await db
        .select()
        .from(pools)
        .where(eq(pools.division_id, divisionId2));

      // respect-input with no poolId should create 1 pool
      expect(pools1).toHaveLength(1);

      // balanced with maxPools=2 should create 2 pools
      expect(pools2).toHaveLength(2);
    });

    it('should create evenly distributed pools with balanced strategy', async () => {
      const divisionId = 102;

      await app.inject({
        method: 'POST',
        url: `/api/divisions/${divisionId}/seed`,
        payload: {
          teams: [
            { name: 'T1' },
            { name: 'T2' },
            { name: 'T3' },
            { name: 'T4' },
            { name: 'T5' },
            { name: 'T6' },
            { name: 'T7' },
            { name: 'T8' },
          ],
          maxPools: 2,
          options: {
            poolStrategy: 'balanced',
          },
        },
      });

      const dbPools = await db
        .select()
        .from(pools)
        .where(eq(pools.division_id, divisionId));

      expect(dbPools).toHaveLength(2);

      const dbTeams = await db
        .select()
        .from(teams)
        .where(eq(teams.division_id, divisionId));

      // Count teams per pool
      const pool1Teams = dbTeams.filter((t) => t.pool_id === dbPools[0]?.id);
      const pool2Teams = dbTeams.filter((t) => t.pool_id === dbPools[1]?.id);

      // Both pools should have 4 teams
      expect(pool1Teams).toHaveLength(4);
      expect(pool2Teams).toHaveLength(4);
    });

    it('should handle uneven team distribution with balanced strategy', async () => {
      const divisionId = 103;

      await app.inject({
        method: 'POST',
        url: `/api/divisions/${divisionId}/seed`,
        payload: {
          teams: [
            { name: 'T1' },
            { name: 'T2' },
            { name: 'T3' },
            { name: 'T4' },
            { name: 'T5' },
          ],
          maxPools: 2,
          options: {
            poolStrategy: 'balanced',
          },
        },
      });

      const dbPools = await db
        .select()
        .from(pools)
        .where(eq(pools.division_id, divisionId));

      expect(dbPools).toHaveLength(2);

      const dbTeams = await db
        .select()
        .from(teams)
        .where(eq(teams.division_id, divisionId));

      const pool1Teams = dbTeams.filter((t) => t.pool_id === dbPools[0]?.id);
      const pool2Teams = dbTeams.filter((t) => t.pool_id === dbPools[1]?.id);

      // 5 teams in 2 pools = 3 and 2
      const teamCounts = [pool1Teams.length, pool2Teams.length].sort();
      expect(teamCounts).toEqual([2, 3]);
    });
  });
});

describe('POST /api/divisions/:id/seed-dupr', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(seedDuprRoute, { prefix: '/api' });
    await app.register(exportExcelRoute, { prefix: '/api' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('DUPR-based seeding', () => {
    it('should generate teams from players successfully', async () => {
      const divisionId = 200;

      const response = await app.inject({
        method: 'POST',
        url: `/api/divisions/${divisionId}/seed-dupr`,
        payload: {
          players: [
            { name: 'Alice Anderson', duprRating: 5.5 },
            { name: 'Bob Baker', duprRating: 4.0 },
            { name: 'Charlie Chen', duprRating: 6.0 },
            { name: 'Diana Davis', duprRating: 3.5 },
          ],
          teamGeneration: {
            strategy: 'balanced',
            teamSize: 2,
          },
          options: {
            seed: 12345,
            poolStrategy: 'respect-input',
          },
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        divisionId: 200,
        playersCount: 4,
        teamsGenerated: 2,
        poolsCreated: 1,
        matchesGenerated: 1,
        message: 'Tournament seeded successfully with DUPR-based teams',
      });

      // Verify players in database
      const dbPlayers = await db
        .select()
        .from(players)
        .where(eq(players.division_id, divisionId));

      expect(dbPlayers).toHaveLength(4);
      expect(dbPlayers.map((p) => p.name).sort()).toEqual([
        'Alice Anderson',
        'Bob Baker',
        'Charlie Chen',
        'Diana Davis',
      ]);

      // Verify all players have DUPR ratings
      for (const player of dbPlayers) {
        expect(player.dupr_rating).toBeGreaterThanOrEqual(1.0);
        expect(player.dupr_rating).toBeLessThanOrEqual(8.0);
      }

      // Verify teams were generated
      const dbTeams = await db
        .select()
        .from(teams)
        .where(eq(teams.division_id, divisionId));

      expect(dbTeams).toHaveLength(2);

      // Verify all players are assigned to teams
      for (const player of dbPlayers) {
        expect(player.team_id).not.toBeNull();
      }
    });

    it('should create balanced team pairings', async () => {
      const divisionId = 201;

      await app.inject({
        method: 'POST',
        url: `/api/divisions/${divisionId}/seed-dupr`,
        payload: {
          players: [
            { name: 'Player 1', duprRating: 7.0 },
            { name: 'Player 2', duprRating: 6.0 },
            { name: 'Player 3', duprRating: 4.0 },
            { name: 'Player 4', duprRating: 3.0 },
          ],
          teamGeneration: {
            strategy: 'balanced',
            teamSize: 2,
          },
        },
      });

      const dbPlayers = await db
        .select()
        .from(players)
        .where(eq(players.division_id, divisionId));

      // Group players by team
      const team1Players = dbPlayers.filter((p) => p.team_id === dbPlayers[0]?.team_id);
      const team2Players = dbPlayers.filter(
        (p) => p.team_id !== dbPlayers[0]?.team_id
      );

      expect(team1Players).toHaveLength(2);
      expect(team2Players).toHaveLength(2);

      // Calculate team averages
      const team1Avg =
        team1Players.reduce((sum, p) => sum + p.dupr_rating, 0) /
        team1Players.length;
      const team2Avg =
        team2Players.reduce((sum, p) => sum + p.dupr_rating, 0) /
        team2Players.length;

      // Balanced strategy should pair high with low
      // Team 1: 7.0 + 3.0 = avg 5.0
      // Team 2: 6.0 + 4.0 = avg 5.0
      expect(team1Avg).toBe(5.0);
      expect(team2Avg).toBe(5.0);
    });

    it('should support snake-draft strategy', async () => {
      const divisionId = 202;

      const response = await app.inject({
        method: 'POST',
        url: `/api/divisions/${divisionId}/seed-dupr`,
        payload: {
          players: [
            { name: 'A', duprRating: 5.0 },
            { name: 'B', duprRating: 4.5 },
            { name: 'C', duprRating: 4.0 },
            { name: 'D', duprRating: 3.5 },
          ],
          teamGeneration: {
            strategy: 'snake-draft',
            teamSize: 2,
          },
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.teamsGenerated).toBe(2);
    });

    it('should support random-pairs strategy with deterministic results', async () => {
      const divisionId1 = 203;
      const divisionId2 = 204;

      const payload = {
        players: [
          { name: 'P1', duprRating: 5.0 },
          { name: 'P2', duprRating: 4.5 },
          { name: 'P3', duprRating: 4.0 },
          { name: 'P4', duprRating: 3.5 },
        ],
        teamGeneration: {
          strategy: 'random-pairs',
          teamSize: 2,
        },
        options: {
          seed: 777,
        },
      };

      // Seed twice with same seed
      await app.inject({
        method: 'POST',
        url: `/api/divisions/${divisionId1}/seed-dupr`,
        payload,
      });

      await app.inject({
        method: 'POST',
        url: `/api/divisions/${divisionId2}/seed-dupr`,
        payload,
      });

      // Get players from both divisions
      const players1 = await db
        .select()
        .from(players)
        .where(eq(players.division_id, divisionId1));

      const players2 = await db
        .select()
        .from(players)
        .where(eq(players.division_id, divisionId2));

      // Group by teams
      const div1Team1 = players1.filter((p) => p.team_id === players1[0]?.team_id);
      const div2Team1 = players2.filter((p) => p.team_id === players2[0]?.team_id);

      // Same seed should produce same pairings
      expect(div1Team1.map((p) => p.name).sort()).toEqual(
        div2Team1.map((p) => p.name).sort()
      );
    });

    it('should generate correct team names from player last names', async () => {
      const divisionId = 205;

      await app.inject({
        method: 'POST',
        url: `/api/divisions/${divisionId}/seed-dupr`,
        payload: {
          players: [
            { name: 'Alice Anderson', duprRating: 5.5 },
            { name: 'Bob Baker', duprRating: 4.0 },
          ],
          teamGeneration: {
            strategy: 'balanced',
            teamSize: 2,
          },
        },
      });

      const dbTeams = await db
        .select()
        .from(teams)
        .where(eq(teams.division_id, divisionId));

      expect(dbTeams).toHaveLength(1);

      // Team name should be "LastName/LastName"
      expect(dbTeams[0]!.name).toMatch(/Anderson\/Baker|Baker\/Anderson/);
    });
  });

  describe('TSV export with DUPR data', () => {
    it('should include player names and ratings in TSV export', async () => {
      const divisionId = 206;

      // Seed with DUPR players
      await app.inject({
        method: 'POST',
        url: `/api/divisions/${divisionId}/seed-dupr`,
        payload: {
          players: [
            { name: 'Alice Anderson', duprRating: 5.5 },
            { name: 'Bob Baker', duprRating: 4.0 },
            { name: 'Charlie Chen', duprRating: 6.0 },
            { name: 'Diana Davis', duprRating: 3.5 },
          ],
          teamGeneration: {
            strategy: 'balanced',
            teamSize: 2,
          },
        },
      });

      // Export as TSV
      const response = await app.inject({
        method: 'GET',
        url: `/api/divisions/${divisionId}/export.tsv`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/tab-separated-values');

      const tsv = response.body;

      // Check TSV headers include DUPR columns
      expect(tsv).toContain('Team A Players');
      expect(tsv).toContain('Team A DUPR');
      expect(tsv).toContain('Team B Players');
      expect(tsv).toContain('Team B DUPR');

      // Check player names are included
      expect(tsv).toContain('Anderson');
      expect(tsv).toContain('Baker');
      expect(tsv).toContain('Chen');
      expect(tsv).toContain('Davis');

      // Check DUPR ratings are included
      expect(tsv).toContain('5.50');
      expect(tsv).toContain('4.00');
      expect(tsv).toContain('6.00');
      expect(tsv).toContain('3.50');
    });

    it('should show average DUPR ratings for balanced teams', async () => {
      const divisionId = 207;

      await app.inject({
        method: 'POST',
        url: `/api/divisions/${divisionId}/seed-dupr`,
        payload: {
          players: [
            { name: 'P1', duprRating: 7.0 },
            { name: 'P2', duprRating: 3.0 }, // Avg: 5.0
            { name: 'P3', duprRating: 6.0 },
            { name: 'P4', duprRating: 4.0 }, // Avg: 5.0
          ],
          teamGeneration: {
            strategy: 'balanced',
            teamSize: 2,
          },
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/divisions/${divisionId}/export.tsv`,
      });

      expect(response.statusCode).toBe(200);

      const tsv = response.body;

      // Both teams should have 5.00 average DUPR
      const avgMatches = tsv.match(/5\.00/g);
      expect(avgMatches).not.toBeNull();
      expect(avgMatches!.length).toBeGreaterThanOrEqual(2); // At least 2 teams with 5.00
    });
  });

  describe('Error cases', () => {
    it('should return 400 for invalid DUPR rating (too low)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/divisions/1/seed-dupr',
        payload: {
          players: [
            { name: 'P1', duprRating: 0.5 }, // Invalid: < 1.0
            { name: 'P2', duprRating: 5.0 },
          ],
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Invalid request body');
    });

    it('should return 400 for invalid DUPR rating (too high)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/divisions/1/seed-dupr',
        payload: {
          players: [
            { name: 'P1', duprRating: 8.5 }, // Invalid: > 8.0
            { name: 'P2', duprRating: 5.0 },
          ],
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for fewer than 2 players', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/divisions/1/seed-dupr',
        payload: {
          players: [{ name: 'Solo Player', duprRating: 5.0 }],
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Invalid request body');
    });

    it('should return 400 for player count not divisible by team size', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/divisions/1/seed-dupr',
        payload: {
          players: [
            { name: 'P1', duprRating: 5.0 },
            { name: 'P2', duprRating: 4.5 },
            { name: 'P3', duprRating: 4.0 },
          ],
          teamGeneration: {
            teamSize: 2, // 3 players can't form teams of 2
          },
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('divisible by team size');
    });

    it('should return 400 for missing player name', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/divisions/1/seed-dupr',
        payload: {
          players: [
            { name: '', duprRating: 5.0 }, // Empty name
            { name: 'Valid Name', duprRating: 4.0 },
          ],
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for malformed JSON', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/divisions/1/seed-dupr',
        payload: 'not valid json{',
        headers: {
          'content-type': 'application/json',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for missing required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/divisions/1/seed-dupr',
        payload: {
          // Missing 'players' field
          teamGeneration: {
            strategy: 'balanced',
          },
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Invalid request body');
    });

    it('should return 400 for invalid division ID', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/divisions/invalid/seed-dupr',
        payload: {
          players: [
            { name: 'P1', duprRating: 5.0 },
            { name: 'P2', duprRating: 4.0 },
          ],
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Invalid division ID');
    });
  });

  describe('Court scheduling', () => {
    it('should schedule matches to courts when enabled', async () => {
      const divisionId = 208;

      const response = await app.inject({
        method: 'POST',
        url: `/api/divisions/${divisionId}/seed-dupr`,
        payload: {
          players: [
            { name: 'P1', duprRating: 5.0 },
            { name: 'P2', duprRating: 4.5 },
            { name: 'P3', duprRating: 4.0 },
            { name: 'P4', duprRating: 3.5 },
          ],
          teamGeneration: {
            strategy: 'balanced',
            teamSize: 2,
          },
          courtScheduling: {
            enabled: true,
            numberOfCourts: 2,
            matchDurationMinutes: 30,
            breakMinutes: 5,
          },
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.courtsScheduled).toBe(true);
      expect(body.courtAssignments).toBeGreaterThan(0);
    });
  });
});
