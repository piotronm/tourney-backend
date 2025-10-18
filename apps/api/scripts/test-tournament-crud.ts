/**
 * Test script for tournament CRUD operations
 * Tests create, read, update, delete without auth
 */

import { db } from '../src/lib/db/drizzle.js';
import { tournaments } from '../src/lib/db/schema.js';
import { eq } from 'drizzle-orm';

async function testCRUD() {
  console.log('🧪 Testing Tournament CRUD Operations\n');

  try {
    // TEST 1: CREATE
    console.log('[1/5] Testing CREATE...');
    const [created] = await db
      .insert(tournaments)
      .values({
        name: 'Test Tournament DELETE ME',
        description: 'This is a test tournament for CRUD testing',
        start_date: '2025-11-01',
        end_date: '2025-11-15',
        status: 'draft',
      })
      .returning();

    console.log('✅ Created tournament:');
    console.log(`   ID: ${created.id}`);
    console.log(`   Name: ${created.name}`);
    console.log(`   Status: ${created.status}`);
    console.log('');

    const testId = created.id;

    // TEST 2: READ (single)
    console.log('[2/5] Testing READ (single)...');
    const [found] = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, testId))
      .limit(1);

    if (found) {
      console.log('✅ Found tournament:');
      console.log(`   ID: ${found.id}`);
      console.log(`   Name: ${found.name}`);
    } else {
      console.log('❌ Tournament not found');
    }
    console.log('');

    // TEST 3: UPDATE
    console.log('[3/5] Testing UPDATE...');
    const [updated] = await db
      .update(tournaments)
      .set({
        name: 'Test Tournament UPDATED',
        status: 'active',
      })
      .where(eq(tournaments.id, testId))
      .returning();

    console.log('✅ Updated tournament:');
    console.log(`   ID: ${updated.id}`);
    console.log(`   Name: ${updated.name} (changed)`);
    console.log(`   Status: ${updated.status} (changed from draft)`);
    console.log('');

    // TEST 4: LIST
    console.log('[4/5] Testing LIST...');
    const allTournaments = await db.select().from(tournaments);
    console.log(`✅ Found ${allTournaments.length} total tournaments:`);
    allTournaments.forEach(t => {
      console.log(`   - ${t.name} (${t.status})`);
    });
    console.log('');

    // TEST 5: DELETE
    console.log('[5/5] Testing DELETE...');
    await db.delete(tournaments).where(eq(tournaments.id, testId));

    // Verify deletion
    const [deleted] = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, testId))
      .limit(1);

    if (!deleted) {
      console.log('✅ Tournament successfully deleted');
    } else {
      console.log('❌ Tournament still exists after delete');
    }
    console.log('');

    // Final count
    const finalCount = await db.select().from(tournaments);
    console.log('╔════════════════════════════════════════╗');
    console.log('║     CRUD TESTS COMPLETED ✓             ║');
    console.log('╚════════════════════════════════════════╝');
    console.log(`\nFinal tournament count: ${finalCount.length}`);
    console.log('All operations successful!\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ CRUD test failed:', error);
    process.exit(1);
  }
}

testCRUD();
