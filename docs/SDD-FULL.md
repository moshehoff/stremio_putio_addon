# Put.io → Stremio Catalog Platform
## מסמך איפיון מלא (SDD) — גרסה 1.1

**מטרה:** לאפשר למפתח לבנות תוסף Stremio שמציג את ספריית Put.io כקטלוגים, עם ניגון וכתוביות — בגישה איטרטיבית (MVP → features).

**קהל יעד:** מפתח/ת שמממש/ה את הפרויקט לפי שלבים.

**מקורות שנבדקו (2026-07-01):**
- [Stremio Addon Protocol](https://stremio.github.io/stremio-addon-sdk/protocol.html)
- [Stremio Manifest / Catalog / Meta / Stream / Subtitles](https://stremio.github.io/stremio-addon-sdk/api/)
- [Put.io API OAS 2.7.0 (community mirror)](https://gist.github.com/dskvr/bdcb4da5c8501bc01b06c6865aa941c4)
- [@putdotio/api-client (official JS SDK)](https://github.com/putdotio/putio-js)
- [Put.io OAuth Help](http://help.put.io/en/articles/5972538-how-to-get-an-oauth-token-from-put-io)
- [TMDb API](https://developer.themoviedb.org/)

---

## Implementation changelog (code)

| Addon version | תאריך | שינויים עיקריים |
|---------------|--------|------------------|
| **0.9.0** | 2026-07 | BlazeAnime parser (`Show - 01`); פרקים עם `putio:episode:{putioFileId}` (ללא התנגשויות); cache manifest/catalog 300s; auto-scan (`AUTO_SCAN_INTERVAL_MINUTES`); M7 חלקי — `/configure`, OAuth callback, `OAuthToken` מוצפן ב-DB, token מ-DB עם fallback ל-`PUTIO_TOKEN` |
| **0.8.0** | 2026-07 | **Folder → catalog:** קטלוג Stremio לכל תיקיית Put.io ברמת root; `putio_folder_{id}`; manifest דינמי מ-DB; `PutioFolder` + `PutioFile.rootFolderId`; סריקה בונה עץ תיקיות ומגלגלת תוכן מקונן; קטלוג מעורב (סדרות + סרטים + unsorted); series meta `putio:folder:{rootId}:series:{seriesKey}` |

---

## תוכן עניינים

1. [סיכום מנהלים](#1-סיכום-מנהלים)
   - [1.5 פרופיל פרויקט (בעלים)](#15-פרופיל-פרויקט-בעלים)
2. [הנחות עבודה מאומתות — Put.io](#2-הנחות-עבודה-מאומתות--putio)
3. [הנחות עבודה מאומתות — Stremio](#3-הנחות-עבודה-מאומתות--stremio)
4. [החלטות ארכיטקטוניות קריטיות](#4-החלטות-ארכיטקטוניות-קריטיות)
5. [מטרות לפי שלב (Roadmap)](#5-מטרות-לפי-שלב-roadmap)
6. [שכבה 0 — תשתית ופרויקט](#6-שכבה-0--תשתית-ופרויקט)
7. [שכבה 1 — Put.io Client & Auth](#7-שכבה-1--putio-client--auth)
8. [שכבה 2 — Indexer & Media Parser](#8-שכבה-2--indexer--media-parser)
9. [שכבה 3 — Metadata (TMDb)](#9-שכבה-3--metadata-tmdb)
10. [שכבה 4 — Stremio Presentation Layer](#10-שכבה-4--stremio-presentation-layer)
11. [שכבה 5 — Stream & Content Proxy](#11-שכבה-5--stream--content-proxy)
12. [שכבה 6 — Subtitles](#12-שכבה-6--subtitles)
13. [שכבה 7 — Smart Catalogs & Resume](#13-שכבה-7--smart-catalogs--resume)
14. [שכבה 8 — Multi-user & Production](#14-שכבה-8--multi-user--production)
15. [מודל נתונים (PostgreSQL)](#15-מודל-נתונים-postgresql)
16. [Cache & Workers](#16-cache--workers)
17. [בדיקות לכל שלב](#17-בדיקות-לכל-שלב)
18. [משימות מימוש — גרסה מינימלית ואיטרטיבית](#18-משימות-מימוש--גרסה-מינימלית-ואיטרטיבית)
19. [נספחים](#19-נספחים)

---

## 1. סיכום מנהלים

### 1.1 הבעיה

- **אין** תוסף Stremio קיים שמציג את **כל** ספריית Put.io הקיימת.
- Torrentio / MediaFusion משתמשים ב-Put.io כ-Debrid להזרמת תוכן שהם מוצאים — לא לגלישה בספרייה.
- על LG webOS, Stremio חלש בכתוביות (במיוחד embedded / PGS) — ראו [Stremio bugs #813](https://github.com/Stremio/stremio-bugs/issues/813), [#1564](https://github.com/Stremio/stremio-bugs/issues/1564).

### 1.2 הפתרון

שרת backend ש:
1. סורק את Put.io ומאנדקס קבצי וידאו.
2. מזהה סרטים/פרקים לפי שם קובץ (+ TMDb ל-metadata).
3. מגיש קטלוגים בפרוטוקול Stremio (`catalog` → `meta` → `stream` → `subtitles`).
4. **מפרוקסי** את הזרם (חובה — ראו §2.5) כי Put.io מגביל URLs לפי IP.

### 1.3 מה **לא** לבנות

| רעיון | למה לא |
|-------|--------|
| עץ תיקיות ב-Stremio | Stremio לא תומך ב-file browser; רק Catalog/Meta |
| קריאות TMDb בזמן real-time על כל request | איטי; חייב index + cache |
| להעביר URL ישיר מ-Put.io ל-LG TV | URL מוגבל ל-IP שביקש אותו |
| להסתמך על prefix `tt` בלי TMDb | Stremio יצפה ל-Cinemeta; חייב meta משלנו |
| SQLite ל-production multi-user | SDD מקורי; PostgreSQL עדיף |

### 1.4 Stack מומלץ (מאומת)

| רכיב | בחירה | סיבה |
|------|--------|------|
| Runtime | Node.js 22 LTS | תואם stremio-addon-sdk |
| Language | TypeScript strict | חוזים, DI, בדיקות |
| HTTP | Fastify | מהיר, schema validation |
| ORM | Prisma | migrations, types |
| DB | PostgreSQL 16 | multi-user, JSONB |
| Queue | BullMQ + Redis | workers |
| Put.io SDK | `@putdotio/api-client` | רשמי, OAuth, Files API |
| Stremio | `stremio-addon-sdk` | פרוטוקול + CORS |
| Validation | zod | DTOs |
| Tests | Vitest + supertest | unit + integration |
| Parser | `parse-torrent-title` | שמות release |
| Metadata | TMDb API v3 | posters, overview |
| Python (אופציונלי, שלב מאוחר) | FastAPI + GuessIt | parsing מתקדם |

### 1.5 פרופיל פרויקט (בעלים)

> עודכן לאחר שאלון עם בעל הפרויקט — 2026-07-01

| פרמטר | החלטה | השפעה על המימוש |
|--------|--------|-----------------|
| **Deployment** | PC בבית → **בעתיד** ענן (VPS + HTTPS) | MVP: `http://{LAN_IP}:7000`; מעבר לענן ב-M7+ |
| **גודל ספרייה** | 200–1,000 קבצי וידאו | `parent_id=-1` scan מספיק; אין צורך ב-optimization מוקדם |
| **ארגון Put.io** | תיקיות לפי **שמות משתמשים**, קבצי torrent בפנים | כל **תיקיית root** (ילד ישיר של Put.io root) → **קטלוג Stremio נפרד** |
| **קטלוג Stremio** | **קטלוג לכל תיקיית root** (v0.8.0) | `putio_folder_{rootFolderId}` — תוכן מקונן מתגלגל לתוך הקטלוג של ה-root |
| **מכשירי יעד** | **1.** אנדרואיד (טלפון) **2.** LG webOS | בדיקות MVP על אנדרואיד; LG + כתוביות HE ב-M5b |
| **כתוביות** | **EN** ב-MVP → **HE חובה** בהמשך | M5a: אנגלית מ-Put.io API; M5b: עברית + בדיקת LG |
| **Credentials** | Put.io OAuth token | **מומלץ:** `/configure` → DB מוצפן (`SECRET_KEY`); `PUTIO_TOKEN` ב-`.env` — fallback בלבד |
| **עדיפות תוכן MVP** | **סדרות קודם**, סרטים אחר כך | M2/M3: episodes + `meta.videos[]`; סרטים ב-M6 |

**מסקנות ארכיטקטוניות מהפרופיל:**

1. **Proxy על PC מקומי** — Stremio באנדרואיד/LG מגיע ל-`http://192.168.x.x:7000` (אותה WiFi). Put.io URL מתבקש מה-PC → IP תואם → proxy פשוט יותר מאשר ענן.
2. **Parser סדרות** — `parse-torrent-title` + regex `SxxExx`, `1x02`, ו-**BlazeAnime** `Show Name - 01 [1080p]...` (ברירת מחדל season 1).
3. **קטלוגים לפי תיקיית root** — כל ילד ישיר של Put.io root (למשל `ET`, `Idan`, `Nikita`) = catalog אחד; סדרות/סרטים/unsorted מכל עומק תחת אותו root מופיעים באותו קטלוג.
4. **Roadmap מותאם** — ראו §5 ו-§18 (סדר series-first).

---

## 2. הנחות עבודה מאומתות — Put.io

> **מקור:** [Put.io OAS 2.7.0](https://gist.github.com/dskvr/bdcb4da5c8501bc01b06c6865aa941c4), [@putdotio/api-client](https://www.npmjs.com/package/@putdotio/api-client)

### 2.1 Base URL & CORS

```
Base URL: https://api.put.io/v2
Upload:   https://upload.put.io/v2  (רק ל-/files/upload)
```

- כל התשובות כוללות `Access-Control-Allow-Origin: *` — ניתן לקרוא מהדפדפן ישירות (רלוונטי ל-/configure, לא ל-stream).
- Auth: `Authorization` header עם OAuth token (SDK: `setToken()`).

### 2.2 OAuth — זרימות נתמכות

| זרימה | Endpoints | מתי להשתמש |
|-------|-----------|------------|
| Authorization Code | `GET /oauth2/authenticate` → `POST /oauth2/access_token` | Web app עם callback |
| Implicit (legacy) | `GET /oauth2/authenticate` | לא מומלץ |
| OOB (Out-of-Band) | `GET /oauth2/oob/code?app_id=X` → משתמש מזין ב-put.io/link → `GET /oauth2/oob/code/{code}` | TV / headless / MVP |

**יצירת אפליקציה:** [https://app.put.io/oauth](https://app.put.io/oauth) (client_id = app_id).

**⚠️ הנחה שיש לאמת בפועל:** האם Put.io מחזיר refresh token ב-authorization code flow. ה-SDK הרשמי מטפל ב-`CLIENT_IP_CHANGED` — לתעד בלוגים.

### 2.3 Files API — endpoints שנשתמש בהם

#### `GET /files/list`

| פרמטר | תיאור | השפעה על המימוש |
|--------|--------|-----------------|
| `parent_id` | תיקיית אב. `0` = root. **`-1` = כל הקבצים** | לסריקה מלאה: `parent_id=-1` + pagination |
| `per_page` | עד **1000** | חובה עם `-1` כדי לקבל cursor |
| `sort_by` | NAME/SIZE/DATE/MODIFIED × ASC/DESC | `DATE_DESC` ל-"Recently Added" |
| `file_type` | FOLDER, FILE, VIDEO, ... | סינון: `file_type=VIDEO` |
| `stream_url` | boolean | מחזיר `stream_url` בכל file |
| `mp4_stream_url` | boolean | MP4 מומר (transcoded) |
| `mp4_status` | boolean | `need_convert`, `mp4_size` |

**תשובה:**
```json
{
  "files": [ { "id": 123, "name": "Movie.mkv", "file_type": "VIDEO", "size": 1234567890, "parent_id": 0, ... } ],
  "parent": { ... },
  "total": 500,
  "cursor": "abc123"   // null אם אין per_page
}
```

**Pagination:** `POST /files/list/continue` עם `{ cursor, per_page }`.

**⚠️ הנחה קריטית מאומתת:** רשימה **אינה רекursיבית**. `parent_id=5` מחזיר רק ילדים ישירים.  
**אלטרנטיבה לסריקה מלאה:** `parent_id=-1` עם cursor — **מומלץ ל-indexer**.

#### `GET /files/search?query=...&per_page=...`

- חיפוש full-text בספרייה (+ חברים).
- Pagination: `POST /files/search/continue`.
- **שימוש:** חיפוש Stremio catalog (`extra.search`).

#### `GET /files/{id}/url`

```json
{ "url": "https://..." }
```

**⚠️ הנחה קריטית מאומתת:**  
> *"The returned URL contains an authentication token that is only valid from the IP address that this request is made."*

משמעות: אם השרת שלנו מבקש URL וה-LG TV מנגן אותו — **Put.io ידחה** (IP שונה).  
→ **חובה Content Proxy** (§11).

#### Streaming נוסף (Put.io native)

| Endpoint | תיאור | הערות |
|----------|--------|-------|
| `GET /files/{id}/hls/media.m3u8?subtitle_key=all` | HLS playlist | `subtitle_key` **חובה**; `all` = כתוביות לפי שפות מועדפות |
| `stream_url` / `mp4_stream_url` ב-list | URLs מוכנים | גם הם IP-bound — אותה בעיה |
| `GET /files/{id}/download` | redirect | **deprecated** — לא להשתמש |
| `GET /files/{id}` | file details | **deprecated** — להשתמש ב-list/search |

#### Subtitles (Put.io built-in) — **יתרון משמעותי**

| Endpoint | תיאור |
|----------|--------|
| `GET /files/{id}/subtitles` | רשימת כתוביות: `key`, `language`, `name`, `source` (opensubtitles/mkv/folder) |
| `GET /files/{id}/subtitles/{key}?format=webvtt\|srt` | הורדת קובץ |

**⚠️ הנחה:** רשימת כתוביות מבוססת על "Default Subtitle Language" בהגדרות המשתמש ב-Put.io — לבדוק עם חשבון אמיתי.

#### Events (לעדכון incremental)

`GET /events/list` — סוגים רלוונטיים:
- `upload`, `transfer_completed`, `file_shared`, `transfer_error`

**אסטרטגיה:** polling events + full resync כל 24h (fallback).

#### Account

| Endpoint | שימוש |
|----------|-------|
| `GET /account/info` | user_id, username — מפתח multi-user |
| `GET /account/settings` | `subtitle_languages`, `default_subtitle_language` |

#### Config (אופציונלי)

`GET/PUT /config` — key-value עד 16MB **לכל אפליקצ OAuth**.  
**לא** מחליף DB שלנו; אולי לשמור `last_scan_cursor` אם רוצים state ב-Put.io.

### 2.4 File Schema — שדות רלוונטיים

```typescript
interface PutioFile {
  id: number;
  name: string;              // כולל extension
  parent_id: number;
  size: number;
  file_type: 'FOLDER' | 'FILE' | 'VIDEO' | 'AUDIO' | 'IMAGE' | 'ARCHIVE' | ...;
  content_type: string;
  created_at: string;        // ISO datetime
  is_mp4_available: boolean;
  need_convert?: boolean;    // עם mp4_status=true
  crc32?: string;
  stream_url?: string;       // עם stream_url=true
  mp4_stream_url?: string;
}
```

### 2.5 מגבלת IP — דיאגרמת זרימה

```
[LG TV / Stremio Client]
        │  GET /stream/movie/putio:123.json
        ▼
[Our Addon Server] ──GET /files/123/url──▶ [Put.io API]
        │                                      │
        │◀──────── url (valid for SERVER IP) ──┘
        │
        │  Option A: Proxy stream through our server
        │  GET /proxy/stream/123  ──▶ pipe bytes from Put.io URL
        │
        ▼
[LG TV plays OUR proxy URL, not Put.io URL directly]
```

**הוכחה מהשטח:** [SkYNewZ/putio](https://github.com/SkYNewZ/putio) — "links were only valid for the IP that requested them".  
**דפוס דומה:** [StremThru proxy](https://github.com/elfhosted/stremthru), [TorrentioDebridProxy](https://github.com/IrrelevantSoftware/TorrentioDebridProxy).

### 2.6 Rate Limiting

- OAS **לא** מפרט rate limits מספריים.
- **הנחת עבודה:** exponential backoff על 429/5xx; cache אגרסיבי; index ברקע, לא per-request.
- SDK רשמי: event `CLIENT_IP_CHANGED` — לטפל ברענון token/URL.

### 2.7 ספרייה רשמית — `@putdotio/api-client`

```typescript
import PutioAPI from '@putdotio/api-client';

const api = new PutioAPI({ clientID: process.env.PUTIO_CLIENT_ID });
api.setToken(userToken);
const info = await api.Account.Info();
// Files: api.Files.List({ parent_id: -1, per_page: 1000, ... })
```

**החלטה:** לעטוף SDK בשכבת `PutioProvider` — לא לפזר קריאות HTTP בקוד.

---

## 3. הנחות עבודה מאומתות — Stremio

> **מקור:** [Protocol](https://stremio.github.io/stremio-addon-sdk/protocol.html), [Manifest](https://stremio.github.io/stremio-addon-sdk/api/responses/manifest.html), [Catalog Handler](https://stremio.github.io/stremio-addon-sdk/api/requests/defineCatalogHandler.html)

### 3.1 Transport & Routes

Transport URL: `https://your-domain.com/manifest.json`

| Route | Method | Response |
|-------|--------|----------|
| `/manifest.json` | GET | Manifest object |
| `/catalog/{type}/{id}.json` | GET | `{ metas: MetaPreview[] }` |
| `/catalog/{type}/{id}/{extraArgs}.json` | GET | extraArgs = query string encoded |
| `/meta/{type}/{id}.json` | GET | `{ meta: MetaObject }` |
| `/stream/{type}/{videoId}.json` | GET | `{ streams: Stream[] }` |
| `/subtitles/{type}/{id}.json` | GET | `{ subtitles: Subtitle[] }` |

**חובה:** CORS `Access-Control-Allow-Origin: *` על **כל** route.

### 3.2 Content Types

| type | שימוש |
|------|-------|
| `movie` | סרט בודד |
| `series` | סדרה + `videos[]` לפרקים |
| `channel`, `tv` | לא בשלב ראשון |

### 3.3 ID Scheme — **החלטה מומלצת**

**לא** להשתמש ב-`tt` prefix אלא אם יש `imdb_id` מ-TMDb.

| ישות | ID format | דוגמה |
|------|-----------|--------|
| סרט | `putio:movie:{putioFileId}` | `putio:movie:84392` |
| סדרה (meta) | `putio:folder:{rootFolderId}:series:{seriesKey}` | `putio:folder:1165897681:series:friends` |
| פרק (video) | `putio:episode:{putioFileId}` | `putio:episode:84392` — ייחודי לקובץ; מונע כפילויות כששני קבצים באותו SxxExx |
| קטלוג (catalog) | `putio_folder_{rootFolderId}` | תיקיית root אחת = catalog אחד ב-Stremio |
| קובץ לא מזוהה | `putio:raw:{putioFileId}` | לקטלוג "Unmatched" |

**Manifest:**
```json
{
  "id": "com.putio.library",
  "version": "0.1.0",
  "name": "Put.io Library",
  "description": "...",
  "resources": [
    "catalog",
    { "name": "meta", "types": ["movie", "series"], "idPrefixes": ["putio:"] },
    { "name": "stream", "types": ["movie", "series"], "idPrefixes": ["putio:"] },
    { "name": "subtitles", "types": ["movie", "series"], "idPrefixes": ["putio:"] }
  ],
  "types": ["movie", "series"],
  "catalogs": [
    { "type": "series", "id": "putio_folder_1165897681", "name": "Put.io ET", "extra": [
      { "name": "search", "isRequired": false },
      { "name": "skip", "isRequired": false }
    ]},
    { "type": "series", "id": "putio_folder_1165883992", "name": "Put.io Idan", "extra": [
      { "name": "search", "isRequired": false },
      { "name": "skip", "isRequired": false }
    ]}
  ],
  "behaviorHints": {
    "configurable": true,
    "configurationRequired": true
  }
}
```

**⚠️ מאומת:** אם משתמשים ב-`tt` בלי meta handler — Stremio מצפה ל-Cinemeta. עם `putio:` **חייבים** meta handler מלא.

### 3.4 Catalog — Pagination & Search

| extra param | תיאור |
|-------------|--------|
| `search` | מחרוזת חיפוש |
| `skip` | offset; **גודל עמוד Stremio = 100**; skip בכפולות 100 |
| `genre` | סינון (אופציונלי, שלב מאוחר) |

**כלל:** אם מחזירים < 100 פריטים — Stremio מניח שזה סוף הקטלוג.

### 3.5 Meta Object — שדות חובה/מומלצים

**Meta Preview (catalog):**
- `id`, `type`, `name`, `poster` (required ב-catalog)

**Meta Full (detail page):**
- `id`, `type`, `name`
- `poster`, `background`, `description`, `releaseInfo`, `genres`/`links`
- **series:** `videos[]` עם `id`, `title`, `season`, `episode`, `released`

**פורמט video ID לסדרות (מימוש v0.8+):**
```
putio:episode:{putioFileId}
→ putio:episode:84392
```
(Series meta id: `putio:folder:{rootFolderId}:series:{seriesKey}`)

### 3.3.1 Folder catalogs (v0.8.0 — מימוש נוכחי)

**כלל:** תיקייה שהיא **ילד ישיר** של Put.io root (`parent_id <= 0`) הופכת ל-**קטלוג Stremio אחד**. כל הקבצים בתת-עץ שלה (למשל `Nikita → Breaking Bad → Season 3`) מתגלגלים לאותו קטלוג.

| שלב | מה קורה |
|-----|---------|
| Scan | `syncPutioFolderTree()` שומר `PutioFolder` (id, name, parentFolderId) |
| Index | `assignRootFoldersToFiles()` ממלא `PutioFile.rootFolderId` |
| Manifest | `buildManifest()` קורא `getFolderCatalogDefinitions()` — רשימה דינמית מ-DB |
| Catalog | `GET /catalog/series/putio_folder_{rootId}.json` — סדרות מקובצות + סרטים + unsorted |
| Series meta | `GET /meta/series/putio:folder:{rootId}:series:{seriesKey}.json` — רק פרקים מאותו root |

**שם תצוגה:** `Put.io {folderName}` (למשל `Put.io ET`).

**סוג catalog ב-manifest:** `series` (גם סרטים מופיעים כ-meta מסוג movie בתוך אותו catalog — mixed catalog).

**דוגמה חשבון אמיתי:** 7 catalogs — `ET`, `Idan`, `moviesbyrizzo…`, `Nikita`, 2× Rick & Morty (תיקיות root בודדות), `Your Files`.

**CLI:** `npx tsx apps/cli/src/list-catalogs.ts` — רשימת catalogs + נתיבי תיקיות חשודות.

### 3.6 Stream Object — **קריטי ל-LG webOS**

```json
{
  "streams": [{
    "name": "Put.io 1080p",
    "title": "Movie.mkv · 8.5 GB",
    "url": "https://your-server.com/v1/proxy/84392?token=...",
    "behaviorHints": {
      "notWebReady": true,
      "filename": "Movie.2024.1080p.mkv",
      "videoSize": 9123456789,
      "bingeGroup": "putio-1080p"
    }
  }]
}
```

| שדה | למה |
|-----|-----|
| `notWebReady: true` | לקבצים שאינם MP4 / דורשים proxy — [Stream docs](https://stremio.github.io/stremio-addon-sdk/api/responses/stream.html) |
| `filename` | זיהוי כתוביות |
| `videoSize` | hash כתוביות OpenSubtitles |
| `subtitles[]` inline | **אופציה מועדפת** — כתוביות ישירות על stream, בלי addon נפרד |

**אלטרנטיבות stream:**
- `url` — HTTP(S) דרך proxy שלנו ✅
- HLS m3u8 URL — אם proxy תומך; Put.io HLS גם IP-bound
- `infoHash` — לא רלוונטי (אין torrent)

### 3.7 Subtitles Object

```json
{
  "subtitles": [{
    "id": "he-1",
    "url": "https://your-server.com/v1/subtitles/84392/he.vtt",
    "lang": "heb"
  }]
}
```

- `lang`: ISO 639-2 (3 letters) — אם לא תקין, Stremio מציג את הטקסט כמו שהוא.
- ל-webOS: **WebVTT/SRT חיצוני** עדיף על embedded PGS.
- Stremio tip: `http://127.0.0.1:11470/subtitles.vtt?from=` — רלוונטי ל-desktop, **לא** ל-LG native.

### 3.8 User Configuration

**Pattern A — URL path (פשוט ל-MVP):**
```
https://addon.example.com/{encryptedUserToken}/manifest.json
```

**Pattern B — manifest.config + /configure (SDK):**
```json
{
  "config": [
    { "key": "putioToken", "type": "password", "title": "Put.io OAuth Token", "required": true }
  ]
}
```

Handler מקבל `config` ב-args: `args.config.putioToken`.

**⚠️ אבטחה:** לעולם לא token גolmi ב-URL ללא הצפנה; HTTPS חובה.

### 3.9 LG webOS — הנחות UX

| נושא | הנחה | פעולה |
|------|------|-------|
| Embedded PGS | לא נתמך ב-TV OS | לספק external VTT/SRT בלבד |
| Embedded ב-non-x264 | בעיות ידועות | להעדיף direct play + external subs |
| כתוביות אוטומטיות | באגים ידועים (2024) | לצרף subs ל-stream object |
| Dolby Digital | בעיות codec | לשקול mp4_stream_url (transcoded) כ-fallback |
| `notWebReady` | נדרש ל-MKV | proxy + streaming server |

---

## 4. החלטות ארכיטקטוניות קריטיות

### 4.1 ארכיטקטורה בשכבות

```
┌─────────────────────────────────────────────────────────┐
│  Presentation (Fastify + stremio-addon-sdk routes)      │
│  manifest | catalog | meta | stream | subtitles         │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│  Application Services                                    │
│  CatalogService | MetaService | StreamService | ...     │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│  Domain                                                  │
│  MediaIdentification | CatalogBuilder | Resume | ...    │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│  Infrastructure                                          │
│  PutioProvider | TmdbProvider | SubtitleProvider | DB  │
└─────────────────────────────────────────────────────────┘
         ▲                              │
         │         BullMQ Workers        │
         └──────── Index | Meta | Subs ──┘
```

### 4.2 Index-first (לא live Put.io per request)

```
Stremio request → PostgreSQL/Redis ONLY
                  (never Put.io in hot path except stream URL refresh)
```

### 4.3 סкан מלא vs incremental

| שלב | אסטרטגיה |
|-----|----------|
| MVP | `files/list?parent_id=-1` full scan כל 5 דק |
| v0.3+ | `events/list` + delta |
| v0.5+ | folder-based scan אם `-1` איטי מדי |

### 4.4 Content Proxy — חובה

כל `stream.url` מצביע ל:
```
GET /v1/proxy/{putioFileId}
  → server fetches fresh /files/{id}/url
  → pipes with Range support (seeking)
  → optional: cache first N MB
```

---

## 5. מטרות לפי שלב (Roadmap)

| שלב | שם | תוצאה נראית למשתמש | Put.io | Stremio |
|-----|-----|---------------------|--------|---------|
| **M0** | Skeleton | manifest נטען ב-Stremio (אנדרואיד) | — | manifest ✅ |
| **M1** | Token + Scan | — | list files ✅ | — |
| **M2** | **Series Catalog** | רואים סדרות ב-Discover | index episodes ✅ | catalog ✅ |
| **M3** | **Play Episode** | לוחצים Play על פרק — מתנגן | url + proxy ✅ | stream ✅ |
| **M4** | Meta + Posters | עמוד סדרה עם poster (TMDb) | — | meta ✅ + TMDb |
| **M5a** | Subtitles EN | כתוביות אנגלית | /subtitles ✅ | subtitles ✅ |
| **M5b** | Subtitles HE + LG | כתוביות עברית, בדיקת LG | /subtitles ✅ | subtitles ✅ |
| **M6** | Movies | סרטים בקטלוג + play | index movies | catalog ✅ |
| **M7** | OAuth UI + Cloud | התחברות, מעבר לענן | OAuth ✅ | config ✅ |
| **M8** | Smart Catalogs | Recently Added, 4K, ... | filters | extra catalogs |
| **M9** | Resume | Continue Watching | start-from API | catalog |

**MVP (בעלים):** M0 → M1 → M2 → M3 — **פרק סדרה מתנגן באנדרואיד**.  
**MVP+:** M5a (EN subs) → M4 (posters) → M5b (HE + LG) → M6 (movies).

---

## 6. שכבה 0 — תשתית ופרויקט

### 6.1 מבנה Monorepo

```
putio/
├── apps/
│   ├── api/                 # Fastify + Stremio routes
│   └── worker/              # BullMQ consumers
├── packages/
│   ├── putio-client/        # wrapper על @putdotio/api-client
│   ├── media-parser/        # parse-torrent-title
│   ├── domain/              # business logic
│   └── shared/              # types, errors, logger
├── prisma/
│   └── schema.prisma
├── docker-compose.yml
├── docs/
│   └── SDD-FULL.md          # מסמך זה
└── package.json             # pnpm workspaces
```

### 6.2 docker-compose.yml (מינימלי)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: putio_stremio
      POSTGRES_USER: app
      POSTGRES_PASSWORD: dev
    ports: ["5432:5432"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d putio_stremio"]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  api:
    build: ./apps/api
    ports: ["7000:7000"]
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_started }
    environment:
      DATABASE_URL: postgresql://app:dev@postgres:5432/putio_stremio
      REDIS_URL: redis://redis:6379
```

### 6.3 Environment Variables

| Variable | שלב | תיאור |
|----------|-----|--------|
| `DATABASE_URL` | M0 | PostgreSQL |
| `REDIS_URL` | M1 | Queue + cache |
| `PUTIO_CLIENT_ID` | M7 | OAuth app id |
| `PUTIO_CLIENT_SECRET` | M7 | OAuth secret |
| `PUTIO_TOKEN` | M1 | **אופציונלי** — fallback אם אין token ב-DB |
| `SECRET_KEY` | M3/M7 | חתימת proxy URLs + הצפנת OAuth token ב-DB |
| `AUTO_SCAN_INTERVAL_MINUTES` | 0.9 | מרווח סריקה אוטומטית (דקות; `0` = כבוי; ברירת מחדל `5`) |
| `TMDB_API_KEY` | M4 | metadata |
| `BASE_URL` | M0 | MVP: `http://192.168.x.x:7000` (LAN IP של PC); ענן: `https://addon.example.com` |

### 6.4 Definition of Done — M0

- [ ] `pnpm install && docker compose up` עובד
- [ ] `GET /manifest.json` מחזיר manifest תקין
- [ ] CORS headers על כל response
- [ ] `GET /health` → 200
- [ ] Vitest רץ עם test אחד ל-manifest schema (zod)

---

## 7. שכבה 1 — Put.io Client & Auth

### 7.1 מטרה

עטיפה typed לכל קריאות Put.io שנדרשות, עם retry ו-error mapping.

### 7.2 Interface

```typescript
// packages/putio-client/src/types.ts

export interface PutioProvider {
  // Auth
  setToken(token: string): void;
  getAccountInfo(): Promise<PutioAccountInfo>;

  // Files — Index
  listAllFiles(params: { perPage: number; cursor?: string }): Promise<PaginatedFiles>;
  listFolder(parentId: number, params?: ListParams): Promise<PaginatedFiles>;
  searchFiles(query: string, params?: SearchParams): Promise<PaginatedFiles>;

  // Files — Stream
  getDownloadUrl(fileId: number): Promise<string>;
  listSubtitles(fileId: number): Promise<PutioSubtitle[]>;
  getSubtitle(fileId: number, key: string, format: 'webvtt' | 'srt'): Promise<string>;

  // Optional
  listEvents(): Promise<PutioEvent[]>;
  getAccountSettings(): Promise<PutioAccountSettings>;
}
```

### 7.3 Error Mapping

| Put.io | HTTP | Our Error |
|--------|------|-----------|
| `error_type: "NOT_FOUND"` | 404 | `PutioFileNotFoundError` |
| token invalid | 401 | `PutioAuthError` |
| rate limit | 429 | `PutioRateLimitError` (retry) |
| IP changed | SDK event | `PutioIpChangedError` → refresh URL |

### 7.4 Auth — MVP (M1)

**זרימה (v0.9.0):**
1. משתמש יוצר token ב-[app.put.io/oauth](https://app.put.io/oauth) **או** OAuth redirect
2. שומר ב-`GET/POST /configure` → `OAuthToken` מוצפן ב-DB (`SECRET_KEY`)
3. `PUTIO_TOKEN` ב-`.env` — fallback בלבד (לא מומלץ ב-production)
4. Worker/API/CLI קוראים `getPutioAccessToken()` — DB קודם, אחר כך env

**בדיקת acceptance:**
```typescript
const info = await putio.getAccountInfo();
expect(info.username).toBeDefined();
const page = await putio.listAllFiles({ perPage: 10 });
expect(page.files).toBeInstanceOf(Array);
```

### 7.5 Auth — Configure & OAuth (M7 — חלקי, v0.9.0)

**מומלץ — paste token:**
```
GET  /configure          → HTML form
POST /configure        → { "token": "..." } → encrypt & store in OAuthToken
```

**OAuth Authorization Code** (דורש `PUTIO_CLIENT_ID` + `PUTIO_CLIENT_SECRET` + redirect URI רשום):
```
User → GET /oauth/start
     → redirect https://api.put.io/v2/oauth2/authenticate?client_id=...&redirect_uri=...&response_type=code
     → GET /oauth/callback?code=...
     → POST /oauth2/access_token
     → encrypt & store in OAuthToken
     → redirect /configure?saved=1
```

Redirect URI לרישום: `{BASE_URL}/oauth/callback` (למשל `http://127.0.0.1:7000/oauth/callback`).

**טרם מומש:** per-user manifest URL (`/u/{slug}/manifest.json`), OOB flow.

### 7.6 Definition of Done — M1

- [ ] `PutioProvider` עם unit tests (mock axios/SDK)
- [ ] integration test עם `PUTIO_TOKEN` (skipped ב-CI)
- [ ] pagination: list 2500+ files עם cursor
- [ ] logging של `CLIENT_IP_CHANGED`

---

## 8. שכבה 2 — Indexer & Media Parser

### 8.1 מטרה

להפוך קבצי Put.io ל-entities: `Movie`, `Episode`, `UnmatchedFile`.

### 8.2 Index Worker Pipeline

```
Trigger (cron 5min / manual)
  │
  ├─▶ PUTIO: GET /files/list?parent_id=-1&per_page=1000&file_type=VIDEO
  │         loop POST /files/list/continue until cursor=null
  │
  ├─▶ For each file:
  │     hash = sha256(id + name + size + crc32)
  │     if hash unchanged → skip
  │     else → enqueue PARSE job
  │
  └─▶ PARSE job:
        MediaParser.parse(filename)
        → ParsedMedia { kind, title, year, season?, episode?, quality, ... }
        → upsert putio_files + media tables
        → enqueue METADATA job (M4)
```

### 8.3 Media Parser

**Input:** `Friends.S04E08.720p.BRRip.x264.mkv`

**Output:**
```typescript
interface ParsedMedia {
  kind: 'movie' | 'episode' | 'unknown';
  title: string;           // "Friends" | "Alien Romulus"
  year?: number;
  season?: number;
  episode?: number;
  resolution?: string;     // "1080p", "2160p"
  source?: string;         // "BluRay", "WEB-DL"
  codec?: string;
  hdr?: boolean;
  releaseGroup?: string;
  rawTitle: string;
}
```

**ספרייה:** `parse-torrent-title` (Node).

**Regex fallback:** `\bS(\d{1,2})E(\d{1,2})\b`, `\b(\d{4})\b`.

**⚠️ הנחה:** שמות inconsistent — קטלוג `Unmatched` חובה.

### 8.4 Series Grouping

```
Domain rule:
  seriesKey = slugify(parsed.title)  // "friends", "alien-romulus"

  Episode file → links to seriesKey
  Multiple files same seriesKey → one series meta
```

**Edge case:** סרט עם שם דומה לסדרה — TMDb disambiguation (M4).

### 8.5 Folder → Catalog (מימוש v0.8.0)

**אוטומטי** — אין צורך ב-mapping ידני:

```
Put.io root
├── ET/                    → catalog putio_folder_{ET_id}     "Put.io ET"
│   ├── How I Met Your Mother/
│   └── One Punch Man/
├── Idan/                  → catalog putio_folder_{Idan_id}   "Put.io Idan"
└── Nikita/
    └── Breaking Bad/
        └── Season 3/      → still rolls up to "Put.io Nikita"
```

- `PutioFolder` — שם + `parentFolderId` לכל תיקייה שנפגשה בסריקה
- `PutioFile.rootFolderId` — מזהה ה-root שאליו הקובץ שייך
- תיקייה ב-root עם קובץ וידאו אחד (למשל Rick & Morty S09E04…) → catalog נפרד משלה

**M8.5 (עתידי):** mapping ידני / שינוי שמות catalog — לא מומש.

### 8.6 Definition of Done — M2

- [ ] Worker סורק את כל הספרייה
- [ ] DB מכילה `putio_files` עם parsed fields
- [ ] ≥80% קבצים עם `SxxExx` מזוהים כ-episode (metric)
- [ ] re-scan idempotent (אין duplicates)
- [ ] API: `GET /admin/index/status` (files count, last scan)

---

## 9. שכבה 3 — Metadata (TMDb)

### 9.1 מטרה

Posters, overview, genres — **רק** דרך index, לא ב-hot path.

### 9.2 TMDb Endpoints

| סוג | Endpoint | Input |
|-----|----------|-------|
| Movie search | `GET /search/movie?query={title}&year={year}` | parsed title+year |
| Movie details | `GET /movie/{id}?append_to_response=external_ids` | tmdb_id |
| TV search | `GET /search/tv?query={title}` | series title |
| TV details | `GET /tv/{id}` | tmdb_id |
| Images | `https://image.tmdb.org/t/p/w600_and_h900_bestv2/{path}` | poster path |

**Poster ל-Stremio:** `w600_and_h900_bestv2` — [Meta docs](https://stremio.github.io/stremio-addon-sdk/api/responses/meta.html) (< 100KB מומלץ).

### 9.3 Metadata Worker

```
Input: mediaId (parsed, no tmdb yet)
  → TMDb search (title + year)
  → pick best match (score ≥ threshold)
  → store: tmdb_id, imdb_id?, poster, backdrop, overview, genres
  → if ambiguous → mark metadata_status = 'ambiguous'
```

**⚠️ הנחה:** לא כל קובץ ימatch — OK; Unmatched catalog.

### 9.4 Stremio ID enrichment (אופצional)

אם יש `imdb_id` מ-TMDb:
- **אפשר** alias נוסף `tt1234567` — אבל מסבך; **MVP: רק `putio:` prefix**.

### 9.5 Definition of Done — M4

- [ ] סרטים עם TMDb match מציגים poster ב-catalog
- [ ] Meta page: description, background, releaseInfo
- [ ] TMDb rate limit: max 40 req/10s (הנחה standard) — queue throttle

---

## 10. שכבה 4 — Stremio Presentation Layer

### 10.1 מטרה

Fastify routes — **אפס business logic**; רק validation + delegate to services.

### 10.2 Route Map

```typescript
// apps/api/src/routes/stremio.ts

GET  /manifest.json
GET  /:userToken/manifest.json          // multi-user

GET  /catalog/:type/:id.json
GET  /catalog/:type/:id/:extra*.json    // parse extraArgs query string

GET  /meta/:type/:id.json
GET  /stream/:type/:videoId.json
GET  /subtitles/:type/:id.json

GET  /configure                         // OAuth UI + paste token (M7)
POST /configure
GET  /oauth/start                       // OAuth redirect (M7)
GET  /oauth/callback
GET  /v1/proxy/:fileId                  // content proxy (M3)
GET  /v1/subtitles/:fileId/:lang.vtt    // subtitle proxy (M5)
```

### 10.3 CatalogService

```typescript
interface CatalogService {
  getCatalog(type: 'movie' | 'series', catalogId: string, extra?: CatalogExtra): Promise<MetaPreview[]>;
}

interface CatalogExtra {
  search?: string;
  skip?: number;   // default 0
  genre?: string;
}
```

**Mapping catalog IDs (v0.8.0 — folder catalogs):**

| catalogId | Filter / behavior |
|-----------|-------------------|
| `putio_folder_{rootFolderId}` | `PutioFile.rootFolderId = {rootFolderId}` — mixed: series (grouped by `seriesKey`), movies, unmatched files |
| `putio_movies` | *(legacy / M6 — לא בשימוש)* |
| `putio_series` | *(legacy / M2 — הוחלף ב-folder catalogs)* |
| `putio_recent` | `ORDER BY putio_files.created_at DESC` (M8) |
| `putio_unmatched` | `metadata_status IN ('unknown', 'ambiguous')` (M8) |

**Manifest:** נבנה דינמית — `catalogs[]` מכיל רק תיקיות root שיש בהן מדיה (`listFoldersWithMedia`).

**Pagination:**
```typescript
const skip = extra?.skip ?? 0;
const limit = 100;  // Stremio page size
return db.query(..., { offset: skip, limit                 limit });
```

### 10.4 MetaService

**Movie response:**
```json
{
  "meta": {
    "id": "putio:movie:84392",
    "type": "movie",
    "name": "Alien: Romulus",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/...",
    "background": "https://image.tmdb.org/t/p/original/...",
    "description": "...",
    "releaseInfo": "2024",
    "genres": ["Horror", "Sci-Fi"],
    "runtime": "119m",
    "imdbRating": "7.2"
  }
}
```

**Series response:**
```json
{
  "meta": {
    "id": "putio:series:friends",
    "type": "series",
    "name": "Friends",
    "poster": "...",
    "videos": [
      {
        "id": "putio:series:friends:4:8",
        "title": "The One with Chandler in a Box",
        "season": 4,
        "episode": 8,
        "released": "1997-12-11T00:00:00.000Z"
      }
    ]
  }
}
```

### 10.5 Response Caching Headers

| Resource | cacheMaxAge |
|----------|-------------|
| manifest | 300 |
| catalog | 300 |
| meta | 86400 |
| stream | 300 |
| subtitles | 86400 |

**Auto-scan (v0.9.0):** ב-startup של API, `scanPutioLibrary` רץ כל `AUTO_SCAN_INTERVAL_MINUTES` (ברירת מחדל 5; `0` = כבוי).

SDK: `{ metas, cacheMaxAge: 300 }` או Fastify `Cache-Control`.

### 10.6 Definition of Done — M2 (catalog) / M4 (meta)

- [ ] Stremio Desktop: Install addon → Discover → רואים catalog
- [ ] לחיצה על פריט → Meta page (M4)
- [ ] `extra.search` מחזיר תוצאות
- [ ] `extra.skip` pagination עובד עם 200+ פריטים

---

## 11. שכבה 5 — Stream & Content Proxy

### 11.1 מטרה

ניגון שעובד על LG TV — עוקף מגבלת IP של Put.io.

### 11.2 StreamService

```typescript
interface StreamService {
  getStreams(type: string, videoId: string, userId: string): Promise<Stream[]>;
}

// videoId examples:
// putio:movie:84392
// putio:series:friends:4:8
```

**Algorithm:**
```
1. Parse videoId → putioFileId
2. Load file metadata from DB (name, size)
3. freshUrl = await putio.getDownloadUrl(putioFileId)  // IP = server
4. proxyUrl = `${BASE_URL}/v1/proxy/${putioFileId}?sig=${hmac(fileId, expiry)}`
5. Return stream with behaviorHints
```

### 11.3 Proxy Handler

```typescript
// GET /v1/proxy/:fileId?sig=...&exp=...

async function proxyHandler(req, reply) {
  verifySignature(req.params.fileId, req.query.sig, req.query.exp);
  const putioUrl = await putio.getDownloadUrl(fileId);  // fresh each request OR cache 4min

  const headers: Record<string, string> = {};
  if (req.headers.range) {
    headers['Range'] = req.headers.range;  // seeking support
  }

  const upstream = await fetch(putioUrl, { headers });
  reply.status(upstream.status);
  reply.headers({
    'Content-Type': upstream.headers.get('content-type') ?? 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
  });
  return reply.send(upstream.body);
}
```

**⚠️ הנחות לבדיקה:**
- [ ] Range requests עובדים (seeking)
- [ ] MKV ניגון ב-webOS עם `notWebReady: true`
- [ ] אם MKV נכשל → fallback stream עם `mp4_stream_url`

### 11.4 Fallback: Transcoded MP4

```
GET /files/list?...&mp4_stream_url=true
→ if need_convert=false && mp4_stream_url exists
→ prefer mp4 for webOS compatibility
```

### 11.5 HLS (שלב אופציונלי M9+)

```
proxyUrl = `/v1/proxy/hls/${fileId}/media.m3u8?subtitle_key=all`
→ server fetches m3u8, rewrites segment URLs to proxy
```

מורכב יותר — **לא** ב-MVP.

### 11.6 Definition of Done — M3

- [ ] Play על Stremio Desktop — סרט מתנגן
- [ ] Play על LG webOS — סרט מתנגן
- [ ] Seek (גלילה) עובד
- [ ] Proxy URL expires / signed

---

## 12. שכבה 6 — Subtitles

### 12.1 מטרה

כתוביות עברית (ועוד) שעובדות על LG — **external VTT/SRT**.

### 12.2 Priority Chain

```
1. Put.io /files/{id}/subtitles (folder/mkv/opensubtitles)
2. Cache in subtitle_cache table
3. (M9+) OpenSubtitles API
4. (M9+) Embedded extraction via ffprobe — לא ל-MVP
```

### 12.3 SubtitleService

```typescript
interface SubtitleService {
  getSubtitles(type: string, id: string, userId: string): Promise<Subtitle[]>;
  getSubtitleFile(fileId: number, key: string): Promise<Buffer>;
}
```

**Worker (prefetch):**
```
On index → GET /files/{id}/subtitles
→ for each sub with language matching heb/eng:
   GET /files/{id}/subtitles/{key}?format=webvtt
   → store in DB / filesystem
```

### 12.4 Stremio Integration — 2 דרכים

**דרך A (מועדפת ל-LG): inline ב-stream**
```json
{
  "streams": [{
    "url": "...",
    "subtitles": [
      { "id": "he", "lang": "heb", "url": "https://addon.../v1/subtitles/84392/he.vtt" }
    ]
  }]
}
```

**דרך B: subtitles resource**
```
GET /subtitles/movie/putio:movie:84392.json
→ { subtitles: [...] }
```

**⚠️ מאומת:** subtitles resource `id` בפרוטוקol מתייחס ל-OpenSubtitles hash — עם `idPrefixes: ["putio:"]` משתמשים ב-ID שלנו.

### 12.5 Language Codes

| מקור | קוד ל-Stremio |
|------|---------------|
| Hebrew | `heb` (ISO 639-2) |
| English | `eng` |

Put.io מחזיר `"English"`, `"Hebrew"` — mapping table נדרש.

### 12.6 Definition of Done — M5

- [ ] סרט עם כתוביות ב-Put.io → מופיעות ב-Stremio
- [ ] LG webOS: כתוביות עברית VTT נראות
- [ ] אין תלות ב-embedded PGS

---

## 13. שכבה 7 — Smart Catalogs & Resume

### 13.1 Smart Catalogs (M8)

| Catalog ID | Filter |
|------------|--------|
| `putio_recent` | `ORDER BY created_at DESC LIMIT 100` |
| `putio_4k` | `resolution = '2160p'` |
| `putio_hdr` | `hdr = true` |
| `putio_heb_subs` | EXISTS in subtitle_cache WHERE lang='heb' |
| `putio_continue` | resume_points WHERE progress > 0.05 AND < 0.95 |

### 13.2 Resume / Continue Watching

**Put.io native:** `POST /files/{id}/start-from` (time in seconds).

**Sync strategy:**
```
On stream start/progress (if Stremio reports — limited):
  → store resume_points locally

On index:
  → optionally read Put.io start-from (if API supports GET — לא ב-OAS; rely on local)
```

**⚠️ הנחה:** Stremio **לא** שולח progress ל-addon ב-webOS באופן אמין — resume primarily **within addon** via local tracking or manual.

**Catalog "Continue Watching":**
```json
{
  "type": "movie",
  "id": "putio_continue",
  "name": "Continue Watching"
}
```

### 13.3 Collections (M9+)

קבץ סרטים לפי folder parent_id או naming pattern.

---

## 14. שכבה 8 — Multi-user & Production

### 14.1 Multi-tenancy

```
URL: https://addon.example.com/u/{userSlug}/manifest.json
userSlug = base64url(encrypt(userId))
```

כל table: `user_id` FK.

### 14.2 Security

- Tokens מוצפנים at rest (AES-256-GCM)
- Proxy URLs signed + expiry (5 min)
- Rate limiting per user (Fastify rate-limit)
- HTTPS only

### 14.3 Observability (M9+)

- Prometheus metrics: scan_duration, catalog_latency, proxy_bytes
- Structured logging (pino)
- Health: `/health`, `/ready`

### 14.4 Deployment

```
nginx → api:7000
worker (separate container)
postgres, redis
```

---

## 15. מודל נתונים (PostgreSQL)

### 15.1 ERD (טקסטואלי)

```
users ──< oauth_tokens
users ──< putio_files ──< media
media ──< movies | series | episodes
media ──< subtitle_cache
users ──< resume_points
users ──< watch_history
catalog_cache (denormalized, optional)
```

### 15.2 Prisma Schema (ליבה)

```prisma
model User {
  id        String   @id @default(cuid())
  slug      String   @unique
  putioUserId Int?   @unique
  createdAt DateTime @default(now())
  tokens    OAuthToken[]
  files     PutioFile[]
}

model OAuthToken {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id])
  accessToken  String   // encrypted
  refreshToken String?  // encrypted
  expiresAt    DateTime?
  createdAt    DateTime @default(now())
}

model PutioFile {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id])
  putioFileId  Int
  name         String
  size         BigInt
  parentId     Int
  fileType     String
  contentHash  String   // sha256 for change detection
  createdAt    DateTime
  indexedAt    DateTime @default(now())
  mediaId      String?
  media        Media?   @relation(fields: [mediaId], references: [id])

  @@unique([userId, putioFileId])
  @@index([userId, createdAt])
}

model Media {
  id               String   @id @default(cuid())
  userId           String
  kind             String   // movie | series | episode | unmatched
  title            String
  year             Int?
  seriesKey        String?
  season           Int?
  episode          Int?
  resolution       String?
  hdr              Boolean  @default(false)
  tmdbId           Int?
  imdbId           String?
  metadataStatus   String   // pending | matched | ambiguous | failed
  posterPath       String?
  backdropPath     String?
  overview         String?
  genres           Json?
  files            PutioFile[]
  subtitles        SubtitleCache[]

  @@index([userId, kind])
  @@index([userId, seriesKey])
  @@index([tmdbId])
}

model SubtitleCache {
  id        String @id @default(cuid())
  mediaId   String
  media     Media  @relation(fields: [mediaId], references: [id])
  putioKey  String
  lang      String // heb, eng
  format    String // webvtt
  content   String @db.Text
  source    String // opensubtitles | mkv | folder

  @@unique([mediaId, putioKey])
  @@index([mediaId, lang])
}

model ResumePoint {
  id          String @id @default(cuid())
  userId      String
  stremioId   String  // putio:movie:84392
  putioFileId Int
  positionSec Int
  durationSec Int?
  updatedAt   DateTime @updatedAt

  @@unique([userId, stremioId])
}
```

---

## 16. Cache & Workers

### 16.1 Redis Keys

| Key | TTL | Value |
|-----|-----|-------|
| `catalog:{userId}:{type}:{id}:{skip}:{search}` | 300s | JSON metas |
| `meta:{userId}:{stremioId}` | 86400s | JSON meta |
| `stream:url:{userId}:{fileId}` | 240s | Put.io signed URL |
| `manifest` | 300s | JSON |

### 16.2 BullMQ Queues

| Queue | Job | Concurrency |
|-------|-----|-------------|
| `index` | `full-scan`, `delta-scan` | 1 per user |
| `parse` | `parse-file` | 5 |
| `metadata` | `resolve-tmdb` | 2 (rate limit) |
| `subtitles` | `fetch-subs` | 3 |

### 16.3 Worker State Machine

```
[IDLE] ──trigger──▶ [SCANNING] ──files──▶ [PARSING]* ──▶ [METADATA]*
                         │                                    │
                         └──────────complete──────────────────▶ [IDLE]

Error → [FAILED] → retry with backoff → [SCANNING]
```

---

## 17. בדיקות לכל שלב

### 17.1 Test Pyramid

| Level | Tool | Scope |
|-------|------|-------|
| Unit | Vitest | Parser, ID encoding, signature |
| Integration | Vitest + supertest | Routes + DB (testcontainers) |
| Contract | JSON schema (zod) | Stremio responses |
| E2E Manual | Stremio Desktop + LG | Play, subs, seek |

### 17.2 Stremio Contract Tests

```typescript
const manifestSchema = z.object({
  id: z.string(),
  version: z.string(),
  name: z.string(),
  resources: z.array(z.union([z.string(), z.object({ name: z.string() })])),
  types: z.array(z.string()),
  catalogs: z.array(z.object({
    type: z.string(),
    id: z.string(),
    name: z.string(),
  })),
});

const catalogSchema = z.object({
  metas: z.array(z.object({
    id: z.string(),
    type: z.string(),
    name: z.string(),
    poster: z.string().optional(),
  })),
});
```

### 17.3 Put.io Mock

```typescript
// tests/mocks/putio.ts
export const mockFilesList = {
  files: [{ id: 1, name: 'Test.2020.1080p.mkv', file_type: 'VIDEO', size: 1000, parent_id: 0 }],
  cursor: null,
  total: 1,
};
```

### 17.4 Manual Test Checklist (M3)

- [ ] Install addon in Stremio
- [ ] Catalog loads (< 3s)
- [ ] Play starts (< 10s)
- [ ] Pause/resume
- [ ] Seek to 50%
- [ ] Back button → catalog still works

---

## 18. משימות מימוש — גרסה מינימלית ואיטרטיבית

> **עקרון:** כל משימה = PR אחד, ניתן לבדיקה independently.  
> **MVP = M0+M1+M2+M3** → **פרק סדרה מתנגן באנדרואיד** (פרופיל בעלים).  
> **MVP+ = M5a** (EN subs) → **M5b** (HE + LG) → **M6** (movies).

---

### Phase M0 — Skeleton (1–2 ימים)

| # | משימה | קבצים | Acceptance Criteria |
|---|--------|-------|---------------------|
| M0.1 | Init monorepo pnpm + TS strict | `package.json`, `tsconfig.json` | `pnpm build` passes |
| M0.2 | Docker compose postgres+redis | `docker-compose.yml` | healthchecks green |
| M0.3 | Prisma init + migrate empty | `prisma/schema.prisma` | `prisma migrate dev` |
| M0.4 | Fastify app + health route | `apps/api/src/index.ts` | `GET /health` 200 |
| M0.5 | Static manifest route | `apps/api/src/routes/manifest.ts` | Valid JSON, CORS |
| M0.6 | Manifest zod test | `apps/api/tests/manifest.test.ts` | CI green |
| M0.7 | Logger (pino) + error handler | `packages/shared/logger.ts` | structured logs |

**🎯 Milestone M0:** התקנת addon ב-Stremio — manifest מופיע, אין catalogs עדיין.

---

### Phase M1 — Put.io Connection (2–3 ימים)

| # | משימה | Acceptance Criteria |
|---|--------|---------------------|
| M1.1 | `packages/putio-client` wrap SDK | Unit tests with mock |
| M1.2 | `getAccountInfo()` | Returns username |
| M1.3 | `listAllFiles` with pagination | Handles 3000+ files |
| M1.4 | `getDownloadUrl(fileId)` | Returns URL string |
| M1.5 | CLI: `pnpm scan --dry-run` | Prints file count |
| M1.6 | Error types + retry on 429 | Tested with mock |

**🎯 Milestone M1:** `pnpm scan` מדפיס את כל קבצי הווידאו.

---

### Phase M2 — Index + Series Catalog (3–5 ימים)

| # | משימה | Acceptance Criteria |
|---|--------|---------------------|
| M2.1 | Prisma models: PutioFile, Media | Migration applied |
| M2.2 | `packages/media-parser` | 10 test cases — **דגש על `SxxExx`** |
| M2.3 | Index worker: full scan → DB | Idempotent re-run; **200–1000 files OK** |
| M2.4 | Episode grouping by `seriesKey` | Multiple files → one series |
| M2.5 | CatalogService: folder catalogs | `putio_folder_{id}` — mixed series/movies/unsorted per root | ✅ v0.8.0 |
| M2.6 | Route `GET /catalog/series/putio_folder_{id}.json` | Stremio shows per-folder catalog | ✅ v0.8.0 |
| M2.7 | Basic meta + `videos[]` (no TMDb) | Season/episode list opens |
| M2.8 | Catalog search (`extra.search`) | Query filters by series title |
| M2.9 | Catalog pagination (`extra.skip`) | 100+ series paginate |

**🎯 Milestone M2:** רואים סדרות ב-Stremio Discover (posters placeholder OK).

---

### Phase M2b — Folder Catalogs (v0.8.0) ✅

| # | משימה | Acceptance Criteria |
|---|--------|---------------------|
| M2b.1 | `PutioFolder` + `rootFolderId` on files | Prisma migration |
| M2b.2 | `syncPutioFolderTree` + `assignRootFoldersToFiles` | Scan assigns root |
| M2b.3 | Dynamic manifest from DB | One catalog per top-level folder |
| M2b.4 | `getFolderMediaCatalog` | Mixed catalog per folder |
| M2b.5 | `getFolderSeriesMeta` | Series scoped to folder root |
| M2b.6 | `library-summary` on scan | CLI reports catalog structure |

---

### Phase M3 — Stream + Proxy (3–5 ימים) ⭐ MVP

| # | משימה | Acceptance Criteria |
|---|--------|---------------------|
| M3.1 | Parse stremio video IDs | Unit tests |
| M3.2 | StreamService | Returns stream object |
| M3.3 | Proxy route with Range support | curl -H "Range: bytes=0-1000" works |
| M3.4 | Signed proxy URLs | Invalid sig → 403 |
| M3.5 | Route `/stream/series/{videoId}.json` | Stremio play works **Android** |
| M3.6 | `behaviorHints.notWebReady` + filename | Set correctly |
| M3.7 | **Manual test Android phone** | Play episode on same WiFi as PC |
| M3.8 | MP4 fallback stream (optional) | If MKV fails on device |

**🎯 Milestone M3 (MVP):** לוחצים Play על פרק — הפרק מתנגן באנדרואיד.

---

### Phase M4 — TMDb Metadata (2–3 ימים)

| # | משימה | Acceptance Criteria |
|---|--------|---------------------|
| M4.1 | TmdbProvider | Search + details |
| M4.2 | Metadata worker | Posters in DB |
| M4.3 | Rich catalog MetaPreview | poster URLs |
| M4.4 | Full MetaService | background, description |
| M4.5 | Rate limit queue | No TMDb 429 in scan |

**🎯 Milestone M4:** עמוד פרטים עם poster ותקציר.

---

### Phase M5a — Subtitles English (2–3 ימים)

| # | משימה | Acceptance Criteria |
|---|--------|---------------------|
| M5a.1 | Put.io subtitles list/download | Integration test |
| M5a.2 | Subtitle worker prefetch | VTT in DB |
| M5a.3 | Language mapping `eng` | Correct lang codes |
| M5a.4 | Subtitle proxy route | Serves webvtt |
| M5a.5 | Inline subtitles on stream | Stremio Android shows EN subs |

**🎯 Milestone M5a:** כתוביות אנגלית על אנדרואיד.

### Phase M5b — Subtitles Hebrew + LG (2–3 ימים)

| # | משימה | Acceptance Criteria |
|---|--------|---------------------|
| M5b.1 | Hebrew language mapping `heb` | Put.io → Stremio codes |
| M5b.2 | Prefer external VTT over embedded | No PGS dependency |
| M5b.3 | **Manual test LG webOS** | Play + Hebrew subs visible |

**🎯 Milestone M5b:** כתוביות עברית על LG.

---

### Phase M6 — Movies (3–4 ימים)

| # | משימה | Acceptance Criteria |
|---|--------|---------------------|
| M6.1 | Parser: movie detection (non-SxxExx) | Movies in DB |
| M6.2 | Catalog `putio_movies` | Movies list |
| M6.3 | Meta + stream for `putio:movie:{id}` | Play movie |
| M6.4 | TMDb for movies (if not done in M4) | Posters |

**🎯 Milestone M6:** סרטים בקטלוג + play.

---

### Phase M7 — OAuth & Configure (3–5 ימים)

| # | משימה | Acceptance Criteria | סטטוס |
|---|--------|---------------------|--------|
| M7.1 | `/configure` page | UI for connect | ✅ v0.9.0 |
| M7.2 | OAuth callback + token storage | Encrypted in DB (`SECRET_KEY`) | ✅ v0.9.0 |
| M7.3 | Per-user manifest URL | Multi-user works | ⏳ |
| M7.4 | Remove PUTIO_TOKEN env dependency | Production ready | ✅ חלקי — DB primary, env fallback |
| M7.5 | OOB flow (optional) | TV-friendly auth | ⏳ |

---

### Phase M8 — Smart Catalogs (2–4 ימים)

| # | משימה | Acceptance Criteria |
|---|--------|---------------------|
| M8.1 | `putio_recent` catalog | Sorted by date |
| M8.2 | `putio_4k`, `putio_hdr` | Quality filters |
| M8.3 | `putio_heb_subs` | Filter by cached subs |
| M8.4 | `putio_unmatched` | Shows failed parses |
| M8.5 | Folder mapping config | User maps folders |

---

### Phase M9 — Polish & Production (ongoing)

| # | משימה |
|---|--------|
| M9.1 | Events-based incremental index |
| M9.2 | Continue Watching catalog |
| M9.3 | HLS proxy support |
| M9.4 | OpenSubtitles fallback |
| M9.5 | Prometheus + Grafana |
| M9.6 | GuessIt Python microservice |
| M9.7 | StorageProvider abstraction (WebDAV, etc.) |

---

### סדר עדיפויות (פרופיל בעלים — series-first)

```
M0 → M1 → M2 → M3  ═══ MVP (פרק סדרה + play באנדרואיד)
         → M5a     ═══ כתוביות EN
         → M4      ═══ TMDb posters (יכול במקביל ל-M5a)
         → M5b     ═══ כתוביות HE + בדיקת LG
         → M6      ═══ סרטים
         → M7      ═══ OAuth + מעבר לענן
         → M8/M9
```

---

### Definition of Done — כל PR

- [ ] TypeScript strict — no `any`
- [ ] Unit tests for new logic
- [ ] zod validation on API boundaries
- [ ] No file > 300 lines (split if needed)
- [ ] Logging on errors
- [ ] README section updated for new env vars
- [ ] Manual Stremio test noted in PR description

---

## 19. נספחים

### 19.1 Put.io API Quick Reference

| Method | Path | Use |
|--------|------|-----|
| GET | `/account/info` | Verify token |
| GET | `/files/list?parent_id=-1&per_page=1000&file_type=VIDEO` | Full index |
| POST | `/files/list/continue` | Pagination |
| GET | `/files/search?query=` | Catalog search |
| GET | `/files/{id}/url` | Download URL (IP-bound) |
| GET | `/files/{id}/subtitles` | List subs |
| GET | `/files/{id}/subtitles/{key}?format=webvtt` | Get sub |
| GET | `/files/list?mp4_stream_url=true` | Transcoded URL |
| GET | `/events/list` | Change detection |
| GET | `/oauth2/oob/code?app_id=` | OOB auth |
| POST | `/files/{id}/start-from` | Save resume |

### 19.2 Stremio Routes Quick Reference

| Route | Response |
|-------|----------|
| `/manifest.json` | `{ id, version, name, resources, types, catalogs }` |
| `/catalog/series/putio_folder_1165897681.json` | `{ metas: [ series groups, movies, unsorted ] }` per root folder |
| `/catalog/series/putio_folder_{id}/search=matrix.json` | filtered metas within folder |
| `/meta/series/putio:folder:1165897681:series:friends.json` | `{ meta: { videos: [...] } }` — episodes in that folder only |
| `/meta/movie/putio:movie:123.json` | `{ meta: { ... } }` |
| `/stream/movie/putio:movie:123.json` | `{ streams: [{ url, behaviorHints }] }` |
| `/subtitles/movie/putio:movie:123.json` | `{ subtitles: [{ id, url, lang }] }` |

### 19.3 ID Encoding Examples

| File | Parsed | Stremio IDs |
|------|--------|-------------|
| `Alien.Romulus.2024.1080p.mkv` | movie | meta/stream: `putio:movie:84392` |
| `Friends.S04E08.mkv` | episode | meta: `putio:folder:{rootId}:series:friends`, video: `putio:episode:{putioFileId}` |
| `One Punch Man - 01 [1080p]....mkv` | episode | BlazeAnime dash pattern; video: `putio:episode:{putioFileId}` |
| `random_clip.mp4` | unknown | `putio:raw:99999` in unmatched catalog |

### 19.4 Open Questions — לבדוק עם חשבון Put.io אמיתי

| # | שאלה | השפעה |
|---|------|--------|
| Q1 | האם `mp4_stream_url` עובד cross-device אחרי proxy? | Fallback webOS |
| Q2 | מה שפות ב-`/subtitles` list בפועל? | Mapping HE |
| Q3 | Rate limits אמיתיים? | Worker tuning |
| Q4 | OAuth refresh token — קיים? | Token renewal |
| Q5 | `parent_id=-1` performance על 10K+ files? | Scan strategy |
| Q6 | HLS segments — IP-bound גם כן? | HLS priority |

### 19.5 References

- Stremio Protocol: https://stremio.github.io/stremio-addon-sdk/protocol.html
- Stremio Manifest: https://stremio.github.io/stremio-addon-sdk/api/responses/manifest.html
- Stremio Stream: https://stremio.github.io/stremio-addon-sdk/api/responses/stream.html
- Stremio Subtitles: https://stremio.github.io/stremio-addon-sdk/api/responses/subtitles.html
- Put.io OAS: https://gist.github.com/dskvr/bdcb4da5c8501bc01b06c6865aa941c4
- Put.io JS SDK: https://github.com/putdotio/putio-js
- Put.io OAuth Help: http://help.put.io/en/articles/5972538-how-to-get-an-oauth-token-from-put-io
- TMDb API: https://developer.themoviedb.org/
- StremThru (proxy pattern): https://github.com/elfhosted/stremthru

---

*מסמך זה נוצר לאחר אימות מול תיעוד Stremio Addon SDK ו-Put.io API v2.7.0. עדכון אחרון: 2026-07-01 (v1.1 — פרופיל בעלים).*
