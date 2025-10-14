/**
 * CSV export mapping utilities.
 * Converts match data to CSV-ready export rows.
 */

import type { RoundRobinMatch, ExportRow, Team, Pool } from './types.js';

/**
 * Canonical CSV headers in stable order.
 * Ensures consistent column ordering across all exports.
 */
export const EXPORT_HEADERS = [
  'Pool',
  'Round',
  'Match',
  'TeamA',
  'ScoreA',
  'ScoreB',
  'TeamB',
  'Status',
] as const;

/**
 * Maps matches to CSV export rows.
 *
 * Creates CSV-ready rows with proper handling of:
 * - Pool names (extracted from poolsById map or defaults to "Pool N")
 * - Team names (looked up from teamsById map)
 * - Empty scores (represented as empty strings)
 * - BYE matches (teamBId: null)
 * - Special character escaping (handled by CSV writer)
 * - Optional division name
 *
 * @param matches - Array of matches to export
 * @param teamsById - Map of team ID to Team object
 * @param poolsById - Optional map of pool ID to Pool object (for extracting pool names)
 * @param opts - Optional export options (e.g., divisionName)
 * @returns Array of ExportRow objects ready for CSV serialization
 *
 * @example
 * ```typescript
 * const matches = [
 *   { id: 1, poolId: 1, round: 1, matchNumber: 1, teamAId: 1, teamBId: 2, scoreA: null, scoreB: null, status: 'pending' }
 * ];
 * const teams = new Map([[1, { id: 1, name: "Team A" }], [2, { id: 2, name: "Team B" }]]);
 * const pools = new Map([[1, { id: 1, name: "Pool A", teamIds: [1, 2] }]]);
 * const rows = mapMatchesToExportRows(matches, teams, pools);
 * // Returns: [{ pool: "Pool A", round: 1, match: 1, teamA: "Team A", scoreA: "", scoreB: "", teamB: "Team B", status: "pending" }]
 * ```
 */
export function mapMatchesToExportRows(
  matches: RoundRobinMatch[],
  teamsById: Map<number, Team>,
  poolsById?: Map<number, Pool>,
  _opts?: { divisionName?: string }
): ExportRow[] {
  const rows: ExportRow[] = [];

  for (const match of matches) {
    // Get pool name from poolsById map or default
    let poolName = `Pool ${match.poolId}`;
    if (poolsById) {
      const pool = poolsById.get(match.poolId);
      if (pool) {
        poolName = pool.name;
      }
    }

    // Get team names with fallback
    const teamA = teamsById.get(match.teamAId);
    const teamAName = teamA?.name ?? `Team ${match.teamAId}`;

    const teamBName =
      match.teamBId === null
        ? 'BYE'
        : teamsById.get(match.teamBId)?.name ?? `Team ${match.teamBId}`;

    // Format scores (blank if not set)
    const scoreA = formatScore(match.scoreA);
    const scoreB = formatScore(match.scoreB);

    rows.push({
      pool: poolName,
      round: match.round,
      match: match.matchNumber,
      teamA: teamAName,
      scoreA,
      scoreB,
      teamB: teamBName,
      status: match.status,
    });
  }

  return rows;
}

/**
 * Formats a score value for CSV export.
 * Returns empty string for null/undefined, otherwise converts to string.
 *
 * @param score - Score value (number, null, or undefined)
 * @returns Formatted score string (empty if null/undefined)
 */
function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined) {
    return '';
  }
  return String(score);
}

/**
 * Converts export rows to CSV string format.
 *
 * Handles special characters by:
 * - Wrapping fields containing commas, quotes, newlines, or carriage returns in double quotes
 * - Escaping double quotes by doubling them
 * - Uses canonical header order from EXPORT_HEADERS
 *
 * @param rows - Array of export rows
 * @returns CSV string with headers and data
 */
export function exportRowsToCSV(rows: ExportRow[]): string {
  const headers = Array.from(EXPORT_HEADERS);
  const csvRows: string[] = [headers.join(',')];

  for (const row of rows) {
    const values = [
      escapeCSVField(row.pool),
      String(row.round),
      String(row.match),
      escapeCSVField(row.teamA),
      escapeCSVField(row.scoreA),
      escapeCSVField(row.scoreB),
      escapeCSVField(row.teamB),
      escapeCSVField(row.status),
    ];
    csvRows.push(values.join(','));
  }

  return csvRows.join('\n');
}

/**
 * Escapes a CSV field value if it contains special characters.
 * Handles commas, quotes, newlines, and carriage returns.
 *
 * @param value - Field value to escape
 * @returns Escaped field value
 */
function escapeCSVField(value: string): string {
  if (!value) return value;

  // Check if field needs escaping (commas, quotes, newlines, carriage returns)
  if (
    value.includes(',') ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r')
  ) {
    // Escape double quotes by doubling them
    const escaped = value.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  return value;
}

/**
 * Creates a map of team IDs to Team objects from an array.
 *
 * @param teams - Array of teams
 * @returns Map of team ID to Team object
 */
export function createTeamsById(teams: Team[]): Map<number, Team> {
  const map = new Map<number, Team>();
  for (const team of teams) {
    map.set(team.id, team);
  }
  return map;
}

/**
 * Creates a map of pool IDs to Pool objects from an array.
 *
 * @param pools - Array of pools
 * @returns Map of pool ID to Pool object
 */
export function createPoolsById(pools: Pool[]): Map<number, Pool> {
  const map = new Map<number, Pool>();
  for (const pool of pools) {
    map.set(pool.id, pool);
  }
  return map;
}
