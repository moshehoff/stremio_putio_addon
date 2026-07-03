# Put.io → Stremio Addon

Stream your Put.io library in Stremio — **one catalog per top-level Put.io folder**.

**Current addon version:** `0.11.0`

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
| `http://127.0.0.1:7000/configure` | Connect Put.io (paste token, OAuth, or OOB for TV) |
| `http://127.0.0.1:7000/health` | Health check + install URLs (`desktop`, `android`, `public`) |
| `http://127.0.0.1:7000/u/default/manifest.json` | Per-user manifest |

## v0.11.0 highlights

- **Put.io subtitles** — `subtitles` resource + inline on streams; signed VTT proxy (`/v1/subtitles/{fileId}/{key}.vtt`)
- **Desktop CC fix** — Stremio Desktop calls `/subtitles/{type}/{id}/{extra}.json` with `filename` + `videoSize`; both routes are registered
- **Language codes** — ISO 639-1 (`en`, `he`); optional `name` on each track
- **Relevant-track filter** — drops unrelated Put.io/FLHD noise when title tokens match
- **No OpenSubtitles** — only subtitles already on Put.io (folder / MKV / Put.io sources)
- **Folder-name fallback** — gibberish filenames (`flhd-pap.mkv`) parse from parent folder (`Pride.And.Prejudice.2005…`)
- **`PUBLIC_BASE_URL`** — optional public origin for stream/subtitle links; loopback installs keep `127.0.0.1` (no auto LAN rewrite)
- **Desktop loopback wrap** — local installs route subtitle URLs through Stremio’s `11470/subtitles.vtt?from=`; tunnel/Android use direct HTTPS
- **API request logs** — `npm run dev` prints each request/response to the terminal

## v0.10.0 highlights

- **Events sync** — auto-scan polls Put.io events; full resync every 24h
- **OAuth** — refresh tokens, OOB sign-in (`/oauth/oob/start`), per-user manifest
- **Parser** — BlazeAnime `[Tag] Show - 01` filenames; stale library cleanup

## Install in Stremio

### Desktop (PC) — local

```
http://127.0.0.1:7000/manifest.json
```

Use `127.0.0.1` — not `localhost` (Stremio Desktop fails to fetch on localhost).

### Desktop or Android via tunnel (HTTPS)

Stremio on Android **blocks HTTP** addon URLs. Desktop can use the same tunnel (recommended if you also use phone/TV):

1. Install [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
2. Terminal 1: `npm run dev`
3. Terminal 2: `npm run tunnel`
4. Copy the printed `https://....trycloudflare.com/manifest.json` URL
5. Optional: set `PUBLIC_BASE_URL` in `.env` to the same HTTPS URL (stable stream/subtitle links when requests hit loopback)
6. Install in [Stremio Web](https://web.strem.io) or Desktop (logged in)
7. Open Stremio on Android — same account — addon syncs automatically

**Subtitles:** Desktop requests `/subtitles/movie/{id}/filename=…&videoSize=….json` — the addon must answer that path (v0.11+). Watch `npm run dev` logs for `→ 200` on that route.

**Important:** Do not install with `127.0.0.1` on desktop and expect Android to work — use the tunnel or LAN URL from `/health`.

### LG webOS (same HTTPS install as Android)

The LG Stremio app cannot paste addon URLs. Install via **Stremio Web** + account sync, then on TV pick **Put.io MP4 (TV / webOS)** streams when available. External VTT subtitles from Put.io should appear when configured in your Put.io account.

See **[docs/LG-WEBOS.md](docs/LG-WEBOS.md)** for full TV setup and troubleshooting.

### Android (LAN — HTTP, often blocked by Stremio)

LAN install only works if your Stremio version allows HTTP on local IPs:

1. `npm run dev`
2. Open `http://127.0.0.1:7000/health` — copy `install.android` or set `PUBLIC_BASE_URL=http://192.168.x.x:7000`
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
packages/shared/   Config, logger, errors, token crypto, PUBLIC_BASE_URL
packages/db/       Scan, parse, folder catalogs, OAuth, subtitles
prisma/            Database schema
docs/SDD-FULL.md   Full specification + implementation changelog
```

## Roadmap

| Status | Item |
|--------|------|
| Done | Folder catalogs, TMDb enrich, OAuth, events sync, Put.io subtitles |
| Planned | Cloud VPS deploy — see `docs/SDD-FULL.md` §14.4 (M10) |
| Cancelled | OpenSubtitles integration, duplicate-movie dedupe, dedicated unmatched catalog |
