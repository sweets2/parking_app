# Hoboken Parking API — Data Schema

Documented from live responses fetched in June 2026. All fields were present on every sign in the response (no nulls, no empty strings observed).

## Fetched Snapshot Format (`data/latest.json`)

The fetcher writes a single JSON file with the following top-level structure:

```typescript
interface ParkingData {
  fetched_at: string;  // UTC ISO 8601 with Z suffix: "2026-06-12T00:16:56.902Z"
  count: number;       // must equal signs.length
  signs: Sign[];
}
```

| Field | Type | Description |
|-------|------|-------------|
| `fetched_at` | string | ISO 8601 UTC timestamp of when the fetch was performed (e.g. `"2026-06-12T00:16:56.902Z"`) |
| `count` | number | Total number of signs in the `signs` array. Must equal `signs.length`. |
| `signs` | array | Array of normalized sign objects (see below). Must be non-empty. |

---

## Normalized Sign Object Fields

Each element in the `signs` array is a normalized sign object. The raw API uses `latitude`/`longitude`; the fetcher renames these to `lat`/`lng`. The three derived fields (`start_iso`, `end_iso`, `active_at_fetch`) are computed by the fetcher and are not present in the raw API response.

| Field | Type | Example | Semantics |
|-------|------|---------|-----------|
| `id` | string | `"216439"` | Unique permit sign identifier. Numeric string assigned by the Hoboken Parking Utility (HPU). |
| `address` | string | `"361-365 1ST ST"` | Street address range where the no-parking sign is posted. Range format `"NNN-NNN STREET NAME"`. May include zero-padded house numbers (e.g. `"0051-0065 3RD ST"`). |
| `reason` | string | `"CONSTRUCTION"` | Reason code for the parking restriction. Known values: `"CONSTRUCTION"`, `"EVENT"`, `"FILM"`, `"UTILITY"`, `"MOVING"`, `"DELIVERY"`, `"OTHER"`. New values may be added by the city. |
| `permit_number` | string | `"640946"` | Permit number associated with this sign, issued by HPU. Multiple signs may share a permit number — a permit represents a single approved request covering several street segments. |
| `lat` | number | `40.738214` | WGS-84 latitude of the sign location. Hoboken is approximately 40.73–40.76 N. Renamed from the raw API field `latitude`. |
| `lng` | number | `-74.0360203` | WGS-84 longitude of the sign location. Always negative (west). Hoboken is approximately -74.02 to -74.05. Renamed from the raw API field `longitude`. |
| `start_date` | string | `"6/12/2026"` | Restriction start date in `"M/D/YYYY"` format. Month and day are **not** zero-padded (e.g. `"6/8/2026"` not `"06/08/2026"`). |
| `start_time` | string | `"08:00:00"` | Restriction start time in `"HH:MM:SS"` 24-hour format. |
| `stop_date` | string | `"6/12/2026"` | Restriction end date in `"M/D/YYYY"` format. Same conventions as `start_date`. |
| `end_time` | string | `"16:00:00"` | Restriction end time in `"HH:MM:SS"` 24-hour format. |
| `start_iso` | string | `"2026-06-12T08:00:00"` | Restriction start as an ISO 8601 local-time string (no timezone suffix), derived by combining `start_date` + `start_time`. To build: split `M/D/YYYY` → zero-pad month and day → combine with time as `"YYYY-MM-DDTHH:MM:SS"`. |
| `end_iso` | string | `"2026-06-12T16:00:00"` | Restriction end as an ISO 8601 local-time string (no timezone suffix), derived by combining `stop_date` + `end_time`. Same construction as `start_iso`. |
| `active_at_fetch` | boolean | `true` | Whether the restriction was active at the moment the fetch was performed. `true` if `start_iso <= fetched_at <= end_iso`; `false` otherwise. |

---

## Raw API vs. Normalized Fields

The raw API response (from `GET /api/v1/parking`) has these field names:

| Raw API field | Normalized field | Change |
|---------------|-----------------|--------|
| `latitude` | `lat` | Renamed |
| `longitude` | `lng` | Renamed |
| `id` | `id` | Unchanged |
| `address` | `address` | Unchanged |
| `reason` | `reason` | Unchanged |
| `permit_number` | `permit_number` | Unchanged |
| `start_date` | `start_date` | Unchanged |
| `start_time` | `start_time` | Unchanged |
| `stop_date` | `stop_date` | Unchanged |
| `end_time` | `end_time` | Unchanged |
| *(absent)* | `start_iso` | Derived by fetcher |
| *(absent)* | `end_iso` | Derived by fetcher |
| *(absent)* | `active_at_fetch` | Computed by fetcher |

---

## Known Reason Codes

All observed values as of June 2026:

| Code | Meaning |
|------|---------|
| `CONSTRUCTION` | Temporary no-parking for active construction work |
| `EVENT` | Permitted public or private event (concerts, street fairs, etc.) |
| `FILM` | Film or media production |
| `UTILITY` | Utility work (gas, electric, water) |
| `MOVING` | Permitted residential or commercial move |
| `DELIVERY` | Permitted delivery vehicle operation |
| `OTHER` | Catch-all for miscellaneous permits |

The fetcher should pass through unrecognized values unchanged (new codes may be added by the city).

---

## Date/Time Semantics

- `start_date` and `stop_date` use `M/D/YYYY` with **no zero-padding**.
- All dates and times represent **local Hoboken time** (US/Eastern, ET). The API provides no timezone offset.
- `start_iso` and `end_iso` carry no timezone suffix — they are local-time strings. Callers needing UTC-aware comparisons must apply the appropriate ET offset.
- Some signs have `stop_date: "12/31/2030"` — this is a sentinel value meaning "indefinitely active", not a literal expiry date.

---

## Permit Grouping

Multiple sign records can share a `permit_number`. A permit represents a single approved request that covers several street segments. Signs with the same permit number are logically one parking restriction event posted across multiple locations.

---

## Example Sign Object

```json
{
  "id": "200471",
  "address": "257-257 11TH ST",
  "reason": "EVENT",
  "permit_number": "510881",
  "lat": 40.7503072,
  "lng": -74.0303045,
  "start_date": "5/11/2023",
  "start_time": "07:00:00",
  "stop_date": "12/31/2030",
  "end_time": "07:00:00",
  "start_iso": "2023-05-11T07:00:00",
  "end_iso": "2030-12-31T07:00:00",
  "active_at_fetch": true
}
```
