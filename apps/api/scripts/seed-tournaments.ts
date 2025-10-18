/**
 * Seed script for creating test tournament data
 *
 * Purpose: Create multiple tournaments with divisions for testing
 *
 * Usage:
 *   pnpm tsx apps/api/scripts/seed-tournaments.ts
 *
 * Safe to run multiple times (idempotent - won't create duplicates)
 */

import { db } from '../src/lib/db/drizzle.js';
import { tournaments, divisions } from '../src/lib/db/schema.js';
import { eq } from 'drizzle-orm';

interface TournamentSeed {
  name: string;
  description: string;
  start_date: string;
  end_date: string;
  status: 'draft' | 'active' | 'completed' | 'archived';
  divisions: string[];
}

const seedData: TournamentSeed[] = [
  {
    name: 'Summer Championship 2025',
    description: 'Annual summer pickleball tournament featuring multiple divisions',
    start_date: '2025-06-15',
    end_date: '2025-06-30',
    status: 'active',
    divisions: [
      "Men's Open",
      "Women's Open",
      "Mixed Doubles 4.0+",
      "Seniors 50+"
    ]
  },
  {
    name: 'Fall Classic 2025',
    description: 'Fall tournament for all skill levels',
    start_date: '2025-09-10',
    end_date: '2025-09-25',
    status: 'draft',
    divisions: [
      "Men's 3.5",
      "Women's 3.5",
      "Mixed Doubles 3.5"
    ]
  },
  {
    name: 'Winter Invitational 2025',
    description: 'Indoor winter tournament',
    start_date: '2025-12-01',
    end_date: '2025-12-15',
    status: 'active',
    divisions: [
      "Men's Pro",
      "Women's Pro",
      "Mixed Pro",
      "Junior Division"
    ]
  }
];

async function seedTournaments() {
  console.log('🌱 Starting tournament seed script...\n');

  let tournamentsCreated = 0;
  let divisionsCreated = 0;
  let tournamentsSkipped = 0;

  for (const seedTournament of seedData) {
    // Check if tournament already exists
    const existing = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.name, seedTournament.name))
      .limit(1);

    if (existing.length > 0) {
      console.log(`⏭️  Skipping "${seedTournament.name}" (already exists)`);
      tournamentsSkipped++;
      continue;
    }

    // Create tournament
    const [tournament] = await db
      .insert(tournaments)
      .values({
        name: seedTournament.name,
        description: seedTournament.description,
        start_date: seedTournament.start_date,
        end_date: seedTournament.end_date,
        status: seedTournament.status,
      })
      .returning();

    console.log(`✅ Created tournament: ${tournament.name} (ID: ${tournament.id})`);
    tournamentsCreated++;

    // Create divisions for this tournament
    for (const divisionName of seedTournament.divisions) {
      const [division] = await db
        .insert(divisions)
        .values({
          tournament_id: tournament.id,
          name: divisionName,
        })
        .returning();

      console.log(`  └─ Created division: ${division.name} (ID: ${division.id})`);
      divisionsCreated++;
    }

    console.log('');
  }

  // Summary
  console.log('════════════════════════════════════════');
  console.log('📊 Seed Summary:');
  console.log(`  • Tournaments created: ${tournamentsCreated}`);
  console.log(`  • Tournaments skipped: ${tournamentsSkipped}`);
  console.log(`  • Divisions created: ${divisionsCreated}`);
  console.log('════════════════════════════════════════\n');

  // Verification query
  const allTournaments = await db.select().from(tournaments);
  const allDivisions = await db.select().from(divisions);

  console.log('🔍 Verification:');
  console.log(`  Total tournaments in database: ${allTournaments.length}`);
  console.log(`  Total divisions in database: ${allDivisions.length}`);
  console.log('');

  // Show tournament-division breakdown
  console.log('📋 Tournament-Division Breakdown:');
  for (const tournament of allTournaments) {
    const divCount = allDivisions.filter(d => d.tournament_id === tournament.id).length;
    console.log(`  • ${tournament.name}: ${divCount} divisions`);
  }

  console.log('\n✅ Seed script completed successfully!');
  process.exit(0);
}

// Run the seed function
seedTournaments().catch((error) => {
  console.error('❌ Seed script failed:', error);
  process.exit(1);
});
