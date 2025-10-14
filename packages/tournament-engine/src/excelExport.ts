/**
 * Excel export mapping utilities.
 * Converts tournament data to Excel-compatible format with additional metadata.
 */

import type {
  RoundRobinMatch,
  ExcelExportRow,
  Team,
  Pool,
  Player,
  CourtAssignment,
} from './types.js';
import { calculateAverageRating, getTeamPlayers } from './duprTeams.js';
import { formatEstimatedTime } from './courtScheduling.js';

/**
 * Maps matches to Excel export rows with enhanced data.
 *
 * Excel export includes:
 * - All standard CSV fields
 * - Court assignments and start times
 * - Team DUPR ratings (if players provided)
 * - Individual player names
 *
 * @param matches - Array of matches to export
 * @param teamsById - Map of team ID to Team object
 * @param poolsById - Optional map of pool ID to Pool object
 * @param players - Optional array of players for DUPR info
 * @param courtAssignments - Optional court assignments
 * @returns Array of ExcelExportRow objects
 */
export function mapMatchesToExcelRows(
  matches: RoundRobinMatch[],
  teamsById: Map<number, Team>,
  poolsById?: Map<number, Pool>,
  players?: Player[],
  courtAssignments?: CourtAssignment[]
): ExcelExportRow[] {
  const rows: ExcelExportRow[] = [];

  // Create court assignment lookup
  const assignmentByMatch = new Map<number, CourtAssignment>();
  if (courtAssignments) {
    for (const assignment of courtAssignments) {
      assignmentByMatch.set(assignment.matchId, assignment);
    }
  }

  for (const match of matches) {
    // Get pool name
    let poolName = `Pool ${match.poolId}`;
    if (poolsById) {
      const pool = poolsById.get(match.poolId);
      if (pool) {
        poolName = pool.name;
      }
    }

    // Get team names
    const teamA = teamsById.get(match.teamAId);
    const teamAName = teamA?.name ?? `Team ${match.teamAId}`;

    const teamBName =
      match.teamBId === null
        ? 'BYE'
        : teamsById.get(match.teamBId)?.name ?? `Team ${match.teamBId}`;

    // Format scores
    const scoreA = formatScore(match.scoreA);
    const scoreB = formatScore(match.scoreB);

    // Get court assignment
    const assignment = assignmentByMatch.get(match.id);
    const court = assignment ? `Court ${assignment.courtNumber}` : '';
    const startTime = assignment
      ? formatEstimatedTime(assignment.estimatedStartMinutes)
      : '';

    // Get player info and DUPR ratings
    let teamADupr = '';
    let teamBDupr = '';
    let teamAPlayers = '';
    let teamBPlayers = '';

    if (players) {
      // Team A players
      const teamAPlayerList = getTeamPlayers(match.teamAId, players);
      if (teamAPlayerList.length > 0) {
        teamADupr = calculateAverageRating(teamAPlayerList).toFixed(2);
        teamAPlayers = teamAPlayerList.map((p) => p.name).join(' / ');
      }

      // Team B players
      if (match.teamBId !== null) {
        const teamBPlayerList = getTeamPlayers(match.teamBId, players);
        if (teamBPlayerList.length > 0) {
          teamBDupr = calculateAverageRating(teamBPlayerList).toFixed(2);
          teamBPlayers = teamBPlayerList.map((p) => p.name).join(' / ');
        }
      }
    }

    rows.push({
      pool: poolName,
      round: match.round,
      match: match.matchNumber,
      teamA: teamAName,
      scoreA,
      scoreB,
      teamB: teamBName,
      status: match.status,
      court,
      startTime,
      teamADupr,
      teamBDupr,
      teamAPlayers,
      teamBPlayers,
    });
  }

  return rows;
}

/**
 * Formats a score value for export.
 */
function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined) {
    return '';
  }
  return String(score);
}

/**
 * Converts Excel export rows to TSV (Tab-Separated Values) format.
 * TSV is more Excel-friendly than CSV for import.
 *
 * @param rows - Array of export rows
 * @returns TSV string with headers and data
 */
export function exportRowsToTSV(rows: ExcelExportRow[]): string {
  const headers = [
    'Pool',
    'Round',
    'Match',
    'Court',
    'Start Time',
    'Team A',
    'Team A Players',
    'Team A DUPR',
    'Score A',
    'Score B',
    'Team B DUPR',
    'Team B Players',
    'Team B',
    'Status',
  ];

  const tsvRows: string[] = [headers.join('\t')];

  for (const row of rows) {
    const values = [
      escapeTSVField(row.pool),
      String(row.round),
      String(row.match),
      escapeTSVField(row.court ?? ''),
      escapeTSVField(row.startTime ?? ''),
      escapeTSVField(row.teamA),
      escapeTSVField(row.teamAPlayers ?? ''),
      escapeTSVField(row.teamADupr ?? ''),
      escapeTSVField(row.scoreA),
      escapeTSVField(row.scoreB),
      escapeTSVField(row.teamBDupr ?? ''),
      escapeTSVField(row.teamBPlayers ?? ''),
      escapeTSVField(row.teamB),
      escapeTSVField(row.status),
    ];
    tsvRows.push(values.join('\t'));
  }

  return tsvRows.join('\n');
}

/**
 * Escapes a TSV field value (mainly handles tabs and newlines).
 */
function escapeTSVField(value: string): string {
  if (!value) return value;

  // Replace tabs with spaces
  let escaped = value.replace(/\t/g, ' ');

  // Replace newlines with spaces
  escaped = escaped.replace(/\n/g, ' ');

  // Replace carriage returns with spaces
  escaped = escaped.replace(/\r/g, ' ');

  return escaped;
}

/**
 * Creates a summary sheet for Excel export.
 * Includes tournament statistics and overview.
 */
export function createTournamentSummary(
  teams: Team[],
  matches: RoundRobinMatch[],
  pools: Pool[],
  players?: Player[],
  divisionName?: string
): string {
  const lines: string[] = [];

  lines.push('TOURNAMENT SUMMARY');
  lines.push('');

  if (divisionName) {
    lines.push(`Division:\t${divisionName}`);
    lines.push('');
  }

  // Basic stats
  lines.push(`Total Teams:\t${teams.length}`);
  lines.push(`Total Pools:\t${pools.length}`);
  lines.push(`Total Matches:\t${matches.length}`);

  if (players) {
    lines.push(`Total Players:\t${players.length}`);

    // DUPR rating stats
    const ratings = players.map((p) => p.duprRating);
    const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    const minRating = Math.min(...ratings);
    const maxRating = Math.max(...ratings);

    lines.push('');
    lines.push('DUPR RATING STATISTICS');
    lines.push(`Average Rating:\t${avgRating.toFixed(2)}`);
    lines.push(`Min Rating:\t${minRating.toFixed(2)}`);
    lines.push(`Max Rating:\t${maxRating.toFixed(2)}`);
    lines.push(`Rating Range:\t${(maxRating - minRating).toFixed(2)}`);
  }

  // Match status breakdown
  const pending = matches.filter((m) => m.status === 'pending').length;
  const completed = matches.filter((m) => m.status === 'completed').length;

  lines.push('');
  lines.push('MATCH STATUS');
  lines.push(`Pending:\t${pending}`);
  lines.push(`Completed:\t${completed}`);

  // Pool breakdown
  lines.push('');
  lines.push('POOL BREAKDOWN');
  for (const pool of pools) {
    const poolMatches = matches.filter((m) => m.poolId === pool.id);
    lines.push(`${pool.name}:\t${pool.teamIds.length} teams, ${poolMatches.length} matches`);
  }

  return lines.join('\n');
}

/**
 * Creates a player roster sheet for Excel export.
 */
export function createPlayerRoster(
  players: Player[],
  teams: Team[]
): string {
  const lines: string[] = [];

  lines.push('PLAYER ROSTER');
  lines.push('');
  lines.push('Player Name\tDUPR Rating\tTeam');

  // Sort players by team, then by rating
  const sortedPlayers = [...players].sort((a, b) => {
    if (a.teamId !== b.teamId) {
      return (a.teamId ?? 0) - (b.teamId ?? 0);
    }
    return b.duprRating - a.duprRating;
  });

  for (const player of sortedPlayers) {
    const team = player.teamId ? teams.find((t) => t.id === player.teamId) : null;
    const teamName = team?.name ?? 'Unassigned';

    lines.push(
      `${escapeTSVField(player.name)}\t${player.duprRating.toFixed(2)}\t${escapeTSVField(teamName)}`
    );
  }

  return lines.join('\n');
}
