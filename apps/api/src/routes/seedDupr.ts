/**
 * DUPR-based tournament seeding endpoint.
 * Generates teams from individual players based on DUPR ratings.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../lib/db/drizzle.js';
import { divisions, teams, pools, matches, players, court_assignments } from '../lib/db/schema.js';
import { eq, sql } from 'drizzle-orm';
import {
  createSeededRNG,
  generateTeamsFromPlayers,
  assignToPools,
  generateRoundRobinMatches,
  scheduleMatchesToCourts,
  type InputPlayer,
  type RoundRobinMatch,
  type CourtAssignment as EngineCourtAssignment,
} from 'tournament-engine';

/**
 * Request body schema for DUPR-based seeding.
 */
const seedDuprBodySchema = z.object({
  players: z
    .array(
      z.object({
        name: z.string().min(1, 'Player name is required'),
        duprRating: z.number().min(1.0).max(8.0, 'DUPR rating must be between 1.0 and 8.0'),
      })
    )
    .min(2, 'At least 2 players are required'),
  maxPools: z.number().int().min(1).default(1),
  teamGeneration: z
    .object({
      strategy: z.enum(['balanced', 'snake-draft', 'random-pairs']).default('balanced'),
      teamSize: z.number().int().min(2).default(2),
    })
    .default({}),
  courtScheduling: z
    .object({
      enabled: z.boolean().default(false),
      numberOfCourts: z.number().int().min(1).optional(),
      matchDurationMinutes: z.number().int().min(1).default(30),
      breakMinutes: z.number().int().min(0).default(5),
    })
    .default({}),
  options: z
    .object({
      seed: z.number().int().default(12345),
      shuffle: z.boolean().default(false),
      poolStrategy: z.enum(['respect-input', 'balanced']).default('balanced'),
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
const seedDuprRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Params: { id: number };
    Body: z.infer<typeof seedDuprBodySchema>;
  }>('/divisions/:id/seed-dupr', async (request, reply) => {
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
    const bodyResult = seedDuprBodySchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: bodyResult.error.flatten(),
      });
    }

    const {
      players: inputPlayers,
      maxPools,
      teamGeneration,
      courtScheduling,
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
      // First, get all match IDs for this division to delete court assignments
      const divisionMatches = await db
        .select({ id: matches.id })
        .from(matches)
        .where(eq(matches.division_id, divisionId));

      const matchIds = divisionMatches.map((m) => m.id);

      // Delete court assignments for these matches
      if (matchIds.length > 0) {
        await db.delete(court_assignments).where(
          matchIds.length === 1
            ? eq(court_assignments.match_id, matchIds[0]!)
            : sql`${court_assignments.match_id} IN (${sql.join(matchIds, sql`, `)})`
        );
      }

      // Now delete the rest in proper order
      await db.delete(matches).where(eq(matches.division_id, divisionId));
      await db.delete(players).where(eq(players.division_id, divisionId));
      await db.delete(teams).where(eq(teams.division_id, divisionId));
      await db.delete(pools).where(eq(pools.division_id, divisionId));

      // Generate tournament using tournament engine
      const seed = options.seed ?? 12345;
      const rng = createSeededRNG(seed);

      // Generate teams from players
      const {
        teams: generatedTeams,
        players: processedPlayers,
      } = generateTeamsFromPlayers(inputPlayers as InputPlayer[], rng, {
        strategy: teamGeneration.strategy,
        teamSize: teamGeneration.teamSize,
        seed,
      });

      // Assign teams to pools
      const assignedPools = assignToPools(
        generatedTeams,
        maxPools,
        options.poolStrategy
      );

      // Generate matches
      const allMatches: RoundRobinMatch[] = [];
      const generatedMatches = generateRoundRobinMatches(assignedPools);
      allMatches.push(...generatedMatches);

      // Schedule to courts if enabled
      let courtAssignmentsList: EngineCourtAssignment[] = [];
      if (courtScheduling.enabled && courtScheduling.numberOfCourts) {
        courtAssignmentsList = scheduleMatchesToCourts(allMatches, {
          numberOfCourts: courtScheduling.numberOfCourts,
          matchDurationMinutes: courtScheduling.matchDurationMinutes,
          breakMinutes: courtScheduling.breakMinutes,
        });
      }

      // Insert pools into database
      const poolInserts = assignedPools.map((pool) => ({
        division_id: divisionId,
        name: pool.name,
      }));

      const insertedPools = await db.insert(pools).values(poolInserts).returning();

      // Create pool ID mapping
      const poolIdMap = new Map<number, number>();
      assignedPools.forEach((pool, index) => {
        const dbPool = insertedPools[index];
        if (dbPool) {
          poolIdMap.set(pool.id, dbPool.id);
        }
      });

      // Insert teams into database
      const teamInserts = generatedTeams.map((team) => {
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

      // Create team ID mapping
      const teamIdMap = new Map<number, number>();
      generatedTeams.forEach((team, index) => {
        const dbTeam = insertedTeams[index];
        if (dbTeam) {
          teamIdMap.set(team.id, dbTeam.id);
        }
      });

      // Insert players into database
      const playerInserts = processedPlayers.map((player) => ({
        division_id: divisionId,
        team_id: player.teamId ? teamIdMap.get(player.teamId) ?? null : null,
        name: player.name,
        dupr_rating: player.duprRating,
      }));

      await db.insert(players).values(playerInserts);

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

      const insertedMatches = await db.insert(matches).values(matchInserts).returning();

      // Create match ID mapping for court assignments
      const matchIdMap = new Map<number, number>();
      allMatches.forEach((match, index) => {
        const dbMatch = insertedMatches[index];
        if (dbMatch) {
          matchIdMap.set(match.id, dbMatch.id);
        }
      });

      // Insert court assignments if generated
      if (courtAssignmentsList.length > 0) {
        const courtAssignmentInserts = courtAssignmentsList.map((assignment) => ({
          match_id: matchIdMap.get(assignment.matchId)!,
          court_number: assignment.courtNumber,
          time_slot: assignment.timeSlot,
          estimated_start_minutes: assignment.estimatedStartMinutes,
        }));

        await db.insert(court_assignments).values(courtAssignmentInserts);
      }

      return reply.status(200).send({
        divisionId,
        playersCount: processedPlayers.length,
        teamsGenerated: generatedTeams.length,
        poolsCreated: assignedPools.length,
        matchesGenerated: allMatches.length,
        courtsScheduled: courtScheduling.enabled,
        courtAssignments: courtAssignmentsList.length,
        message: 'Tournament seeded successfully with DUPR-based teams',
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

export default seedDuprRoute;
