/**
 * Score match endpoint.
 * Updates match scores and returns recalculated standings.
 */

import type { FastifyPluginAsync } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../lib/db/drizzle.js';
import { matches } from '../lib/db/schema.js';
import { computePoolStandings } from 'tournament-engine';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

/**
 * URL parameters schema.
 */
const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/**
 * Request body schema for scoring a match.
 */
const scoreBodySchema = z.object({
  scoreA: z.number().int().min(0, 'Score A must be non-negative'),
  scoreB: z.number().int().min(0, 'Score B must be non-negative'),
});

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

    const { scoreA, scoreB } = bodyResult.data;

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

      // 2. Update match with scores and mark as completed
      const [updatedMatch] = await db
        .update(matches)
        .set({
          score_a: scoreA,
          score_b: scoreB,
          status: 'completed',
        })
        .where(eq(matches.id, matchId))
        .returning();

      // 3. Fetch all completed matches in this pool to recalculate standings
      const poolMatches = await db
        .select()
        .from(matches)
        .where(
          and(
            eq(matches.pool_id, match.pool_id!),
            eq(matches.status, 'completed')
          )
        );

      // 4. Convert to engine format for standings calculation
      const engineMatches = poolMatches.map((m) => ({
        id: m.id,
        poolId: m.pool_id!,
        round: m.round_number,
        matchNumber: m.match_number,
        teamAId: m.team_a_id!,
        teamBId: m.team_b_id,
        scoreA: m.score_a,
        scoreB: m.score_b,
        status: m.status,
      }));

      const standings = computePoolStandings(match.pool_id!, engineMatches);

      // 5. Return updated match and standings
      return reply.send({
        match: {
          id: updatedMatch!.id,
          divisionId: updatedMatch!.division_id,
          poolId: updatedMatch!.pool_id,
          roundNumber: updatedMatch!.round_number,
          matchNumber: updatedMatch!.match_number,
          teamAId: updatedMatch!.team_a_id,
          teamBId: updatedMatch!.team_b_id,
          scoreA: updatedMatch!.score_a,
          scoreB: updatedMatch!.score_b,
          status: updatedMatch!.status,
        },
        standings,
      });
    } catch (error) {
      fastify.log.error({ error, matchId }, 'Error scoring match');
      throw error;
    }
  });
};

export default scoreMatchRoute;
