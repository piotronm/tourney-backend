# API Endpoints Reference

Complete reference for all Tournament Backend API endpoints with curl examples.

**Base URL:** `http://localhost:3000`

---

## Table of Contents

- [Division Management](#division-management)
- [Tournament Seeding](#tournament-seeding)
- [Match Scoring & Standings](#match-scoring--standings)
- [Export](#export)
- [Health](#health)

---

## Division Management

### Create Division

Create a new tournament division.

**Endpoint:** `POST /api/divisions`

**Request Body:**
```json
{
  "name": "Mens Open"
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/api/divisions \
  -H "Content-Type: application/json" \
  -d '{"name": "Mens Open"}'
```

**Response (201):**
```json
{
  "id": 1,
  "name": "Mens Open",
  "created_at": "2025-10-14T12:00:00.000Z"
}
```

**Validation:**
- `name`: Required, 1-255 characters, trimmed

---

### List Divisions

List all divisions with pagination.

**Endpoint:** `GET /api/divisions`

**Query Parameters:**
- `limit` (optional): Number of results (default: 50, max: 100)
- `offset` (optional): Skip N results (default: 0)

**Example:**
```bash
# List first 10 divisions
curl http://localhost:3000/api/divisions?limit=10&offset=0

# List with defaults (limit=50, offset=0)
curl http://localhost:3000/api/divisions
```

**Response (200):**
```json
{
  "divisions": [
    {
      "id": 1,
      "name": "Mens Open",
      "created_at": "2025-10-14T12:00:00.000Z"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

---

### Get Division by ID

Get a single division with statistics.

**Endpoint:** `GET /api/divisions/:id`

**Example:**
```bash
curl http://localhost:3000/api/divisions/1
```

**Response (200):**
```json
{
  "id": 1,
  "name": "Mens Open",
  "created_at": "2025-10-14T12:00:00.000Z",
  "stats": {
    "teams": 8,
    "pools": 2,
    "matches": 28
  }
}
```

**Error Responses:**
- `404`: Division not found
- `400`: Invalid division ID

---

### Update Division

Update division name.

**Endpoint:** `PUT /api/divisions/:id`

**Request Body:**
```json
{
  "name": "Mens Open - Updated"
}
```

**Example:**
```bash
curl -X PUT http://localhost:3000/api/divisions/1 \
  -H "Content-Type: application/json" \
  -d '{"name": "Mens Open - Updated"}'
```

**Response (200):**
```json
{
  "id": 1,
  "name": "Mens Open - Updated",
  "created_at": "2025-10-14T12:00:00.000Z"
}
```

**Validation:**
- `name`: Required, 1-255 characters, trimmed

**Error Responses:**
- `404`: Division not found
- `400`: Invalid request body

---

### Delete Division

Delete a division and all related data (cascade delete).

**Endpoint:** `DELETE /api/divisions/:id`

**Cascade Deletion Order:**
1. Court assignments
2. Matches
3. Players
4. Teams
5. Pools
6. Division

**Example:**
```bash
curl -X DELETE http://localhost:3000/api/divisions/1
```

**Response (200):**
```json
{
  "message": "Division deleted successfully",
  "deletedId": 1
}
```

**Error Responses:**
- `404`: Division not found
- `400`: Invalid division ID

---

## Tournament Seeding

### Seed with Teams

Seed a tournament with pre-made teams.

**Endpoint:** `POST /api/divisions/:id/seed`

**Request Body:**
```json
{
  "teams": [
    {"name": "Team A"},
    {"name": "Team B"},
    {"name": "Team C"},
    {"name": "Team D"}
  ],
  "maxPools": 2,
  "options": {
    "seed": 12345,
    "shuffle": false,
    "poolStrategy": "balanced",
    "avoidBackToBack": true
  }
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/api/divisions/1/seed \
  -H "Content-Type: application/json" \
  -d '{
    "teams": [
      {"name": "Team A"},
      {"name": "Team B"},
      {"name": "Team C"},
      {"name": "Team D"}
    ],
    "maxPools": 2,
    "options": {
      "seed": 12345,
      "poolStrategy": "balanced"
    }
  }'
```

**Response (200):**
```json
{
  "divisionId": 1,
  "poolsCreated": 2,
  "teamsCount": 4,
  "matchesGenerated": 4,
  "message": "Tournament seeded successfully"
}
```

---

### Seed with DUPR Players

Seed a tournament from individual players with DUPR ratings.

**Endpoint:** `POST /api/divisions/:id/seed-dupr`

**Request Body:**
```json
{
  "players": [
    {"name": "Alice Anderson", "duprRating": 5.5},
    {"name": "Bob Baker", "duprRating": 4.0},
    {"name": "Charlie Chen", "duprRating": 6.0},
    {"name": "Diana Davis", "duprRating": 3.5}
  ],
  "maxPools": 1,
  "teamGeneration": {
    "strategy": "balanced",
    "teamSize": 2
  },
  "courtScheduling": {
    "enabled": true,
    "numberOfCourts": 2,
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
- `balanced`: Pair highest + lowest ratings for equal team strength
- `snake`: Alternating draft picks (fantasy sports style)
- `random`: Random pairing with seeded RNG

**Example:**
```bash
curl -X POST http://localhost:3000/api/divisions/1/seed-dupr \
  -H "Content-Type: application/json" \
  -d '{
    "players": [
      {"name": "Alice Anderson", "duprRating": 5.5},
      {"name": "Bob Baker", "duprRating": 4.0},
      {"name": "Charlie Chen", "duprRating": 6.0},
      {"name": "Diana Davis", "duprRating": 3.5}
    ],
    "teamGeneration": {"strategy": "balanced", "teamSize": 2},
    "courtScheduling": {
      "enabled": true,
      "numberOfCourts": 2,
      "matchDurationMinutes": 30
    }
  }'
```

**Response (200):**
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

---

## Match Scoring & Standings

### Score a Match

Update match scores and recalculate standings.

**Endpoint:** `PUT /api/matches/:id/score`

**Request Body:**
```json
{
  "scoreA": 11,
  "scoreB": 8
}
```

**Example:**
```bash
curl -X PUT http://localhost:3000/api/matches/1/score \
  -H "Content-Type: application/json" \
  -d '{"scoreA": 11, "scoreB": 8}'
```

**Response (200):**
```json
{
  "match": {
    "id": 1,
    "division_id": 1,
    "pool_id": 1,
    "round_number": 1,
    "match_number": 1,
    "team_a_id": 1,
    "team_b_id": 2,
    "score_a": 11,
    "score_b": 8,
    "status": "completed",
    "created_at": "2025-10-14T12:00:00.000Z"
  },
  "standings": [
    {
      "rank": 1,
      "teamId": 1,
      "wins": 1,
      "losses": 0,
      "pointsFor": 11,
      "pointsAgainst": 8,
      "pointDiff": 3
    },
    {
      "rank": 2,
      "teamId": 2,
      "wins": 0,
      "losses": 1,
      "pointsFor": 8,
      "pointsAgainst": 11,
      "pointDiff": -3
    }
  ]
}
```

**Validation:**
- `scoreA`: Required, non-negative integer
- `scoreB`: Required, non-negative integer

**Features:**
- Updates match status to 'completed'
- Recalculates pool standings automatically
- Supports re-scoring (can update already completed matches)

**Error Responses:**
- `404`: Match not found
- `400`: Invalid scores or match ID

---

### Get Standings

Retrieve division standings with optional pool filtering.

**Endpoint:** `GET /api/divisions/:id/standings`

**Query Parameters:**
- `poolId` (optional): Filter by specific pool ID

**Example:**
```bash
# Get all pools in division
curl http://localhost:3000/api/divisions/1/standings

# Get specific pool
curl http://localhost:3000/api/divisions/1/standings?poolId=1
```

**Response (200):**
```json
{
  "divisionId": 1,
  "pools": [
    {
      "poolId": 1,
      "poolName": "Pool A",
      "standings": [
        {
          "rank": 1,
          "teamId": 1,
          "teamName": "Team A",
          "wins": 2,
          "losses": 0,
          "pointsFor": 22,
          "pointsAgainst": 15,
          "pointDiff": 7
        },
        {
          "rank": 2,
          "teamId": 2,
          "teamName": "Team B",
          "wins": 1,
          "losses": 1,
          "pointsFor": 18,
          "pointsAgainst": 19,
          "pointDiff": -1
        }
      ]
    }
  ]
}
```

**Standings Ranking:**
1. Wins (descending)
2. Point differential (descending)
3. Head-to-head record (if tied)

**Features:**
- Includes teams with no scored matches (0-0 records)
- Returns all pools by default
- Filter by poolId for specific pool

**Error Responses:**
- `404`: Division or pool not found

---

## Export

### Export as CSV

Export tournament data in CSV format.

**Endpoint:** `GET /api/divisions/:id/export.csv`

**Example:**
```bash
curl http://localhost:3000/api/divisions/1/export.csv -o tournament.csv
```

**Response Headers:**
```
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="division-1-export.csv"
```

**CSV Format:**
```csv
Pool,Round,Match,Team A,Score A,Score B,Team B,Status
Pool A,1,1,Team A,11,8,Team B,completed
Pool A,1,2,Team C,9,11,Team D,completed
```

**Features:**
- RFC 4180-compliant CSV escaping
- Handles special characters in team names
- Includes all matches (pending and completed)

---

### Export as TSV (Excel)

Export tournament data in Excel-compatible TSV format with summary sheets.

**Endpoint:** `GET /api/divisions/:id/export.tsv`

**Example:**
```bash
curl http://localhost:3000/api/divisions/1/export.tsv -o tournament.tsv
```

**Response Headers:**
```
Content-Type: text/tab-separated-values; charset=utf-8
Content-Disposition: attachment; filename="division-1-export.tsv"
```

**TSV Includes:**
1. **Tournament Summary**
   - Total teams, pools, matches
   - Player count (if DUPR-based)
   - DUPR rating statistics
   - Match status breakdown

2. **Player Roster** (if DUPR-based)
   - Player names
   - DUPR ratings
   - Team assignments

3. **Match Schedule**
   - All CSV fields
   - Court assignments
   - Estimated start times
   - Team DUPR averages
   - Individual player names

**Features:**
- Excel-compatible tab-separated format
- Additional metadata compared to CSV
- Multi-sheet format (summary + roster + schedule)

---

## Health

### Health Check

Check if the API server is running.

**Endpoint:** `GET /health`

**Example:**
```bash
curl http://localhost:3000/health
```

**Response (200):**
```json
{
  "status": "ok",
  "timestamp": "2025-10-14T12:00:00.000Z"
}
```

---

## Error Responses

All endpoints follow consistent error response format:

**400 Bad Request:**
```json
{
  "error": "Invalid request body",
  "details": {
    "fieldErrors": {
      "name": ["Name is required"]
    }
  }
}
```

**404 Not Found:**
```json
{
  "error": "Not Found",
  "message": "Division with ID 999 not found"
}
```

**500 Internal Server Error:**
```json
{
  "error": "Internal Server Error",
  "message": "Database connection failed"
}
```

---

## Complete Workflow Example

```bash
# 1. Create division
DIVISION_ID=$(curl -s -X POST http://localhost:3000/api/divisions \
  -H "Content-Type: application/json" \
  -d '{"name": "Mens Open"}' | jq -r '.id')

# 2. Seed tournament with DUPR players
curl -X POST http://localhost:3000/api/divisions/$DIVISION_ID/seed-dupr \
  -H "Content-Type: application/json" \
  -d '{
    "players": [
      {"name": "Alice Anderson", "duprRating": 5.5},
      {"name": "Bob Baker", "duprRating": 4.0},
      {"name": "Charlie Chen", "duprRating": 6.0},
      {"name": "Diana Davis", "duprRating": 3.5}
    ],
    "teamGeneration": {"strategy": "balanced"},
    "courtScheduling": {
      "enabled": true,
      "numberOfCourts": 2
    }
  }'

# 3. Score first match
MATCH_ID=$(curl -s http://localhost:3000/api/divisions/$DIVISION_ID/export.csv | \
  grep "^Pool" | head -1 | cut -d',' -f3)

curl -X PUT http://localhost:3000/api/matches/$MATCH_ID/score \
  -H "Content-Type: application/json" \
  -d '{"scoreA": 11, "scoreB": 8}'

# 4. View standings
curl http://localhost:3000/api/divisions/$DIVISION_ID/standings

# 5. Export results
curl http://localhost:3000/api/divisions/$DIVISION_ID/export.tsv -o tournament.tsv
```

---

## Testing

All endpoints have comprehensive E2E test coverage:

- **Division CRUD**: 20 tests
- **Match Scoring**: 8 tests
- **Standings**: 9 tests
- **Seeding**: 33 tests
- **Export**: 8 tests

Run tests:
```bash
pnpm test
```

---

## Additional Resources

- [README.md](README.md) - Project overview
- [CHANGELOG.md](CHANGELOG.md) - Version history
- [ENHANCEMENTS.md](ENHANCEMENTS.md) - Detailed feature documentation
- [QUICKSTART.md](QUICKSTART.md) - Getting started guide
