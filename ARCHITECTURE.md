# Hoboken Parking — Architecture

A static PWA. No backend server. One daily cron job keeps the data fresh.

---

## System

```
Hoboken City API
        │  once daily (GitHub Action)
        ▼
fetcher/fetch.ts  →  data/latest.json  →  Vercel CDN
                                                │
                                         iPhone / Android / Browser
                                         (PWA, installs to home screen)
```

The app fetches `latest.json` at startup. All filtering and logic runs client-side.
If the daily fetch fails, the previous day's data is still served.

---

## Data Flow (inside the browser)

```
latest.json  (116 signs, some expired)
     │
     │  filterLoadTimeNoise()  — once at startup
     ▼
allSigns  (~93 valid signs)
     │
     │  filterActive()  — every 60 seconds
     ▼
activeSigns
     │
     ├─ CHECK mode  →  map pins + evaluated parking segments for a time window
     │
     └─ RULES mode  →  click location + selected time
                          → nearby parking segments + exact rule sections
```

---

## User Flows

**Flow 1 — Check a parking window**
Choose a duration or query → app evaluates all parking segments → map highlights unsafe/limited/tow/snow segments → bottom sheet can show segment details.

**Flow 2 — Inspect exact rules**
Switch to Rules → choose now or a custom time → tap the map → app finds nearby parking segments → bottom sheet lists active and upcoming rules for that location.

**Flow 3 — Browse map context**
Toggle tow zones, upcoming tow zones, street-cleaning highlights, municipal garages, and snow emergency routes. These layers are visual context only; they do not save a parked spot or run background monitoring.

Saved spots, reminders, push notifications, and background monitoring are intentionally out of scope for the current product direction. Some legacy helpers/tests still exist from earlier feature generations, but the runtime product model is Check | Rules.

---

## File Structure

```
parking_app/                  ← repo root (scaffolding only)
├── data/                     seed data read by fetcher and agents
├── docs/                     API and schema documentation (discovery features)
├── harness/                  workflow scripts and feature state
│   └── stuck/                stuck-reason files when a feature exceeds MAX_REVISIONS
├── specs/                    feature specs written before any code
├── CLAUDE.md / ARCHITECTURE.md
└── generated_app/            ← everything the harness builds (rm -rf to reset)
    ├── shared/
    │   ├── types.ts          sign types shared between fetcher and app
    │   ├── parking-logic.ts  pure parking-window and sign logic
    │   ├── schedule.ts       shared street-cleaning schedule parser
    │   ├── segment-catalog.ts builds side/location parking segments
    │   ├── rules-inspector.ts exact rules for clicked map locations
    │   └── storage.ts        legacy saved-spot storage, retained for tests
    ├── fetcher/
    │   └── fetch.ts          hits Hoboken API, validates, writes latest.json
    ├── app/
    │   ├── index.html        single HTML shell
    │   ├── style.css         mobile-first styles
    │   ├── app.ts            Check | Rules state machine
    │   ├── main.ts           browser bootstrap/orchestration
    │   ├── data-loader.ts    JSON fetch/load helpers
    │   ├── check-controller.ts Check controls and query execution
    │   ├── rules-controller.ts Rules controls and inspection rendering
    │   ├── layer-toggles.ts  map layer toggle wiring
    │   ├── map.ts            Leaflet wrapper and layer renderers
    │   ├── ui.ts             DOM rendering helpers
    │   ├── geo.ts            street name lookup via Nominatim reverse geocoding
    │   ├── manifest.json     PWA install metadata
    │   └── sw.ts             service worker (offline caching)
    ├── tests/                Vitest test suite using latest.json as fixture
    ├── package.json
    ├── tsconfig.json
    ├── vitest.config.ts
    └── .github/workflows/    GitHub Action: test → typecheck → fetch → deploy
```

---

## Tech Stack

| Concern | Choice |
|---------|--------|
| Language | TypeScript (strict) |
| App framework | None — vanilla JS |
| Map | Leaflet.js + OpenStreetMap |
| Storage | localStorage |
| Bundler | esbuild |
| Tests | Vitest |
| Hosting | Vercel (free tier, auto-deploy on push) |
| CI/CD | GitHub Actions |

---

## App State

```typescript
type AppState =
  | { mode: "loading" }
  | { mode: "error"; message: string }
  | {
      mode: "ready";
      activeMode: "check" | "rules";
      allSigns: Sign[];
      activeSigns: Sign[];
      parkingSegments: ParkingSegment[];
      checkQuery: CheckQuery;
      checkResults: CheckResultSegment[];
      selectedCheckSegment: CheckResultSegment | null;
      rulesTime: { mode: "now" | "custom"; selectedTime: Date };
      selectedRulesLocation: { lat: number; lng: number; street?: string } | null;
      rulesInspectionSections: RulesInspectionSection[];
    }
```

State lives in `app.ts`. Shared parking rules live in `shared/`. Browser orchestration is split across `main.ts`, `data-loader.ts`, `check-controller.ts`, `rules-controller.ts`, and `layer-toggles.ts`. The map module owns Leaflet access and layer rendering.

---

## Sign Data

Signs come from the Hoboken city API as temporary no-parking records. Each has a location, a reason (CONSTRUCTION / MOVING / EVENT / DELIVERY), and a time window. About 100–120 signs are in each fetch; ~60–90 are active at any given time. Fifteen are permanent (end date 2030). One has a bad coordinate and is filtered out at startup.
