/**
 * CSV export endpoint.
 * Exports tournament data as CSV format.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../lib/db/drizzle.js';
import { divisions, teams, pools, matches, exports } from '../lib/db/schema.js';
import { eq } from 'drizzle-orm';
import {
  mapMatchesToExportRows,
  exportRowsToCSV,
  createTeamsById,
  createPoolsById,
  type RoundRobinMatch,
  type Team,
  type Pool,
} from 'tournament-engine';

/**
 * URL parameters schema.
 */
const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// eslint-disable-next-line @typescript-eslint/require-await
const exportCsvRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Params: { id: number };
  }>('/divisions/:id/export.csv', async (request, reply) => {
    // Validate parameters
    const paramsResult = paramsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        error: 'Invalid division ID',
        details: paramsResult.error.flatten(),
      });
    }

    const { id: divisionId } = paramsResult.data;

    try {
      // Fetch division and all data for it
      const [division, divisionTeams, divisionPools, divisionMatches] = await Promise.all([
        db
          .select()
          .from(divisions)
          .where(eq(divisions.id, divisionId))
          .limit(1)
          .then((rows) => rows[0]),
        db
          .select()
          .from(teams)
          .where(eq(teams.division_id, divisionId))
          .orderBy(teams.id),
        db
          .select()
          .from(pools)
          .where(eq(pools.division_id, divisionId))
          .orderBy(pools.id),
        db
          .select()
          .from(matches)
          .where(eq(matches.division_id, divisionId))
          .orderBy(matches.match_number),
      ]);

      if (!division) {
        return reply.status(404).send({
          error: 'Division not found',
        });
      }

      if (divisionMatches.length === 0) {
        return reply.status(404).send({
          error: 'No matches found for this division',
        });
      }

      // Convert database records to engine types
      const engineTeams: Team[] = divisionTeams.map((t) => ({
        id: t.id,
        name: t.name,
        poolId: t.pool_id ?? undefined,
      }));

      const enginePools: Pool[] = divisionPools.map((p) => ({
        id: p.id,
        name: p.name,
        teamIds: divisionTeams.filter((t) => t.pool_id === p.id).map((t) => t.id),
      }));

      const engineMatches: RoundRobinMatch[] = divisionMatches.map((m) => ({
        id: m.id,
        poolId: m.pool_id,
        round: m.round_number,
        matchNumber: m.match_number,
        teamAId: m.team_a_id,
        teamBId: m.team_b_id,
        scoreA: m.score_a ?? null,
        scoreB: m.score_b ?? null,
        status: m.status,
      }));

      // Create lookup maps
      const teamsById = createTeamsById(engineTeams);
      const poolsById = createPoolsById(enginePools);

      // Map to export rows with division name
      const rows = mapMatchesToExportRows(
        engineMatches,
        teamsById,
        poolsById,
        { divisionName: division.name }
      );

      // Convert to CSV
      const csv = exportRowsToCSV(rows);

      // Record export in database
      await db.insert(exports).values({
        division_id: divisionId,
        format: 'csv',
        row_count: rows.length,
      });

      // Send CSV response
      return reply
        .status(200)
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header(
          'Content-Disposition',
          `attachment; filename="division-${divisionId}-export.csv"`
        )
        .send(csv);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to export tournament data',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
};

export default exportCsvRoute;
