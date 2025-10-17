/**
 * Team CRUD endpoints.
 * Manages tournament teams with full CRUD operations.
 */

import type { FastifyPluginAsync } from 'fastify';
import { eq, sql, like, and, desc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../lib/db/drizzle.js';
import { divisions, teams, pools } from '../lib/db/schema.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

/**
 * Create team schema.
 */
const createTeamSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters').max(50, 'Name too long').trim(),
  poolId: z.number().int().positive().optional().nullable(),
  poolSeed: z.number().int().positive().optional().nullable(),
});

/**
 * Update team schema.
 */
const updateTeamSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters').max(50, 'Name too long').trim().optional(),
  poolId: z.number().int().positive().optional().nullable(),
  poolSeed: z.number().int().positive().optional().nullable(),
});

/**
 * Division and team ID parameter schema.
 */
const teamParamsSchema = z.object({
  divisionId: z.coerce.number().int().positive(),
  teamId: z.coerce.number().int().positive(),
});

/**
 * Division ID parameter schema.
 */
const divisionParamsSchema = z.object({
  divisionId: z.coerce.number().int().positive(),
});

/**
 * List teams query schema.
 */
const listTeamsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().optional(),
  poolId: z.coerce.number().int().positive().optional(),
});

/**
 * Bulk import schema.
 */
const bulkImportSchema = z.object({
  teams: z.array(z.object({
    name: z.string().min(3).max(50).trim(),
    poolName: z.string().optional(),
    poolSeed: z.number().int().positive().optional(),
  })),
});

// eslint-disable-next-line @typescript-eslint/require-await
const teamsRoutes: FastifyPluginAsync = async (fastify) => {
  // CREATE Team
  fastify.post<{
    Params: z.infer<typeof divisionParamsSchema>;
    Body: z.infer<typeof createTeamSchema>;
  }>('/divisions/:divisionId/teams', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    // Validate params
    const paramsResult = divisionParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        error: 'Invalid parameters',
        details: paramsResult.error.flatten(),
      });
    }

    // Validate body
    const bodyResult = createTeamSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: bodyResult.error.flatten(),
      });
    }

    const { divisionId } = paramsResult.data;
    const { name, poolId, poolSeed } = bodyResult.data;

    try {
      // Check division exists
      const divisionCheck = await db
        .select()
        .from(divisions)
        .where(eq(divisions.id, divisionId))
        .limit(1);

      if (divisionCheck.length === 0) {
        return reply.status(404).send({
          error: 'Division not found',
        });
      }

      // Check for duplicate team name
      const duplicateCheck = await db
        .select()
        .from(teams)
        .where(and(
          eq(teams.division_id, divisionId),
          eq(teams.name, name)
        ))
        .limit(1);

      if (duplicateCheck.length > 0) {
        return reply.status(409).send({
          error: 'Team name already exists in this division',
        });
      }

      // If poolId provided, verify it exists
      if (poolId) {
        const poolCheck = await db
          .select()
          .from(pools)
          .where(and(
            eq(pools.id, poolId),
            eq(pools.division_id, divisionId)
          ))
          .limit(1);

        if (poolCheck.length === 0) {
          return reply.status(400).send({
            error: 'Pool not found in this division',
          });
        }
      }

      // Create team
      const [team] = await db
        .insert(teams)
        .values({
          division_id: divisionId,
          name,
          pool_id: poolId || null,
          pool_seed: poolSeed || null,
        })
        .returning();

      if (!team) {
        return reply.status(500).send({
          error: 'Failed to create team',
        });
      }

      // Get pool name if assigned
      let poolName = null;
      if (team.pool_id) {
        const poolResult = await db
          .select({ name: pools.name })
          .from(pools)
          .where(eq(pools.id, team.pool_id))
          .limit(1);
        poolName = poolResult[0]?.name;
      }

      // Format response
      return reply.status(201).send({
        id: team.id,
        divisionId: team.division_id,
        name: team.name,
        poolId: team.pool_id,
        poolName,
        poolSeed: team.pool_seed,
        createdAt: team.created_at,
        updatedAt: team.updated_at,
      });
    } catch (error) {
      fastify.log.error({ error, divisionId, name }, 'Error creating team');
      throw error;
    }
  });

  // LIST Teams (authenticated admin route)
  fastify.get<{
    Params: z.infer<typeof divisionParamsSchema>;
    Querystring: z.infer<typeof listTeamsQuerySchema>;
  }>('/divisions/:divisionId/teams', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    // Validate params
    const paramsResult = divisionParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        error: 'Invalid parameters',
        details: paramsResult.error.flatten(),
      });
    }

    // Validate query
    const queryResult = listTeamsQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.status(400).send({
        error: 'Invalid query parameters',
        details: queryResult.error.flatten(),
      });
    }

    const { divisionId } = paramsResult.data;
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
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      }));

      return reply.send({
        teams: formattedTeams,
        total,
        limit,
        offset,
      });
    } catch (error) {
      fastify.log.error({ error, divisionId }, 'Error listing teams');
      throw error;
    }
  });

  // GET Single Team (authenticated admin route)
  fastify.get<{
    Params: z.infer<typeof teamParamsSchema>;
  }>('/divisions/:divisionId/teams/:teamId', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    // Validate params
    const paramsResult = teamParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        error: 'Invalid parameters',
        details: paramsResult.error.flatten(),
      });
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
        return reply.status(404).send({
          error: 'Team not found',
        });
      }

      const team = result[0]!;

      return reply.send({
        id: team.id,
        divisionId: team.division_id,
        name: team.name,
        poolId: team.pool_id,
        poolName: team.pool_name,
        poolSeed: team.pool_seed,
        createdAt: team.created_at,
        updatedAt: team.updated_at,
      });
    } catch (error) {
      fastify.log.error({ error, divisionId, teamId }, 'Error getting team');
      throw error;
    }
  });

  // UPDATE Team
  fastify.put<{
    Params: z.infer<typeof teamParamsSchema>;
    Body: z.infer<typeof updateTeamSchema>;
  }>('/divisions/:divisionId/teams/:teamId', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    // Validate params
    const paramsResult = teamParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        error: 'Invalid parameters',
        details: paramsResult.error.flatten(),
      });
    }

    // Validate body
    const bodyResult = updateTeamSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: bodyResult.error.flatten(),
      });
    }

    const { divisionId, teamId } = paramsResult.data;
    const updates = bodyResult.data;

    try {
      // Check team exists
      const existing = await db
        .select()
        .from(teams)
        .where(and(
          eq(teams.id, teamId),
          eq(teams.division_id, divisionId)
        ))
        .limit(1);

      if (existing.length === 0) {
        return reply.status(404).send({
          error: 'Team not found',
        });
      }

      // If updating name, check for duplicates
      if (updates.name) {
        const duplicate = await db
          .select()
          .from(teams)
          .where(and(
            eq(teams.division_id, divisionId),
            eq(teams.name, updates.name),
            sql`${teams.id} != ${teamId}`
          ))
          .limit(1);

        if (duplicate.length > 0) {
          return reply.status(409).send({
            error: 'Team name already exists in this division',
          });
        }
      }

      // If updating poolId, verify it exists
      if (updates.poolId !== undefined && updates.poolId !== null) {
        const poolCheck = await db
          .select()
          .from(pools)
          .where(and(
            eq(pools.id, updates.poolId),
            eq(pools.division_id, divisionId)
          ))
          .limit(1);

        if (poolCheck.length === 0) {
          return reply.status(400).send({
            error: 'Pool not found in this division',
          });
        }
      }

      // Build update object
      const updateData: Partial<typeof teams.$inferInsert> = {
        updated_at: new Date().toISOString(),
      };

      if (updates.name !== undefined) {
        updateData.name = updates.name;
      }
      if (updates.poolId !== undefined) {
        updateData.pool_id = updates.poolId;
      }
      if (updates.poolSeed !== undefined) {
        updateData.pool_seed = updates.poolSeed;
      }

      // Update team
      const [updatedTeam] = await db
        .update(teams)
        .set(updateData)
        .where(eq(teams.id, teamId))
        .returning();

      if (!updatedTeam) {
        return reply.status(500).send({
          error: 'Failed to update team',
        });
      }

      // Get pool name
      let poolName = null;
      if (updatedTeam.pool_id) {
        const poolResult = await db
          .select({ name: pools.name })
          .from(pools)
          .where(eq(pools.id, updatedTeam.pool_id))
          .limit(1);
        poolName = poolResult[0]?.name;
      }

      return reply.send({
        id: updatedTeam.id,
        divisionId: updatedTeam.division_id,
        name: updatedTeam.name,
        poolId: updatedTeam.pool_id,
        poolName,
        poolSeed: updatedTeam.pool_seed,
        createdAt: updatedTeam.created_at,
        updatedAt: updatedTeam.updated_at,
      });
    } catch (error) {
      fastify.log.error({ error, divisionId, teamId }, 'Error updating team');
      throw error;
    }
  });

  // DELETE Team
  fastify.delete<{
    Params: z.infer<typeof teamParamsSchema>;
  }>('/divisions/:divisionId/teams/:teamId', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    // Validate params
    const paramsResult = teamParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        error: 'Invalid parameters',
        details: paramsResult.error.flatten(),
      });
    }

    const { divisionId, teamId } = paramsResult.data;

    try {
      // Check team exists
      const existing = await db
        .select()
        .from(teams)
        .where(and(
          eq(teams.id, teamId),
          eq(teams.division_id, divisionId)
        ))
        .limit(1);

      if (existing.length === 0) {
        return reply.status(404).send({
          error: 'Team not found',
        });
      }

      // Delete team
      await db
        .delete(teams)
        .where(eq(teams.id, teamId));

      return reply.status(204).send();
    } catch (error) {
      fastify.log.error({ error, divisionId, teamId }, 'Error deleting team');
      throw error;
    }
  });

  // BULK IMPORT Teams
  fastify.post<{
    Params: z.infer<typeof divisionParamsSchema>;
    Body: z.infer<typeof bulkImportSchema>;
  }>('/divisions/:divisionId/teams/bulk-import', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    // Validate params
    const paramsResult = divisionParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        error: 'Invalid parameters',
        details: paramsResult.error.flatten(),
      });
    }

    // Validate body
    const bodyResult = bulkImportSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: bodyResult.error.flatten(),
      });
    }

    const { divisionId } = paramsResult.data;
    const { teams: importTeams } = bodyResult.data;

    try {
      // Check division exists
      const divisionCheck = await db
        .select()
        .from(divisions)
        .where(eq(divisions.id, divisionId))
        .limit(1);

      if (divisionCheck.length === 0) {
        return reply.status(404).send({
          error: 'Division not found',
        });
      }

      // Get all pools for this division
      const divisionPools = await db
        .select()
        .from(pools)
        .where(eq(pools.division_id, divisionId));

      const poolsByName = new Map(
        divisionPools.map(p => [p.name.toLowerCase(), p])
      );

      // Track newly created pools
      const createdPools: string[] = [];

      // Process imports
      const created: number[] = [];
      const errors: Array<{ row: number; message: string; team?: string }> = [];

      for (let i = 0; i < importTeams.length; i++) {
        const importTeam = importTeams[i]!;

        try {
          // Check for duplicate
          const duplicateCheck = await db
            .select()
            .from(teams)
            .where(and(
              eq(teams.division_id, divisionId),
              eq(teams.name, importTeam.name)
            ))
            .limit(1);

          if (duplicateCheck.length > 0) {
            errors.push({
              row: i + 1,
              message: 'Team name already exists',
              team: importTeam.name,
            });
            continue;
          }

          // Lookup pool by name if provided, or auto-create it
          let poolId: number | null = null;
          if (importTeam.poolName) {
            const poolNameLower = importTeam.poolName.trim().toLowerCase();
            let pool = poolsByName.get(poolNameLower);

            // Auto-create pool if it doesn't exist
            if (!pool) {
              try {
                // Calculate next order index and label
                const maxOrder = divisionPools.length > 0
                  ? Math.max(...divisionPools.map(p => p.order_index))
                  : 0;

                // Generate label (A, B, C, ...)
                const nextLabel = String.fromCharCode(65 + divisionPools.length); // 65 is 'A'

                const [newPool] = await db
                  .insert(pools)
                  .values({
                    division_id: divisionId,
                    name: importTeam.poolName.trim(), // Use original casing from CSV
                    label: nextLabel,
                    order_index: maxOrder + 1,
                  })
                  .returning();

                if (newPool) {
                  pool = newPool;
                  poolsByName.set(poolNameLower, newPool);
                  divisionPools.push(newPool);
                  createdPools.push(newPool.name);
                  fastify.log.info({ poolName: newPool.name }, 'Auto-created pool during bulk import');
                }
              } catch (poolError) {
                errors.push({
                  row: i + 1,
                  message: `Failed to create pool "${importTeam.poolName}": ${poolError instanceof Error ? poolError.message : 'Unknown error'}`,
                  team: importTeam.name,
                });
                continue;
              }
            }

            if (pool) {
              poolId = pool.id;
            }
          }

          // Create team
          const [team] = await db
            .insert(teams)
            .values({
              division_id: divisionId,
              name: importTeam.name,
              pool_id: poolId,
              pool_seed: importTeam.poolSeed || null,
            })
            .returning();

          if (!team) {
            errors.push({
              row: i + 1,
              message: 'Failed to create team',
              team: importTeam.name,
            });
            continue;
          }

          created.push(team.id);
        } catch (error) {
          errors.push({
            row: i + 1,
            message: error instanceof Error ? error.message : 'Unknown error',
            team: importTeam.name,
          });
        }
      }

      return reply.send({
        created: created.length,
        createdPools,
        errors,
      });
    } catch (error) {
      fastify.log.error({ error, divisionId }, 'Error bulk importing teams');
      throw error;
    }
  });
};

export default teamsRoutes;
