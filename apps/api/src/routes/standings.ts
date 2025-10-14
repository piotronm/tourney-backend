/**
 * Standings retrieval endpoint.
 * Gets division standings with rankings by pool.
 */

import type { FastifyPluginAsync } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../lib/db/drizzle.js';
import { divisions, pools, teams, matches } from '../lib/db/schema.js';
import { computePoolStandings } from 'tournament-engine';

/**
 * URL parameters schema.
 */
const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/**
 * Query parameters schema.
 */
const querySchema = z.object({
  poolId: z.coerce.number().int().positive().optional(),
});

// eslint-disable-next-line @typescript-eslint/require-await
const standingsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Params: { id: number };
    Querystring: z.infer<typeof querySchema>;
  }>('/divisions/:id/standings', async (request, reply) => {
    // Validate parameters
    const paramsResult = paramsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        error: 'Invalid division ID',
        details: paramsResult.error.flatten(),
      });
    }

    const { id: divisionId } = paramsResult.data;

    // Validate query
    const queryResult = querySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.status(400).send({
        error: 'Invalid query parameters',
        details: queryResult.error.flatten(),
      });
    }

    const { poolId: filterPoolId } = queryResult.data;

    try {
      // 1. Verify division exists
      const division = await db
        .select()
        .from(divisions)
        .where(eq(divisions.id, divisionId))
        .limit(1)
        .then((rows) => rows[0]);

      if (!division) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `Division with ID ${divisionId} not found`,
        });
      }

      // 2. Fetch pools (filtered if poolId provided)
      let divisionPools;
      if (filterPoolId) {
        divisionPools = await db
          .select()
          .from(pools)
          .where(and(eq(pools.division_id, divisionId), eq(pools.id, filterPoolId)));

        if (divisionPools.length === 0) {
          return reply.status(404).send({
            error: 'Not Found',
            message: `Pool with ID ${filterPoolId} not found in division ${divisionId}`,
          });
        }
      } else {
        divisionPools = await db
          .select()
          .from(pools)
          .where(eq(pools.division_id, divisionId));
      }

      // 3. For each pool, calculate standings
      const poolStandings = await Promise.all(
        divisionPools.map(async (pool) => {
          // Get all completed matches in this pool
          const poolMatches = await db
            .select()
            .from(matches)
            .where(and(eq(matches.pool_id, pool.id), eq(matches.status, 'completed')));

          // Get all teams in this pool
          const poolTeams = await db
            .select()
            .from(teams)
            .where(eq(teams.pool_id, pool.id));

          // Create team ID -> name map
          const teamMap = new Map(poolTeams.map((t) => [t.id, t.name]));

          // Convert to engine format
          const engineMatches = poolMatches.map((m) => ({
            id: m.id,
            poolId: m.pool_id,
            round: m.round_number,
            matchNumber: m.match_number,
            teamAId: m.team_a_id,
            teamBId: m.team_b_id,
            scoreA: m.score_a,
            scoreB: m.score_b,
            status: m.status,
          }));

          const standings = computePoolStandings(pool.id, engineMatches);

          // Add teams that have no completed matches yet
          const teamsInStandings = new Set(standings.map((s) => s.teamId));
          const missingTeams = poolTeams.filter((t) => !teamsInStandings.has(t.id));

          // Add missing teams with zero stats
          missingTeams.forEach((team) => {
            standings.push({
              teamId: team.id,
              wins: 0,
              losses: 0,
              pointsFor: 0,
              pointsAgainst: 0,
              pointDiff: 0,
            });
          });

          // Add rank and team names
          const standingsWithDetails = standings.map((standing, index) => ({
            rank: index + 1,
            teamId: standing.teamId,
            teamName: teamMap.get(standing.teamId) || 'Unknown',
            wins: standing.wins,
            losses: standing.losses,
            pointsFor: standing.pointsFor,
            pointsAgainst: standing.pointsAgainst,
            pointDiff: standing.pointDiff,
            matchesPlayed: standing.wins + standing.losses,
          }));

          return {
            poolId: pool.id,
            poolName: pool.name,
            standings: standingsWithDetails,
          };
        })
      );

      return reply.send({
        divisionId,
        divisionName: division.name,
        pools: poolStandings,
      });
    } catch (error) {
      fastify.log.error({ error, divisionId }, 'Error fetching standings');
      throw error;
    }
  });
};

export default standingsRoute;
