# Put.io → Stremio Addon

Stream your Put.io library in Stremio.

## Prerequisites

- Node.js 22+
- Docker Desktop
- Put.io OAuth token (for M1+)

## Quick start (M0)

```bash
# 1. Infrastructure
docker compose up -d

# 2. Install dependencies
npm install

# 3. Database
npm run db:generate
npm run db:push

# 4. Scan Put.io library (M1)
npm run scan:dry    # list only, no DB write
npm run scan        # save files to database

# 5. Enrich metadata (M4) — requires TMDB_API_KEY in .env
npm run enrich

# 6. Run API
npm run dev

# 7. (Android) HTTPS tunnel — in a second terminal
npm run tunnel

# 8. Tests
npm test
```

## Endpoints

| URL | Description |
|-----|-------------|
| `http://127.0.0.1:7000/manifest.json` | Stremio addon manifest (Desktop) |
| `http://127.0.0.1:7000/health` | Health check + Android install URL |

## Install in Stremio

### Desktop (PC)

```
http://127.0.0.1:7000/manifest.json
```

Use `127.0.0.1` — not `localhost` (Stremio Desktop fails to fetch on localhost).

### Android (requires HTTPS)

Stremio on Android **blocks HTTP** addon URLs. Use a Cloudflare Tunnel:

1. Install [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
2. Terminal 1: `npm run dev`
3. Terminal 2: `npm run tunnel`
4. Copy the printed `https://....trycloudflare.com/manifest.json` URL
5. Install in [Stremio Web](https://web.strem.io) or Desktop (logged in)
6. Open Stremio on Android — same account — addon syncs automatically

Stream URLs use the tunnel host automatically (via request Host header).

### Android (LAN — HTTP, often blocked by Stremio)

LAN install only works if your Stremio version allows HTTP on local IPs:

1. `npm run dev`
2. Open `http://127.0.0.1:7000/health` — copy `install.android`
3. Same Wi‑Fi as PC; allow Windows Firewall port **7000**

## Project structure

```
apps/api/          Fastify + Stremio routes
packages/shared/   Config, logger, errors
prisma/            Database schema
docs/SDD-FULL.md   Full specification
```

## Roadmap

See `docs/SDD-FULL.md` — MVP: series catalog + play on Android (M0–M3).
