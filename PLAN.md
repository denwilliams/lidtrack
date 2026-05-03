# LidTracker — Plan

A personal time-tracking system that records lid state, Wi-Fi network, and foreground app across multiple Macs, syncs to Cloudflare, and surfaces daily activity on a mobile-friendly dashboard.

## Goals

- Passively track when each Mac is "in use" (lid open + not idle).
- Attribute that time to a Wi-Fi network (proxy for location) and a foreground app.
- View aggregated data from any device — primarily phone.
- Run across multiple Macs, single user.
- Minimal moving parts, low monthly cost.

## Non-goals (for v1)

- Window titles, URLs, or per-document tracking (would require Accessibility/Automation permissions).
- Real-time push — batch sync is fine.
- Sharing/multi-user.
- Native iOS app — web dashboard is enough.
- Manual time entry, projects, or invoicing.

## Architecture

```
┌──────────────────┐                          ┌──────────────────┐
│  Mac menu bar    │                          │ Cloudflare Pages │
│  app (SwiftUI)   │                          │ (Vite + React)   │
│  + SQLite buffer │                          │ Dashboard        │
└────────┬─────────┘                          └────────┬─────────┘
         │ pushes one completed day at a time           │ queries by range
         ▼                                              ▼
       ┌──────────────────────────────────────────────────┐
       │           Cloudflare Worker (TS)                 │
       │   - POST /days   (upload completed day)          │
       │   - GET  /ranges (query by date range + device)  │
       │   - GET  /events (lid/wifi transitions)          │
       │   - GET  /devices                                │
       └────────────────────────┬─────────────────────────┘
                                │
                                ▼
                          ┌──────────┐
                          │    D1    │
                          └──────────┘
```

Three components, all gated by Cloudflare Zero Trust (Access).

## Data model

Client buffers raw 30s samples locally during the day. At day rollover, client coalesces into ranges and pushes the completed day to the Worker. Worker inserts into D1.

### Client (local SQLite)

```sql
CREATE TABLE samples (
  id          TEXT PRIMARY KEY,           -- UUID
  occurred_at INTEGER NOT NULL,           -- unix epoch ms
  local_date  TEXT NOT NULL,              -- YYYY-MM-DD in Mac's local TZ
  bundle_id   TEXT,
  app_name    TEXT,
  ssid        TEXT,
  idle_secs   INTEGER NOT NULL,
  lid_open    INTEGER NOT NULL
);

CREATE TABLE events (                     -- lid/wifi transitions
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  local_date  TEXT NOT NULL,
  payload     TEXT NOT NULL
);

CREATE TABLE synced_days (                -- which days have been pushed
  local_date  TEXT PRIMARY KEY,
  synced_at   INTEGER NOT NULL
);
```

### Server (D1)

```sql
CREATE TABLE ranges (
  id           TEXT PRIMARY KEY,           -- client UUID
  device_id    TEXT NOT NULL,
  local_date   TEXT NOT NULL,              -- YYYY-MM-DD in client's TZ
  started_at   INTEGER NOT NULL,           -- unix epoch ms
  ended_at     INTEGER NOT NULL,
  bundle_id    TEXT,
  app_name     TEXT,
  ssid         TEXT,
  lid_open     INTEGER NOT NULL,
  active_count INTEGER NOT NULL,           -- samples with idle_secs <= 60
  idle_count   INTEGER NOT NULL
);

CREATE INDEX idx_ranges_device_date ON ranges(device_id, local_date);
CREATE INDEX idx_ranges_started     ON ranges(started_at);

CREATE TABLE events (
  id          TEXT PRIMARY KEY,
  device_id   TEXT NOT NULL,
  local_date  TEXT NOT NULL,
  type        TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  payload     TEXT NOT NULL
);

CREATE INDEX idx_events_device_date ON events(device_id, local_date);

CREATE TABLE devices (
  device_id   TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  tz          TEXT NOT NULL,
  last_seen   INTEGER NOT NULL
);

CREATE TABLE synced_days (                -- idempotency at day granularity
  device_id   TEXT NOT NULL,
  local_date  TEXT NOT NULL,
  synced_at   INTEGER NOT NULL,
  PRIMARY KEY (device_id, local_date)
);
```

### Push payload (one completed day)

```json
{
  "device_id": "A1B2...",
  "device_name": "Dennis MacBook Pro",
  "tz": "Australia/Melbourne",
  "local_date": "2026-05-03",
  "ranges": [
    {
      "id": "uuid-...",
      "started_at": 1714694400000,
      "ended_at":   1714698000000,
      "bundle_id":  "com.microsoft.VSCode",
      "app_name":   "Code",
      "ssid":       "Home",
      "lid_open":   true,
      "active_count": 110,
      "idle_count":   10
    }
  ],
  "events": [
    { "id": "uuid-...", "type": "lid_open",    "occurred_at": 1714694400000, "payload": {} },
    { "id": "uuid-...", "type": "wifi_change", "occurred_at": 1714710000000, "payload": { "ssid": "Office" } }
  ]
}
```

### Coalesce logic (client-side, at day rollover)

1. Select all samples + events for the completed `local_date`.
2. Sort samples by `occurred_at`.
3. Walk samples; group consecutive samples with matching `(bundle_id, ssid, lid_open)` and gap ≤ 60s into ranges. Increment `active_count` if `idle_secs <= 60`, else `idle_count`.
4. Push as one payload to `POST /days`.
5. On 2xx, mark `local_date` synced and prune samples + events for that date.

### Idempotency (server-side)

`POST /days` checks `synced_days` for `(device_id, local_date)`. If present, returns 200 with `{ already_synced: true }` and does nothing. Otherwise inserts ranges + events, upserts the device row, marks the day synced — all in one D1 transaction.

This means a retry after a network blip is safe, but it also means **a day cannot be re-pushed**. If the client somehow had more data for that day later (shouldn't happen with this model, but worth noting), it would be silently rejected.

## Mac client (SwiftUI menu bar app)

**Surface:** menu bar only (`LSUIElement = true`), no Dock icon. Click for today's summary + sync status. Launch at login via `SMAppService`.

**Permissions prompted on first run:**
- Location Services — required for SSID on macOS 14+.
- Login item registration.
- (No Accessibility, no Automation, no Full Disk Access.)

**Local store:** SQLite at `~/Library/Application Support/LidTracker/events.db`. Same schema as server, plus a `synced_at` column.

**Collectors:**

| Source | Mechanism | Frequency |
|---|---|---|
| Lid | `NSWorkspace.willSleepNotification` / `didWakeNotification` | Event-driven |
| Wi-Fi | `CWWiFiClient` + `CWEventDelegate` for SSID changes | Event-driven |
| Foreground app | `Timer` reading `NSWorkspace.shared.frontmostApplication` | Every 30s |
| Idle check | `CGEventSourceSecondsSinceLastEventType` | Inline with each app sample |

App samples where `idle_seconds > 60` are still recorded but flagged so the dashboard can exclude them from "active time."

**Sync loop:**

- Triggered: at midnight local time, on app launch (catches missed days), on `didWakeNotification` (catches days completed while asleep).
- Finds all `local_date` values older than today that aren't in `synced_days`.
- For each unsynced day: coalesce, `POST /days` with bearer token and the day payload.
- On 2xx, record in `synced_days` and prune samples + events for that date.
- On failure, retry on next trigger. Idempotent server-side via `(device_id, local_date)` check.
- The day in progress is never pushed.

**Local retention:** completed-and-synced days are pruned immediately. The in-progress day plus any unsynced days remain in the buffer.

**Retention:** keep 30 days of synced events locally as a buffer, then prune.

## Server (Cloudflare Worker + D1)

**Stack:** TypeScript, Hono framework, Wrangler for deploy, single D1 database.

The Worker is a thin authenticated layer over D1. No coalesce logic (client owns that). No aggregation logic (dashboard does it in the browser).

**Endpoints:**

- `POST /days` — validates payload, idempotent insert of one completed day's ranges + events. Returns `{ ok: true, already_synced?: bool }`.
- `GET /ranges?from=&to=&device_id=` — ranges in the local-date range, optionally filtered by device. Cap of 92 days per request.
- `GET /events?from=&to=&device_id=` — lid/wifi transitions in the same range.
- `GET /devices` — list of known devices with `last_seen` timestamp.

**Auth:** All endpoints sit behind Cloudflare Zero Trust (Access). See the dedicated Authentication section below for the full setup.

**Volume sanity check (per Mac, per year):**
- ~30 ranges/day × 365 = ~11k rows/year
- ~20 events/day × 365 = ~7k rows/year
- 3 Macs over 5 years: ~270k rows total

D1 free tier: 5GB storage, 5M reads/day, 100k writes/day. Personal use is comfortably within limits.

## Authentication (Cloudflare Zero Trust)

All three components — Worker API, dashboard, and any future tooling — sit behind a single Access application. No bearer tokens to manage, no secrets in `localStorage`, no per-route auth code.

### How Access works

Cloudflare Access intercepts requests *before* they reach the Worker or Pages site. It either:

- Lets the request through (with a JWT injected as `Cf-Access-Jwt-Assertion`)
- Returns a 302 redirect to the login page (for browsers)
- Returns 401 (for non-browser clients)

By the time Worker code runs, the request is already authenticated. The Worker can be written as if everything is trusted.

### Two authentication paths

**1. Identity-based (browser → dashboard)**

User hits `lidtracker.dennis.com.au`, Access redirects to Google login, drops a `CF_Authorization` cookie on success. Subsequent requests carry the cookie. Dashboard `fetch()` calls use `credentials: 'include'` so the cookie tags along on API calls too.

**2. Service token (Mac client → API)**

The Mac client sends two headers on every request:

```
CF-Access-Client-Id:     abc123.access
CF-Access-Client-Secret: xyz789...
```

No interactive login, no cookie. One service token per Mac, stored in Keychain. Tokens are managed in the Zero Trust dashboard and can be revoked individually.

### Access policy

Single application covering the API hostname, with one policy that accepts both paths:

```
Application: lidtracker-api
  Domain:    lidtracker-api.dennis.com.au

Policy: allow-dennis
  Action: Allow
  Include:
    - Emails: dennis@...
    - Service Token: mac-mbp-personal
    - Service Token: mac-mbp-work
    - Service Token: mac-mini-home
```

Same setup for `lidtracker.dennis.com.au` (the dashboard) but without the service tokens — only email is needed there.

### Worker code: defence in depth

Access already gates the route, but the Worker should also verify the JWT to defend against someone hitting the underlying `*.workers.dev` URL directly. Two equivalent options:

**Option A — disable the workers.dev route entirely.** In `wrangler.toml`:

```toml
workers_dev = false
routes = [
  { pattern = "lidtracker-api.dennis.com.au/*", zone_name = "dennis.com.au" }
]
```

Now the Worker is only reachable via the Access-protected hostname. Simplest.

**Option B — verify the JWT in middleware.** Useful if you ever want both routes:

```typescript
import { Hono } from 'hono'
import { jwtVerify, createRemoteJWKSet } from 'jose'

const app = new Hono()
const JWKS = createRemoteJWKSet(
  new URL('https://<your-team>.cloudflareaccess.com/cdn-cgi/access/certs')
)

app.use('*', async (c, next) => {
  const jwt = c.req.header('Cf-Access-Jwt-Assertion')
  if (!jwt) return c.text('unauthorized', 401)
  try {
    const { payload } = await jwtVerify(jwt, JWKS, {
      issuer: 'https://<your-team>.cloudflareaccess.com',
      audience: '<application-aud-tag-from-access-dashboard>',
    })
    c.set('identity', payload)
  } catch {
    return c.text('unauthorized', 401)
  }
  await next()
})
```

Recommendation: do **both** — disable workers.dev *and* verify the JWT. The JWT carries the identity (email or service token name) which is useful for logging which Mac uploaded which day.

### Identifying the device from the JWT

Service-token JWTs include a `common_name` claim matching the service token's name. The Worker can use this as the source of truth for `device_id` instead of trusting the client payload:

```typescript
const identity = c.get('identity')
const deviceFromToken = identity.common_name  // e.g. "mac-mbp-personal"
```

This means the Mac client doesn't need to send `device_id` in the payload — the server derives it from the authenticated identity. Cleaner, can't be spoofed, simpler client code.

### Mac client implementation

```swift
struct AccessCredentials {
    let clientId: String
    let clientSecret: String
}

func authenticatedRequest(url: URL, creds: AccessCredentials) -> URLRequest {
    var request = URLRequest(url: url)
    request.setValue(creds.clientId,     forHTTPHeaderField: "CF-Access-Client-Id")
    request.setValue(creds.clientSecret, forHTTPHeaderField: "CF-Access-Client-Secret")
    return request
}
```

Credentials are stored in Keychain (`kSecClassGenericPassword`, service `com.dennis.lidtracker`). First-run UX: settings window prompts the user to paste both values from the Zero Trust dashboard, validates them by hitting `GET /devices`, saves on success.

### Dashboard implementation

```typescript
// Just fetch normally. Access handles login redirect.
const res = await fetch('/api/ranges?from=2026-04-01&to=2026-05-01', {
  credentials: 'include',
})
```

If the cookie is missing or expired, the request gets a 302 to the Access login flow. For SPAs this can be awkward (CORS-blocked redirect on `fetch`), so the dashboard checks for a 302/401 and does `window.location.reload()` to let Access take over the navigation.

### One-time Cloudflare setup

1. **Add domain to Cloudflare** (if not already): `dennis.com.au` (or whichever).
2. **Enable Zero Trust**: Cloudflare dashboard → Zero Trust → free plan, no card required for <50 users.
3. **Configure Google as identity provider**: Zero Trust → Settings → Authentication → Add Google. Follow Google OAuth client setup; paste client ID + secret back into Cloudflare.
4. **Create the API Access application**:
   - Type: Self-hosted
   - Domain: `lidtracker-api.dennis.com.au`
   - Identity providers: Google
   - Add policy `allow-dennis` (see above; service tokens added in step 6)
5. **Create the dashboard Access application**:
   - Type: Self-hosted
   - Domain: `lidtracker.dennis.com.au`
   - Same policy minus service tokens
6. **Create service tokens**: Zero Trust → Access → Service Auth → Service Tokens → Create. One per Mac. Copy the Client ID and Client Secret immediately — the secret is shown only once.
7. **Add service tokens to the API policy** (Include → Service Token).
8. **Deploy the Worker** with `workers_dev = false` and the route bound to `lidtracker-api.dennis.com.au`.
9. **Deploy the dashboard** to Pages, custom domain `lidtracker.dennis.com.au`.
10. **First-run on each Mac**: paste the service token credentials into the menu bar app's settings.

### Operational notes

- **Service tokens don't expire by default.** Set a 1-year expiry per token in the Access dashboard so a forgotten/lost Mac eventually loses access. Renewal is manual but rare.
- **Revocation** is immediate — delete the service token in the dashboard, the Mac stops working within seconds.
- **Cost**: Zero Trust free plan covers up to 50 users. Personal use is free indefinitely.
- **Wrangler secrets** still useful for non-auth secrets (e.g. `D1_DATABASE_ID`); not needed for auth.

## Dashboard (Vite + React on Cloudflare Pages)

**Stack:** Vite, React, ShadCN, Tailwind, TanStack Query for data fetching, Recharts for charts. Mobile-first since primary use is phone.

No SSR needed — it's a single-page app behind Zero Trust that fetches JSON and renders charts. Vite gives a smaller bundle and faster dev loop than Next for this shape.

**Load flow:**

1. First visit redirects to Google via Cloudflare Access. Cookie set on success.
2. App fetches `GET /devices` to populate device list.
3. User picks a range. App requests `GET /ranges?from=&to=` and `GET /events?from=&to=`.
4. App computes all rollups in JS (active time, by-app, by-SSID, per-device).
5. TanStack Query caches per range key.

**Page layout:**

1. **Range picker** — defaults to last 7 days. Day / week / month / year toggle.
2. **Headline numbers** — total active time, total lid-open time, top app, top SSID.
3. **Breakdowns** — horizontal bar charts for apps, SSIDs, and per-device split.

The current day isn't in the data (by design — it's still buffering on the Mac). Range picker greys out today.

## Build order

1. **Cloudflare setup.** Domain on Cloudflare, Zero Trust enabled, Google IdP configured, Access applications + service tokens provisioned. No code yet — just the platform.
2. **Mac client, local-only.** SQLite + collectors + menu bar UI showing today's totals from local data. No sync.
3. **Worker + D1.** Deploy `POST /days`, `GET /ranges`, `GET /events`, `GET /devices`. JWT verification middleware. Behind Access.
4. **Wire client sync.** Mac client pushes completed days. Run on one Mac for a week. Validate event volumes, idle threshold, SSID accuracy.
5. **Dashboard.** Vite + React behind Access. Build against real data, not mocks.
6. **Roll out to other Macs.** Each gets its own service token.

Stage 4 is the important one — the dashboard design should be informed by what the data actually looks like, not what I think it'll look like.

## Cost estimate (Cloudflare)

- Workers: free tier (100k requests/day).
- D1: free tier (5GB storage, 5M reads/day, 100k writes/day).
- Pages: free.

$0/month at this scale.

## Open questions (v2 considerations)

- **Multiple Macs, same SSID, same time** — counts as separate active time per device, or merged? Recommend per-device for v1.
- **Lid closed, external display** — currently treated as "not in use." Worth detecting clamshell mode (`CGDisplayIsActive` while lid closed) in v2 if it becomes a real gap.
- **Privacy** — bundle IDs and SSIDs are sent to Cloudflare. Personal use, single user, but worth being deliberate about it.

## Decisions

- **Headline metrics:** show both active time and lid-open time side by side.
- **Day rollover:** midnight in the Mac's local timezone. TZ changes mid-day are accepted as edge case noise.
- **Auth:** Cloudflare Zero Trust for everything. Service tokens for Macs, Google login for the dashboard.
- **Storage:** D1 (SQLite-on-Cloudflare). Schema in the Data model section.
- **Push model:** completed days only. Day in progress is never pushed.
- **Coalescing:** done client-side at day rollover. Server is a dumb store.
