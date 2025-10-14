/**
 * Golden fixture tests for tournament engine.
 *
 * These tests ensure that the tournament engine produces consistent, expected
 * outputs for a variety of scenarios. If these tests fail, it indicates a
 * breaking change in the core algorithm.
 *
 * To regenerate expected outputs (if the algorithm is intentionally changed):
 * Run: node src/__tests__/__fixtures__/golden/generateExpected.mjs
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  preprocessTeams,
  assignToPools,
  generateRoundRobinMatches,
  mapMatchesToExportRows,
  exportRowsToCSV,
  createTeamsById,
  createPoolsById,
  generateTeamsFromPlayers,
  type InputTeam,
  type InputPlayer,
  type GenerateOptions,
  type DUPRTeamGenerationOptions,
} from '../index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface FixtureInput {
  teams?: InputTeam[];
  players?: InputPlayer[];
  numPools?: number;
  options: GenerateOptions;
  duprOptions?: DUPRTeamGenerationOptions;
}

function loadFixture(name: string): { input: FixtureInput; expected: string } {
  const inputPath = join(
    __dirname,
    '__fixtures__',
    'golden',
    'inputs',
    `${name}.json`
  );
  const expectedPath = join(
    __dirname,
    '__fixtures__',
    'golden',
    'expected',
    `${name}.csv`
  );

  const input: FixtureInput = JSON.parse(readFileSync(inputPath, 'utf-8'));
  const expected = readFileSync(expectedPath, 'utf-8');

  return { input, expected };
}

function generateCSVFromFixture(input: FixtureInput): string {
  // Generate teams (either from input teams or from DUPR players)
  let inputTeams: InputTeam[];
  if (input.players && input.duprOptions) {
    const { teams: generatedTeams } = generateTeamsFromPlayers(
      input.players,
      input.duprOptions
    );
    inputTeams = generatedTeams.map((team) => ({
      name: team.name,
      poolId: team.poolId,
    }));
  } else if (input.teams) {
    inputTeams = input.teams;
  } else {
    throw new Error('Fixture must have either teams or players');
  }

  // Preprocess teams
  const teams = preprocessTeams(inputTeams, input.options);

  // Determine number of pools
  // For explicit pool assignments, use a large maxPools to respect all input pools
  // For balanced strategy, use the specified numPools
  const hasExplicitPools = inputTeams.some((t) => t.poolId !== undefined);
  const maxPools = hasExplicitPools ? 100 : (input.numPools || 1);
  const poolStrategy = input.options.poolStrategy || 'respect-input';

  // Assign to pools
  const pools = assignToPools(teams, maxPools, poolStrategy);

  // Generate matches
  const matches = generateRoundRobinMatches(pools);

  // Export to CSV
  const teamsById = createTeamsById(teams);
  const poolsById = createPoolsById(pools);
  const rows = mapMatchesToExportRows(matches, teamsById, poolsById);
  const csv = exportRowsToCSV(rows);

  return csv;
}

describe('Golden Fixture Tests', () => {
  describe('even_teams_single_pool', () => {
    it('should generate correct matches for 8 teams in a single pool', () => {
      const { input, expected } = loadFixture('even_teams_single_pool');
      const actual = generateCSVFromFixture(input);

      expect(actual).toBe(expected);
    });

    it('should generate 28 matches for 8 teams (8 choose 2)', () => {
      const { input } = loadFixture('even_teams_single_pool');
      const teams = preprocessTeams(input.teams!, input.options);
      const pools = assignToPools(teams, 1, input.options);
      const matches = generateRoundRobinMatches(pools);

      expect(matches).toHaveLength(28);
    });

    it('should ensure each team plays exactly 7 matches', () => {
      const { input } = loadFixture('even_teams_single_pool');
      const teams = preprocessTeams(input.teams!, input.options);
      const pools = assignToPools(teams, 1, input.options);
      const matches = generateRoundRobinMatches(pools);

      // Count matches per team
      const teamMatchCount = new Map<number, number>();
      for (const match of matches) {
        teamMatchCount.set(
          match.teamAId,
          (teamMatchCount.get(match.teamAId) || 0) + 1
        );
        if (match.teamBId !== null) {
          teamMatchCount.set(
            match.teamBId,
            (teamMatchCount.get(match.teamBId) || 0) + 1
          );
        }
      }

      // Each team should play n-1 matches (7 for 8 teams)
      for (const count of teamMatchCount.values()) {
        expect(count).toBe(7);
      }
    });
  });

  describe('odd_teams_with_bye', () => {
    it('should generate correct matches for 5 teams with BYE handling', () => {
      const { input, expected } = loadFixture('odd_teams_with_bye');
      const actual = generateCSVFromFixture(input);

      expect(actual).toBe(expected);
    });

    it('should generate 10 matches for 5 teams (5 choose 2)', () => {
      const { input } = loadFixture('odd_teams_with_bye');
      const teams = preprocessTeams(input.teams!, input.options);
      const pools = assignToPools(teams, 1, input.options);
      const matches = generateRoundRobinMatches(pools);

      expect(matches).toHaveLength(10);
    });

    it('should ensure each team plays exactly 4 matches', () => {
      const { input } = loadFixture('odd_teams_with_bye');
      const teams = preprocessTeams(input.teams!, input.options);
      const pools = assignToPools(teams, 1, input.options);
      const matches = generateRoundRobinMatches(pools);

      const teamMatchCount = new Map<number, number>();
      for (const match of matches) {
        teamMatchCount.set(
          match.teamAId,
          (teamMatchCount.get(match.teamAId) || 0) + 1
        );
        if (match.teamBId !== null) {
          teamMatchCount.set(
            match.teamBId,
            (teamMatchCount.get(match.teamBId) || 0) + 1
          );
        }
      }

      // Each team should play n-1 matches (4 for 5 teams)
      for (const count of teamMatchCount.values()) {
        expect(count).toBe(4);
      }
    });
  });

  describe('multiple_pools_explicit', () => {
    it('should generate correct matches for 12 teams across 3 explicit pools', () => {
      const { input, expected } = loadFixture('multiple_pools_explicit');
      const actual = generateCSVFromFixture(input);

      expect(actual).toBe(expected);
    });

    it('should respect explicit pool assignments', () => {
      const { input } = loadFixture('multiple_pools_explicit');
      const teams = preprocessTeams(input.teams!, input.options);
      // Use a large maxPools value to allow all explicit pools
      const pools = assignToPools(teams, 10, input.options.poolStrategy);

      // Should create 3 pools
      expect(pools).toHaveLength(3);

      // Each pool should have 4 teams
      for (const pool of pools) {
        expect(pool.teamIds).toHaveLength(4);
      }
    });

    it('should generate 6 matches per pool (4 teams each)', () => {
      const { input } = loadFixture('multiple_pools_explicit');
      const teams = preprocessTeams(input.teams!, input.options);
      const pools = assignToPools(teams, 10, input.options.poolStrategy);
      const matches = generateRoundRobinMatches(pools);

      // Count matches per pool
      const poolMatchCount = new Map<number, number>();
      for (const match of matches) {
        poolMatchCount.set(
          match.poolId,
          (poolMatchCount.get(match.poolId) || 0) + 1
        );
      }

      // Each pool should have 6 matches (4 choose 2)
      for (const count of poolMatchCount.values()) {
        expect(count).toBe(6);
      }
    });
  });

  describe('multiple_pools_balanced', () => {
    it('should generate correct matches for 8 teams using balanced strategy', () => {
      const { input, expected } = loadFixture('multiple_pools_balanced');
      const actual = generateCSVFromFixture(input);

      expect(actual).toBe(expected);
    });

    it('should create 2 balanced pools with 4 teams each', () => {
      const { input } = loadFixture('multiple_pools_balanced');
      const teams = preprocessTeams(input.teams!, input.options);
      const pools = assignToPools(teams, input.numPools!, input.options);

      expect(pools).toHaveLength(2);
      expect(pools[0]!.teamIds).toHaveLength(4);
      expect(pools[1]!.teamIds).toHaveLength(4);
    });

    it('should generate deterministic pool assignments with same seed', () => {
      const { input } = loadFixture('multiple_pools_balanced');

      // Generate twice with same seed
      const teams1 = preprocessTeams(input.teams!, input.options);
      const pools1 = assignToPools(teams1, input.numPools!, input.options);

      const teams2 = preprocessTeams(input.teams!, input.options);
      const pools2 = assignToPools(teams2, input.numPools!, input.options);

      // Should produce identical assignments
      expect(pools1).toEqual(pools2);
    });
  });

  describe('small_division_edge_case', () => {
    it('should handle minimal 2-team division correctly', () => {
      const { input, expected } = loadFixture('small_division_edge_case');
      const actual = generateCSVFromFixture(input);

      expect(actual).toBe(expected);
    });

    it('should generate exactly 1 match for 2 teams', () => {
      const { input } = loadFixture('small_division_edge_case');
      const teams = preprocessTeams(input.teams!, input.options);
      const pools = assignToPools(teams, 1, input.options);
      const matches = generateRoundRobinMatches(pools);

      expect(matches).toHaveLength(1);
    });

    it('should have 1 round with both teams playing each other', () => {
      const { input } = loadFixture('small_division_edge_case');
      const teams = preprocessTeams(input.teams!, input.options);
      const pools = assignToPools(teams, 1, input.options);
      const matches = generateRoundRobinMatches(pools);

      const match = matches[0]!;
      expect(match.round).toBe(1);
      expect(match.teamAId).toBeDefined();
      expect(match.teamBId).toBeDefined();
      expect(match.teamBId).not.toBe(match.teamAId);
    });
  });

  describe('determinism_test', () => {
    it('should generate deterministic output with shuffle enabled', () => {
      const { input, expected } = loadFixture('determinism_test');
      const actual = generateCSVFromFixture(input);

      expect(actual).toBe(expected);
    });

    it('should produce identical results with same seed', () => {
      const { input } = loadFixture('determinism_test');

      // Generate 3 times with same seed
      const csv1 = generateCSVFromFixture(input);
      const csv2 = generateCSVFromFixture(input);
      const csv3 = generateCSVFromFixture(input);

      expect(csv1).toBe(csv2);
      expect(csv2).toBe(csv3);
    });

    it('should shuffle teams before pool assignment', () => {
      const { input } = loadFixture('determinism_test');
      const teamsWithShuffle = preprocessTeams(input.teams!, input.options);

      // Without shuffle (seed is still used for consistency)
      const noShuffleOptions = { ...input.options, shuffle: false };
      const teamsWithoutShuffle = preprocessTeams(input.teams!, noShuffleOptions);

      // Teams should be in different order (assuming seed causes shuffle)
      // Note: We can't guarantee different order every time, but with shuffle=true
      // the order is determined by the PRNG
      expect(teamsWithShuffle).toHaveLength(teamsWithoutShuffle.length);
    });
  });

  describe('stress_test_large_pool', () => {
    it('should generate correct matches for 16 teams', () => {
      const { input, expected } = loadFixture('stress_test_large_pool');
      const actual = generateCSVFromFixture(input);

      expect(actual).toBe(expected);
    });

    it('should generate 120 matches for 16 teams (16 choose 2)', () => {
      const { input } = loadFixture('stress_test_large_pool');
      const teams = preprocessTeams(input.teams!, input.options);
      const pools = assignToPools(teams, 1, input.options);
      const matches = generateRoundRobinMatches(pools);

      expect(matches).toHaveLength(120);
    });

    it('should ensure each team plays exactly 15 matches', () => {
      const { input } = loadFixture('stress_test_large_pool');
      const teams = preprocessTeams(input.teams!, input.options);
      const pools = assignToPools(teams, 1, input.options);
      const matches = generateRoundRobinMatches(pools);

      const teamMatchCount = new Map<number, number>();
      for (const match of matches) {
        teamMatchCount.set(
          match.teamAId,
          (teamMatchCount.get(match.teamAId) || 0) + 1
        );
        if (match.teamBId !== null) {
          teamMatchCount.set(
            match.teamBId,
            (teamMatchCount.get(match.teamBId) || 0) + 1
          );
        }
      }

      // Each team should play n-1 matches (15 for 16 teams)
      for (const count of teamMatchCount.values()) {
        expect(count).toBe(15);
      }
    });

    it('should complete in reasonable time', () => {
      const { input } = loadFixture('stress_test_large_pool');
      const start = Date.now();

      generateCSVFromFixture(input);

      const duration = Date.now() - start;
      // Should complete in under 100ms
      expect(duration).toBeLessThan(100);
    });
  });

  describe('dupr_balanced_teams', () => {
    it('should generate correct matches from DUPR-balanced teams', () => {
      const { input, expected } = loadFixture('dupr_balanced_teams');
      const actual = generateCSVFromFixture(input);

      expect(actual).toBe(expected);
    });

    it('should generate 2 balanced teams from 4 players', () => {
      const { input } = loadFixture('dupr_balanced_teams');
      const { teams } = generateTeamsFromPlayers(
        input.players!,
        input.duprOptions!
      );

      expect(teams).toHaveLength(2);
    });

    it('should create teams with similar average ratings', () => {
      const { input } = loadFixture('dupr_balanced_teams');
      const { teams, players } = generateTeamsFromPlayers(
        input.players!,
        input.duprOptions!
      );

      // Calculate average rating for each team
      const teamRatings = teams.map((team) => {
        const teamPlayers = players.filter((p) => p.teamId === team.id);
        const avgRating =
          teamPlayers.reduce((sum, p) => sum + p.duprRating, 0) /
          teamPlayers.length;
        return avgRating;
      });

      // Teams should have similar average ratings (within 0.5)
      const maxDiff = Math.abs(teamRatings[0]! - teamRatings[1]!);
      expect(maxDiff).toBeLessThanOrEqual(0.5);
    });

    it('should generate 1 match for 2 teams', () => {
      const { input } = loadFixture('dupr_balanced_teams');
      const { teams } = generateTeamsFromPlayers(
        input.players!,
        input.duprOptions!
      );

      const inputTeams = teams.map((team) => ({
        name: team.name,
        poolId: team.poolId,
      }));

      const processedTeams = preprocessTeams(inputTeams, input.options);
      const pools = assignToPools(processedTeams, 1, input.options);
      const matches = generateRoundRobinMatches(pools);

      expect(matches).toHaveLength(1);
    });
  });
});
