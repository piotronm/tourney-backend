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

The server will start at `http://localhost:3000` (development) or `https://api.bracketiq.win` (production).

## Environment Variables

### Required
- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Environment mode (development, production)
- `DATABASE_URL`: SQLite database file path (e.g., `file:./dev.db`)

### Authentication (Google OAuth)
- `GOOGLE_CLIENT_ID`: Google OAuth Client ID
- `GOOGLE_CLIENT_SECRET`: Google OAuth Client Secret
- `GOOGLE_REDIRECT_URI`: OAuth callback URL (e.g., `https://api.bracketiq.win/api/auth/google/callback`)
- `SESSION_SECRET`: 32+ character random string for session security
- `FRONTEND_URL`: Frontend application URL (e.g., `https://bracketiq.win`)

See [AUTHENTICATION_SETUP.md](../../AUTHENTICATION_SETUP.md) for detailed setup instructions.

## API Endpoints

### Public Endpoints
- `GET /health` - Health check endpoint
- `GET /api/public/divisions` - List all divisions
- `GET /api/public/teams` - List all teams
- `GET /api/public/matches` - List all matches

### Authentication Endpoints
- `GET /api/auth/google` - Initiate Google OAuth login
- `GET /api/auth/google/callback` - OAuth callback handler
- `GET /api/auth/me` - Get current user (authenticated)
- `POST /api/auth/logout` - Logout current user

### Protected Endpoints (Require Authentication)
- `POST /api/divisions` - Create division (admin only)
- `PUT /api/divisions/:id` - Update division (admin only)
- `DELETE /api/divisions/:id` - Delete division (admin only)
- `POST /api/divisions/:id/seed` - Seed tournament matches
- `GET /api/divisions/:id/export.csv` - Export tournament data as CSV

See [docs/AUTHENTICATION.md](docs/AUTHENTICATION.md) for detailed authentication documentation.

## Database Migrations

To run migrations:
```bash
pnpm migrate
```

The migration will create the necessary tables:
- `divisions`
- `teams`
- `pools`
- `matches`
- `exports`
- `users` (authentication)
- `sessions` (authentication)

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

## Deployment

### Production URLs
The application is deployed with Cloudflare Tunnel:
- **API:** https://api.bracketiq.win
- **Health Check:** https://api.bracketiq.win/health
- **Frontend:** https://bracketiq.win

### Authentication
Google OAuth 2.0 is configured. See [AUTHENTICATION_SETUP.md](../../AUTHENTICATION_SETUP.md) for setup details.

### Environment Variables (Production)
Required for production:
```bash
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-secret
GOOGLE_REDIRECT_URI=https://api.bracketiq.win/api/auth/google/callback
SESSION_SECRET=your-32-char-secret
FRONTEND_URL=https://bracketiq.win
NODE_ENV=production
PORT=3000
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for full deployment guide (coming soon).

## Documentation

- [Authentication Setup Guide](../../AUTHENTICATION_SETUP.md)
- [Authentication Technical Documentation](docs/AUTHENTICATION.md)
- [Deployment Guide](DEPLOYMENT.md) (coming soon)
