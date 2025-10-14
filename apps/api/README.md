# Tournament API

REST API server for tournament management built with Fastify, Drizzle ORM, and SQLite.

## Setup

1. Install dependencies (from project root):
   ```bash
   pnpm install
   ```

2. Copy environment file:
   ```bash
   cp .env.example .env
   ```

3. Run database migrations:
   ```bash
   pnpm migrate
   ```

4. Start the development server:
   ```bash
   pnpm dev
   ```

The server will start at `http://localhost:3000`.

## Environment Variables

- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Environment mode (development, production)
- `DATABASE_URL`: SQLite database file path (e.g., `file:./dev.db`)

## API Endpoints

### GET /health
Health check endpoint.

### POST /api/divisions/:id/seed
Seed tournament matches for a division.

### GET /api/divisions/:id/export.csv
Export tournament data as CSV.

See the main README for detailed API documentation.

## Database Migrations

To run migrations:
```bash
pnpm migrate
```

The migration will create the necessary tables:
- `teams`
- `pools`
- `matches`
- `exports`

## Development

```bash
# Run in development mode with auto-reload
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Run tests
pnpm test

# Type checking
pnpm typecheck
```
