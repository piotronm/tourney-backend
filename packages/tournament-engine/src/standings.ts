/**
 * Standings calculation and ranking utilities.
 * Computes win-loss records, point differentials, and rankings.
 */

import type { RoundRobinMatch, RankRow } from './types.js';

/**
 * Computes pool standings from match results.
 *
 * Rankings are determined by:
 * 1. Total wins (descending)
 * 2. Point differential (descending)
 * 3. Head-to-head record (if applicable)
 * 4. Points scored (descending)
 *
 * @param poolId - The pool ID to compute standings for
 * @param matches - Array of all matches (will be filtered by poolId)
 * @returns Array of RankRow objects sorted by ranking criteria
 *
 * @example
 * ```typescript
 * const matches = [
 *   { poolId: 1, teamAId: 1, teamBId: 2, scoreA: 10, scoreB: 5, status: 'completed' },
 *   { poolId: 1, teamAId: 1, teamBId: 3, scoreA: 8, scoreB: 12, status: 'completed' }
 * ];
 * const standings = computePoolStandings(1, matches);
 * // Returns ranked teams with wins, losses, and point differentials
 * ```
 */
export function computePoolStandings(
  poolId: number,
  matches: RoundRobinMatch[]
): RankRow[] {
  // Filter matches for this pool and only completed matches
  const poolMatches = matches.filter(
    (m) => m.poolId === poolId && m.status === 'completed'
  );

  // Build a map of team stats
  const statsMap = new Map<number, RankRow>();

  for (const match of poolMatches) {
    // Skip BYE matches
    if (match.teamBId === null) {
      continue;
    }

    // Ensure both teams have entries
    if (!statsMap.has(match.teamAId)) {
      statsMap.set(match.teamAId, createEmptyRankRow(match.teamAId));
    }
    if (!statsMap.has(match.teamBId)) {
      statsMap.set(match.teamBId, createEmptyRankRow(match.teamBId));
    }

    const teamAStats = statsMap.get(match.teamAId)!;
    const teamBStats = statsMap.get(match.teamBId)!;

    // Only process if scores are available
    if (
      match.scoreA !== null &&
      match.scoreA !== undefined &&
      match.scoreB !== null &&
      match.scoreB !== undefined
    ) {
      // Update points
      teamAStats.pointsFor += match.scoreA;
      teamAStats.pointsAgainst += match.scoreB;
      teamBStats.pointsFor += match.scoreB;
      teamBStats.pointsAgainst += match.scoreA;

      // Update wins/losses
      if (match.scoreA > match.scoreB) {
        teamAStats.wins++;
        teamBStats.losses++;
      } else if (match.scoreB > match.scoreA) {
        teamBStats.wins++;
        teamAStats.losses++;
      }
      // Note: Ties are not counted as wins or losses
    }
  }

  // Calculate point differentials
  const standings: RankRow[] = Array.from(statsMap.values()).map((row) => ({
    ...row,
    pointDiff: row.pointsFor - row.pointsAgainst,
  }));

  // Sort by ranking criteria
  standings.sort(compareRankRows);

  // Apply head-to-head tiebreaker for teams with same wins and point differential
  return resolveHeadToHeadTies(standings, poolMatches);
}

/**
 * Creates an empty RankRow for a team.
 */
function createEmptyRankRow(teamId: number): RankRow {
  return {
    teamId,
    wins: 0,
    losses: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    pointDiff: 0,
  };
}

/**
 * Compares two RankRow objects for sorting.
 * Sorting criteria (in order):
 * 1. Most wins (descending)
 * 2. Best point differential (descending)
 * 3. Most points scored (descending)
 * 4. Team ID (ascending, for stable sort)
 */
function compareRankRows(a: RankRow, b: RankRow): number {
  // 1. Most wins
  if (a.wins !== b.wins) {
    return b.wins - a.wins;
  }

  // 2. Best point differential
  if (a.pointDiff !== b.pointDiff) {
    return b.pointDiff - a.pointDiff;
  }

  // 3. Most points scored
  if (a.pointsFor !== b.pointsFor) {
    return b.pointsFor - a.pointsFor;
  }

  // 4. Team ID (stable sort)
  return a.teamId - b.teamId;
}

/**
 * Resolves head-to-head tiebreakers for teams with identical wins and point differential.
 * Groups tied teams and re-ranks them based on head-to-head results.
 *
 * @param standings - Initial standings sorted by wins and point differential
 * @param matches - Pool matches to use for head-to-head calculation
 * @returns Re-sorted standings with head-to-head tiebreakers applied
 */
function resolveHeadToHeadTies(
  standings: RankRow[],
  matches: RoundRobinMatch[]
): RankRow[] {
  const result: RankRow[] = [];
  let i = 0;

  while (i < standings.length) {
    // Find all teams with the same wins and point differential
    const currentTeam = standings[i]!;
    const tiedTeams: RankRow[] = [currentTeam];
    let j = i + 1;

    while (
      j < standings.length &&
      standings[j]!.wins === currentTeam.wins &&
      standings[j]!.pointDiff === currentTeam.pointDiff
    ) {
      tiedTeams.push(standings[j]!);
      j++;
    }

    // If there's a tie (2+ teams with same record), resolve with head-to-head
    if (tiedTeams.length > 1) {
      const resolvedTiedTeams = resolveHeadToHeadTie(tiedTeams, matches);
      result.push(...resolvedTiedTeams);
    } else {
      result.push(currentTeam);
    }

    i = j;
  }

  return result;
}

/**
 * Resolves a tie between teams using head-to-head record.
 * Only considers matches between the tied teams.
 *
 * @param tiedTeams - Teams with identical wins and point differential
 * @param matches - All matches to filter for head-to-head
 * @returns Sorted teams based on head-to-head record
 */
function resolveHeadToHeadTie(
  tiedTeams: RankRow[],
  matches: RoundRobinMatch[]
): RankRow[] {
  const tiedTeamIds = new Set(tiedTeams.map((t) => t.teamId));

  // Filter matches to only those between tied teams
  const h2hMatches = matches.filter(
    (m) =>
      m.teamBId !== null &&
      tiedTeamIds.has(m.teamAId) &&
      tiedTeamIds.has(m.teamBId)
  );

  // If no head-to-head matches exist, return original order
  if (h2hMatches.length === 0) {
    return tiedTeams;
  }

  // Recompute standings using only head-to-head matches
  const h2hStatsMap = new Map<number, RankRow>();

  // Initialize all tied teams with empty stats
  for (const team of tiedTeams) {
    h2hStatsMap.set(team.teamId, createEmptyRankRow(team.teamId));
  }

  // Process head-to-head matches
  for (const match of h2hMatches) {
    if (
      match.scoreA === null ||
      match.scoreA === undefined ||
      match.scoreB === null ||
      match.scoreB === undefined
    ) {
      continue;
    }

    const teamAStats = h2hStatsMap.get(match.teamAId)!;
    const teamBStats = h2hStatsMap.get(match.teamBId!)!;

    // Update points
    teamAStats.pointsFor += match.scoreA;
    teamAStats.pointsAgainst += match.scoreB;
    teamBStats.pointsFor += match.scoreB;
    teamBStats.pointsAgainst += match.scoreA;

    // Update wins/losses
    if (match.scoreA > match.scoreB) {
      teamAStats.wins++;
      teamBStats.losses++;
    } else if (match.scoreB > match.scoreA) {
      teamBStats.wins++;
      teamAStats.losses++;
    }
  }

  // Calculate point differentials for H2H stats
  const h2hStandings = Array.from(h2hStatsMap.values()).map((row) => ({
    ...row,
    pointDiff: row.pointsFor - row.pointsAgainst,
  }));

  // Sort by H2H wins, then H2H point differential, then points scored
  h2hStandings.sort(compareRankRows);

  return h2hStandings;
}

/**
 * Computes standings for all pools.
 *
 * @param poolIds - Array of pool IDs to compute standings for
 * @param matches - Array of all matches
 * @returns Map of pool ID to array of RankRow objects
 */
export function computeAllStandings(
  poolIds: number[],
  matches: RoundRobinMatch[]
): Map<number, RankRow[]> {
  const standingsMap = new Map<number, RankRow[]>();

  for (const poolId of poolIds) {
    const standings = computePoolStandings(poolId, matches);
    standingsMap.set(poolId, standings);
  }

  return standingsMap;
}

/**
 * Gets the head-to-head record between two teams.
 *
 * @param teamAId - First team ID
 * @param teamBId - Second team ID
 * @param matches - Array of matches to check
 * @returns Object with wins for each team and total games played
 */
export function getHeadToHeadRecord(
  teamAId: number,
  teamBId: number,
  matches: RoundRobinMatch[]
): { teamAWins: number; teamBWins: number; gamesPlayed: number } {
  let teamAWins = 0;
  let teamBWins = 0;
  let gamesPlayed = 0;

  for (const match of matches) {
    if (match.status !== 'completed') continue;
    if (match.scoreA === null || match.scoreA === undefined) continue;
    if (match.scoreB === null || match.scoreB === undefined) continue;

    const isHeadToHead =
      (match.teamAId === teamAId && match.teamBId === teamBId) ||
      (match.teamAId === teamBId && match.teamBId === teamAId);

    if (isHeadToHead) {
      gamesPlayed++;

      if (match.teamAId === teamAId) {
        if (match.scoreA > match.scoreB) teamAWins++;
        else if (match.scoreB > match.scoreA) teamBWins++;
      } else {
        if (match.scoreA > match.scoreB) teamBWins++;
        else if (match.scoreB > match.scoreA) teamAWins++;
      }
    }
  }

  return { teamAWins, teamBWins, gamesPlayed };
}
