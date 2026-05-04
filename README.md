# Blinkit Fleet Dashboard

Internal Emo dashboard for tracking the Blinkit-rider fleet (riders, vehicles, distance, behavior). Joins Mongo (rider profiles) with Intellicar (live telemetry).

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in real values
npm run dev
```

Open http://localhost:3000 and log in with `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD`.

## Environment

| Var | Purpose |
| --- | --- |
| `MONGODB_URI` | Atlas connection string. Database `test`. |
| `MONGODB_DB` | Defaults to `test`. |
| `INTELLICAR_BASE_URL` | `https://apiplatform.intellicar.in/api/standard` |
| `INTELLICAR_USERNAME` / `INTELLICAR_PASSWORD` | Service account that can read fleet telemetry. |
| `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` | Single shared login. |
| `SESSION_SECRET` | 32+ char random string for cookie encryption. |

## Architecture

- **Next.js 15** App Router, server components, single API per data shape.
- **Mongo native driver** — `test.riders` filtered by `isBlinkitRider: true`. Vehicle join key is `vehicleAssigned.vehicleId` ↔ Intellicar `vehicleno` (Indian registration plate).
- **Intellicar** — token cached in module memory (~14d TTL, refresh on 401). Live GPS cached 25s; GPS history cached 60s.
- **Behavior** derivation in `src/lib/behavior.ts` — splits GPS history into trips by ignition gaps, computes distance, idle, max/avg speed, harsh accel/brake proxies (km/h Δ per second), battery dips.
- **Auth** — `iron-session` cookie + `src/middleware.ts` gate. Single user pulled from env.
- **Map** — MapLibre + Carto Positron tiles (no API key).

## Project layout

```
src/
  app/                          # routes
    page.tsx                    # / overview
    riders/page.tsx             # /riders index
    riders/[id]/page.tsx        # /riders/:id detail
    zones/[zone]/page.tsx       # /zones/:zone
    login/page.tsx
    api/auth/{login,logout}/route.ts
    api/riders/route.ts
    api/riders/[id]/history/route.ts
    api/live/route.ts
  components/                   # UI
  lib/                          # mongo, intellicar, behavior, auth, data
  config/zones.ts               # canonical-zone alias map
  middleware.ts                 # auth gate
```

## Deploying to Vercel

1. Push to GitHub.
2. Import in Vercel.
3. Add every env var from `.env.local` to the Vercel project settings.
4. Atlas IP allowlist must include `0.0.0.0/0` (or Vercel's egress IPs).

## Operational notes

- The `test` database (despite its name) is the live production-current dataset. Last update times track real activity.
- The Blinkit subset is `{ isBlinkitRider: true }` — currently 25 riders.
- Many `DL3SGH****` plates in our Blinkit fleet currently return "Permission failure" from Intellicar — they need to be added to the `emo_pull` account before live data appears for them.
- Zone names in Mongo are free-text and dirty; the canonical mapping is in `src/config/zones.ts`. Add new aliases there as new variations appear.

## Local helpers

`_investigate/` contains throwaway Node scripts used during initial schema discovery. Gitignored.
