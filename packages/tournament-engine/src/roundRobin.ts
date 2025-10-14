/**
 * Round-robin match generation using the circle method.
 * Handles both even and odd numbers of teams with BYE support.
 */

import type { RoundRobinMatch, Pool, GenerateOptions } from './types.js';

/**
 * Generates round-robin matches for all pools.
 *
 * Uses the circle method algorithm to ensure each team plays every other team
 * exactly once. For odd-numbered pools, includes BYE matches (teamBId: null).
 *
 * @param pools - Array of pools to generate matches for
 * @param options - Optional generation options (including avoidBackToBack)
 * @returns Array of all matches across all pools
 *
 * @example
 * ```typescript
 * const pools = [
 *   { id: 1, name: "Pool A", teamIds: [1, 2, 3, 4] }
 * ];
 * const matches = generateRoundRobinMatches(pools);
 * // Returns 6 matches (4 teams = 4 choose 2 = 6 matches)
 * ```
 */
export function generateRoundRobinMatches(
  pools: Pool[],
  options?: GenerateOptions
): RoundRobinMatch[] {
  const allMatches: RoundRobinMatch[] = [];
  let globalMatchNumber = 1;

  for (const pool of pools) {
    const poolMatches = generateRoundRobinForPool(pool, globalMatchNumber);
    allMatches.push(...poolMatches);
    globalMatchNumber += poolMatches.length;
  }

  // Apply slot assignment if avoidBackToBack is enabled
  if (options?.avoidBackToBack) {
    assignSlotsWithSpacing(allMatches);
  }

  return allMatches;
}

/**
 * Generates round-robin matches for a single pool using the circle method.
 *
 * The circle method:
 * 1. If odd number of teams, add a dummy team (BYE)
 * 2. Fix the first team, rotate the others clockwise each round
 * 3. Match teams in positions: (0, n-1), (1, n-2), (2, n-3), etc.
 *
 * @param pool - The pool to generate matches for
 * @param startingMatchNumber - The global match number to start from
 * @returns Array of matches for this pool
 */
export function generateRoundRobinForPool(
  pool: Pool,
  startingMatchNumber: number
): RoundRobinMatch[] {
  const teamIds = [...pool.teamIds];
  const n = teamIds.length;

  if (n < 2) {
    // Can't create matches with fewer than 2 teams
    return [];
  }

  const isOdd = n % 2 === 1;
  const teams = isOdd ? [...teamIds, -1] : teamIds; // -1 represents BYE
  const numTeams = teams.length;
  const numRounds = numTeams - 1;
  const matchesPerRound = numTeams / 2;

  const matches: RoundRobinMatch[] = [];
  let matchId = 1;
  let matchNumber = startingMatchNumber;

  for (let round = 0; round < numRounds; round++) {
    for (let match = 0; match < matchesPerRound; match++) {
      // Circle method pairing: position i pairs with position (n-1-i)
      const homeIndex = match;
      const awayIndex = numTeams - 1 - match;

      const homeTeamId = teams[homeIndex]!;
      const awayTeamId = teams[awayIndex]!;

      // Skip matches involving BYE (-1), but create BYE matches for real teams
      if (homeTeamId === -1 || awayTeamId === -1) {
        continue;
      }

      matches.push({
        id: matchId++,
        poolId: pool.id,
        round: round + 1,
        matchNumber: matchNumber++,
        teamAId: homeTeamId,
        teamBId: awayTeamId,
        scoreA: null,
        scoreB: null,
        status: 'pending',
      });
    }

    // Rotate teams (keep first team fixed)
    if (numTeams > 2) {
      const last = teams.pop()!;
      teams.splice(1, 0, last);
    }
  }

  return matches;
}

/**
 * Calculates the total number of matches for a given number of teams.
 * Uses the combination formula: n choose 2 = n * (n - 1) / 2
 *
 * @param numTeams - Number of teams in the pool
 * @returns Total number of matches
 */
export function calculateTotalMatches(numTeams: number): number {
  if (numTeams < 2) return 0;
  return (numTeams * (numTeams - 1)) / 2;
}

/**
 * Creates a lookup map from team ID to their matches.
 *
 * @param matches - Array of matches
 * @returns Map of team ID to array of match IDs they participate in
 */
export function createTeamMatchMap(
  matches: RoundRobinMatch[]
): Map<number, number[]> {
  const map = new Map<number, number[]>();

  for (const match of matches) {
    // Add for team A
    const teamAMatches = map.get(match.teamAId) ?? [];
    teamAMatches.push(match.id);
    map.set(match.teamAId, teamAMatches);

    // Add for team B (if not BYE)
    if (match.teamBId !== null) {
      const teamBMatches = map.get(match.teamBId) ?? [];
      teamBMatches.push(match.id);
      map.set(match.teamBId, teamBMatches);
    }
  }

  return map;
}

/**
 * Assigns slot indices to matches using a greedy algorithm that maximizes
 * the time gap between consecutive matches for each team.
 *
 * Strategy:
 * 1. Track the last assigned slot for each team
 * 2. For each unassigned match, calculate the minimum gap it would create
 * 3. Assign the match with the best (largest) minimum gap to the next slot
 * 4. Repeat until all matches are assigned
 *
 * This is a greedy heuristic that tries to avoid back-to-back matches,
 * though it may not always find the optimal solution.
 *
 * @param matches - Array of matches to assign slots to (modified in place)
 */
export function assignSlotsWithSpacing(matches: RoundRobinMatch[]): void {
  if (matches.length === 0) return;

  // Track the last slot each team was assigned to (-1 means never assigned)
  const teamLastSlot = new Map<number, number>();

  // Initialize all teams with -1 (no previous slot)
  for (const match of matches) {
    teamLastSlot.set(match.teamAId, -1);
    if (match.teamBId !== null) {
      teamLastSlot.set(match.teamBId, -1);
    }
  }

  // Track which matches have been assigned using match object references
  const assigned = new Set<RoundRobinMatch>();
  let currentSlot = 0;

  while (assigned.size < matches.length) {
    let bestMatch: RoundRobinMatch | null = null;
    let bestMinGap = -1;

    // Find the unassigned match that maximizes the minimum gap
    for (const match of matches) {
      if (assigned.has(match)) continue;

      // Calculate minimum gap for this match
      const teamALastSlot = teamLastSlot.get(match.teamAId) ?? -1;
      const teamBLastSlot =
        match.teamBId !== null ? teamLastSlot.get(match.teamBId) ?? -1 : -1;

      // Gap for team A
      const gapA = teamALastSlot === -1 ? Infinity : currentSlot - teamALastSlot;
      // Gap for team B (or Infinity if BYE)
      const gapB = teamBLastSlot === -1 ? Infinity : currentSlot - teamBLastSlot;

      // Minimum gap is the smaller of the two
      const minGap = Math.min(gapA, gapB);

      // Update best match if this one has a larger minimum gap
      if (minGap > bestMinGap) {
        bestMinGap = minGap;
        bestMatch = match;
      }
    }

    // Assign the best match to the current slot
    if (bestMatch !== null) {
      bestMatch.slotIndex = currentSlot;
      assigned.add(bestMatch);

      // Update last slot for both teams
      teamLastSlot.set(bestMatch.teamAId, currentSlot);
      if (bestMatch.teamBId !== null) {
        teamLastSlot.set(bestMatch.teamBId, currentSlot);
      }

      currentSlot++;
    } else {
      // Should never happen, but break to avoid infinite loop
      break;
    }
  }
}
