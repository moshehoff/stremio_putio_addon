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

# 7. Tests
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

### Android (same Wi‑Fi as PC)

1. Start the API: `npm run dev`
2. Open `http://127.0.0.1:7000/health` on the PC — copy `install.android`
3. On the phone, in Stremio → Addons → paste that URL (e.g. `http://192.168.1.42:7000/manifest.json`)
4. Phone and PC must be on the **same Wi‑Fi**

Stream URLs are built from the client’s Host header, so Android gets LAN proxy links automatically.

### Windows Firewall

If the phone cannot reach the addon, allow inbound TCP **7000** for Node.js (Private network).

## Project structure

```
apps/api/          Fastify + Stremio routes
packages/shared/   Config, logger, errors
prisma/            Database schema
docs/SDD-FULL.md   Full specification
```

## Roadmap

See `docs/SDD-FULL.md` — MVP: series catalog + play on Android (M0–M3).
