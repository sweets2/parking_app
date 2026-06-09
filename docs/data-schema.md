# Hoboken Parking API — Data Schema

Documented from a live response fetched on 2026-06-09. All 10 fields were present on every sign in the response (no nulls, no empty strings).

## Raw Sign Record

Each element of the `data` array has exactly these fields:

| Field | TypeScript type | Example | Notes |
|-------|----------------|---------|-------|
| `id` | `string` | `"200471"` | Numeric string; unique per sign record |
| `address` | `string` | `"257-257 11TH ST"` | Range format `"NNN-NNN STREET NAME"` |
| `start_date` | `string` | `"5/11/2023"` | `M/D/YYYY` — single-digit month and day, **no zero-padding** |
| `start_time` | `string` | `"07:00:00"` | 24-hour `HH:MM:SS` |
| `stop_date` | `string` | `"12/31/2030"` | Same `M/D/YYYY` format as `start_date` |
| `end_time` | `string` | `"07:00:00"` | 24-hour `HH:MM:SS` |
| `reason` | `string` | `"CONSTRUCTION"` | See reason enum below |
| `permit_number` | `string` | `"510881"` | Numeric string; multiple signs share one permit |
| `latitude` | `number` | `40.7503072` | Float; Hoboken is ~40.74–40.76 N |
| `longitude` | `number` | `-74.0303045` | Float; always negative (west); Hoboken is ~-74.02 to -74.05 |

## Reason Enum

All observed values as of June 2026:

- `"CONSTRUCTION"` — temporary no-parking for construction work
- `"EVENT"` — special events (concerts, street fairs, filming, etc.)
- `"MOVING"` — residential or commercial move
- `"DELIVERY"` — delivery vehicle operations

The fetcher should warn on unrecognized values but still write the sign (new reasons may be added by the city).

## Date/Time Quirks

- `start_date` and `stop_date` use `M/D/YYYY` with **no zero-padding**. `"5/8/2026"` not `"05/08/2026"`.
- Dates and times represent **local Hoboken time** (ET). The API provides no timezone information.
- Some signs have `stop_date: "12/31/2030"` — this is a sentinel value meaning "indefinitely active", not a literal expiry.
- To build a comparable datetime string: split `M/D/YYYY` → zero-pad month and day → combine with time: `"YYYY-MM-DDTHH:MM:SS"`.

## Coordinate Field Names

The raw API uses `latitude`/`longitude` (full words). The internal `Sign` type uses `lat`/`lng` (short). The fetcher (F-01) is responsible for this rename during transformation.

## Permit Grouping

Multiple sign records can share a `permit_number`. A permit represents a single approved request that covers several street segments. Signs with the same permit are logically one parking restriction event.

## TypeScript Interface (Raw)

```typescript
interface RawSign {
  id: string;
  address: string;
  start_date: string;   // "M/D/YYYY"
  start_time: string;   // "HH:MM:SS"
  stop_date: string;    // "M/D/YYYY"
  end_time: string;     // "HH:MM:SS"
  reason: string;       // "CONSTRUCTION" | "EVENT" | "MOVING" | "DELIVERY" | (unknown future values)
  permit_number: string;
  latitude: number;
  longitude: number;
}
```

## Top-Level File Format

`data/latest.json` wraps the signs array:

```typescript
interface ParkingData {
  fetched_at: string;   // UTC ISO 8601 with Z suffix: "2026-06-09T13:52:50.509612Z"
  count: number;        // must equal signs.length
  signs: RawSign[];
}
```
