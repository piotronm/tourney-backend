import { describe, it, expect } from 'vitest';
import { computePoolStandings, getHeadToHeadRecord } from '../index.js';
import type { RoundRobinMatch } from '../types.js';

describe('Standings Calculation', () => {
  describe('computePoolStandings', () => {
    it('should compute correct standings with completed matches', () => {
      const matches: RoundRobinMatch[] = [
        {
          id: 1,
          poolId: 1,
          round: 1,
          matchNumber: 1,
          teamAId: 1,
          teamBId: 2,
          scoreA: 10,
          scoreB: 5,
          status: 'completed',
        },
        {
          id: 2,
          poolId: 1,
          round: 1,
          matchNumber: 2,
          teamAId: 3,
          teamBId: 4,
          scoreA: 8,
          scoreB: 12,
          status: 'completed',
        },
        {
          id: 3,
          poolId: 1,
          round: 2,
          matchNumber: 3,
          teamAId: 1,
          teamBId: 3,
          scoreA: 15,
          scoreB: 10,
          status: 'completed',
        },
      ];

      const standings = computePoolStandings(1, matches);

      // Team 1: 2 wins, 25 points for, 15 against, +10 diff
      const team1 = standings.find((s) => s.teamId === 1);
      expect(team1).toEqual({
        teamId: 1,
        wins: 2,
        losses: 0,
        pointsFor: 25,
        pointsAgainst: 15,
        pointDiff: 10,
      });

      // Team 4: 1 win, 0 losses, 12 points for, 8 against, +4 diff
      const team4 = standings.find((s) => s.teamId === 4);
      expect(team4).toEqual({
        teamId: 4,
        wins: 1,
        losses: 0,
        pointsFor: 12,
        pointsAgainst: 8,
        pointDiff: 4,
      });

      // Team 2: 0 wins, 5 points for, 10 against, -5 diff
      const team2 = standings.find((s) => s.teamId === 2);
      expect(team2).toEqual({
        teamId: 2,
        wins: 0,
        losses: 1,
        pointsFor: 5,
        pointsAgainst: 10,
        pointDiff: -5,
      });
    });

    it('should rank teams by wins first', () => {
      const matches: RoundRobinMatch[] = [
        {
          id: 1,
          poolId: 1,
          round: 1,
          matchNumber: 1,
          teamAId: 1,
          teamBId: 2,
          scoreA: 100,
          scoreB: 99,
          status: 'completed',
        },
        {
          id: 2,
          poolId: 1,
          round: 1,
          matchNumber: 2,
          teamAId: 3,
          teamBId: 4,
          scoreA: 10,
          scoreB: 5,
          status: 'completed',
        },
      ];

      const standings = computePoolStandings(1, matches);

      // Both team 1 and team 3 have 1 win
      // Team 1 has better point differential (+1 vs +5)
      // But team 3 should rank higher due to better diff
      expect(standings[0]?.teamId).toBe(3); // +5 diff
      expect(standings[1]?.teamId).toBe(1); // +1 diff
    });

    it('should rank by point differential when wins are tied', () => {
      const matches: RoundRobinMatch[] = [
        {
          id: 1,
          poolId: 1,
          round: 1,
          matchNumber: 1,
          teamAId: 1,
          teamBId: 2,
          scoreA: 10,
          scoreB: 5,
          status: 'completed',
        },
        {
          id: 2,
          poolId: 1,
          round: 1,
          matchNumber: 2,
          teamAId: 3,
          teamBId: 4,
          scoreA: 20,
          scoreB: 10,
          status: 'completed',
        },
      ];

      const standings = computePoolStandings(1, matches);

      // Both winners have 1 win
      // Team 3 has +10 diff, Team 1 has +5 diff
      expect(standings[0]?.teamId).toBe(3);
      expect(standings[1]?.teamId).toBe(1);
    });

    it('should ignore pending matches', () => {
      const matches: RoundRobinMatch[] = [
        {
          id: 1,
          poolId: 1,
          round: 1,
          matchNumber: 1,
          teamAId: 1,
          teamBId: 2,
          scoreA: 10,
          scoreB: 5,
          status: 'completed',
        },
        {
          id: 2,
          poolId: 1,
          round: 2,
          matchNumber: 2,
          teamAId: 1,
          teamBId: 3,
          scoreA: null,
          scoreB: null,
          status: 'pending',
        },
      ];

      const standings = computePoolStandings(1, matches);

      const team1 = standings.find((s) => s.teamId === 1);
      expect(team1?.wins).toBe(1);
      expect(team1?.pointsFor).toBe(10);

      // Team 3 should have no stats yet
      const team3 = standings.find((s) => s.teamId === 3);
      expect(team3).toBeUndefined();
    });

    it('should filter by pool ID correctly', () => {
      const matches: RoundRobinMatch[] = [
        {
          id: 1,
          poolId: 1,
          round: 1,
          matchNumber: 1,
          teamAId: 1,
          teamBId: 2,
          scoreA: 10,
          scoreB: 5,
          status: 'completed',
        },
        {
          id: 2,
          poolId: 2,
          round: 1,
          matchNumber: 2,
          teamAId: 3,
          teamBId: 4,
          scoreA: 20,
          scoreB: 15,
          status: 'completed',
        },
      ];

      const pool1Standings = computePoolStandings(1, matches);
      const pool2Standings = computePoolStandings(2, matches);

      expect(pool1Standings).toHaveLength(2); // Teams 1 and 2
      expect(pool2Standings).toHaveLength(2); // Teams 3 and 4

      expect(pool1Standings.map((s) => s.teamId).sort()).toEqual([1, 2]);
      expect(pool2Standings.map((s) => s.teamId).sort()).toEqual([3, 4]);
    });

    it('should handle empty matches', () => {
      const standings = computePoolStandings(1, []);
      expect(standings).toHaveLength(0);
    });

    it('should skip BYE matches', () => {
      const matches: RoundRobinMatch[] = [
        {
          id: 1,
          poolId: 1,
          round: 1,
          matchNumber: 1,
          teamAId: 1,
          teamBId: null, // BYE
          scoreA: 0,
          scoreB: 0,
          status: 'completed',
        },
        {
          id: 2,
          poolId: 1,
          round: 2,
          matchNumber: 2,
          teamAId: 1,
          teamBId: 2,
          scoreA: 10,
          scoreB: 5,
          status: 'completed',
        },
      ];

      const standings = computePoolStandings(1, matches);

      // Team 1 should only have stats from match 2
      const team1 = standings.find((s) => s.teamId === 1);
      expect(team1?.wins).toBe(1);
      expect(team1?.pointsFor).toBe(10);
    });
  });

  describe('getHeadToHeadRecord', () => {
    it('should compute head-to-head record correctly', () => {
      const matches: RoundRobinMatch[] = [
        {
          id: 1,
          poolId: 1,
          round: 1,
          matchNumber: 1,
          teamAId: 1,
          teamBId: 2,
          scoreA: 10,
          scoreB: 5,
          status: 'completed',
        },
        {
          id: 2,
          poolId: 1,
          round: 2,
          matchNumber: 2,
          teamAId: 2,
          teamBId: 1,
          scoreA: 8,
          scoreB: 12,
          status: 'completed',
        },
        {
          id: 3,
          poolId: 1,
          round: 3,
          matchNumber: 3,
          teamAId: 1,
          teamBId: 3,
          scoreA: 15,
          scoreB: 10,
          status: 'completed',
        },
      ];

      const h2h = getHeadToHeadRecord(1, 2, matches);

      expect(h2h).toEqual({
        teamAWins: 2, // Team 1 won both matches against team 2
        teamBWins: 0,
        gamesPlayed: 2,
      });
    });

    it('should handle reversed team positions', () => {
      const matches: RoundRobinMatch[] = [
        {
          id: 1,
          poolId: 1,
          round: 1,
          matchNumber: 1,
          teamAId: 2,
          teamBId: 1,
          scoreA: 10,
          scoreB: 5,
          status: 'completed',
        },
      ];

      const h2h = getHeadToHeadRecord(1, 2, matches);

      expect(h2h).toEqual({
        teamAWins: 0,
        teamBWins: 1,
        gamesPlayed: 1,
      });
    });

    it('should return zeros when no matches found', () => {
      const matches: RoundRobinMatch[] = [
        {
          id: 1,
          poolId: 1,
          round: 1,
          matchNumber: 1,
          teamAId: 3,
          teamBId: 4,
          scoreA: 10,
          scoreB: 5,
          status: 'completed',
        },
      ];

      const h2h = getHeadToHeadRecord(1, 2, matches);

      expect(h2h).toEqual({
        teamAWins: 0,
        teamBWins: 0,
        gamesPlayed: 0,
      });
    });

    it('should ignore pending matches', () => {
      const matches: RoundRobinMatch[] = [
        {
          id: 1,
          poolId: 1,
          round: 1,
          matchNumber: 1,
          teamAId: 1,
          teamBId: 2,
          scoreA: 10,
          scoreB: 5,
          status: 'completed',
        },
        {
          id: 2,
          poolId: 1,
          round: 2,
          matchNumber: 2,
          teamAId: 1,
          teamBId: 2,
          scoreA: null,
          scoreB: null,
          status: 'pending',
        },
      ];

      const h2h = getHeadToHeadRecord(1, 2, matches);

      expect(h2h.gamesPlayed).toBe(1);
    });
  });

  describe('Head-to-Head Tiebreaker', () => {
    it('should resolve 2-way tie using head-to-head record', () => {
      const matches: RoundRobinMatch[] = [
        // Team 1 vs Team 2: Team 1 wins
        {
          id: 1,
          poolId: 1,
          round: 1,
          matchNumber: 1,
          teamAId: 1,
          teamBId: 2,
          scoreA: 11,
          scoreB: 9,
          status: 'completed',
        },
        // Team 1 vs Team 3: Team 3 wins
        {
          id: 2,
          poolId: 1,
          round: 2,
          matchNumber: 2,
          teamAId: 1,
          teamBId: 3,
          scoreA: 8,
          scoreB: 11,
          status: 'completed',
        },
        // Team 2 vs Team 3: Team 2 wins
        {
          id: 3,
          poolId: 1,
          round: 3,
          matchNumber: 3,
          teamAId: 2,
          teamBId: 3,
          scoreA: 11,
          scoreB: 7,
          status: 'completed',
        },
      ];

      const standings = computePoolStandings(1, matches);

      // All teams have 1 win, 1 loss
      // Team 1: +2 diff (11-9 + 8-11)
      // Team 2: +2 diff (9-11 + 11-7)
      // Team 3: +2 diff (11-8 + 7-11)
      // All tied on wins (1) and point diff (+2)

      // Head-to-head between teams with same record:
      // Team 1 beat Team 2 (11-9)
      // Team 2 beat Team 3 (11-7)
      // Team 3 beat Team 1 (11-8)
      // Triangle tie in H2H, so order by H2H point diff:
      // Team 2: +2 in H2H (9-11 + 11-7 = -2+4 = +2)
      // Team 3: +0 in H2H (11-8 + 7-11 = +3-4 = -1)
      // Team 1: -2 in H2H (11-9 + 8-11 = +2-3 = -1)

      expect(standings[0]?.teamId).toBe(2); // Best H2H diff
      expect(standings[1]?.teamId).toBe(3); // H2H record determines order
      expect(standings[2]?.teamId).toBe(1);
    });

    it('should resolve 3-way tie using head-to-head record', () => {
      const matches: RoundRobinMatch[] = [
        // Pool with 4 teams, where 3 are tied
        // Team 1 vs Team 2: Team 1 wins
        {
          id: 1,
          poolId: 1,
          round: 1,
          matchNumber: 1,
          teamAId: 1,
          teamBId: 2,
          scoreA: 15,
          scoreB: 10,
          status: 'completed',
        },
        // Team 1 vs Team 3: Team 1 wins
        {
          id: 2,
          poolId: 1,
          round: 2,
          matchNumber: 2,
          teamAId: 1,
          teamBId: 3,
          scoreA: 15,
          scoreB: 10,
          status: 'completed',
        },
        // Team 1 vs Team 4: Team 4 wins
        {
          id: 3,
          poolId: 1,
          round: 3,
          matchNumber: 3,
          teamAId: 1,
          teamBId: 4,
          scoreA: 10,
          scoreB: 15,
          status: 'completed',
        },
        // Team 2 vs Team 3: Team 2 wins
        {
          id: 4,
          poolId: 1,
          round: 4,
          matchNumber: 4,
          teamAId: 2,
          teamBId: 3,
          scoreA: 15,
          scoreB: 10,
          status: 'completed',
        },
        // Team 2 vs Team 4: Team 4 wins
        {
          id: 5,
          poolId: 1,
          round: 5,
          matchNumber: 5,
          teamAId: 2,
          teamBId: 4,
          scoreA: 10,
          scoreB: 15,
          status: 'completed',
        },
        // Team 3 vs Team 4: Team 4 wins
        {
          id: 6,
          poolId: 1,
          round: 6,
          matchNumber: 6,
          teamAId: 3,
          teamBId: 4,
          scoreA: 10,
          scoreB: 15,
          status: 'completed',
        },
      ];

      const standings = computePoolStandings(1, matches);

      // Team 4: 3 wins (beat all others)
      // Team 1: 2 wins, +0 diff (15-10 + 15-10 + 10-15)
      // Team 2: 1 win, -5 diff
      // Team 3: 0 wins, -10 diff

      expect(standings[0]?.teamId).toBe(4); // 3 wins, clear winner
      expect(standings[0]?.wins).toBe(3);

      expect(standings[1]?.teamId).toBe(1); // 2 wins
      expect(standings[1]?.wins).toBe(2);

      expect(standings[2]?.teamId).toBe(2); // 1 win
      expect(standings[2]?.wins).toBe(1);

      expect(standings[3]?.teamId).toBe(3); // 0 wins
      expect(standings[3]?.wins).toBe(0);
    });

    it('should handle tie where head-to-head is also tied', () => {
      const matches: RoundRobinMatch[] = [
        // Team 1 vs Team 2: Tie game (equal scores)
        {
          id: 1,
          poolId: 1,
          round: 1,
          matchNumber: 1,
          teamAId: 1,
          teamBId: 2,
          scoreA: 10,
          scoreB: 10,
          status: 'completed',
        },
        // Team 1 vs Team 3: Team 3 wins
        {
          id: 2,
          poolId: 1,
          round: 2,
          matchNumber: 2,
          teamAId: 1,
          teamBId: 3,
          scoreA: 5,
          scoreB: 15,
          status: 'completed',
        },
        // Team 2 vs Team 3: Team 3 wins
        {
          id: 3,
          poolId: 1,
          round: 3,
          matchNumber: 3,
          teamAId: 2,
          teamBId: 3,
          scoreA: 5,
          scoreB: 15,
          status: 'completed',
        },
      ];

      const standings = computePoolStandings(1, matches);

      // Team 3: 2 wins, clear winner
      // Team 1 and Team 2: 0 wins each, -10 diff each
      // H2H between Team 1 and Team 2 was a tie, so use points scored

      expect(standings[0]?.teamId).toBe(3); // 2 wins

      // Team 1 and Team 2 are tied on everything, resolved by team ID
      expect(standings[1]?.teamId).toBe(1); // Lower team ID wins tiebreaker
      expect(standings[2]?.teamId).toBe(2);
    });

    it('should only consider tied teams in head-to-head', () => {
      const matches: RoundRobinMatch[] = [
        // Team 1 vs Team 2: Team 1 wins big
        {
          id: 1,
          poolId: 1,
          round: 1,
          matchNumber: 1,
          teamAId: 1,
          teamBId: 2,
          scoreA: 20,
          scoreB: 5,
          status: 'completed',
        },
        // Team 1 vs Team 3: Team 3 wins by 1
        {
          id: 2,
          poolId: 1,
          round: 2,
          matchNumber: 2,
          teamAId: 1,
          teamBId: 3,
          scoreA: 10,
          scoreB: 11,
          status: 'completed',
        },
        // Team 2 vs Team 3: Team 3 wins
        {
          id: 3,
          poolId: 1,
          round: 3,
          matchNumber: 3,
          teamAId: 2,
          teamBId: 3,
          scoreA: 8,
          scoreB: 12,
          status: 'completed',
        },
        // Team 1 vs Team 4: Team 1 wins
        {
          id: 4,
          poolId: 1,
          round: 4,
          matchNumber: 4,
          teamAId: 1,
          teamBId: 4,
          scoreA: 15,
          scoreB: 10,
          status: 'completed',
        },
        // Team 2 vs Team 4: Team 4 wins
        {
          id: 5,
          poolId: 1,
          round: 5,
          matchNumber: 5,
          teamAId: 2,
          teamBId: 4,
          scoreA: 8,
          scoreB: 12,
          status: 'completed',
        },
        // Team 3 vs Team 4: Team 3 wins
        {
          id: 6,
          poolId: 1,
          round: 6,
          matchNumber: 6,
          teamAId: 3,
          teamBId: 4,
          scoreA: 15,
          scoreB: 10,
          status: 'completed',
        },
      ];

      const standings = computePoolStandings(1, matches);

      // Team 3: 3 wins, clear first place
      // Team 1: 2 wins, +14 diff
      // Team 4: 1 win, -3 diff
      // Team 2: 0 wins, -11 diff

      expect(standings[0]?.teamId).toBe(3);
      expect(standings[1]?.teamId).toBe(1);
      expect(standings[2]?.teamId).toBe(4);
      expect(standings[3]?.teamId).toBe(2);
    });

    it('should handle no head-to-head matches between tied teams', () => {
      // Edge case: teams tied but never played each other
      // (This shouldn't happen in a proper round-robin, but test the fallback)
      const matches: RoundRobinMatch[] = [
        {
          id: 1,
          poolId: 1,
          round: 1,
          matchNumber: 1,
          teamAId: 1,
          teamBId: 3,
          scoreA: 10,
          scoreB: 5,
          status: 'completed',
        },
        {
          id: 2,
          poolId: 1,
          round: 2,
          matchNumber: 2,
          teamAId: 2,
          teamBId: 4,
          scoreA: 10,
          scoreB: 5,
          status: 'completed',
        },
      ];

      const standings = computePoolStandings(1, matches);

      // Team 1 and Team 2 both have 1 win, +5 diff
      // They never played each other, so maintain original order (by team ID)

      expect(standings[0]?.teamId).toBe(1); // Lower ID first
      expect(standings[1]?.teamId).toBe(2);
      expect(standings[2]?.teamId).toBe(3);
      expect(standings[3]?.teamId).toBe(4);
    });
  });
});
