/**
 * Court scheduling utilities.
 * Assigns matches to courts and time slots for efficient tournament flow.
 */

import type {
  RoundRobinMatch,
  CourtAssignment,
  CourtSchedulingOptions,
} from './types.js';

/**
 * Assigns matches to courts and time slots.
 *
 * Algorithm:
 * 1. Group matches by round
 * 2. Within each round, ensure no team plays multiple matches simultaneously
 * 3. Assign to courts in parallel as much as possible
 * 4. Calculate estimated start times based on match duration and breaks
 *
 * @param matches - Array of matches to schedule
 * @param options - Court scheduling options
 * @returns Array of court assignments
 *
 * @example
 * ```typescript
 * const assignments = scheduleMatchesToCourts(matches, {
 *   numberOfCourts: 4,
 *   matchDurationMinutes: 30,
 *   breakMinutes: 5
 * });
 * ```
 */
export function scheduleMatchesToCourts(
  matches: RoundRobinMatch[],
  options: CourtSchedulingOptions
): CourtAssignment[] {
  const {
    numberOfCourts,
    matchDurationMinutes = 30,
    breakMinutes = 5,
  } = options;

  if (numberOfCourts < 1) {
    throw new Error('Number of courts must be at least 1');
  }

  const assignments: CourtAssignment[] = [];

  // Group matches by round
  const matchesByRound = groupMatchesByRound(matches);

  let currentTimeSlot = 1;
  let currentMinutes = 0;

  // Process each round
  for (const roundMatches of matchesByRound) {
    // Schedule matches in this round across available courts
    const roundAssignments = scheduleRound(
      roundMatches,
      numberOfCourts,
      currentTimeSlot,
      currentMinutes
    );

    assignments.push(...roundAssignments);

    // Calculate time slots used in this round
    const maxTimeSlotInRound = Math.max(
      ...roundAssignments.map((a) => a.timeSlot)
    );

    // Update for next round
    currentTimeSlot = maxTimeSlotInRound + 1;
    currentMinutes =
      roundAssignments[roundAssignments.length - 1]?.estimatedStartMinutes ?? 0;
    currentMinutes += matchDurationMinutes + breakMinutes;
  }

  return assignments;
}

/**
 * Schedules matches within a single round.
 * Ensures no team plays multiple matches simultaneously.
 */
function scheduleRound(
  matches: RoundRobinMatch[],
  numberOfCourts: number,
  startingTimeSlot: number,
  startingMinutes: number
): CourtAssignment[] {
  const assignments: CourtAssignment[] = [];
  const unscheduled = [...matches];
  const teamBusyUntilSlot = new Map<number, number>(); // teamId -> time slot
  const courtAvailableAtSlot = new Map<number, number>(); // courtNumber -> time slot

  // Initialize courts as available
  for (let i = 1; i <= numberOfCourts; i++) {
    courtAvailableAtSlot.set(i, startingTimeSlot);
  }

  let currentTimeSlot = startingTimeSlot;

  while (unscheduled.length > 0) {
    const matchesScheduledThisSlot: number[] = [];

    // Try to schedule matches to available courts
    for (const match of unscheduled) {
      // Check if teams are available
      const teamABusy = teamBusyUntilSlot.get(match.teamAId) ?? 0;
      const teamBBusy = match.teamBId ? teamBusyUntilSlot.get(match.teamBId) ?? 0 : 0;

      if (teamABusy >= currentTimeSlot || teamBBusy >= currentTimeSlot) {
        continue; // Teams not available yet
      }

      // Find an available court
      let assignedCourt: number | null = null;
      for (let court = 1; court <= numberOfCourts; court++) {
        const courtAvailable = courtAvailableAtSlot.get(court) ?? currentTimeSlot;
        if (courtAvailable <= currentTimeSlot) {
          assignedCourt = court;
          break;
        }
      }

      if (assignedCourt === null) {
        continue; // No courts available
      }

      // Schedule the match
      const minutesFromStart =
        startingMinutes + (currentTimeSlot - startingTimeSlot) * 35; // 30 min + 5 min break

      assignments.push({
        matchId: match.id,
        courtNumber: assignedCourt,
        timeSlot: currentTimeSlot,
        estimatedStartMinutes: minutesFromStart,
      });

      // Mark court as busy
      courtAvailableAtSlot.set(assignedCourt, currentTimeSlot + 1);

      // Mark teams as busy
      teamBusyUntilSlot.set(match.teamAId, currentTimeSlot + 1);
      if (match.teamBId) {
        teamBusyUntilSlot.set(match.teamBId, currentTimeSlot + 1);
      }

      matchesScheduledThisSlot.push(match.id);
    }

    // Remove scheduled matches
    for (const matchId of matchesScheduledThisSlot) {
      const index = unscheduled.findIndex((m) => m.id === matchId);
      if (index !== -1) {
        unscheduled.splice(index, 1);
      }
    }

    // Move to next time slot if we couldn't schedule anything
    if (matchesScheduledThisSlot.length === 0 && unscheduled.length > 0) {
      currentTimeSlot++;
    }
  }

  return assignments;
}

/**
 * Groups matches by round number.
 */
function groupMatchesByRound(matches: RoundRobinMatch[]): RoundRobinMatch[][] {
  const grouped = new Map<number, RoundRobinMatch[]>();

  for (const match of matches) {
    const roundMatches = grouped.get(match.round) ?? [];
    roundMatches.push(match);
    grouped.set(match.round, roundMatches);
  }

  // Sort by round number
  const rounds = Array.from(grouped.keys()).sort((a, b) => a - b);
  return rounds.map((round) => grouped.get(round)!);
}

/**
 * Formats estimated start time as HH:MM string.
 *
 * @param minutes - Minutes from tournament start
 * @param startHour - Tournament start hour (0-23, default: 9 for 9 AM)
 * @param startMinute - Tournament start minute (0-59, default: 0)
 * @returns Formatted time string
 */
export function formatEstimatedTime(
  minutes: number,
  startHour: number = 9,
  startMinute: number = 0
): string {
  const totalMinutes = startHour * 60 + startMinute + minutes;
  const hours = Math.floor(totalMinutes / 60) % 24;
  const mins = totalMinutes % 60;

  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * Calculates total tournament duration in minutes.
 */
export function calculateTournamentDuration(
  assignments: CourtAssignment[],
  matchDurationMinutes: number = 30,
  _breakMinutes: number = 5
): number {
  if (assignments.length === 0) return 0;

  const maxMinutes = Math.max(...assignments.map((a) => a.estimatedStartMinutes));
  return maxMinutes + matchDurationMinutes;
}

/**
 * Gets all matches assigned to a specific court.
 */
export function getMatchesByCourt(
  assignments: CourtAssignment[],
  courtNumber: number
): CourtAssignment[] {
  return assignments
    .filter((a) => a.courtNumber === courtNumber)
    .sort((a, b) => a.timeSlot - b.timeSlot);
}

/**
 * Gets all matches in a specific time slot.
 */
export function getMatchesByTimeSlot(
  assignments: CourtAssignment[],
  timeSlot: number
): CourtAssignment[] {
  return assignments
    .filter((a) => a.timeSlot === timeSlot)
    .sort((a, b) => a.courtNumber - b.courtNumber);
}

/**
 * Validates that no team plays multiple matches simultaneously.
 */
export function validateSchedule(
  assignments: CourtAssignment[],
  matches: RoundRobinMatch[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Group by time slot
  const byTimeSlot = new Map<number, CourtAssignment[]>();
  for (const assignment of assignments) {
    const slot = byTimeSlot.get(assignment.timeSlot) ?? [];
    slot.push(assignment);
    byTimeSlot.set(assignment.timeSlot, slot);
  }

  // Check each time slot
  for (const [timeSlot, slotAssignments] of byTimeSlot) {
    const teamsPlaying = new Set<number>();

    for (const assignment of slotAssignments) {
      const match = matches.find((m) => m.id === assignment.matchId);
      if (!match) continue;

      if (teamsPlaying.has(match.teamAId)) {
        errors.push(
          `Time slot ${timeSlot}: Team ${match.teamAId} plays multiple matches`
        );
      }
      teamsPlaying.add(match.teamAId);

      if (match.teamBId && teamsPlaying.has(match.teamBId)) {
        errors.push(
          `Time slot ${timeSlot}: Team ${match.teamBId} plays multiple matches`
        );
      }
      if (match.teamBId) {
        teamsPlaying.add(match.teamBId);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
