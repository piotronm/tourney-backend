import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  generateRoundRobinMatches,
  generateRoundRobinForPool,
  calculateTotalMatches,
  createSeededRNG,
  preprocessTeams,
  assignToPools,
} from '../index.js';
import type { InputTeam, Pool } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadFixture(filename: string): any {
  const path = join(__dirname, '__fixtures__', filename);
  const content = readFileSync(path, 'utf-8');
  return JSON.parse(content);
}

describe('Round Robin Generation', () => {
  describe('generateRoundRobinForPool', () => {
    it('should generate correct matches for even number of teams (4 teams)', () => {
      const pool: Pool = {
        id: 1,
        name: 'Pool A',
        teamIds: [1, 2, 3, 4],
      };

      const matches = generateRoundRobinForPool(pool, 1);

      // 4 teams = 6 matches total (4 choose 2)
      expect(matches).toHaveLength(6);

      // Check each team plays 3 matches
      const teamMatches = new Map<number, number>();
      for (const match of matches) {
        teamMatches.set(match.teamAId, (teamMatches.get(match.teamAId) ?? 0) + 1);
        if (match.teamBId !== null) {
          teamMatches.set(match.teamBId, (teamMatches.get(match.teamBId) ?? 0) + 1);
        }
      }

      expect(teamMatches.get(1)).toBe(3);
      expect(teamMatches.get(2)).toBe(3);
      expect(teamMatches.get(3)).toBe(3);
      expect(teamMatches.get(4)).toBe(3);

      // Verify all matches are pending
      expect(matches.every((m) => m.status === 'pending')).toBe(true);
    });

    it('should generate correct matches for odd number of teams (3 teams)', () => {
      const pool: Pool = {
        id: 1,
        name: 'Pool A',
        teamIds: [1, 2, 3],
      };

      const matches = generateRoundRobinForPool(pool, 1);

      // 3 teams = 3 matches total (3 choose 2)
      expect(matches).toHaveLength(3);

      // Verify no BYE matches (teamBId should never be null for real teams)
      expect(matches.every((m) => m.teamBId !== null)).toBe(true);

      // Check each team plays 2 matches
      const teamMatches = new Map<number, number>();
      for (const match of matches) {
        teamMatches.set(match.teamAId, (teamMatches.get(match.teamAId) ?? 0) + 1);
        if (match.teamBId !== null) {
          teamMatches.set(match.teamBId, (teamMatches.get(match.teamBId) ?? 0) + 1);
        }
      }

      expect(teamMatches.get(1)).toBe(2);
      expect(teamMatches.get(2)).toBe(2);
      expect(teamMatches.get(3)).toBe(2);
    });

    it('should handle single team (no matches)', () => {
      const pool: Pool = {
        id: 1,
        name: 'Pool A',
        teamIds: [1],
      };

      const matches = generateRoundRobinForPool(pool, 1);
      expect(matches).toHaveLength(0);
    });

    it('should assign correct pool IDs and round numbers', () => {
      const pool: Pool = {
        id: 5,
        name: 'Pool E',
        teamIds: [10, 20, 30, 40],
      };

      const matches = generateRoundRobinForPool(pool, 100);

      // All matches should have poolId = 5
      expect(matches.every((m) => m.poolId === 5)).toBe(true);

      // Should have 3 rounds (n-1 for even teams)
      const rounds = new Set(matches.map((m) => m.round));
      expect(rounds.size).toBe(3);
      expect(Array.from(rounds).sort()).toEqual([1, 2, 3]);

      // Match numbers should start from 100
      expect(matches[0]?.matchNumber).toBe(100);
      expect(matches[matches.length - 1]?.matchNumber).toBe(105);
    });
  });

  describe('generateRoundRobinMatches', () => {
    it('should match fixture output for even teams', () => {
      const inputTeams: InputTeam[] = loadFixture('inputs.even-teams.json');
      const expectedMatches = loadFixture('outputs.even-teams.matches.json');

      const rng = createSeededRNG(12345);
      const teams = preprocessTeams(inputTeams, rng, false);
      const pools = assignToPools(teams, 1, 'respect-input');
      const matches = generateRoundRobinMatches(pools);

      expect(matches).toHaveLength(expectedMatches.length);
      expect(matches).toEqual(expectedMatches);
    });

    it('should match fixture output for odd teams', () => {
      const inputTeams: InputTeam[] = loadFixture('inputs.odd-teams.json');
      const expectedMatches = loadFixture('outputs.odd-teams.matches.json');

      const rng = createSeededRNG(12345);
      const teams = preprocessTeams(inputTeams, rng, false);
      const pools = assignToPools(teams, 1, 'respect-input');
      const matches = generateRoundRobinMatches(pools);

      expect(matches).toHaveLength(expectedMatches.length);
      expect(matches).toEqual(expectedMatches);
    });

    it('should match fixture output for multiple pools', () => {
      const inputTeams: InputTeam[] = loadFixture('inputs.multiple-pools.json');
      const expectedMatches = loadFixture('outputs.multiple-pools.matches.json');

      const rng = createSeededRNG(12345);
      const teams = preprocessTeams(inputTeams, rng, false);
      const pools = assignToPools(teams, 2, 'respect-input');
      const matches = generateRoundRobinMatches(pools);

      expect(matches).toHaveLength(expectedMatches.length);
      expect(matches).toEqual(expectedMatches);
    });

    it('should generate matches for multiple pools', () => {
      const pools: Pool[] = [
        { id: 1, name: 'Pool A', teamIds: [1, 2, 3] },
        { id: 2, name: 'Pool B', teamIds: [4, 5, 6, 7] },
      ];

      const matches = generateRoundRobinMatches(pools);

      // Pool A: 3 teams = 3 matches
      // Pool B: 4 teams = 6 matches
      // Total: 9 matches
      expect(matches).toHaveLength(9);

      // Check pool IDs
      const pool1Matches = matches.filter((m) => m.poolId === 1);
      const pool2Matches = matches.filter((m) => m.poolId === 2);
      expect(pool1Matches).toHaveLength(3);
      expect(pool2Matches).toHaveLength(6);

      // Check match numbers are sequential
      expect(matches[0]?.matchNumber).toBe(1);
      expect(matches[matches.length - 1]?.matchNumber).toBe(9);
    });
  });

  describe('calculateTotalMatches', () => {
    it('should calculate correct match counts', () => {
      expect(calculateTotalMatches(2)).toBe(1); // 2 choose 2 = 1
      expect(calculateTotalMatches(3)).toBe(3); // 3 choose 2 = 3
      expect(calculateTotalMatches(4)).toBe(6); // 4 choose 2 = 6
      expect(calculateTotalMatches(5)).toBe(10); // 5 choose 2 = 10
      expect(calculateTotalMatches(6)).toBe(15); // 6 choose 2 = 15
      expect(calculateTotalMatches(8)).toBe(28); // 8 choose 2 = 28
    });

    it('should return 0 for invalid team counts', () => {
      expect(calculateTotalMatches(0)).toBe(0);
      expect(calculateTotalMatches(1)).toBe(0);
    });
  });

  describe('Determinism', () => {
    it('should generate identical matches with same seed', () => {
      const inputTeams: InputTeam[] = [
        { name: 'Team A' },
        { name: 'Team B' },
        { name: 'Team C' },
        { name: 'Team D' },
      ];

      const seed = 999;

      // Generate first set
      const rng1 = createSeededRNG(seed);
      const teams1 = preprocessTeams(inputTeams, rng1, true);
      const pools1 = assignToPools(teams1, 1, 'balanced');
      const matches1 = generateRoundRobinMatches(pools1);

      // Generate second set with same seed
      const rng2 = createSeededRNG(seed);
      const teams2 = preprocessTeams(inputTeams, rng2, true);
      const pools2 = assignToPools(teams2, 1, 'balanced');
      const matches2 = generateRoundRobinMatches(pools2);

      expect(teams1).toEqual(teams2);
      expect(pools1).toEqual(pools2);
      expect(matches1).toEqual(matches2);
    });

    it('should generate different matches with different seeds', () => {
      const inputTeams: InputTeam[] = [
        { name: 'Team A' },
        { name: 'Team B' },
        { name: 'Team C' },
        { name: 'Team D' },
      ];

      // Generate with seed 1
      const rng1 = createSeededRNG(1);
      const teams1 = preprocessTeams(inputTeams, rng1, true);

      // Generate with seed 2
      const rng2 = createSeededRNG(2);
      const teams2 = preprocessTeams(inputTeams, rng2, true);

      // Teams should be shuffled differently
      expect(teams1).not.toEqual(teams2);
    });
  });
});
