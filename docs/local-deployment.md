# Dispatcher Local Deployment Guide

Run a fully self-contained Dispatcher instance on your machine with Docker.
No external databases, no cloud accounts — just Docker Desktop and two commands.

---

## Prerequisites

| Requirement | Details |
|---|---|
| **Docker Desktop** | Installed and **running** — [Get Docker Desktop](https://www.docker.com/products/docker-desktop/) |
| **Git** | To clone the repository |
| **~2 GB disk** | For Docker images (first build) |
| **Ports 80 and 3001** | Must be free on your machine |

> **Note:** Node.js and pnpm are _not_ required to run Dispatcher in Docker. You only need them if you want to use the convenience scripts (`pnpm docker:local:*`) or connect the MCP server.

---

## Quick Start

```bash
# 1. Clone the repository
git clone <repo-url>
cd Dispatcher

# 2. Build and start everything
docker-compose -f docker-compose.local.yml up -d --build
```

That's it. Wait ~60 seconds for the first build, then open **http://localhost** in your browser.

**Default credentials:**

| Field | Value |
|---|---|
| Email | `admin@dispatcher.dev` |
| Password | `Password123!` |

---

## What Happens on First Boot

When the API container starts for the first time, the entrypoint script (`packages/api/docker-entrypoint-local.sh`) runs these steps automatically:

1. **Schema push** — Prisma creates all SQLite tables in `/app/data/dispatcher.db` (idempotent; safe on every restart)
2. **Seed data** — Creates the admin user, Engineering team, default workflow statuses, and built-in templates
3. **Sentinel file** — Writes `/app/data/.seeded` so seeding only runs once

On subsequent starts, the schema push still runs (harmless) but seeding is skipped.

---

## Accessing Dispatcher

| Service | URL | Description |
|---|---|---|
| **Web UI** | [http://localhost](http://localhost) | Main application (nginx → Next.js static build) |
| **API** | [http://localhost:3001](http://localhost:3001) | REST API (Node.js + Express) |
| **Health check** | [http://localhost:3001/api/health](http://localhost:3001/api/health) | Returns `200 OK` when the API is ready |

The web container (nginx) proxies `/api/*` requests to the API container, so both services work together seamlessly from port 80.

---

## Remote Access via Tailscale

You can expose Dispatcher securely to your phone or other devices using [Tailscale](https://tailscale.com) — no firewall changes or port forwarding required.

### Prerequisites

- Tailscale installed and authenticated on the host machine
- Tailscale installed and authenticated on the remote device (phone, laptop, etc.)

### Setup

```bash
# Expose Dispatcher on port 8443 via Tailscale HTTPS
tailscale serve --bg --https=8443 http://127.0.0.1:80
```

Dispatcher is now accessible from any device on your Tailscale network at:

```
https://<your-machine-name>.<tailnet>.ts.net:8443
```

Tailscale provides a valid HTTPS certificate automatically — no manual TLS setup required.

### Finding your Tailscale hostname

```bash
tailscale status
```

The hostname shown (e.g. `my-mac-mini.tail1234ab.ts.net`) is your stable address. It does not change on re-authentication, unlike Tailscale IP addresses (which can change). Always use the hostname, not the IP.

### Verify it's working

```bash
tailscale serve status
```

You should see both the gateway (port 443) and Dispatcher (port 8443) listed.

### Disabling remote access

```bash
tailscale serve --https=8443 off
```

---

## Connecting the MCP Server

The MCP server runs on your **host machine** (not inside Docker). It connects to the Dockerized API over `localhost:3001`.

```bash
npx @dispatcher/mcp-server --api-url http://localhost:3001
```

Or configure it in your Claude Code / Copilot MCP settings to point at `http://localhost:3001`.

> **Prerequisite:** Node.js 20+ must be installed on your host for the MCP server. Docker alone isn't enough for this step.

---

## Data Persistence

All data lives in a Docker **named volume** called `dispatcher-data`, mounted at `/app/data/` inside the API container.

| Action | Command | Effect |
|---|---|---|
| **Stop & restart** | `docker-compose -f docker-compose.local.yml down` then `up -d` | Data is preserved ✅ |
| **Full reset** | `docker-compose -f docker-compose.local.yml down -v` | Volume deleted, data wiped 🗑️ |

After a reset the next `up` triggers a fresh seed automatically.

---

## Convenience Scripts

If you have Node.js and pnpm installed, use these from the repo root:

| Command | Description |
|---|---|
| `pnpm docker:local:up` | Build images and start containers |
| `pnpm docker:local:down` | Stop containers (preserves data) |
| `pnpm docker:local:logs` | Tail logs from all services |
| `pnpm docker:local:reset` | Stop containers **and delete all data** |

These are thin wrappers around `docker-compose -f docker-compose.local.yml ...`.

---

## Architecture

```
┌─────────────────┐        ┌──────────────────┐
│  Web (nginx)    │───────▶│  API (Node.js)   │
│  port 80        │        │  port 3001       │
└─────────────────┘        └────────┬─────────┘
                                    │
                             ┌──────▼─────────┐
                             │  SQLite DB      │
                             │  /app/data/     │
                             │  dispatcher.db    │
                             └────────────────┘
                             Named volume:
                             dispatcher-data
```

- **Web** — nginx serves the pre-built Next.js frontend and reverse-proxies API calls
- **API** — Node.js/Express backend with Prisma ORM
- **SQLite** — Single-file database, no external server needed
- The MCP server runs on the **host**, not inside Docker

---

## Troubleshooting

### Port 80 already in use

Another process (e.g. Apache, IIS, or another Docker container) is using port 80.

```bash
# Find what's on port 80
lsof -i :80          # macOS/Linux
netstat -ano | findstr :80  # Windows

# Option A: Stop the conflicting process
# Option B: Change the web port in docker-compose.local.yml
#   ports:
#     - "8080:80"    # then access via http://localhost:8080
```

### Port 3001 already in use

If you're running the API in dev mode (`pnpm dev`) it also binds port 3001.

```bash
# Stop the dev server, or change the Docker port:
#   ports:
#     - "3002:3001"
# Then update CORS_ORIGIN if needed.
```

### Slow first build

The first `docker-compose ... --build` downloads base images and installs all dependencies. This can take 2–5 minutes depending on your internet connection. Subsequent rebuilds are much faster thanks to Docker layer caching.

### 502 Bad Gateway on first load

The web container starts immediately, but the API container needs ~15–30 seconds for schema push and seeding. Nginx returns a 502 until the API health check passes.

**Fix:** Wait 30 seconds and refresh. You can watch progress with:

```bash
docker-compose -f docker-compose.local.yml logs -f api
```

Look for `Starting Dispatcher API...` — once you see that, the UI should be ready.

### Seed failures

If seeding fails (e.g., interrupted first boot), the sentinel file won't exist and seeding retries on the next start. If you see persistent errors:

```bash
# Full reset — wipes data and re-seeds from scratch
docker-compose -f docker-compose.local.yml down -v
docker-compose -f docker-compose.local.yml up -d --build
```

### WSL2 tips (Windows)

- Ensure Docker Desktop is configured to use the **WSL 2 backend**
- Run commands from a WSL2 terminal (Ubuntu) for best performance
- If `localhost` doesn't resolve, try `127.0.0.1` instead
- File system performance is best when the repo lives inside the WSL2 filesystem (`/home/...`), not on a mounted Windows drive (`/mnt/c/...`)

---

## Useful Commands

```bash
# View container status
docker-compose -f docker-compose.local.yml ps

# Follow logs (all services)
docker-compose -f docker-compose.local.yml logs -f

# Follow logs (API only)
docker-compose -f docker-compose.local.yml logs -f api

# Open a shell in the API container
docker-compose -f docker-compose.local.yml exec api sh

# Inspect the SQLite database inside the container
docker-compose -f docker-compose.local.yml exec api npx prisma studio

# Restart just the API (e.g. after config change)
docker-compose -f docker-compose.local.yml restart api

# Rebuild a single service
docker-compose -f docker-compose.local.yml up -d --build api
```
