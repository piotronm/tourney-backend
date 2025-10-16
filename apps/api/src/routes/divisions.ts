/**
 * Division CRUD endpoints.
 * Manages tournament divisions with full CRUD operations.
 */

import type { FastifyPluginAsync } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../lib/db/drizzle.js';
import { divisions, teams, pools, matches, players, court_assignments } from '../lib/db/schema.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

/**
 * Create division schema.
 */
const createDivisionSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255, 'Name too long').trim(),
});

/**
 * Update division schema.
 */
const updateDivisionSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255, 'Name too long').trim(),
});

/**
 * Division ID parameter schema.
 */
const divisionParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/**
 * List divisions query schema.
 */
const listDivisionsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// eslint-disable-next-line @typescript-eslint/require-await
const divisionsRoutes: FastifyPluginAsync = async (fastify) => {
  // CREATE Division
  fastify.post<{
    Body: z.infer<typeof createDivisionSchema>;
  }>('/divisions', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    // Validate body
    const bodyResult = createDivisionSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: bodyResult.error.flatten(),
      });
    }

    const { name } = bodyResult.data;

    try {
      const [division] = await db
        .insert(divisions)
        .values({ name })
        .returning();

      return reply.status(201).send(division);
    } catch (error) {
      fastify.log.error({ error, name }, 'Error creating division');
      throw error;
    }
  });

  // LIST Divisions
  fastify.get<{
    Querystring: z.infer<typeof listDivisionsQuerySchema>;
  }>('/divisions', async (request, reply) => {
    // Validate query
    const queryResult = listDivisionsQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.status(400).send({
        error: 'Invalid query parameters',
        details: queryResult.error.flatten(),
      });
    }

    const { limit, offset } = queryResult.data;

    try {
      // Get divisions with pagination
      const divisionsList = await db
        .select()
        .from(divisions)
        .limit(limit)
        .offset(offset)
        .orderBy(sql`${divisions.created_at} DESC`);

      // Get total count
      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(divisions);

      return reply.send({
        divisions: divisionsList,
        total: Number(countResult[0]?.count || 0),
        limit,
        offset,
      });
    } catch (error) {
      fastify.log.error({ error }, 'Error listing divisions');
      throw error;
    }
  });

  // GET Single Division
  fastify.get<{
    Params: { id: number };
  }>('/divisions/:id', async (request, reply) => {
    // Validate parameters
    const paramsResult = divisionParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        error: 'Invalid division ID',
        details: paramsResult.error.flatten(),
      });
    }

    const { id } = paramsResult.data;

    try {
      const division = await db
        .select()
        .from(divisions)
        .where(eq(divisions.id, id))
        .limit(1)
        .then((rows) => rows[0]);

      if (!division) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `Division with ID ${id} not found`,
        });
      }

      // Get stats
      const teamCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(teams)
        .where(eq(teams.division_id, id));

      const poolCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(pools)
        .where(eq(pools.division_id, id));

      const matchCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(matches)
        .where(eq(matches.division_id, id));

      return reply.send({
        ...division,
        stats: {
          teams: Number(teamCount[0]?.count || 0),
          pools: Number(poolCount[0]?.count || 0),
          matches: Number(matchCount[0]?.count || 0),
        },
      });
    } catch (error) {
      fastify.log.error({ error, id }, 'Error fetching division');
      throw error;
    }
  });

  // UPDATE Division
  fastify.put<{
    Params: { id: number };
    Body: z.infer<typeof updateDivisionSchema>;
  }>('/divisions/:id', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    // Validate parameters
    const paramsResult = divisionParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        error: 'Invalid division ID',
        details: paramsResult.error.flatten(),
      });
    }

    const { id } = paramsResult.data;

    // Validate body
    const bodyResult = updateDivisionSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: bodyResult.error.flatten(),
      });
    }

    const { name } = bodyResult.data;

    try {
      // Check if division exists
      const existing = await db
        .select()
        .from(divisions)
        .where(eq(divisions.id, id))
        .limit(1)
        .then((rows) => rows[0]);

      if (!existing) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `Division with ID ${id} not found`,
        });
      }

      // Update division
      const [updated] = await db
        .update(divisions)
        .set({ name })
        .where(eq(divisions.id, id))
        .returning();

      return reply.send(updated);
    } catch (error) {
      fastify.log.error({ error, id, name }, 'Error updating division');
      throw error;
    }
  });

  // DELETE Division
  fastify.delete<{
    Params: { id: number };
  }>('/divisions/:id', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    // Validate parameters
    const paramsResult = divisionParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        error: 'Invalid division ID',
        details: paramsResult.error.flatten(),
      });
    }

    const { id } = paramsResult.data;

    try {
      // Check if division exists
      const existing = await db
        .select()
        .from(divisions)
        .where(eq(divisions.id, id))
        .limit(1)
        .then((rows) => rows[0]);

      if (!existing) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `Division with ID ${id} not found`,
        });
      }

      // CASCADE DELETE: Delete related records in order
      // 1. Court assignments (references matches)
      await db.delete(court_assignments).where(
        sql`${court_assignments.match_id} IN (
          SELECT ${matches.id} FROM ${matches} WHERE ${matches.division_id} = ${id}
        )`
      );

      // 2. Matches
      await db.delete(matches).where(eq(matches.division_id, id));

      // 3. Players
      await db.delete(players).where(eq(players.division_id, id));

      // 4. Teams
      await db.delete(teams).where(eq(teams.division_id, id));

      // 5. Pools
      await db.delete(pools).where(eq(pools.division_id, id));

      // 6. Finally, delete division
      await db.delete(divisions).where(eq(divisions.id, id));

      return reply.send({
        message: 'Division deleted successfully',
        deletedId: id,
      });
    } catch (error) {
      fastify.log.error({ error, id }, 'Error deleting division');
      throw error;
    }
  });
  // ============================================
  // POOL MANAGEMENT ENDPOINTS
  // ============================================

  /**
   * Create pool schema.
   */
  const createPoolSchema = z.object({
    name: z.string().min(1, 'Name is required').max(50, 'Name too long').trim(),
    label: z.string().length(1, 'Label must be exactly 1 character').regex(/^[A-Z]$/, 'Label must be uppercase letter'),
    orderIndex: z.number().int().min(1).max(100),
  });

  /**
   * Update pool schema.
   */
  const updatePoolSchema = z.object({
    name: z.string().min(1, 'Name is required').max(50, 'Name too long').trim(),
    label: z.string().length(1, 'Label must be exactly 1 character').regex(/^[A-Z]$/, 'Label must be uppercase letter'),
    orderIndex: z.number().int().min(1).max(100),
  });

  // CREATE Pool
  fastify.post<{
    Params: { divisionId: number };
    Body: z.infer<typeof createPoolSchema>;
  }>('/divisions/:divisionId/pools', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    const divisionId = Number(request.params.divisionId);

    if (isNaN(divisionId)) {
      return reply.status(400).send({
        error: 'Invalid division ID',
      });
    }

    // Validate body
    const bodyResult = createPoolSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: bodyResult.error.flatten(),
      });
    }

    const { name, label, orderIndex } = bodyResult.data;

    try {
      // Verify division exists
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

      // Create pool
      const [pool] = await db
        .insert(pools)
        .values({
          division_id: divisionId,
          name,
          label,
          order_index: orderIndex,
        })
        .returning();

      return reply.status(201).send(pool);
    } catch (error) {
      fastify.log.error({ error, divisionId, name, label }, 'Error creating pool');
      throw error;
    }
  });

  // UPDATE Pool
  fastify.put<{
    Params: { poolId: number };
    Body: z.infer<typeof updatePoolSchema>;
  }>('/pools/:poolId', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    const poolId = Number(request.params.poolId);

    if (isNaN(poolId)) {
      return reply.status(400).send({
        error: 'Invalid pool ID',
      });
    }

    // Validate body
    const bodyResult = updatePoolSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: bodyResult.error.flatten(),
      });
    }

    const { name, label, orderIndex } = bodyResult.data;

    try {
      // Check if pool exists
      const existing = await db
        .select()
        .from(pools)
        .where(eq(pools.id, poolId))
        .limit(1)
        .then((rows) => rows[0]);

      if (!existing) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `Pool with ID ${poolId} not found`,
        });
      }

      // Update pool
      const [updated] = await db
        .update(pools)
        .set({
          name,
          label,
          order_index: orderIndex,
          updated_at: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(pools.id, poolId))
        .returning();

      return reply.send(updated);
    } catch (error) {
      fastify.log.error({ error, poolId, name, label }, 'Error updating pool');
      throw error;
    }
  });

  // DELETE Pool
  fastify.delete<{
    Params: { poolId: number };
  }>('/pools/:poolId', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    const poolId = Number(request.params.poolId);

    if (isNaN(poolId)) {
      return reply.status(400).send({
        error: 'Invalid pool ID',
      });
    }

    try {
      // Check if pool exists
      const existing = await db
        .select()
        .from(pools)
        .where(eq(pools.id, poolId))
        .limit(1)
        .then((rows) => rows[0]);

      if (!existing) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `Pool with ID ${poolId} not found`,
        });
      }

      // Unassign teams from this pool (set pool_id to null)
      await db
        .update(teams)
        .set({ pool_id: null, pool_seed: null })
        .where(eq(teams.pool_id, poolId));

      // Delete associated matches
      await db.delete(matches).where(eq(matches.pool_id, poolId));

      // Delete pool
      await db.delete(pools).where(eq(pools.id, poolId));

      return reply.send({
        message: 'Pool deleted successfully',
        deletedId: poolId,
      });
    } catch (error) {
      fastify.log.error({ error, poolId }, 'Error deleting pool');
      throw error;
    }
  });
};

export default divisionsRoutes;
