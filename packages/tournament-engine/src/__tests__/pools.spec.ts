/**
 * Unit tests for pool assignment strategies.
 * Tests both "respect-input" and "balanced" strategies with various edge cases.
 */

import { describe, it, expect } from 'vitest';
import { assignToPools, generatePoolName, createPoolNameMap } from '../pools.js';
import type { Team } from '../types.js';

describe('Pool Assignment', () => {
  describe('respect-input strategy', () => {
    describe('with pre-assigned poolId values', () => {
      it('should honor pre-assigned poolId values', () => {
        const teams: Team[] = [
          { id: 1, name: 'Team A', poolId: 1 },
          { id: 2, name: 'Team B', poolId: 1 },
          { id: 3, name: 'Team C', poolId: 2 },
          { id: 4, name: 'Team D', poolId: 2 },
          { id: 5, name: 'Team E', poolId: 3 },
          { id: 6, name: 'Team F', poolId: 3 },
        ];

        const pools = assignToPools(teams, 10, 'respect-input');

        expect(pools).toHaveLength(3);
        expect(pools[0]).toEqual({
          id: 1,
          name: 'Pool A',
          teamIds: [1, 2],
        });
        expect(pools[1]).toEqual({
          id: 2,
          name: 'Pool B',
          teamIds: [3, 4],
        });
        expect(pools[2]).toEqual({
          id: 3,
          name: 'Pool C',
          teamIds: [5, 6],
        });
      });

      it('should handle non-sequential poolId values', () => {
        const teams: Team[] = [
          { id: 1, name: 'Team A', poolId: 5 },
          { id: 2, name: 'Team B', poolId: 5 },
          { id: 3, name: 'Team C', poolId: 10 },
          { id: 4, name: 'Team D', poolId: 10 },
        ];

        const pools = assignToPools(teams, 10, 'respect-input');

        expect(pools).toHaveLength(2);
        // Pool IDs are reassigned sequentially, but teams are grouped by original poolId
        expect(pools[0]!.teamIds).toEqual([1, 2]);
        expect(pools[1]!.teamIds).toEqual([3, 4]);
      });

      it('should respect maxPools limit when poolIds exceed it', () => {
        const teams: Team[] = [
          { id: 1, name: 'Team A', poolId: 1 },
          { id: 2, name: 'Team B', poolId: 2 },
          { id: 3, name: 'Team C', poolId: 3 },
          { id: 4, name: 'Team D', poolId: 4 },
        ];

        const pools = assignToPools(teams, 2, 'respect-input');

        // Should only create first 2 pools based on sorted poolId values
        expect(pools).toHaveLength(2);
        expect(pools[0]!.teamIds).toEqual([1]);
        expect(pools[1]!.teamIds).toEqual([2]);
      });

      it('should default unassigned teams to pool 1 when some teams have poolId', () => {
        const teams: Team[] = [
          { id: 1, name: 'Team A', poolId: 2 },
          { id: 2, name: 'Team B' }, // No poolId
          { id: 3, name: 'Team C', poolId: 2 },
          { id: 4, name: 'Team D' }, // No poolId
        ];

        const pools = assignToPools(teams, 10, 'respect-input');

        expect(pools).toHaveLength(2);
        // Teams without poolId default to pool 1
        expect(pools[0]!.teamIds).toEqual([2, 4]);
        expect(pools[1]!.teamIds).toEqual([1, 3]);
      });

      it('should handle all teams in same pool', () => {
        const teams: Team[] = [
          { id: 1, name: 'Team A', poolId: 1 },
          { id: 2, name: 'Team B', poolId: 1 },
          { id: 3, name: 'Team C', poolId: 1 },
          { id: 4, name: 'Team D', poolId: 1 },
        ];

        const pools = assignToPools(teams, 10, 'respect-input');

        expect(pools).toHaveLength(1);
        expect(pools[0]).toEqual({
          id: 1,
          name: 'Pool A',
          teamIds: [1, 2, 3, 4],
        });
      });
    });

    describe('without pre-assigned poolId values', () => {
      it('should create single pool when no poolId specified', () => {
        const teams: Team[] = [
          { id: 1, name: 'Team A' },
          { id: 2, name: 'Team B' },
          { id: 3, name: 'Team C' },
          { id: 4, name: 'Team D' },
        ];

        const pools = assignToPools(teams, 10, 'respect-input');

        expect(pools).toHaveLength(1);
        expect(pools[0]).toEqual({
          id: 1,
          name: 'Pool A',
          teamIds: [1, 2, 3, 4],
        });
      });

      it('should put all teams in one pool regardless of maxPools', () => {
        const teams: Team[] = [
          { id: 1, name: 'Team A' },
          { id: 2, name: 'Team B' },
          { id: 3, name: 'Team C' },
          { id: 4, name: 'Team D' },
          { id: 5, name: 'Team E' },
          { id: 6, name: 'Team F' },
        ];

        const pools = assignToPools(teams, 3, 'respect-input');

        expect(pools).toHaveLength(1);
        expect(pools[0]!.teamIds).toHaveLength(6);
      });
    });
  });

  describe('balanced strategy', () => {
    describe('basic distribution', () => {
      it('should distribute 8 teams into 2 balanced pools (4 each)', () => {
        const teams: Team[] = [
          { id: 1, name: 'Team 1' },
          { id: 2, name: 'Team 2' },
          { id: 3, name: 'Team 3' },
          { id: 4, name: 'Team 4' },
          { id: 5, name: 'Team 5' },
          { id: 6, name: 'Team 6' },
          { id: 7, name: 'Team 7' },
          { id: 8, name: 'Team 8' },
        ];

        const pools = assignToPools(teams, 2, 'balanced');

        expect(pools).toHaveLength(2);
        expect(pools[0]).toEqual({
          id: 1,
          name: 'Pool A',
          teamIds: [1, 2, 3, 4],
        });
        expect(pools[1]).toEqual({
          id: 2,
          name: 'Pool B',
          teamIds: [5, 6, 7, 8],
        });
      });

      it('should distribute 9 teams into 3 pools (3 each)', () => {
        const teams: Team[] = [
          { id: 1, name: 'Team 1' },
          { id: 2, name: 'Team 2' },
          { id: 3, name: 'Team 3' },
          { id: 4, name: 'Team 4' },
          { id: 5, name: 'Team 5' },
          { id: 6, name: 'Team 6' },
          { id: 7, name: 'Team 7' },
          { id: 8, name: 'Team 8' },
          { id: 9, name: 'Team 9' },
        ];

        const pools = assignToPools(teams, 3, 'balanced');

        expect(pools).toHaveLength(3);
        expect(pools[0]!.teamIds).toHaveLength(3);
        expect(pools[1]!.teamIds).toHaveLength(3);
        expect(pools[2]!.teamIds).toHaveLength(3);
      });

      it('should handle uneven distribution (7 teams in 2 pools)', () => {
        const teams: Team[] = [
          { id: 1, name: 'Team 1' },
          { id: 2, name: 'Team 2' },
          { id: 3, name: 'Team 3' },
          { id: 4, name: 'Team 4' },
          { id: 5, name: 'Team 5' },
          { id: 6, name: 'Team 6' },
          { id: 7, name: 'Team 7' },
        ];

        const pools = assignToPools(teams, 2, 'balanced');

        expect(pools).toHaveLength(2);
        // First pool gets the extra team (4 teams)
        expect(pools[0]!.teamIds).toHaveLength(4);
        expect(pools[0]!.teamIds).toEqual([1, 2, 3, 4]);
        // Second pool gets 3 teams
        expect(pools[1]!.teamIds).toHaveLength(3);
        expect(pools[1]!.teamIds).toEqual([5, 6, 7]);
      });

      it('should distribute 10 teams into 3 pools (4, 3, 3)', () => {
        const teams: Team[] = Array.from({ length: 10 }, (_, i) => ({
          id: i + 1,
          name: `Team ${i + 1}`,
        }));

        const pools = assignToPools(teams, 3, 'balanced');

        expect(pools).toHaveLength(3);
        // First pool gets extra team (10 % 3 = 1 remainder)
        expect(pools[0]!.teamIds).toHaveLength(4);
        expect(pools[1]!.teamIds).toHaveLength(3);
        expect(pools[2]!.teamIds).toHaveLength(3);
      });
    });

    describe('minimum teams per pool constraint', () => {
      it('should enforce minimum 2 teams per pool', () => {
        const teams: Team[] = [
          { id: 1, name: 'Team 1' },
          { id: 2, name: 'Team 2' },
          { id: 3, name: 'Team 3' },
          { id: 4, name: 'Team 4' },
          { id: 5, name: 'Team 5' },
        ];

        // Request 4 pools, but only 2 pools possible with min 2 teams each
        const pools = assignToPools(teams, 4, 'balanced');

        expect(pools).toHaveLength(2);
        expect(pools[0]!.teamIds).toHaveLength(3);
        expect(pools[1]!.teamIds).toHaveLength(2);
      });

      it('should handle 5 teams with maxPools=3 appropriately', () => {
        const teams: Team[] = [
          { id: 1, name: 'Team 1' },
          { id: 2, name: 'Team 2' },
          { id: 3, name: 'Team 3' },
          { id: 4, name: 'Team 4' },
          { id: 5, name: 'Team 5' },
        ];

        const pools = assignToPools(teams, 3, 'balanced');

        // Can only create 2 pools (5 teams / 2 min per pool = 2 pools)
        expect(pools).toHaveLength(2);
        expect(pools[0]!.teamIds).toHaveLength(3);
        expect(pools[1]!.teamIds).toHaveLength(2);
      });

      it('should create 1 pool when maxPools too high for team count', () => {
        const teams: Team[] = [
          { id: 1, name: 'Team 1' },
          { id: 2, name: 'Team 2' },
          { id: 3, name: 'Team 3' },
        ];

        const pools = assignToPools(teams, 10, 'balanced');

        // Only 1 pool possible (3 teams / 2 min per pool = 1 pool)
        expect(pools).toHaveLength(1);
        expect(pools[0]!.teamIds).toEqual([1, 2, 3]);
      });

      it('should handle exactly 4 teams with maxPools=2', () => {
        const teams: Team[] = [
          { id: 1, name: 'Team 1' },
          { id: 2, name: 'Team 2' },
          { id: 3, name: 'Team 3' },
          { id: 4, name: 'Team 4' },
        ];

        const pools = assignToPools(teams, 2, 'balanced');

        expect(pools).toHaveLength(2);
        expect(pools[0]!.teamIds).toEqual([1, 2]);
        expect(pools[1]!.teamIds).toEqual([3, 4]);
      });
    });

    describe('edge cases', () => {
      it('should force single pool when < 4 teams total', () => {
        const teams: Team[] = [
          { id: 1, name: 'Team 1' },
          { id: 2, name: 'Team 2' },
          { id: 3, name: 'Team 3' },
        ];

        const pools = assignToPools(teams, 2, 'balanced');

        expect(pools).toHaveLength(1);
        expect(pools[0]).toEqual({
          id: 1,
          name: 'Pool A',
          teamIds: [1, 2, 3],
        });
      });

      it('should create single pool for 2 teams', () => {
        const teams: Team[] = [
          { id: 1, name: 'Team 1' },
          { id: 2, name: 'Team 2' },
        ];

        const pools = assignToPools(teams, 5, 'balanced');

        expect(pools).toHaveLength(1);
        expect(pools[0]!.teamIds).toEqual([1, 2]);
      });

      it('should create single pool for 1 team', () => {
        const teams: Team[] = [{ id: 1, name: 'Team 1' }];

        const pools = assignToPools(teams, 10, 'balanced');

        expect(pools).toHaveLength(1);
        expect(pools[0]!.teamIds).toEqual([1]);
      });
    });

    describe('ignores poolId in balanced strategy', () => {
      it('should ignore pre-assigned poolId values', () => {
        const teams: Team[] = [
          { id: 1, name: 'Team 1', poolId: 5 },
          { id: 2, name: 'Team 2', poolId: 5 },
          { id: 3, name: 'Team 3', poolId: 10 },
          { id: 4, name: 'Team 4', poolId: 10 },
        ];

        const pools = assignToPools(teams, 2, 'balanced');

        // Should distribute evenly, ignoring poolId
        expect(pools).toHaveLength(2);
        expect(pools[0]!.teamIds).toEqual([1, 2]);
        expect(pools[1]!.teamIds).toEqual([3, 4]);
      });
    });
  });

  describe('edge cases for both strategies', () => {
    it('should handle empty teams array gracefully (respect-input)', () => {
      const teams: Team[] = [];
      const pools = assignToPools(teams, 2, 'respect-input');

      expect(pools).toEqual([]);
    });

    it('should handle empty teams array gracefully (balanced)', () => {
      const teams: Team[] = [];
      const pools = assignToPools(teams, 2, 'balanced');

      expect(pools).toEqual([]);
    });

    it('should work with maxPools=1 (respect-input, no poolIds)', () => {
      const teams: Team[] = [
        { id: 1, name: 'Team 1' },
        { id: 2, name: 'Team 2' },
        { id: 3, name: 'Team 3' },
      ];

      const pools = assignToPools(teams, 1, 'respect-input');

      expect(pools).toHaveLength(1);
      expect(pools[0]!.teamIds).toEqual([1, 2, 3]);
    });

    it('should work with maxPools=1 (balanced)', () => {
      const teams: Team[] = [
        { id: 1, name: 'Team 1' },
        { id: 2, name: 'Team 2' },
        { id: 3, name: 'Team 3' },
        { id: 4, name: 'Team 4' },
        { id: 5, name: 'Team 5' },
      ];

      const pools = assignToPools(teams, 1, 'balanced');

      expect(pools).toHaveLength(1);
      expect(pools[0]!.teamIds).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('default strategy parameter', () => {
    it('should default to respect-input when strategy not specified', () => {
      const teams: Team[] = [
        { id: 1, name: 'Team 1' },
        { id: 2, name: 'Team 2' },
      ];

      // Call without strategy parameter
      const pools = assignToPools(teams, 1);

      expect(pools).toHaveLength(1);
      expect(pools[0]!.teamIds).toEqual([1, 2]);
    });
  });
});

describe('generatePoolName', () => {
  it('should generate Pool A for pool number 1', () => {
    expect(generatePoolName(1)).toBe('Pool A');
  });

  it('should generate Pool B for pool number 2', () => {
    expect(generatePoolName(2)).toBe('Pool B');
  });

  it('should generate Pool Z for pool number 26', () => {
    expect(generatePoolName(26)).toBe('Pool Z');
  });

  it('should generate Pool 27 for pool number 27', () => {
    expect(generatePoolName(27)).toBe('Pool 27');
  });

  it('should generate Pool 100 for pool number 100', () => {
    expect(generatePoolName(100)).toBe('Pool 100');
  });

  it('should handle pool number 0 gracefully', () => {
    // Pool 0 would give character '@' (64 in ASCII), which is before 'A'
    expect(generatePoolName(0)).toBe('Pool @');
  });
});

describe('createPoolNameMap', () => {
  it('should create map of pool ID to pool name', () => {
    const pools = [
      { id: 1, name: 'Pool A', teamIds: [1, 2] },
      { id: 2, name: 'Pool B', teamIds: [3, 4] },
      { id: 3, name: 'Pool C', teamIds: [5, 6] },
    ];

    const map = createPoolNameMap(pools);

    expect(map.size).toBe(3);
    expect(map.get(1)).toBe('Pool A');
    expect(map.get(2)).toBe('Pool B');
    expect(map.get(3)).toBe('Pool C');
  });

  it('should handle empty pools array', () => {
    const pools = [];
    const map = createPoolNameMap(pools);

    expect(map.size).toBe(0);
  });

  it('should handle single pool', () => {
    const pools = [{ id: 1, name: 'Pool A', teamIds: [1, 2, 3] }];
    const map = createPoolNameMap(pools);

    expect(map.size).toBe(1);
    expect(map.get(1)).toBe('Pool A');
  });

  it('should handle pools with custom names', () => {
    const pools = [
      { id: 1, name: 'Champions Pool', teamIds: [1, 2] },
      { id: 2, name: 'Challengers Pool', teamIds: [3, 4] },
    ];

    const map = createPoolNameMap(pools);

    expect(map.get(1)).toBe('Champions Pool');
    expect(map.get(2)).toBe('Challengers Pool');
  });
});
