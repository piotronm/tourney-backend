import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import seedRoute from '../routes/seed.js';
import exportCsvRoute from '../routes/exportCsv.js';

describe('GET /api/divisions/:id/export.csv', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(seedRoute, { prefix: '/api' });
    await app.register(exportCsvRoute, { prefix: '/api' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should export tournament data as CSV', async () => {
    const divisionId = 10;

    // First seed the tournament
    await app.inject({
      method: 'POST',
      url: `/api/divisions/${divisionId}/seed`,
      payload: {
        teams: [
          { name: 'Team Alpha' },
          { name: 'Team Beta' },
          { name: 'Team Gamma' },
        ],
        maxPools: 1,
        options: {
          seed: 12345,
        },
      },
    });

    // Export as CSV
    const response = await app.inject({
      method: 'GET',
      url: `/api/divisions/${divisionId}/export.csv`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain(
      'attachment; filename='
    );

    const csv = response.body;

    // Check CSV headers
    expect(csv).toContain('Pool,Round,Match,TeamA,ScoreA,ScoreB,TeamB,Status');

    // Check data rows (3 teams = 3 matches)
    const lines = csv.split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(4); // Header + 3 matches

    // Verify CSV contains team names
    expect(csv).toContain('Team Alpha');
    expect(csv).toContain('Team Beta');
    expect(csv).toContain('Team Gamma');

    // Verify pool name
    expect(csv).toContain('Pool A');

    // Verify status
    expect(csv).toContain('pending');
  });

  it('should export multiple pools correctly', async () => {
    const divisionId = 11;

    // Seed with multiple pools
    await app.inject({
      method: 'POST',
      url: `/api/divisions/${divisionId}/seed`,
      payload: {
        teams: [
          { name: 'Pool1-T1', poolId: 1 },
          { name: 'Pool1-T2', poolId: 1 },
          { name: 'Pool1-T3', poolId: 1 },
          { name: 'Pool2-T1', poolId: 2 },
          { name: 'Pool2-T2', poolId: 2 },
          { name: 'Pool2-T3', poolId: 2 },
        ],
        maxPools: 2,
        options: {
          poolStrategy: 'respect-input',
        },
      },
    });

    // Export
    const response = await app.inject({
      method: 'GET',
      url: `/api/divisions/${divisionId}/export.csv`,
    });

    expect(response.statusCode).toBe(200);

    const csv = response.body;

    // Should have both pools
    expect(csv).toContain('Pool A');
    expect(csv).toContain('Pool B');

    // Count matches: 2 pools × 3 teams each = 2 × 3 = 6 matches total
    const lines = csv.split('\n').filter((line) => line.trim().length > 0);
    expect(lines.length).toBe(7); // 1 header + 6 matches
  });

  it('should handle special characters in team names', async () => {
    const divisionId = 12;

    await app.inject({
      method: 'POST',
      url: `/api/divisions/${divisionId}/seed`,
      payload: {
        teams: [
          { name: 'Team "Quoted"' },
          { name: 'Team, Comma' },
          { name: 'Team Normal' },
        ],
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/divisions/${divisionId}/export.csv`,
    });

    expect(response.statusCode).toBe(200);

    const csv = response.body;

    // Quoted team name should be escaped
    expect(csv).toContain('"Team ""Quoted"""');

    // Comma team name should be wrapped in quotes
    expect(csv).toContain('"Team, Comma"');
  });

  it('should return 404 for non-existent division', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/divisions/99999/export.csv',
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Division not found');
  });

  it('should return 400 for invalid division ID', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/divisions/invalid/export.csv',
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Invalid division ID');
  });

  it('should export with proper CSV escaping', async () => {
    const divisionId = 13;

    await app.inject({
      method: 'POST',
      url: `/api/divisions/${divisionId}/seed`,
      payload: {
        teams: [
          { name: 'Team\nNewline' },
          { name: 'Team Normal' },
        ],
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/divisions/${divisionId}/export.csv`,
    });

    expect(response.statusCode).toBe(200);

    const csv = response.body;

    // Newline in field should be wrapped in quotes
    expect(csv).toContain('"Team\nNewline"');
  });

  it('should include correct match numbers and rounds', async () => {
    const divisionId = 14;

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
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/divisions/${divisionId}/export.csv`,
    });

    expect(response.statusCode).toBe(200);

    const csv = response.body;
    const lines = csv.split('\n');

    // Check that round numbers are present
    expect(csv).toMatch(/,1,/); // Round 1
    expect(csv).toMatch(/,2,/); // Round 2
    expect(csv).toMatch(/,3,/); // Round 3

    // 4 teams should have 6 matches (match numbers 1-6)
    for (let i = 1; i <= 6; i++) {
      expect(csv).toContain(`,${i},`);
    }
  });

  it('should include empty scores for pending matches', async () => {
    const divisionId = 15;

    await app.inject({
      method: 'POST',
      url: `/api/divisions/${divisionId}/seed`,
      payload: {
        teams: [
          { name: 'Team A' },
          { name: 'Team B' },
        ],
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/divisions/${divisionId}/export.csv`,
    });

    expect(response.statusCode).toBe(200);

    const csv = response.body;

    // Pending matches should have empty score fields
    // Format: TeamA,,,TeamB (three commas = two empty score fields)
    expect(csv).toMatch(/Team A,,,Team B/);
  });
});
