# Authentication Setup Guide

## Quick Start

This guide will help you set up Google OAuth authentication for the Tournament Manager backend.

---

## Step 1: Install Dependencies

Already done! The following packages are installed:
- `@fastify/cookie` - Cookie handling
- `axios` - HTTP client for OAuth

---

## Step 2: Set Up Google OAuth Credentials

### 2.1 Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Select a project** → **New Project**
3. Name: "Tournament Manager" (or your preferred name)
4. Click **Create**

### 2.2 Enable Google+ API

1. In your project, go to **APIs & Services** → **Library**
2. Search for "Google+ API"
3. Click on it and click **Enable**

### 2.3 Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Choose **User Type:**
   - **External** - Any Google account (recommended for testing)
   - **Internal** - Only your Google Workspace domain
3. Click **Create**
4. Fill in **App information:**
   - App name: "Tournament Manager"
   - User support email: Your email
   - Developer contact: Your email
5. Click **Save and Continue**
6. **Scopes:**
   - Click **Add or Remove Scopes**
   - Select: `openid`, `email`, `profile` (should be selected by default)
   - Click **Update** → **Save and Continue**
7. **Test users** (if External):
   - Click **Add Users**
   - Add your Google email address
   - Click **Save and Continue**
8. Click **Back to Dashboard**

### 2.4 Create OAuth Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth 2.0 Client ID**
3. Application type: **Web application**
4. Name: "Tournament Manager Web Client"
5. **Authorized redirect URIs:** Click **Add URI** and add:
   ```
   https://api.bracketiq.win/api/auth/google/callback
   ```
   For development (Tailscale):
   ```
   http://100.125.100.17:3000/api/auth/google/callback
   ```
   Or for localhost:
   ```
   http://localhost:3000/api/auth/google/callback
   ```
6. Click **Create**
7. **Copy your credentials:**
   - **Client ID**: `xxx.apps.googleusercontent.com`
   - **Client Secret**: `GOCSPX-xxx...`

---

## Step 3: Configure Environment Variables

### 3.1 Create/Update .env File

Create or update `backend/apps/api/.env`:

```bash
# Node Environment
NODE_ENV=development

# Server
PORT=3000

# Database
DATABASE_URL=file:./dev.db

# Google OAuth (REQUIRED)
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret"
GOOGLE_REDIRECT_URI="https://api.bracketiq.win/api/auth/google/callback"

# Session Secret (generate a random 32+ character string)
SESSION_SECRET="your-random-32-char-secret-here-change-this"

# Frontend URL (for OAuth redirects)
FRONTEND_URL="https://bracketiq.win"

# For development with Tailscale:
# GOOGLE_REDIRECT_URI="http://100.125.100.17:3000/api/auth/google/callback"
# FRONTEND_URL="http://100.125.100.17:5173"

# CORS (optional, defaults to localhost in development)
# CORS_ORIGINS="http://100.125.100.17:5173,http://localhost:5173"
```

### 3.2 Generate Session Secret

```bash
# On Linux/Mac
openssl rand -base64 32

# Or Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Copy the output to `SESSION_SECRET` in your `.env` file.

---

## Step 4: Run Database Migration

The migration has already been applied, but if you need to reapply:

```bash
cd backend/apps/api

# Apply migration
cat src/lib/db/migrations/0001_add_auth_tables.sql | sqlite3 dev.db

# Verify tables were created
sqlite3 dev.db ".tables"
# Should show: users, sessions, ...
```

---

## Step 5: Start the Backend

```bash
cd backend/apps/api
pnpm dev
```

You should see:
```
[INFO] Server listening on port 3000
[INFO] Cookie support enabled for authentication
[INFO] All routes registered successfully
```

---

## Step 6: Test Authentication

### 6.1 Test OAuth Flow

Open your browser to:
```
https://api.bracketiq.win/api/auth/google
```

Or for development (Tailscale):
```
http://100.125.100.17:3000/api/auth/google
```

You should:
1. Be redirected to Google login
2. See "Tournament Manager wants to access your Google Account"
3. Click "Continue" or "Allow"
4. Be redirected back to your frontend URL

### 6.2 Verify Session

After logging in, check your session:

```bash
# In browser DevTools:
# 1. Open DevTools (F12)
# 2. Go to Application → Cookies
# 3. Look for cookie named "sid"
# 4. Copy the value

# Then test the /auth/me endpoint:
curl -b "sid=YOUR_SESSION_TOKEN_HERE" https://api.bracketiq.win/api/auth/me
# Or for Tailscale:
# curl -b "sid=YOUR_SESSION_TOKEN_HERE" http://100.125.100.17:3000/api/auth/me
```

Expected response:
```json
{
  "user": {
    "id": 1,
    "email": "your-email@gmail.com",
    "name": "Your Name",
    "picture": "https://lh3.googleusercontent.com/...",
    "role": "admin"
  }
}
```

**Note:** The first user to login automatically gets **admin** role!

### 6.3 Test Protected Endpoint

Try creating a division (requires admin):

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -b "sid=YOUR_SESSION_TOKEN_HERE" \
  -d '{"name":"Test Division"}' \
  https://api.bracketiq.win/api/divisions
```

Expected response:
```json
{
  "id": 1,
  "name": "Test Division",
  "created_at": "2025-10-15T..."
}
```

### 6.4 Test Without Auth

Try without session cookie (should fail):

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Division"}' \
  https://api.bracketiq.win/api/divisions
```

Expected response (401 Unauthorized):
```json
{
  "error": "Unauthorized",
  "message": "No session cookie provided"
}
```

---

## Troubleshooting

### Error: "redirect_uri_mismatch"

**Problem:** Google says redirect URI doesn't match

**Solution:**
1. Go to Google Cloud Console → Credentials
2. Click on your OAuth client
3. Check **Authorized redirect URIs**
4. Make sure it **exactly matches** your `GOOGLE_REDIRECT_URI` in `.env`
   - Include the protocol (`http://` or `https://`)
   - Include the port (`:3000`)
   - Include the full path (`/api/auth/google/callback`)

### Error: "OAuth not configured"

**Problem:** Backend says OAuth credentials not set

**Solution:**
1. Check `.env` file exists at `backend/apps/api/.env`
2. Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set
3. Restart the backend server
4. Check logs for env validation errors

### Error: "Email not verified by Google"

**Problem:** Google account email not verified

**Solution:** User must verify their email with Google first. Check Gmail for verification email.

### Sessions not persisting / Cookie not set

**Problem:** Cookie not showing up in browser

**Solution:**
1. Check browser console for errors
2. Verify `FRONTEND_URL` matches your frontend origin
3. Check CORS settings (origins must match)
4. For Tailscale: Make sure Tailscale IP is in CORS origins
5. Cookies require same origin or proper CORS configuration

### "Access blocked: This app's request is invalid"

**Problem:** OAuth consent screen not properly configured

**Solution:**
1. Go to OAuth consent screen in Google Console
2. Make sure app is not in "Testing" mode with no test users
3. Add your email as a test user if in testing mode
4. Or publish the app (for production)

---

## Next Steps

### For Development

✅ Authentication is fully configured!

You can now:
1. Continue developing frontend integration
2. Test protected endpoints
3. Add more users (they'll be "viewer" role by default)

### For Production

Before deploying to production:

1. **Create production OAuth credentials** (separate from dev)
2. **Update environment variables:**
   ```bash
   NODE_ENV=production
   GOOGLE_REDIRECT_URI=https://yourdomain.com/api/auth/google/callback
   FRONTEND_URL=https://yourdomain.com
   ```
3. **Enable HTTPS** (required for production)
4. **Implement signature verification** (see docs/AUTHENTICATION.md)
5. **Add rate limiting** to auth endpoints
6. **Set up session cleanup** (cron job)
7. **Configure monitoring** and alerts

---

## Additional Resources

- **Full Documentation:** [docs/AUTHENTICATION.md](apps/api/docs/AUTHENTICATION.md)
- **Implementation Plan:** [Authentication_Implementation_Plan.md](Authentication_Implementation_Plan.md)
- **Google OAuth Docs:** https://developers.google.com/identity/protocols/oauth2
- **Test File:** [src/__tests__/e2e.auth.spec.ts](apps/api/src/__tests__/e2e.auth.spec.ts)

---

## Quick Reference

### Auth Endpoints

```
GET  /api/auth/google           - Start OAuth flow
GET  /api/auth/google/callback  - OAuth callback
GET  /api/auth/me               - Get current user (auth required)
POST /api/auth/logout           - Logout (auth required)
```

### Protected Admin Endpoints

```
POST   /api/divisions                - Create division
PUT    /api/divisions/:id            - Update division
DELETE /api/divisions/:id            - Delete division
POST   /api/divisions/:id/seed       - Seed tournament
POST   /api/divisions/:id/seed-dupr  - Seed with DUPR
PUT    /api/matches/:id/score        - Score match
```

### Testing Commands

```bash
# Start backend
cd backend/apps/api && pnpm dev

# Build backend
pnpm build

# Run tests
pnpm test

# Check database
sqlite3 dev.db ".schema users"
sqlite3 dev.db "SELECT * FROM users;"
sqlite3 dev.db "SELECT * FROM sessions;"
```

---

---

## Cloudflare Tunnel Configuration

This application uses Cloudflare Tunnel for public access without port forwarding.

### Production URLs
- **Backend API:** https://api.bracketiq.win
- **Frontend:** https://bracketiq.win

### Development Access
You can still access via Tailscale or localhost:
- **Backend (Tailscale):** http://100.125.100.17:3000
- **Frontend (Tailscale):** http://100.125.100.17:5173
- **Backend (localhost):** http://localhost:3000
- **Frontend (localhost):** http://localhost:5173

### OAuth Redirect URIs for Google Console

**Production:**
```
https://api.bracketiq.win/api/auth/google/callback
```

**Authorized JavaScript origins:**
```
https://bracketiq.win
https://api.bracketiq.win
```

**Development (optional):**
```
http://100.125.100.17:3000/api/auth/google/callback
http://localhost:3000/api/auth/google/callback
```

### Switching Between Production and Development

Update your `.env` file:

**For Production (Cloudflare):**
```bash
GOOGLE_REDIRECT_URI="https://api.bracketiq.win/api/auth/google/callback"
FRONTEND_URL="https://bracketiq.win"
```

**For Development (Tailscale):**
```bash
GOOGLE_REDIRECT_URI="http://100.125.100.17:3000/api/auth/google/callback"
FRONTEND_URL="http://100.125.100.17:5173"
```

---

**Setup Complete!** 🎉

Your authentication system is ready to use. The first user to login will automatically become an admin.
