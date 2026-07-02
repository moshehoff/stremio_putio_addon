# Put.io → Stremio Addon

Stream your Put.io library in Stremio — **one catalog per top-level Put.io folder** (v0.8+).

**Current addon version:** `0.9.0`

## Prerequisites

- Node.js 22+
- Docker Desktop
- Put.io OAuth token (save via `/configure` — see below)

## Quick start

```bash
# 1. Infrastructure
docker compose up -d

# 2. Install dependencies
npm install

# 3. Database
npm run db:generate
npm run db:push

# 4. Connect Put.io (pick one)
#    A) Open http://127.0.0.1:7000/configure and paste your OAuth token
#    B) Optional fallback: PUTIO_TOKEN in .env

# 5. Scan Put.io library
npm run scan:dry    # list only, no DB write
npm run scan        # save files to database

# 6. Enrich metadata — requires TMDB_API_KEY in .env
npm run enrich

# 7. Run API
npm run dev

# 8. (Android) HTTPS tunnel — in a second terminal
npm run tunnel

# 9. Tests
npm test
```

## Endpoints

| URL | Description |
|-----|-------------|
| `http://127.0.0.1:7000/manifest.json` | Stremio addon manifest (dynamic — one catalog per top-level folder) |
| `http://127.0.0.1:7000/configure` | Connect Put.io (paste token or OAuth) |
| `http://127.0.0.1:7000/health` | Health check + Android install URL |

## v0.9.0 highlights

- **BlazeAnime parser** — `One Punch Man - 01 [1080p]...` style filenames
- **Unique episode IDs** — `putio:episode:{fileId}` (no duplicate SxxExx collisions)
- **Shorter cache** — manifest & catalog refresh every 5 minutes
- **Auto-scan** — `AUTO_SCAN_INTERVAL_MINUTES=5` (set `0` to disable)
- **OAuth / configure** — token stored encrypted in DB; `PUTIO_TOKEN` in `.env` is optional fallback only

## Install in Stremio

### Desktop (PC)

```
http://127.0.0.1:7000/manifest.json
```

Use `127.0.0.1` — not `localhost` (Stremio Desktop fails to fetch on localhost).

### Android (requires HTTPS)

Stremio on Android **blocks HTTP** addon URLs. Use a Cloudflare Tunnel:

1. Install [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) (or use the exe in Downloads — auto-detected)
2. Terminal 1: `npm run dev`
3. Terminal 2: `npm run tunnel`
4. Copy the printed `https://....trycloudflare.com/manifest.json` URL
5. Install in [Stremio Web](https://web.strem.io) or Desktop (logged in)
6. Open Stremio on Android — same account — addon syncs automatically

Stream URLs use the tunnel host automatically (via request Host header).

### LG webOS (same HTTPS install as Android)

The LG Stremio app cannot paste addon URLs. Install via **Stremio Web** + account sync, then on TV pick **Put.io MP4 (TV / webOS)** streams when available.

See **[docs/LG-WEBOS.md](docs/LG-WEBOS.md)** for full TV setup and troubleshooting.

### Android (LAN — HTTP, often blocked by Stremio)

LAN install only works if your Stremio version allows HTTP on local IPs:

1. `npm run dev`
2. Open `http://127.0.0.1:7000/health` — copy `install.android`
3. Same Wi‑Fi as PC; allow Windows Firewall port **7000**

## CLI helpers

| Command | Description |
|---------|-------------|
| `npm run scan` | Full Put.io scan + parse |
| `npm run unmatched` | List unmatched files |
| `npx tsx apps/cli/src/save-token.ts` | Migrate token from `.env` to DB |
| `npx tsx apps/cli/src/list-catalogs.ts` | List catalogs + folder paths |

## Project structure

```
apps/api/          Fastify + Stremio routes
packages/shared/   Config, logger, errors, token crypto
packages/db/       Scan, parse, folder catalogs, OAuth token
prisma/            Database schema
docs/SDD-FULL.md   Full specification + implementation changelog
```

## Roadmap

See `docs/SDD-FULL.md` — M7 (OAuth/configure) partially done in v0.9.0.
