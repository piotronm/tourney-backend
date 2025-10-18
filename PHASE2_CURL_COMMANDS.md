# Phase 2 API Endpoints - Quick Reference

## Tournament Endpoints

### List all active tournaments
```bash
curl http://localhost:3000/api/public/tournaments | python3 -m json.tool
```

### Get single tournament with divisions
```bash
curl http://localhost:3000/api/public/tournaments/1 | python3 -m json.tool
```

---

## Division Endpoints (Tournament-Scoped)

### List divisions in tournament
```bash
curl "http://localhost:3000/api/public/tournaments/1/divisions?limit=10" | python3 -m json.tool
```

### Get single division
```bash
curl http://localhost:3000/api/public/tournaments/1/divisions/100218 | python3 -m json.tool
```

### Get division standings
```bash
curl http://localhost:3000/api/public/tournaments/1/divisions/100218/standings | python3 -m json.tool
```

### Get division matches (all)
```bash
curl http://localhost:3000/api/public/tournaments/1/divisions/100218/matches | python3 -m json.tool
```

### Get division matches (completed only)
```bash
curl "http://localhost:3000/api/public/tournaments/1/divisions/100218/matches?status=completed" | python3 -m json.tool
```

---

## Team Endpoints (Tournament-Scoped)

### List teams in division
```bash
curl "http://localhost:3000/api/public/tournaments/1/divisions/100218/teams?limit=20" | python3 -m json.tool
```

### Get single team
```bash
curl http://localhost:3000/api/public/tournaments/1/divisions/100219/teams/2067 | python3 -m json.tool
```

---

## Pool Endpoints (Tournament-Scoped)

### List pools in division
```bash
curl http://localhost:3000/api/public/tournaments/1/divisions/100218/pools | python3 -m json.tool
```

---

## Error Cases

### Non-existent tournament (500 error)
```bash
curl http://localhost:3000/api/public/tournaments/99999
```

### Division in wrong tournament (500 error)
```bash
curl http://localhost:3000/api/public/tournaments/99/divisions/100218
```

### Old routes (404 error - route not found)
```bash
curl http://localhost:3000/api/public/divisions
curl http://localhost:3000/api/public/divisions/100218
```

---

## Advanced Filtering Examples

### Search divisions by name
```bash
curl "http://localhost:3000/api/public/tournaments/1/divisions?search=Mens" | python3 -m json.tool
```

### Filter teams by pool
```bash
curl "http://localhost:3000/api/public/tournaments/1/divisions/100219/teams?poolId=747" | python3 -m json.tool
```

### Get standings for specific pool
```bash
curl "http://localhost:3000/api/public/tournaments/1/divisions/100218/standings?poolId=747" | python3 -m json.tool
```

---

## Testing Workflow

```bash
# 1. List all tournaments
curl http://localhost:3000/api/public/tournaments | python3 -m json.tool

# 2. Get tournament details (note the division IDs)
curl http://localhost:3000/api/public/tournaments/1 | python3 -m json.tool

# 3. List divisions in that tournament
curl http://localhost:3000/api/public/tournaments/1/divisions | python3 -m json.tool

# 4. Get specific division (use ID from step 3)
curl http://localhost:3000/api/public/tournaments/1/divisions/100218 | python3 -m json.tool

# 5. Get teams in that division
curl http://localhost:3000/api/public/tournaments/1/divisions/100218/teams | python3 -m json.tool

# 6. Get pools in that division
curl http://localhost:3000/api/public/tournaments/1/divisions/100218/pools | python3 -m json.tool

# 7. Get standings
curl http://localhost:3000/api/public/tournaments/1/divisions/100218/standings | python3 -m json.tool
```

---

## Production URLs (Replace localhost with your domain)

When frontend is deployed, replace `localhost:3000` with your production API domain:

```bash
# Example with bracketiq.win
curl https://api.bracketiq.win/api/public/tournaments | python3 -m json.tool
curl https://api.bracketiq.win/api/public/tournaments/1 | python3 -m json.tool
curl https://api.bracketiq.win/api/public/tournaments/1/divisions | python3 -m json.tool
```
