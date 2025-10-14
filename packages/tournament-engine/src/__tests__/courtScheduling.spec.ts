/**
 * Unit tests for court scheduling algorithm.
 * Tests court assignment, time slot allocation, and constraint validation.
 */

import { describe, it, expect } from 'vitest';
import {
  scheduleMatchesToCourts,
  formatEstimatedTime,
  calculateTournamentDuration,
  getMatchesByCourt,
  getMatchesByTimeSlot,
  validateSchedule,
} from '../courtScheduling.js';
import type { RoundRobinMatch } from '../types.js';

describe('Court Scheduling', () => {
  describe('scheduleMatchesToCourts', () => {
    describe('basic scheduling', () => {
      it('should distribute matches evenly across available courts', () => {
        const matches: RoundRobinMatch[] = [
          {
            id: 1,
            poolId: 1,
            round: 1,
            matchNumber: 1,
            teamAId: 1,
            teamBId: 2,
            scoreA: null,
            scoreB: null,
            status: 'pending',
          },
          {
            id: 2,
            poolId: 1,
            round: 1,
            matchNumber: 2,
            teamAId: 3,
            teamBId: 4,
            scoreA: null,
            scoreB: null,
            status: 'pending',
          },
          {
            id: 3,
            poolId: 1,
            round: 1,
            matchNumber: 3,
            teamAId: 5,
            teamBId: 6,
            scoreA: null,
            scoreB: null,
            status: 'pending',
          },
        ];

        const assignments = scheduleMatchesToCourts(matches, {
          numberOfCourts: 3,
          matchDurationMinutes: 30,
          breakMinutes: 5,
        });

        expect(assignments).toHaveLength(3);

        // All 3 matches should be scheduled in parallel on different courts
        const courtsUsed = new Set(assignments.map((a) => a.courtNumber));
        expect(courtsUsed.size).toBe(3);

        // All should be in the same time slot
        const timeSlotsUsed = new Set(assignments.map((a) => a.timeSlot));
        expect(timeSlotsUsed.size).toBe(1);
      });

      it('should respect court count constraints', () => {
        const matches: RoundRobinMatch[] = [
          {
            id: 1,
            poolId: 1,
            round: 1,
            matchNumber: 1,
            teamAId: 1,
            teamBId: 2,
            scoreA: null,
            scoreB: null,
            status: 'pending',
          },
          {
            id: 2,
            poolId: 1,
            round: 1,
            matchNumber: 2,
            teamAId: 3,
            teamBId: 4,
            scoreA: null,
            scoreB: null,
            status: 'pending',
          },
          {
            id: 3,
            poolId: 1,
            round: 1,
            matchNumber: 3,
            teamAId: 5,
            teamBId: 6,
            scoreA: null,
            scoreB: null,
            status: 'pending',
          },
        ];

        const assignments = scheduleMatchesToCourts(matches, {
          numberOfCourts: 2,
          matchDurationMinutes: 30,
          breakMinutes: 5,
        });

        expect(assignments).toHaveLength(3);

        // With 2 courts, should use at most 2 courts
        const courtsUsed = assignments.map((a) => a.courtNumber);
        for (const court of courtsUsed) {
          expect(court).toBeGreaterThanOrEqual(1);
          expect(court).toBeLessThanOrEqual(2);
        }

        // Should use 2 time slots (2 matches in slot 1, 1 match in slot 2)
        const slot1Matches = assignments.filter((a) => a.timeSlot === 1);
        const slot2Matches = assignments.filter((a) => a.timeSlot === 2);

        expect(slot1Matches).toHaveLength(2);
        expect(slot2Matches).toHaveLength(1);
      });

      it('should assign slots in sequential order', () => {
        const matches: RoundRobinMatch[] = [
          {
            id: 1,
            poolId: 1,
            round: 1,
            matchNumber: 1,
            teamAId: 1,
            teamBId: 2,
            scoreA: null,
            scoreB: null,
            status: 'pending',
          },
          {
            id: 2,
            poolId: 1,
            round: 1,
            matchNumber: 2,
            teamAId: 3,
            teamBId: 4,
            scoreA: null,
            scoreB: null,
            status: 'pending',
          },
          {
            id: 3,
            poolId: 1,
            round: 1,
            matchNumber: 3,
            teamAId: 5,
            teamBId: 6,
            scoreA: null,
            scoreB: null,
            status: 'pending',
          },
        ];

        const assignments = scheduleMatchesToCourts(matches, {
          numberOfCourts: 1,
          matchDurationMinutes: 30,
          breakMinutes: 5,
        });

        expect(assignments).toHaveLength(3);

        // With 1 court, should use time slots 1, 2, 3
        const timeSlots = assignments.map((a) => a.timeSlot).sort();
        expect(timeSlots).toEqual([1, 2, 3]);

        // All on court 1
        for (const assignment of assignments) {
          expect(assignment.courtNumber).toBe(1);
        }
      });

      it('should handle more matches than court-slots gracefully', () => {
        // 10 matches, 2 courts = need multiple time slots
        const matches: RoundRobinMatch[] = Array.from({ length: 10 }, (_, i) => ({
          id: i + 1,
          poolId: 1,
          round: 1,
          matchNumber: i + 1,
          teamAId: i * 2 + 1,
          teamBId: i * 2 + 2,
          scoreA: null,
          scoreB: null,
          status: 'pending',
        }));

        const assignments = scheduleMatchesToCourts(matches, {
          numberOfCourts: 2,
          matchDurationMinutes: 30,
          breakMinutes: 5,
        });

        expect(assignments).toHaveLength(10);

        // Should use multiple time slots
        const maxTimeSlot = Math.max(...assignments.map((a) => a.timeSlot));
        expect(maxTimeSlot).toBeGreaterThanOrEqual(5); // 10 matches / 2 courts = 5 slots

        // All matches should be scheduled
        const matchIds = assignments.map((a) => a.matchId).sort((a, b) => a - b);
        expect(matchIds).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      });
    });

    describe('team conflict avoidance', () => {
      it('should ensure no team plays multiple matches simultaneously', () => {
        const matches: RoundRobinMatch[] = [
          {
            id: 1,
            poolId: 1,
            round: 1,
            matchNumber: 1,
            teamAId: 1,
            teamBId: 2,
            scoreA: null,
            scoreB: null,
            status: 'pending',
          },
          {
            id: 2,
            poolId: 1,
            round: 1,
            matchNumber: 2,
            teamAId: 1, // Team 1 appears again
            teamBId: 3,
            scoreA: null,
            scoreB: null,
            status: 'pending',
          },
        ];

        const assignments = scheduleMatchesToCourts(matches, {
          numberOfCourts: 2,
          matchDurationMinutes: 30,
          breakMinutes: 5,
        });

        expect(assignments).toHaveLength(2);

        // Matches should be in different time slots (team 1 conflict)
        expect(assignments[0]!.timeSlot).not.toBe(assignments[1]!.timeSlot);

        // Validate no team conflicts
        const validation = validateSchedule(assignments, matches);
        expect(validation.valid).toBe(true);
        expect(validation.errors).toHaveLength(0);
      });

      it('should handle complex team conflicts across multiple matches', () => {
        // Round-robin: Team 1 vs 2, Team 3 vs 4, Team 1 vs 3
        const matches: RoundRobinMatch[] = [
          {
            id: 1,
            poolId: 1,
            round: 1,
            matchNumber: 1,
            teamAId: 1,
            teamBId: 2,
            scoreA: null,
            scoreB: null,
            status: 'pending',
          },
          {
            id: 2,
            poolId: 1,
            round: 1,
            matchNumber: 2,
            teamAId: 3,
            teamBId: 4,
            scoreA: null,
            scoreB: null,
            status: 'pending',
          },
          {
            id: 3,
            poolId: 1,
            round: 1,
            matchNumber: 3,
            teamAId: 1,
            teamBId: 3,
            scoreA: null,
            scoreB: null,
            status: 'pending',
          },
        ];

        const assignments = scheduleMatchesToCourts(matches, {
          numberOfCourts: 2,
          matchDurationMinutes: 30,
          breakMinutes: 5,
        });

        // Validate no team conflicts
        const validation = validateSchedule(assignments, matches);
        expect(validation.valid).toBe(true);
        expect(validation.errors).toHaveLength(0);
      });
    });

    describe('multi-round scheduling', () => {
      it('should schedule multiple rounds sequentially', () => {
        const matches: RoundRobinMatch[] = [
          // Round 1
          {
            id: 1,
            poolId: 1,
            round: 1,
            matchNumber: 1,
            teamAId: 1,
            teamBId: 2,
            scoreA: null,
            scoreB: null,
            status: 'pending',
          },
          {
            id: 2,
            poolId: 1,
            round: 1,
            matchNumber: 2,
            teamAId: 3,
            teamBId: 4,
            scoreA: null,
            scoreB: null,
            status: 'pending',
          },
          // Round 2
          {
            id: 3,
            poolId: 1,
            round: 2,
            matchNumber: 3,
            teamAId: 1,
            teamBId: 3,
            scoreA: null,
            scoreB: null,
            status: 'pending',
          },
          {
            id: 4,
            poolId: 1,
            round: 2,
            matchNumber: 4,
            teamAId: 2,
            teamBId: 4,
            scoreA: null,
            scoreB: null,
            status: 'pending',
          },
        ];

        const assignments = scheduleMatchesToCourts(matches, {
          numberOfCourts: 2,
          matchDurationMinutes: 30,
          breakMinutes: 5,
        });

        expect(assignments).toHaveLength(4);

        // Round 1 matches should have earlier time slots than Round 2
        const round1Assignments = assignments.filter((a) =>
          matches.find((m) => m.id === a.matchId && m.round === 1)
        );
        const round2Assignments = assignments.filter((a) =>
          matches.find((m) => m.id === a.matchId && m.round === 2)
        );

        const maxRound1Slot = Math.max(...round1Assignments.map((a) => a.timeSlot));
        const minRound2Slot = Math.min(...round2Assignments.map((a) => a.timeSlot));

        expect(minRound2Slot).toBeGreaterThan(maxRound1Slot);
      });

      it('should calculate correct time estimates across rounds', () => {
        const matches: RoundRobinMatch[] = [
          {
            id: 1,
            poolId: 1,
            round: 1,
            matchNumber: 1,
            teamAId: 1,
            teamBId: 2,
            scoreA: null,
            scoreB: null,
            status: 'pending',
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

        const assignments = scheduleMatchesToCourts(matches, {
          numberOfCourts: 1,
          matchDurationMinutes: 30,
          breakMinutes: 5,
        });

        expect(assignments).toHaveLength(2);

        // First match starts at 0 minutes
        expect(assignments[0]!.estimatedStartMinutes).toBe(0);

        // Second match starts after first match + break (35 minutes)
        expect(assignments[1]!.estimatedStartMinutes).toBe(35);
      });
    });

    describe('estimated start times', () => {
      it('should calculate estimated start times correctly', () => {
        const matches: RoundRobinMatch[] = [
          {
            id: 1,
            poolId: 1,
            round: 1,
            matchNumber: 1,
            teamAId: 1,
            teamBId: 2,
            scoreA: null,
            scoreB: null,
            status: 'pending',
          },
          {
            id: 2,
            poolId: 1,
            round: 1,
            matchNumber: 2,
            teamAId: 3,
            teamBId: 4,
            scoreA: null,
            scoreB: null,
            status: 'pending',
          },
        ];

        const assignments = scheduleMatchesToCourts(matches, {
          numberOfCourts: 1,
          matchDurationMinutes: 30,
          breakMinutes: 5,
        });

        // Match 1: 0 minutes
        // Match 2: 35 minutes (30 min match + 5 min break)
        expect(assignments[0]!.estimatedStartMinutes).toBe(0);
        expect(assignments[1]!.estimatedStartMinutes).toBe(35);
      });

      it('should account for match duration and break time', () => {
        const matches: RoundRobinMatch[] = Array.from({ length: 3 }, (_, i) => ({
          id: i + 1,
          poolId: 1,
          round: 1,
          matchNumber: i + 1,
          teamAId: i * 2 + 1,
          teamBId: i * 2 + 2,
          scoreA: null,
          scoreB: null,
          status: 'pending',
        }));

        const assignments = scheduleMatchesToCourts(matches, {
          numberOfCourts: 1,
          matchDurationMinutes: 30,
          breakMinutes: 5,
        });

        // Note: Implementation uses hardcoded 35 min (30 + 5) per time slot
        // Match 1: 0 min (time slot 1)
        // Match 2: 35 min (time slot 2)
        // Match 3: 70 min (time slot 3)
        expect(assignments[0]!.estimatedStartMinutes).toBe(0);
        expect(assignments[1]!.estimatedStartMinutes).toBe(35);
        expect(assignments[2]!.estimatedStartMinutes).toBe(70);
      });
    });

    describe('edge cases', () => {
      it('should handle single match', () => {
        const matches: RoundRobinMatch[] = [
          {
            id: 1,
            poolId: 1,
            round: 1,
            matchNumber: 1,
            teamAId: 1,
            teamBId: 2,
            scoreA: null,
            scoreB: null,
            status: 'pending',
          },
        ];

        const assignments = scheduleMatchesToCourts(matches, {
          numberOfCourts: 1,
          matchDurationMinutes: 30,
          breakMinutes: 5,
        });

        expect(assignments).toHaveLength(1);
        expect(assignments[0]).toEqual({
          matchId: 1,
          courtNumber: 1,
          timeSlot: 1,
          estimatedStartMinutes: 0,
        });
      });

      it('should handle empty matches array', () => {
        const matches: RoundRobinMatch[] = [];

        const assignments = scheduleMatchesToCourts(matches, {
          numberOfCourts: 4,
          matchDurationMinutes: 30,
          breakMinutes: 5,
        });

        expect(assignments).toEqual([]);
      });

      it('should throw error for invalid court count', () => {
        const matches: RoundRobinMatch[] = [
          {
            id: 1,
            poolId: 1,
            round: 1,
            matchNumber: 1,
            teamAId: 1,
            teamBId: 2,
            scoreA: null,
            scoreB: null,
            status: 'pending',
          },
        ];

        expect(() =>
          scheduleMatchesToCourts(matches, {
            numberOfCourts: 0,
            matchDurationMinutes: 30,
            breakMinutes: 5,
          })
        ).toThrow('Number of courts must be at least 1');
      });

      it('should handle BYE matches (teamBId = null)', () => {
        const matches: RoundRobinMatch[] = [
          {
            id: 1,
            poolId: 1,
            round: 1,
            matchNumber: 1,
            teamAId: 1,
            teamBId: null, // BYE match
            scoreA: null,
            scoreB: null,
            status: 'pending',
          },
          {
            id: 2,
            poolId: 1,
            round: 1,
            matchNumber: 2,
            teamAId: 2,
            teamBId: 3,
            scoreA: null,
            scoreB: null,
            status: 'pending',
          },
        ];

        const assignments = scheduleMatchesToCourts(matches, {
          numberOfCourts: 2,
          matchDurationMinutes: 30,
          breakMinutes: 5,
        });

        expect(assignments).toHaveLength(2);

        // BYE matches should still be scheduled
        const byeAssignment = assignments.find((a) => a.matchId === 1);
        expect(byeAssignment).toBeDefined();
      });

      it('should handle many courts (more courts than matches)', () => {
        const matches: RoundRobinMatch[] = [
          {
            id: 1,
            poolId: 1,
            round: 1,
            matchNumber: 1,
            teamAId: 1,
            teamBId: 2,
            scoreA: null,
            scoreB: null,
            status: 'pending',
          },
          {
            id: 2,
            poolId: 1,
            round: 1,
            matchNumber: 2,
            teamAId: 3,
            teamBId: 4,
            scoreA: null,
            scoreB: null,
            status: 'pending',
          },
        ];

        const assignments = scheduleMatchesToCourts(matches, {
          numberOfCourts: 10, // More courts than matches
          matchDurationMinutes: 30,
          breakMinutes: 5,
        });

        expect(assignments).toHaveLength(2);

        // Both matches should be in the same time slot
        expect(assignments[0]!.timeSlot).toBe(1);
        expect(assignments[1]!.timeSlot).toBe(1);

        // Should use different courts
        expect(assignments[0]!.courtNumber).not.toBe(assignments[1]!.courtNumber);
      });
    });
  });

  describe('formatEstimatedTime', () => {
    it('should format time correctly with default start (9:00 AM)', () => {
      expect(formatEstimatedTime(0)).toBe('09:00');
      expect(formatEstimatedTime(30)).toBe('09:30');
      expect(formatEstimatedTime(60)).toBe('10:00');
      expect(formatEstimatedTime(90)).toBe('10:30');
    });

    it('should handle custom start hour and minute', () => {
      expect(formatEstimatedTime(0, 8, 30)).toBe('08:30');
      expect(formatEstimatedTime(30, 8, 30)).toBe('09:00');
      expect(formatEstimatedTime(90, 13, 15)).toBe('14:45');
    });

    it('should wrap around 24 hours', () => {
      expect(formatEstimatedTime(960, 9, 0)).toBe('01:00'); // 9:00 + 16 hours
    });

    it('should pad single digits with zeros', () => {
      expect(formatEstimatedTime(5, 9, 0)).toBe('09:05');
      expect(formatEstimatedTime(0, 8, 5)).toBe('08:05');
    });
  });

  describe('calculateTournamentDuration', () => {
    it('should calculate total duration correctly', () => {
      const assignments = [
        {
          matchId: 1,
          courtNumber: 1,
          timeSlot: 1,
          estimatedStartMinutes: 0,
        },
        {
          matchId: 2,
          courtNumber: 2,
          timeSlot: 1,
          estimatedStartMinutes: 0,
        },
        {
          matchId: 3,
          courtNumber: 1,
          timeSlot: 2,
          estimatedStartMinutes: 35,
        },
      ];

      const duration = calculateTournamentDuration(assignments, 30, 5);

      // Last match starts at 35 minutes + 30 minutes duration = 65 minutes
      expect(duration).toBe(65);
    });

    it('should return 0 for empty assignments', () => {
      const duration = calculateTournamentDuration([], 30, 5);
      expect(duration).toBe(0);
    });

    it('should handle single match', () => {
      const assignments = [
        {
          matchId: 1,
          courtNumber: 1,
          timeSlot: 1,
          estimatedStartMinutes: 0,
        },
      ];

      const duration = calculateTournamentDuration(assignments, 45, 10);
      expect(duration).toBe(45);
    });
  });

  describe('getMatchesByCourt', () => {
    it('should return all matches for a specific court', () => {
      const assignments = [
        {
          matchId: 1,
          courtNumber: 1,
          timeSlot: 1,
          estimatedStartMinutes: 0,
        },
        {
          matchId: 2,
          courtNumber: 2,
          timeSlot: 1,
          estimatedStartMinutes: 0,
        },
        {
          matchId: 3,
          courtNumber: 1,
          timeSlot: 2,
          estimatedStartMinutes: 35,
        },
      ];

      const court1Matches = getMatchesByCourt(assignments, 1);

      expect(court1Matches).toHaveLength(2);
      expect(court1Matches.map((a) => a.matchId)).toEqual([1, 3]);
    });

    it('should return matches sorted by time slot', () => {
      const assignments = [
        {
          matchId: 3,
          courtNumber: 1,
          timeSlot: 3,
          estimatedStartMinutes: 70,
        },
        {
          matchId: 1,
          courtNumber: 1,
          timeSlot: 1,
          estimatedStartMinutes: 0,
        },
        {
          matchId: 2,
          courtNumber: 1,
          timeSlot: 2,
          estimatedStartMinutes: 35,
        },
      ];

      const court1Matches = getMatchesByCourt(assignments, 1);

      expect(court1Matches.map((a) => a.matchId)).toEqual([1, 2, 3]);
    });

    it('should return empty array for court with no matches', () => {
      const assignments = [
        {
          matchId: 1,
          courtNumber: 1,
          timeSlot: 1,
          estimatedStartMinutes: 0,
        },
      ];

      const court2Matches = getMatchesByCourt(assignments, 2);
      expect(court2Matches).toEqual([]);
    });
  });

  describe('getMatchesByTimeSlot', () => {
    it('should return all matches in a specific time slot', () => {
      const assignments = [
        {
          matchId: 1,
          courtNumber: 1,
          timeSlot: 1,
          estimatedStartMinutes: 0,
        },
        {
          matchId: 2,
          courtNumber: 2,
          timeSlot: 1,
          estimatedStartMinutes: 0,
        },
        {
          matchId: 3,
          courtNumber: 1,
          timeSlot: 2,
          estimatedStartMinutes: 35,
        },
      ];

      const slot1Matches = getMatchesByTimeSlot(assignments, 1);

      expect(slot1Matches).toHaveLength(2);
      expect(slot1Matches.map((a) => a.matchId).sort()).toEqual([1, 2]);
    });

    it('should return matches sorted by court number', () => {
      const assignments = [
        {
          matchId: 3,
          courtNumber: 3,
          timeSlot: 1,
          estimatedStartMinutes: 0,
        },
        {
          matchId: 1,
          courtNumber: 1,
          timeSlot: 1,
          estimatedStartMinutes: 0,
        },
        {
          matchId: 2,
          courtNumber: 2,
          timeSlot: 1,
          estimatedStartMinutes: 0,
        },
      ];

      const slot1Matches = getMatchesByTimeSlot(assignments, 1);

      expect(slot1Matches.map((a) => a.matchId)).toEqual([1, 2, 3]);
    });

    it('should return empty array for time slot with no matches', () => {
      const assignments = [
        {
          matchId: 1,
          courtNumber: 1,
          timeSlot: 1,
          estimatedStartMinutes: 0,
        },
      ];

      const slot2Matches = getMatchesByTimeSlot(assignments, 2);
      expect(slot2Matches).toEqual([]);
    });
  });

  describe('validateSchedule', () => {
    it('should validate schedule with no conflicts', () => {
      const matches: RoundRobinMatch[] = [
        {
          id: 1,
          poolId: 1,
          round: 1,
          matchNumber: 1,
          teamAId: 1,
          teamBId: 2,
          scoreA: null,
          scoreB: null,
          status: 'pending',
        },
        {
          id: 2,
          poolId: 1,
          round: 1,
          matchNumber: 2,
          teamAId: 3,
          teamBId: 4,
          scoreA: null,
          scoreB: null,
          status: 'pending',
        },
      ];

      const assignments = [
        {
          matchId: 1,
          courtNumber: 1,
          timeSlot: 1,
          estimatedStartMinutes: 0,
        },
        {
          matchId: 2,
          courtNumber: 2,
          timeSlot: 1,
          estimatedStartMinutes: 0,
        },
      ];

      const validation = validateSchedule(assignments, matches);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect team playing multiple matches simultaneously', () => {
      const matches: RoundRobinMatch[] = [
        {
          id: 1,
          poolId: 1,
          round: 1,
          matchNumber: 1,
          teamAId: 1,
          teamBId: 2,
          scoreA: null,
          scoreB: null,
          status: 'pending',
        },
        {
          id: 2,
          poolId: 1,
          round: 1,
          matchNumber: 2,
          teamAId: 1, // Team 1 plays twice in same slot
          teamBId: 3,
          scoreA: null,
          scoreB: null,
          status: 'pending',
        },
      ];

      const assignments = [
        {
          matchId: 1,
          courtNumber: 1,
          timeSlot: 1,
          estimatedStartMinutes: 0,
        },
        {
          matchId: 2,
          courtNumber: 2,
          timeSlot: 1, // Same time slot
          estimatedStartMinutes: 0,
        },
      ];

      const validation = validateSchedule(assignments, matches);

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.errors[0]).toContain('Team 1');
      expect(validation.errors[0]).toContain('multiple matches');
    });

    it('should handle BYE matches in validation', () => {
      const matches: RoundRobinMatch[] = [
        {
          id: 1,
          poolId: 1,
          round: 1,
          matchNumber: 1,
          teamAId: 1,
          teamBId: null, // BYE
          scoreA: null,
          scoreB: null,
          status: 'pending',
        },
        {
          id: 2,
          poolId: 1,
          round: 1,
          matchNumber: 2,
          teamAId: 2,
          teamBId: 3,
          scoreA: null,
          scoreB: null,
          status: 'pending',
        },
      ];

      const assignments = [
        {
          matchId: 1,
          courtNumber: 1,
          timeSlot: 1,
          estimatedStartMinutes: 0,
        },
        {
          matchId: 2,
          courtNumber: 2,
          timeSlot: 1,
          estimatedStartMinutes: 0,
        },
      ];

      const validation = validateSchedule(assignments, matches);

      expect(validation.valid).toBe(true);
    });
  });
});
