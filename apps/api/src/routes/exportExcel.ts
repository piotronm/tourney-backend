/**
 * Excel/TSV export endpoint.
 * Exports tournament data in TSV format with enhanced metadata.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../lib/db/drizzle.js';
import { divisions, teams, pools, matches, exports, players, court_assignments } from '../lib/db/schema.js';
import { eq } from 'drizzle-orm';
import {
  mapMatchesToExcelRows,
  exportRowsToTSV,
  createTournamentSummary,
  createPlayerRoster,
  createTeamsById,
  createPoolsById,
  type RoundRobinMatch,
  type Team,
  type Pool,
  type Player,
  type CourtAssignment,
} from 'tournament-engine';

/**
 * URL parameters schema.
 */
const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// eslint-disable-next-line @typescript-eslint/require-await
const exportExcelRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Params: { id: number };
  }>('/divisions/:id/export.tsv', async (request, reply) => {
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
      const [
        division,
        divisionTeams,
        divisionPools,
        divisionMatches,
        divisionPlayers,
        divisionCourtAssignments,
      ] = await Promise.all([
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
        db
          .select()
          .from(players)
          .where(eq(players.division_id, divisionId))
          .orderBy(players.id),
        db
          .select()
          .from(court_assignments)
          .orderBy(court_assignments.time_slot),
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

      const enginePlayers: Player[] =
        divisionPlayers.length > 0
          ? divisionPlayers.map((p) => ({
              id: p.id,
              name: p.name,
              duprRating: p.dupr_rating,
              teamId: p.team_id ?? undefined,
            }))
          : [];

      // Filter court assignments for this division's matches
      const matchIds = new Set(divisionMatches.map((m) => m.id));
      const relevantCourtAssignments = divisionCourtAssignments.filter((ca) =>
        matchIds.has(ca.match_id)
      );

      const engineCourtAssignments: CourtAssignment[] =
        relevantCourtAssignments.map((ca) => ({
          matchId: ca.match_id,
          courtNumber: ca.court_number,
          timeSlot: ca.time_slot,
          estimatedStartMinutes: ca.estimated_start_minutes,
        }));

      // Create lookup maps
      const teamsById = createTeamsById(engineTeams);
      const poolsById = createPoolsById(enginePools);

      // Generate tournament summary
      const summary = createTournamentSummary(
        engineTeams,
        engineMatches,
        enginePools,
        enginePlayers.length > 0 ? enginePlayers : undefined,
        division.name
      );

      // Generate player roster if players exist
      let roster = '';
      if (enginePlayers.length > 0) {
        roster = createPlayerRoster(enginePlayers, engineTeams);
      }

      // Map to Excel export rows
      const rows = mapMatchesToExcelRows(
        engineMatches,
        teamsById,
        poolsById,
        enginePlayers.length > 0 ? enginePlayers : undefined,
        engineCourtAssignments.length > 0 ? engineCourtAssignments : undefined
      );

      // Convert to TSV
      const matchesTSV = exportRowsToTSV(rows);

      // Combine all sheets (separated by double newlines)
      const sections: string[] = [summary];

      if (roster) {
        sections.push(roster);
      }

      sections.push('MATCH SCHEDULE');
      sections.push(matchesTSV);

      const fullTSV = sections.join('\n\n');

      // Record export in database
      await db.insert(exports).values({
        division_id: divisionId,
        format: 'tsv',
        row_count: rows.length,
      });

      // Send TSV response (Excel-compatible)
      return reply
        .status(200)
        .header('Content-Type', 'text/tab-separated-values; charset=utf-8')
        .header(
          'Content-Disposition',
          `attachment; filename="division-${divisionId}-tournament.tsv"`
        )
        .send(fullTSV);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to export tournament data',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
};

export default exportExcelRoute;
