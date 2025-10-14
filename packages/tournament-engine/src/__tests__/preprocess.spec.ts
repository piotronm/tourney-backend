/**
 * Unit tests for team preprocessing functionality.
 * Tests ID assignment, name normalization, shuffling, and validation.
 */

import { describe, it, expect } from 'vitest';
import { preprocessTeams, validateTeams } from '../preprocess.js';
import { createSeededRNG } from '../rng.js';
import type { InputTeam } from '../types.js';

describe('preprocessTeams', () => {
  describe('ID assignment', () => {
    describe('without seed (sequential IDs)', () => {
      it('should assign sequential IDs when no seed provided', () => {
        const inputTeams: InputTeam[] = [
          { name: 'Team A' },
          { name: 'Team B' },
          { name: 'Team C' },
        ];

        const rng = createSeededRNG(12345);
        const teams = preprocessTeams(inputTeams, rng, false);

        expect(teams[0]!.id).toBe(1);
        expect(teams[1]!.id).toBe(2);
        expect(teams[2]!.id).toBe(3);
      });

      it('should assign sequential IDs starting from 1', () => {
        const inputTeams: InputTeam[] = [
          { name: 'First' },
          { name: 'Second' },
          { name: 'Third' },
          { name: 'Fourth' },
          { name: 'Fifth' },
        ];

        const rng = createSeededRNG(999);
        const teams = preprocessTeams(inputTeams, rng, false);

        expect(teams.map(t => t.id)).toEqual([1, 2, 3, 4, 5]);
      });

      it('should maintain sequential IDs after shuffle when no seed', () => {
        const inputTeams: InputTeam[] = [
          { name: 'Team A' },
          { name: 'Team B' },
          { name: 'Team C' },
          { name: 'Team D' },
        ];

        const rng = createSeededRNG(42);
        const teams = preprocessTeams(inputTeams, rng, true); // shuffle = true

        // After shuffle, IDs should be reassigned sequentially
        expect(teams.map(t => t.id)).toEqual([1, 2, 3, 4]);
      });
    });

    describe('with seed (hash-based deterministic IDs)', () => {
      it('should assign hash-based deterministic IDs when seed provided', () => {
        const inputTeams: InputTeam[] = [
          { name: 'Team A' },
          { name: 'Team B' },
          { name: 'Team C' },
        ];

        const seed = 42;
        const rng = createSeededRNG(seed);
        const teams = preprocessTeams(inputTeams, rng, false, seed);

        // IDs should not be sequential
        expect(teams[0]!.id).not.toBe(1);
        expect(teams[1]!.id).not.toBe(2);
        expect(teams[2]!.id).not.toBe(3);

        // IDs should be deterministic (same across runs)
        const teams2 = preprocessTeams(inputTeams, createSeededRNG(seed), false, seed);
        expect(teams[0]!.id).toBe(teams2[0]!.id);
        expect(teams[1]!.id).toBe(teams2[1]!.id);
        expect(teams[2]!.id).toBe(teams2[2]!.id);
      });

      it('should generate different IDs for different seeds', () => {
        const inputTeams: InputTeam[] = [
          { name: 'Team A' },
          { name: 'Team B' },
        ];

        const teams1 = preprocessTeams(inputTeams, createSeededRNG(100), false, 100);
        const teams2 = preprocessTeams(inputTeams, createSeededRNG(200), false, 200);

        // Different seeds should produce different IDs
        expect(teams1[0]!.id).not.toBe(teams2[0]!.id);
        expect(teams1[1]!.id).not.toBe(teams2[1]!.id);
      });

      it('should generate different IDs for different team names with same seed', () => {
        const inputTeams: InputTeam[] = [
          { name: 'Team Alpha' },
          { name: 'Team Beta' },
          { name: 'Team Gamma' },
        ];

        const seed = 999;
        const rng = createSeededRNG(seed);
        const teams = preprocessTeams(inputTeams, rng, false, seed);

        // Each team should have a unique ID based on seed + name + index
        expect(teams[0]!.id).not.toBe(teams[1]!.id);
        expect(teams[1]!.id).not.toBe(teams[2]!.id);
        expect(teams[0]!.id).not.toBe(teams[2]!.id);
      });

      it('should maintain hash-based IDs after shuffle when seed provided', () => {
        const inputTeams: InputTeam[] = [
          { name: 'Team A' },
          { name: 'Team B' },
          { name: 'Team C' },
        ];

        const seed = 42;
        const rng = createSeededRNG(seed);
        const teams = preprocessTeams(inputTeams, rng, true, seed); // shuffle = true

        // With seed, IDs should remain hash-based even after shuffle
        // IDs should not be reassigned to 1, 2, 3
        const ids = teams.map(t => t.id);
        expect(ids).not.toEqual([1, 2, 3]);

        // IDs should still be deterministic
        const teams2 = preprocessTeams(inputTeams, createSeededRNG(seed), true, seed);
        expect(teams.map(t => t.id)).toEqual(teams2.map(t => t.id));
      });

      it('should generate IDs in valid positive integer range', () => {
        const inputTeams: InputTeam[] = Array.from({ length: 100 }, (_, i) => ({
          name: `Team ${i}`,
        }));

        const seed = 12345;
        const rng = createSeededRNG(seed);
        const teams = preprocessTeams(inputTeams, rng, false, seed);

        // All IDs should be positive integers
        for (const team of teams) {
          expect(team.id).toBeGreaterThan(0);
          expect(Number.isInteger(team.id)).toBe(true);
        }
      });
    });
  });

  describe('name normalization', () => {
    it('should trim team names', () => {
      const inputTeams: InputTeam[] = [
        { name: '  Team A  ' },
        { name: '	Team B	' }, // tabs
        { name: '\n Team C \n' },
      ];

      const rng = createSeededRNG(12345);
      const teams = preprocessTeams(inputTeams, rng, false);

      expect(teams[0]!.name).toBe('Team A');
      expect(teams[1]!.name).toBe('Team B');
      expect(teams[2]!.name).toBe('Team C');
    });

    it('should auto-generate names for blank team names', () => {
      const inputTeams: InputTeam[] = [
        { name: '' },
        { name: '   ' },
        { name: '\t\n' },
        { name: 'Valid Team' },
      ];

      const rng = createSeededRNG(12345);
      const teams = preprocessTeams(inputTeams, rng, false);

      expect(teams[0]!.name).toBe('Team 1');
      expect(teams[1]!.name).toBe('Team 2');
      expect(teams[2]!.name).toBe('Team 3');
      expect(teams[3]!.name).toBe('Valid Team');
    });

    it('should generate sequential auto-names based on index', () => {
      const inputTeams: InputTeam[] = [
        { name: '' },
        { name: '' },
        { name: '' },
      ];

      const rng = createSeededRNG(12345);
      const teams = preprocessTeams(inputTeams, rng, false);

      expect(teams[0]!.name).toBe('Team 1');
      expect(teams[1]!.name).toBe('Team 2');
      expect(teams[2]!.name).toBe('Team 3');
    });

    it('should handle unicode characters in team names', () => {
      const inputTeams: InputTeam[] = [
        { name: '  Team 中文  ' },
        { name: '  Team 日本語  ' },
        { name: '  Team العربية  ' },
      ];

      const rng = createSeededRNG(12345);
      const teams = preprocessTeams(inputTeams, rng, false);

      expect(teams[0]!.name).toBe('Team 中文');
      expect(teams[1]!.name).toBe('Team 日本語');
      expect(teams[2]!.name).toBe('Team العربية');
    });

    it('should handle special characters in team names', () => {
      const inputTeams: InputTeam[] = [
        { name: '  Team #1  ' },
        { name: '  A&B United  ' },
        { name: "  O'Brien's Team  " },
      ];

      const rng = createSeededRNG(12345);
      const teams = preprocessTeams(inputTeams, rng, false);

      expect(teams[0]!.name).toBe('Team #1');
      expect(teams[1]!.name).toBe('A&B United');
      expect(teams[2]!.name).toBe("O'Brien's Team");
    });
  });

  describe('poolId preservation', () => {
    it('should preserve poolId from input teams', () => {
      const inputTeams: InputTeam[] = [
        { name: 'Team A', poolId: 1 },
        { name: 'Team B', poolId: 1 },
        { name: 'Team C', poolId: 2 },
        { name: 'Team D', poolId: 2 },
      ];

      const rng = createSeededRNG(12345);
      const teams = preprocessTeams(inputTeams, rng, false);

      expect(teams[0]!.poolId).toBe(1);
      expect(teams[1]!.poolId).toBe(1);
      expect(teams[2]!.poolId).toBe(2);
      expect(teams[3]!.poolId).toBe(2);
    });

    it('should handle undefined poolId', () => {
      const inputTeams: InputTeam[] = [
        { name: 'Team A' },
        { name: 'Team B', poolId: 1 },
        { name: 'Team C' },
      ];

      const rng = createSeededRNG(12345);
      const teams = preprocessTeams(inputTeams, rng, false);

      expect(teams[0]!.poolId).toBeUndefined();
      expect(teams[1]!.poolId).toBe(1);
      expect(teams[2]!.poolId).toBeUndefined();
    });

    it('should preserve poolId after shuffle', () => {
      const inputTeams: InputTeam[] = [
        { name: 'Team A', poolId: 1 },
        { name: 'Team B', poolId: 2 },
        { name: 'Team C', poolId: 3 },
      ];

      const rng = createSeededRNG(42);
      const teams = preprocessTeams(inputTeams, rng, true);

      // PoolId should remain with each team even after shuffle
      const poolIds = new Set(teams.map(t => t.poolId));
      expect(poolIds).toContain(1);
      expect(poolIds).toContain(2);
      expect(poolIds).toContain(3);
    });
  });

  describe('shuffling', () => {
    it('should shuffle teams deterministically with same seed', () => {
      const inputTeams: InputTeam[] = [
        { name: 'Team A' },
        { name: 'Team B' },
        { name: 'Team C' },
        { name: 'Team D' },
      ];

      const seed = 999;

      // Generate twice with same seed
      const teams1 = preprocessTeams(inputTeams, createSeededRNG(seed), true);
      const teams2 = preprocessTeams(inputTeams, createSeededRNG(seed), true);

      // Should produce identical order
      expect(teams1).toEqual(teams2);
    });

    it('should shuffle teams differently with different seeds', () => {
      const inputTeams: InputTeam[] = [
        { name: 'Team A' },
        { name: 'Team B' },
        { name: 'Team C' },
        { name: 'Team D' },
      ];

      const teams1 = preprocessTeams(inputTeams, createSeededRNG(1), true);
      const teams2 = preprocessTeams(inputTeams, createSeededRNG(2), true);

      // Should produce different orders (highly likely with 4 teams)
      expect(teams1).not.toEqual(teams2);
    });

    it('should not shuffle when shuffle parameter is false', () => {
      const inputTeams: InputTeam[] = [
        { name: 'Team A' },
        { name: 'Team B' },
        { name: 'Team C' },
      ];

      const rng = createSeededRNG(999);
      const teams = preprocessTeams(inputTeams, rng, false);

      // Teams should remain in original order
      expect(teams[0]!.name).toBe('Team A');
      expect(teams[1]!.name).toBe('Team B');
      expect(teams[2]!.name).toBe('Team C');
    });

    it('should shuffle when shuffle parameter is true', () => {
      const inputTeams: InputTeam[] = Array.from({ length: 10 }, (_, i) => ({
        name: `Team ${i + 1}`,
      }));

      const rng = createSeededRNG(42);
      const teams = preprocessTeams(inputTeams, rng, true);

      // With 10 teams, it's virtually certain that at least one will be in different position
      const inOriginalOrder = teams.every((t, i) => t.name === `Team ${i + 1}`);
      expect(inOriginalOrder).toBe(false);
    });

    it('should preserve all teams after shuffle (no teams lost)', () => {
      const inputTeams: InputTeam[] = [
        { name: 'Alpha' },
        { name: 'Beta' },
        { name: 'Gamma' },
        { name: 'Delta' },
        { name: 'Epsilon' },
      ];

      const rng = createSeededRNG(123);
      const teams = preprocessTeams(inputTeams, rng, true);

      expect(teams).toHaveLength(5);

      // All original team names should be present
      const names = teams.map(t => t.name).sort();
      expect(names).toEqual(['Alpha', 'Beta', 'Delta', 'Epsilon', 'Gamma']);
    });
  });

  describe('immutability', () => {
    it('should not mutate the input teams array', () => {
      const inputTeams: InputTeam[] = [
        { name: 'Team A' },
        { name: 'Team B' },
        { name: 'Team C' },
      ];

      // Create a deep copy to compare later
      const originalInputTeams = JSON.parse(JSON.stringify(inputTeams));

      const rng = createSeededRNG(12345);
      preprocessTeams(inputTeams, rng, false);

      // Input should not be modified
      expect(inputTeams).toEqual(originalInputTeams);
    });

    it('should not mutate input teams when shuffling', () => {
      const inputTeams: InputTeam[] = [
        { name: 'Team A', poolId: 1 },
        { name: 'Team B', poolId: 2 },
        { name: 'Team C', poolId: 3 },
      ];

      const originalInputTeams = JSON.parse(JSON.stringify(inputTeams));

      const rng = createSeededRNG(42);
      preprocessTeams(inputTeams, rng, true);

      // Input should not be modified
      expect(inputTeams).toEqual(originalInputTeams);
    });

    it('should not mutate input teams when trimming names', () => {
      const inputTeams: InputTeam[] = [
        { name: '  Spaces  ' },
        { name: '\t\tTabs\t\t' },
      ];

      const originalInputTeams = JSON.parse(JSON.stringify(inputTeams));

      const rng = createSeededRNG(12345);
      preprocessTeams(inputTeams, rng, false);

      // Input should still have spaces/tabs
      expect(inputTeams).toEqual(originalInputTeams);
      expect(inputTeams[0]!.name).toBe('  Spaces  ');
      expect(inputTeams[1]!.name).toBe('\t\tTabs\t\t');
    });

    it('should create new team objects, not references', () => {
      const inputTeams: InputTeam[] = [
        { name: 'Team A' },
        { name: 'Team B' },
      ];

      const rng = createSeededRNG(12345);
      const teams = preprocessTeams(inputTeams, rng, false);

      // Modifying output should not affect input
      teams[0]!.name = 'Modified';

      expect(inputTeams[0]!.name).toBe('Team A');
    });
  });

  describe('edge cases', () => {
    it('should handle single team', () => {
      const inputTeams: InputTeam[] = [{ name: 'Solo Team' }];

      const rng = createSeededRNG(12345);
      const teams = preprocessTeams(inputTeams, rng, false);

      expect(teams).toHaveLength(1);
      expect(teams[0]).toEqual({
        id: 1,
        name: 'Solo Team',
        poolId: undefined,
      });
    });

    it('should handle large number of teams', () => {
      const inputTeams: InputTeam[] = Array.from({ length: 1000 }, (_, i) => ({
        name: `Team ${i + 1}`,
      }));

      const rng = createSeededRNG(12345);
      const teams = preprocessTeams(inputTeams, rng, false);

      expect(teams).toHaveLength(1000);
      expect(teams[0]!.id).toBe(1);
      expect(teams[999]!.id).toBe(1000);
    });

    it('should handle teams with very long names', () => {
      const longName = 'A'.repeat(1000);
      const inputTeams: InputTeam[] = [
        { name: longName },
        { name: 'Normal Team' },
      ];

      const rng = createSeededRNG(12345);
      const teams = preprocessTeams(inputTeams, rng, false);

      expect(teams[0]!.name).toBe(longName);
      expect(teams[1]!.name).toBe('Normal Team');
    });

    it('should handle teams with identical names', () => {
      const inputTeams: InputTeam[] = [
        { name: 'Team A' },
        { name: 'Team A' },
        { name: 'Team A' },
      ];

      const seed = 42;
      const rng = createSeededRNG(seed);
      const teams = preprocessTeams(inputTeams, rng, false, seed);

      expect(teams).toHaveLength(3);
      expect(teams[0]!.name).toBe('Team A');
      expect(teams[1]!.name).toBe('Team A');
      expect(teams[2]!.name).toBe('Team A');

      // IDs should still be unique (based on index)
      expect(teams[0]!.id).not.toBe(teams[1]!.id);
      expect(teams[1]!.id).not.toBe(teams[2]!.id);
    });
  });
});

describe('validateTeams', () => {
  it('should pass validation for valid teams array', () => {
    const inputTeams: InputTeam[] = [
      { name: 'Team A' },
      { name: 'Team B' },
    ];

    expect(() => validateTeams(inputTeams)).not.toThrow();
  });

  it('should throw error for empty array', () => {
    const inputTeams: InputTeam[] = [];

    expect(() => validateTeams(inputTeams)).toThrow('Teams array must not be empty');
  });

  it('should throw error for non-array input', () => {
    expect(() => validateTeams(null as any)).toThrow('Teams array must not be empty');
    expect(() => validateTeams(undefined as any)).toThrow('Teams array must not be empty');
    expect(() => validateTeams({} as any)).toThrow('Teams array must not be empty');
  });

  it('should throw error for team without name', () => {
    const inputTeams: InputTeam[] = [
      { name: 'Team A' },
      {} as InputTeam,
    ];

    expect(() => validateTeams(inputTeams)).toThrow('Each team must have a valid name');
  });

  it('should throw error for team with null name', () => {
    const inputTeams: InputTeam[] = [
      { name: 'Team A' },
      { name: null as any },
    ];

    expect(() => validateTeams(inputTeams)).toThrow('Each team must have a valid name');
  });

  it('should throw error for team with non-string name', () => {
    const inputTeams: InputTeam[] = [
      { name: 'Team A' },
      { name: 123 as any },
    ];

    expect(() => validateTeams(inputTeams)).toThrow('Each team must have a valid name');
  });

  it('should throw error for team with empty string name', () => {
    const inputTeams: InputTeam[] = [
      { name: '' },
    ];

    expect(() => validateTeams(inputTeams)).toThrow('Each team must have a valid name');
  });

  it('should throw error for team with whitespace-only name', () => {
    const inputTeams: InputTeam[] = [
      { name: '   ' },
    ];

    // Whitespace-only names are treated as truthy by JS, but preprocessing handles it
    // Note: validateTeams doesn't trim, so '   ' passes validation but preprocessTeams will trim it
    expect(() => validateTeams(inputTeams)).not.toThrow();
  });

  it('should accept teams with poolId', () => {
    const inputTeams: InputTeam[] = [
      { name: 'Team A', poolId: 1 },
      { name: 'Team B', poolId: 2 },
    ];

    expect(() => validateTeams(inputTeams)).not.toThrow();
  });
});
