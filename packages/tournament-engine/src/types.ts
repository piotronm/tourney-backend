/**
 * Core type definitions for the tournament engine.
 */

/**
 * Represents a team in the tournament.
 */
export interface Team {
  /** Unique identifier for the team */
  id: number;
  /** Display name of the team */
  name: string;
  /** Optional pool identifier the team belongs to */
  poolId?: number;
}

/**
 * Represents a pool (group) of teams.
 */
export interface Pool {
  /** Unique identifier for the pool */
  id: number;
  /** Display name of the pool (e.g., "Pool A") */
  name: string;
  /** Array of team IDs assigned to this pool */
  teamIds: number[];
}

/**
 * Represents a single match in a round-robin tournament.
 */
export interface RoundRobinMatch {
  /** Unique identifier for the match */
  id: number;
  /** Pool identifier this match belongs to */
  poolId: number;
  /** Round number (1-indexed) */
  round: number;
  /** Match number within the entire tournament (1-indexed) */
  matchNumber: number;
  /** ID of team A (home team) */
  teamAId: number;
  /** ID of team B (away team), null for BYE */
  teamBId: number | null;
  /** Score for team A, null if not played */
  scoreA?: number | null;
  /** Score for team B, null if not played */
  scoreB?: number | null;
  /** Match status */
  status: 'pending' | 'in_progress' | 'completed' | 'walkover' | 'forfeit' | 'cancelled';
  /** Slot index for scheduling (0-indexed, optional) */
  slotIndex?: number;
}

/**
 * Represents a team's standing in the pool.
 */
export interface RankRow {
  /** Team ID */
  teamId: number;
  /** Number of wins */
  wins: number;
  /** Number of losses */
  losses: number;
  /** Total points scored */
  pointsFor: number;
  /** Total points allowed */
  pointsAgainst: number;
  /** Point differential (pointsFor - pointsAgainst) */
  pointDiff: number;
}

/**
 * Pool assignment strategy.
 */
export type PoolStrategy = 'respect-input' | 'balanced';

/**
 * Options for tournament generation.
 */
export interface GenerateOptions {
  /** Seed for deterministic PRNG (default: 12345) */
  seed?: number;
  /** Whether to shuffle teams before assignment (default: false) */
  shuffle?: boolean;
  /** Pool assignment strategy (default: "respect-input") */
  poolStrategy?: PoolStrategy;
  /** Whether to avoid back-to-back matches for teams (default: false) */
  avoidBackToBack?: boolean;
}

/**
 * Input team structure (minimal required fields).
 */
export interface InputTeam {
  /** Team name */
  name: string;
  /** Optional pool identifier from input */
  poolId?: number;
}

/**
 * Represents a player in the tournament system.
 */
export interface Player {
  /** Unique identifier for the player */
  id: number;
  /** Player name */
  name: string;
  /** DUPR rating (1.0 - 8.0) */
  duprRating: number;
  /** Optional team ID if already assigned */
  teamId?: number;
}

/**
 * Input player structure (minimal required fields).
 */
export interface InputPlayer {
  /** Player name */
  name: string;
  /** DUPR rating (1.0 - 8.0) */
  duprRating: number;
}

/**
 * Team generation strategy for DUPR-based pairing.
 */
export type TeamGenerationStrategy = 'balanced' | 'snake-draft' | 'random-pairs';

/**
 * Options for DUPR-based team generation.
 */
export interface DUPRTeamGenerationOptions {
  /** Strategy for pairing players into teams */
  strategy?: TeamGenerationStrategy;
  /** Seed for deterministic PRNG (default: 12345) */
  seed?: number;
  /** Target team size (default: 2 for doubles) */
  teamSize?: number;
}

/**
 * Court assignment for a match.
 */
export interface CourtAssignment {
  /** Match ID */
  matchId: number;
  /** Court number (1-indexed) */
  courtNumber: number;
  /** Time slot (1-indexed) */
  timeSlot: number;
  /** Estimated start time (minutes from tournament start) */
  estimatedStartMinutes: number;
}

/**
 * Court scheduling options.
 */
export interface CourtSchedulingOptions {
  /** Number of available courts */
  numberOfCourts: number;
  /** Average match duration in minutes (default: 30) */
  matchDurationMinutes?: number;
  /** Break time between matches in minutes (default: 5) */
  breakMinutes?: number;
}

/**
 * CSV export row structure.
 */
export interface ExportRow {
  /** Pool name */
  pool: string;
  /** Round number */
  round: number;
  /** Match number */
  match: number;
  /** Team A name */
  teamA: string;
  /** Team A score (empty string if not played) */
  scoreA: string;
  /** Team B score (empty string if not played) */
  scoreB: string;
  /** Team B name */
  teamB: string;
  /** Match status */
  status: string;
  /** Court number (optional) */
  court?: string;
  /** Start time (optional) */
  startTime?: string;
}

/**
 * Excel export row structure (more detailed than CSV).
 */
export interface ExcelExportRow extends ExportRow {
  /** Team A average DUPR rating */
  teamADupr?: string;
  /** Team B average DUPR rating */
  teamBDupr?: string;
  /** Team A player names */
  teamAPlayers?: string;
  /** Team B player names */
  teamBPlayers?: string;
}
