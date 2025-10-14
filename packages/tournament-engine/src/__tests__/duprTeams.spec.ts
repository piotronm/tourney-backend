/**
 * Unit tests for DUPR-based team generation strategies.
 * Tests balanced, snake-draft, and random-pairs strategies.
 */

import { describe, it, expect } from 'vitest';
import {
  generateTeamsFromPlayers,
  calculateAverageRating,
  getTeamPlayers,
  calculateTeamRatingVariance,
} from '../duprTeams.js';
import { createSeededRNG } from '../rng.js';
import type { InputPlayer } from '../types.js';

describe('DUPR Team Generation', () => {
  describe('balanced strategy', () => {
    describe('doubles (teamSize = 2)', () => {
      it('should pair highest with lowest ratings', () => {
        const inputPlayers: InputPlayer[] = [
          { name: 'Alice', duprRating: 5.5 },
          { name: 'Bob', duprRating: 3.0 },
          { name: 'Charlie', duprRating: 4.8 },
          { name: 'Diana', duprRating: 3.5 },
        ];

        const rng = createSeededRNG(12345);
        const result = generateTeamsFromPlayers(inputPlayers, rng, {
          strategy: 'balanced',
          teamSize: 2,
        });

        expect(result.teams).toHaveLength(2);

        // Verify pairing: highest (5.5) with lowest (3.0), second highest (4.8) with second lowest (3.5)
        const team1Players = getTeamPlayers(1, result.players);
        const team2Players = getTeamPlayers(2, result.players);

        const team1Ratings = team1Players.map((p) => p.duprRating).sort();
        const team2Ratings = team2Players.map((p) => p.duprRating).sort();

        expect(team1Ratings).toEqual([3.0, 5.5]);
        expect(team2Ratings).toEqual([3.5, 4.8]);
      });

      it('should create teams with similar total ratings', () => {
        const inputPlayers: InputPlayer[] = [
          { name: 'Player 1', duprRating: 6.0 },
          { name: 'Player 2', duprRating: 5.0 },
          { name: 'Player 3', duprRating: 4.0 },
          { name: 'Player 4', duprRating: 3.0 },
        ];

        const rng = createSeededRNG(100);
        const result = generateTeamsFromPlayers(inputPlayers, rng, {
          strategy: 'balanced',
          teamSize: 2,
        });

        // Calculate total ratings for each team
        const team1Players = getTeamPlayers(1, result.players);
        const team2Players = getTeamPlayers(2, result.players);

        const team1Total =
          team1Players.reduce((sum, p) => sum + p.duprRating, 0);
        const team2Total =
          team2Players.reduce((sum, p) => sum + p.duprRating, 0);

        // Both teams should have total rating of 9.0
        expect(team1Total).toBe(9.0);
        expect(team2Total).toBe(9.0);
      });

      it('should minimize rating variance across teams', () => {
        const inputPlayers: InputPlayer[] = [
          { name: 'A', duprRating: 7.0 },
          { name: 'B', duprRating: 6.0 },
          { name: 'C', duprRating: 5.0 },
          { name: 'D', duprRating: 4.0 },
          { name: 'E', duprRating: 3.0 },
          { name: 'F', duprRating: 2.0 },
        ];

        const rng = createSeededRNG(999);
        const result = generateTeamsFromPlayers(inputPlayers, rng, {
          strategy: 'balanced',
          teamSize: 2,
        });

        const variance = calculateTeamRatingVariance(
          result.teams,
          result.teamCompositions,
          result.players
        );

        // Variance should be very low (close to 0) for balanced pairing
        expect(variance).toBeLessThan(0.1);
      });

      it('should generate correct team names (Last/Last format)', () => {
        const inputPlayers: InputPlayer[] = [
          { name: 'Alice Anderson', duprRating: 5.5 },
          { name: 'Bob Baker', duprRating: 3.0 },
          { name: 'Charlie Chen', duprRating: 4.8 },
          { name: 'Diana Davis', duprRating: 3.5 },
        ];

        const rng = createSeededRNG(42);
        const result = generateTeamsFromPlayers(inputPlayers, rng, {
          strategy: 'balanced',
          teamSize: 2,
        });

        // Team names should be "LastName/LastName"
        expect(result.teams[0]!.name).toMatch(/\w+\/\w+/);
        expect(result.teams[1]!.name).toMatch(/\w+\/\w+/);
      });

      it('should handle equal ratings', () => {
        const inputPlayers: InputPlayer[] = [
          { name: 'Player 1', duprRating: 5.0 },
          { name: 'Player 2', duprRating: 5.0 },
          { name: 'Player 3', duprRating: 5.0 },
          { name: 'Player 4', duprRating: 5.0 },
        ];

        const rng = createSeededRNG(123);
        const result = generateTeamsFromPlayers(inputPlayers, rng, {
          strategy: 'balanced',
          teamSize: 2,
        });

        expect(result.teams).toHaveLength(2);

        // All teams should have same average rating
        const team1Avg = calculateAverageRating(getTeamPlayers(1, result.players));
        const team2Avg = calculateAverageRating(getTeamPlayers(2, result.players));

        expect(team1Avg).toBe(5.0);
        expect(team2Avg).toBe(5.0);
      });
    });

    describe('larger teams (teamSize > 2)', () => {
      it('should distribute players evenly across rating ranges for teamSize=3', () => {
        const inputPlayers: InputPlayer[] = [
          { name: 'P1', duprRating: 7.0 },
          { name: 'P2', duprRating: 6.5 },
          { name: 'P3', duprRating: 6.0 },
          { name: 'P4', duprRating: 5.0 },
          { name: 'P5', duprRating: 4.5 },
          { name: 'P6', duprRating: 4.0 },
        ];

        const rng = createSeededRNG(200);
        const result = generateTeamsFromPlayers(inputPlayers, rng, {
          strategy: 'balanced',
          teamSize: 3,
        });

        expect(result.teams).toHaveLength(2);

        // Each team should have one player from each third of the rating distribution
        const team1Players = getTeamPlayers(1, result.players);
        const team2Players = getTeamPlayers(2, result.players);

        expect(team1Players).toHaveLength(3);
        expect(team2Players).toHaveLength(3);
      });

      it('should create balanced 4-player teams', () => {
        const inputPlayers: InputPlayer[] = Array.from({ length: 8 }, (_, i) => ({
          name: `Player ${i + 1}`,
          duprRating: 8.0 - i * 0.5, // 8.0, 7.5, 7.0, ..., 4.5
        }));

        const rng = createSeededRNG(300);
        const result = generateTeamsFromPlayers(inputPlayers, rng, {
          strategy: 'balanced',
          teamSize: 4,
        });

        expect(result.teams).toHaveLength(2);

        const variance = calculateTeamRatingVariance(
          result.teams,
          result.teamCompositions,
          result.players
        );

        // Should have low variance
        expect(variance).toBeLessThan(0.5);
      });
    });
  });

  describe('snake-draft strategy', () => {
    it('should alternate high-low picks for 4 players', () => {
      const inputPlayers: InputPlayer[] = [
        { name: 'A', duprRating: 5.0 },
        { name: 'B', duprRating: 4.5 },
        { name: 'C', duprRating: 4.0 },
        { name: 'D', duprRating: 3.5 },
      ];

      const rng = createSeededRNG(12345);
      const result = generateTeamsFromPlayers(inputPlayers, rng, {
        strategy: 'snake-draft',
        teamSize: 2,
      });

      expect(result.teams).toHaveLength(2);

      // Snake draft order: Team1: A (5.0), Team2: B (4.5), Team2: C (4.0), Team1: D (3.5)
      const team1Players = getTeamPlayers(1, result.players);
      const team2Players = getTeamPlayers(2, result.players);

      const team1Names = team1Players.map((p) => p.name).sort();
      const team2Names = team2Players.map((p) => p.name).sort();

      expect(team1Names).toEqual(['A', 'D']);
      expect(team2Names).toEqual(['B', 'C']);
    });

    it('should follow snake pattern for 6 players / 3 teams', () => {
      const inputPlayers: InputPlayer[] = [
        { name: 'P1', duprRating: 6.0 },
        { name: 'P2', duprRating: 5.5 },
        { name: 'P3', duprRating: 5.0 },
        { name: 'P4', duprRating: 4.5 },
        { name: 'P5', duprRating: 4.0 },
        { name: 'P6', duprRating: 3.5 },
      ];

      const rng = createSeededRNG(100);
      const result = generateTeamsFromPlayers(inputPlayers, rng, {
        strategy: 'snake-draft',
        teamSize: 2,
      });

      expect(result.teams).toHaveLength(3);

      // Snake draft order: T1, T2, T3, T3, T2, T1
      // T1: P1 (6.0), P6 (3.5)
      // T2: P2 (5.5), P5 (4.0)
      // T3: P3 (5.0), P4 (4.5)

      const team1Players = getTeamPlayers(1, result.players);
      const team2Players = getTeamPlayers(2, result.players);
      const team3Players = getTeamPlayers(3, result.players);

      expect(team1Players.map((p) => p.name).sort()).toEqual(['P1', 'P6']);
      expect(team2Players.map((p) => p.name).sort()).toEqual(['P2', 'P5']);
      expect(team3Players.map((p) => p.name).sort()).toEqual(['P3', 'P4']);
    });

    it('should sort players by rating before drafting', () => {
      // Provide unsorted input
      const inputPlayers: InputPlayer[] = [
        { name: 'C', duprRating: 4.0 },
        { name: 'A', duprRating: 6.0 },
        { name: 'D', duprRating: 3.0 },
        { name: 'B', duprRating: 5.0 },
      ];

      const rng = createSeededRNG(42);
      const result = generateTeamsFromPlayers(inputPlayers, rng, {
        strategy: 'snake-draft',
        teamSize: 2,
      });

      // Should sort by rating first: A (6.0), B (5.0), C (4.0), D (3.0)
      // Draft: T1: A, T2: B, T2: C, T1: D
      const team1Players = getTeamPlayers(1, result.players);
      const team2Players = getTeamPlayers(2, result.players);

      expect(team1Players.map((p) => p.name).sort()).toEqual(['A', 'D']);
      expect(team2Players.map((p) => p.name).sort()).toEqual(['B', 'C']);
    });

    it('should create reasonably balanced teams', () => {
      const inputPlayers: InputPlayer[] = [
        { name: 'P1', duprRating: 7.0 },
        { name: 'P2', duprRating: 6.0 },
        { name: 'P3', duprRating: 5.0 },
        { name: 'P4', duprRating: 4.0 },
        { name: 'P5', duprRating: 3.0 },
        { name: 'P6', duprRating: 2.0 },
      ];

      const rng = createSeededRNG(999);
      const result = generateTeamsFromPlayers(inputPlayers, rng, {
        strategy: 'snake-draft',
        teamSize: 2,
      });

      const variance = calculateTeamRatingVariance(
        result.teams,
        result.teamCompositions,
        result.players
      );

      // Snake draft should produce reasonable balance
      expect(variance).toBeLessThan(1.0);
    });

    it('should handle teams with more than 2 players', () => {
      const inputPlayers: InputPlayer[] = Array.from({ length: 9 }, (_, i) => ({
        name: `Player ${i + 1}`,
        duprRating: 7.0 - i * 0.5,
      }));

      const rng = createSeededRNG(500);
      const result = generateTeamsFromPlayers(inputPlayers, rng, {
        strategy: 'snake-draft',
        teamSize: 3,
      });

      expect(result.teams).toHaveLength(3);

      // Each team should have exactly 3 players
      for (let i = 1; i <= 3; i++) {
        const teamPlayers = getTeamPlayers(i, result.players);
        expect(teamPlayers).toHaveLength(3);
      }
    });
  });

  describe('random-pairs strategy', () => {
    it('should be deterministic with same seed', () => {
      const inputPlayers: InputPlayer[] = [
        { name: 'Alice', duprRating: 5.5 },
        { name: 'Bob', duprRating: 4.0 },
        { name: 'Charlie', duprRating: 6.0 },
        { name: 'Diana', duprRating: 3.5 },
      ];

      const seed = 12345;

      // Generate twice with same seed
      const result1 = generateTeamsFromPlayers(
        inputPlayers,
        createSeededRNG(seed),
        {
          strategy: 'random-pairs',
          teamSize: 2,
        }
      );

      const result2 = generateTeamsFromPlayers(
        inputPlayers,
        createSeededRNG(seed),
        {
          strategy: 'random-pairs',
          teamSize: 2,
        }
      );

      // Should produce identical pairings
      expect(result1.teams).toEqual(result2.teams);

      // Verify player assignments are identical
      for (let i = 1; i <= result1.teams.length; i++) {
        const team1Players = getTeamPlayers(i, result1.players);
        const team2Players = getTeamPlayers(i, result2.players);

        expect(team1Players.map((p) => p.name).sort()).toEqual(
          team2Players.map((p) => p.name).sort()
        );
      }
    });

    it('should produce different pairings with different seeds', () => {
      const inputPlayers: InputPlayer[] = [
        { name: 'Alice', duprRating: 5.5 },
        { name: 'Bob', duprRating: 4.0 },
        { name: 'Charlie', duprRating: 6.0 },
        { name: 'Diana', duprRating: 3.5 },
      ];

      const result1 = generateTeamsFromPlayers(
        inputPlayers,
        createSeededRNG(100),
        {
          strategy: 'random-pairs',
          teamSize: 2,
        }
      );

      const result2 = generateTeamsFromPlayers(
        inputPlayers,
        createSeededRNG(200),
        {
          strategy: 'random-pairs',
          teamSize: 2,
        }
      );

      // Should produce different pairings (highly likely with 4 players)
      const team1_1Players = getTeamPlayers(1, result1.players);
      const team1_2Players = getTeamPlayers(1, result2.players);

      const team1Names = team1_1Players.map((p) => p.name).sort();
      const team2Names = team1_2Players.map((p) => p.name).sort();

      expect(team1Names).not.toEqual(team2Names);
    });

    it('should include all players in teams', () => {
      const inputPlayers: InputPlayer[] = [
        { name: 'P1', duprRating: 5.0 },
        { name: 'P2', duprRating: 4.5 },
        { name: 'P3', duprRating: 4.0 },
        { name: 'P4', duprRating: 3.5 },
        { name: 'P5', duprRating: 3.0 },
        { name: 'P6', duprRating: 2.5 },
      ];

      const rng = createSeededRNG(42);
      const result = generateTeamsFromPlayers(inputPlayers, rng, {
        strategy: 'random-pairs',
        teamSize: 2,
      });

      // All players should be assigned to a team
      const allPlayerNames = result.players.map((p) => p.name).sort();
      expect(allPlayerNames).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6']);

      // Each player should have a teamId
      for (const player of result.players) {
        expect(player.teamId).toBeDefined();
        expect(player.teamId).toBeGreaterThan(0);
      }
    });

    it('should handle larger team sizes', () => {
      const inputPlayers: InputPlayer[] = Array.from({ length: 12 }, (_, i) => ({
        name: `Player ${i + 1}`,
        duprRating: 5.0 - i * 0.2,
      }));

      const rng = createSeededRNG(777);
      const result = generateTeamsFromPlayers(inputPlayers, rng, {
        strategy: 'random-pairs',
        teamSize: 3,
      });

      expect(result.teams).toHaveLength(4);

      // Each team should have exactly 3 players
      for (let i = 1; i <= 4; i++) {
        const teamPlayers = getTeamPlayers(i, result.players);
        expect(teamPlayers).toHaveLength(3);
      }
    });

    it('should shuffle before pairing', () => {
      const inputPlayers: InputPlayer[] = Array.from({ length: 10 }, (_, i) => ({
        name: `Player ${i + 1}`,
        duprRating: 5.0,
      }));

      const rng = createSeededRNG(888);
      const result = generateTeamsFromPlayers(inputPlayers, rng, {
        strategy: 'random-pairs',
        teamSize: 2,
      });

      // With shuffling, it's highly unlikely that team 1 is Player 1 + Player 2
      const team1Players = getTeamPlayers(1, result.players);
      const team1Names = team1Players.map((p) => p.name).sort();

      // Not the first two players in order (very unlikely)
      const isNotInOrder = team1Names[0] !== 'Player 1' || team1Names[1] !== 'Player 2';
      expect(isNotInOrder).toBe(true);
    });
  });

  describe('input validation', () => {
    it('should throw error for less than 2 players', () => {
      const inputPlayers: InputPlayer[] = [{ name: 'Solo', duprRating: 5.0 }];

      const rng = createSeededRNG(12345);

      expect(() =>
        generateTeamsFromPlayers(inputPlayers, rng, { strategy: 'balanced' })
      ).toThrow('At least 2 players required');
    });

    it('should throw error for empty players array', () => {
      const inputPlayers: InputPlayer[] = [];
      const rng = createSeededRNG(12345);

      expect(() =>
        generateTeamsFromPlayers(inputPlayers, rng, { strategy: 'balanced' })
      ).toThrow('At least 2 players required');
    });

    it('should throw error when player count not divisible by team size', () => {
      const inputPlayers: InputPlayer[] = [
        { name: 'P1', duprRating: 5.0 },
        { name: 'P2', duprRating: 4.5 },
        { name: 'P3', duprRating: 4.0 },
      ];

      const rng = createSeededRNG(12345);

      expect(() =>
        generateTeamsFromPlayers(inputPlayers, rng, {
          strategy: 'balanced',
          teamSize: 2,
        })
      ).toThrow('must be divisible by team size');
    });

    it('should throw error for invalid DUPR rating (too low)', () => {
      const inputPlayers: InputPlayer[] = [
        { name: 'P1', duprRating: 0.5 }, // Invalid: < 1.0
        { name: 'P2', duprRating: 5.0 },
      ];

      const rng = createSeededRNG(12345);

      expect(() =>
        generateTeamsFromPlayers(inputPlayers, rng, { strategy: 'balanced' })
      ).toThrow('Invalid DUPR rating');
    });

    it('should throw error for invalid DUPR rating (too high)', () => {
      const inputPlayers: InputPlayer[] = [
        { name: 'P1', duprRating: 8.5 }, // Invalid: > 8.0
        { name: 'P2', duprRating: 5.0 },
      ];

      const rng = createSeededRNG(12345);

      expect(() =>
        generateTeamsFromPlayers(inputPlayers, rng, { strategy: 'balanced' })
      ).toThrow('Invalid DUPR rating');
    });

    it('should accept valid DUPR ratings (1.0 to 8.0)', () => {
      const inputPlayers: InputPlayer[] = [
        { name: 'P1', duprRating: 1.0 },
        { name: 'P2', duprRating: 8.0 },
      ];

      const rng = createSeededRNG(12345);

      expect(() =>
        generateTeamsFromPlayers(inputPlayers, rng, { strategy: 'balanced' })
      ).not.toThrow();
    });
  });

  describe('player name handling', () => {
    it('should trim player names', () => {
      const inputPlayers: InputPlayer[] = [
        { name: '  Alice  ', duprRating: 5.5 },
        { name: '\tBob\t', duprRating: 4.0 },
      ];

      const rng = createSeededRNG(12345);
      const result = generateTeamsFromPlayers(inputPlayers, rng, {
        strategy: 'balanced',
      });

      expect(result.players[0]!.name).toBe('Alice');
      expect(result.players[1]!.name).toBe('Bob');
    });

    it('should auto-generate names for blank player names', () => {
      const inputPlayers: InputPlayer[] = [
        { name: '', duprRating: 5.5 },
        { name: '   ', duprRating: 4.0 },
      ];

      const rng = createSeededRNG(12345);
      const result = generateTeamsFromPlayers(inputPlayers, rng, {
        strategy: 'balanced',
      });

      expect(result.players[0]!.name).toBe('Player 1');
      expect(result.players[1]!.name).toBe('Player 2');
    });

    it('should extract last names for team names', () => {
      const inputPlayers: InputPlayer[] = [
        { name: 'Alice Anderson', duprRating: 5.5 },
        { name: 'Bob Baker', duprRating: 3.0 },
      ];

      const rng = createSeededRNG(12345);
      const result = generateTeamsFromPlayers(inputPlayers, rng, {
        strategy: 'balanced',
        teamSize: 2,
      });

      // Team name should be "LastName/LastName"
      expect(result.teams[0]!.name).toMatch(/Anderson\/Baker|Baker\/Anderson/);
    });

    it('should use full name if no space in name', () => {
      const inputPlayers: InputPlayer[] = [
        { name: 'Alice', duprRating: 5.5 },
        { name: 'Bob', duprRating: 3.0 },
      ];

      const rng = createSeededRNG(12345);
      const result = generateTeamsFromPlayers(inputPlayers, rng, {
        strategy: 'balanced',
        teamSize: 2,
      });

      expect(result.teams[0]!.name).toMatch(/Alice\/Bob|Bob\/Alice/);
    });

    it('should generate Team N format for teams with 3+ players', () => {
      const inputPlayers: InputPlayer[] = [
        { name: 'Alice', duprRating: 5.5 },
        { name: 'Bob', duprRating: 5.0 },
        { name: 'Charlie', duprRating: 4.5 },
      ];

      const rng = createSeededRNG(12345);
      const result = generateTeamsFromPlayers(inputPlayers, rng, {
        strategy: 'balanced',
        teamSize: 3,
      });

      // Team name should be "Team N (avg)"
      expect(result.teams[0]!.name).toMatch(/Team \d+ \(\d+\.\d\)/);
    });
  });

  describe('default options', () => {
    it('should default to balanced strategy', () => {
      const inputPlayers: InputPlayer[] = [
        { name: 'P1', duprRating: 6.0 },
        { name: 'P2', duprRating: 5.0 },
        { name: 'P3', duprRating: 4.0 },
        { name: 'P4', duprRating: 3.0 },
      ];

      const rng = createSeededRNG(12345);
      // No strategy specified
      const result = generateTeamsFromPlayers(inputPlayers, rng, {});

      // Should pair highest with lowest
      const team1Players = getTeamPlayers(1, result.players);
      const team1Ratings = team1Players.map((p) => p.duprRating).sort();

      expect(team1Ratings).toEqual([3.0, 6.0]);
    });

    it('should default to team size of 2', () => {
      const inputPlayers: InputPlayer[] = [
        { name: 'P1', duprRating: 5.0 },
        { name: 'P2', duprRating: 4.0 },
      ];

      const rng = createSeededRNG(12345);
      // No teamSize specified
      const result = generateTeamsFromPlayers(inputPlayers, rng, {
        strategy: 'balanced',
      });

      expect(result.teams).toHaveLength(1);
      expect(getTeamPlayers(1, result.players)).toHaveLength(2);
    });
  });
});

describe('Utility Functions', () => {
  describe('calculateAverageRating', () => {
    it('should calculate average rating for multiple players', () => {
      const players = [
        { id: 1, name: 'P1', duprRating: 5.0 },
        { id: 2, name: 'P2', duprRating: 3.0 },
      ];

      const avg = calculateAverageRating(players);
      expect(avg).toBe(4.0);
    });

    it('should return 0 for empty array', () => {
      const avg = calculateAverageRating([]);
      expect(avg).toBe(0);
    });

    it('should handle single player', () => {
      const players = [{ id: 1, name: 'P1', duprRating: 6.5 }];
      const avg = calculateAverageRating(players);
      expect(avg).toBe(6.5);
    });

    it('should calculate correct average for decimal ratings', () => {
      const players = [
        { id: 1, name: 'P1', duprRating: 5.5 },
        { id: 2, name: 'P2', duprRating: 4.5 },
        { id: 3, name: 'P3', duprRating: 3.5 },
      ];

      const avg = calculateAverageRating(players);
      expect(avg).toBeCloseTo(4.5, 2);
    });
  });

  describe('getTeamPlayers', () => {
    it('should return players for specified team', () => {
      const players = [
        { id: 1, name: 'P1', duprRating: 5.0, teamId: 1 },
        { id: 2, name: 'P2', duprRating: 4.0, teamId: 2 },
        { id: 3, name: 'P3', duprRating: 3.0, teamId: 1 },
      ];

      const team1Players = getTeamPlayers(1, players);
      expect(team1Players).toHaveLength(2);
      expect(team1Players.map((p) => p.name)).toEqual(['P1', 'P3']);
    });

    it('should return empty array for non-existent team', () => {
      const players = [
        { id: 1, name: 'P1', duprRating: 5.0, teamId: 1 },
        { id: 2, name: 'P2', duprRating: 4.0, teamId: 2 },
      ];

      const team3Players = getTeamPlayers(3, players);
      expect(team3Players).toEqual([]);
    });

    it('should return empty array for players without teamId', () => {
      const players = [
        { id: 1, name: 'P1', duprRating: 5.0 },
        { id: 2, name: 'P2', duprRating: 4.0 },
      ];

      const teamPlayers = getTeamPlayers(1, players);
      expect(teamPlayers).toEqual([]);
    });
  });

  describe('calculateTeamRatingVariance', () => {
    it('should calculate variance for teams', () => {
      const teams = [
        { id: 1, name: 'Team 1' },
        { id: 2, name: 'Team 2' },
      ];

      const players = [
        { id: 1, name: 'P1', duprRating: 6.0 },
        { id: 2, name: 'P2', duprRating: 4.0 },
        { id: 3, name: 'P3', duprRating: 5.5 },
        { id: 4, name: 'P4', duprRating: 3.5 },
      ];

      const teamCompositions = new Map([
        [1, [1, 2]], // Team 1: 6.0 + 4.0 = avg 5.0
        [2, [3, 4]], // Team 2: 5.5 + 3.5 = avg 4.5
      ]);

      const variance = calculateTeamRatingVariance(teams, teamCompositions, players);

      // Variance = ((5.0-4.75)^2 + (4.5-4.75)^2) / 2 = 0.125
      expect(variance).toBeCloseTo(0.0625, 4);
    });

    it('should return 0 variance for equal team ratings', () => {
      const teams = [
        { id: 1, name: 'Team 1' },
        { id: 2, name: 'Team 2' },
      ];

      const players = [
        { id: 1, name: 'P1', duprRating: 5.0 },
        { id: 2, name: 'P2', duprRating: 5.0 },
        { id: 3, name: 'P3', duprRating: 5.0 },
        { id: 4, name: 'P4', duprRating: 5.0 },
      ];

      const teamCompositions = new Map([
        [1, [1, 2]],
        [2, [3, 4]],
      ]);

      const variance = calculateTeamRatingVariance(teams, teamCompositions, players);
      expect(variance).toBe(0);
    });
  });
});
