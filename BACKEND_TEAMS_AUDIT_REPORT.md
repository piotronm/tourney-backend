# Backend Team Endpoints - Audit Report

**Date:** October 16, 2025
**Backend Path:** ~/eztourneyz/backend
**Audit Method:** Live endpoint testing + code inspection

---

## Executive Summary

**Status:** ❌ **ALL TEAM ENDPOINTS MISSING**

- **6 endpoints tested:** All returned 404
- **Database schema:** ✅ Teams table EXISTS but missing `pool_seed` column
- **Code structure:** ✅ Division routes exist as pattern to follow
- **Implementation needed:** Complete team CRUD routes + schema migration

---

## Endpoint Status Summary

### Public Read Endpoints
| Endpoint | Method | Status | Response |
|----------|--------|--------|----------|
| /api/public/divisions/:id/teams | GET | **404** | Route not found |
| /api/public/divisions/:id/teams/:teamId | GET | **404** | Route not found |
| /api/public/divisions/:id/teams?search | GET | **404** | Route not found |
| /api/public/divisions/:id/teams?poolId | GET | **404** | Route not found |

### Admin Mutation Endpoints
| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| /api/divisions/:id/teams | POST | **404** | Route not found |
| /api/divisions/:id/teams/:teamId | PUT | **404** | Route not found |
| /api/divisions/:id/teams/:teamId | DELETE | **404** | Route not found |
| /api/divisions/:id/teams/bulk-import | POST | **404** | Route not found |

**Result:** 0/6 endpoints exist (0%)

---

## Code Structure Analysis

### ✅ Found: Database Schema

**Location:** `apps/api/src/lib/db/schema.ts:25`

**Current Schema:**
```typescript
export const teams = sqliteTable('teams', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  division_id: integer('division_id').notNull(),
  pool_id: integer('pool_id'),
  name: text('name').notNull(),
  created_at: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
```

**Issues:**
- ❌ Missing `pool_seed` column (frontend expects this)
- ❌ Missing `updated_at` column (frontend expects this)

**Frontend Expects:**
```typescript
interface Team {
  id: number;
  divisionId: number;
  name: string;
  poolId: number | null;
  poolName: string | null;    // Joined from pools table
  poolSeed: number | null;    // MISSING in schema
  createdAt: string;
  updatedAt: string;          // MISSING in schema
}
```

### ✅ Found: Division Routes Pattern

**Location:** `apps/api/src/routes/divisions.ts`

**Pattern to Follow:**
- Uses `requireAuth` and `requireAdmin` middleware
- Zod schema validation for all inputs
- Proper error handling
- Pagination support (limit, offset)
- Returns proper HTTP status codes (201, 204, etc.)

**Example Structure:**
```typescript
fastify.post('/divisions', {
  preHandler: [requireAuth, requireAdmin],
}, async (request, reply) => {
  // 1. Validate with Zod
  // 2. Insert to database
  // 3. Return 201 with created entity
});
```

### ❌ Missing: Team Routes

**Expected Location:** `apps/api/src/routes/teams.ts`
**Status:** File does not exist

### ❌ Missing: Public Team Routes

**Expected:** Routes registered in `apps/api/src/routes/public.routes.ts`
**Status:** No team routes registered

---

## Database Schema Requirements

### Migration Needed

Add missing columns to `teams` table:

```sql
-- Add pool_seed column
ALTER TABLE teams ADD COLUMN pool_seed INTEGER;

-- Add updated_at column
ALTER TABLE teams ADD COLUMN updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Create trigger to auto-update updated_at
CREATE TRIGGER update_teams_updated_at
AFTER UPDATE ON teams
BEGIN
  UPDATE teams SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
```

### Updated Schema (Drizzle)

```typescript
export const teams = sqliteTable('teams', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  division_id: integer('division_id').notNull(),
  pool_id: integer('pool_id'),
  pool_seed: integer('pool_seed'),        // NEW
  name: text('name').notNull(),
  created_at: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updated_at: text('updated_at')           // NEW
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
```

---

## Frontend API Contract

The frontend (Phase 3A) expects these endpoints:

### 1. GET /api/public/divisions/:id/teams

**Purpose:** List teams in a division (public, no auth)

**Query Parameters:**
- `limit` (number, max 100, default 50)
- `offset` (number, default 0)
- `search` (string, optional) - search by team name
- `poolId` (number, optional) - filter by pool

**Response:**
```json
{
  "teams": [
    {
      "id": 1,
      "divisionId": 1,
      "name": "Team Alpha",
      "poolId": 1,
      "poolName": "Pool A",
      "poolSeed": 1,
      "createdAt": "2025-10-16T00:00:00Z",
      "updatedAt": "2025-10-16T00:00:00Z"
    }
  ],
  "total": 42,
  "limit": 50,
  "offset": 0
}
```

**Notes:**
- Must join with `pools` table to get `poolName`
- Use `LIKE` for search (case-insensitive)

### 2. GET /api/public/divisions/:id/teams/:teamId

**Purpose:** Get single team (public, no auth)

**Response:** Single team object (same structure as above)

**Errors:**
- 404 if team not found
- 404 if team doesn't belong to division

### 3. POST /api/divisions/:id/teams

**Purpose:** Create new team (requires auth + admin)

**Request:**
```json
{
  "name": "Team Bravo",
  "poolId": 1,
  "poolSeed": 2
}
```

**Response:** Created team object (201 Created)

**Validation:**
- `name`: required, 3-50 chars, trimmed
- `poolId`: optional number
- `poolSeed`: optional positive integer

**Errors:**
- 400 if validation fails
- 401 if not authenticated
- 403 if not admin
- 404 if division doesn't exist

### 4. PUT /api/divisions/:id/teams/:teamId

**Purpose:** Update existing team (requires auth + admin)

**Request:** Partial team object
```json
{
  "name": "Updated Team Name",
  "poolId": 2,
  "poolSeed": 3
}
```

**Response:** Updated team object (200 OK)

**Validation:** Same as create (all fields optional)

**Errors:**
- 404 if team not found
- 404 if team doesn't belong to division

### 5. DELETE /api/divisions/:id/teams/:teamId

**Purpose:** Delete team (requires auth + admin)

**Response:** 204 No Content

**Behavior:**
- Soft delete? Or hard delete?
- What happens to matches referencing this team?

**Errors:**
- 404 if team not found
- 404 if team doesn't belong to division

### 6. POST /api/divisions/:id/teams/bulk-import

**Purpose:** Bulk import teams from CSV (requires auth + admin)

**Request:**
```json
{
  "teams": [
    { "name": "Team A", "poolId": 1, "poolSeed": 1 },
    { "name": "Team B", "poolId": 1, "poolSeed": 2 },
    { "name": "Team C" }
  ]
}
```

**Response:**
```json
{
  "created": 3,
  "errors": []
}
```

**OR with errors:**
```json
{
  "created": 2,
  "errors": [
    {
      "row": 4,
      "team": { "name": "Bad Team" },
      "error": "Validation failed: name too short"
    }
  ]
}
```

**Behavior:**
- Create as many teams as possible
- Return errors for failed rows
- Use transaction (all or nothing) or partial success?

---

## Implementation Requirements

### 1. Schema Migration

**File:** `apps/api/drizzle/migrations/XXXX_add_team_pool_seed.sql`

**Steps:**
1. Add `pool_seed` column
2. Add `updated_at` column
3. Create trigger for `updated_at`

### 2. Team Routes File

**File:** `apps/api/src/routes/teams.ts`

**Structure:**
```typescript
import type { FastifyPluginAsync } from 'fastify';
import { eq, sql, like, and } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../lib/db/drizzle.js';
import { teams, pools, divisions } from '../lib/db/schema.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

// Zod schemas
const createTeamSchema = z.object({
  name: z.string().min(3).max(50).trim(),
  poolId: z.number().int().positive().optional(),
  poolSeed: z.number().int().positive().optional(),
});

const updateTeamSchema = z.object({
  name: z.string().min(3).max(50).trim().optional(),
  poolId: z.number().int().positive().optional().nullable(),
  poolSeed: z.number().int().positive().optional().nullable(),
});

const teamParamsSchema = z.object({
  divisionId: z.coerce.number().int().positive(),
  teamId: z.coerce.number().int().positive(),
});

const listTeamsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().optional(),
  poolId: z.coerce.number().int().positive().optional(),
});

const bulkImportSchema = z.object({
  teams: z.array(createTeamSchema),
});

// Routes
const teamsRoutes: FastifyPluginAsync = async (fastify) => {
  // Implement 6 endpoints here
};

export default teamsRoutes;
```

### 3. Register Routes

**File:** `apps/api/src/server.ts`

Add:
```typescript
import teamsRoutes from './routes/teams.js';

// Admin routes (with auth)
await fastify.register(teamsRoutes, { prefix: '/api' });
```

**File:** `apps/api/src/routes/public.routes.ts`

Add:
```typescript
// Public team read endpoints
fastify.get('/divisions/:divisionId/teams', /* ... */);
fastify.get('/divisions/:divisionId/teams/:teamId', /* ... */);
```

### 4. Testing

**Create:** `apps/api/src/routes/__tests__/teams.spec.ts`

**Test Cases:**
- Create team with valid data
- Create team with invalid data (400)
- Create team without auth (401)
- Create team without admin role (403)
- List teams with pagination
- List teams with search
- List teams with poolId filter
- Get single team
- Get team not in division (404)
- Update team
- Delete team
- Bulk import all success
- Bulk import with errors

---

## Implementation Plan

### Phase 1: Database Migration (30 min)

1. Create migration file
2. Add `pool_seed` and `updated_at` columns
3. Test migration on dev database
4. Run migration

### Phase 2: Team Routes (2-3 hours)

1. Create `apps/api/src/routes/teams.ts`
2. Implement all 6 endpoints following division pattern
3. Add Zod validation for all inputs
4. Implement proper error handling
5. Test with curl/Postman

### Phase 3: Public Routes (30 min)

1. Add public read routes to `public.routes.ts`
2. Test without authentication

### Phase 4: Testing (1-2 hours)

1. Create test file
2. Write integration tests
3. Run tests
4. Fix any bugs

### Phase 5: Verification (30 min)

1. Test all endpoints with curl
2. Verify with frontend
3. Update documentation

**Total Estimated Time:** 4-6 hours

---

## Recommendations

### Must Do (Blockers)

1. **Add schema migration** for `pool_seed` and `updated_at`
2. **Create complete team routes** following division pattern
3. **Register routes** in server.ts and public.routes.ts
4. **Test all endpoints** before frontend integration

### Should Do (Important)

1. **Write integration tests** to prevent regressions
2. **Add database indexes** on `division_id` and `pool_id` for performance
3. **Implement cascade deletes** (what happens when division is deleted?)
4. **Add rate limiting** to bulk import endpoint

### Nice to Have

1. **Add team validation** (check if poolId belongs to same division)
2. **Implement soft deletes** instead of hard deletes
3. **Add audit logging** for team changes
4. **Add team statistics** (match count, win/loss, etc.)

---

## Next Steps

1. **Review this audit report** with team
2. **Approve implementation plan**
3. **Create database migration** (Phase 1)
4. **Implement team routes** (Phase 2-3)
5. **Test thoroughly** (Phase 4)
6. **Deploy and verify** (Phase 5)
7. **Proceed to frontend Phase 3B**

---

## Conclusion

**Status:** ❌ **NOT READY FOR PHASE 3B/3C**

All 6 team endpoints are missing and must be implemented before frontend Phase 3C integration. However, the groundwork is solid:

- ✅ Database schema exists (needs 2 columns added)
- ✅ Clear pattern to follow (division routes)
- ✅ Authentication middleware ready
- ✅ Frontend already built and waiting (Phase 3A complete)

**Recommendation:** Implement backend team routes now, then proceed to Phase 3B (forms & components).

**Estimated Time:** 4-6 hours for complete implementation and testing.

---

**Generated by:** Claude Code
**Date:** October 16, 2025
**Method:** Live endpoint testing + code structure analysis
