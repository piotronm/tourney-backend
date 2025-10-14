/**
 * Team preprocessing utilities.
 * Handles ID assignment, name building, and optional shuffling.
 */

import { shuffleArray } from './rng.js';
import type { Team, InputTeam } from './types.js';

/**
 * Simple deterministic 32-bit hash to generate team IDs from seed and name.
 * Not cryptographically secure, but sufficient for deterministic ID generation.
 */
function hashToId(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Return positive integer in safe range
  return (h >>> 0) % 2147483647;
}

/**
 * Preprocesses input teams by assigning IDs, normalizing names, and optionally shuffling.
 *
 * This function ensures all teams have unique IDs and properly formatted names.
 * If shuffle is enabled, teams are shuffled using the provided RNG for determinism.
 * When a seed is provided, team IDs are generated deterministically based on seed + name + index.
 *
 * @param inputTeams - Array of input teams with at least a name field
 * @param rng - Seeded random number generator for deterministic shuffling
 * @param shuffle - Whether to shuffle the teams (default: false)
 * @param seed - Optional seed for deterministic ID generation
 * @returns Array of processed Team objects with assigned IDs
 *
 * @example
 * ```typescript
 * const rng = createSeededRNG(12345);
 * const input = [
 *   { name: "Team A", poolId: 1 },
 *   { name: "Team B", poolId: 1 },
 *   { name: "Team C", poolId: 2 }
 * ];
 * const teams = preprocessTeams(input, rng, true, 12345);
 * // Returns shuffled teams with deterministic IDs
 * ```
 */
export function preprocessTeams(
  inputTeams: InputTeam[],
  rng: () => number,
  shuffle: boolean = false,
  seed?: number
): Team[] {
  // Create a copy to avoid mutating input
  let teams: Team[] = inputTeams.map((t, index) => {
    const name = t.name.trim() || `Team ${index + 1}`;

    // Generate deterministic ID if seed provided, otherwise use sequential
    const id = seed !== undefined
      ? hashToId(`${seed}:${name}:${index}`)
      : index + 1;

    return {
      id,
      name,
      poolId: t.poolId,
    };
  });

  // Shuffle if requested
  if (shuffle) {
    teams = shuffleArray(teams, rng);
    // Reassign IDs after shuffle if NOT using deterministic IDs
    if (seed === undefined) {
      teams = teams.map((t, index) => ({
        ...t,
        id: index + 1,
      }));
    }
  }

  return teams;
}

/**
 * Validates that the input teams array is not empty and contains valid data.
 *
 * @param inputTeams - Array of input teams to validate
 * @throws Error if teams array is empty or invalid
 */
export function validateTeams(inputTeams: InputTeam[]): void {
  if (!Array.isArray(inputTeams) || inputTeams.length === 0) {
    throw new Error('Teams array must not be empty');
  }

  for (const team of inputTeams) {
    if (!team.name || typeof team.name !== 'string') {
      throw new Error('Each team must have a valid name');
    }
  }
}
