/**
 * Tournament Engine - Pure TypeScript library for round-robin tournament management.
 *
 * This library provides deterministic tournament generation using seeded PRNG.
 * All functions are pure (no I/O operations) for maximum testability and reusability.
 *
 * @packageDocumentation
 */

// Export types
export type {
  Team,
  Pool,
  RoundRobinMatch,
  RankRow,
  GenerateOptions,
  PoolStrategy,
  InputTeam,
  ExportRow,
  Player,
  InputPlayer,
  TeamGenerationStrategy,
  DUPRTeamGenerationOptions,
  CourtAssignment,
  CourtSchedulingOptions,
  ExcelExportRow,
} from './types.js';

// Export RNG utilities
export { createSeededRNG, shuffleArray, randomInt } from './rng.js';

// Export preprocessing
export { preprocessTeams, validateTeams } from './preprocess.js';

// Export pool management
export { assignToPools, generatePoolName, createPoolNameMap } from './pools.js';

// Export round-robin generation
export {
  generateRoundRobinMatches,
  generateRoundRobinForPool,
  calculateTotalMatches,
  createTeamMatchMap,
  assignSlotsWithSpacing,
} from './roundRobin.js';

// Export standings computation
export {
  computePoolStandings,
  computeAllStandings,
  getHeadToHeadRecord,
} from './standings.js';

// Export CSV mapping
export {
  EXPORT_HEADERS,
  mapMatchesToExportRows,
  exportRowsToCSV,
  createTeamsById,
  createPoolsById,
} from './exportMap.js';

// Export DUPR team generation
export {
  generateTeamsFromPlayers,
  calculateAverageRating,
  getTeamPlayers,
  calculateTeamRatingVariance,
} from './duprTeams.js';

// Export court scheduling
export {
  scheduleMatchesToCourts,
  formatEstimatedTime,
  calculateTournamentDuration,
  getMatchesByCourt,
  getMatchesByTimeSlot,
  validateSchedule,
} from './courtScheduling.js';

// Export Excel export
export {
  mapMatchesToExcelRows,
  exportRowsToTSV,
  createTournamentSummary,
  createPlayerRoster,
} from './excelExport.js';
