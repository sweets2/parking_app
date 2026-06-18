# Plan: v2.2 Feature Specs — Check / Current / Alerts UX

## Context

This replaces the prior v2.1 feature plan for the parking app UX overhaul.

The old feature set F-46 through F-49 was too large and missed a critical algorithmic layer: a side-specific parking segment catalog. v2.2 keeps the improved v2.1 split into smaller features, but adds the missing click behavior and clarifies how the three app modes should work.

The app is not a native iOS/Android app and must not promise background push notifications. The UX should focus on fast visual parking decisions, exact road-section inspection, and saved-spot rechecking when the app is reopened.

---

## Product Model

The app has three modes:

| Mode   | User intent                                                 | Map click meaning                                                                                                                                   |
| ------ | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Check  | "Where can I park for this duration?"                       | Select/evaluate a highlighted parking segment for the chosen duration. Do not save a spot.                                                          |
| Current | "What are the exact rules for this road section right now?" | Drop an inspection dot, snap to the nearest side-specific segment, highlight that exact side/section, and show its rules below. Do not save a spot. |
| Alerts | "Remember where I parked so I can check it later."          | Save or move the watched parking spot.                                                                                                              |

"Check" is preferred over "Find" in the UI because the core user action is checking whether parking is safe for a time window. Internal type names may remain `findQuery`, `findResults`, etc. if renaming them would create extra churn, but visible labels should use "Check."

---

## What Needs to Change

### 1. Spec files to replace

Delete or supersede these old specs:

* `specs/F-46.md` → replaced by `F-46A`, `F-46B`, `F-46C`
* `specs/F-47.md` → replaced with reduced simple parser scope
* `specs/F-48.md` → replaced with window conflict evaluator and schedule expansion
* `specs/F-49.md` → replaced with parking segment catalog, not renderer

### 2. New spec files to create / update

* `specs/F-54.md` — Remove Dev Time Override / Production Safety Cleanup *(create first — see ordering)*
* `specs/F-46A.md` — Mode Shell + Bottom Nav + AppState migration
* `specs/F-46B.md` — Check Duration Bar
* `specs/F-46C.md` — Menu Drawer + Data Freshness
* `specs/F-47.md` — Simple Query Parser
* `specs/F-48.md` — Window Conflict Evaluator
* `specs/F-49.md` — Parking Segment Catalog
* `specs/F-50.md` — Side-Specific Check Result Renderer
* `specs/F-51.md` — Current Mode Inspector Panel
* `specs/F-52.md` — Check Bottom Sheet
* `specs/F-53.md` — Alerts / Saved Spot Panel Polish

### 3. `harness/features.json`

* Remove the old `F-46` entry.
* Add `F-54` with order 18 (before all UI work), depends on nothing.
* Add `F-46A` with order 19, depends on `F-54`.
* Add `F-46B` with order 20, depends on `F-46A`.
* Add `F-46C` with order 21, depends on `F-46A`.
* Update `F-47` with order 22, depends on `F-46A`.
* Update `F-48` with order 23, depends on `F-46A` and the feature that first produced `shared/parking-logic.ts`.
* Update `F-49` with order 24, depends on `F-46A` and `F-48`.
* Add `F-50` with order 25, depends on `F-46B` and `F-49`.
* Add `F-51` with order 26, depends on `F-46A`, `F-49`, and `F-50`.
* Add `F-52` with order 27, depends on `F-46A`, `F-50`, and `F-51`.
* Add `F-53` with order 28, depends on `F-52`.

---

## Module Architecture

| Module                      | Created in | Purpose                                                         |
| --------------------------- | ---------: | --------------------------------------------------------------- |
| `shared/query-parser.ts`    |      F-46B | `createDurationQuery`, then F-47 adds `parseParkingQuery`       |
| `shared/segment-catalog.ts` |       F-49 | Build/evaluate side-specific parking segments                   |
| `shared/rules-inspector.ts` |       F-51 | Convert clicked segment into exact current rules for Current mode |

---

## Shared Types

Add or refine these types in `shared/types.ts`.

```ts
// AppMode uses "check" as the canonical runtime string — visible UI label is also "Check"
export type AppMode = "check" | "current" | "alerts";

export type ParkingStatus =
  | "safe"
  | "ticket"
  | "tow"
  | "snow"
  | "limited"
  | "unknown";

export type ParkingSide =
  | "North"
  | "South"
  | "East"
  | "West"
  | "Both"
  | "Unknown";

export interface FindQuery {
  startTime: Date;
  endTime: Date;
  label: string;
  source: "duration" | "parser";
}

export interface ParkingWindowConflict {
  status: ParkingStatus;
  reason: string;
  label: string;
  startsAt?: Date;
  endsAt?: Date;
  sourceId?: string;
  // Mapping from Sign.reason: CONSTRUCTION|MOVING|EVENT|DELIVERY → "tow-sign"
  sourceType?: "street-cleaning" | "tow-sign" | "snow-route" | "unknown";
}

export interface SegmentGeometry {
  ways: Array<Array<[number, number]>>;
  clipped: boolean;
  source: "road-geometry";
}

export interface ParkingSegment {
  id: string;
  street: string;
  location: string;
  side: ParkingSide;
  schedule?: string;
  geometry?: SegmentGeometry;
  source: "street-cleaning" | "derived" | "sign";
}

export interface FindResultSegment {
  id: string;
  street: string;
  location: string;
  side: ParkingSide;
  status: ParkingStatus;
  conflicts: ParkingWindowConflict[];
  primaryConflict?: ParkingWindowConflict;
  geometry?: SegmentGeometry;
}

export interface RulesInspection {
  segmentId: string;
  street: string;
  location: string;
  side: ParkingSide;
  clickedLatLng: [number, number];
  statusNow: ParkingStatus;
  activeRules: ParkingWindowConflict[];
  upcomingRules: ParkingWindowConflict[];
  allRules: ParkingWindowConflict[];
  displayTitle: string;
}
```

---

## AppState Migration

Current state machine:

```ts
loading | error | browsing | parked
```

New state machine:

```ts
loading | error | ready
```

`ready` state contains:

```ts
{
  activeTab: AppMode;
  savedSpot: SavedSpot | null;
  findQuery: FindQuery;
  findResults: FindResultSegment[];
  selectedFindSegment: FindResultSegment | null;
  selectedRulesInspection: RulesInspection | null;
}
```

**All other shared data moves to `main.ts` module-level state**, which already held some of it before this migration. The complete list of module-level state in `main.ts` after F-46A:

```ts
// Data loaded from network
let _allSigns: Sign[] = [];
let _activeSigns: Sign[] = [];
let _nearbySigns: Sign[] = [];        // signs near savedSpot, when in alerts tab
let cleaningEntries: StreetCleaningEntry[] = [];
let _roadGeometry: RoadGeometry = {};
let _streetParity: Record<string, number> = {};
let _garages: Garage[] = [];
let _snowRoutes: SnowRoute[] = [];
let _fetchedAt: string | null = null;

// Derived state (built after data loads)
let _segmentCatalog: ParkingSegment[] = [];

// Current find results (synced from AppState for renderer use)
let _findResults: FindResultSegment[] = [];
```

`_segmentCatalog` is built once after `cleaningEntries` and `_roadGeometry` are both loaded, and rebuilt after any silent data refresh. Find results are recomputed from the catalog whenever the query or signs change.

**`app.ts` must expose `getState(): AppState`** so the central click dispatcher (see below) can read `activeTab` without a separate tracking variable.

Migration behavior:

* Existing `browsing` → `ready` with `activeTab: "check"`, `savedSpot: null`.
* Existing `parked` → `ready` with `activeTab: "alerts"`, `savedSpot: <spot>`.
* Tests that construct `AppState` objects must be updated.

Mode switching:

* Switching to Check:
  * clear Current inspection marker/highlight/panel state
  * keep saved spot
  * show Check duration bar and Check result layers
* Switching to Current:
  * clear selected Check bottom sheet if needed
  * hide Check duration bar
  * preserve Current layer toggle states
  * allow road-section inspection clicks
* Switching to Alerts:
  * clear Check result selection
  * clear Current inspection marker/highlight
  * show saved-spot panel
  * clicks save/move watched spot

---

## Central Map-Click Dispatcher

All map clicks must go through a single dispatcher function in `main.ts`. Do not let F-46A, F-51, and F-53 each register their own `map.on("click")` handler — that would result in multiple conflicting handlers on the same event.

Add this pattern in F-46A (or update it in F-51 as the current handler is implemented):

```ts
function handleMapClick(lat: number, lng: number): void {
  const state = app.getState();
  if (state.mode !== "ready") return;

  if (state.activeTab === "check") {
    handleCheckClick(lat, lng);
  } else if (state.activeTab === "current") {
    handleRulesInspectionClick(lat, lng);
  } else if (state.activeTab === "alerts") {
    handleSaveSpotClick(lat, lng);
  }
}
```

`handleCheckClick` and `handleRulesInspectionClick` are stubs in F-46A; they are fleshed out in F-50/F-51. `handleSaveSpotClick` replaces the current click-to-save logic.

---

## Async Data Load Order and Error State

Check results must not render until `cleaningEntries` and `_roadGeometry` are both loaded and `_segmentCatalog` has been built successfully.

If the catalog build fails or returns an empty array (e.g., network error on street-cleaning.json), Check mode must show an explicit empty state: "Unable to check parking segments — data unavailable." Do not silently show a blank map.

The existing startup sequence in `initBrowserApp()` already awaits `road-geometry.json` and `street-parity.json` before `createApp()`. Extend this to also await `street-cleaning.json`, then build `_segmentCatalog` before calling `createApp()`.

---

## Segment ID Normalization

Segment IDs are constructed as:

```
normalizeSegmentPart(street) + "|" + normalizeSegmentPart(location) + "|" + side.toLowerCase()
```

`normalizeSegmentPart(s)`:
1. Lowercase
2. Strip trailing periods (`.`)
3. Replace spaces with hyphens
4. Remove the word "between" if present at the start
5. Expand common abbreviations: `st` → `st`, `ave` → `ave`, `hwy` → `hwy` (keep short forms as-is after lowercasing)
6. Strip leading/trailing hyphens

Normalization examples:

| Input street      | Input location                            | Input side | Segment ID                                                  |
| ----------------- | ----------------------------------------- | ---------- | ----------------------------------------------------------- |
| `Washington St.`  | `9th St. to 10th St.`                     | `East`     | `washington-st\|9th-st-to-10th-st\|east`                   |
| `Garden Street`   | `Between 11th and 12th`                   | `West`     | `garden-street\|11th-and-12th\|west`                        |
| `Observer Hwy.`   | `Washington St. to Bloomfield St.`        | `Both`     | `observer-hwy\|washington-st-to-bloomfield-st\|both`        |
| `1st Street`      | `Willow Ave. to Clinton St.`              | `South`    | `1st-street\|willow-ave-to-clinton-st\|south`               |

IDs must be stable: same input always produces the same output. Tests must assert IDs by value, not by pattern.

---

## Washington Street Fixture Tests

Washington Street is the canonical hard case. The following scenarios must have explicit fixture tests in `tests/unit/segment-catalog.test.ts`:

1. Same street, multiple blocks → distinct segment IDs
2. Same block, two sides (East and West) → distinct segment IDs
3. `side === "Both"` → produces either a `Both` segment or two side-specific segments; either way no segment is silently dropped
4. Short one-block segment (single cleaning entry) → one segment, correct ID
5. Clicked point near West side → does not select East side segment
6. Current mode: second click replaces first `RulesInspection` result (previous marker and highlight are removed)

---

# Feature Specs

## F-54 — Remove Dev Time Override / Production Safety Cleanup

**Run this first — before F-46A.** F-46A rewrites `app/main.ts`. If F-54 runs after that rewrite, it must target the new file; if run before, the existing override is cleanly removed before the new architecture is introduced. Running this last risks days of development against fake time and Washington-Street-only data that accidentally shapes the UI.

### Output files

* `app/main.ts`
* any related tests

### Requirements

Remove or disable both hardcoded dev overrides currently in `main.ts`:

* `DEV_FORCE_NOW: Date | null` — set to `null` permanently or remove entirely
* `DEV_TEST_STREET` — remove the Washington Street filter from `findCleaningEntries` or wherever it is applied

If a dev override remains useful, it must be gated behind an explicit build-time flag (`process.env.DEV_OVERRIDE` or similar) that is absent from the production build and cannot be accidentally activated by setting a variable in source.

### Acceptance criteria

* Production/default build uses real current time (`new Date()` only in `main.ts` at call sites, never passed into pure modules).
* Production/default build loads all street-cleaning entries, not just Washington Street.
* Tests still have a clean way to inject fixed time via function parameters (existing pattern — no change needed).
* App behavior does not silently depend on a hardcoded June 2026 timestamp.

---

## F-46A — Mode Shell + Bottom Nav + AppState Migration

### Output files

* `app/app.ts`
* `app/main.ts`
* `app/ui.ts`
* `app/index.html`
* `app/style.css`
* `shared/types.ts`
* `tests/unit/app.test.ts`
* likely `tests/unit/main.test.ts`
* likely `tests/unit/ui.test.ts`

### Requirements

**AppState migration** — replace the `browsing | parked` union with a single `ready` state containing `activeTab`, `savedSpot`, `findQuery`, `findResults`, `selectedFindSegment`, `selectedRulesInspection` (see Shared Types section above).

**`app.ts` must add `getState(): AppState`** — the public method returns the current state. This is required for the central click dispatcher to read `activeTab` without maintaining a duplicate variable.

**Add types to `shared/types.ts`** — `AppMode`, `ParkingStatus`, `ParkingSide`, `FindQuery`, `ParkingWindowConflict`, `SegmentGeometry`, `ParkingSegment`, `FindResultSegment`, `RulesInspection`.

**Bottom navigation** — add a fixed bottom nav with three buttons: Check, Current, Alerts. The active button reflects `state.activeTab`. Tapping a button calls a new `setActiveTab(tab: AppMode)` transition on the app.

**Central click dispatcher** — register exactly one `map.on("click")` handler that calls `handleMapClick(lat, lng)`. The three per-mode handlers (`handleCheckClick`, `handleRulesInspectionClick`, `handleSaveSpotClick`) are stubs in this feature; they gain real behavior in F-50, F-51, and this feature (alerts/save), respectively.

**Module-level state in `main.ts`** — declare all data and derived-state variables listed in the AppState Migration section above.

**Scope note** — F-46A is large. The minimum passing criteria for tests is: AppState type round-trips correctly, `getState()` returns current state, tab switching updates `activeTab`, existing parked migration works. HTML/CSS for the bottom nav is also required for passing. Keep the bottom nav minimal — exact styling is refined in later features.

### Acceptance criteria

* App loads without regressions.
* Check tab is active by default for non-parked users.
* Existing parked state migrates into Alerts tab.
* Switching tabs does not lose the saved spot unless the user explicitly clears it.
* All AppState tests pass after migration.
* `app.getState()` returns current state.
* Exactly one map click handler is registered.

---

## F-46B — Check Duration Bar

### Output files

* `app/index.html`
* `app/style.css`
* `app/main.ts`
* `shared/query-parser.ts`
* `tests/unit/query-parser.test.ts`

### Requirements

Visible only in Check mode.

Top fixed bar:

```text
[☰] Check parking for [-] 1 day [+]
```

The hamburger opens the menu drawer (wired in F-46C; stub here).

Add to `shared/query-parser.ts`:

```ts
createDurationQuery(days: number, now: Date): FindQuery
```

Rules:

* Clamp duration to 1–7 days.
* `startTime = now`
* `endTime = now + days * 24 hours`
* `label = "1 day"`, `"2 days"`, etc.
* `source = "duration"`

Changing duration:

* updates `findQuery` in AppState
* recomputes Check results (calls into segment catalog evaluate once it exists; no-op stub until F-49)
* clears `selectedFindSegment`

Mic button: if a speech input button is present in this bar, it must be feature-detected (`SpeechRecognition` / `webkitSpeechRecognition`) and hidden when unavailable. Do not assume the API is present.

### Acceptance criteria

* Duration cannot go below 1 or above 7.
* Changing duration updates `findQuery` in AppState.
* Changing duration clears `selectedFindSegment`.
* Duration bar is hidden when not in Check mode.

---

## F-46C — Menu Drawer + Data Freshness

### Output files

* `app/index.html`
* `app/style.css`
* `app/main.ts`

### Requirements

A simple drawer behind the hamburger button (☰ in the Check duration bar and/or a standalone hamburger).

Drawer content:

* Links/buttons: Check, Current, Alerts (switch tabs, close drawer)
* Data freshness line

Data freshness:

* Use `_fetchedAt` from module state.
* Show "Updated today at X:XX AM" when fresh.
* Show a stale warning when data is old or `_fetchedAt` is null.

### Acceptance criteria

* Drawer opens/closes without error.
* Drawer tab links switch the active tab.
* Freshness line displays correctly when `_fetchedAt` is null (no crash).

---

## F-47 — Simple Query Parser

### Output files

* `shared/query-parser.ts`
* `tests/unit/query-parser.test.ts`

### Requirements

Add to `shared/query-parser.ts`:

```ts
parseParkingQuery(input: string, now: Date): FindQuery | null
```

Supported inputs:

* `1 day` / `2 days` / `N days`
* `for N days`
* `park for N days`
* `overnight`
* `until 8am`
* `until tomorrow morning`

Unsupported input returns `null`. No LLM. No paid API.

### Acceptance criteria

* Parser returns stable `FindQuery` objects for supported phrases.
* Parser returns `null` for ambiguous phrases instead of guessing.
* Tests cover day counts, overnight, until-time, and unsupported input.

---

## F-48 — Window Conflict Evaluator

### Output files

* `shared/parking-logic.ts`
* `tests/unit/parking-logic.test.ts`

### Requirements

Add exports:

```ts
intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean

isSignActiveInWindow(sign: Sign, windowStart: Date, windowEnd: Date): boolean

expandStreetCleaningSchedule(
  schedule: string,
  windowStart: Date,
  windowEnd: Date
): Array<{ start: Date; end: Date; label: string }>

isStreetCleaningActiveInWindow(
  schedule: string,
  windowStart: Date,
  windowEnd: Date
): boolean

getWorstParkingStatus(conflicts: ParkingWindowConflict[]): ParkingStatus
```

**Schedule expansion must not rely on 30-minute sampling** (the previous F-48 spec used this approach; this version replaces it). Instead:

1. Parse days of week and day ranges from the schedule string (same format as `StreetCleaningEntry.schedule`, e.g. `"Monday through Friday  8 am – 9 am"`).
2. Parse the time range.
3. Iterate calendar dates inside the requested parking window.
4. Emit exact `{ start, end }` occurrences for each matching day.
5. Use Eastern Time consistently with existing `isScheduleActiveNow` logic.

`ParkingWindowConflict.sourceType` mapping: all `Sign.reason` values (`CONSTRUCTION`, `MOVING`, `EVENT`, `DELIVERY`) map to `sourceType: "tow-sign"`. Street cleaning entries map to `sourceType: "street-cleaning"`.

Priority for `getWorstParkingStatus`:

```
tow > snow > ticket > limited > unknown > safe
```

### Acceptance criteria

* A street-cleaning window that overlaps any part of the requested parking duration creates a `ticket` conflict.
* Non-overlapping cleaning windows do not create conflicts.
* Multi-day queries correctly catch future cleaning occurrences.
* Tests cover `"Monday through Friday  8 am – 9 am"` style schedules.
* Tests cover overnight windows crossing midnight.
* Overnight query spanning Sunday into Monday catches Monday morning cleaning.

---

## F-49 — Parking Segment Catalog

### Output files

* `shared/segment-catalog.ts`
* `tests/unit/segment-catalog.test.ts`

### Requirements

Add:

```ts
buildParkingSegmentCatalog(
  cleaningEntries: StreetCleaningEntry[],
  roadGeometry: RoadGeometry,
  streetParity?: Record<string, number>
): ParkingSegment[]

evaluateParkingSegments(
  segments: ParkingSegment[],
  signs: Sign[],
  query: FindQuery,
  options?: { now?: Date }
): FindResultSegment[]
```

### Segment identity

Use the normalization rules from the "Segment ID Normalization" section above. IDs must be stable and deterministic.

### Segment creation

Seed the catalog from `cleaningEntries`. Each unique combination of (street, location, side) becomes a distinct `ParkingSegment`. Do not enumerate OSM roads.

This is required because Washington Street has multiple short sections with different rules on different sides. Do not collapse a full street into a single highlight.

### Handling "Both"

If `side === "Both"`, either:

1. Create a `Both` segment when side-specific geometry is unavailable, or
2. Split into two side-specific segments when geometry/parity data supports it.

Do not silently drop a `Both` entry.

### Geometry

Geometry lookup: match normalized street name, use location text to clip to the right section when possible. Mark `clipped: false` when exact bounds are unknown. Missing geometry does not prevent segment creation — the segment evaluates as `limited` or `unknown` without geometry.

### Evaluation

Start with `safe`. Then add conflicts using `expandStreetCleaningSchedule` / `isSignActiveInWindow` from F-48. Worst status wins via `getWorstParkingStatus`. Every `FindResultSegment` must have a `primaryConflict` when `status !== "safe"`.

### Tow-sign matching

Match signs to segments by:
1. Normalized street name
2. Side/parity when available
3. Address or nearest geometry point when available
4. Cross-street/location text when available
5. Fallback to `limited` / `unknown` when confidence is low — never apply every sign on a street to every segment

### Washington Street fixture tests

Must include:

* Same street, multiple blocks → distinct segment IDs
* Same block, two sides → distinct segment IDs
* `side === "Both"` → no segment silently dropped
* Short one-block segment → correct ID
* Clicked point near West side → does not select East side segment (if geometry is available)
* Current mode second click replaces first `RulesInspection` (test in `rules-inspector.test.ts`, referenced here as the canonical acceptance scenario)

### Acceptance criteria

* Washington Street-style data creates multiple distinct segments when locations differ by block/side.
* Segment IDs are stable and deterministic.
* Same street, different block = different segment.
* Same street/block, different side = different segment.
* Evaluation returns a clear `primaryConflict`.
* Missing geometry does not crash the app.
* `buildParkingSegmentCatalog` is called from `main.ts` after both `cleaningEntries` and `roadGeometry` are loaded; `_segmentCatalog` is rebuilt after silent data refresh.

---

## F-50 — Side-Specific Check Result Renderer

### Output files

* `app/map.ts`
* `app/main.ts`
* `tests/unit/map.test.ts`

### Requirements

Add:

```ts
renderFindResults(results: FindResultSegment[]): void
clearFindResults(): void
selectFindSegment(id: string): void
```

Visible UI says "Check," but internal function names may remain `Find`.

### Layer ownership

Do not push Check result layers into `_violationLayers`.

Use separate arrays:

```ts
_findResultLayers: LeafletLayer[]
_selectedFindLayers: LeafletLayer[]
```

The existing private `drawWaysHighlight` function currently pushes into `_violationLayers`. Refactor it so callers can pass a target layer array and style options instead of always writing into `_violationLayers`. Both `renderViolationHighlights` and the new `renderFindResults` should call this refactored helper.

### Status styles

* safe: green, solid
* ticket: red, dashed
* tow: red, solid + pin
* snow: blue
* limited: yellow
* unknown: gray

### Selection behavior

Clicking a Check result segment:

* selects that segment
* emphasizes it with heavier weight / opacity
* opens Check bottom sheet (stub until F-52)
* does not save a spot

### Acceptance criteria

* Clearing Check results removes all Check layers.
* Current mode layers and `_violationLayers` are unaffected by `clearFindResults()`.
* Selecting a segment visually emphasizes only that segment.
* Map click in Check mode does not create or move a saved spot.

---

## F-51 — Current Mode Inspector Panel

### Output files

* `app/index.html`
* `app/style.css`
* `app/main.ts`
* `app/ui.ts`
* `app/map.ts`
* `shared/rules-inspector.ts`
* `tests/unit/rules-inspector.test.ts`
* likely `tests/unit/map.test.ts`

### Requirements

Current mode is an inspection mode. It preserves the existing ability to click the map and inspect parking rules, but ties the result to a specific side/section using the segment catalog.

### Current mode click behavior

`handleRulesInspectionClick(lat, lng)` (stubbed in F-46A, implemented here):

1. Drop or move a temporary inspection dot at the clicked location.
2. Snap to the nearest side-specific `ParkingSegment` from `_segmentCatalog` when possible.
3. Highlight the exact inspected side/section using `_rulesInspectionLayers`.
4. Render a Current mode panel below the map.
5. Each new click replaces the previous inspection (remove old dot, old highlight, update panel).
6. Does not save or move the watched parking spot.

### Current mode panel content

* Street name
* Location / between-streets text
* Side (e.g. "west side")
* Current status based on current time
* Active rules now
* Upcoming rules
* All known rules for that segment
* "Check for duration" button → switch to Check mode, select/evaluate same segment
* "Save this spot" button → switch to Alerts mode, save clicked location

Example title:

```
Washington St between 11th St and 12th St — west side
```

Example body:

```
No active street cleaning right now.
Next street cleaning: Monday 8:00 AM–9:00 AM.
Tow rule nearby: No parking 7:00 AM–9:00 AM, school days.
```

If the snap fails (no segment close enough), fall back to the existing nearby-sign popup behavior and clearly show "Could not identify exact curb section."

### Layer toggles

Move existing layer toggles (tow, upcoming, violation, garage, snow) into a panel visible only in Current mode. Preserve toggle on/off state across mode switches using module-scope booleans.

### Layer arrays

```ts
_rulesInspectionLayers: LeafletLayer[]
_rulesInspectionMarker: LeafletMarker | null
```

Do not reuse `_findResultLayers` or `_violationLayers` for the inspection highlight.

### Snapping behavior

Snap order:
1. Nearest segment geometry side within threshold
2. Nearest segment on same street if street can be inferred from click
3. Fallback to existing nearby-sign popup behavior

### `shared/rules-inspector.ts`

Add:

```ts
buildRulesInspection(
  clickLatLng: [number, number],
  segment: ParkingSegment,
  signs: Sign[],
  cleaningEntries: StreetCleaningEntry[],
  now: Date
): RulesInspection
```

### Acceptance criteria

* In Current mode, each map click updates the inspected segment and replaces the previous marker/highlight.
* Current mode panel updates on each click.
* Click does not save a spot.
* Existing layer toggles still work.
* Toggle state survives mode switches.
* Washington Street multiple sections shown explicitly, not collapsed.
* Second click replaces first inspection result completely (no leftover markers or layers).

---

## F-52 — Check Bottom Sheet

### Output files

* `app/index.html`
* `app/style.css`
* `app/ui.ts`
* `app/main.ts`

### Requirements

Visible only in Check mode. Panel at bottom of map above nav.

States:

* empty / no segment selected
* safe / ticket / tow / snow / limited / unknown

Decision-first titles:

* `Safe to park here`
* `Ticket risk here`
* `Tow risk here`
* `Snow restriction here`
* `Limited information here`
* `Unknown rules here`

Buttons:

* `Full rules` → switches to Current mode, calls `handleRulesInspectionClick` at the segment's centroid or nearest geometry point, so the Current mode panel opens on the same segment
* `Save spot` → switches to Alerts mode, saves the clicked/selected location

Avoid "Set alert" — the web app cannot promise background notification behavior.

### Acceptance criteria

* Selecting a Check segment opens the correct bottom sheet state.
* "Full rules" switches to Current mode and triggers an inspection on the same segment.
* "Save spot" switches to Alerts mode and saves the selected location.
* Copy does not imply background push alerts.

---

## F-53 — Alerts / Saved Spot Panel Polish

### Output files

* `app/ui.ts`
* `app/index.html`
* `app/style.css`
* `app/main.ts`

### Requirements

Visible only in Alerts mode.

Panel states:

1. no saved spot
2. saved spot
3. warning / active conflict

Copy must be honest about app limitations:

```
Save this spot so the app can check it when you reopen.
```

Do not promise push notifications, background monitoring, or automatic alerts while the app is closed.

Clicking the map in Alerts mode saves or moves the watched spot (`handleSaveSpotClick`).

Reuse existing warning banner logic or refactor it into the Alerts panel.

### Acceptance criteria

* Alerts tab clearly explains saved-spot behavior without implying background alerts.
* Clicking in Alerts mode saves/moves the spot.
* Saved spot persists as before (storage unchanged).
* Warnings shown when app is open/reopened and saved spot has active conflict.

---

## Full E2E Verification

After each feature: `npm test && npm run typecheck && npm run build`

After F-52 / F-53:

1. App loads in Check mode showing duration bar.
2. Check mode shows green/red/yellow/gray segment highlights for the selected duration.
3. Clicking a Check segment opens the Check bottom sheet with correct status title.
4. Check click does not save a spot.
5. Tapping Current hides Check duration UI and shows Current controls / layer toggles.
6. In Current mode, clicking a road section drops/moves an inspection dot.
7. Current mode highlights the inspected side/section and shows exact rules below.
8. Re-clicking another section replaces the previous inspection completely (old dot gone).
9. Current mode click does not save a spot.
10. "Full rules" from Check switches to Current and opens inspection on the same segment.
11. "Save spot" from Check switches to Alerts and saves the selected location.
12. In Alerts mode, clicking the map saves/moves the watched spot.
13. Alerts copy does not promise background push notifications.
14. Old parked-state behavior migrates cleanly into Alerts mode.
15. No hardcoded dev time or Washington Street-only filtering in default build.
16. Segment catalog shows multiple distinct segments for Washington Street (not one collapsed highlight).
