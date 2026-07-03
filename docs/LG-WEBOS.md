# LG webOS Setup

Play your Put.io library on an LG TV with the Stremio app.

## Requirements

- PC running the addon (`npm run dev`)
- HTTPS tunnel for install (`npm run tunnel`) — same as Android
- LG TV and PC on the **same Wi‑Fi**
- Stremio **Theater** app installed on the TV (LG Content Store)

## 1. Install the addon on the TV

The LG app cannot install addons from a URL. Use account sync:

1. Terminal 1: `npm run dev`
2. Terminal 2: `npm run tunnel`
3. Copy the printed `https://....trycloudflare.com/manifest.json` URL
4. Install it in [Stremio Web](https://web.strem.io) or Stremio Desktop (logged in)
5. Open Stremio on the LG TV — **same account**
6. Go to **Addons → Community → Installed** — **Put.io Library** should appear

## 2. Play content

1. Open **Put.io Series** or **Put.io Movies**
2. Pick a title → **Play**
3. On LG TV, choose **Put.io MP4 (TV / webOS)** when available — best compatibility
4. Use **Put.io Original (MKV)** only if MP4 is not listed

## 3. MP4 vs MKV on LG

LG uses its **built-in media player**. Large MKV/remux files often fail with *"Video is not supported"*.

| Stream | When to use |
|--------|-------------|
| **Put.io MP4 (TV / webOS)** | LG TV — Put.io transcoded H.264/AAC |
| **Put.io Original (MKV)** | Desktop/Android — full quality |

MP4 appears when Put.io has finished converting the file (`is_mp4_available`). You can trigger conversion in Put.io: file → **Convert to MP4**.

## 4. Optional: Stremio Streaming Server (Desktop)

For difficult files, run **Stremio Desktop** on your PC and enable the streaming server:

1. Stremio Desktop → **Settings → Streaming**
2. Enable **Remote HTTPS connections** / streaming server
3. Note the URL (e.g. `http://192.168.x.x:11470`)
4. On LG Stremio → Settings → set **Streaming server URL** to that address

The PC transcodes video the TV cannot play directly.

## 5. Subtitles on LG

**Put.io Library v0.11+** serves external VTT subtitles from your Put.io account (folder subs, MKV tracks, etc.). Configure preferred languages in [Put.io settings](https://app.put.io/settings).

Install the addon via the **same HTTPS tunnel** as Android (not `127.0.0.1`). Subtitle URLs are direct HTTPS to the addon proxy (`/v1/subtitles/{fileId}/{key}.vtt`) — no Stremio Desktop `11470` wrap on TV.

Embedded PGS subtitles inside MKV still often fail on webOS — use Put.io's external VTT when possible. Manual HE-on-LG verification is still pending.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Addon missing on TV | Re-sync: reinstall via Web, restart Stremio on TV |
| Empty catalog | Run `npm run scan` + `npm run enrich` on PC |
| "Video is not supported" | Pick **Put.io MP4** stream; convert file in Put.io |
| Large remux fails | Use 1080p encode, not 40GB+ remux |
| Tunnel expired | Restart `npm run tunnel`, reinstall addon in Web |

## Quick checklist

- [ ] `npm run dev` running
- [ ] `npm run tunnel` running
- [ ] Addon installed via Web + synced to TV
- [ ] Playing from **Put.io** catalogs (not Cinemeta)
- [ ] Using **MP4** stream on TV when available
