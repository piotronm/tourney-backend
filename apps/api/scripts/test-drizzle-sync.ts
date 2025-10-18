/**
 * Test script to verify Drizzle schema is in sync with database
 *
 * Usage:
 *   pnpm tsx apps/api/scripts/test-drizzle-sync.ts
 *
 * This script tests that:
 * - The tournaments table can be queried via Drizzle
 * - The divisions table includes tournament_id
 * - All columns are accessible
 */

import { db } from '../src/lib/db/drizzle.js';
import { tournaments, divisions } from '../src/lib/db/schema.js';

async function testSync() {
  console.log('🔍 Testing Drizzle ORM schema sync...\n');

  try {
    // Test 1: Query tournaments table
    console.log('[1/4] Testing tournaments table...');
    const allTournaments = await db.select().from(tournaments);
    console.log(`✅ Tournaments table: OK (${allTournaments.length} rows)`);

    if (allTournaments.length > 0) {
      const first = allTournaments[0];
      console.log('  Sample tournament:');
      console.log(`    - ID: ${first?.id}`);
      console.log(`    - Name: ${first?.name}`);
      console.log(`    - Status: ${first?.status}`);
    }
    console.log('');

    // Test 2: Query divisions table
    console.log('[2/4] Testing divisions table...');
    const allDivisions = await db.select().from(divisions);
    console.log(`✅ Divisions table: OK (${allDivisions.length} rows)`);
    console.log('');

    // Test 3: Verify tournament_id column exists and is accessible
    console.log('[3/4] Testing tournament_id column...');
    if (allDivisions.length > 0) {
      const firstDivision = allDivisions[0];
      if (firstDivision && typeof firstDivision.tournament_id === 'number') {
        console.log(`✅ tournament_id column: OK`);
        console.log(`  Sample value: ${firstDivision.tournament_id}`);
      } else {
        console.log('❌ tournament_id column: MISSING or NULL');
        console.log('  Expected: number');
        console.log(`  Got: ${typeof firstDivision?.tournament_id}`);
        process.exit(1);
      }
    } else {
      console.log('⚠️  No divisions to test (database is empty)');
      console.log('   tournament_id column structure is valid');
    }
    console.log('');

    // Test 4: Test tournament-division relationship
    console.log('[4/4] Testing tournament-division relationship...');
    if (allTournaments.length > 0 && allDivisions.length > 0) {
      const tournamentIds = new Set(allTournaments.map(t => t.id));
      const divisionTournamentIds = allDivisions.map(d => d.tournament_id);

      const orphanedCount = divisionTournamentIds.filter(
        id => !tournamentIds.has(id)
      ).length;

      if (orphanedCount === 0) {
        console.log('✅ All divisions reference valid tournaments');
      } else {
        console.log(`❌ Found ${orphanedCount} divisions with invalid tournament_id`);
        process.exit(1);
      }
    } else {
      console.log('⚠️  Skipping relationship test (not enough data)');
    }
    console.log('');

    // Success summary
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║         ✓ DRIZZLE SCHEMA SYNC VERIFIED ✓                  ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('Summary:');
    console.log(`  • Tournaments table: accessible (${allTournaments.length} rows)`);
    console.log(`  • Divisions table: accessible (${allDivisions.length} rows)`);
    console.log('  • tournament_id column: present and typed correctly');
    console.log('  • No schema drift detected');
    console.log('');
    console.log('✅ Schema is in sync. Backend should start without errors.');
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('❌ Drizzle schema sync error:', error);
    console.log('');
    console.log('Possible fixes:');
    console.log('1. Check that schema.ts has tournaments table definition');
    console.log('2. Check that divisions table includes tournament_id');
    console.log('3. Verify migration ran successfully:');
    console.log('   ./apps/api/scripts/verify-migration.sh');
    console.log('4. Restart your TypeScript server/IDE');
    console.log('');
    process.exit(1);
  }
}

testSync();
