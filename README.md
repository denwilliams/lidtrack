# lidtrack

Passive macOS time tracking with self-hosted sync to Cloudflare.

Tracks lid state, Wi-Fi network, and foreground app across multiple Macs. Syncs completed days to a Cloudflare Worker + D1 database. View aggregated data on a mobile-friendly dashboard.

## Components

| Directory | What it is |
|---|---|
| `mac/` | SwiftUI menu bar app (macOS 14+) |
| `worker/` | Cloudflare Worker API (TypeScript, Hono, D1) |
| `dashboard/` | Vite + React dashboard (Cloudflare Pages) |

## Setup

See `CLAUDE.md` for full architecture, data model, and build commands.

### 1. Cloudflare

- Add your domain to Cloudflare
- Enable Zero Trust (free tier) and configure Google as an identity provider
- Create an Access application for the API domain
- Create a D1 database and deploy the Worker (see `worker/` below)
- Create one service token per Mac (Zero Trust → Access → Service Auth → Service Tokens)

### 2. Worker

```sh
cd worker
npm install
cp .dev.vars.example .dev.vars   # fill in TEAM_DOMAIN and AUD_TAG for local dev
npm run dev                       # local dev on localhost:8787
```

For production, create `wrangler.prod.toml` (gitignored) with your domain and credentials:

```toml
name = "lidtrack-worker"
main = "src/index.ts"
compatibility_date = "2024-11-01"
workers_dev = false

[[routes]]
pattern = "lidtrack-api.yourdomain.com"
custom_domain = true

[[d1_databases]]
binding = "DB"
database_name = "lidtrack-db"
database_id = "your-d1-database-id"

[vars]
TEAM_DOMAIN = "your-team.cloudflareaccess.com"
AUD_TAG = "your-aud-tag"
```

```sh
npm run db:migrate:prod   # create tables
npm run deploy:prod       # deploy
```

### 3. Mac app

```sh
cd mac
brew install xcodegen
xcodegen generate
open LidTracker.xcodeproj
```

Build with Cmd+B. On first launch, open Settings from the menu bar and paste your API URL and service token credentials.

#### Distributing to other Macs

Build once, then copy `LidTracker.app` to the other Mac. Run this once on the receiving machine to clear the quarantine flag that blocks unsigned apps:

```sh
xattr -dr com.apple.quarantine /path/to/LidTracker.app
```

No re-signing or re-publishing required — the app runs indefinitely. Each Mac needs its own service token configured in Settings.

### 4. Dashboard

```sh
cd dashboard
npm install
npm run dev    # localhost:5173, proxies API calls to localhost:8787
npm run build  # deploy the dist/ folder to Cloudflare Pages
```

## How it works

The Mac app samples the foreground app and idle time every 30 seconds, recording to a local SQLite database. At midnight, it coalesces the day's samples into contiguous time ranges and pushes them to the Worker. The dashboard fetches these ranges and computes all rollups (active time, by app, by network, per device) in the browser.

The current day is never synced — it stays buffered locally until midnight.
