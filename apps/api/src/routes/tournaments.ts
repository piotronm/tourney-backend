/**
 * Tournament CRUD endpoints.
 * Manages top-level tournament entities with full CRUD operations.
 *
 * Phase 2: New tournament routes for hierarchy restructuring
 */

import type { FastifyPluginAsync } from 'fastify';
import { eq, sql, desc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../lib/db/drizzle.js';
import { tournaments, divisions, teams, pools, matches, players, court_assignments } from '../lib/db/schema.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

/**
 * Create tournament schema.
 */
const createTournamentSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255, 'Name too long').trim(),
  description: z.string().max(1000).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.enum(['draft', 'active', 'completed', 'archived']).default('draft'),
});

/**
 * Update tournament schema.
 */
const updateTournamentSchema = z.object({
  name: z.string().min(1).max(255).trim().optional(),
  description: z.string().max(1000).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.enum(['draft', 'active', 'completed', 'archived']).optional(),
});

/**
 * Tournament ID parameter schema.
 */
const tournamentParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/**
 * List tournaments query schema.
 */
const listTournamentsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(['draft', 'active', 'completed', 'archived']).optional(),
});

// eslint-disable-next-line @typescript-eslint/require-await
const tournamentsRoutes: FastifyPluginAsync = async (fastify) => {
  // ============================================
  // CREATE Tournament
  // ============================================
  fastify.post('/tournaments', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    // Validate body
    const bodyResult = createTournamentSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: bodyResult.error.flatten(),
      });
    }

    const { name, description, startDate, endDate, status } = bodyResult.data;

    try {
      const [tournament] = await db
        .insert(tournaments)
        .values({
          name,
          description,
          start_date: startDate,
          end_date: endDate,
          status,
        })
        .returning();

      return reply.status(201).send(tournament);
    } catch (error) {
      fastify.log.error({ error, name }, 'Error creating tournament');
      throw error;
    }
  });

  // ============================================
  // LIST Tournaments
  // ============================================
  fastify.get('/tournaments', async (request, reply) => {
    // Validate query
    const queryResult = listTournamentsQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.status(400).send({
        error: 'Invalid query parameters',
        details: queryResult.error.flatten(),
      });
    }

    const { limit, offset, status } = queryResult.data;

    try {
      // Build query with optional status filter
      const whereClause = status ? eq(tournaments.status, status) : undefined;

      const tournamentsList = await db
        .select()
        .from(tournaments)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(tournaments.created_at));

      // Get total count
      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(tournaments)
        .where(whereClause);

      const total = Number(countResult[0]?.count || 0);

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
            createdAt: tournament.created_at,
            updatedAt: tournament.updated_at,
            stats: {
              divisions: Number(divisionCount?.count || 0),
              teams: Number(teamCount?.count || 0),
              matches: Number(matchCount?.count || 0),
            },
          };
        })
      );

      return reply.send({
        tournaments: tournamentsWithStats,
        total,
        limit,
        offset,
      });
    } catch (error) {
      fastify.log.error({ error }, 'Error listing tournaments');
      throw error;
    }
  });

  // ============================================
  // GET Single Tournament
  // ============================================
  fastify.get('/tournaments/:id', async (request, reply) => {
    // Validate parameters
    const paramsResult = tournamentParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        error: 'Invalid tournament ID',
        details: paramsResult.error.flatten(),
      });
    }

    const { id } = paramsResult.data;

    try {
      const [tournament] = await db
        .select()
        .from(tournaments)
        .where(eq(tournaments.id, id))
        .limit(1);

      if (!tournament) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `Tournament with ID ${id} not found`,
        });
      }

      // Get stats
      const [divisionCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(divisions)
        .where(eq(divisions.tournament_id, id));

      const [teamCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(teams)
        .where(sql`${teams.division_id} IN (
          SELECT ${divisions.id} FROM ${divisions}
          WHERE ${divisions.tournament_id} = ${id}
        )`);

      const [matchCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(matches)
        .where(sql`${matches.division_id} IN (
          SELECT ${divisions.id} FROM ${divisions}
          WHERE ${divisions.tournament_id} = ${id}
        )`);

      return reply.send({
        id: tournament.id,
        name: tournament.name,
        description: tournament.description,
        startDate: tournament.start_date,
        endDate: tournament.end_date,
        status: tournament.status,
        createdAt: tournament.created_at,
        updatedAt: tournament.updated_at,
        stats: {
          divisions: Number(divisionCount?.count || 0),
          teams: Number(teamCount?.count || 0),
          matches: Number(matchCount?.count || 0),
        },
      });
    } catch (error) {
      fastify.log.error({ error, id }, 'Error fetching tournament');
      throw error;
    }
  });

  // ============================================
  // UPDATE Tournament
  // ============================================
  fastify.put('/tournaments/:id', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    // Validate parameters
    const paramsResult = tournamentParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        error: 'Invalid tournament ID',
        details: paramsResult.error.flatten(),
      });
    }

    // Validate body
    const bodyResult = updateTournamentSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: bodyResult.error.flatten(),
      });
    }

    const { id } = paramsResult.data;
    const { name, description, startDate, endDate, status } = bodyResult.data;

    try {
      // Check if tournament exists
      const existing = await db
        .select()
        .from(tournaments)
        .where(eq(tournaments.id, id))
        .limit(1)
        .then((rows) => rows[0]);

      if (!existing) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `Tournament with ID ${id} not found`,
        });
      }

      // Build update object
      const updateData: Partial<typeof tournaments.$inferInsert> = {
        updated_at: sql`CURRENT_TIMESTAMP`,
      };

      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (startDate !== undefined) updateData.start_date = startDate;
      if (endDate !== undefined) updateData.end_date = endDate;
      if (status !== undefined) updateData.status = status;

      // Update tournament
      const [updated] = await db
        .update(tournaments)
        .set(updateData)
        .where(eq(tournaments.id, id))
        .returning();

      return reply.send(updated);
    } catch (error) {
      fastify.log.error({ error, id }, 'Error updating tournament');
      throw error;
    }
  });

  // ============================================
  // DELETE Tournament (with cascade)
  // ============================================
  fastify.delete('/tournaments/:id', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    // Validate parameters
    const paramsResult = tournamentParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        error: 'Invalid tournament ID',
        details: paramsResult.error.flatten(),
      });
    }

    const { id } = paramsResult.data;

    try {
      // Check if tournament exists
      const existing = await db
        .select()
        .from(tournaments)
        .where(eq(tournaments.id, id))
        .limit(1)
        .then((rows) => rows[0]);

      if (!existing) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `Tournament with ID ${id} not found`,
        });
      }

      // Get all divisions in this tournament for cascade delete
      const tournamentDivisions = await db
        .select()
        .from(divisions)
        .where(eq(divisions.tournament_id, id));

      const divisionIds = tournamentDivisions.map(d => d.id);

      if (divisionIds.length > 0) {
        // CASCADE DELETE in correct order to avoid FK violations

        // 1. Court assignments (references matches)
        await db.delete(court_assignments).where(
          sql`${court_assignments.match_id} IN (
            SELECT ${matches.id} FROM ${matches}
            WHERE ${matches.division_id} IN (${sql.join(divisionIds.map(id => sql`${id}`), sql`, `)})
          )`
        );

        // 2. Matches
        await db.delete(matches).where(
          sql`${matches.division_id} IN (${sql.join(divisionIds.map(id => sql`${id}`), sql`, `)})`
        );

        // 3. Players
        await db.delete(players).where(
          sql`${players.division_id} IN (${sql.join(divisionIds.map(id => sql`${id}`), sql`, `)})`
        );

        // 4. Teams
        await db.delete(teams).where(
          sql`${teams.division_id} IN (${sql.join(divisionIds.map(id => sql`${id}`), sql`, `)})`
        );

        // 5. Pools
        await db.delete(pools).where(
          sql`${pools.division_id} IN (${sql.join(divisionIds.map(id => sql`${id}`), sql`, `)})`
        );

        // 6. Divisions
        await db.delete(divisions).where(eq(divisions.tournament_id, id));
      }

      // 7. Finally, delete tournament
      await db.delete(tournaments).where(eq(tournaments.id, id));

      fastify.log.info({ tournamentId: id, divisionsDeleted: divisionIds.length }, 'Tournament deleted with cascade');

      return reply.send({
        message: 'Tournament deleted successfully',
        deletedId: id,
        cascadeDeleted: {
          divisions: divisionIds.length,
        },
      });
    } catch (error) {
      fastify.log.error({ error, id }, 'Error deleting tournament');
      throw error;
    }
  });
};

export default tournamentsRoutes;
