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

# 5. Run API
npm run dev

# 6. Tests
npm test
```

## Endpoints

| URL | Description |
|-----|-------------|
| `http://localhost:7000/manifest.json` | Stremio addon manifest |
| `http://localhost:7000/health` | Health check |

## Install in Stremio (Android / Desktop)

Use your PC LAN IP when testing from phone:

```
http://192.168.x.x:7000/manifest.json
```

Set `BASE_URL` in `.env` to the same address.

## Project structure

```
apps/api/          Fastify + Stremio routes
packages/shared/   Config, logger, errors
prisma/            Database schema
docs/SDD-FULL.md   Full specification
```

## Roadmap

See `docs/SDD-FULL.md` — MVP: series catalog + play on Android (M0–M3).
