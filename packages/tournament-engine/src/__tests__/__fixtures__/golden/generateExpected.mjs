/**
 * Script to generate expected CSV outputs for golden fixtures.
 * Run this script whenever you need to regenerate the expected outputs.
 *
 * Usage: node generateExpected.mjs
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  preprocessTeams,
  assignToPools,
  generateRoundRobinMatches,
  mapMatchesToExportRows,
  exportRowsToCSV,
  createTeamsById,
  createPoolsById,
  generateTeamsFromPlayers,
} from '../../../../dist/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function processFixture(fixtureName) {
  console.log(`Processing ${fixtureName}...`);

  // Read input fixture
  const inputPath = join(__dirname, 'inputs', fixtureName);
  const inputContent = readFileSync(inputPath, 'utf-8');
  const input = JSON.parse(inputContent);

  try {
    // Generate teams (either from input teams or from DUPR players)
    let inputTeams;
    if (input.players && input.duprOptions) {
      // Generate teams from DUPR players
      const { teams: generatedTeams } = generateTeamsFromPlayers(
        input.players,
        input.duprOptions
      );
      inputTeams = generatedTeams.map(team => ({
        name: team.name,
        poolId: team.poolId,
      }));
    } else if (input.teams) {
      inputTeams = input.teams;
    } else {
      throw new Error('Fixture must have either teams or players');
    }

    // Preprocess teams (assign IDs, validate)
    const teams = preprocessTeams(inputTeams, input.options);

    // Determine number of pools
    // For explicit pool assignments, use a large maxPools to respect all input pools
    // For balanced strategy, use the specified numPools
    const hasExplicitPools = inputTeams.some((t) => t.poolId !== undefined);
    const maxPools = hasExplicitPools ? 100 : (input.numPools || 1);
    const poolStrategy = input.options.poolStrategy || 'respect-input';

    // Assign teams to pools
    const pools = assignToPools(teams, maxPools, poolStrategy);

    // Generate round-robin matches
    const matches = generateRoundRobinMatches(pools);

    // Create lookup maps
    const teamsById = createTeamsById(teams);
    const poolsById = createPoolsById(pools);

    // Map to export rows
    const rows = mapMatchesToExportRows(matches, teamsById, poolsById);

    // Convert to CSV
    const csv = exportRowsToCSV(rows);

    // Write expected output
    const outputFilename = fixtureName.replace('.json', '.csv');
    const outputPath = join(__dirname, 'expected', outputFilename);
    writeFileSync(outputPath, csv, 'utf-8');

    console.log(`  ✓ Generated ${outputFilename} (${rows.length} matches)`);
  } catch (error) {
    console.error(`  ✗ Error processing ${fixtureName}:`, error);
    throw error;
  }
}

// Main execution
console.log('Generating expected outputs for golden fixtures...\n');

const inputsDir = join(__dirname, 'inputs');
const fixtures = readdirSync(inputsDir).filter(f => f.endsWith('.json'));

for (const fixture of fixtures) {
  processFixture(fixture);
}

console.log(`\nSuccessfully generated ${fixtures.length} expected outputs!`);
