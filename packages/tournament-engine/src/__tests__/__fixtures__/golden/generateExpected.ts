/**
 * Script to generate expected CSV outputs for golden fixtures.
 * Run this script whenever you need to regenerate the expected outputs.
 *
 * Usage: tsx generateExpected.ts
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import {
  preprocessTeams,
  assignToPools,
  generateRoundRobinMatches,
  mapMatchesToExportRows,
  exportRowsToCSV,
  createTeamsById,
  createPoolsById,
  generateTeamsFromPlayers,
  type InputTeam,
  type InputPlayer,
  type GenerateOptions,
  type DUPRTeamGenerationOptions,
} from '../../../index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface FixtureInput {
  teams?: InputTeam[];
  players?: InputPlayer[];
  numPools?: number;
  options: GenerateOptions;
  duprOptions?: DUPRTeamGenerationOptions;
}

function processFixture(fixtureName: string): void {
  console.log(`Processing ${fixtureName}...`);

  // Read input fixture
  const inputPath = join(__dirname, 'inputs', fixtureName);
  const inputContent = readFileSync(inputPath, 'utf-8');
  const input: FixtureInput = JSON.parse(inputContent);

  try {
    // Generate teams (either from input teams or from DUPR players)
    let inputTeams: InputTeam[];
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

    // Assign teams to pools
    const numPools = input.numPools || 1;
    const pools = assignToPools(teams, numPools, input.options);

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

    console.log(`  ✓ Generated ${outputFilename}`);
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
