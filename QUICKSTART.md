# Quick Start Guide

This guide will help you get the tournament backend system up and running in minutes.

**Production Status:** ✅ **Production Ready** - All 266 tests passing (October 14, 2025)

## Prerequisites

- **Node.js 20+** - [Download](https://nodejs.org/)
- **pnpm 8+** - Install with: `npm install -g pnpm`
- **Recommended:** Ubuntu Server 22.04 LTS (see [Ubuntu VM Setup](#ubuntu-vm-setup-recommended) below)

## Installation

1. **Install dependencies:**
   ```bash
   cd backend
   pnpm install
   ```

2. **Build all packages:**
   ```bash
   pnpm build
   ```

3. **Set up the API database:**
   ```bash
   cd apps/api
   cp .env.example .env
   pnpm migrate
   ```

4. **Start the development server:**
   ```bash
   cd ../..
   pnpm dev
   ```

The server will start at `http://localhost:3000`.

## Verify Installation

Test the health endpoint:
```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-10-13T12:00:00.000Z"
}
```

## Example API Usage

### 1. Seed a Tournament

Create a tournament with 4 teams:

```bash
curl -X POST http://localhost:3000/api/divisions/1/seed \
  -H "Content-Type: application/json" \
  -d '{
    "teams": [
      {"name": "Team Alpha"},
      {"name": "Team Beta"},
      {"name": "Team Gamma"},
      {"name": "Team Delta"}
    ],
    "maxPools": 1,
    "options": {
      "seed": 12345,
      "shuffle": false,
      "poolStrategy": "respect-input"
    }
  }'
```

Response:
```json
{
  "divisionId": 1,
  "poolsCreated": 1,
  "teamsCount": 4,
  "matchesGenerated": 6,
  "message": "Tournament seeded successfully"
}
```

### 2. Export Tournament as CSV

```bash
curl http://localhost:3000/api/divisions/1/export.csv -o tournament.csv
```

This will download a CSV file with all matches.

## Running Tests

```bash
# Run all tests (from backend root)
pnpm test

# Expected output:
# Test Files  11 passed (11)
#      Tests  266 passed (266)
# Duration: ~3-5 seconds

# Run tournament-engine tests only
cd packages/tournament-engine
pnpm test
# Expected: Tests 225 passed (225)

# Run API E2E tests only
cd apps/api
pnpm test
# Expected: Tests 41 passed (41)

# Run tests in watch mode
pnpm test:watch
```

**Note:** E2E tests require better-sqlite3 compilation. Use Ubuntu or WSL2 if tests fail on Windows.

## Development Commands

```bash
# Type checking
pnpm typecheck

# Linting
pnpm lint

# Format code
pnpm format

# Build all packages
pnpm build

# Start dev server (auto-reload)
pnpm dev
```

## Deterministic Tournament Generation

The system uses a seeded PRNG (Mulberry32) for deterministic behavior. Using the same seed will always produce identical results:

```bash
# These two requests will generate identical tournaments
curl -X POST http://localhost:3000/api/divisions/1/seed \
  -H "Content-Type: application/json" \
  -d '{"teams":[{"name":"A"},{"name":"B"},{"name":"C"}],"options":{"seed":999,"shuffle":true}}'

curl -X POST http://localhost:3000/api/divisions/2/seed \
  -H "Content-Type: application/json" \
  -d '{"teams":[{"name":"A"},{"name":"B"},{"name":"C"}],"options":{"seed":999,"shuffle":true}}'
```

Both divisions will have teams shuffled in the same order and matches scheduled identically.

## Project Structure

```
backend/
├── packages/
│   └── tournament-engine/    # Pure TS library
│       ├── src/
│       │   ├── rng.ts        # Seeded PRNG
│       │   ├── types.ts      # Type definitions
│       │   ├── preprocess.ts # Team preprocessing
│       │   ├── pools.ts      # Pool assignment
│       │   ├── roundRobin.ts # Match generation
│       │   ├── standings.ts  # Rankings
│       │   ├── exportMap.ts  # CSV mapping
│       │   └── index.ts      # Public API
│       └── __tests__/        # Unit tests
└── apps/
    └── api/                  # Fastify REST API
        ├── src/
        │   ├── server.ts     # Entry point
        │   ├── env.ts        # Environment config
        │   ├── routes/       # API endpoints
        │   └── lib/db/       # Database layer
        └── __tests__/        # E2E tests
```

## Ubuntu VM Setup (Recommended)

**Why Ubuntu?** The backend now runs on Ubuntu Server 22.04 LTS for better-sqlite3 native module compilation. While Windows works with build tools, Ubuntu provides the most stable environment.

### Option 1: Proxmox VM (For Remote Development)

**1. Create VM:**
- OS: Ubuntu Server 22.04 LTS
- CPU: 2 cores
- RAM: 4GB
- Storage: 32GB

**2. Install Required Software:**

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install pnpm
npm install -g pnpm

# Install build tools (required for better-sqlite3)
sudo apt install -y build-essential python3 git
```

**3. Clone and Setup Project:**

```bash
git clone <your-repo-url>
cd backend
pnpm install
pnpm build
cd apps/api
cp .env.example .env
pnpm migrate
```

**4. Verify Installation:**

```bash
# Run all tests
cd /home/user/backend
pnpm test

# Expected: Test Files 11 passed (11), Tests 266 passed (266)
```

### Option 2: WSL2 (Windows Subsystem for Linux)

**1. Install WSL2:**

```bash
# In Windows PowerShell (as Administrator)
wsl --install -d Ubuntu-22.04
```

**2. Inside WSL, Follow Ubuntu Setup:**

```bash
# Update and install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs build-essential python3 git

# Install pnpm
npm install -g pnpm

# Clone and setup (access Windows files via /mnt/c/)
cd ~
git clone <your-repo-url>
cd backend
pnpm install
pnpm build
pnpm test
```

### Option 3: Remote Development with VS Code + Tailscale

**For seamless remote development on Ubuntu VM:**

**1. Install Tailscale (Secure VPN):**

```bash
# On Ubuntu VM:
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up

# Note the Tailscale IP (e.g., 100.x.x.x)
```

**2. On Your Local Machine:**
- Download Tailscale from https://tailscale.com/download
- Install and login to same account
- You can now access Ubuntu VM via Tailscale IP

**3. Configure VS Code Remote-SSH:**

```bash
# In VS Code:
# 1. Install "Remote - SSH" extension
# 2. Press F1 → "Remote-SSH: Connect to Host"
# 3. Enter: ssh username@100.x.x.x (Tailscale IP)
# 4. Open folder: /home/username/backend

# 5. Install VS Code extensions on remote:
#    - ESLint
#    - Prettier
#    - TypeScript and JavaScript Language Features
```

**Benefits:**
- ✅ Full IDE experience on remote Ubuntu
- ✅ Native better-sqlite3 compilation
- ✅ Production-like environment
- ✅ Access from anywhere via Tailscale

## Troubleshooting

### better-sqlite3 Compilation on Windows

If you see `Could not locate the bindings file` on Windows:

**Option 1: Use Ubuntu VM** (Recommended - see above)

**Option 2: Install Windows Build Tools**
```bash
npm install --global windows-build-tools
cd backend
pnpm rebuild better-sqlite3
```

### Database Issues

If you encounter database errors, try deleting and recreating it:

```bash
cd apps/api
rm dev.db
pnpm migrate
```

### Build Errors

If you get build errors, try cleaning and rebuilding:

```bash
# Clean build artifacts
rm -rf packages/*/dist apps/*/dist

# Rebuild
pnpm build
```

### Port Already in Use

If port 3000 is already in use, change it in `apps/api/.env`:

```
PORT=3001
```

## Next Steps

- Read the full [README.md](README.md) for detailed API documentation
- Explore the [tournament-engine package](packages/tournament-engine/README.md) for library usage
- Check out the [test files](packages/tournament-engine/src/__tests__) for more examples

## Support

For issues or questions, please open an issue on GitHub.
