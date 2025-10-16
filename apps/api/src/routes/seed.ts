/**
 * Seed tournament endpoint.
 * Generates round-robin matches for a division using the tournament engine.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../lib/db/drizzle.js';
import { divisions, teams, pools, matches } from '../lib/db/schema.js';
import { eq } from 'drizzle-orm';
import {
  createSeededRNG,
  preprocessTeams,
  assignToPools,
  generateRoundRobinMatches,
  type InputTeam,
  type RoundRobinMatch,
} from 'tournament-engine';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

/**
 * Request body schema for seeding a tournament.
 */
const seedBodySchema = z.object({
  teams: z
    .array(
      z.object({
        name: z.string().min(1, 'Team name is required'),
        poolId: z.number().optional(),
      })
    )
    .min(2, 'At least 2 teams are required'),
  maxPools: z.number().int().min(1).default(1),
  options: z
    .object({
      seed: z.number().int().default(12345),
      shuffle: z.boolean().default(false),
      poolStrategy: z.enum(['respect-input', 'balanced']).default('respect-input'),
    })
    .default({}),
});

/**
 * URL parameters schema.
 */
const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// eslint-disable-next-line @typescript-eslint/require-await
const seedRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Params: { id: number };
    Body: z.infer<typeof seedBodySchema>;
  }>('/divisions/:id/seed', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    // Validate parameters
    const paramsResult = paramsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        error: 'Invalid division ID',
        details: paramsResult.error.flatten(),
      });
    }

    const { id: divisionId } = paramsResult.data;

    // Validate body
    const bodyResult = seedBodySchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: bodyResult.error.flatten(),
      });
    }

    const {
      teams: inputTeams,
      maxPools,
      options,
    } = bodyResult.data;

    try {
      // Ensure division exists (create if not)
      let division = await db
        .select()
        .from(divisions)
        .where(eq(divisions.id, divisionId))
        .limit(1)
        .then((rows) => rows[0]);

      if (!division) {
        // Create division with default name
        const inserted = await db
          .insert(divisions)
          .values({ id: divisionId, name: `Division ${divisionId}` })
          .returning();
        division = inserted[0]!;
      }

      // Delete existing data for this division
      await db.delete(matches).where(eq(matches.division_id, divisionId));
      await db.delete(teams).where(eq(teams.division_id, divisionId));
      await db.delete(pools).where(eq(pools.division_id, divisionId));

      // Generate tournament using tournament engine
      const seed = options.seed ?? 12345;
      const rng = createSeededRNG(seed);

      // Preprocess teams (pass seed for deterministic IDs)
      const processedTeams = preprocessTeams(
        inputTeams as InputTeam[],
        rng,
        options.shuffle,
        seed
      );

      // Assign teams to pools
      const assignedPools = assignToPools(
        processedTeams,
        maxPools,
        options.poolStrategy
      );

      // Generate matches
      const allMatches: RoundRobinMatch[] = [];
      const generatedMatches = generateRoundRobinMatches(assignedPools);
      allMatches.push(...generatedMatches);

      // Insert pools into database
      const poolInserts = assignedPools.map((pool) => ({
        division_id: divisionId,
        name: pool.name,
      }));

      const insertedPools = await db.insert(pools).values(poolInserts).returning();

      // Create pool ID mapping (engine ID -> database ID)
      const poolIdMap = new Map<number, number>();
      assignedPools.forEach((pool, index) => {
        const dbPool = insertedPools[index];
        if (dbPool) {
          poolIdMap.set(pool.id, dbPool.id);
        }
      });

      // Insert teams into database
      const teamInserts = processedTeams.map((team) => {
        // Find which pool this team belongs to
        const enginePool = assignedPools.find((p) => p.teamIds.includes(team.id));
        const dbPoolId = enginePool ? poolIdMap.get(enginePool.id) : null;

        return {
          division_id: divisionId,
          pool_id: dbPoolId,
          name: team.name,
        };
      });

      const insertedTeams = await db.insert(teams).values(teamInserts).returning();

      // Create team ID mapping (engine ID -> database ID)
      const teamIdMap = new Map<number, number>();
      processedTeams.forEach((team, index) => {
        const dbTeam = insertedTeams[index];
        if (dbTeam) {
          teamIdMap.set(team.id, dbTeam.id);
        }
      });

      // Insert matches into database
      const matchInserts = allMatches.map((match) => ({
        division_id: divisionId,
        pool_id: poolIdMap.get(match.poolId)!,
        round_number: match.round,
        match_number: match.matchNumber,
        team_a_id: teamIdMap.get(match.teamAId)!,
        team_b_id: match.teamBId ? teamIdMap.get(match.teamBId) ?? null : null,
        score_a: match.scoreA ?? null,
        score_b: match.scoreB ?? null,
        status: match.status,
      }));

      await db.insert(matches).values(matchInserts);

      return reply.status(200).send({
        divisionId,
        poolsCreated: assignedPools.length,
        teamsCount: processedTeams.length,
        matchesGenerated: allMatches.length,
        message: 'Tournament seeded successfully',
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to seed tournament',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
};

export default seedRoute;
