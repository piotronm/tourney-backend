/**
 * Score match endpoint - Phase 6 Enhanced Version
 * Supports multi-game scoring, match statuses, and automatic standings recalculation
 */

import type { FastifyPluginAsync } from 'fastify';
import { eq, and, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../lib/db/drizzle.js';
import { matches, teams } from '../lib/db/schema.js';
import type { MatchScore, GameScore } from '../lib/db/schema.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

/**
 * URL parameters schema
 */
const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/**
 * Game score schema
 */
const gameScoreSchema = z.object({
  teamA: z.number().int().min(0).max(99),
  teamB: z.number().int().min(0).max(99),
});

/**
 * Match score schema
 */
const matchScoreSchema = z.object({
  games: z.array(gameScoreSchema).min(1, 'At least one game is required'),
  notes: z.string().optional(),
});

/**
 * Request body schema for scoring a match
 */
const scoreBodySchema = z.object({
  scoreJson: matchScoreSchema.optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled', 'walkover', 'forfeit']).optional(),
  winnerTeamId: z.number().int().positive().optional(),
  notes: z.string().optional(),
});

/**
 * Validate match score
 */
function validateMatchScore(scoreJson: MatchScore): { valid: boolean; error?: string } {
  if (!scoreJson || !scoreJson.games) {
    return { valid: false, error: 'Score must include games array' };
  }

  if (!Array.isArray(scoreJson.games) || scoreJson.games.length === 0) {
    return { valid: false, error: 'Games must be a non-empty array' };
  }

  // Validate each game
  for (let i = 0; i < scoreJson.games.length; i++) {
    const game = scoreJson.games[i];
    if (!game) continue;

    if (typeof game.teamA !== 'number' || typeof game.teamB !== 'number') {
      return { valid: false, error: `Game ${i + 1}: Scores must be numbers` };
    }

    if (game.teamA < 0 || game.teamB < 0) {
      return { valid: false, error: `Game ${i + 1}: Scores cannot be negative` };
    }

    if (game.teamA > 99 || game.teamB > 99) {
      return { valid: false, error: `Game ${i + 1}: Scores cannot exceed 99` };
    }
  }

  return { valid: true };
}

/**
 * Calculate winner from scores
 */
function calculateWinner(
  scoreJson: MatchScore,
  teamAId: number | null,
  teamBId: number | null
): number | null {
  if (!scoreJson.games || scoreJson.games.length === 0) {
    return null;
  }

  let teamAWins = 0;
  let teamBWins = 0;

  scoreJson.games.forEach((game: GameScore) => {
    if (game.teamA > game.teamB) {
      teamAWins++;
    } else if (game.teamB > game.teamA) {
      teamBWins++;
    }
  });

  if (teamAWins > teamBWins && teamAId) {
    return teamAId;
  } else if (teamBWins > teamAWins && teamBId) {
    return teamBId;
  }

  return null; // Tie or no clear winner
}

/**
 * Recalculate standings for division
 */
async function recalculateStandings(divisionId: number, fastify: any): Promise<void> {
  try {
    fastify.log.info({ divisionId }, 'Recalculating standings for division');

    // Get all completed matches for this division
    const completedMatches = await db
      .select()
      .from(matches)
      .where(
        and(
          eq(matches.division_id, divisionId),
          inArray(matches.status, ['completed', 'walkover', 'forfeit'])
        )
      );

    // Get all teams in division
    const divisionTeams = await db
      .select()
      .from(teams)
      .where(eq(teams.division_id, divisionId));

    // Initialize stats for each team
    const teamStats = new Map<number, {
      wins: number;
      losses: number;
      pointsFor: number;
      pointsAgainst: number;
      matchesPlayed: number;
    }>();

    divisionTeams.forEach(team => {
      teamStats.set(team.id, {
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        matchesPlayed: 0,
      });
    });

    // Calculate stats from matches
    completedMatches.forEach(match => {
      if (!match.team_a_id || !match.team_b_id) {
        return; // Skip BYE matches
      }

      const teamAStats = teamStats.get(match.team_a_id);
      const teamBStats = teamStats.get(match.team_b_id);

      if (!teamAStats || !teamBStats) {
        return; // Teams not found
      }

      // Handle walkover/forfeit
      if (match.status === 'walkover' || match.status === 'forfeit') {
        if (match.winner_team_id === match.team_a_id) {
          teamAStats.wins++;
          teamBStats.losses++;
        } else if (match.winner_team_id === match.team_b_id) {
          teamBStats.wins++;
          teamAStats.losses++;
        }
        teamAStats.matchesPlayed++;
        teamBStats.matchesPlayed++;
        return;
      }

      // Regular completed match with scores
      if (match.score_json) {
        let scoreJson: MatchScore;
        try {
          scoreJson = typeof match.score_json === 'string'
            ? JSON.parse(match.score_json) as MatchScore
            : match.score_json as MatchScore;
        } catch (e) {
          fastify.log.warn({ matchId: match.id }, 'Failed to parse score_json');
          return;
        }

        if (scoreJson.games) {
          scoreJson.games.forEach((game: GameScore) => {
            teamAStats.pointsFor += game.teamA || 0;
            teamAStats.pointsAgainst += game.teamB || 0;
            teamBStats.pointsFor += game.teamB || 0;
            teamBStats.pointsAgainst += game.teamA || 0;
          });

          // Determine match winner
          if (match.winner_team_id === match.team_a_id) {
            teamAStats.wins++;
            teamBStats.losses++;
          } else if (match.winner_team_id === match.team_b_id) {
            teamBStats.wins++;
            teamAStats.losses++;
          }

          teamAStats.matchesPlayed++;
          teamBStats.matchesPlayed++;
        }
      }
    });

    // Update teams table with calculated stats
    for (const [teamId, stats] of teamStats.entries()) {
      await db
        .update(teams)
        .set({
          wins: stats.wins,
          losses: stats.losses,
          points_for: stats.pointsFor,
          points_against: stats.pointsAgainst,
          matches_played: stats.matchesPlayed,
        })
        .where(eq(teams.id, teamId));
    }

    fastify.log.info({ divisionId, teamsUpdated: teamStats.size }, 'Standings recalculated successfully');
  } catch (error) {
    fastify.log.error({ error, divisionId }, 'Error recalculating standings');
    throw error;
  }
}

// eslint-disable-next-line @typescript-eslint/require-await
const scoreMatchRoute: FastifyPluginAsync = async (fastify) => {
  fastify.put<{
    Params: { id: number };
    Body: z.infer<typeof scoreBodySchema>;
  }>('/matches/:id/score', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    // Validate parameters
    const paramsResult = paramsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        error: 'Invalid match ID',
        details: paramsResult.error.flatten(),
      });
    }

    const { id: matchId } = paramsResult.data;

    // Validate body
    const bodyResult = scoreBodySchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: bodyResult.error.flatten(),
      });
    }

    const { scoreJson, status, winnerTeamId, notes } = bodyResult.data;

    try {
      // 1. Fetch match to verify it exists
      const match = await db
        .select()
        .from(matches)
        .where(eq(matches.id, matchId))
        .limit(1)
        .then((rows) => rows[0]);

      if (!match) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `Match with ID ${matchId} not found`,
        });
      }

      // 2. Validate scores if provided
      if (scoreJson) {
        const validation = validateMatchScore(scoreJson);
        if (!validation.valid) {
          return reply.status(400).send({
            error: validation.error,
          });
        }
      }

      // 3. Determine winner if not provided
      let finalWinnerId = winnerTeamId;
      if (!finalWinnerId && scoreJson && scoreJson.games && scoreJson.games.length > 0) {
        finalWinnerId = calculateWinner(scoreJson, match.team_a_id, match.team_b_id) || undefined;
      }

      // 4. Prepare score JSON with notes
      let finalScoreJson = scoreJson;
      if (scoreJson && notes) {
        finalScoreJson = { ...scoreJson, notes };
      }

      // 5. Update match
      const [updatedMatch] = await db
        .update(matches)
        .set({
          score_json: finalScoreJson ? JSON.stringify(finalScoreJson) : match.score_json,
          status: status || match.status,
          winner_team_id: finalWinnerId || match.winner_team_id,
        })
        .where(eq(matches.id, matchId))
        .returning();

      fastify.log.info({
        matchId,
        status: updatedMatch!.status,
        winnerTeamId: updatedMatch!.winner_team_id,
      }, 'Match updated successfully');

      // 6. If match is completed, recalculate standings
      if (status === 'completed' || status === 'walkover' || status === 'forfeit') {
        await recalculateStandings(match.division_id, fastify);
      }

      // 7. Parse score_json back for response
      let responseScoreJson: MatchScore | null = null;
      if (updatedMatch!.score_json) {
        try {
          responseScoreJson = typeof updatedMatch!.score_json === 'string'
            ? JSON.parse(updatedMatch!.score_json) as MatchScore
            : updatedMatch!.score_json as MatchScore;
        } catch (e) {
          fastify.log.warn({ matchId }, 'Failed to parse score_json for response');
        }
      }

      // 8. Return updated match
      return reply.send({
        success: true,
        match: {
          id: updatedMatch!.id,
          divisionId: updatedMatch!.division_id,
          poolId: updatedMatch!.pool_id,
          roundNumber: updatedMatch!.round_number,
          matchNumber: updatedMatch!.match_number,
          teamAId: updatedMatch!.team_a_id,
          teamBId: updatedMatch!.team_b_id,
          scoreJson: responseScoreJson,
          status: updatedMatch!.status,
          winnerTeamId: updatedMatch!.winner_team_id,
          scheduledAt: updatedMatch!.scheduled_at,
          courtNumber: updatedMatch!.court_number,
          slotIndex: updatedMatch!.slot_index,
          createdAt: updatedMatch!.created_at,
          updatedAt: updatedMatch!.updated_at,
        },
      });
    } catch (error) {
      fastify.log.error({ error, matchId }, 'Error scoring match');
      throw error;
    }
  });
};

export default scoreMatchRoute;
