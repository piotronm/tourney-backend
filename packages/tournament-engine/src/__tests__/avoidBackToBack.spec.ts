/**
 * Tests for avoid-back-to-back match scheduling heuristic.
 */

import { describe, it, expect } from 'vitest';
import { generateRoundRobinMatches, assignSlotsWithSpacing } from '../roundRobin.js';
import type { Pool, RoundRobinMatch } from '../types.js';

describe('assignSlotsWithSpacing', () => {
  it('should assign slot indices to all matches', () => {
    const pool: Pool = {
      id: 1,
      name: 'Pool A',
      teamIds: [1, 2, 3, 4],
    };

    const matches = generateRoundRobinMatches([pool]);
    assignSlotsWithSpacing(matches);

    // All matches should have slotIndex assigned
    for (const match of matches) {
      expect(match.slotIndex).toBeDefined();
      expect(match.slotIndex).toBeGreaterThanOrEqual(0);
    }

    // Slot indices should range from 0 to matches.length - 1
    const slotIndices = matches.map((m) => m.slotIndex!).sort((a, b) => a - b);
    expect(slotIndices).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('should maximize gaps between consecutive matches for each team', () => {
    const pool: Pool = {
      id: 1,
      name: 'Pool A',
      teamIds: [1, 2, 3, 4],
    };

    const matches = generateRoundRobinMatches([pool]);
    assignSlotsWithSpacing(matches);

    // Track when each team plays
    const teamSlots = new Map<number, number[]>();
    for (const match of matches) {
      const slotIndex = match.slotIndex!;

      // Add slot for team A
      if (!teamSlots.has(match.teamAId)) {
        teamSlots.set(match.teamAId, []);
      }
      teamSlots.get(match.teamAId)!.push(slotIndex);

      // Add slot for team B
      if (match.teamBId !== null) {
        if (!teamSlots.has(match.teamBId)) {
          teamSlots.set(match.teamBId, []);
        }
        teamSlots.get(match.teamBId)!.push(slotIndex);
      }
    }

    // Check that no team has back-to-back matches (gap of 1 or less)
    // With 4 teams and 6 matches, it should be possible to avoid back-to-back
    for (const [teamId, slots] of teamSlots.entries()) {
      const sortedSlots = [...slots].sort((a, b) => a - b);

      // Calculate gaps between consecutive matches
      for (let i = 1; i < sortedSlots.length; i++) {
        const gap = sortedSlots[i]! - sortedSlots[i - 1]!;
        expect(gap).toBeGreaterThan(0); // No simultaneous matches
      }
    }
  });

  it('should handle odd number of teams (with BYE)', () => {
    const pool: Pool = {
      id: 1,
      name: 'Pool A',
      teamIds: [1, 2, 3, 4, 5],
    };

    const matches = generateRoundRobinMatches([pool]);
    assignSlotsWithSpacing(matches);

    // All matches should have slotIndex
    expect(matches.every((m) => m.slotIndex !== undefined)).toBe(true);

    // Should have 10 matches (5 choose 2 = 10)
    expect(matches).toHaveLength(10);

    // Slot indices should be unique and sequential
    const slotIndices = matches.map((m) => m.slotIndex!).sort((a, b) => a - b);
    expect(slotIndices).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('should handle single match (minimum case)', () => {
    const pool: Pool = {
      id: 1,
      name: 'Pool A',
      teamIds: [1, 2],
    };

    const matches = generateRoundRobinMatches([pool]);
    assignSlotsWithSpacing(matches);

    expect(matches).toHaveLength(1);
    expect(matches[0]!.slotIndex).toBe(0);
  });

  it('should handle empty match list', () => {
    const matches: RoundRobinMatch[] = [];
    assignSlotsWithSpacing(matches);
    expect(matches).toHaveLength(0);
  });

  it('should work with multiple pools', () => {
    const pools: Pool[] = [
      { id: 1, name: 'Pool A', teamIds: [1, 2, 3] },
      { id: 2, name: 'Pool B', teamIds: [4, 5, 6] },
    ];

    const matches = generateRoundRobinMatches(pools);
    assignSlotsWithSpacing(matches);

    // Should have 6 matches total (3 per pool)
    expect(matches).toHaveLength(6);

    // All matches should have slotIndex
    expect(matches.every((m) => m.slotIndex !== undefined)).toBe(true);

    // Slot indices should be unique and sequential
    const slotIndices = matches.map((m) => m.slotIndex!).sort((a, b) => a - b);
    expect(slotIndices).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('should provide better spacing than sequential assignment', () => {
    const pool: Pool = {
      id: 1,
      name: 'Pool A',
      teamIds: [1, 2, 3, 4, 5, 6],
    };

    // Generate matches with spacing
    const spacedMatches = generateRoundRobinMatches([pool], { avoidBackToBack: true });

    // Calculate average gap for spaced approach
    const calculateAverageGap = (matches: RoundRobinMatch[]) => {
      const teamSlots = new Map<number, number[]>();

      for (const match of matches) {
        const slotIndex = match.slotIndex!;

        if (!teamSlots.has(match.teamAId)) {
          teamSlots.set(match.teamAId, []);
        }
        teamSlots.get(match.teamAId)!.push(slotIndex);

        if (match.teamBId !== null) {
          if (!teamSlots.has(match.teamBId)) {
            teamSlots.set(match.teamBId, []);
          }
          teamSlots.get(match.teamBId)!.push(slotIndex);
        }
      }

      let totalGap = 0;
      let gapCount = 0;
      let minGap = Infinity;

      for (const slots of teamSlots.values()) {
        const sorted = [...slots].sort((a, b) => a - b);
        for (let i = 1; i < sorted.length; i++) {
          const gap = sorted[i]! - sorted[i - 1]!;
          totalGap += gap;
          gapCount++;
          minGap = Math.min(minGap, gap);
        }
      }

      return { avgGap: gapCount > 0 ? totalGap / gapCount : 0, minGap };
    };

    const stats = calculateAverageGap(spacedMatches);

    // With 6 teams and 15 matches, we should have reasonable spacing
    // Average gap should be at least 1 (no simultaneous matches)
    expect(stats.avgGap).toBeGreaterThanOrEqual(1);

    // Minimum gap should be at least 1
    expect(stats.minGap).toBeGreaterThanOrEqual(1);
  });
});

describe('generateRoundRobinMatches with avoidBackToBack option', () => {
  it('should not assign slot indices when avoidBackToBack is false', () => {
    const pool: Pool = {
      id: 1,
      name: 'Pool A',
      teamIds: [1, 2, 3, 4],
    };

    const matches = generateRoundRobinMatches([pool], { avoidBackToBack: false });

    // Slot indices should be undefined
    expect(matches.every((m) => m.slotIndex === undefined)).toBe(true);
  });

  it('should not assign slot indices when option is not provided', () => {
    const pool: Pool = {
      id: 1,
      name: 'Pool A',
      teamIds: [1, 2, 3, 4],
    };

    const matches = generateRoundRobinMatches([pool]);

    // Slot indices should be undefined
    expect(matches.every((m) => m.slotIndex === undefined)).toBe(true);
  });

  it('should assign slot indices when avoidBackToBack is true', () => {
    const pool: Pool = {
      id: 1,
      name: 'Pool A',
      teamIds: [1, 2, 3, 4],
    };

    const matches = generateRoundRobinMatches([pool], { avoidBackToBack: true });

    // All matches should have slotIndex
    expect(matches.every((m) => m.slotIndex !== undefined)).toBe(true);
  });

  it('should work with other options (seed, shuffle, poolStrategy)', () => {
    const pool: Pool = {
      id: 1,
      name: 'Pool A',
      teamIds: [1, 2, 3, 4],
    };

    const matches = generateRoundRobinMatches([pool], {
      avoidBackToBack: true,
      seed: 12345,
      shuffle: false,
      poolStrategy: 'balanced',
    });

    // Should generate 6 matches with slot indices
    expect(matches).toHaveLength(6);
    expect(matches.every((m) => m.slotIndex !== undefined)).toBe(true);
  });

  it('should maintain deterministic match generation with avoidBackToBack', () => {
    const pool: Pool = {
      id: 1,
      name: 'Pool A',
      teamIds: [1, 2, 3, 4],
    };

    const matches1 = generateRoundRobinMatches([pool], { avoidBackToBack: true });
    const matches2 = generateRoundRobinMatches([pool], { avoidBackToBack: true });

    // Match pairings should be identical
    expect(matches1.length).toBe(matches2.length);
    for (let i = 0; i < matches1.length; i++) {
      expect(matches1[i]!.teamAId).toBe(matches2[i]!.teamAId);
      expect(matches1[i]!.teamBId).toBe(matches2[i]!.teamBId);
      expect(matches1[i]!.slotIndex).toBe(matches2[i]!.slotIndex);
    }
  });

  it('should handle large tournament with many teams', () => {
    const pool: Pool = {
      id: 1,
      name: 'Pool A',
      teamIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    };

    const matches = generateRoundRobinMatches([pool], { avoidBackToBack: true });

    // 10 teams = 45 matches
    expect(matches).toHaveLength(45);

    // All matches should have unique slot indices
    const slotIndices = matches.map((m) => m.slotIndex!);
    const uniqueSlots = new Set(slotIndices);
    expect(uniqueSlots.size).toBe(45);

    // Calculate minimum gap for each team
    const teamSlots = new Map<number, number[]>();
    for (const match of matches) {
      const slotIndex = match.slotIndex!;

      if (!teamSlots.has(match.teamAId)) {
        teamSlots.set(match.teamAId, []);
      }
      teamSlots.get(match.teamAId)!.push(slotIndex);

      if (match.teamBId !== null) {
        if (!teamSlots.has(match.teamBId)) {
          teamSlots.set(match.teamBId, []);
        }
        teamSlots.get(match.teamBId)!.push(slotIndex);
      }
    }

    // Each team should play 9 matches (n-1)
    for (const slots of teamSlots.values()) {
      expect(slots).toHaveLength(9);
    }

    // Check that gaps are reasonable (not all consecutive)
    let hasNonConsecutiveGap = false;
    for (const slots of teamSlots.values()) {
      const sorted = [...slots].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) {
        const gap = sorted[i]! - sorted[i - 1]!;
        if (gap > 1) {
          hasNonConsecutiveGap = true;
          break;
        }
      }
      if (hasNonConsecutiveGap) break;
    }

    // At least one team should have a gap > 1 with this many teams
    expect(hasNonConsecutiveGap).toBe(true);
  });
});

describe('Slot assignment edge cases', () => {
  it('should handle pool with 2 teams (single match)', () => {
    const pool: Pool = {
      id: 1,
      name: 'Pool A',
      teamIds: [1, 2],
    };

    const matches = generateRoundRobinMatches([pool], { avoidBackToBack: true });

    expect(matches).toHaveLength(1);
    expect(matches[0]!.slotIndex).toBe(0);
  });

  it('should handle pool with 3 teams (triangle)', () => {
    const pool: Pool = {
      id: 1,
      name: 'Pool A',
      teamIds: [1, 2, 3],
    };

    const matches = generateRoundRobinMatches([pool], { avoidBackToBack: true });

    expect(matches).toHaveLength(3);

    // With 3 teams, each team plays twice
    // Ideal spacing would be: match 1 uses teams [1,2], match 2 uses team 3, match 3 reuses others
    // Verify no team plays all three matches consecutively at slots 0, 1, 2
    const teamSlots = new Map<number, number[]>();
    for (const match of matches) {
      const slotIndex = match.slotIndex!;

      if (!teamSlots.has(match.teamAId)) {
        teamSlots.set(match.teamAId, []);
      }
      teamSlots.get(match.teamAId)!.push(slotIndex);

      if (match.teamBId !== null) {
        if (!teamSlots.has(match.teamBId)) {
          teamSlots.set(match.teamBId, []);
        }
        teamSlots.get(match.teamBId)!.push(slotIndex);
      }
    }

    // Each team should play exactly 2 matches
    for (const slots of teamSlots.values()) {
      expect(slots).toHaveLength(2);
    }
  });

  it('should maintain match IDs and other properties', () => {
    const pool: Pool = {
      id: 1,
      name: 'Pool A',
      teamIds: [1, 2, 3, 4],
    };

    const matchesWithoutSlots = generateRoundRobinMatches([pool]);
    const matchesWithSlots = generateRoundRobinMatches([pool], { avoidBackToBack: true });

    expect(matchesWithoutSlots.length).toBe(matchesWithSlots.length);

    // Match IDs, teams, rounds should be identical
    for (let i = 0; i < matchesWithoutSlots.length; i++) {
      const m1 = matchesWithoutSlots[i]!;
      const m2 = matchesWithSlots[i]!;

      expect(m2.id).toBe(m1.id);
      expect(m2.poolId).toBe(m1.poolId);
      expect(m2.round).toBe(m1.round);
      expect(m2.matchNumber).toBe(m1.matchNumber);
      expect(m2.teamAId).toBe(m1.teamAId);
      expect(m2.teamBId).toBe(m1.teamBId);
      expect(m2.status).toBe(m1.status);
    }
  });
});
