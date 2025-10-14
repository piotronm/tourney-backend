/**
 * Pool assignment utilities.
 * Handles distributing teams across pools using different strategies.
 */

import type { Team, Pool, PoolStrategy } from './types.js';

/**
 * Assigns teams to pools based on the specified strategy.
 *
 * Two strategies are supported:
 * - "respect-input": Uses poolId from input teams if present, creates pools as needed
 * - "balanced": Distributes teams evenly across the specified number of pools
 *
 * @param teams - Array of teams to assign to pools
 * @param maxPools - Maximum number of pools to create
 * @param strategy - Pool assignment strategy (default: "respect-input")
 * @returns Array of Pool objects with assigned team IDs
 *
 * @example
 * ```typescript
 * const teams = [
 *   { id: 1, name: "Team A" },
 *   { id: 2, name: "Team B" },
 *   { id: 3, name: "Team C" },
 *   { id: 4, name: "Team D" }
 * ];
 * const pools = assignToPools(teams, 2, "balanced");
 * // Returns: [
 * //   { id: 1, name: "Pool A", teamIds: [1, 2] },
 * //   { id: 2, name: "Pool B", teamIds: [3, 4] }
 * // ]
 * ```
 */
export function assignToPools(
  teams: Team[],
  maxPools: number,
  strategy: PoolStrategy = 'respect-input'
): Pool[] {
  if (teams.length === 0) {
    return [];
  }

  if (strategy === 'respect-input') {
    return assignToPoolsRespectInput(teams, maxPools);
  } else {
    return assignToPoolsBalanced(teams, maxPools);
  }
}

/**
 * Assigns teams to pools respecting input poolId values.
 * Creates pools based on existing poolId assignments or uses a single pool.
 */
function assignToPoolsRespectInput(teams: Team[], maxPools: number): Pool[] {
  // Check if any teams have poolId assigned
  const hasPoolIds = teams.some((t) => t.poolId !== undefined);

  if (!hasPoolIds) {
    // No pool assignments, put all teams in one pool
    return [
      {
        id: 1,
        name: 'Pool A',
        teamIds: teams.map((t) => t.id),
      },
    ];
  }

  // Group teams by poolId
  const poolMap = new Map<number, number[]>();
  for (const team of teams) {
    const poolId = team.poolId ?? 1; // Default to pool 1 if not specified
    const teamIds = poolMap.get(poolId) ?? [];
    teamIds.push(team.id);
    poolMap.set(poolId, teamIds);
  }

  // Create pools from the map
  const sortedPoolIds = Array.from(poolMap.keys()).sort((a, b) => a - b);
  const pools: Pool[] = sortedPoolIds.slice(0, maxPools).map((poolId, index) => ({
    id: index + 1,
    name: generatePoolName(index + 1),
    teamIds: poolMap.get(poolId)!,
  }));

  return pools;
}

/**
 * Assigns teams to pools using balanced distribution.
 * Distributes teams as evenly as possible across pools.
 * Ensures minimum 2 teams per pool (reduces pool count if necessary).
 */
function assignToPoolsBalanced(teams: Team[], maxPools: number): Pool[] {
  const teamCount = teams.length;

  // Edge-case: very small divisions → single pool
  if (teamCount < 4) {
    return [
      {
        id: 1,
        name: generatePoolName(1),
        teamIds: teams.map((t) => t.id),
      },
    ];
  }

  // Ensure minimum 2 teams per pool
  const minTeamsPerPool = 2;
  const effectivePools = Math.min(
    maxPools,
    Math.floor(teamCount / minTeamsPerPool)
  );

  // If we can't create even 2 pools with min 2 teams each, use 1 pool
  const numPools = Math.max(1, effectivePools);

  const pools: Pool[] = [];

  // Calculate base teams per pool and remainder
  const baseTeamsPerPool = Math.floor(teamCount / numPools);
  const remainder = teamCount % numPools;

  let teamIndex = 0;

  for (let i = 0; i < numPools; i++) {
    // First 'remainder' pools get one extra team
    const teamsInThisPool = baseTeamsPerPool + (i < remainder ? 1 : 0);
    const teamIds: number[] = [];

    for (let j = 0; j < teamsInThisPool; j++) {
      const team = teams[teamIndex];
      if (team) {
        teamIds.push(team.id);
      }
      teamIndex++;
    }

    pools.push({
      id: i + 1,
      name: generatePoolName(i + 1),
      teamIds,
    });
  }

  return pools;
}

/**
 * Generates a pool name based on the pool number.
 * Uses letters for the first 26 pools (A-Z), then falls back to "Pool N".
 *
 * @param poolNumber - Pool number (1-indexed)
 * @returns Pool name (e.g., "Pool A", "Pool B", "Pool 27")
 */
export function generatePoolName(poolNumber: number): string {
  if (poolNumber <= 26) {
    const letter = String.fromCharCode(64 + poolNumber); // 65 is 'A'
    return `Pool ${letter}`;
  }
  return `Pool ${poolNumber}`;
}

/**
 * Creates a lookup map of pool ID to pool name.
 *
 * @param pools - Array of pools
 * @returns Map of pool ID to pool name
 */
export function createPoolNameMap(pools: Pool[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const pool of pools) {
    map.set(pool.id, pool.name);
  }
  return map;
}
