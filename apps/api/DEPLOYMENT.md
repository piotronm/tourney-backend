# Deployment Guide

**Last Updated:** 2025-10-15

## Current Deployment

### Infrastructure
- **Hosting:** Ubuntu Server (SSH via Tailscale)
- **Public Access:** Cloudflare Tunnel
- **Domain:** bracketiq.win
- **SSL/TLS:** Cloudflare (automatic)

### URLs
- **Backend API:** https://api.bracketiq.win
- **Frontend:** https://bracketiq.win
- **Health Check:** https://api.bracketiq.win/health

### Architecture
```
Internet
   ↓
Cloudflare Edge
   ↓
Cloudflare Tunnel (cloudflared)
   ↓
Ubuntu Server (100.125.100.17)
   ├─ Backend :3000
   └─ Frontend :5173
```

---

## Environment Configuration

### Required Environment Variables

```bash
# Server
NODE_ENV=production
PORT=3000

# Database
DATABASE_URL=file:./database.db

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-secret
GOOGLE_REDIRECT_URI=https://api.bracketiq.win/api/auth/google/callback

# Session
SESSION_SECRET=your-32-char-random-secret

# Frontend
FRONTEND_URL=https://bracketiq.win

# CORS
CORS_ORIGINS=https://bracketiq.win,https://api.bracketiq.win
```

### Generating Secrets

```bash
# Session secret
openssl rand -base64 32

# Or with Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

## Cloudflare Tunnel Setup

### Installation
```bash
# Install cloudflared
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb
```

### Configuration

Location: `~/.cloudflared/config.yml` or `/etc/cloudflared/config.yml`

```yaml
tunnel: tournament-manager
credentials-file: /path/to/credentials.json

ingress:
  - hostname: api.bracketiq.win
    service: http://localhost:3000
  - hostname: bracketiq.win
    service: http://localhost:5173
  - service: http_status:404
```

### DNS Records
```bash
cloudflared tunnel route dns tournament-manager api.bracketiq.win
cloudflared tunnel route dns tournament-manager bracketiq.win
```

### Running as Service
```bash
# Install service
sudo cloudflared service install

# Start service
sudo systemctl start cloudflared

# Enable on boot
sudo systemctl enable cloudflared

# Check status
sudo systemctl status cloudflared

# View logs
sudo journalctl -u cloudflared -f
```

---

## Database

### Location
`backend/apps/api/dev.db` (SQLite)

### Migrations
Migrations are located in `src/lib/db/migrations/`

To apply:
```bash
cd backend/apps/api
sqlite3 dev.db < src/lib/db/migrations/0001_add_auth_tables.sql
```

### Backup
```bash
# Backup database
cp dev.db dev.db.backup.$(date +%Y%m%d_%H%M%S)

# Or with SQLite dump
sqlite3 dev.db .dump > backup.sql
```

---

## Running the Application

### Development
```bash
cd backend/apps/api
pnpm install
pnpm run dev
```

### Production
```bash
cd backend/apps/api
pnpm install
pnpm run build
pnpm start
```

### Process Management
Consider using PM2 or systemd for production:

**With PM2:**
```bash
pm2 start pnpm --name "tournament-api" -- start
pm2 save
pm2 startup
```

**Or create systemd service:**
```bash
sudo nano /etc/systemd/system/tournament-api.service
```

Example systemd service file:
```ini
[Unit]
Description=Tournament Manager API
After=network.target

[Service]
Type=simple
User=piouser
WorkingDirectory=/home/piouser/eztourneyz/backend/apps/api
ExecStart=/usr/bin/pnpm start
Restart=on-failure
Environment="NODE_ENV=production"

[Install]
WantedBy=multi-user.target
```

Then enable:
```bash
sudo systemctl daemon-reload
sudo systemctl enable tournament-api
sudo systemctl start tournament-api
```

---

## Monitoring

### Health Check
```bash
curl https://api.bracketiq.win/health
```

Expected response:
```json
{"status":"ok","timestamp":"2025-10-15T..."}
```

### Logs
```bash
# Application logs
tail -f backend.log

# Cloudflare tunnel logs
sudo journalctl -u cloudflared -f

# System logs (if using systemd)
sudo journalctl -u tournament-api -f
```

### Database Queries
```bash
cd backend/apps/api

# Check users
sqlite3 dev.db "SELECT id, email, role FROM users;"

# Check active sessions
sqlite3 dev.db "SELECT COUNT(*) FROM sessions WHERE expires_at >= strftime('%s','now')*1000;"

# Check divisions
sqlite3 dev.db "SELECT id, name, created_at FROM divisions;"
```

---

## Security Checklist

### Pre-Production
- [ ] Change all default secrets
- [ ] Enable HTTPS only (Cloudflare handles this)
- [ ] Set `NODE_ENV=production`
- [ ] Enable rate limiting on auth endpoints
- [ ] Set up database backups
- [ ] Configure session cleanup cron job
- [ ] Review CORS origins (should be production URLs only)
- [ ] Remove development CORS origins
- [ ] Set secure cookie flags
- [ ] Enable logging and monitoring
- [ ] Set up alerts for errors
- [ ] Test OAuth flow end-to-end

### Ongoing
- [ ] Regular database backups
- [ ] Monitor for failed login attempts
- [ ] Clean up expired sessions
- [ ] Review access logs
- [ ] Keep dependencies updated
- [ ] Monitor SSL certificate expiration (Cloudflare auto-renews)

---

## Troubleshooting

### Backend Not Accessible
```bash
# Check if backend is running
lsof -i:3000

# Check backend logs
tail -f backend.log

# Test locally
curl http://localhost:3000/health
```

### Tunnel Issues
```bash
# Check tunnel status
cloudflared tunnel info tournament-manager

# Restart tunnel
sudo systemctl restart cloudflared

# Check tunnel logs
sudo journalctl -u cloudflared -n 100
```

### OAuth Errors
```bash
# Verify environment variables
cd backend/apps/api
grep GOOGLE .env

# Check redirect URI matches Google Console
# Must be: https://api.bracketiq.win/api/auth/google/callback

# Test OAuth endpoint
curl -I https://api.bracketiq.win/api/auth/google
# Should return 302 redirect to Google
```

### Database Issues
```bash
# Check database exists and is readable
ls -lh backend/apps/api/dev.db

# Check tables exist
sqlite3 dev.db ".tables"

# Check database integrity
sqlite3 dev.db "PRAGMA integrity_check;"
```

---

## Rollback Procedure

If deployment fails:

1. **Stop new version**
   ```bash
   pm2 stop tournament-api
   # or
   sudo systemctl stop tournament-api
   ```

2. **Restore database backup**
   ```bash
   cd backend/apps/api
   cp dev.db dev.db.failed
   cp dev.db.backup.[timestamp] dev.db
   ```

3. **Revert code**
   ```bash
   git checkout [previous-commit]
   pnpm install
   pnpm run build
   ```

4. **Restart**
   ```bash
   pm2 start tournament-api
   # or
   sudo systemctl start tournament-api
   ```

---

## Scaling Considerations

### Current Setup (Single Server)
- ✅ Good for: Development, small tournaments (<100 concurrent users)
- ⚠️ Limitations: Single point of failure, SQLite not ideal for high concurrency

### Future Improvements
1. **Database:** Migrate to PostgreSQL for better concurrency
2. **Caching:** Add Redis for session storage
3. **Load Balancing:** Multiple backend instances behind load balancer
4. **CDN:** Serve static assets via CDN
5. **Monitoring:** Add APM (Application Performance Monitoring)
6. **Logging:** Centralized logging (ELK stack, Datadog, etc.)

---

## Contact & Support

For deployment issues, check:
1. Application logs
2. Cloudflare Tunnel status
3. Google OAuth Console
4. Database integrity

---

**Deployment Guide Complete!**
