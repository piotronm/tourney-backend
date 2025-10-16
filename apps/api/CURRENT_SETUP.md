# Current Setup Configuration

**Generated:** $(date '+%Y-%m-%d %H:%M:%S')

This document provides a snapshot of the current system configuration.

---

## System Information

### Server
- **OS:** Linux 6.8.0-85-generic
- **Hostname:** piouser
- **Node Version:** v20.19.5
- **pnpm Version:** 10.18.3

### Backend
- **Port:** 3000
- **Process:** 
- **Database:** SQLite (dev.db)

### Frontend
- **Port:** 5173
- **Process:** 2727865

---

## URLs

### Production (Cloudflare Tunnel)
- **Backend API:** https://api.bracketiq.win
- **Frontend:** https://bracketiq.win

### Direct Access (Tailscale)
- **Backend:** http://100.125.100.17:3000
- **Frontend:** http://100.125.100.17:5173

---

## Cloudflare Tunnel

### Tunnel Information
```
NAME:     tournament-manager
ID:       6f188dd9-eabf-48e6-bb7b-85120c4ec5d0
CREATED:  2025-10-15 18:23:32.165973 +0000 UTC

CONNECTOR ID                         CREATED              ARCHITECTURE VERSION   ORIGIN IP  EDGE                      
1c2a7b84-c8e6-4e6c-9173-cad5715ea1b9 2025-10-15T18:25:13Z linux_amd64  2025.10.0 98.1.16.99 1xord02, 1xord06, 2xord12 
```

### DNS Records
- api.bracketiq.win → Cloudflare Tunnel
- bracketiq.win → Cloudflare Tunnel

---

## Database State

### Tables
```
court_assignments  matches            sessions         
divisions          players            teams            
exports            pools              users            
```

### Statistics
- **Users:** 0
- **Active Sessions:** 0
- **Divisions:** 0
- **Teams:** 0
- **Matches:** 0

---

## Environment Configuration

### OAuth Settings
- GOOGLE_CLIENT_ID: 587795597299-pdg5p7p6ue2dp1h02...
- GOOGLE_CLIENT_SECRET: Set (hidden)
- GOOGLE_REDIRECT_URI: https://api.bracketiq.win/api/auth/google/callback
- FRONTEND_URL: https://bracketiq.win
- SESSION_SECRET: Set (hidden)

### CORS Origins
```
CORS_ORIGINS=https://bracketiq.win,https://api.bracketiq.win
```

---

## Health Checks

### Backend Health (Production)
```
error code: 502
```

### Public API
```
Status: 502
```

### OAuth Endpoint
```
HTTP/2 502 
```

---

## Recent Changes

- **2025-10-15:** Implemented Google OAuth authentication
- **2025-10-15:** Configured Cloudflare Tunnel (bracketiq.win)
- **2025-10-15:** Added session management with 30-day expiration
- **2025-10-15:** Protected all admin endpoints
- **2025-10-15:** Updated all documentation with Cloudflare domains

---

## Next Steps

### Immediate
1. Test complete OAuth flow
2. Fix frontend Vite configuration  
3. Verify first admin user creation

### Upcoming
1. Build frontend admin UI
2. Implement score entry interface
3. Add tournament seeding UI

---

**Note:** This is an automatically generated snapshot. For detailed documentation, see:
- [AUTHENTICATION_SETUP.md](../../AUTHENTICATION_SETUP.md)
- [DEPLOYMENT.md](DEPLOYMENT.md)
- [docs/AUTHENTICATION.md](docs/AUTHENTICATION.md)
