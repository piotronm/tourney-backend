# SQLite Database Viewer - Setup & Usage Guide

**Version:** 1.0.0  
**Last Updated:** October 16, 2025  
**Tool:** sqlite-web by Charles Leifer

---

## Overview

This guide documents how to view and interact with the Tournament Manager SQLite database using **sqlite-web**, a browser-based database viewer. This tool provides a clean web interface for browsing tables, running queries, and exporting data without needing a desktop application.

---

## Database Information

### Location
```
~/eztourneyz/backend/apps/api/data/tournament.db
```

### Technology
- **Database Engine:** SQLite 3
- **ORM:** Drizzle ORM
- **Schema File:** `~/eztourneyz/backend/apps/api/src/db/schema.ts`

### Database Schema Overview

The database contains the following main tables:

#### Core Tables
- **`divisions`** - Tournament divisions/brackets
- **`teams`** - Team registrations
- **`pools`** - Pool groupings within divisions
- **`pool_memberships`** - Team assignments to pools
- **`matches`** - Match schedules and results

#### Supporting Tables
- **`users`** - User accounts
- **`sessions`** - Authentication sessions
- **`__drizzle_migrations`** - Schema version tracking

---

## sqlite-web Installation

### Prerequisites
- Ubuntu/Debian Linux
- Python 3.8+
- pipx (Python application installer)

### Installation Steps

#### 1. Install pipx (if not already installed)
```bash
sudo apt update
sudo apt install pipx
```

#### 2. Configure pipx PATH
```bash
pipx ensurepath
```

**Important:** After running `ensurepath`, you must either:
- Open a new terminal tab/window, OR
- Run: `source ~/.zshrc` (if using zsh) or `source ~/.bashrc` (if using bash)

#### 3. Install sqlite-web
```bash
pipx install sqlite-web
```

#### 4. Verify Installation
```bash
sqlite_web --version
```

### Installation Location
- **Executable:** `~/.local/bin/sqlite_web`
- **Virtual Environment:** `~/.local/pipx/venvs/sqlite-web/`

---

## Usage

### Starting sqlite-web

#### Foreground (Terminal stays open)
```bash
cd ~/eztourneyz/backend/apps/api
sqlite_web data/tournament.db --host 0.0.0.0 --port 8080
```

**Output:**
```
 * Running on http://127.0.0.1:8080
 * Running on http://192.168.68.58:8080
Press CTRL+C to quit
```

#### Background (Terminal can be closed)
```bash
cd ~/eztourneyz/backend/apps/api
nohup sqlite_web data/tournament.db --host 0.0.0.0 --port 8080 > ~/sqlite-web.log 2>&1 &
```

**Save the PID for later:**
```bash
echo $! > ~/sqlite-web.pid
```

### Accessing the Web Interface

**Via Tailscale (from any device on Tailscale network):**
```
http://100.125.100.17:8080
```

**Via Local Network:**
```
http://192.168.68.58:8080
```

**From the server itself:**
```
http://localhost:8080
```

### Stopping sqlite-web

#### If running in foreground:
Press `Ctrl+C` in the terminal

#### If running in background:
```bash
# Method 1: Using saved PID
kill $(cat ~/sqlite-web.pid)
rm ~/sqlite-web.pid

# Method 2: Find and kill manually
ps aux | grep sqlite_web
kill <PID>
```

### Checking if sqlite-web is Running
```bash
# Check process
ps aux | grep sqlite_web

# Check port
lsof -i :8080

# Test connection
curl -I http://localhost:8080
```

---

## Features & Capabilities

### 1. Browse Tables
- View all tables in the database
- See table schemas (columns, types, indexes)
- Browse table data with pagination
- Sort columns ascending/descending

### 2. Run SQL Queries
- Execute custom SELECT queries
- View query results in table format
- Export query results
- **Note:** sqlite-web is read-only by default (safe for production)

#### Example Queries

**View all divisions:**
```sql
SELECT id, name, createdAt 
FROM divisions 
ORDER BY createdAt DESC;
```

**View team standings in a pool:**
```sql
SELECT 
  t.name as team,
  pm.poolSeed,
  p.label as pool
FROM pool_memberships pm
JOIN teams t ON pm.teamId = t.id
JOIN pools p ON pm.poolId = p.id
WHERE p.divisionId = 'YOUR_DIVISION_ID'
ORDER BY pm.poolSeed;
```

**View completed matches:**
```sql
SELECT 
  m.id,
  t1.name as team1,
  t2.name as team2,
  m.scoreJson,
  m.status,
  m.scheduledAt
FROM matches m
LEFT JOIN teams t1 ON m.team1Id = t1.id
LEFT JOIN teams t2 ON m.team2Id = t2.id
WHERE m.status = 'FINAL'
ORDER BY m.scheduledAt DESC;
```

### 3. Export Data
- Export tables to CSV format
- Export query results
- Useful for reports, analysis, backups

### 4. View Database Metadata
- See database size
- View table row counts
- Inspect indexes
- View foreign key relationships

---

## Configuration Options

### Command Line Options

```bash
sqlite_web [OPTIONS] DATABASE_PATH
```

**Common Options:**
- `--host HOST` - Bind to specific host (default: 127.0.0.1)
  - Use `0.0.0.0` to allow external connections
- `--port PORT` - Port to listen on (default: 8080)
- `--read-only` - Prevent any database modifications (recommended for production)
- `--url-prefix PREFIX` - URL prefix for reverse proxy setups
- `--password PASSWORD` - Require password for access
- `--no-browser` - Don't auto-open browser

**Example with read-only and password:**
```bash
sqlite_web data/tournament.db \
  --host 0.0.0.0 \
  --port 8080 \
  --read-only \
  --password "your-secure-password"
```

---

## Security Considerations

### ⚠️ Important Security Notes

1. **Network Exposure**
   - Using `--host 0.0.0.0` exposes sqlite-web to your network
   - Only use on trusted networks (Tailscale, local network)
   - **Never expose to public internet without authentication**

2. **Production Usage**
   - Always use `--read-only` flag in production
   - Consider using `--password` for additional security
   - Run behind a reverse proxy with authentication

3. **Sensitive Data**
   - The database may contain user emails, session tokens, etc.
   - Only give access to authorized developers/admins
   - Use password protection if sharing access

### Recommended Production Command
```bash
sqlite_web data/tournament.db \
  --host 0.0.0.0 \
  --port 8080 \
  --read-only \
  --password "$(openssl rand -base64 12)"
```

---

## Troubleshooting

### Issue: "command not found: sqlite_web"

**Cause:** PATH not updated or pipx not installed correctly

**Fix:**
```bash
# Reload shell config
source ~/.zshrc  # or ~/.bashrc

# If still not found, reinstall
pipx install sqlite-web --force
```

### Issue: "Address already in use"

**Cause:** Port 8080 is already taken

**Fix:**
```bash
# Use a different port
sqlite_web data/tournament.db --host 0.0.0.0 --port 8081

# Or find and kill process using port 8080
lsof -ti :8080 | xargs kill
```

### Issue: "unable to open database file"

**Cause:** Incorrect database path or permission issues

**Fix:**
```bash
# Verify database exists
ls -la ~/eztourneyz/backend/apps/api/data/tournament.db

# Check permissions
chmod 644 ~/eztourneyz/backend/apps/api/data/tournament.db

# Use absolute path
sqlite_web ~/eztourneyz/backend/apps/api/data/tournament.db --host 0.0.0.0 --port 8080
```

### Issue: Browser shows blank page

**Cause:** CSS/JS not loading properly

**Fix:**
- Check browser console for errors (F12)
- Try a different browser
- Clear browser cache
- Reinstall sqlite-web: `pipx reinstall sqlite-web`

### Issue: Can't access from other devices

**Cause:** Firewall blocking port or incorrect host binding

**Fix:**
```bash
# Ensure binding to 0.0.0.0
sqlite_web data/tournament.db --host 0.0.0.0 --port 8080

# Check if port is open
sudo ufw status
sudo ufw allow 8080/tcp  # If needed
```

---

## Alternative Tools

If sqlite-web doesn't meet your needs, consider these alternatives:

### 1. VS Code SQLite Viewer Extension
**Best for:** Developers already using VS Code via SSH

**Installation:**
1. Press `Ctrl+Shift+X` in VS Code
2. Search: "SQLite Viewer" (by alexcvzz)
3. Install
4. Right-click `tournament.db` → "Open with SQLite Viewer"

**Pros:**
- No separate server needed
- Integrated into development environment
- Fast and responsive

### 2. DBeaver (Desktop Application)
**Best for:** Advanced database work, multiple databases

**Installation:**
```bash
# Download from https://dbeaver.io/download/
# Or via snap
sudo snap install dbeaver-ce
```

**Pros:**
- Full-featured database IDE
- ER diagrams
- Advanced query tools
- Multi-database support

### 3. DB Browser for SQLite
**Best for:** Visual database design, schema editing

**Installation:**
```bash
sudo apt install sqlitebrowser
```

**Pros:**
- Visual table designer
- Import/export wizards
- Data plotting

---

## Development Workflow Integration

### Quick View During Development
```bash
# Add alias to ~/.zshrc or ~/.bashrc
alias viewdb='sqlite_web ~/eztourneyz/backend/apps/api/data/tournament.db --host 0.0.0.0 --port 8080 --read-only'

# Then just run:
viewdb
```

### Integration with npm Scripts

Add to `backend/apps/api/package.json`:
```json
{
  "scripts": {
    "db:view": "sqlite_web data/tournament.db --host 0.0.0.0 --port 8080 --read-only",
    "db:view:bg": "nohup sqlite_web data/tournament.db --host 0.0.0.0 --port 8080 > sqlite-web.log 2>&1 &"
  }
}
```

Then use:
```bash
pnpm db:view
```

### Automated Startup (Optional)

Create a systemd service to auto-start sqlite-web:

**File:** `/etc/systemd/system/sqlite-web-tournament.service`
```ini
[Unit]
Description=SQLite Web Viewer for Tournament Manager
After=network.target

[Service]
Type=simple
User=piouser
WorkingDirectory=/home/piouser/eztourneyz/backend/apps/api
ExecStart=/home/piouser/.local/bin/sqlite_web data/tournament.db --host 0.0.0.0 --port 8080 --read-only
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

**Enable:**
```bash
sudo systemctl enable sqlite-web-tournament
sudo systemctl start sqlite-web-tournament
sudo systemctl status sqlite-web-tournament
```

---

## Developer Onboarding Checklist

For new developers joining the project:

- [ ] Install pipx: `sudo apt install pipx`
- [ ] Configure PATH: `pipx ensurepath` then restart terminal
- [ ] Install sqlite-web: `pipx install sqlite-web`
- [ ] Test access: `sqlite_web --version`
- [ ] Start viewer: `sqlite_web ~/eztourneyz/backend/apps/api/data/tournament.db --host 0.0.0.0 --port 8080`
- [ ] Access in browser: http://100.125.100.17:8080
- [ ] Review database schema: Click through all tables
- [ ] Try sample queries (see "Example Queries" section above)
- [ ] Bookmark the viewer URL for future use

---

## Resources

### Official Documentation
- **sqlite-web GitHub:** https://github.com/coleifer/sqlite-web
- **SQLite Documentation:** https://www.sqlite.org/docs.html
- **Drizzle ORM:** https://orm.drizzle.team/

### Project-Specific
- **Database Schema:** `~/eztourneyz/backend/apps/api/src/db/schema.ts`
- **Migrations:** `~/eztourneyz/backend/apps/api/src/db/migrations/`
- **Frontend Overview:** `/FRONTEND_TECHNICAL_OVERVIEW.md`

---

## FAQ

**Q: Is sqlite-web safe for production?**  
A: Yes, especially with `--read-only` flag. However, never expose it publicly without authentication.

**Q: Can I modify data through sqlite-web?**  
A: By default, yes. Use `--read-only` flag to prevent modifications.

**Q: Will sqlite-web slow down my application?**  
A: No, it opens the database in read-only mode and doesn't interfere with the running application.

**Q: Can multiple people use sqlite-web at once?**  
A: Yes, sqlite-web supports concurrent connections.

**Q: How do I back up the database?**  
A: Simple: `cp data/tournament.db data/tournament.db.backup.$(date +%Y%m%d)`

**Q: Can I use this on Windows/Mac?**  
A: Yes! Install Python + pipx, then same commands work.

---

## Support

**Issues with sqlite-web tool:**  
https://github.com/coleifer/sqlite-web/issues

**Issues with our database/schema:**  
Contact the development team or check project documentation.

---

**Last Updated:** October 16, 2025  
**Maintained By:** Tournament Manager Development Team
