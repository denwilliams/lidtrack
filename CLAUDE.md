# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

LidTracker is a personal macOS time-tracking system with three components:

1. **Mac menu bar app (SwiftUI)** — passively collects lid state, Wi-Fi SSID, and foreground app every 30s; buffers in local SQLite; coalesces and syncs completed days to the Worker.
2. **Cloudflare Worker (TypeScript, Hono)** — thin authenticated REST API over D1. No coalescing logic — client owns that.
3. **Dashboard (Vite + React, Cloudflare Pages)** — mobile-first SPA, fetches JSON and computes all rollups in JS.

All three are gated by Cloudflare Zero Trust (Access): Google login for the dashboard, service tokens for Mac clients.

## Commands

### Worker
```sh
cd worker
npm install
npm run dev              # wrangler dev on localhost:8787
npm run deploy           # deploy to Cloudflare
npm run db:migrate:local # apply migrations locally
npm run db:migrate:remote
wrangler secret put AUD_TAG   # set the Access AUD tag secret
```
Copy `worker/.dev.vars.example` to `worker/.dev.vars` and fill in values for local dev.

### Dashboard
```sh
cd dashboard
npm install
npm run dev    # Vite dev server on localhost:5173 (proxies /ranges, /events, /devices to :8787)
npm run build
```

### Mac app
```sh
cd mac
brew install xcodegen
xcodegen generate    # creates LidTracker.xcodeproj (gitignored)
open LidTracker.xcodeproj
# Run tests: Cmd+U in Xcode, or xcodebuild test -scheme LidTracker -destination 'platform=macOS'
```

## Recommended build order

1. Cloudflare platform setup (Zero Trust, Access apps, service tokens, D1) — no code
2. Mac client, local-only (SQLite + collectors + menu bar UI, no sync)
3. Worker + D1 endpoints + JWT middleware
4. Wire client sync; validate on one Mac for ~a week before building the dashboard
5. Dashboard (design against real data, not mocks)
6. Roll out to other Macs (one service token per machine)

## Mac client

- **Language/framework:** Swift + SwiftUI, targeting macOS 14+
- **Surface:** menu bar only (`LSUIElement = true`), no Dock icon, launch at login via `SMAppService`
- **Permissions:** Location Services (required for SSID on macOS 14+) and Login Items; no Accessibility, Automation, or Full Disk Access
- **Local DB:** SQLite at `~/Library/Application Support/LidTracker/events.db`

### Collectors

| Source | Mechanism | Frequency |
|---|---|---|
| Lid | `NSWorkspace.willSleepNotification` / `didWakeNotification` | Event-driven |
| Wi-Fi | `CWWiFiClient` + `CWEventDelegate` | Event-driven |
| Foreground app | `Timer` + `NSWorkspace.shared.frontmostApplication` | Every 30s |
| Idle | `CGEventSourceSecondsSinceLastEventType` | Inline with each app sample |

Samples with `idle_secs > 60` are recorded but flagged — dashboard excludes them from active time.

### Local SQLite schema

```sql
CREATE TABLE samples (
  id TEXT PRIMARY KEY, occurred_at INTEGER NOT NULL, local_date TEXT NOT NULL,
  bundle_id TEXT, app_name TEXT, ssid TEXT, idle_secs INTEGER NOT NULL, lid_open INTEGER NOT NULL
);
CREATE TABLE events (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, occurred_at INTEGER NOT NULL, local_date TEXT NOT NULL, payload TEXT NOT NULL
);
CREATE TABLE synced_days (local_date TEXT PRIMARY KEY, synced_at INTEGER NOT NULL);
```

### Coalesce logic (at day rollover)

Walk samples sorted by `occurred_at`; group consecutive rows with matching `(bundle_id, ssid, lid_open)` and gap ≤ 60s into a single range. Increment `active_count` if `idle_secs <= 60`, else `idle_count`. Push the completed day, then on 2xx prune those samples + events and record in `synced_days`.

### Sync triggers

Midnight local time, app launch (catches missed days), `didWakeNotification`. Never pushes the in-progress day.

### Auth (Cloudflare service token)

Credentials stored in Keychain (`kSecClassGenericPassword`, service `net.denwilliams.lidtracker`). Sent on every request as `CF-Access-Client-Id` / `CF-Access-Client-Secret` headers. First-run settings window prompts for both values, validates via `GET /devices`, saves on success.

## Worker (Cloudflare Worker + D1)

- **Stack:** TypeScript, Hono, Wrangler
- **`workers_dev = true`** by default — works on `*.workers.dev` out of the box. For production behind Zero Trust, set to `false` and uncomment the `[[routes]]` block with your own domain.
- JWT from `Cf-Access-Jwt-Assertion` header should be verified in middleware (defence in depth). Service-token JWTs include `common_name` — use this as `device_id` rather than trusting the client payload.

### Endpoints

- `POST /days` — idempotent insert of one completed day. Checks `synced_days(device_id, local_date)` first; returns `{ ok: true, already_synced?: bool }`. All inserts in a single D1 transaction.
- `GET /ranges?from=&to=&device_id=` — cap 92 days per request
- `GET /events?from=&to=&device_id=`
- `GET /devices`

### Server D1 schema

```sql
CREATE TABLE ranges (
  id TEXT PRIMARY KEY, device_id TEXT NOT NULL, local_date TEXT NOT NULL,
  started_at INTEGER NOT NULL, ended_at INTEGER NOT NULL,
  bundle_id TEXT, app_name TEXT, ssid TEXT, lid_open INTEGER NOT NULL,
  active_count INTEGER NOT NULL, idle_count INTEGER NOT NULL
);
CREATE INDEX idx_ranges_device_date ON ranges(device_id, local_date);
CREATE INDEX idx_ranges_started ON ranges(started_at);

CREATE TABLE events (
  id TEXT PRIMARY KEY, device_id TEXT NOT NULL, local_date TEXT NOT NULL,
  type TEXT NOT NULL, occurred_at INTEGER NOT NULL, payload TEXT NOT NULL
);
CREATE INDEX idx_events_device_date ON events(device_id, local_date);

CREATE TABLE devices (device_id TEXT PRIMARY KEY, name TEXT NOT NULL, tz TEXT NOT NULL, last_seen INTEGER NOT NULL);

CREATE TABLE synced_days (
  device_id TEXT NOT NULL, local_date TEXT NOT NULL, synced_at INTEGER NOT NULL,
  PRIMARY KEY (device_id, local_date)
);
```

## Dashboard

- **Stack:** Vite, React, ShadCN, Tailwind, TanStack Query, Recharts
- **Deployed to:** Cloudflare Pages, custom domain `lidtracker.dennis.com.au`, behind Access (Google login only)
- All rollups (active time, by-app, by-SSID, per-device) are computed in JS from raw ranges — no server-side aggregation
- `fetch()` calls use `credentials: 'include'`; on 302/401 do `window.location.reload()` to let Access handle the redirect
- Range picker defaults to last 7 days; greys out today (in-progress day is never synced)

## Push payload shape

```json
{
  "device_id": "...", "device_name": "...", "tz": "Australia/Melbourne", "local_date": "YYYY-MM-DD",
  "ranges": [{ "id": "...", "started_at": 0, "ended_at": 0, "bundle_id": "...", "app_name": "...", "ssid": "...", "lid_open": true, "active_count": 0, "idle_count": 0 }],
  "events": [{ "id": "...", "type": "lid_open|wifi_change", "occurred_at": 0, "payload": {} }]
}
```

## Key decisions

- Day rollover at midnight in Mac's local TZ; TZ changes mid-day are accepted as edge-case noise
- Completed-and-synced days are pruned from local SQLite immediately; unsynced days remain
- Lid closed + external display is treated as "not in use" in v1
- Per-device active time (not merged across Macs on same SSID)
- Bundle IDs and SSIDs leave the device and are stored on Cloudflare — deliberate choice for personal single-user use
