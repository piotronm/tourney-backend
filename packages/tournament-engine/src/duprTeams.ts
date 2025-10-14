/**
 * DUPR-based team generation utilities.
 * Generates balanced teams from individual players based on DUPR ratings.
 */

import { shuffleArray } from './rng.js';
import type { Player, InputPlayer, Team, DUPRTeamGenerationOptions } from './types.js';

/**
 * Generates balanced teams from individual players using DUPR ratings.
 *
 * Strategies:
 * - "balanced": Pairs highest with lowest rated players for equal team strength
 * - "snake-draft": Alternating picks to balance teams (like fantasy sports)
 * - "random-pairs": Random pairing with optional seeded shuffle
 *
 * @param inputPlayers - Array of players with DUPR ratings
 * @param rng - Seeded random number generator
 * @param options - Team generation options
 * @returns Object containing teams and player assignments
 *
 * @example
 * ```typescript
 * const rng = createSeededRNG(12345);
 * const players = [
 *   { name: "Player A", duprRating: 5.5 },
 *   { name: "Player B", duprRating: 4.0 },
 *   { name: "Player C", duprRating: 6.0 },
 *   { name: "Player D", duprRating: 3.5 }
 * ];
 * const result = generateTeamsFromPlayers(players, rng, { strategy: "balanced" });
 * // Creates: Team 1 (6.0 + 3.5 = 9.5), Team 2 (5.5 + 4.0 = 9.5)
 * ```
 */
export function generateTeamsFromPlayers(
  inputPlayers: InputPlayer[],
  rng: () => number,
  options: DUPRTeamGenerationOptions = {}
): {
  teams: Team[];
  players: Player[];
  teamCompositions: Map<number, number[]>; // teamId -> playerIds
} {
  const { strategy = 'balanced', teamSize = 2 } = options;

  // Validate inputs
  if (inputPlayers.length < 2) {
    throw new Error('At least 2 players required to form teams');
  }

  if (inputPlayers.length % teamSize !== 0) {
    throw new Error(
      `Number of players (${inputPlayers.length}) must be divisible by team size (${teamSize})`
    );
  }

  // Create player objects with IDs
  const players: Player[] = inputPlayers.map((p, index) => ({
    id: index + 1,
    name: p.name.trim() || `Player ${index + 1}`,
    duprRating: validateDUPRRating(p.duprRating),
  }));

  // Generate teams based on strategy
  let teamCompositions: Map<number, number[]>;

  switch (strategy) {
    case 'balanced':
      teamCompositions = generateBalancedTeams(players, teamSize);
      break;
    case 'snake-draft':
      teamCompositions = generateSnakeDraftTeams(players, teamSize, rng);
      break;
    case 'random-pairs':
      teamCompositions = generateRandomPairs(players, teamSize, rng);
      break;
    default: {
      // Exhaustive check - this should never happen
      const _exhaustive: never = strategy;
      throw new Error(`Unknown team generation strategy: ${String(_exhaustive)}`);
    }
  }

  // Create team objects with names and average ratings
  const teams: Team[] = [];
  let teamId = 1;

  for (const [, playerIds] of teamCompositions) {
    const teamPlayers = playerIds.map((id) => players.find((p) => p.id === id)!);
    const teamName = generateTeamName(teamPlayers, teamId);

    teams.push({
      id: teamId,
      name: teamName,
    });

    // Update player teamId references
    for (const playerId of playerIds) {
      const player = players.find((p) => p.id === playerId);
      if (player) {
        player.teamId = teamId;
      }
    }

    teamId++;
  }

  return { teams, players, teamCompositions };
}

/**
 * Generates balanced teams by pairing highest with lowest rated players.
 * This strategy aims to create teams with similar total ratings.
 */
function generateBalancedTeams(
  players: Player[],
  teamSize: number
): Map<number, number[]> {
  // Sort players by DUPR rating (descending)
  const sortedPlayers = [...players].sort((a, b) => b.duprRating - a.duprRating);

  const teamCompositions = new Map<number, number[]>();
  const numTeams = players.length / teamSize;

  // For doubles (teamSize = 2): pair highest with lowest
  if (teamSize === 2) {
    for (let i = 0; i < numTeams; i++) {
      const teamId = i + 1;
      const highPlayer = sortedPlayers[i]!;
      const lowPlayer = sortedPlayers[players.length - 1 - i]!;
      teamCompositions.set(teamId, [highPlayer.id, lowPlayer.id]);
    }
  } else {
    // For larger teams: distribute evenly across rating ranges
    for (let i = 0; i < numTeams; i++) {
      const teamId = i + 1;
      const playerIds: number[] = [];

      for (let j = 0; j < teamSize; j++) {
        const playerIndex = i + j * numTeams;
        const player = sortedPlayers[playerIndex];
        if (player) {
          playerIds.push(player.id);
        }
      }

      teamCompositions.set(teamId, playerIds);
    }
  }

  return teamCompositions;
}

/**
 * Generates teams using snake draft order (alternating picks).
 * Example: Team1, Team2, Team3, Team3, Team2, Team1, Team1, Team2...
 */
function generateSnakeDraftTeams(
  players: Player[],
  teamSize: number,
  _rng: () => number
): Map<number, number[]> {
  // Sort players by DUPR rating (descending)
  const sortedPlayers = [...players].sort((a, b) => b.duprRating - a.duprRating);

  const numTeams = players.length / teamSize;
  const teamCompositions = new Map<number, number[]>();

  // Initialize empty teams
  for (let i = 1; i <= numTeams; i++) {
    teamCompositions.set(i, []);
  }

  let currentTeam = 1;
  let direction = 1; // 1 for forward, -1 for backward

  for (const player of sortedPlayers) {
    const team = teamCompositions.get(currentTeam)!;
    team.push(player.id);

    // Move to next team
    if (currentTeam === numTeams && direction === 1) {
      direction = -1; // Reverse direction at end
    } else if (currentTeam === 1 && direction === -1) {
      direction = 1; // Reverse direction at start
    } else {
      currentTeam += direction;
    }
  }

  return teamCompositions;
}

/**
 * Generates teams by randomly pairing players.
 * Uses seeded RNG for deterministic results.
 */
function generateRandomPairs(
  players: Player[],
  teamSize: number,
  rng: () => number
): Map<number, number[]> {
  // Shuffle players randomly
  const shuffledPlayers = shuffleArray([...players], rng);

  const teamCompositions = new Map<number, number[]>();
  const numTeams = players.length / teamSize;

  for (let i = 0; i < numTeams; i++) {
    const teamId = i + 1;
    const playerIds: number[] = [];

    for (let j = 0; j < teamSize; j++) {
      const player = shuffledPlayers[i * teamSize + j];
      if (player) {
        playerIds.push(player.id);
      }
    }

    teamCompositions.set(teamId, playerIds);
  }

  return teamCompositions;
}

/**
 * Validates a DUPR rating (must be between 1.0 and 8.0).
 */
function validateDUPRRating(rating: number): number {
  if (rating < 1.0 || rating > 8.0) {
    throw new Error(`Invalid DUPR rating: ${rating}. Must be between 1.0 and 8.0`);
  }
  return rating;
}

/**
 * Calculates the average DUPR rating for a group of players.
 */
export function calculateAverageRating(players: Player[]): number {
  if (players.length === 0) return 0;
  const sum = players.reduce((acc, p) => acc + p.duprRating, 0);
  return sum / players.length;
}

/**
 * Generates a team name from player names and ratings.
 */
function generateTeamName(players: Player[], teamId: number): string {
  if (players.length === 0) {
    return `Team ${teamId}`;
  }

  if (players.length === 2) {
    // Doubles: "Smith/Johnson"
    return players.map((p) => getLastName(p.name)).join('/');
  }

  // Multiple players: "Team {ID} ({avg})"
  const avgRating = calculateAverageRating(players).toFixed(1);
  return `Team ${teamId} (${avgRating})`;
}

/**
 * Extracts last name from full name (or returns full name if no space).
 */
function getLastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1]! : fullName;
}

/**
 * Gets players for a specific team.
 */
export function getTeamPlayers(
  teamId: number,
  players: Player[]
): Player[] {
  return players.filter((p) => p.teamId === teamId);
}

/**
 * Calculates team rating variance (lower is more balanced).
 */
export function calculateTeamRatingVariance(
  teams: Team[],
  teamCompositions: Map<number, number[]>,
  players: Player[]
): number {
  const ratings = teams.map((team) => {
    const playerIds = teamCompositions.get(team.id) ?? [];
    const teamPlayers = playerIds.map((id) => players.find((p) => p.id === id)!);
    return calculateAverageRating(teamPlayers);
  });

  const mean = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  const variance =
    ratings.reduce((acc, r) => acc + Math.pow(r - mean, 2), 0) / ratings.length;

  return variance;
}
