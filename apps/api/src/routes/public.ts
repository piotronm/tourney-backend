/**
 * Public API routes for frontend integration.
 * No authentication required - read-only access to tournament data.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, sql, desc, and, like, inArray } from 'drizzle-orm';
import { db } from '../lib/db/drizzle.js';
import { divisions, teams, pools, matches } from '../lib/db/schema.js';
import { computePoolStandings } from 'tournament-engine';

// ============================================
// Helper Functions
// ============================================

/**
 * Safe date serialization - handles both Date objects and strings
 */
function serializeDate(date: Date | string | null | undefined): string {
  if (!date) return new Date().toISOString();
  if (typeof date === 'string') return new Date(date).toISOString();
  return date.toISOString();
}

// ============================================
// Zod Schemas for Validation
// ============================================

const listDivisionsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().optional(),
});

const divisionParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const standingsQuerySchema = z.object({
  poolId: z.coerce.number().int().positive().optional(),
});

const matchesQuerySchema = z.object({
  poolId: z.coerce.number().int().positive().optional(),
  status: z.enum(['pending', 'completed']).optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const listTeamsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().optional(),
  poolId: z.coerce.number().int().positive().optional(),
});

const teamParamsSchema = z.object({
  divisionId: z.coerce.number().int().positive(),
  teamId: z.coerce.number().int().positive(),
});

// ============================================
// Public Routes Plugin
// ============================================

const publicRoutes: FastifyPluginAsync = async (fastify) => {
  // Rate limit configuration for all public routes
  const rateLimitConfig = {
    config: {
      rateLimit: {
        max: 100,
        timeWindow: '1 minute',
      },
    },
  };

  // ============================================
  // GET /api/public/divisions
  // List all divisions (paginated)
  // ============================================
  fastify.get(
    '/divisions',
    {
      ...rateLimitConfig,
    },
    async (request, reply) => {
      const queryResult = listDivisionsQuerySchema.safeParse(request.query);

      if (!queryResult.success) {
        return reply.badRequest('Invalid query parameters');
      }

      const { limit, offset, search } = queryResult.data;

      try {
        // Build query with optional search filter
        const divisionsList = search
          ? await db
              .select()
              .from(divisions)
              .where(sql`${divisions.name} LIKE ${`%${search}%`}`)
              .limit(limit)
              .offset(offset)
              .orderBy(desc(divisions.created_at))
          : await db.select().from(divisions).limit(limit).offset(offset).orderBy(desc(divisions.created_at));

        // Get total count (with search filter if applicable)
        const countResult = search
          ? await db
              .select({ count: sql<number>`count(*)` })
              .from(divisions)
              .where(sql`${divisions.name} LIKE ${`%${search}%`}`)
          : await db.select({ count: sql<number>`count(*)` }).from(divisions);

        const total = Number(countResult[0]?.count || 0);

        // Get stats for each division
        const divisionsWithStats = await Promise.all(
          divisionsList.map(async (division) => {
            const [teamCountResult] = await db
              .select({ count: sql<number>`count(*)` })
              .from(teams)
              .where(eq(teams.division_id, division.id));

            const [poolCountResult] = await db
              .select({ count: sql<number>`count(*)` })
              .from(pools)
              .where(eq(pools.division_id, division.id));

            const [matchCountResult] = await db
              .select({ count: sql<number>`count(*)` })
              .from(matches)
              .where(eq(matches.division_id, division.id));

            const [completedCountResult] = await db
              .select({ count: sql<number>`count(*)` })
              .from(matches)
              .where(and(eq(matches.division_id, division.id), eq(matches.status, 'completed')));

            return {
              id: division.id,
              name: division.name,
              createdAt: serializeDate(division.created_at),
              stats: {
                teams: Number(teamCountResult?.count || 0),
                pools: Number(poolCountResult?.count || 0),
                matches: Number(matchCountResult?.count || 0),
                completedMatches: Number(completedCountResult?.count || 0),
              },
            };
          })
        );

        // Set cache headers for performance
        reply.header('Cache-Control', 'public, max-age=30');

        return reply.send({
          data: divisionsWithStats,
          meta: {
            total,
            limit,
            offset,
          },
        });
      } catch (error) {
        fastify.log.error({ error }, 'Error listing divisions');
        throw error;
      }
    }
  );

  // ============================================
  // GET /api/public/divisions/:id
  // Get single division with full details
  // ============================================
  fastify.get(
    '/divisions/:id',
    {
      ...rateLimitConfig,
    },
    async (request, reply) => {
      const paramsResult = divisionParamsSchema.safeParse(request.params);

      if (!paramsResult.success) {
        return reply.badRequest('Invalid division ID');
      }

      const { id } = paramsResult.data;

      try {
        // Get division
        const [division] = await db.select().from(divisions).where(eq(divisions.id, id)).limit(1);

        if (!division) {
          return reply.notFound(`Division with ID ${id} not found`);
        }

        // Get stats
        const [teamCountResult] = await db
          .select({ count: sql<number>`count(*)` })
          .from(teams)
          .where(eq(teams.division_id, id));

        const [poolCountResult] = await db
          .select({ count: sql<number>`count(*)` })
          .from(pools)
          .where(eq(pools.division_id, id));

        const [matchCountResult] = await db
          .select({ count: sql<number>`count(*)` })
          .from(matches)
          .where(eq(matches.division_id, id));

        const [completedCountResult] = await db
          .select({ count: sql<number>`count(*)` })
          .from(matches)
          .where(and(eq(matches.division_id, id), eq(matches.status, 'completed')));

        // Get pools with team counts
        const divisionPools = await db.select().from(pools).where(eq(pools.division_id, id));

        const poolsWithCounts = await Promise.all(
          divisionPools.map(async (pool) => {
            const [countResult] = await db
              .select({ count: sql<number>`count(*)` })
              .from(teams)
              .where(eq(teams.pool_id, pool.id));

            return {
              id: pool.id,
              name: pool.name,
              teamCount: Number(countResult?.count || 0),
            };
          })
        );

        // Set cache headers
        reply.header('Cache-Control', 'public, max-age=30');

        return reply.send({
          id: division.id,
          name: division.name,
          createdAt: serializeDate(division.created_at),
          stats: {
            teams: Number(teamCountResult?.count || 0),
            pools: Number(poolCountResult?.count || 0),
            matches: Number(matchCountResult?.count || 0),
            completedMatches: Number(completedCountResult?.count || 0),
          },
          pools: poolsWithCounts,
        });
      } catch (error) {
        fastify.log.error({ error, id }, 'Error fetching division');
        throw error;
      }
    }
  );

  // ============================================
  // GET /api/public/divisions/:id/standings
  // Get current standings (fully implemented)
  // ============================================
  fastify.get(
    '/divisions/:id/standings',
    {
      ...rateLimitConfig,
    },
    async (request, reply) => {
      const paramsResult = divisionParamsSchema.safeParse(request.params);
      const queryResult = standingsQuerySchema.safeParse(request.query);

      if (!paramsResult.success) {
        return reply.badRequest('Invalid division ID');
      }

      if (!queryResult.success) {
        return reply.badRequest('Invalid query parameters');
      }

      const { id: divisionId } = paramsResult.data;
      const { poolId: filterPoolId } = queryResult.data;

      try {
        // 1. Verify division exists
        const [division] = await db.select().from(divisions).where(eq(divisions.id, divisionId)).limit(1);

        if (!division) {
          return reply.notFound(`Division with ID ${divisionId} not found`);
        }

        // 2. Fetch pools (filtered if poolId provided)
        let divisionPools;

        if (filterPoolId) {
          divisionPools = await db.select().from(pools).where(and(eq(pools.division_id, divisionId), eq(pools.id, filterPoolId)));

          if (divisionPools.length === 0) {
            return reply.notFound(`Pool with ID ${filterPoolId} not found in division ${divisionId}`);
          }
        } else {
          divisionPools = await db.select().from(pools).where(eq(pools.division_id, divisionId));
        }

        // 3. For each pool, calculate standings
        const poolStandings = await Promise.all(
          divisionPools.map(async (pool) => {
            // Get all completed matches in this pool
            const poolMatches = await db.select().from(matches).where(and(eq(matches.pool_id, pool.id), eq(matches.status, 'completed')));

            // Get all teams in this pool
            const poolTeams = await db.select().from(teams).where(eq(teams.pool_id, pool.id));

            // Create team ID → name map
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

            // Get all team IDs in the pool
            const teamIds = poolTeams.map((t) => t.id);

            // Compute standings using the tournament engine
            const standings = computePoolStandings(pool.id, engineMatches);

            // Include teams with no completed matches (0-0 records)
            const teamsInStandings = new Set(standings.map((s) => s.teamId));
            const missingTeams = teamIds.filter((id) => !teamsInStandings.has(id));

            missingTeams.forEach((teamId) => {
              standings.push({
                teamId,
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
            }));

            return {
              poolId: pool.id,
              poolName: pool.name,
              standings: standingsWithDetails,
            };
          })
        );

        // Set cache headers (shorter for standings as they change frequently)
        reply.header('Cache-Control', 'public, max-age=15');

        return reply.send({
          divisionId,
          divisionName: division.name,
          pools: poolStandings,
        });
      } catch (error) {
        fastify.log.error({ error, divisionId }, 'Error fetching standings');
        throw error;
      }
    }
  );

  // ============================================
  // GET /api/public/divisions/:id/matches
  // Get matches for a division (with filters)
  // ============================================
  fastify.get(
    '/divisions/:id/matches',
    {
      ...rateLimitConfig,
    },
    async (request, reply) => {
      const paramsResult = divisionParamsSchema.safeParse(request.params);
      const queryResult = matchesQuerySchema.safeParse(request.query);

      if (!paramsResult.success) {
        return reply.badRequest('Invalid division ID');
      }

      if (!queryResult.success) {
        return reply.badRequest('Invalid query parameters');
      }

      const { id: divisionId } = paramsResult.data;
      const { poolId, status, limit, offset } = queryResult.data;

      try {
        // Verify division exists
        const [division] = await db.select().from(divisions).where(eq(divisions.id, divisionId)).limit(1);

        if (!division) {
          return reply.notFound(`Division with ID ${divisionId} not found`);
        }

        // Build query with filters
        const conditions = [eq(matches.division_id, divisionId)];

        if (poolId) {
          conditions.push(eq(matches.pool_id, poolId));
        }

        if (status) {
          conditions.push(eq(matches.status, status));
        }

        const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

        // Get matches
        const matchList = await db.select().from(matches).where(whereClause).limit(limit).offset(offset).orderBy(matches.round_number, matches.match_number);

        // Get team names
        const teamsById = new Map();
        const teamIds = new Set(matchList.flatMap((m) => [m.team_a_id, m.team_b_id].filter(Boolean)));

        if (teamIds.size > 0) {
          const teamsList = await db.select().from(teams).where(inArray(teams.id, Array.from(teamIds)));
          teamsList.forEach((t) => teamsById.set(t.id, t.name));
        }

        // Get pool names
        const poolsById = new Map();
        const poolIds = new Set(matchList.map((m) => m.pool_id).filter(Boolean));

        if (poolIds.size > 0) {
          const poolsList = await db.select().from(pools).where(inArray(pools.id, Array.from(poolIds)));
          poolsList.forEach((p) => poolsById.set(p.id, p.name));
        }

        // Format matches
        const formattedMatches = matchList.map((match) => ({
          id: match.id,
          poolId: match.pool_id,
          poolName: match.pool_id ? poolsById.get(match.pool_id) || null : null,
          roundNumber: match.round_number,
          matchNumber: match.match_number,
          teamAName: teamsById.get(match.team_a_id) || 'Unknown',
          teamBName: match.team_b_id ? teamsById.get(match.team_b_id) || 'Unknown' : null,
          scoreA: match.score_a,
          scoreB: match.score_b,
          status: match.status,
        }));

        // Get total count
        const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(matches).where(whereClause);

        // Set cache headers
        reply.header('Cache-Control', 'public, max-age=15');

        return reply.send({
          data: formattedMatches,
          meta: {
            total: Number(countResult?.count || 0),
            limit,
            offset,
          },
        });
      } catch (error) {
        fastify.log.error({ error, divisionId }, 'Error fetching matches');
        throw error;
      }
    }
  );

  // ============================================
  // GET /api/public/divisions/:divisionId/teams
  // List teams in a division (public read-only)
  // ============================================
  fastify.get<{
    Params: { divisionId: string };
    Querystring: z.infer<typeof listTeamsQuerySchema>;
  }>(
    '/divisions/:divisionId/teams',
    {
      ...rateLimitConfig,
    },
    async (request, reply) => {
      const divisionId = Number(request.params.divisionId);
      const queryResult = listTeamsQuerySchema.safeParse(request.query);

      if (!queryResult.success || isNaN(divisionId)) {
        return reply.badRequest('Invalid parameters');
      }

      const { limit, offset, search, poolId } = queryResult.data;

      try {
        // Build conditions
        const conditions = [eq(teams.division_id, divisionId)];

        if (search) {
          conditions.push(like(teams.name, `%${search}%`));
        }

        if (poolId) {
          conditions.push(eq(teams.pool_id, poolId));
        }

        // Get teams with pool names
        const teamsList = await db
          .select({
            id: teams.id,
            division_id: teams.division_id,
            name: teams.name,
            pool_id: teams.pool_id,
            pool_seed: teams.pool_seed,
            created_at: teams.created_at,
            updated_at: teams.updated_at,
            pool_name: pools.name,
          })
          .from(teams)
          .leftJoin(pools, eq(teams.pool_id, pools.id))
          .where(and(...conditions))
          .orderBy(desc(teams.created_at))
          .limit(limit)
          .offset(offset);

        // Get total count
        const countResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(teams)
          .where(and(...conditions));

        const total = countResult[0]?.count || 0;

        // Format response
        const formattedTeams = teamsList.map(t => ({
          id: t.id,
          divisionId: t.division_id,
          name: t.name,
          poolId: t.pool_id,
          poolName: t.pool_name,
          poolSeed: t.pool_seed,
          createdAt: serializeDate(t.created_at),
          updatedAt: serializeDate(t.updated_at),
        }));

        return reply.send({
          data: formattedTeams,
          meta: {
            total: Number(total),
            limit,
            offset,
          },
        });
      } catch (error) {
        fastify.log.error({ error, divisionId }, 'Error fetching teams');
        throw error;
      }
    }
  );

  // ============================================
  // GET /api/public/divisions/:divisionId/teams/:teamId
  // Get single team (public read-only)
  // ============================================
  fastify.get<{
    Params: z.infer<typeof teamParamsSchema>;
  }>(
    '/divisions/:divisionId/teams/:teamId',
    {
      ...rateLimitConfig,
    },
    async (request, reply) => {
      const paramsResult = teamParamsSchema.safeParse(request.params);

      if (!paramsResult.success) {
        return reply.badRequest('Invalid parameters');
      }

      const { divisionId, teamId } = paramsResult.data;

      try {
        // Get team with pool name
        const result = await db
          .select({
            id: teams.id,
            division_id: teams.division_id,
            name: teams.name,
            pool_id: teams.pool_id,
            pool_seed: teams.pool_seed,
            created_at: teams.created_at,
            updated_at: teams.updated_at,
            pool_name: pools.name,
          })
          .from(teams)
          .leftJoin(pools, eq(teams.pool_id, pools.id))
          .where(and(
            eq(teams.id, teamId),
            eq(teams.division_id, divisionId)
          ))
          .limit(1);

        if (result.length === 0) {
          return reply.notFound('Team not found');
        }

        const team = result[0]!;

        return reply.send({
          data: {
            id: team.id,
            divisionId: team.division_id,
            name: team.name,
            poolId: team.pool_id,
            poolName: team.pool_name,
            poolSeed: team.pool_seed,
            createdAt: serializeDate(team.created_at),
            updatedAt: serializeDate(team.updated_at),
          },
        });
      } catch (error) {
        fastify.log.error({ error, divisionId, teamId }, 'Error fetching team');
        throw error;
      }
    }
  );

  // ============================================
  // GET /api/public/divisions/:divisionId/pools
  // List pools in a division (public read-only)
  // ============================================
  fastify.get<{
    Params: { divisionId: string };
  }>(
    '/divisions/:divisionId/pools',
    {
      ...rateLimitConfig,
    },
    async (request, reply) => {
      const divisionId = Number(request.params.divisionId);

      if (isNaN(divisionId)) {
        return reply.badRequest('Invalid division ID');
      }

      try {
        // Verify division exists
        const [division] = await db
          .select()
          .from(divisions)
          .where(eq(divisions.id, divisionId))
          .limit(1);

        if (!division) {
          return reply.notFound(`Division with ID ${divisionId} not found`);
        }

        // Get all pools for this division with team counts
        const divisionPools = await db
          .select()
          .from(pools)
          .where(eq(pools.division_id, divisionId))
          .orderBy(pools.order_index);

        // Get teams for each pool
        const poolsWithTeams = await Promise.all(
          divisionPools.map(async (pool) => {
            const poolTeams = await db
              .select()
              .from(teams)
              .where(eq(teams.pool_id, pool.id))
              .orderBy(teams.pool_seed);

            return {
              id: pool.id,
              divisionId: pool.division_id,
              name: pool.name,
              label: pool.label,
              orderIndex: pool.order_index,
              createdAt: serializeDate(pool.created_at),
              updatedAt: serializeDate(pool.updated_at),
              teams: poolTeams.map(team => ({
                id: team.id,
                name: team.name,
                poolSeed: team.pool_seed,
              })),
            };
          })
        );

        // Set cache headers
        reply.header('Cache-Control', 'public, max-age=30');

        return reply.send({
          data: poolsWithTeams,
        });
      } catch (error) {
        fastify.log.error({ error, divisionId }, 'Error fetching pools');
        throw error;
      }
    }
  );

  fastify.log.info('Public API routes registered');
};

export default publicRoutes;
