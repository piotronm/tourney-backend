# Tournament System Enhancements

This document describes the enhanced features added to the tournament backend system.

**Status:** ✅ **Production Ready** - All 266 tests passing (October 14, 2025)

---

## Recently Completed (v0.2.0 - October 14, 2025)

### ✅ Production Verification Complete

**Achievement:** 100% Test Pass Rate (266/266 tests)
- 225 unit tests passing
- 41 E2E tests passing
- 8 golden fixtures passing
- All features tested in production-like environment (Ubuntu Server 22.04 LTS)

**Bugs Fixed During Production Testing:**
1. Court assignments deletion with incorrect column reference (CRITICAL)
2. Test database schema initialization (CRITICAL)
3. SQLite database locking in test cleanup (HIGH)
4. Test expectation mismatch for division not found (LOW)

**Environment Migration:**
- Successfully migrated from Windows (environment blocked) to Ubuntu Server 22.04 LTS
- better-sqlite3 native module compiled and working on Linux x86-64
- All tests passing in production environment

---

## Implemented Features (v0.2.0)

### 1. DUPR-Based Team Generation

The system now supports generating balanced teams from individual players based on their DUPR (Dynamic Universal Pickleball Rating) ratings.

**Endpoint:** `POST /api/divisions/:id/seed-dupr`

**Request Body:**
```json
{
  "players": [
    { "name": "John Smith", "duprRating": 5.5 },
    { "name": "Jane Doe", "duprRating": 4.2 },
    { "name": "Bob Johnson", "duprRating": 6.1 },
    { "name": "Alice Williams", "duprRating": 3.8 }
  ],
  "maxPools": 2,
  "teamGeneration": {
    "strategy": "balanced",
    "teamSize": 2
  },
  "courtScheduling": {
    "enabled": true,
    "numberOfCourts": 4,
    "matchDurationMinutes": 30,
    "breakMinutes": 5
  },
  "options": {
    "seed": 12345,
    "poolStrategy": "balanced"
  }
}
```

**Team Generation Strategies:**

1. **Balanced** (default): Pairs highest-rated players with lowest-rated players
   - Creates teams with similar total ratings
   - Best for competitive balance
   - Example: 6.0 + 3.5 vs 5.5 + 4.0 (both ≈ 9.5)

2. **Snake Draft**: Alternating draft picks like fantasy sports
   - Team 1 picks 1st, Team 2 picks 2nd, Team 2 picks 3rd, Team 1 picks 4th...
   - Good for simulating a real draft
   - Results in moderately balanced teams

3. **Random Pairs**: Randomly pairs players together
   - Uses seeded RNG for determinism
   - Less balanced, more unpredictable
   - Good for social tournaments

**Response:**
```json
{
  "divisionId": 1,
  "playersCount": 4,
  "teamsGenerated": 2,
  "poolsCreated": 1,
  "matchesGenerated": 1,
  "courtsScheduled": true,
  "courtAssignments": 1,
  "message": "Tournament seeded successfully with DUPR-based teams"
}
```

### 2. Court Scheduling

Automatically assigns matches to courts and time slots for efficient tournament flow.

**Features:**
- Ensures no team plays multiple matches simultaneously
- Optimizes court utilization
- Calculates estimated start times
- Handles break times between matches

**Configuration:**
```json
{
  "courtScheduling": {
    "enabled": true,
    "numberOfCourts": 4,
    "matchDurationMinutes": 30,
    "breakMinutes": 5
  }
}
```

**Algorithm:**
- Groups matches by round
- Within each round, schedules matches to available courts
- Respects team availability (no double-booking)
- Calculates time slots and estimated start times

### 3. Excel-Compatible Export (TSV)

Enhanced export format with additional metadata, optimized for Excel import.

**Endpoint:** `GET /api/divisions/:id/export.tsv`

**Export Includes:**

1. **Tournament Summary**
   - Total teams, pools, matches
   - Player count (if DUPR-based)
   - DUPR rating statistics (average, min, max, range)
   - Match status breakdown

2. **Player Roster** (if DUPR-based)
   - Player names
   - DUPR ratings
   - Team assignments

3. **Match Schedule**
   - All fields from CSV export
   - Court assignments
   - Estimated start times
   - Team DUPR averages
   - Individual player names

**Example TSV Output:**
```
TOURNAMENT SUMMARY

Total Teams:	8
Total Pools:	2
Total Matches:	28
Total Players:	16

DUPR RATING STATISTICS
Average Rating:	4.85
Min Rating:	3.20
Max Rating:	6.50
Rating Range:	3.30

PLAYER ROSTER

Player Name	DUPR Rating	Team
John Smith	6.50	Smith/Doe
Jane Doe	3.20	Smith/Doe
...

MATCH SCHEDULE

Pool	Round	Match	Court	Start Time	Team A	Team A Players	Team A DUPR	Score A	Score B	Team B DUPR	Team B Players	Team B	Status
Pool A	1	1	Court 1	09:00	Smith/Doe	John Smith / Jane Doe	4.85			4.90	Bob Johnson / Alice Williams	Johnson/Williams	pending
```

## Database Schema Changes

### New Tables

**players**
- `id`: Primary key
- `division_id`: Foreign key to division
- `team_id`: Foreign key to team (nullable)
- `name`: Player name
- `dupr_rating`: DUPR rating (1.0 - 8.0)
- `created_at`: Timestamp

**court_assignments**
- `id`: Primary key
- `match_id`: Foreign key to match
- `court_number`: Court number (1-indexed)
- `time_slot`: Time slot number (1-indexed)
- `estimated_start_minutes`: Minutes from tournament start
- `created_at`: Timestamp

## Tournament Engine Library Updates

### New Modules

**duprTeams.ts**
- `generateTeamsFromPlayers()`: Generate balanced teams from players
- `calculateAverageRating()`: Calculate team average DUPR
- `getTeamPlayers()`: Get players for a team
- `calculateTeamRatingVariance()`: Measure team balance

**courtScheduling.ts**
- `scheduleMatchesToCourts()`: Assign matches to courts
- `formatEstimatedTime()`: Format time as HH:MM
- `calculateTournamentDuration()`: Calculate total duration
- `validateSchedule()`: Validate no double-bookings

**excelExport.ts**
- `mapMatchesToExcelRows()`: Map matches to Excel rows
- `exportRowsToTSV()`: Convert to TSV format
- `createTournamentSummary()`: Generate summary sheet
- `createPlayerRoster()`: Generate player roster sheet

### New Types

```typescript
interface Player {
  id: number;
  name: string;
  duprRating: number;
  teamId?: number;
}

interface CourtAssignment {
  matchId: number;
  courtNumber: number;
  timeSlot: number;
  estimatedStartMinutes: number;
}

interface ExcelExportRow extends ExportRow {
  court?: string;
  startTime?: string;
  teamADupr?: string;
  teamBDupr?: string;
  teamAPlayers?: string;
  teamBPlayers?: string;
}
```

## Example Workflows

### Workflow 1: Traditional Team-Based Tournament

```bash
# Seed with pre-made teams
curl -X POST http://localhost:3000/api/divisions/1/seed \
  -H "Content-Type: application/json" \
  -d '{
    "teams": [
      {"name": "Team A"},
      {"name": "Team B"},
      {"name": "Team C"},
      {"name": "Team D"}
    ]
  }'

# Export as CSV
curl http://localhost:3000/api/divisions/1/export.csv -o tournament.csv
```

### Workflow 2: DUPR-Based with Court Scheduling

```bash
# Seed with individual players
curl -X POST http://localhost:3000/api/divisions/1/seed-dupr \
  -H "Content-Type: application/json" \
  -d '{
    "players": [
      {"name": "Player A", "duprRating": 5.5},
      {"name": "Player B", "duprRating": 4.0},
      {"name": "Player C", "duprRating": 6.0},
      {"name": "Player D", "duprRating": 3.5}
    ],
    "teamGeneration": {
      "strategy": "balanced",
      "teamSize": 2
    },
    "courtScheduling": {
      "enabled": true,
      "numberOfCourts": 2,
      "matchDurationMinutes": 30,
      "breakMinutes": 5
    }
  }'

# Export to Excel-compatible TSV
curl http://localhost:3000/api/divisions/1/export.tsv -o tournament.tsv
```

### Workflow 3: Multi-Pool Tournament

```bash
# Seed with 12 players, create 2 balanced pools
curl -X POST http://localhost:3000/api/divisions/1/seed-dupr \
  -H "Content-Type: application/json" \
  -d '{
    "players": [
      {"name": "P1", "duprRating": 6.0},
      {"name": "P2", "duprRating": 5.5},
      // ... 10 more players
    ],
    "maxPools": 2,
    "teamGeneration": {"strategy": "balanced"},
    "courtScheduling": {
      "enabled": true,
      "numberOfCourts": 4
    },
    "options": {
      "poolStrategy": "balanced"
    }
  }'
```

## Determinism

All new features maintain deterministic behavior with seeded RNG:

- Team generation with same seed produces identical pairings
- Court scheduling is deterministic (no randomization)
- Export formats are consistent and reproducible

## Excel Import Instructions

To import TSV files into Excel:

1. Open Excel
2. Go to **Data → From Text/CSV**
3. Select the `.tsv` file
4. Excel will automatically detect tab delimiters
5. Click **Load**

The file will be imported with proper column separation and formatting.

## Performance Considerations

- **Court Scheduling**: O(m * c * t) where m = matches, c = courts, t = time slots
- **Team Generation**: O(n log n) for balanced strategy (due to sorting)
- **Export Generation**: O(m + p) where m = matches, p = players

For large tournaments (>100 teams), court scheduling may take a few seconds. Consider:
- Limiting pools per division
- Using more courts to reduce time slots
- Optimizing match duration settings

## Future Enhancements

Potential future additions:
- Swiss system tournament support
- Bracket generation (single/double elimination)
- Live score updates via WebSocket
- Real-time tournament dashboard
- Mobile app integration
- Advanced statistics and analytics
