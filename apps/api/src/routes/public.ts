/**
 * Public API routes for frontend integration.
 * No authentication required - read-only access to tournament data.
 *
 * UPDATED: Phase 2 - Tournament hierarchy restructuring
 * All division routes now nest under tournaments
 *
 * BREAKING CHANGES:
 * - OLD: GET /api/public/divisions
 * - NEW: GET /api/public/tournaments/:tournamentId/divisions
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, sql, desc, and, like, inArray } from 'drizzle-orm';
import { db } from '../lib/db/drizzle.js';
import { tournaments, divisions, teams, pools, matches } from '../lib/db/schema.js';
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

const tournamentParamsSchema = z.object({
  tournamentId: z.coerce.number().int().positive(),
});

const tournamentAndDivisionParamsSchema = z.object({
  tournamentId: z.coerce.number().int().positive(),
  id: z.coerce.number().int().positive(),
});

const listDivisionsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().optional(),
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
  tournamentId: z.coerce.number().int().positive(),
  divisionId: z.coerce.number().int().positive(),
  teamId: z.coerce.number().int().positive(),
});

const poolParamsSchema = z.object({
  tournamentId: z.coerce.number().int().positive(),
  divisionId: z.coerce.number().int().positive(),
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
  // TOURNAMENT ENDPOINTS (NEW)
  // ============================================

  // ============================================
  // GET /api/public/tournaments
  // List all active tournaments
  // ============================================
  fastify.get(
    '/tournaments',
    {
      ...rateLimitConfig,
    },
    async (request, reply) => {
      try {
        // Get all active tournaments
        const tournamentsList = await db
          .select()
          .from(tournaments)
          .where(eq(tournaments.status, 'active'))
          .orderBy(desc(tournaments.start_date));

        // Get stats for each tournament
        const tournamentsWithStats = await Promise.all(
          tournamentsList.map(async (tournament) => {
            const [divisionCount] = await db
              .select({ count: sql<number>`count(*)` })
              .from(divisions)
              .where(eq(divisions.tournament_id, tournament.id));

            // Get team count via divisions
            const [teamCount] = await db
              .select({ count: sql<number>`count(*)` })
              .from(teams)
              .where(sql`${teams.division_id} IN (
                SELECT ${divisions.id} FROM ${divisions}
                WHERE ${divisions.tournament_id} = ${tournament.id}
              )`);

            // Get match count via divisions
            const [matchCount] = await db
              .select({ count: sql<number>`count(*)` })
              .from(matches)
              .where(sql`${matches.division_id} IN (
                SELECT ${divisions.id} FROM ${divisions}
                WHERE ${divisions.tournament_id} = ${tournament.id}
              )`);

            return {
              id: tournament.id,
              name: tournament.name,
              description: tournament.description,
              startDate: tournament.start_date,
              endDate: tournament.end_date,
              status: tournament.status,
              createdAt: serializeDate(tournament.created_at),
              updatedAt: serializeDate(tournament.updated_at),
              stats: {
                divisions: Number(divisionCount?.count || 0),
                teams: Number(teamCount?.count || 0),
                matches: Number(matchCount?.count || 0),
              },
            };
          })
        );

        // Set cache headers for performance
        reply.header('Cache-Control', 'public, max-age=60');

        return reply.send({
          data: tournamentsWithStats,
        });
      } catch (error) {
        fastify.log.error({ error }, 'Error listing tournaments');
        throw error;
      }
    }
  );

  // ============================================
  // GET /api/public/tournaments/:tournamentId
  // Get single tournament with full details
  // ============================================
  fastify.get(
    '/tournaments/:tournamentId',
    {
      ...rateLimitConfig,
    },
    async (request, reply) => {
      const paramsResult = tournamentParamsSchema.safeParse(request.params);

      if (!paramsResult.success) {
        return reply.badRequest('Invalid tournament ID');
      }

      const { tournamentId } = paramsResult.data;

      try {
        // Get tournament
        const [tournament] = await db
          .select()
          .from(tournaments)
          .where(eq(tournaments.id, tournamentId))
          .limit(1);

        if (!tournament) {
          return reply.notFound(`Tournament with ID ${tournamentId} not found`);
        }

        // Get stats
        const [divisionCount] = await db
          .select({ count: sql<number>`count(*)` })
          .from(divisions)
          .where(eq(divisions.tournament_id, tournamentId));

        const [teamCount] = await db
          .select({ count: sql<number>`count(*)` })
          .from(teams)
          .where(sql`${teams.division_id} IN (
            SELECT ${divisions.id} FROM ${divisions}
            WHERE ${divisions.tournament_id} = ${tournamentId}
          )`);

        const [matchCount] = await db
          .select({ count: sql<number>`count(*)` })
          .from(matches)
          .where(sql`${matches.division_id} IN (
            SELECT ${divisions.id} FROM ${divisions}
            WHERE ${divisions.tournament_id} = ${tournamentId}
          )`);

        const [completedCount] = await db
          .select({ count: sql<number>`count(*)` })
          .from(matches)
          .where(sql`${matches.division_id} IN (
            SELECT ${divisions.id} FROM ${divisions}
            WHERE ${divisions.tournament_id} = ${tournamentId}
          ) AND ${matches.status} = 'completed'`);

        // Get divisions for this tournament
        const tournamentDivisions = await db
          .select()
          .from(divisions)
          .where(eq(divisions.tournament_id, tournamentId));

        const divisionsWithCounts = await Promise.all(
          tournamentDivisions.map(async (division) => {
            const [teamCountResult] = await db
              .select({ count: sql<number>`count(*)` })
              .from(teams)
              .where(eq(teams.division_id, division.id));

            const [poolCountResult] = await db
              .select({ count: sql<number>`count(*)` })
              .from(pools)
              .where(eq(pools.division_id, division.id));

            return {
              id: division.id,
              name: division.name,
              teamCount: Number(teamCountResult?.count || 0),
              poolCount: Number(poolCountResult?.count || 0),
            };
          })
        );

        // Set cache headers
        reply.header('Cache-Control', 'public, max-age=60');

        return reply.send({
          id: tournament.id,
          name: tournament.name,
          description: tournament.description,
          startDate: tournament.start_date,
          endDate: tournament.end_date,
          status: tournament.status,
          createdAt: serializeDate(tournament.created_at),
          updatedAt: serializeDate(tournament.updated_at),
          stats: {
            divisions: Number(divisionCount?.count || 0),
            teams: Number(teamCount?.count || 0),
            matches: Number(matchCount?.count || 0),
            completedMatches: Number(completedCount?.count || 0),
          },
          divisions: divisionsWithCounts,
        });
      } catch (error) {
        fastify.log.error({ error, tournamentId }, 'Error fetching tournament');
        throw error;
      }
    }
  );

  // ============================================
  // DIVISION ENDPOINTS (UPDATED - Now nested under tournaments)
  // ============================================

  // ============================================
  // GET /api/public/tournaments/:tournamentId/divisions
  // List all divisions in a tournament (paginated)
  // ============================================
  fastify.get(
    '/tournaments/:tournamentId/divisions',
    {
      ...rateLimitConfig,
    },
    async (request, reply) => {
      const paramsResult = tournamentParamsSchema.safeParse(request.params);
      const queryResult = listDivisionsQuerySchema.safeParse(request.query);

      if (!paramsResult.success) {
        return reply.badRequest('Invalid tournament ID');
      }

      if (!queryResult.success) {
        return reply.badRequest('Invalid query parameters');
      }

      const { tournamentId } = paramsResult.data;
      const { limit, offset, search } = queryResult.data;

      try {
        // Verify tournament exists
        const [tournament] = await db
          .select()
          .from(tournaments)
          .where(eq(tournaments.id, tournamentId))
          .limit(1);

        if (!tournament) {
          return reply.notFound(`Tournament with ID ${tournamentId} not found`);
        }

        // Build query with tournament filter and optional search
        const baseConditions = [eq(divisions.tournament_id, tournamentId)];

        const divisionsList = search
          ? await db
              .select()
              .from(divisions)
              .where(
                and(
                  eq(divisions.tournament_id, tournamentId),
                  sql`${divisions.name} LIKE ${`%${search}%`}`
                )
              )
              .limit(limit)
              .offset(offset)
              .orderBy(desc(divisions.created_at))
          : await db
              .select()
              .from(divisions)
              .where(eq(divisions.tournament_id, tournamentId))
              .limit(limit)
              .offset(offset)
              .orderBy(desc(divisions.created_at));

        // Get total count (with search filter if applicable)
        const countConditions = search
          ? and(
              eq(divisions.tournament_id, tournamentId),
              sql`${divisions.name} LIKE ${`%${search}%`}`
            )
          : eq(divisions.tournament_id, tournamentId);

        const countResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(divisions)
          .where(countConditions);

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
              tournamentId: division.tournament_id,
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
            tournamentId,
            tournamentName: tournament.name,
          },
        });
      } catch (error) {
        fastify.log.error({ error, tournamentId }, 'Error listing divisions');
        throw error;
      }
    }
  );

  // ============================================
  // GET /api/public/tournaments/:tournamentId/divisions/:id
  // Get single division with full details
  // ============================================
  fastify.get(
    '/tournaments/:tournamentId/divisions/:id',
    {
      ...rateLimitConfig,
    },
    async (request, reply) => {
      const paramsResult = tournamentAndDivisionParamsSchema.safeParse(request.params);

      if (!paramsResult.success) {
        return reply.badRequest('Invalid tournament or division ID');
      }

      const { tournamentId, id } = paramsResult.data;

      try {
        // Verify tournament exists
        const [tournament] = await db
          .select()
          .from(tournaments)
          .where(eq(tournaments.id, tournamentId))
          .limit(1);

        if (!tournament) {
          return reply.notFound(`Tournament with ID ${tournamentId} not found`);
        }

        // Get division and verify it belongs to this tournament
        const [division] = await db
          .select()
          .from(divisions)
          .where(and(eq(divisions.id, id), eq(divisions.tournament_id, tournamentId)))
          .limit(1);

        if (!division) {
          return reply.notFound(`Division with ID ${id} not found in tournament ${tournamentId}`);
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
          tournamentId: division.tournament_id,
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
        fastify.log.error({ error, tournamentId, id }, 'Error fetching division');
        throw error;
      }
    }
  );

  // ============================================
  // GET /api/public/tournaments/:tournamentId/divisions/:id/standings
  // Get current standings (fully implemented)
  // ============================================
  fastify.get(
    '/tournaments/:tournamentId/divisions/:id/standings',
    {
      ...rateLimitConfig,
    },
    async (request, reply) => {
      const paramsResult = tournamentAndDivisionParamsSchema.safeParse(request.params);
      const queryResult = standingsQuerySchema.safeParse(request.query);

      if (!paramsResult.success) {
        return reply.badRequest('Invalid tournament or division ID');
      }

      if (!queryResult.success) {
        return reply.badRequest('Invalid query parameters');
      }

      const { tournamentId, id: divisionId } = paramsResult.data;
      const { poolId: filterPoolId } = queryResult.data;

      try {
        // 1. Verify tournament exists
        const [tournament] = await db
          .select()
          .from(tournaments)
          .where(eq(tournaments.id, tournamentId))
          .limit(1);

        if (!tournament) {
          return reply.notFound(`Tournament with ID ${tournamentId} not found`);
        }

        // 2. Verify division exists and belongs to tournament
        const [division] = await db
          .select()
          .from(divisions)
          .where(and(eq(divisions.id, divisionId), eq(divisions.tournament_id, tournamentId)))
          .limit(1);

        if (!division) {
          return reply.notFound(`Division with ID ${divisionId} not found in tournament ${tournamentId}`);
        }

        // 3. Fetch pools (filtered if poolId provided)
        let divisionPools;

        if (filterPoolId) {
          divisionPools = await db.select().from(pools).where(and(eq(pools.division_id, divisionId), eq(pools.id, filterPoolId)));

          if (divisionPools.length === 0) {
            return reply.notFound(`Pool with ID ${filterPoolId} not found in division ${divisionId}`);
          }
        } else {
          divisionPools = await db.select().from(pools).where(eq(pools.division_id, divisionId));
        }

        // 4. For each pool, calculate standings
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
          tournamentId,
          tournamentName: tournament.name,
          divisionId,
          divisionName: division.name,
          pools: poolStandings,
        });
      } catch (error) {
        fastify.log.error({ error, tournamentId, divisionId }, 'Error fetching standings');
        throw error;
      }
    }
  );

  // ============================================
  // GET /api/public/tournaments/:tournamentId/divisions/:id/matches
  // Get matches for a division (with filters)
  // ============================================
  fastify.get(
    '/tournaments/:tournamentId/divisions/:id/matches',
    {
      ...rateLimitConfig,
    },
    async (request, reply) => {
      const paramsResult = tournamentAndDivisionParamsSchema.safeParse(request.params);
      const queryResult = matchesQuerySchema.safeParse(request.query);

      if (!paramsResult.success) {
        return reply.badRequest('Invalid tournament or division ID');
      }

      if (!queryResult.success) {
        return reply.badRequest('Invalid query parameters');
      }

      const { tournamentId, id: divisionId } = paramsResult.data;
      const { poolId, status, limit, offset } = queryResult.data;

      try {
        // Verify tournament exists
        const [tournament] = await db
          .select()
          .from(tournaments)
          .where(eq(tournaments.id, tournamentId))
          .limit(1);

        if (!tournament) {
          return reply.notFound(`Tournament with ID ${tournamentId} not found`);
        }

        // Verify division exists and belongs to tournament
        const [division] = await db
          .select()
          .from(divisions)
          .where(and(eq(divisions.id, divisionId), eq(divisions.tournament_id, tournamentId)))
          .limit(1);

        if (!division) {
          return reply.notFound(`Division with ID ${divisionId} not found in tournament ${tournamentId}`);
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
        const teamIds = new Set(
          matchList.flatMap((m) => [m.team_a_id, m.team_b_id].filter((id): id is number => id !== null))
        );

        if (teamIds.size > 0) {
          const teamsList = await db.select().from(teams).where(inArray(teams.id, Array.from(teamIds)));
          teamsList.forEach((t) => teamsById.set(t.id, t.name));
        }

        // Get pool names
        const poolsById = new Map();
        const poolIds = new Set(
          matchList.map((m) => m.pool_id).filter((id): id is number => id !== null)
        );

        if (poolIds.size > 0) {
          const poolsList = await db.select().from(pools).where(inArray(pools.id, Array.from(poolIds)));
          poolsList.forEach((p) => poolsById.set(p.id, p.name));
        }

        // Format matches
        const formattedMatches = matchList.map((match) => {
          // Parse scoreJson if it's a string
          let scoreJson = null;
          if (match.score_json) {
            try {
              scoreJson = typeof match.score_json === 'string'
                ? JSON.parse(match.score_json)
                : match.score_json;
            } catch (e) {
              fastify.log.warn({ matchId: match.id }, 'Failed to parse score_json');
            }
          }

          return {
            id: match.id,
            divisionId: match.division_id,
            poolId: match.pool_id,
            poolName: match.pool_id ? poolsById.get(match.pool_id) || null : null,
            roundNumber: match.round_number,
            matchNumber: match.match_number,
            teamAId: match.team_a_id,
            teamAName: teamsById.get(match.team_a_id) || 'Unknown',
            teamBId: match.team_b_id,
            teamBName: match.team_b_id ? teamsById.get(match.team_b_id) || 'Unknown' : null,
            scoreJson: scoreJson,
            scoreA: match.score_a,
            scoreB: match.score_b,
            status: match.status,
            winnerTeamId: match.winner_team_id,
            scheduledAt: match.scheduled_at ? serializeDate(match.scheduled_at) : null,
            courtNumber: match.court_number,
            slotIndex: match.slot_index,
            courtLabel: match.court_number ? `Court ${match.court_number}` : null,
            createdAt: serializeDate(match.created_at),
            updatedAt: serializeDate(match.updated_at),
          };
        });

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
            tournamentId,
            divisionId,
          },
        });
      } catch (error) {
        fastify.log.error({ error, tournamentId, divisionId }, 'Error fetching matches');
        throw error;
      }
    }
  );

  // ============================================
  // GET /api/public/tournaments/:tournamentId/divisions/:divisionId/teams
  // List teams in a division (public read-only)
  // ============================================
  fastify.get<{
    Params: { tournamentId: string; divisionId: string };
    Querystring: z.infer<typeof listTeamsQuerySchema>;
  }>(
    '/tournaments/:tournamentId/divisions/:divisionId/teams',
    {
      ...rateLimitConfig,
    },
    async (request, reply) => {
      const paramsResult = z.object({
        tournamentId: z.coerce.number().int().positive(),
        divisionId: z.coerce.number().int().positive(),
      }).safeParse(request.params);

      const queryResult = listTeamsQuerySchema.safeParse(request.query);

      if (!paramsResult.success) {
        return reply.badRequest('Invalid tournament or division ID');
      }

      if (!queryResult.success) {
        return reply.badRequest('Invalid query parameters');
      }

      const { tournamentId, divisionId } = paramsResult.data;
      const { limit, offset, search, poolId } = queryResult.data;

      try {
        // Verify tournament exists
        const [tournament] = await db
          .select()
          .from(tournaments)
          .where(eq(tournaments.id, tournamentId))
          .limit(1);

        if (!tournament) {
          return reply.notFound(`Tournament with ID ${tournamentId} not found`);
        }

        // Verify division exists and belongs to tournament
        const [division] = await db
          .select()
          .from(divisions)
          .where(and(eq(divisions.id, divisionId), eq(divisions.tournament_id, tournamentId)))
          .limit(1);

        if (!division) {
          return reply.notFound(`Division with ID ${divisionId} not found in tournament ${tournamentId}`);
        }

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
            tournamentId,
            divisionId,
          },
        });
      } catch (error) {
        fastify.log.error({ error, tournamentId, divisionId }, 'Error fetching teams');
        throw error;
      }
    }
  );

  // ============================================
  // GET /api/public/tournaments/:tournamentId/divisions/:divisionId/teams/:teamId
  // Get single team (public read-only)
  // ============================================
  fastify.get<{
    Params: z.infer<typeof teamParamsSchema>;
  }>(
    '/tournaments/:tournamentId/divisions/:divisionId/teams/:teamId',
    {
      ...rateLimitConfig,
    },
    async (request, reply) => {
      const paramsResult = teamParamsSchema.safeParse(request.params);

      if (!paramsResult.success) {
        return reply.badRequest('Invalid parameters');
      }

      const { tournamentId, divisionId, teamId } = paramsResult.data;

      try {
        // Verify tournament exists
        const [tournament] = await db
          .select()
          .from(tournaments)
          .where(eq(tournaments.id, tournamentId))
          .limit(1);

        if (!tournament) {
          return reply.notFound(`Tournament with ID ${tournamentId} not found`);
        }

        // Verify division exists and belongs to tournament
        const [division] = await db
          .select()
          .from(divisions)
          .where(and(eq(divisions.id, divisionId), eq(divisions.tournament_id, tournamentId)))
          .limit(1);

        if (!division) {
          return reply.notFound(`Division with ID ${divisionId} not found in tournament ${tournamentId}`);
        }

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
        fastify.log.error({ error, tournamentId, divisionId, teamId }, 'Error fetching team');
        throw error;
      }
    }
  );

  // ============================================
  // GET /api/public/tournaments/:tournamentId/divisions/:divisionId/pools
  // List pools in a division (public read-only)
  // ============================================
  fastify.get<{
    Params: z.infer<typeof poolParamsSchema>;
  }>(
    '/tournaments/:tournamentId/divisions/:divisionId/pools',
    {
      ...rateLimitConfig,
    },
    async (request, reply) => {
      const paramsResult = poolParamsSchema.safeParse(request.params);

      if (!paramsResult.success) {
        return reply.badRequest('Invalid tournament or division ID');
      }

      const { tournamentId, divisionId } = paramsResult.data;

      try {
        // Verify tournament exists
        const [tournament] = await db
          .select()
          .from(tournaments)
          .where(eq(tournaments.id, tournamentId))
          .limit(1);

        if (!tournament) {
          return reply.notFound(`Tournament with ID ${tournamentId} not found`);
        }

        // Verify division exists and belongs to tournament
        const [division] = await db
          .select()
          .from(divisions)
          .where(and(eq(divisions.id, divisionId), eq(divisions.tournament_id, tournamentId)))
          .limit(1);

        if (!division) {
          return reply.notFound(`Division with ID ${divisionId} not found in tournament ${tournamentId}`);
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
          meta: {
            tournamentId,
            divisionId,
          },
        });
      } catch (error) {
        fastify.log.error({ error, tournamentId, divisionId }, 'Error fetching pools');
        throw error;
      }
    }
  );

  fastify.log.info('Public API routes registered (Phase 2 - Tournament hierarchy)');
};

export default publicRoutes;
