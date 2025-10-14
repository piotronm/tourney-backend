# Public API Guide

**Version:** v0.4.0
**Last Updated:** October 14, 2025
**Status:** ✅ Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [Authentication](#authentication)
4. [Rate Limiting & Caching](#rate-limiting--caching)
5. [API Endpoints](#api-endpoints)
6. [Response Format](#response-format)
7. [Error Handling](#error-handling)
8. [Testing Guide](#testing-guide)
9. [Frontend Integration](#frontend-integration)
10. [Troubleshooting](#troubleshooting)

---

## Overview

The Public API provides read-only access to tournament data without requiring authentication. It's designed for frontend applications, mobile apps, and public dashboards.

### Key Features

- ✅ **No Authentication Required** - Public read-only access
- ✅ **CORS Enabled** - Works with frontend frameworks (React, Vue, etc.)
- ✅ **Rate Limited** - 100 requests per minute per IP
- ✅ **Cached Responses** - 15-30 second caching with ETag support
- ✅ **Type-Safe** - Full TypeScript support with Zod validation
- ✅ **Consistent API** - Predictable response envelopes
- ✅ **Security Headers** - Helmet.js with 11+ security headers

### Base URL

**Development:** `http://localhost:3000/api/public`
**Production:** `https://api.yourdomain.com/api/public`

---

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 8+
- Backend server running

### Quick Start (5 minutes)

```bash
# 1. Start the server
cd apps/api
pnpm run dev

# Server starts at http://localhost:3000

# 2. Test the health endpoint
curl http://localhost:3000/health

# Expected response:
# {"status":"ok","timestamp":"2025-10-14T..."}

# 3. Test the public API
curl http://localhost:3000/api/public/divisions

# Expected response:
# {"data":[...],"meta":{"total":0,"limit":20,"offset":0}}
```

---

## Authentication

**Current Status:** No authentication required (v0.4.0)

**Planned for v0.5.0:**
- JWT-based authentication for admin endpoints
- Public endpoints remain open (read-only)
- API keys for mobile apps

---

## Rate Limiting & Caching

### Rate Limiting

**Limit:** 100 requests per minute per IP address

**Behavior:**
- First 100 requests: Normal responses (200, 404, etc.)
- After 100 requests: `429 Too Many Requests`
- **Localhost exemption:** 127.0.0.1 has unlimited requests (dev/testing)

**Error Response (429):**
```json
{
  "statusCode": 429,
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Try again in 45 seconds."
}
```

**Testing Rate Limits:**
```bash
# Make 105 requests quickly
for i in {1..105}; do
  curl http://localhost:3000/api/public/divisions
done

# Expected: Last 5 requests return 429 errors
```

### Caching Strategy

| Endpoint | Cache Duration | Reason |
|----------|----------------|--------|
| List divisions | 30 seconds | Less frequent updates |
| Get single division | 30 seconds | Less frequent updates |
| Get standings | 15 seconds | Live data, changes frequently |
| Get matches | 15 seconds | Live data, scores update often |

**Cache Headers:**
```
Cache-Control: public, max-age=30
ETag: W/"41-..."
```

**How ETag Works:**

1. **First Request:**
   ```bash
   curl -I http://localhost:3000/api/public/divisions
   # Response includes: ETag: W/"abc123"
   ```

2. **Subsequent Request:**
   ```bash
   curl -H "If-None-Match: W/\"abc123\"" http://localhost:3000/api/public/divisions
   # If unchanged: HTTP 304 Not Modified (saves bandwidth)
   # If changed: HTTP 200 OK with new data
   ```

**Benefits:**
- ~70% bandwidth savings for cached data
- Faster response times
- Reduced server load

---

## API Endpoints

### 1. List Divisions

**Endpoint:** `GET /api/public/divisions`

**Description:** Get a paginated list of all tournament divisions with statistics.

**Query Parameters:**

| Parameter | Type | Required | Default | Max | Description |
|-----------|------|----------|---------|-----|-------------|
| `limit` | number | No | 20 | 100 | Results per page |
| `offset` | number | No | 0 | - | Number of results to skip |
| `search` | string | No | - | - | Search divisions by name (case-insensitive) |

**Example Requests:**

```bash
# Basic list (first 20 divisions)
curl http://localhost:3000/api/public/divisions

# Pagination - second page of 10 results
curl http://localhost:3000/api/public/divisions?limit=10&offset=10

# Search by name
curl http://localhost:3000/api/public/divisions?search=Mens

# Combination
curl "http://localhost:3000/api/public/divisions?limit=5&offset=0&search=Open"
```

**Success Response (200 OK):**

```json
{
  "data": [
    {
      "id": 1,
      "name": "Mens Open",
      "createdAt": "2025-10-14T12:00:00.000Z",
      "stats": {
        "teams": 8,
        "pools": 2,
        "matches": 28,
        "completedMatches": 5
      }
    },
    {
      "id": 2,
      "name": "Womens 3.5",
      "createdAt": "2025-10-14T13:00:00.000Z",
      "stats": {
        "teams": 6,
        "pools": 1,
        "matches": 15,
        "completedMatches": 0
      }
    }
  ],
  "meta": {
    "total": 10,
    "limit": 20,
    "offset": 0
  }
}
```

**Error Responses:**

| Status | Reason | Example |
|--------|--------|---------|
| 400 | Invalid query parameters | `limit` > 100, negative `offset` |
| 429 | Rate limit exceeded | Too many requests |

---

### 2. Get Single Division

**Endpoint:** `GET /api/public/divisions/:id`

**Description:** Get detailed information about a specific division, including pool information.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number | Yes | Division ID |

**Example Requests:**

```bash
# Get division by ID
curl http://localhost:3000/api/public/divisions/1

# Get division 5
curl http://localhost:3000/api/public/divisions/5
```

**Success Response (200 OK):**

```json
{
  "id": 1,
  "name": "Mens Open",
  "createdAt": "2025-10-14T12:00:00.000Z",
  "stats": {
    "teams": 8,
    "pools": 2,
    "matches": 28,
    "completedMatches": 5
  },
  "pools": [
    {
      "id": 1,
      "name": "Pool A",
      "teamCount": 4
    },
    {
      "id": 2,
      "name": "Pool B",
      "teamCount": 4
    }
  ]
}
```

**Error Responses:**

| Status | Reason | Message |
|--------|--------|---------|
| 400 | Invalid ID | "Invalid division ID" |
| 404 | Division not found | "Division with ID 999 not found" |
| 429 | Rate limit exceeded | "Rate limit exceeded. Try again in X seconds." |

---

### 3. Get Division Standings

**Endpoint:** `GET /api/public/divisions/:id/standings`

**Description:** Get current standings for all pools in a division. Standings are ranked by wins, point differential, and head-to-head record.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number | Yes | Division ID |

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `poolId` | number | No | Filter standings by specific pool |

**Example Requests:**

```bash
# Get standings for all pools in division 1
curl http://localhost:3000/api/public/divisions/1/standings

# Get standings for specific pool
curl http://localhost:3000/api/public/divisions/1/standings?poolId=1

# With jq for pretty printing
curl http://localhost:3000/api/public/divisions/1/standings | jq
```

**Success Response (200 OK):**

```json
{
  "divisionId": 1,
  "divisionName": "Mens Open",
  "pools": [
    {
      "poolId": 1,
      "poolName": "Pool A",
      "standings": [
        {
          "rank": 1,
          "teamId": 1,
          "teamName": "Team Alpha",
          "wins": 3,
          "losses": 0,
          "pointsFor": 33,
          "pointsAgainst": 18,
          "pointDiff": 15
        },
        {
          "rank": 2,
          "teamId": 2,
          "teamName": "Team Beta",
          "wins": 2,
          "losses": 1,
          "pointsFor": 28,
          "pointsAgainst": 25,
          "pointDiff": 3
        },
        {
          "rank": 3,
          "teamId": 3,
          "teamName": "Team Gamma",
          "wins": 0,
          "losses": 0,
          "pointsFor": 0,
          "pointsAgainst": 0,
          "pointDiff": 0
        }
      ]
    }
  ]
}
```

**Standings Ranking Algorithm:**

1. **Primary:** Wins (descending)
2. **Tiebreaker 1:** Point differential (descending)
3. **Tiebreaker 2:** Head-to-head record (if tied)

**Special Cases:**

- **Unseeded teams:** Teams with no completed matches appear as 0-0-0
- **BYE matches:** Not counted in wins/losses
- **Pool filtering:** When `poolId` is specified, only that pool's standings are returned

**Error Responses:**

| Status | Reason | Message |
|--------|--------|---------|
| 400 | Invalid ID/params | "Invalid division ID" or "Invalid query parameters" |
| 404 | Division not found | "Division with ID 999 not found" |
| 404 | Pool not found | "Pool with ID 5 not found in division 1" |
| 429 | Rate limit exceeded | "Rate limit exceeded..." |

---

### 4. Get Division Matches

**Endpoint:** `GET /api/public/divisions/:id/matches`

**Description:** Get all matches for a division with optional filtering by pool and status.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number | Yes | Division ID |

**Query Parameters:**

| Parameter | Type | Required | Default | Max | Description |
|-----------|------|----------|---------|-----|-------------|
| `limit` | number | No | 50 | 100 | Results per page |
| `offset` | number | No | 0 | - | Number of results to skip |
| `poolId` | number | No | - | - | Filter by pool ID |
| `status` | enum | No | - | - | Filter by status: `pending` or `completed` |

**Example Requests:**

```bash
# Get all matches for division 1
curl http://localhost:3000/api/public/divisions/1/matches

# Filter by pool
curl http://localhost:3000/api/public/divisions/1/matches?poolId=1

# Filter by status (only completed matches)
curl http://localhost:3000/api/public/divisions/1/matches?status=completed

# Filter by status (only pending matches)
curl http://localhost:3000/api/public/divisions/1/matches?status=pending

# Combination: Pool 1, completed matches, paginated
curl "http://localhost:3000/api/public/divisions/1/matches?poolId=1&status=completed&limit=10&offset=0"

# With pretty printing
curl http://localhost:3000/api/public/divisions/1/matches | jq
```

**Success Response (200 OK):**

```json
{
  "data": [
    {
      "id": 1,
      "poolId": 1,
      "poolName": "Pool A",
      "roundNumber": 1,
      "matchNumber": 1,
      "teamAName": "Team Alpha",
      "teamBName": "Team Beta",
      "scoreA": 11,
      "scoreB": 9,
      "status": "completed"
    },
    {
      "id": 2,
      "poolId": 1,
      "poolName": "Pool A",
      "roundNumber": 1,
      "matchNumber": 2,
      "teamAName": "Team Gamma",
      "teamBName": "Team Delta",
      "scoreA": null,
      "scoreB": null,
      "status": "pending"
    },
    {
      "id": 3,
      "poolId": 1,
      "poolName": "Pool A",
      "roundNumber": 2,
      "matchNumber": 3,
      "teamAName": "Team Alpha",
      "teamBName": null,
      "scoreA": null,
      "scoreB": null,
      "status": "pending"
    }
  ],
  "meta": {
    "total": 28,
    "limit": 50,
    "offset": 0
  }
}
```

**Match Field Descriptions:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | number | Unique match ID |
| `poolId` | number/null | Pool ID (null for cross-pool matches) |
| `poolName` | string/null | Pool name (e.g., "Pool A") |
| `roundNumber` | number | Round number (1, 2, 3...) |
| `matchNumber` | number | Global match number |
| `teamAName` | string | Home team name |
| `teamBName` | string/null | Away team name (null for BYE) |
| `scoreA` | number/null | Team A score (null if not played) |
| `scoreB` | number/null | Team B score (null if not played) |
| `status` | enum | `pending` or `completed` |

**Special Cases:**

- **BYE Matches:** `teamBName` is `null`
- **Pending Matches:** Both scores are `null`, status is `pending`
- **Completed Matches:** Both scores are numbers, status is `completed`

**Error Responses:**

| Status | Reason | Message |
|--------|--------|---------|
| 400 | Invalid parameters | "Invalid division ID" or "Invalid query parameters" |
| 404 | Division not found | "Division with ID 999 not found" |
| 429 | Rate limit exceeded | "Rate limit exceeded..." |

---

## Response Format

### Success Responses

**Single Resource:**
```json
{
  "id": 1,
  "name": "Resource Name",
  "field1": "value",
  "field2": 123
}
```

**List of Resources:**
```json
{
  "data": [
    { "id": 1, "name": "Item 1" },
    { "id": 2, "name": "Item 2" }
  ],
  "meta": {
    "total": 100,
    "limit": 20,
    "offset": 0
  }
}
```

### HTTP Status Codes

| Code | Meaning | When Used |
|------|---------|-----------|
| 200 | OK | Successful request |
| 304 | Not Modified | Cached response (ETag match) |
| 400 | Bad Request | Invalid parameters |
| 404 | Not Found | Resource doesn't exist |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server-side error |

---

## Error Handling

### Error Response Format

```json
{
  "statusCode": 404,
  "error": "Not Found",
  "message": "Division with ID 999 not found"
}
```

### Common Errors

#### 1. Invalid Parameters (400)

**Cause:** Query parameters or path parameters fail validation

**Examples:**
```bash
# Limit too large
curl http://localhost:3000/api/public/divisions?limit=1000
# Error: "Invalid query parameters"

# Negative offset
curl http://localhost:3000/api/public/divisions?offset=-5
# Error: "Invalid query parameters"

# Invalid division ID
curl http://localhost:3000/api/public/divisions/abc
# Error: "Invalid division ID"
```

**Solution:** Check parameter types and ranges

#### 2. Resource Not Found (404)

**Cause:** Division, pool, or match doesn't exist

**Examples:**
```bash
# Non-existent division
curl http://localhost:3000/api/public/divisions/99999
# Error: "Division with ID 99999 not found"

# Non-existent pool
curl http://localhost:3000/api/public/divisions/1/standings?poolId=99999
# Error: "Pool with ID 99999 not found in division 1"
```

**Solution:** Verify IDs exist before making requests

#### 3. Rate Limit Exceeded (429)

**Cause:** More than 100 requests per minute from same IP

**Example:**
```bash
# Exhaust rate limit
for i in {1..101}; do
  curl http://localhost:3000/api/public/divisions
done
# Last request returns: "Rate limit exceeded. Try again in X seconds."
```

**Solution:**
- Implement exponential backoff in client
- Cache responses on client side
- Use ETag/If-None-Match headers

---

## Testing Guide

### Manual Testing with curl

#### Test 1: Basic Connectivity
```bash
# Expected: Server is running and responsive
curl http://localhost:3000/health
```

#### Test 2: List Divisions
```bash
# Expected: Array of divisions with stats
curl http://localhost:3000/api/public/divisions
```

#### Test 3: Pagination
```bash
# Expected: Respects limit and offset
curl "http://localhost:3000/api/public/divisions?limit=2&offset=0"
```

#### Test 4: Search Functionality
```bash
# Create test division first (admin endpoint)
curl -X POST http://localhost:3000/api/divisions \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Division for Search"}'

# Search for it
curl "http://localhost:3000/api/public/divisions?search=Test"

# Expected: Finds the division
```

#### Test 5: Get Single Division
```bash
# Expected: Full division details with pools
curl http://localhost:3000/api/public/divisions/1
```

#### Test 6: Standings (Full Workflow)
```bash
# 1. Create division
DIVISION_ID=$(curl -s -X POST http://localhost:3000/api/divisions \
  -H "Content-Type: application/json" \
  -d '{"name":"Standings Test"}' | jq -r '.id')

echo "Created division: $DIVISION_ID"

# 2. Seed with teams
curl -X POST http://localhost:3000/api/divisions/$DIVISION_ID/seed \
  -H "Content-Type: application/json" \
  -d '{
    "teams": [
      {"name": "Team A"},
      {"name": "Team B"},
      {"name": "Team C"},
      {"name": "Team D"}
    ],
    "maxPools": 1
  }'

# 3. Get standings (should show 0-0 records)
curl http://localhost:3000/api/public/divisions/$DIVISION_ID/standings | jq

# 4. Score a match (get match ID first)
MATCH_ID=$(curl -s http://localhost:3000/api/public/divisions/$DIVISION_ID/matches | jq -r '.data[0].id')

curl -X PUT http://localhost:3000/api/matches/$MATCH_ID/score \
  -H "Content-Type: application/json" \
  -d '{"scoreA": 11, "scoreB": 9}'

# 5. Check updated standings
curl http://localhost:3000/api/public/divisions/$DIVISION_ID/standings | jq

# Expected: One team with 1-0 record, one with 0-1, others 0-0
```

#### Test 7: Matches with Filters
```bash
# All matches
curl http://localhost:3000/api/public/divisions/1/matches

# Only completed matches
curl http://localhost:3000/api/public/divisions/1/matches?status=completed

# Only pending matches
curl http://localhost:3000/api/public/divisions/1/matches?status=pending
```

#### Test 8: Cache Headers
```bash
# Check for Cache-Control and ETag
curl -I http://localhost:3000/api/public/divisions

# Expected headers:
# Cache-Control: public, max-age=30
# ETag: W/"..."
```

#### Test 9: ETag/304 Support
```bash
# First request - get ETag
ETAG=$(curl -sI http://localhost:3000/api/public/divisions | grep -i etag | cut -d' ' -f2)

echo "ETag: $ETAG"

# Second request with If-None-Match
curl -I -H "If-None-Match: $ETAG" http://localhost:3000/api/public/divisions

# Expected: HTTP 304 Not Modified (if data unchanged)
```

#### Test 10: CORS Headers
```bash
# Test CORS with origin header
curl -I -H "Origin: http://localhost:5173" http://localhost:3000/api/public/divisions

# Expected header:
# Access-Control-Allow-Origin: http://localhost:5173
```

#### Test 11: Rate Limiting
```bash
# Test rate limit (may take a minute)
for i in {1..105}; do
  echo "Request $i"
  curl -s http://localhost:3000/api/public/divisions > /dev/null
done

# Expected: Last 5-10 requests should fail with 429
```

### Automated Testing

**E2E Tests:**
```bash
# Run all E2E tests
cd apps/api
pnpm test

# Run only public API tests (when created)
pnpm exec vitest run src/__tests__/e2e.public.spec.ts
```

---

## Frontend Integration

### JavaScript/Fetch API

```javascript
// List divisions
async function getDivisions(limit = 20, offset = 0, search = '') {
  const params = new URLSearchParams({ limit, offset });
  if (search) params.append('search', search);

  const response = await fetch(`http://localhost:3000/api/public/divisions?${params}`);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

// Get single division
async function getDivision(id) {
  const response = await fetch(`http://localhost:3000/api/public/divisions/${id}`);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Division not found');
    }
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

// Get standings
async function getStandings(divisionId, poolId = null) {
  const url = poolId
    ? `http://localhost:3000/api/public/divisions/${divisionId}/standings?poolId=${poolId}`
    : `http://localhost:3000/api/public/divisions/${divisionId}/standings`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

// Get matches
async function getMatches(divisionId, { poolId, status, limit = 50, offset = 0 } = {}) {
  const params = new URLSearchParams({ limit, offset });
  if (poolId) params.append('poolId', poolId);
  if (status) params.append('status', status);

  const response = await fetch(
    `http://localhost:3000/api/public/divisions/${divisionId}/matches?${params}`
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

// Usage example
async function main() {
  try {
    // Get first page of divisions
    const { data: divisions, meta } = await getDivisions(10, 0);
    console.log('Divisions:', divisions);
    console.log('Total:', meta.total);

    // Get standings for first division
    if (divisions.length > 0) {
      const standings = await getStandings(divisions[0].id);
      console.log('Standings:', standings);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}
```

### React with Axios

```javascript
import axios from 'axios';
import { useState, useEffect } from 'react';

// Create API client
const api = axios.create({
  baseURL: 'http://localhost:3000/api/public',
  timeout: 5000,
});

// React hook for divisions
function useDivisions(limit = 20, offset = 0, search = '') {
  const [data, setData] = useState({ data: [], meta: { total: 0 } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchDivisions() {
      try {
        setLoading(true);
        const response = await api.get('/divisions', {
          params: { limit, offset, search },
        });
        setData(response.data);
        setError(null);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to fetch divisions');
      } finally {
        setLoading(false);
      }
    }

    fetchDivisions();
  }, [limit, offset, search]);

  return { data, loading, error };
}

// React component example
function DivisionList() {
  const { data, loading, error } = useDivisions(10, 0, '');

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h2>Divisions ({data.meta.total})</h2>
      <ul>
        {data.data.map((division) => (
          <li key={division.id}>
            {division.name} - {division.stats.teams} teams, {division.stats.completedMatches}/{division.stats.matches} matches completed
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### Vue.js Example

```javascript
// Vue 3 Composition API
import { ref, onMounted } from 'vue';

export default {
  setup() {
    const divisions = ref([]);
    const loading = ref(true);
    const error = ref(null);

    async function fetchDivisions() {
      try {
        const response = await fetch('http://localhost:3000/api/public/divisions');
        if (!response.ok) throw new Error('Failed to fetch');
        const json = await response.json();
        divisions.value = json.data;
      } catch (err) {
        error.value = err.message;
      } finally {
        loading.value = false;
      }
    }

    onMounted(fetchDivisions);

    return { divisions, loading, error };
  },
};
```

---

## Troubleshooting

### Issue 1: CORS Errors in Browser

**Symptom:**
```
Access to fetch at 'http://localhost:3000/api/public/divisions'
from origin 'http://localhost:5173' has been blocked by CORS policy
```

**Cause:** Origin not in allowed list

**Solution:**
1. Check server logs for CORS configuration
2. Verify `CORS_ORIGINS` environment variable (production only)
3. In development, localhost:5173 should be automatically allowed

**Debug:**
```bash
# Check CORS headers
curl -I -H "Origin: http://localhost:5173" http://localhost:3000/api/public/divisions

# Should see:
# Access-Control-Allow-Origin: http://localhost:5173
```

### Issue 2: Rate Limit Errors

**Symptom:**
```json
{
  "statusCode": 429,
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Try again in 42 seconds."
}
```

**Cause:** More than 100 requests per minute

**Solution:**
1. Implement client-side caching
2. Use ETag/If-None-Match headers
3. Add exponential backoff
4. Reduce polling frequency

**Example with backoff:**
```javascript
async function fetchWithRetry(url, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After') || delay;
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        continue;
      }
      return response;
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
  }
}
```

### Issue 3: 404 Not Found

**Symptom:**
```json
{
  "statusCode": 404,
  "error": "Not Found",
  "message": "Division with ID 999 not found"
}
```

**Cause:** Resource doesn't exist

**Solution:**
1. Verify ID exists by listing divisions first
2. Check for typos in IDs
3. Ensure division wasn't deleted

**Example:**
```bash
# List divisions to find valid IDs
curl http://localhost:3000/api/public/divisions | jq '.data[].id'

# Use valid ID
curl http://localhost:3000/api/public/divisions/1
```

### Issue 4: Empty Standings

**Symptom:** Standings return empty arrays or all 0-0 records

**Cause:** No completed matches yet

**Solution:** Score some matches first

**Example:**
```bash
# Get match IDs
curl http://localhost:3000/api/public/divisions/1/matches | jq '.data[].id'

# Score a match (use admin endpoint)
curl -X PUT http://localhost:3000/api/matches/1/score \
  -H "Content-Type: application/json" \
  -d '{"scoreA": 11, "scoreB": 9}'

# Check standings again
curl http://localhost:3000/api/public/divisions/1/standings
```

### Issue 5: Server Not Responding

**Symptom:** Connection refused or timeout

**Cause:** Server not running or wrong port

**Solution:**
```bash
# Check if server is running
curl http://localhost:3000/health

# If fails, start server
cd apps/api
pnpm run dev

# Check port in .env file
cat .env | grep PORT
```

---

## Performance Tips

### 1. Use ETag Headers

```javascript
// Store ETag from previous response
let cachedETag = null;
let cachedData = null;

async function fetchWithETag(url) {
  const headers = {};
  if (cachedETag) {
    headers['If-None-Match'] = cachedETag;
  }

  const response = await fetch(url, { headers });

  if (response.status === 304) {
    // Use cached data
    return cachedData;
  }

  // Update cache
  cachedETag = response.headers.get('ETag');
  cachedData = await response.json();
  return cachedData;
}
```

### 2. Implement Client-Side Caching

```javascript
const cache = new Map();
const CACHE_DURATION = 15000; // 15 seconds

async function fetchWithCache(url) {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  const response = await fetch(url);
  const data = await response.json();

  cache.set(url, {
    data,
    timestamp: Date.now(),
  });

  return data;
}
```

### 3. Pagination Best Practices

```javascript
// Load more (infinite scroll)
let offset = 0;
const limit = 20;
const allDivisions = [];

async function loadMore() {
  const response = await fetch(
    `http://localhost:3000/api/public/divisions?limit=${limit}&offset=${offset}`
  );
  const { data, meta } = await response.json();

  allDivisions.push(...data);
  offset += limit;

  // Check if more pages available
  return offset < meta.total;
}
```

---

## Additional Resources

### Documentation
- [ENDPOINTS.md](ENDPOINTS.md) - Complete API reference
- [README.md](README.md) - Project overview
- [CHANGELOG.md](CHANGELOG.md) - Version history
- [QUICKSTART.md](QUICKSTART.md) - 10-minute getting started guide

### API Design
- [REST API Guidelines](https://restfulapi.net/)
- [HTTP Status Codes](https://httpstatuses.com/)
- [RFC 7234 - HTTP Caching](https://tools.ietf.org/html/rfc7234)

### Frontend Frameworks
- [React Documentation](https://react.dev/)
- [Vue.js Guide](https://vuejs.org/guide/)
- [Axios Documentation](https://axios-http.com/)

---

## Support & Feedback

### Reporting Issues

If you encounter bugs or unexpected behavior:

1. Check this guide's [Troubleshooting](#troubleshooting) section
2. Verify server logs: `cd apps/api && pnpm run dev`
3. Test with curl to isolate frontend vs backend issues
4. Report on GitHub Issues with:
   - Exact request (curl command)
   - Expected behavior
   - Actual behavior
   - Server logs (if applicable)

### Feature Requests

For new endpoints or API improvements:

1. Check [CHANGELOG.md](CHANGELOG.md) for planned features (v0.5.0+)
2. Review [ENDPOINTS.md](ENDPOINTS.md) for existing capabilities
3. Submit feature request with use case and example

---

**Document Version:** 1.0.0
**API Version:** v0.4.0
**Last Updated:** October 14, 2025
**Status:** ✅ Production Ready
