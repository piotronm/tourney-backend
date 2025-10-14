import { describe, it, expect } from 'vitest';
import {
  mapMatchesToExportRows,
  exportRowsToCSV,
  createTeamsById,
  createPoolsById,
} from '../index.js';
import type { RoundRobinMatch, Team, Pool } from '../types.js';

describe('Export Mapping', () => {
  describe('mapMatchesToExportRows', () => {
    it('should map matches to export rows with pool names', () => {
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

      const teams: Team[] = [
        { id: 1, name: 'Team Alpha' },
        { id: 2, name: 'Team Beta' },
      ];

      const pools: Pool[] = [{ id: 1, name: 'Pool A', teamIds: [1, 2] }];

      const teamsById = createTeamsById(teams);
      const poolsById = createPoolsById(pools);
      const rows = mapMatchesToExportRows(matches, teamsById, poolsById);

      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({
        pool: 'Pool A',
        round: 1,
        match: 1,
        teamA: 'Team Alpha',
        scoreA: '',
        scoreB: '',
        teamB: 'Team Beta',
        status: 'pending',
      });
    });

    it('should use default pool name when poolsById not provided', () => {
      const matches: RoundRobinMatch[] = [
        {
          id: 1,
          poolId: 5,
          round: 1,
          matchNumber: 1,
          teamAId: 1,
          teamBId: 2,
          scoreA: null,
          scoreB: null,
          status: 'pending',
        },
      ];

      const teams: Team[] = [
        { id: 1, name: 'Team A' },
        { id: 2, name: 'Team B' },
      ];

      const teamsById = createTeamsById(teams);
      const rows = mapMatchesToExportRows(matches, teamsById);

      expect(rows[0]?.pool).toBe('Pool 5');
    });

    it('should handle completed matches with scores', () => {
      const matches: RoundRobinMatch[] = [
        {
          id: 1,
          poolId: 1,
          round: 2,
          matchNumber: 5,
          teamAId: 1,
          teamBId: 2,
          scoreA: 10,
          scoreB: 7,
          status: 'completed',
        },
      ];

      const teams: Team[] = [
        { id: 1, name: 'Team A' },
        { id: 2, name: 'Team B' },
      ];

      const teamsById = createTeamsById(teams);
      const rows = mapMatchesToExportRows(matches, teamsById);

      expect(rows[0]).toEqual({
        pool: 'Pool 1',
        round: 2,
        match: 5,
        teamA: 'Team A',
        scoreA: '10',
        scoreB: '7',
        teamB: 'Team B',
        status: 'completed',
      });
    });

    it('should handle BYE matches', () => {
      const matches: RoundRobinMatch[] = [
        {
          id: 1,
          poolId: 1,
          round: 1,
          matchNumber: 1,
          teamAId: 1,
          teamBId: null,
          scoreA: null,
          scoreB: null,
          status: 'pending',
        },
      ];

      const teams: Team[] = [{ id: 1, name: 'Team A' }];

      const teamsById = createTeamsById(teams);
      const rows = mapMatchesToExportRows(matches, teamsById);

      expect(rows[0]?.teamB).toBe('BYE');
    });

    it('should handle missing team data gracefully', () => {
      const matches: RoundRobinMatch[] = [
        {
          id: 1,
          poolId: 1,
          round: 1,
          matchNumber: 1,
          teamAId: 99,
          teamBId: 100,
          scoreA: null,
          scoreB: null,
          status: 'pending',
        },
      ];

      const teamsById = new Map<number, Team>();
      const rows = mapMatchesToExportRows(matches, teamsById);

      expect(rows[0]?.teamA).toBe('Team 99');
      expect(rows[0]?.teamB).toBe('Team 100');
    });

    it('should handle zero scores', () => {
      const matches: RoundRobinMatch[] = [
        {
          id: 1,
          poolId: 1,
          round: 1,
          matchNumber: 1,
          teamAId: 1,
          teamBId: 2,
          scoreA: 0,
          scoreB: 0,
          status: 'completed',
        },
      ];

      const teams: Team[] = [
        { id: 1, name: 'Team A' },
        { id: 2, name: 'Team B' },
      ];

      const teamsById = createTeamsById(teams);
      const rows = mapMatchesToExportRows(matches, teamsById);

      expect(rows[0]?.scoreA).toBe('0');
      expect(rows[0]?.scoreB).toBe('0');
    });
  });

  describe('exportRowsToCSV', () => {
    it('should generate CSV with headers and data', () => {
      const rows = [
        {
          pool: 'Pool A',
          round: 1,
          match: 1,
          teamA: 'Team Alpha',
          scoreA: '',
          scoreB: '',
          teamB: 'Team Beta',
          status: 'pending',
        },
        {
          pool: 'Pool A',
          round: 1,
          match: 2,
          teamA: 'Team Gamma',
          scoreA: '10',
          scoreB: '5',
          teamB: 'Team Delta',
          status: 'completed',
        },
      ];

      const csv = exportRowsToCSV(rows);

      expect(csv).toContain('Pool,Round,Match,TeamA,ScoreA,ScoreB,TeamB,Status');
      expect(csv).toContain('Pool A,1,1,Team Alpha,,,Team Beta,pending');
      expect(csv).toContain('Pool A,1,2,Team Gamma,10,5,Team Delta,completed');
    });

    it('should escape fields with commas', () => {
      const rows = [
        {
          pool: 'Pool A',
          round: 1,
          match: 1,
          teamA: 'Team, Alpha',
          scoreA: '',
          scoreB: '',
          teamB: 'Team Beta',
          status: 'pending',
        },
      ];

      const csv = exportRowsToCSV(rows);

      expect(csv).toContain('"Team, Alpha"');
    });

    it('should escape fields with quotes', () => {
      const rows = [
        {
          pool: 'Pool A',
          round: 1,
          match: 1,
          teamA: 'Team "Alpha"',
          scoreA: '',
          scoreB: '',
          teamB: 'Team Beta',
          status: 'pending',
        },
      ];

      const csv = exportRowsToCSV(rows);

      expect(csv).toContain('"Team ""Alpha"""');
    });

    it('should escape fields with newlines', () => {
      const rows = [
        {
          pool: 'Pool A',
          round: 1,
          match: 1,
          teamA: 'Team\nAlpha',
          scoreA: '',
          scoreB: '',
          teamB: 'Team Beta',
          status: 'pending',
        },
      ];

      const csv = exportRowsToCSV(rows);

      expect(csv).toContain('"Team\nAlpha"');
    });

    it('should handle empty rows', () => {
      const csv = exportRowsToCSV([]);

      expect(csv).toBe('Pool,Round,Match,TeamA,ScoreA,ScoreB,TeamB,Status');
    });
  });

  describe('Helper Functions', () => {
    it('createTeamsById should create correct map', () => {
      const teams: Team[] = [
        { id: 1, name: 'Team A' },
        { id: 2, name: 'Team B' },
        { id: 5, name: 'Team E' },
      ];

      const map = createTeamsById(teams);

      expect(map.size).toBe(3);
      expect(map.get(1)?.name).toBe('Team A');
      expect(map.get(2)?.name).toBe('Team B');
      expect(map.get(5)?.name).toBe('Team E');
      expect(map.get(99)).toBeUndefined();
    });

    it('createPoolsById should create correct map', () => {
      const pools: Pool[] = [
        { id: 1, name: 'Pool A', teamIds: [1, 2] },
        { id: 2, name: 'Pool B', teamIds: [3, 4] },
      ];

      const map = createPoolsById(pools);

      expect(map.size).toBe(2);
      expect(map.get(1)?.name).toBe('Pool A');
      expect(map.get(2)?.name).toBe('Pool B');
      expect(map.get(99)).toBeUndefined();
    });
  });
});
